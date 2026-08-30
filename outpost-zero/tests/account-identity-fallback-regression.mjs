import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const networking=fs.readFileSync(path.join(root,'js/networking.js'),'utf8');

function sourceBetween(startToken,endToken){
  const start=networking.indexOf(startToken);
  const end=networking.indexOf(endToken,start);
  assert.ok(start>=0&&end>start,`missing source between ${startToken} and ${endToken}`);
  return networking.slice(start,end);
}

const identitySource=sourceBetween('function cleanUsername(','function leaderboardReadFailure(');
const leaderboardUsernameSource=sourceBetween('function leaderboardUsername(','function paintUserbar(');
const fetchBoardSource=sourceBetween('async function fetchBoard(){','// ---- report a problem:');
const OTHER_ID='11111111-1111-4111-8111-111111111111';
const VIEWER_ID='22222222-2222-4222-8222-222222222222';

function identityHarness(){
  const context={};
  vm.createContext(context);
  vm.runInContext(`
    let authUser=null,mainAdmin=false;
    function isMainAdmin(){return mainAdmin;}
    ${identitySource}
    ${leaderboardUsernameSource}
    this.identityApi={
      cleanAccountIdentity,accountIdentityLabel,leaderboardNeedsUsername,leaderboardUsername,
      setAuth:value=>{authUser=value;},setMain:value=>{mainAdmin=!!value;}
    };
  `,context,{filename:'networking-account-identity.js'});
  return context.identityApi;
}

{
  const api=identityHarness();
  assert.equal(api.cleanAccountIdentity('  @Chosen_One  '),'Chosen_One');
  assert.equal(api.cleanAccountIdentity('  Private.Person@Example.COM  '),'private.person@example.com');
  assert.equal(api.cleanAccountIdentity('not a public identity'),'');
  assert.equal(api.accountIdentityLabel('Chosen_One'),'@Chosen_One');
  assert.equal(api.accountIdentityLabel('Private.Person@Example.COM'),'private.person@example.com');
  assert.equal(api.accountIdentityLabel('', 'NEW OPERATOR'),'NEW OPERATOR');

  const blank={user_id:OTHER_ID,username:''};
  const generated={user_id:OTHER_ID,username:'op_'+OTHER_ID.replaceAll('-','').slice(0,20)};
  const legacyEmail={user_id:OTHER_ID,username:'private@example.com'};
  const malformed={user_id:OTHER_ID,username:'legacy-name!'};
  assert.equal(api.leaderboardNeedsUsername(blank),true,'blank leaderboard names require a fallback');
  assert.equal(api.leaderboardNeedsUsername(generated),true,'generated leaderboard names require a fallback');
  assert.equal(api.leaderboardNeedsUsername(legacyEmail),true,'legacy email-shaped names require a fallback');
  assert.equal(api.leaderboardNeedsUsername(malformed),true,'malformed legacy names require a fallback');

  api.setAuth({id:OTHER_ID,email:'Owner@Example.COM'});
  api.setMain(false);
  assert.equal(api.leaderboardUsername(blank),'owner@example.com',
    'the row owner may use the private email already present in their own Auth session');

  api.setAuth({id:VIEWER_ID,email:'viewer@example.com'});
  assert.equal(api.leaderboardUsername(blank),'NEW OPERATOR',
    'a regular viewer must not receive another account email');

  api.setMain(true);
  assert.equal(api.leaderboardUsername({...blank,adminIdentityLabel:'NoHandle@Example.COM'}),'nohandle@example.com',
    'creator/main rows may use the separately authorized admin identity label');
  assert.equal(api.leaderboardUsername({
    user_id:OTHER_ID,username:'Chosen_One',adminIdentityLabel:'NoHandle@Example.COM'
  }),'Chosen_One','a chosen public username always takes precedence over an admin email fallback');
}

function boardHarness(mainAdmin){
  const calls=[];
  const context={
    rpcHandler:async(name,args)=>{
      calls.push({name,args});
      if(name==='get_outpost_zero_leaderboard')return {data:[{user_id:OTHER_ID,username:'',score:7}],error:null};
      if(name==='list_outpost_zero_admin_identity_labels')return {data:[{
        user_id:OTHER_ID,identity_label:'NoHandle@Example.COM',identity_kind:'email'
      }],error:null};
      throw new Error('unexpected RPC '+name);
    }
  };
  vm.createContext(context);
  vm.runInContext(`
    const PUBLIC_BOARD_LIMIT=5;
    let sb={rpc:(name,args)=>rpcHandler(name,args)},authUser={id:${JSON.stringify(VIEWER_ID)},email:'viewer@example.com'};
    let board=[],arenaBoard=[],boardT=0,boardRequestT=0,leaderboardFetchVersion=0;
    const leaderboardAppliedVersion={endless:0,arena:0},leaderboardFailedVersion={endless:0,arena:0};
    const leaderboardReadState={endless:'idle',arena:'idle'};
    function isMainAdmin(){return ${mainAdmin?'true':'false'};}
    function leaderboardReadFailure(){return 'error';}
    function syncFallAccess(){}
    function syncLeaderboardRetry(){}
    ${identitySource}
    ${fetchBoardSource}
    this.boardApi={fetchBoard,snapshot:()=>JSON.stringify({board,arenaBoard})};
  `,context,{filename:'networking-fetch-board-identity.js'});
  return {calls,api:context.boardApi};
}

{
  const {calls,api}=boardHarness(false);
  assert.equal(await api.fetchBoard(),true);
  assert.deepEqual(calls.map(call=>call.name),[
    'get_outpost_zero_leaderboard','get_outpost_zero_leaderboard'
  ],'regular viewers must never call the admin identity-label RPC');
  assert.equal(JSON.parse(api.snapshot()).board[0].adminIdentityLabel,undefined);
}

{
  const {calls,api}=boardHarness(true);
  assert.equal(await api.fetchBoard(),true);
  assert.deepEqual(calls.map(call=>call.name),[
    'get_outpost_zero_leaderboard','get_outpost_zero_leaderboard','list_outpost_zero_admin_identity_labels'
  ],'creator/main board refreshes may request authorized fallback labels');
  const identityCall=calls.at(-1);
  assert.deepEqual(Array.from(identityCall.args.p_user_ids),[OTHER_ID],
    'the admin RPC receives only deduplicated unfinished-row user IDs');
  assert.equal(JSON.parse(api.snapshot()).board[0].adminIdentityLabel,'nohandle@example.com');
}

console.log('PASS account identity and role-gated leaderboard fallback regression');
