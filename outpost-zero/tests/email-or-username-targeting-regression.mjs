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
const leaderboard=read('sql/player/Player-01-stats.sql');

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

const signIn=functionSource(networking,'authSignInWithIdentifier');
const directEmail=functionSource(networking,'authDirectEmailSignIn');
const migrateEmail=functionSource(networking,'authMigrateLegacyEmailAccount');
const migrateToken=functionSource(networking,'authMigrateLegacyTokenSession');
const finishMigration=functionSource(networking,'authFinishLegacyMigration');
assert.match(signIn,/legacySupabase\.functions\.invoke\(AUTH_IDENTIFIER_FUNCTION/,
  'legacy email-shaped username collisions remain credential-checked by the Edge Function');
assert.match(signIn,/session&&session\.code===AUTH_AMBIGUOUS_IDENTIFIER/,
  'an ambiguous verified identifier still requires an explicit account choice');
assert.match(signIn,/body\.account_kind=choice/,
  'the explicit email/username account choice is sent to the credential verifier');
assert.match(signIn,/kind==='email'&&!choice[\s\S]*authDirectEmailSignIn/,
  'new or already migrated Neon accounts fall back to direct managed-auth email sign-in');
assert.match(directEmail,/sb\.auth\.signInWithPassword/);
assert.match(directEmail,/authMigrateLegacyEmailAccount/,
  'email sign-in can verify a legacy password before using managed auth');
assert.match(migrateEmail,/legacySupabase\.functions\.invoke\(AUTH_IDENTIFIER_FUNCTION/);
assert.match(migrateEmail,/account_kind:'email'/,
  'legacy email migration uses the credential verifier without exposing another identity');
assert.match(migrateToken,/detached\.auth\.setSession/);
assert.match(migrateToken,/migration_proof/,
  'the credential-verified server proof is required before linking legacy data');
assert.match(migrateToken,/authFinishLegacyMigration/);
assert.match(finishMigration,/sb\.auth\.signUp/,
  'a credential-verified legacy account is recreated in Neon Managed Better Auth');
assert.match(finishMigration,/pendingNeonMigrationProof/,
  'the short-lived migration proof is available to the Neon account linker');
assert.doesNotMatch(networking,/sb\.auth\.setSession/,
  'Supabase access tokens must never be installed into Neon Managed Better Auth');

assert.match(edge,/NEON_MIGRATION_PROOF_SECRET/);
assert.match(edge,/crypto\.subtle\.sign\('HMAC'/);
assert.match(edge,/migration_proof: proof/);

const playerLookupFunctions=['lookupPlayer','playerLookupFailureMessage']
  .map(name=>functionSource(administration,name)).join('\n');

function playerLookupHarness({roleAfterRefresh='main',rpcError=null}={}){
  const calls=[];
  const context={calls,
    rpcHandler:async(name,args)=>{
      calls.push({kind:'rpc',name,args});
      if(name==='outpost_zero_admin_get_player_by_username'){
        if(rpcError)return {data:null,error:rpcError};
        return {data:{high_score:321,gems:8,coins:4,owned:{},pow:{}},error:null};
      }
      if(name==='admin_list_outpost_zero_weapon_grants_by_username')return {data:[],error:null};
      throw new Error('unexpected RPC '+name);
    }
  };
  vm.createContext(context);
  vm.runInContext(`
    let main=false,peBusyToken=0,peEditorSession=0,playerLookupRequestSeq=0,peBusy=false,peData=null,peEdit=null,
      peNotice='',peGiftMode='permanent',peTarget='',peStep='choose';
    const authUser={id:'creator-id'},sb={rpc:(name,args)=>rpcHandler(name,args)};
    function resetPlayerEditScroll(){}
    function cleanAccountEmail(value){const email=String(value||'').trim().toLowerCase();return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)?email:'';}
    function adminAccountIdentifier(value){const email=cleanAccountEmail(value);if(email)return email;const username=String(value||'').trim().replace(/^@/,'');return /^[A-Za-z0-9_]{3,32}$/.test(username)?username:'';}
    function isMainAdmin(){return main;}
    function canUsePlayerTools(){return main;}
    function isAdmin(){return main;}
    function currentAuthUserId(){return String(authUser.id||'');}
    async function fetchAdmins(){
      calls.push({kind:'role'});main=${JSON.stringify(roleAfterRefresh)}==='main';
      if(!main){peBusyToken++;peEditorSession++;peData=null;peEdit=null;peNotice='';}
      return true;
    }
    function normalizedPlayerData(value,publicOnly){return {score:+value.high_score||0,gems:+value.gems||0,coins:+value.coins||0,owned:{},pow:{},tempGrants:{},publicOnly:!!publicOnly};}
    function normalizedPlayerTempGrants(){return {};}
    function clonePlayerTempGrants(){return {};}
    function leaderboardUsername(){return 'public-player';}
    function adminRpcMissing(error){const code=String(error&&error.code||'').toUpperCase();return code==='PGRST202'||code==='42883'||/could not find (?:the )?function/i.test(String(error&&error.message||''));}
    ${playerLookupFunctions}
    this.lookupApi={lookup:lookupPlayer,snapshot:()=>JSON.stringify({peData,peTarget,peStep,peNotice,main})};
  `,context,{filename:'exact-email-player-lookup.vm.js'});
  return {calls,api:context.lookupApi};
}

{
  const {calls,api}=playerLookupHarness();
  assert.equal(await api.lookup(' Owner@Example.COM '),true);
  assert.deepEqual(calls.map(call=>call.kind==='role'?'role':call.name),[
    'role','outpost_zero_admin_get_player_by_username','admin_list_outpost_zero_weapon_grants_by_username'
  ],'exact-email lookup waits for the signed-in staff role before choosing an RPC');
  assert.equal(calls[1].args.p_target_username,'owner@example.com',
    'Creator/Main exact email is normalized and sent to the protected Admin 01 RPC');
  const state=JSON.parse(api.snapshot());
  assert.equal(state.peData.publicOnly,false);
  assert.equal(state.peTarget,'owner@example.com');
  assert.equal(state.peStep,'panel');
}

{
  const {calls,api}=playerLookupHarness({roleAfterRefresh:''});
  assert.equal(await api.lookup('owner@example.com'),false);
  assert.deepEqual(calls.map(call=>call.kind),['role'],
    'an ordinary account cannot probe exact emails through either player RPC');
  assert.match(JSON.parse(api.snapshot()).peNotice,/Creator\/Main only/);
}

{
  const {api}=playerLookupHarness({rpcError:{code:'PGRST202',message:'Could not find the function'}});
  assert.equal(await api.lookup('owner@example.com'),false);
  assert.match(JSON.parse(api.snapshot()).peNotice,/current Admin 01 Admin Menu SQL/,
    'a stale live RPC is identified as setup work instead of a fake not-found result');
}

console.log('PASS email-or-username targeting and credential-verified account choice regression');
