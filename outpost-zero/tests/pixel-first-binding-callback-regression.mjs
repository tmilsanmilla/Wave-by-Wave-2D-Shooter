import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as actual from '../../lib/pixel-pulse.js';

// Execute the actual HTTP callback and binder. Only transport/database edges
// are synthetic; no credentials, external requests or production DB are used.
const source=fs.readFileSync(new URL('../../api/pixel-pulse.js',import.meta.url),'utf8');
const subject='10000000-0000-4000-8000-000000000001';
const game='20000000-0000-4000-8000-000000000001';
const other='30000000-0000-4000-8000-000000000001';
async function callback({intent='continue',bound=false,sameEmail=false,target=null,verified=true,expired=false}={}){
 const claims={sub:subject,preferred_username:'fixture_name',email:'fixture@example.invalid',email_verified:verified};
 let identity={accounts:[{id:game,email:bound||sameEmail?claims.email:'native@example.invalid',deleted_at:null}],
  pixelProfiles:bound?[{subject,account_id:game,username:claims.preferred_username,email:claims.email}]:[],
  accountLinks:bound?[{subject,account_id:game,linked_existing:true}]:[],
  socialProfiles:[{user_id:game,handle_key:claims.preferred_username}],pixelSessions:[],
  credentials:{native:'unchanged-fixture-hash'},roles:{native:'main'},progress:{gems:500,weapons:['scar-h']}};
 const before=structuredClone(identity),writes=[],queries=[];
 let rollback,attemptsConsumed=0;
 const db={async query(sql,args=[]){
  queries.push(sql);
  if(sql==='begin'){rollback=structuredClone(identity);return {rows:[],rowCount:0};}
  if(sql==='rollback'){identity=rollback;return {rows:[],rowCount:0};}
  if(sql==='commit')return {rows:[],rowCount:0};
  if(sql.startsWith('delete from oz_identity.pixel_login_attempts')){
   attemptsConsumed++;return {rows:expired?[]:[{verifier:'fixture-verifier',nonce:'fixture-nonce',link_account_id:target}],rowCount:expired?0:1};
  }
  if(sql.startsWith('select pg_advisory_xact_lock'))return {rows:[],rowCount:0};
  if(sql.startsWith('select * from oz_identity.pixel_profiles'))return {rows:identity.pixelProfiles.filter(p=>p.subject===args[0]),rowCount:bound?1:0};
  if(sql.startsWith('select * from oz_identity.accounts'))return {rows:identity.accounts.filter(a=>a.id===args[0]),rowCount:1};
  if(sql.startsWith('select subject from oz_identity.pixel_profiles'))return {rows:identity.pixelProfiles.filter(p=>p.account_id===args[0]),rowCount:bound?1:0};
  if(sql.startsWith('select user_id from public.social_profiles'))return {rows:bound?identity.socialProfiles:[],rowCount:bound?1:0};
  if(sql.startsWith('select 1 from oz_identity.accounts'))return {rows:sameEmail?[{}]:[],rowCount:sameEmail?1:0};
  if(/^\s*(insert|update|delete)\b/i.test(sql))writes.push(sql);
  if(sql.startsWith('insert into oz_identity.accounts'))identity.accounts.push({id:args[0],email:args[1]});
  else if(sql.startsWith('insert into oz_identity.pixel_profiles')){
   if(!identity.pixelProfiles.length)identity.pixelProfiles.push({subject:args[0],account_id:args[1],username:args[2],email:args[3]});
  }else if(sql.startsWith('insert into oz_identity.account_links')){
   if(!identity.accountLinks.length)identity.accountLinks.push({subject:args[0],account_id:args[1],linked_existing:args[2]});
  }else if(sql.startsWith('insert into public.social_profiles')){
   if(!identity.socialProfiles.some(p=>p.user_id===args[0]))identity.socialProfiles.push({user_id:args[0],handle_key:args[1]});
  }else if(sql.startsWith('delete from oz_identity.pixel_sessions'))identity.pixelSessions=[];
  else if(sql.startsWith('insert into oz_identity.pixel_sessions'))identity.pixelSessions.push({subject:args[1]});
  else throw new Error('Unexpected callback query: '+sql);
  return {rows:[],rowCount:1};
 },async connect(){return {query:db.query,release(){}};}};
 const context=vm.createContext({URL,String,JSON,process:{env:{PIXEL_PULSE_GAME_ENABLED:'true'}},console:{warn(){}}});
 const lib={...actual,databaseReady:async()=>db,config:async()=>({})};
 const oidc={authorizationCodeGrant:async(_configuration,_url,checks)=>{
  assert.equal(checks.pkceCodeVerifier,'fixture-verifier');assert.equal(checks.expectedNonce,'fixture-nonce');assert.equal(checks.expectedState,'fixture-state');
  return {claims:()=>claims,access_token:'synthetic-only'};
 },fetchUserInfo:async()=>claims};
 function synthetic(exports){return new vm.SyntheticModule(Object.keys(exports),function(){
  for(const [key,value] of Object.entries(exports))this.setExport(key,value);
 },{context});}
 const module=new vm.SourceTextModule(source,{context});
 await module.link(specifier=>{
  if(specifier==='openid-client')return synthetic(oidc);
  if(specifier==='../lib/pixel-pulse.js')return synthetic(lib);
  throw new Error('Unexpected import');
 });
 await module.evaluate();
 const response={headers:{},statusCode:0,body:''};
 const request={url:actual.CALLBACK+'?code=legacy-code&state=fixture-state&iss='+encodeURIComponent(actual.PIXEL_ISSUER)+'&intent='+intent,
  method:'GET',headers:{cookie:actual.ATTEMPT_COOKIE+'='+'a'.repeat(43)+'; central_remembered_cookie=synthetic-only'},
  body:{intent,password_confirmed:true,current_password_checked:true}};
 await module.namespace.default(request,{setHeader(name,value){response.headers[name]=value;},
  set statusCode(value){response.statusCode=value;},end(value=''){response.body=value;}});
 return {response,before,identity,writes,queries,attemptsConsumed};
}
function denied(result){
 assert.equal(result.response.statusCode,303);
 const location=new URL(result.response.headers.Location);
 assert.ok(location.searchParams.has('pixel_error'));
 assert.equal(location.searchParams.has('pixel_connected'),false);
 assert.deepEqual(result.identity,result.before,'all original identity, credentials, roles and progress stay intact');
 assert.deepEqual(result.writes,[],'no identity/profile/session mutation is even attempted');
 assert.equal([].concat(result.response.headers['Set-Cookie']||[]).some(value=>value.startsWith(actual.COOKIE+'=')),false,'no new game session cookie');
}
for(const intent of ['continue','create'])for(const sameEmail of [false,true]){
 test('remembered-cookie '+intent+' rejects unbound '+(sameEmail?'existing':'unique')+' email before any write',async()=>{
  const result=await callback({intent,sameEmail});denied(result);
  assert.match(new URL(result.response.headers.Location).searchParams.get('pixel_error'),/password-confirmation/);
  assert.equal(result.attemptsConsumed,1,'one-time pending attempt is consumed, never restored');
  assert.ok(!result.queries.some(sql=>sql.includes('oz_identity.accounts')),'no native-email probing');
 });
}
test('legacy pending native-link callback also fails closed',async()=>denied(await callback({target:game,sameEmail:true})));
test('an existing binding cannot switch to another game account',async()=>denied(await callback({bound:true,target:other})));
test('unverified central identity cannot create a binding',async()=>denied(await callback({verified:false})));
test('expired pending attempt creates no identity or session',async()=>denied(await callback({expired:true})));
test('already-bound automatic Continue retains original IDs, roles, credentials and progress',async()=>{
 const result=await callback({bound:true});
 assert.equal(result.response.statusCode,303);
 assert.equal(new URL(result.response.headers.Location).searchParams.get('pixel_connected'),'1');
 for(const key of ['accounts','pixelProfiles','accountLinks','socialProfiles','credentials','roles','progress'])assert.deepEqual(result.identity[key],result.before[key]);
 assert.equal(result.identity.pixelSessions.length,1);
 assert.equal(result.identity.pixelSessions[0].subject,subject);
 assert.ok(result.response.headers['Set-Cookie'].some(value=>value.startsWith(actual.COOKIE+'=')));
});
