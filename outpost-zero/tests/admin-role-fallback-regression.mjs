import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const administration=fs.readFileSync(path.join(root,'js/administration.js'),'utf8');
const networking=fs.readFileSync(path.join(root,'js/networking.js'),'utf8');
const adminEmailStart=administration.indexOf('function adminEmail(');
const adminEmailEnd=administration.indexOf('function isCreator(',adminEmailStart);
assert.ok(adminEmailStart>=0&&adminEmailEnd>adminEmailStart,'safe layout attribution helper should exist');
const adminEmailSource=administration.slice(adminEmailStart,adminEmailEnd);
const identityStart=networking.indexOf('function cleanAccountEmail(');
const identityEnd=networking.indexOf('function leaderboardNeedsUsername(',identityStart);
assert.ok(identityStart>=0&&identityEnd>identityStart,'account identity helpers should exist');
const identitySource=networking.slice(identityStart,identityEnd);
const identifierStart=administration.indexOf('function adminAccountIdentifier(');
const identifierEnd=administration.indexOf('function isAdmin()',identifierStart);
assert.ok(identifierStart>=0&&identifierEnd>identifierStart,'admin account identity adapters should exist');
const identifierSource=administration.slice(identifierStart,identifierEnd);
const start=administration.indexOf('function adminServerRoleValue(');
const end=administration.indexOf('async function fetchBanners(',start);
assert.ok(start>=0&&end>start,'admin role fallback source should exist');
const fallbackSource=administration.slice(start,end);

{
  const context={};
  vm.createContext(context);
  vm.runInContext(`
    let adminSelfUsername='NoHandle@Example.COM',adminSelfRole='main';
    ${adminEmailSource}
    this.attribution={adminEmail,set:(username,role)=>{adminSelfUsername=username;adminSelfRole=role;}};
  `,context,{filename:'administration-layout-attribution.js'});
  assert.equal(context.attribution.adminEmail(),'main',
    'a private roster email fallback must never enter shared layout attribution');
  context.attribution.set('Chosen_One','main');
  assert.equal(context.attribution.adminEmail(),'chosen_one',
    'a chosen public username remains valid shared layout attribution');
}

