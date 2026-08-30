import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const networking=read('js/networking.js');
const administration=read('js/administration.js');
const adminUi=read('js/admin-ui.js');
const html=fs.readFileSync(path.join(root,'..','index.html'),'utf8');
const edge=fs.readFileSync(path.join(root,'..','supabase/functions/outpost-zero-sign-in/index.ts'),'utf8');
const admin01=read('sql/administration/Admin-01-admin-menu.sql');
const admin02=read('sql/administration/Admin-02-admins.sql');
const admin03=read('sql/administration/Admin-03-inbox.sql');
const leaderboard=read('sql/leaderboards/01-public-board.sql');

function functionSource(source,name){
  const match=new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match,`missing function ${name}`);
  const start=match.index,open=source.indexOf('(',start);
  let parens=0,brace=-1,quote='',escaped=false;
  for(let i=open;i<source.length;i++){
    const char=source[i];
    if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';continue;}
    if(char==='\''||char==='"'||char==='`'){quote=char;continue;}
    if(char==='(')parens++;else if(char===')'&&--parens===0){brace=source.indexOf('{',i+1);break;}
  }
  assert.ok(brace>=0,`missing body for ${name}`);
  let depth=0,line=false,block=false;quote='';escaped=false;
  for(let i=brace;i<source.length;i++){
    const char=source[i],next=source[i+1];
    if(line){if(char==='\n')line=false;continue;}
    if(block){if(char==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';continue;}
    if(char==='/'&&next==='/'){line=true;i++;continue;}
    if(char==='/'&&next==='*'){block=true;i++;continue;}
    if(char==='\''||char==='"'||char==='`'){quote=char;continue;}
    if(char==='{')depth++;else if(char==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated function ${name}`);
}

function sqlFunction(source,name){
  const start=source.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start,-1,`missing SQL function ${name}`);
  const end=source.indexOf('\ncreate or replace function public.',start+40);
  return source.slice(start,end<0?source.length:end);
}

for(const [label,resolver] of [
  ['Admin 01',sqlFunction(admin01,'_outpost_zero_target_email_for_username')],
  ['Admin 02',sqlFunction(admin02,'_outpost_zero_staff_target_email_for_username')],
  ['Admin 03',sqlFunction(admin03,'_outpost_zero_admin_target_user_id')],
]){
  assert.match(resolver,/from auth\.users u[\s\S]*lower\(btrim\(u\.email\)\)=lower\(/,
    `${label} resolves an exact Auth email`);
  assert.doesNotMatch(resolver,/chosen\.user_id is null|left join public\.social_profiles chosen/,
    `${label} accepts exact email even after a username is chosen`);
  assert.match(resolver,/creator['"],\s*['"]main|\('creator','main'\)/,
    `${label} keeps private email targeting Creator/Main-only`);
}

const publicLookup=sqlFunction(leaderboard,'get_outpost_zero_public_player');
assert.doesNotMatch(publicLookup,/auth\.users|u\.email|email/i,
  'public player lookup remains unable to search private Auth email');
assert.match(publicLookup,/handle_key[\s\S]*user_id/,
  'public player lookup still accepts username and UUID only');

assert.doesNotMatch(administration+adminUi+html,/no-username email|email if no username|email only when|account has no username/i,
  'admin UI no longer limits exact email input to username-less accounts');
assert.match(administration,/username or exact account email/i);
assert.match(administration,/USERNAME OR EMAIL/);

for(const id of ['authaccountchoice','achooseemail','achooseusername'])
  assert.match(html,new RegExp(`id=["']${id}["']`),`sign-in chooser includes ${id}`);
assert.match(edge,/if \(grant\.status !== 'ok'\)[\s\S]*authenticatedUserId[\s\S]*AMBIGUOUS_IDENTIFIER/,
  'the Edge Function reports ambiguity only after password authentication succeeds');
assert.match(edge,/requestedKind === 'email'[\s\S]*requestedKind === 'username'/,
  'the Edge Function accepts an explicit account choice');
assert.doesNotMatch(edge,/console\.(?:log|warn|error)|JSON\.stringify\(\{[^}]*userId/,
  'the Edge Function does not log or return private resolver identities');

const authFunctions=['authIdentifierKind','authActionCurrent','authFunctionStatus','authSignInFailure',
  'authDirectEmailSignIn','authSignInWithIdentifier','authDetachedClient'].map(name=>functionSource(networking,name)).join('\n');

function authHarness(response){
  const calls=[];
  const context={console,Promise,Object,Array,String,Date,
    edgeResponse:response,
    edgeInvoke:async(name,options)=>{calls.push(['edge',name,options]);return context.edgeResponse;},
    setSession:async tokens=>{calls.push(['setSession',tokens]);return {error:null};},
    detachedSignIn:async payload=>{calls.push(['detached',payload]);return {data:{session:{access_token:'fallback-a',refresh_token:'fallback-r'}},error:null};}
  };
  context.window={supabase:{createClient:()=>({auth:{signInWithPassword:context.detachedSignIn}})}};
  vm.createContext(context);
  vm.runInContext(`
    const SUPABASE_URL='https://example.supabase.co',SUPABASE_ANON_KEY='publishable';
    const AUTH_IDENTIFIER_FUNCTION='outpost-zero-sign-in';
    const AUTH_INVALID_CREDENTIALS='invalid',AUTH_TRY_LATER='later',AUTH_SIGNIN_SETUP='setup';
    const AUTH_AMBIGUOUS_IDENTIFIER='AMBIGUOUS_IDENTIFIER';
    let authActionBusy=true,authActionEpoch=7;
    let sb={functions:{invoke:(name,options)=>edgeInvoke(name,options)},auth:{setSession:tokens=>setSession(tokens)}};
    ${authFunctions}
    this.api={signIn:authSignInWithIdentifier};
  `,context,{filename:'email-or-username-auth.vm.js'});
  return {api:context.api,calls,setResponse:value=>{context.edgeResponse=value;}};
}

{
  const h=authHarness({data:{access_token:'email-a',refresh_token:'email-r'},error:null});
  const result=await h.api.signIn('Owner@Example.com','password',7);
  assert.equal(result.ok,true);
  assert.equal(JSON.stringify(h.calls[0]),JSON.stringify(["edge",'outpost-zero-sign-in',{body:{identifier:'Owner@Example.com',password:'password'}}]),
    'email sign-in uses the collision-aware Edge Function');
  assert.equal(h.calls.at(-1)[0],'setSession');
}

{
  const h=authHarness({data:{code:'AMBIGUOUS_IDENTIFIER',message:'Choose an account.',email_choice:'EMAIL ACCOUNT',username_choice:'USERNAME ACCOUNT'},error:null});
  const first=await h.api.signIn('legacy@example.com','password',7);
  assert.equal(first.ambiguous,true);
  assert.equal(h.calls.some(call=>call[0]==='setSession'),false,
    'ambiguous response cannot install either account session automatically');
  h.setResponse({data:{access_token:'chosen-a',refresh_token:'chosen-r'},error:null});
  const chosen=await h.api.signIn('legacy@example.com','password',7,'username');
  assert.equal(chosen.ok,true);
  assert.equal(h.calls.findLast(call=>call[0]==='edge')[2].body.account_kind,'username',
    'the explicit username-account choice is sent back to the Edge Function');
}

{
  const setupError={name:'FunctionsFetchError',context:{status:404}};
  const h=authHarness({data:null,error:setupError});
  const result=await h.api.signIn('owner@example.com','password',7);
  assert.equal(result.ok,true);
  assert.equal(h.calls.some(call=>call[0]==='detached'),true,
    'email sign-in retains an isolated direct fallback while an Edge deployment is unavailable');
}

console.log('PASS email-or-username targeting and credential-verified account choice regression');
