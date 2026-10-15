// Dormant until BOTH the reviewed additive migration and explicit server-side
// protocol configuration are ready. Legacy paths do not read any v2 columns.
import { createHash, randomUUID } from 'node:crypto';
import { CompactEncrypt, compactDecrypt, createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import * as oidc from 'openid-client';
import { PIXEL_ISSUER,GAME_ISSUER,GAME_ORIGIN,GAME_AUDIENCE,GAME_RESOURCE_AUDIENCE,NEON_ISSUER,NEON_JWKS,
  CALLBACK,COOKIE,ATTEMPT_COOKIE,hash,random,cookie,cookieValue,failure,centralProfile,bindAccount,signingKey } from './pixel-pulse.js';
import { confirmationFlow,redeemFirstBindingProof,assertFirstBindingProof } from './pixel-pulse-link-proof.js';

export const protocolV2=()=>process.env.PIXEL_PULSE_GAME_PROTOCOL==='v2';
export const firstBindingsEnabled=()=>protocolV2()&&process.env.PIXEL_PULSE_FRESH_LINK_ENABLED==='true';
const nativeKeys=createRemoteJWKSet(new URL(NEON_JWKS)),CLIENT='outpost-zero';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const pending=()=>failure('LINK_CONFIRMATION_PENDING','New Pixel Pulse connections are not ready yet. Your existing game sign-in is unchanged.',503);
const changed=()=>failure('LINK_ACCOUNT_CHANGED','An account changed or the connection expired. Start again; no accounts were merged.',409);
const retired=()=>failure('PIXEL_SESSION_EXPIRED','Continue with Pixel Pulse again to confirm your current account.',401);
const now=()=>Date.now();
export async function readyV2(database){
  const row=(await database.query(`select to_regclass('oz_identity.pixel_link_attempts') is not null
    and to_regclass('oz_identity.pixel_link_redemptions') is not null
    and to_regclass('oz_identity.pixel_runtime_authorities') is not null
    and exists(select 1 from pg_attribute where attrelid=to_regclass('oz_identity.pixel_sessions') and attname='access_cipher' and not attisdropped)
    and position('outpost_session' in pg_get_functiondef('oz_identity.game_user_id()'::regprocedure))>0 as ready`)).rows[0];
  if(row?.ready!==true)throw failure('PIXEL_V2_SCHEMA','Pixel Pulse account linking is waiting for its reviewed database update.',503);
}
export function versionedIdentity(claims,info){
  if(claims?.iss!==PIXEL_ISSUER||claims.aud!==CLIENT||!uuid(claims.sub)||info?.sub!==claims.sub)throw changed();
  for(const field of ['credential_version','profile_version'])
    if(!Number.isSafeInteger(claims[field])||claims[field]<0||info[field]!==claims[field])throw changed();
  return {subject:claims.sub,credentialVersion:claims.credential_version,profileVersion:claims.profile_version,
    emailVerified:claims.email_verified===true&&info.email_verified===true};
}
export function observedIdentity(claims,info){
  // UserInfo is fetched by our server from the pinned OIDC endpoint after the
  // signed token has established this actor. Record a newer epoch even if an
  // ID token/profile is now stale or the current profile cannot be projected.
  if(claims?.iss!==PIXEL_ISSUER||claims.aud!==CLIENT||!uuid(claims.sub)||info?.sub!==claims.sub||
    !Number.isSafeInteger(info.credential_version)||info.credential_version<0)throw changed();
  return {subject:claims.sub,credentialVersion:info.credential_version,
    profileVersion:Number.isSafeInteger(info.profile_version)&&info.profile_version>=0?info.profile_version:0,
    emailVerified:info.email_verified===true&&/^[a-z0-9_]{3,24}$/.test(info.preferred_username||'')&&
      typeof info.email==='string'&&info.email.length<=254&&/^\S+@\S+\.\S+$/.test(info.email)};
}
export function validatedProfile(claims,info){return {...centralProfile(claims,info),...versionedIdentity(claims,info)};}
export async function captureNativeProof(token,sessionToken,db,resolver=nativeKeys){
  if(typeof token!=='string'||token.length>16384||typeof sessionToken!=='string'||sessionToken.length<20||sessionToken.length>4096)
    throw failure('LINK_NATIVE_SESSION','Sign in to your existing game account again before linking.',401);
  const {payload:p}=await jwtVerify(token,resolver,{issuer:new URL(NEON_ISSUER).origin,audience:new URL(NEON_ISSUER).origin,
    requiredClaims:['exp','iat','sub'],algorithms:['RS256','ES256','EdDSA']});
  if(p.aud!==new URL(NEON_ISSUER).origin||p.role!=='authenticated'||!uuid(p.sub)||!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(p.iat)||p.iat>Math.floor(now()/1000))throw changed();
  // Independently prove the opaque live Managed session as well as its signed
  // Data API subject. Do not accept a cached user object or arbitrary cookie.
  const row=(await db.query(`select s.id::text as session_id,l.account_id,
    (select max(c."updatedAt")::text from neon_auth.account c where c."userId"::text=$1 and c."providerId"='credential') as credential_clock
    from neon_auth.session s join oz_identity.account_links l on l.provider='neon' and l.subject=$1
    join oz_identity.accounts a on a.id=l.account_id and a.deleted_at is null
    join neon_auth."user" u on u.id::text=$1 and u."emailVerified"=true
    where s."userId"::text=$1 and s.token=$2 and s."expiresAt">now()`,[p.sub,sessionToken])).rows[0];
  if(!row||!row.credential_clock)throw changed();
  return {accountId:row.account_id,subject:p.sub,sessionId:row.session_id,sessionHash:hash(sessionToken),
    credentialClock:row.credential_clock,until:Math.min(p.exp*1000,now()+300000)};
}
export async function recheckNativeProof(proof,db){
  if(!proof||!uuid(proof.accountId)||!uuid(proof.subject)||!Number.isSafeInteger(proof.until)||proof.until<=now())throw changed();
  const row=(await db.query(`select 1 from neon_auth.session s
    join oz_identity.account_links l on l.provider='neon' and l.subject=$1 and l.account_id=$2
    join oz_identity.accounts a on a.id=l.account_id and a.deleted_at is null
    join neon_auth."user" u on u.id::text=$1 and u."emailVerified"=true
    where s.id::text=$3 and s."userId"::text=$1 and s."expiresAt">now()
      and encode(sha256(convert_to(s.token,'UTF8')),'hex')=$4
      and (select max(c."updatedAt")::text from neon_auth.account c where c."userId"::text=$1 and c."providerId"='credential')=$5`,
  [proof.subject,proof.accountId,proof.sessionId,proof.sessionHash,proof.credentialClock])).rows[0];
  if(!row)throw changed();
}
function accessKey(){
  const secret=process.env.PIXEL_PULSE_GAME_SIGNING_KEY;
  if(!secret)throw failure('SETUP','Shared sign-in is not configured.',503);
  return createHash('sha256').update('outpost-pixel-access-v2\0').update(secret).digest();
}
async function sealAccess(value){return new CompactEncrypt(new TextEncoder().encode(value))
  .setProtectedHeader({alg:'dir',enc:'A256GCM',typ:'oz-pixel-access-v2'}).encrypt(accessKey());}
async function openAccess(value){
  const result=await compactDecrypt(value,accessKey(),{keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM']});
  if(result.protectedHeader.typ!=='oz-pixel-access-v2')throw retired();
  return new TextDecoder().decode(result.plaintext);
}
async function saveAttempt(database,configuration,context){
  const attempt={...context,state:oidc.randomState(),nonce:oidc.randomNonce(),verifier:oidc.randomPKCECodeVerifier()},browser=random();
  const until=Math.min(now()+300000,attempt.nativeProof?.until||Infinity);
  if(until<=now())throw changed();
  await database.query('delete from oz_identity.pixel_link_attempts where expires_at<now()');
  await database.query(`insert into oz_identity.pixel_link_attempts(state_hash,browser_hash,context,expires_at) values($1,$2,$3,$4)`,
    [hash(attempt.state),hash(browser),JSON.stringify(attempt),new Date(until)]);
  const params=attempt.phase==='confirm'?confirmationFlow(attempt):{redirect_uri:CALLBACK,response_type:'code',scope:'openid profile email',
    state:attempt.state,nonce:attempt.nonce,code_challenge:await oidc.calculatePKCECodeChallenge(attempt.verifier),code_challenge_method:'S256'};
  return {url:oidc.buildAuthorizationUrl(configuration,params).href,cookie:cookie(ATTEMPT_COOKIE,browser,Math.floor((until-now())/1000))};
}
export async function startV2(body,database,configuration,{ownership=captureNativeProof}={}){
  const intent=body.intent||'continue';
  if(!['continue','link','create'].includes(intent))throw changed();
  if(intent==='create'&&body.link_token)throw changed();
  let nativeProof=null;
  if(body.link_token||intent==='link'){
    if(!firstBindingsEnabled())throw pending();
    nativeProof=await ownership(body.link_token,body.native_session_token,database);
  }else if(intent==='create'&&!firstBindingsEnabled())throw pending();
  return saveAttempt(database,configuration,{phase:'discover',mode:nativeProof?'native':intent,nativeProof});
}
export function callbackState(url,browser){
  for(const field of ['iss','state','code'])if(url.searchParams.getAll(field).length!==1||!url.searchParams.get(field))throw changed();
  if(url.origin+url.pathname!==CALLBACK||url.searchParams.get('iss')!==PIXEL_ISSUER||url.searchParams.has('error')||
    url.searchParams.getAll('pixel_link_ticket').length>1||!browser||url.searchParams.get('state').length>256)throw changed();
  return url.searchParams.get('state');
}
// Commits revocation independently of profile projection/binding. A later
// username collision, failed sync or unverified email cannot roll it back.
export async function observeCredentialEpoch(database,identity){
  const db=await database.connect();
  try{
    await db.query('begin');
    await db.query(`update oz_identity.pixel_runtime_authorities set
      credential_version=greatest(credential_version,$2),profile_version=greatest(profile_version,$3),disabled=true,checked_until=now()
      where subject=$1 and (credential_version<$2 or profile_version<$3
        or ($4=false and credential_version<=$2 and profile_version<=$3))`,
    [identity.subject,identity.credentialVersion,identity.profileVersion,identity.emailVerified]);
    await db.query(`delete from oz_identity.pixel_sessions s using oz_identity.pixel_runtime_authorities r
      where s.subject=r.subject and r.subject=$1 and (r.disabled or s.credential_version<r.credential_version)`,[identity.subject]);
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
export async function firstBinding(db,attempt,profile,proof){
  if(!firstBindingsEnabled())throw pending();
  assertFirstBindingProof(proof,attempt,profile);
  const accountId=attempt.nativeProof?.accountId||randomUUID();
  // Email precedes account, matching the legacy native bootstrap's lock order.
  const locks=['outpost-zero:email:'+profile.email,'outpost-pixel:account:'+accountId,
    'outpost-pixel:subject:'+profile.subject,'outpost-pixel:name:'+profile.username];
  for(const lock of locks)await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);
  if(attempt.nativeProof)await recheckNativeProof(attempt.nativeProof,db);
  const old=(await db.query('select * from oz_identity.pixel_profiles where subject=$1 or account_id=$2 for update',[profile.subject,accountId])).rows;
  if(old.length)throw changed(); // No re-targeting, implicit adoption or racing downgrade.
  const account=(await db.query('select * from oz_identity.accounts where id=$1 for update',[accountId])).rows[0];
  if(attempt.mode==='native'&&(!account||account.deleted_at||String(account.email).trim().toLowerCase()!==profile.email))throw changed();
  const collisions=(await db.query(`select 1 from oz_identity.accounts where lower(btrim(email))=$1 and id<>$2
    union all select 1 from public.social_profiles where handle_key=$3 and user_id<>$2
    union all select 1 from neon_auth."user" where lower(btrim(email))=$1 and id::text<>$4 limit 1`,
  [profile.email,accountId,profile.username,attempt.nativeProof?.subject||''])).rows;
  if(collisions.length)throw failure('LINK_REQUIRED','An existing account uses this email or username. Link that game account to keep its progress; no accounts were merged.',409);
  if(attempt.mode==='create')await db.query(`insert into oz_identity.accounts(id,email,email_confirmed_at,created_at) values($1,$2,now(),now())`,[accountId,profile.email]);
  // Unique proof consumption and original-UUID binding share the caller's ONE
  // SQL transaction. A replay, collision or failed projection rolls both back.
  assertFirstBindingProof(proof,attempt,profile);
  const consumed=await db.query(`insert into oz_identity.pixel_link_redemptions(jti,subject,account_id,expires_at)
    select $1,$2,$3,to_timestamp($4) where to_timestamp($4)>clock_timestamp()`,[proof.jti,profile.subject,accountId,proof.expires]);
  if(consumed.rowCount!==1)throw changed();
  await db.query(`insert into oz_identity.pixel_profiles(subject,account_id,username,email) values($1,$2,$3,$4)`,[profile.subject,accountId,profile.username,profile.email]);
  await db.query(`insert into oz_identity.account_links(provider,subject,account_id,linked_existing) values('pixelpulse',$1,$2,$3)`,[profile.subject,accountId,attempt.mode==='native']);
  await db.query(`insert into public.social_profiles(user_id,handle,handle_key,display_name) values($1,$2,$2,$2)
    on conflict(user_id) do update set handle=excluded.handle,handle_key=excluded.handle_key,display_name=excluded.display_name`,[accountId,profile.username]);
  return accountId;
}
export async function finishV2(url,req,database,configuration,{redeem=redeemFirstBindingProof}={}){
  const state=callbackState(url,cookieValue(req,ATTEMPT_COOKIE));
  const row=(await database.query(`delete from oz_identity.pixel_link_attempts
    where state_hash=$1 and browser_hash=$2 and expires_at>now() returning context`,[hash(state),hash(cookieValue(req,ATTEMPT_COOKIE))])).rows[0];
  const attempt=row?.context;
  if(!attempt||attempt.state!==state||!['discover','confirm'].includes(attempt.phase)||
    !['native','create','continue'].includes(attempt.mode)||attempt.phase==='discover'&&url.searchParams.has('pixel_link_ticket'))throw changed();
  if(attempt.nativeProof)await recheckNativeProof(attempt.nativeProof,database);
  const tokens=await oidc.authorizationCodeGrant(configuration,url,{pkceCodeVerifier:attempt.verifier,expectedState:state,expectedNonce:attempt.nonce,idTokenExpected:true});
  const claims=tokens.claims(),info=await oidc.fetchUserInfo(configuration,tokens.access_token,claims.sub);
  if(attempt.phase==='confirm'&&attempt.expectedSubject!==claims.sub)throw changed();
  await observeCredentialEpoch(database,observedIdentity(claims,info));
  const identity=versionedIdentity(claims,info);
  if(attempt.phase==='confirm'&&(attempt.expectedEpoch!==identity.credentialVersion||attempt.expectedProfile!==identity.profileVersion))throw changed();
  const profile=validatedProfile(claims,info);
  const previous=(await database.query('select account_id from oz_identity.pixel_profiles where subject=$1',[profile.subject])).rows[0];
  if(previous&&attempt.nativeProof&&previous.account_id!==attempt.nativeProof.accountId)throw changed();
  if(!previous&&attempt.phase==='discover'){
    if(!firstBindingsEnabled())throw pending();
    if(attempt.mode==='continue')throw failure('LINK_REQUIRED','Choose Link existing game account, or Create with Pixel Pulse if you do not have one.',409);
    return {...await saveAttempt(database,configuration,{phase:'confirm',mode:attempt.mode,nativeProof:attempt.nativeProof,
      expectedSubject:profile.subject,expectedEpoch:profile.credentialVersion,expectedProfile:profile.profileVersion}),redirect:true};
  }
  if(attempt.phase==='confirm'&&previous)throw changed();
  const proof=!previous?await redeem(url.searchParams.get('pixel_link_ticket'),attempt,
    {profile,idToken:tokens.id_token,code:url.searchParams.get('code')}):null;
  const upstreamUntil=Math.min(Number(claims.exp)*1000,now()+Math.min(300,Number(tokens.expires_in)||0)*1000);
  if(typeof tokens.access_token!=='string'||!Number.isFinite(upstreamUntil)||upstreamUntil<=now()+1000)throw retired();
  const raw=random(),cipher=await sealAccess(tokens.access_token),db=await database.connect();
  try{
    await db.query('begin');
    const accountId=previous?await bindAccount(db,profile,attempt.nativeProof?.accountId||null):await firstBinding(db,attempt,profile,proof);
    const authority=(await db.query('select * from oz_identity.pixel_runtime_authorities where subject=$1 for update',[profile.subject])).rows[0];
    if(authority&&(Number(authority.credential_version)>profile.credentialVersion||Number(authority.profile_version)>profile.profileVersion))throw changed();
    await db.query(`insert into oz_identity.pixel_runtime_authorities(subject,account_id,credential_version,profile_version,checked_until,disabled)
      values($1,$2,$3,$4,least(now()+interval '20 seconds',$5),false)
      on conflict(subject) do update set credential_version=excluded.credential_version,profile_version=excluded.profile_version,
        checked_until=excluded.checked_until,disabled=false`,[profile.subject,accountId,profile.credentialVersion,profile.profileVersion,new Date(upstreamUntil)]);
    await db.query(`insert into oz_identity.pixel_sessions(token_hash,subject,credential_version,access_cipher,upstream_until,expires_at)
      values($1,$2,$3,$4,$5,$5)`,[hash(raw),profile.subject,profile.credentialVersion,cipher,new Date(upstreamUntil)]);
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  return {url:GAME_ORIGIN+'/?pixel_connected=1',cookies:[cookie(COOKIE,raw,Math.floor((upstreamUntil-now())/1000)),cookie(ATTEMPT_COOKIE,'',0)]};
}
export async function sessionV2(req,database,configuration){
  const raw=cookieValue(req,COOKIE);if(!raw)return null;
  let row=(await database.query(`select p.*,s.token_hash,s.credential_version as session_epoch,s.expires_at,s.access_cipher,s.upstream_until,
    r.credential_version,r.profile_version,r.checked_until,r.disabled from oz_identity.pixel_sessions s
    join oz_identity.pixel_profiles p using(subject) join oz_identity.accounts a on a.id=p.account_id and a.deleted_at is null
    join oz_identity.pixel_runtime_authorities r on r.subject=p.subject and r.account_id=p.account_id
    where s.token_hash=$1 and s.expires_at>now() and s.upstream_until>now()`,[hash(raw)])).rows[0];
  if(!row)throw retired();
  if(Number(row.session_epoch)!==Number(row.credential_version)||row.disabled)throw retired();
  if(new Date(row.checked_until).getTime()<=now()){
    const info=await oidc.fetchUserInfo(configuration,await openAccess(row.access_cipher),row.subject);
    if(info.sub!==row.subject||!Number.isSafeInteger(info.credential_version)||info.credential_version<0||
      !Number.isSafeInteger(info.profile_version)||info.profile_version<0)throw retired();
    const observed={subject:row.subject,credentialVersion:info.credential_version,profileVersion:info.profile_version,emailVerified:info.email_verified===true};
    await observeCredentialEpoch(database,observed);
    if(!observed.emailVerified||observed.credentialVersion!==Number(row.credential_version)||observed.profileVersion!==Number(row.profile_version)||
      info.preferred_username!==row.username||String(info.email).trim().toLowerCase()!==row.email)throw retired();
    const refreshed=(await database.query(`update oz_identity.pixel_runtime_authorities set checked_until=least(now()+interval '20 seconds',$4)
      where subject=$1 and credential_version=$2 and profile_version=$3 and not disabled returning checked_until`,
    [row.subject,observed.credentialVersion,observed.profileVersion,row.upstream_until])).rows[0];
    if(!refreshed)throw retired();
    row.checked_until=refreshed.checked_until;
  }
  const live={provider:'pixel-pulse',expires_at:Math.floor(new Date(row.expires_at).getTime()/1000),
    user:{id:'pixelpulse:'+row.subject,game_user_id:row.account_id,email:row.email,email_confirmed_at:true,pixel_pulse:true,
      user_metadata:{username:row.username,preferred_username:row.username}}};
  Object.defineProperty(live,'admission',{value:{session:row.token_hash,epoch:Number(row.credential_version),until:Math.floor(new Date(row.checked_until).getTime()/1000)}});
  return live;
}
export async function sessionJwtV2(live){
  const admission=live?.admission;if(!admission||admission.until<=Math.floor(now()/1000))throw retired();
  const {privateKey,publicKey}=await signingKey();
  return new SignJWT({role:'authenticated',outpost_session:admission.session,credential_version:admission.epoch})
    .setProtectedHeader({alg:'RS256',kid:publicKey.kid,typ:'JWT'}).setIssuer(GAME_ISSUER)
    .setAudience([GAME_AUDIENCE,GAME_RESOURCE_AUDIENCE]).setSubject(live.user.id).setIssuedAt()
    .setExpirationTime(Math.min(live.expires_at,admission.until)).sign(privateKey);
}
