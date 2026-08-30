import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const administration=fs.readFileSync(path.join(root,'js/administration.js'),'utf8');
const start=administration.indexOf('function adminServerRoleValue(');
const end=administration.indexOf('async function fetchBanners(',start);
assert.ok(start>=0&&end>start,'admin role fallback source should exist');
const fallbackSource=administration.slice(start,end);

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
    adminRoles:{seal_one:'main'},
    adminRosterRows:[{username:'Seal_One',rank:'main',isSelf:true}],
    adminSelfRole:'main',adminSelfUsername:'Seal_One'
  },'even a malformed roster label must be replaced with the caller public handle, never displayed');
}

assert.doesNotMatch(fallbackSource,/authUser\s*\.\s*email|socialProfile\s*\.\s*email|\.user_metadata/,
  'fallback code must never read an email or private metadata identity');
console.log('PASS admin caller-only role fallback regression');
