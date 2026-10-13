import * as oidc from 'openid-client';
import { PIXEL_ISSUER,GAME_ORIGIN,CALLBACK,COOKIE,ATTEMPT_COOKIE,hash,random,cookie,cookieValue,
  config,signingKey,trustedDatabaseKeys,databaseReady,nativeOwnership,centralProfile,bindAccount,session,sessionJwt,sessionLifetime,failure } from '../lib/pixel-pulse.js';

const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
const redirect=(res,to)=>{res.statusCode=303;res.setHeader('Location',to);res.end();};
const sameOrigin=req=>req.headers.origin===GAME_ORIGIN;
function actionOf(req){
  const url=new URL(req.url,GAME_ORIGIN);
  return url.pathname.startsWith('/api/pixel-pulse/')?url.pathname.split('/').pop():String(req.query?.action||url.searchParams.get('action')||'');
}
function bodyOf(req){
  if(typeof req.body==='string'){if(req.body.length>16384)throw failure('BODY','Request too large.',413);return JSON.parse(req.body);}
  return req.body||{};
}
export function assertNativeLinkTarget(intent,linkAccountId){
  if(intent==='link'&&!linkAccountId)
    throw failure('LINK_PROOF','Sign in to your existing game account before linking Pixel Pulse.',401);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Outpost-Auth-Version','20261013-signin-recovery-v2');
  const action=actionOf(req);
  try{
    if(action==='jwks'&&req.method==='GET')return json(res,200,{keys:[(await signingKey()).publicKey]});
    if(action==='database-keys'&&req.method==='GET')return json(res,200,await trustedDatabaseKeys());
    if(action==='status'&&req.method==='GET'){
      const enabled=process.env.PIXEL_PULSE_GAME_ENABLED==='true';
      if(enabled){await databaseReady();await config();}
      return json(res,200,{enabled});
    }
    if(!['start','callback','session','token','signout'].includes(action))return json(res,404,{error:'Not found'});
    if(['start','signout','token'].includes(action)&&(req.method!=='POST'||!sameOrigin(req)))return json(res,403,{error:'Continue from this game’s account menu.'});
    if(['callback','session'].includes(action)&&req.method!=='GET')return json(res,405,{error:'Method not allowed'});
    if(action==='session')return json(res,200,{session:await session(req)});
    if(action==='signout'){
      const raw=cookieValue(req,COOKIE);
      if(raw)await (await databaseReady()).query('delete from oz_identity.pixel_sessions where token_hash=$1',[hash(raw)]);
      res.setHeader('Set-Cookie',[cookie(COOKIE,'',0),cookie(ATTEMPT_COOKIE,'',0)]);
      return json(res,200,{ok:true});
    }
    if(action==='token'){
      const live=await session(req);if(!live)return json(res,401,{error:'Your Pixel Pulse game session expired. Sign in again.'});
      return json(res,200,{token:await sessionJwt(live)});
    }
    if(process.env.PIXEL_PULSE_GAME_ENABLED!=='true')throw failure('PROVIDER','Pixel Pulse shared sign-in is still being connected. Use the existing game sign-in for now.',503);
    const configuration=await config();
    const database=await databaseReady();
    if(action==='start'){
      const body=bodyOf(req);
      const intent=String(body.intent||'');
      if(!['','continue','link','create'].includes(intent))throw failure('INTENT','Choose Continue, Link, or Create from the game.',400);
      const linkAccountId=await nativeOwnership(String(body.link_token||''),database);
      // Explicit Link never becomes Create merely because a Pixel cookie exists.
      assertNativeLinkTarget(intent,linkAccountId);
      // Native login recovery ships first. Existing links keep working, but a
      // NEW link waits for the central signed current-password proof contract.
      if(linkAccountId&&!(await database.query('select 1 from oz_identity.pixel_profiles where account_id=$1',[linkAccountId])).rowCount)
        throw failure('LINK_CONFIRMATION_PENDING','Game sign-in is available. New Pixel Pulse linking is waiting for its password-confirmation update.',503);
      const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier(),browser=random();
      await database.query('delete from oz_identity.pixel_login_attempts where expires_at<now()');
      await database.query(`insert into oz_identity.pixel_login_attempts(state_hash,browser_hash,verifier,nonce,link_account_id,expires_at)
        values($1,$2,$3,$4,$5,now()+interval '5 minutes')`,[hash(state),hash(browser),verifier,nonce,linkAccountId]);
      const url=oidc.buildAuthorizationUrl(configuration,{redirect_uri:CALLBACK,scope:'openid profile email',state,nonce,
        code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
      // Reuse the central managed cookie. Pixel still checks that session and
      // requires sign-in/username setup when it is absent, expired or incomplete.
      res.setHeader('Set-Cookie',cookie(ATTEMPT_COOKIE,browser,300));
      return json(res,200,{url:url.href});
    }
    const url=new URL(req.url,GAME_ORIGIN);url.pathname=new URL(CALLBACK).pathname;url.searchParams.delete('action');
    const state=url.searchParams.get('state'),browser=cookieValue(req,ATTEMPT_COOKIE);
    if(!state||state.length>256||!browser||url.searchParams.get('iss')!==PIXEL_ISSUER)throw failure('STATE','This sign-in request expired or came from a different website. Start again.');
    const result=await database.query(`delete from oz_identity.pixel_login_attempts where state_hash=$1 and browser_hash=$2 and expires_at>now()
      returning verifier,nonce,link_account_id`,[hash(state),hash(browser)]);
    const attempt=result.rows[0];if(!attempt)throw failure('STATE','This sign-in request expired or was already used. Start again.');
    const tokens=await oidc.authorizationCodeGrant(configuration,url,{pkceCodeVerifier:attempt.verifier,expectedState:state,expectedNonce:attempt.nonce,idTokenExpected:true});
    const claims=tokens.claims(),profile=centralProfile(claims,await oidc.fetchUserInfo(configuration,tokens.access_token,claims.sub));
    const db=await database.connect();const raw=random();
    try{
      await db.query('begin');
      await bindAccount(db,profile,attempt.link_account_id);
      await db.query('delete from oz_identity.pixel_sessions where expires_at<now()');
      await db.query(`insert into oz_identity.pixel_sessions(token_hash,subject,expires_at) values($1,$2,now()+$3*interval '1 second')`,[hash(raw),profile.subject,sessionLifetime]);
      await db.query('commit');
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
    res.setHeader('Set-Cookie',[cookie(COOKIE,raw,sessionLifetime),cookie(ATTEMPT_COOKIE,'',0)]);
    return redirect(res,GAME_ORIGIN+'/?pixel_connected=1');
  }catch(error){
    console.warn('Pixel Pulse sign-in failed',error.code||error.name); // Never log tokens, credentials, codes, or email.
    const message=error.status?error.message:'Pixel Pulse sign-in could not complete. Your existing game account was not changed. Try again.';
    if(action==='callback'){
      res.setHeader('Set-Cookie',cookie(ATTEMPT_COOKIE,'',0));
      return redirect(res,GAME_ORIGIN+'/?pixel_error='+encodeURIComponent(message)+(error.code==='LINK_REQUIRED'?'&pixel=link':''));
    }
    return json(res,error.status||503,{error:message});
  }
}
