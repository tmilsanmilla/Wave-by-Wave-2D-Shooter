import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'js/neon-token-bridge.js'),'utf8');
let clock=Date.now();
class TestDate extends Date{static now(){return clock;}}
const context=vm.createContext({Date:TestDate,atob,Error,Number,String,Math});
vm.runInContext(source,context);
const jwt=(sub='auth-A',exp=Math.floor(clock/1000)+120,alg='RS256')=>[
 Buffer.from(JSON.stringify({alg,kid:'test-key'})).toString('base64url'),
 Buffer.from(JSON.stringify({sub,role:sub==='anonymous'?'anonymous':'authenticated',exp})).toString('base64url'),
 'test-signature',
].join('.');
let subject='auth-A',tokenCalls=0,anonymousCalls=0,handler,tokenFailure=false,expired=false,deferred=null;
const seen=[];
const api={
 async getSession(){return {data:subject?{user:{id:subject},session:{token:'opaque-session-cookie'}}:null};},
 async token(options){
  tokenCalls++;
  // Reproduce the bundled SDK bug if callers do not explicitly skip its
  // get-session cache: /token returns session data, not a database JWT.
  if(options?.fetchOptions?.headers?.['X-Force-Fetch']!=='true')return api.getSession();
  if(deferred)return deferred.promise;
  if(tokenFailure)return {error:{status:403,code:'token_unavailable'}};
  return {data:{token:jwt(subject,Math.floor(clock/1000)+(expired?-1:120))}};
 },
 async getAnonymousToken(){anonymousCalls++;return {data:{token:jwt('anonymous')}};},
};
const auth={
 getBetterAuthInstance:()=>api,
 onAuthStateChange(fn){handler=fn;fn('INITIAL_SESSION');return {data:{subscription:{unsubscribe(){}}}};},
 async getJWTToken(){const s=await api.getSession();return s?.data?.session?.token;},
};
const client={auth,async rpc(){const token=await auth.getJWTToken(true);seen.push(token);return token;}};
assert.equal(await client.rpc(),'opaque-session-cookie','the old cache bug must be reproducible');
seen.length=0;
assert.equal(context.installNeonSignedTokenTransport(client),client);
const first=await Promise.all(Array.from({length:20},()=>client.rpc()));
assert.ok(first.every(value=>value===jwt('auth-A')),'every concurrent database request needs the signed JWT');
assert.equal(tokenCalls,1,'concurrent requests must share one explicit token fetch');
assert.equal(anonymousCalls,0,'a signed-in request must never downgrade to guest access');
assert.ok(seen.every(value=>value!=='opaque-session-cookie'));

clock+=61000;
await client.rpc();assert.equal(tokenCalls,2,'the short transport cache must refresh');
subject='auth-B';handler('SIGNED_IN');
assert.equal(await client.rpc(),jwt('auth-B'),'changing accounts must retire the previous token');
assert.equal(tokenCalls,3);

tokenFailure=true;handler('TOKEN_REFRESHED');
await assert.rejects(client.rpc(),{code:'NEON_DATA_TOKEN_FAILED'});
assert.equal(anonymousCalls,0,'token failure with a real login must remain a failure, not a bypass');
tokenFailure=false;expired=true;handler('TOKEN_REFRESHED');
await assert.rejects(client.rpc(),{code:'NEON_INVALID_DATA_TOKEN'});
expired=false;

let resolveToken;
deferred={promise:new Promise(resolve=>{resolveToken=resolve;})};
handler('SIGNED_IN');
const stale=client.rpc();
await Promise.resolve();await Promise.resolve();
subject=null;handler('SIGNED_OUT');
resolveToken({data:{token:jwt('auth-B')}});
await assert.rejects(stale,{code:'NEON_AUTH_CHANGED'},'late token responses must not restore a signed-out account');
deferred=null;
assert.equal(await auth.getJWTToken(false),null);
assert.equal(await client.rpc(),jwt('anonymous'));
assert.equal(anonymousCalls,1);

const events=[];
const subscription=auth.onAuthStateChange((event,session)=>events.push({event,user:session?.user?.id||null}));
await client.syncAuthState('SIGNED_IN',{user:{id:'auth-C'}});
await client.syncAuthState('SIGNED_OUT',null);
assert.deepEqual(events.slice(-2),[{event:'SIGNED_IN',user:'auth-C'},{event:'SIGNED_OUT',user:null}],
  'successful managed actions must explicitly notify the game');
subscription.data.subscription.unsubscribe();
const eventCount=events.length;
await client.syncAuthState('SIGNED_OUT',null);assert.equal(events.length,eventCount);

const networking=fs.readFileSync(path.join(root,'js/networking.js'),'utf8');
function fn(name){
 const start=networking.indexOf(`function ${name}(`);
 const end=networking.indexOf('\nfunction ',start+1);
 return networking.slice(start,end<0?networking.length:end);
}
const errors=vm.createContext({
 AUTH_TRY_LATER:'rate limited',AUTH_SIGNIN_SETUP:'setup missing',AUTH_INVALID_CREDENTIALS:'wrong password',
});
vm.runInContext([fn('neonAccountAccessMessage'),fn('authFunctionStatus'),fn('authSignInFailure')].join('\n'),errors);
assert.equal(errors.authSignInFailure({status:403,code:'42501'}).reason,'data-access');
assert.equal(errors.authSignInFailure({status:401,outpostAuthPhase:'database'}).reason,'data-access');
assert.equal(errors.authSignInFailure({status:401,code:'INVALID_EMAIL_OR_PASSWORD'}).reason,'credentials');
assert.match(errors.authSignInFailure({status:403,code:'42501'}).message,/not a password error/);
assert.match(networking,/installNeonSignedTokenTransport\(window\.outpostZeroNeon\.createClient/);
assert.match(networking,/await sb\.syncAuthState\('SIGNED_IN',liveSession\)/);
assert.match(networking,/await sb\.syncAuthState\('SIGNED_OUT',null\)/);
const index=fs.readFileSync(path.join(root,'../index.html'),'utf8');
assert.ok(index.indexOf('js/neon-token-bridge.js')>index.indexOf('vendor/neon-client.js'));
assert.ok(index.indexOf('js/neon-token-bridge.js')<index.indexOf('js/networking.js'));
assert.match(index,/networking\.js\?[^"']*fix=20261012-neon-token-v1/);
console.log('PASS signed JWT transport, cached-session reproduction, concurrency, account changes, no guest bypass, expiry, and truthful login errors');