{
  const clearStart=administration.indexOf('function clearAdminIdentityFallbackCache(');
  const enforceEnd=administration.indexOf('let lookupBtnRect=',clearStart);
  assert.ok(clearStart>=0&&enforceEnd>clearStart,'role-loss privacy cleanup should exist');
  const cleanup=administration.slice(clearStart,enforceEnd);
  assert.match(cleanup,/delete row\.adminIdentityLabel/,
    'account changes and main-role loss must remove leaderboard email enrichment');
  assert.match(cleanup,/if\(lostMain\)\{[\s\S]*adminMsgs=\[\];unreadMsgs=0;[\s\S]*banList=\[\];[\s\S]*appealList=\[\];/,
    'main-role loss must synchronously clear every email-bearing admin feed');
}

function harness(responses,{profile={user_id:'user-1',handle:'Seal_One'},auth={id:'user-1',email:'private@example.com'}}={}){
  const calls=[];
  const context={
    rpcHandler:async name=>{
      calls.push(name);
      const value=responses[name];
      return typeof value==='function'?value():value||{data:null,error:null};
    }
  };
  vm.createContext(context);
  vm.runInContext(`
    let adminRosterFetchSeq=0,adminPrivacyEpoch=0;
    let adminRoles={stale:'main'},adminRosterRows=[{username:'stale',rank:'main',isSelf:true}];
    let adminSelfRole='',adminSelfUsername='';
    const authUser=${JSON.stringify(auth)},socialProfile=${JSON.stringify(profile)};
    const sb={rpc:name=>rpcHandler(name)};
    function currentAuthUserId(){return authUser.id;}
    function adminPrivacyRequestCurrent(epoch,userId){return epoch===adminPrivacyEpoch&&userId===authUser.id;}
    function usernameIsChosenForUser(value,userId){return value!=='op_'+String(userId).replace(/-/g,'').slice(0,12);}
    function isCreator(){return adminSelfRole==='creator';}
    function isMainAdmin(){return isCreator()||adminSelfRole==='main';}
    function isCoAdmin(){return adminSelfRole==='co';}
    function isTester(){return adminSelfRole==='tester';}
    function myRank(){return isCreator()?'creator':isMainAdmin()?'main':isCoAdmin()?'co':isTester()?'tester':'';}
    function enforceAdminRolePrivacy(){}
    function syncFallAccess(){}
    async function fetchMsgs(){}
    async function fetchPlayersData(){}
    async function fetchScoreReqs(){}
    async function fetchUpdatesFeed(){}
    ${identitySource}
    ${identifierSource}
    ${fallbackSource}
    this.adminFallback={
      fetchAdmins,
      snapshot:()=>JSON.stringify({adminRoles,adminRosterRows,adminSelfRole,adminSelfUsername})
    };
  `,context,{filename:'administration-role-fallback.js'});
  return {calls,api:context.adminFallback};
}

const snapshot=api=>JSON.parse(api.snapshot());

{
  const {calls,api}=harness({
    list_outpost_zero_admin_roster_by_username:{data:null,error:{code:'42883'}},
    _outpost_zero_staff_role:{data:'tester',error:null}
  });
  await api.fetchAdmins();
  assert.deepEqual(calls,['list_outpost_zero_admin_roster_by_username','_outpost_zero_staff_role']);
  assert.deepEqual(snapshot(api),{
    adminRoles:{seal_one:'tester'},
    adminRosterRows:[{username:'Seal_One',rank:'tester',isSelf:true}],
    adminSelfRole:'tester',adminSelfUsername:'Seal_One'
  },'a failed roster should recover only the caller by public username');
}

{
  const {calls,api}=harness({
    list_outpost_zero_admin_roster_by_username:{data:[],error:null},
    _outpost_zero_staff_role:{data:[{_outpost_zero_staff_role:'main'}],error:null}
  });
  await api.fetchAdmins();
  assert.deepEqual(calls,['list_outpost_zero_admin_roster_by_username','_outpost_zero_staff_role']);
  assert.equal(snapshot(api).adminSelfRole,'main','an empty roster should not erase a valid server role');
}

{
  const {calls,api}=harness({
    list_outpost_zero_admin_roster_by_username:{data:[],error:null},
    _outpost_zero_staff_role:{data:null,error:{code:'42883'}},
    admin_role:{data:{admin_role:'co'},error:null}
  });
  await api.fetchAdmins();
  assert.deepEqual(calls,[
    'list_outpost_zero_admin_roster_by_username','_outpost_zero_staff_role','admin_role'
  ]);
  assert.equal(snapshot(api).adminSelfRole,'co','legacy server role RPC should be the second fallback');
}

{
  const {api}=harness({
    list_outpost_zero_admin_roster_by_username:{data:null,error:{message:'unavailable'}},
    _outpost_zero_staff_role:{data:'owner',error:null},
    admin_role:{data:'superuser',error:null}
  });
  await api.fetchAdmins();
  assert.deepEqual(snapshot(api),{
    adminRoles:{},adminRosterRows:[],adminSelfRole:'',adminSelfUsername:''
  },'unknown server roles must fail closed and clear stale role state');
}

{
  const {api}=harness({
    list_outpost_zero_admin_roster_by_username:{data:null,error:{message:'unavailable'}},
    _outpost_zero_staff_role:{data:'creator',error:null}
  },{profile:{user_id:'someone-else',handle:'private@example.com'}});
  await api.fetchAdmins();
  assert.deepEqual(snapshot(api),{
    adminRoles:{},adminRosterRows:[],adminSelfRole:'creator',adminSelfUsername:''
  },'a role may recover without ever substituting an Auth email for the public handle');
}

{
  const {calls,api}=harness({
    list_outpost_zero_admin_roster_by_username:{
      data:[{username:'private@example.com',role:'main',is_self:true}],error:null
    }
  });
  await api.fetchAdmins();
  assert.deepEqual(calls,['list_outpost_zero_admin_roster_by_username']);
  assert.deepEqual(snapshot(api),{
    adminRoles:{'private@example.com':'main'},
    adminRosterRows:[{username:'private@example.com',rank:'main',isSelf:true}],
    adminSelfRole:'main',adminSelfUsername:'private@example.com'
  },'a role-checked no-username email fallback must remain visible instead of being dropped');
}

{
  const {api}=harness({
    list_outpost_zero_admin_roster_by_username:{data:null,error:{message:'unavailable'}},
    _outpost_zero_staff_role:{data:'main',error:null}
  },{profile:{user_id:'user-1',handle:'op_user1'},auth:{id:'user-1',email:'Fallback@Example.COM'}});
  await api.fetchAdmins();
  assert.deepEqual(snapshot(api),{
    adminRoles:{'fallback@example.com':'main'},
    adminRosterRows:[{username:'fallback@example.com',rank:'main',isSelf:true}],
    adminSelfRole:'main',adminSelfUsername:'fallback@example.com'
  },'an unfinished same-account username should use the signed-in staff email fallback');
}

{
  const {api}=harness({
    list_outpost_zero_admin_roster_by_username:{
      data:[
        {username:'Seal_One',role:'creator',is_self:true},
        {username:'NoHandle@Example.COM',role:'main',is_self:false}
      ],error:null
    }
  });
  await api.fetchAdmins();
  assert.deepEqual(snapshot(api).adminRosterRows,[
    {username:'Seal_One',rank:'creator',isSelf:true},
    {username:'nohandle@example.com',rank:'main',isSelf:false}
  ],'the roster must retain an authorized email fallback for another no-username main admin');
}

assert.match(fallbackSource,/cleanAccountEmail\(authUser\.email\)/,
  'same-account staff fallback should read only the signed-in Auth email');
assert.doesNotMatch(fallbackSource,/socialProfile\s*\.\s*email|\.user_metadata/,
  'staff fallback must not read profile email fields or private Auth metadata names');
console.log('PASS admin caller-only role fallback regression');
