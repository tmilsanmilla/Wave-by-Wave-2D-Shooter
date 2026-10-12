import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {generateKeyPair,SignJWT,exportJWK} from 'jose';
import * as oidc from 'openid-client';
import {centralProfile,cookieValue,cookie,COOKIE,hash,PIXEL_ISSUER} from '../../lib/pixel-pulse.js';

const subject='10000000-0000-4000-8000-000000000001',gameId='20000000-0000-4000-8000-000000000001';
const claims={sub:subject,preferred_username:'shared_player',email:'player@example.invalid',email_verified:true};
assert.deepEqual(centralProfile(claims,claims),{subject,username:'shared_player',email:'player@example.invalid'});
for(const changed of [{sub:'other'},{preferred_username:'other'},{email:'other@example.invalid'},{email_verified:false}])
 assert.throws(()=>centralProfile(claims,{...claims,...changed}));
assert.throws(()=>centralProfile({...claims,preferred_username:'username_not_set'},{...claims,preferred_username:'username_not_set'}));
const raw='a'.repeat(43);
assert.equal(cookieValue({headers:{cookie:`${COOKIE}=${raw}`}},COOKIE),raw);
assert.equal(cookieValue({headers:{cookie:`${COOKIE}=${raw}; ${COOKIE}=${raw}`}},COOKIE),null);
assert.match(cookie(COOKIE,raw,100),/Path=\/; HttpOnly; Secure; SameSite=Lax/);
assert.equal(hash(raw).length,64);

// Real maintained OIDC library, real signatures; every endpoint is mocked.
const {privateKey,publicKey}=await generateKeyPair('RS256');
const publicJwk={...await exportJWK(publicKey),kid:'test-only',alg:'RS256',use:'sig'};
let variant='',tokenCalls=0;
const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier();
const configuration=new oidc.Configuration({issuer:PIXEL_ISSUER,authorization_endpoint:PIXEL_ISSUER+'/oauth2/authorize',
 token_endpoint:PIXEL_ISSUER+'/oauth2/token',userinfo_endpoint:PIXEL_ISSUER+'/oauth2/userinfo',jwks_uri:PIXEL_ISSUER+'/jwks',
 authorization_response_iss_parameter_supported:true,id_token_signing_alg_values_supported:['RS256']},'outpost-zero',
 {token_endpoint_auth_method:'none'},oidc.None());
oidc.enableNonRepudiationChecks(configuration);
configuration[oidc.customFetch]=async(url,options)=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/jwks'))return Response.json({keys:[publicJwk]});
 if(path.endsWith('/token')){
  tokenCalls++;const params=new URLSearchParams(options.body);
  assert.equal(params.get('client_id'),'outpost-zero');assert.equal(params.get('code_verifier'),verifier);
  assert.equal(params.get('redirect_uri'),'https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse/callback');
  const key=variant==='signature'?(await generateKeyPair('RS256')).privateKey:privateKey;
  const token=await new SignJWT({...claims,nonce:variant==='nonce'?'wrong':nonce}).setProtectedHeader({alg:'RS256',kid:'test-only'})
   .setIssuer(PIXEL_ISSUER).setAudience(variant==='audience'?'other-site':'outpost-zero').setIssuedAt().setExpirationTime(variant==='expired'?0:'5m').sign(key);
  return Response.json({id_token:token,access_token:'test-only-access',token_type:'Bearer',expires_in:300});
 }
 if(path.endsWith('/userinfo'))return Response.json(claims);
 throw new Error('Unexpected network request');
};
const callback=()=>new URL('https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse/callback?'+new URLSearchParams({code:'test-only',state,iss:PIXEL_ISSUER}));
const checks={pkceCodeVerifier:verifier,expectedState:state,expectedNonce:nonce,idTokenExpected:true};
const tokens=await oidc.authorizationCodeGrant(configuration,callback(),checks);
assert.equal(tokens.claims().sub,subject);
assert.equal((await oidc.fetchUserInfo(configuration,tokens.access_token,subject)).preferred_username,'shared_player');
for(variant of ['nonce','audience','expired','signature'])await assert.rejects(oidc.authorizationCodeGrant(configuration,callback(),checks));
variant='';const before=tokenCalls;await assert.rejects(oidc.authorizationCodeGrant(configuration,callback(),{...checks,expectedState:'wrong'}));assert.equal(tokenCalls,before);
const wrongIssuer=callback();wrongIssuer.searchParams.set('iss','https://attacker.invalid');
await assert.rejects(oidc.authorizationCodeGrant(configuration,wrongIssuer,checks));assert.equal(tokenCalls,before);

const source=fs.readFileSync(new URL('../js/pixel-pulse-auth.js',import.meta.url),'utf8');
let active={provider:'pixel-pulse',expires_at:Math.floor(Date.now()/1000)+300,user:{id:'pixelpulse:'+subject,game_user_id:gameId,pixel_pulse:true}},
 tokenRequests=0,nativeRequests=0,handler,resolveToken;
const fixtureJwt=()=>[Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url'),Buffer.from(JSON.stringify({
 sub:active.user.id,role:'authenticated',iss:'https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse',aud:'outpost-zero-pixel-pulse',exp:Math.floor(Date.now()/1000)+120})).toString('base64url'),'fixture'].join('.');
const context=vm.createContext({Date,Promise,Number,String,Object,JSON,Error,atob,fetch:async(url,options)=>{
 const action=url.split('/').pop();
 if(action==='session')return Response.json({session:active});
 if(action==='token'){tokenRequests++;if(resolveToken)return new Promise(resolve=>{resolveToken=resolve;});return Response.json({token:fixtureJwt()});}
 if(action==='signout'){active=null;return Response.json({ok:true});}
 throw new Error('Unexpected route');
}});
vm.runInContext(source,context);
const client={auth:{async getSession(){nativeRequests++;return {data:{session:null},error:null};},async getJWTToken(){nativeRequests++;return 'native-anonymous';},onAuthStateChange(fn){handler=fn;return {data:{subscription:{unsubscribe(){}}}};}}};
context.installPixelPulseTransport(client);
assert.equal((await client.auth.getSession()).data.session.user.game_user_id,gameId);
assert.equal(nativeRequests,0);
const results=await Promise.all(Array.from({length:20},()=>client.auth.getJWTToken(true)));
assert.ok(results.every(x=>x===fixtureJwt()));assert.equal(tokenRequests,1);
const events=[];client.auth.onAuthStateChange((event,session)=>events.push({event,id:session?.user.id}));
await handler('INITIAL_SESSION',null);assert.equal(events[0].id,'pixelpulse:'+subject);
await client.pixelPulse.signOut();assert.equal(await client.auth.getJWTToken(true),'native-anonymous');
assert.equal((await client.auth.getSession()).data.session,null);
console.log('PASS Pixel Pulse OIDC signature/issuer/audience/nonce/state checks, canonical identity, cookies, token isolation, concurrency and sign-out');
