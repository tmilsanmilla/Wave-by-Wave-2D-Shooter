import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const partySource=read('js/party.js'),partyStateSource=read('js/party-state.js'),socialSource=read('js/social.js'),uiSource=read('js/ui.js');
const publicPartySource=partySource.slice(
  partySource.indexOf('function partyServiceAvailable'),
  partySource.indexOf('function partyCreateFromDirectory')
);

assert.ok(publicPartySource.length>1000,'the public-party implementation must remain discoverable');
assert.match(partyStateSource,/publicPartyRefreshVersion/,'directory refreshes need a generation guard');
assert.match(partyStateSource,/publicPartyRefreshQueued/,'a forced refresh needs a queued follow-up');
assert.match(partyStateSource,/publicPartyHostRefreshVersion/,'host-request refreshes need a generation guard');
assert.match(partyStateSource,/publicPartyHostRefreshQueued/,'a forced host refresh needs a queued follow-up');
assert.match(socialSource,/\.on\(['"]broadcast['"],\{event:['"]public_party_request_changed['"]\}[\s\S]{0,240}socialHandlePublicPartyWakeup/,
  'the existing Social Presence channel must listen for public-party wakeups');
assert.match(socialSource,/socialPartyPresenceChannel[\s\S]{0,500}type\s*:\s*['"]broadcast['"]/,
  'the existing Social Presence channel must send public-party wakeups');
assert.match(publicPartySource,/socialBroadcastPublicPartyWakeup/,
  'public-party decisions must trigger the shared Social Presence wakeup');
assert.match(uiSource,/const titleH=tiny\?13:compact\?17:20,rowH=tiny\?44:48/,
  'public-party Accept and Decline rows must keep at least a 40px touch target');

const HOST_ID='11111111-1111-4111-8111-111111111111';
const REQUEST_ID='22222222-2222-4222-8222-222222222222';
const PARTY_ID='33333333-3333-4333-8333-333333333333';
const TOKEN='abcdefghijklmnopqrstuvwx';
const CODE='ABC234';

class FixedDate extends Date{
  static clock=1_000_000;
  static now(){return FixedDate.clock;}
}

function baseContext(overrides={}){
  const sent=[],sounds=[],joins=[];
  const context={
    Array,Object,String,Number,Boolean,Math,Map,Set,Promise,RegExp,JSON,Uint8Array,Date:FixedDate,
    globalThis:null,console:{warn:()=>{}},navigator:{onLine:true},crypto:{randomUUID:()=>REQUEST_ID},
    authUser:{id:HOST_ID},state:'select',selPage:'social',socialView:'party',socialStatus:'',socialProfile:{handle:'Host'},
    party:{phase:'entry',accepted:false,publicParty:false,publicPartyName:'',publicPartyId:'',code:'',members:[],friendInviteTokens:new Map(),status:''},
    publicPartySqlReady:null,publicPartyRows:[],publicPartyHostRequests:[],publicPartyMyRequests:[],publicPartyPage:0,publicPartySearch:'',
    publicPartyPollAt:0,publicPartyPolling:false,publicPartyRefreshVersion:0,publicPartyRefreshQueued:false,
    publicPartyHostPollAt:0,publicPartyHostPolling:false,publicPartyHostRefreshVersion:0,publicPartyHostRefreshQueued:false,
    publicPartyActionBusy:'',publicPartyAutoJoinRequestId:'',publicPartyServerOffsetMs:0,
    PARTY_MAX:4,PARTY_FRIEND_INVITE_MAX_MS:10*60*1000,
    partyIsHost:()=>false,partyDefaultName:()=> 'Operator',partyFriendInviteToken:()=>TOKEN,
    partyRegisterFriendInvite:async()=>true,
    partyConnect:(code,creating,name,options)=>{joins.push({code,creating,name,options});return true;},
    sfx:name=>sounds.push(name),setTimeout:()=>0,clearTimeout:()=>{},
    socialPartyPresenceChannel:{send:message=>{sent.push(message);return Promise.resolve('ok');}},
    sb:{rpc:async()=>({data:[],error:null}),channel:()=>({})},
    ...overrides
  };
  context.globalThis=context;
  vm.createContext(context);vm.runInContext(publicPartySource,context);
  return {context,sent,sounds,joins};
}

// A confirmed decision should be visible on the Social page immediately and
// should remove only the confirmed request without waiting for another read.
{
  const {context}=baseContext();
  context.party={...context.party,accepted:true,publicParty:true,code:CODE,members:[{id:HOST_ID}],friendInviteTokens:new Map()};
  context.partyIsHost=()=>true;
  context.publicPartyHostRequests=[{requestId:REQUEST_ID,username:'Requester'}];
  context.partyRegisterFriendInvite=async(token,expiresAt)=>{
    context.party.friendInviteTokens.set(token,{from:HOST_ID,expiresAt});return true;
  };
  context.sb={rpc:async(name,args)=>{
    assert.equal(name,'decide_outpost_zero_public_party_request');
    assert.equal(args.p_request_id,REQUEST_ID);assert.equal(args.p_accept,true);assert.equal(args.p_join_token,TOKEN);
    return {data:[{accepted:true,status:'accepted',requester_username:'Requester',join_expires_at:new FixedDate(FixedDate.now()+120_000).toISOString()}],error:null};
  },channel:()=>({})};
  let snapshot=null;
  context.partyPublicRefreshHost=async()=>{snapshot=context.publicPartyHostRequests.slice();return true;};
  assert.equal(await context.partyPublicDecide(REQUEST_ID,true),true);
  assert.match(context.party.status,/^JOIN REQUEST ACCEPTED/);
  assert.equal(context.socialStatus,context.party.status,'Social must mirror the lobby result');
  assert.equal(context.publicPartyHostRequests.length,0);
  assert.equal(snapshot.length,0,'the follow-up refresh must begin after optimistic removal');
  assert.equal(context.party.friendInviteTokens.has(TOKEN),true,'a confirmed approval must keep its live join token');
}

// A full-party response did not approve anything. The request must remain so
// the host can retry, and the locally registered capability must be revoked.
{
  const {context}=baseContext();
  context.party={...context.party,accepted:true,publicParty:true,code:CODE,members:[{id:HOST_ID}],friendInviteTokens:new Map()};
  context.partyIsHost=()=>true;
  context.publicPartyHostRequests=[{requestId:REQUEST_ID,username:'Requester'}];
  context.partyRegisterFriendInvite=async(token,expiresAt)=>{
    context.party.friendInviteTokens.set(token,{from:HOST_ID,expiresAt});return true;
  };
  context.sb={rpc:async()=>({data:[{accepted:false,status:'full',requester_username:'Requester'}],error:null}),channel:()=>({})};
  context.partyPublicRefreshHost=async()=>true;
  assert.equal(await context.partyPublicDecide(REQUEST_ID,true),false);
  assert.equal(context.party.status,'PARTY FULL · COULD NOT ACCEPT');
  assert.equal(context.socialStatus,'PARTY FULL · COULD NOT ACCEPT');
  assert.equal(context.publicPartyHostRequests.length,1,'a rejected request must stay visible');
  assert.equal(context.party.friendInviteTokens.has(TOKEN),false,'an unused join capability must be revoked');
}

// Transport/RPC failure has the same capability cleanup rule as a full party.
{
  const {context}=baseContext();
  context.party={...context.party,accepted:true,publicParty:true,code:CODE,members:[{id:HOST_ID}],friendInviteTokens:new Map()};
  context.partyIsHost=()=>true;
  context.publicPartyHostRequests=[{requestId:REQUEST_ID,username:'Requester'}];
  context.partyRegisterFriendInvite=async(token,expiresAt)=>{
    context.party.friendInviteTokens.set(token,{from:HOST_ID,expiresAt});return true;
  };
  context.sb={rpc:async()=>{throw new Error('network unavailable');},channel:()=>({})};
  assert.equal(await context.partyPublicDecide(REQUEST_ID,true),false);
  assert.equal(context.publicPartyHostRequests.length,1);
  assert.equal(context.party.friendInviteTokens.has(TOKEN),false);
  assert.equal(context.socialStatus,context.party.status);
}

// server_now is authoritative. Here the device clock is far past the apparent
// expiry, while the server says the two-minute approval is still live.
{
  FixedDate.clock=1_000_000;
  const serverNow=100_000,expiresAt=160_000;
  const {context,joins}=baseContext({authUser:{id:'44444444-4444-4444-8444-444444444444'}});
  context.sb={rpc:async name=>{
    if(name==='list_outpost_zero_public_parties')return {data:[{
      party_id:PARTY_ID,party_name:'Host Squad',host_username:'Host',member_count:1,capacity:4,
      created_at:new FixedDate(50_000).toISOString(),request_status:'accepted',server_now:new FixedDate(serverNow).toISOString()
    }],error:null};
    assert.equal(name,'list_my_outpost_zero_public_party_requests');
    return {data:[{
      request_id:REQUEST_ID,party_id:PARTY_ID,host_username:'Host',status:'accepted',party_code:CODE,join_token:TOKEN,
      join_expires_at:new FixedDate(expiresAt).toISOString(),created_at:new FixedDate(50_000).toISOString(),server_now:new FixedDate(serverNow).toISOString()
    }],error:null};
  },channel:()=>({})};
  assert.equal(await context.partyPublicRefresh(true),true);
  await Promise.resolve();
  assert.equal(joins.length,1,'a safe accepted approval should auto-join without another click');
  assert.equal(joins[0].code,CODE);
  assert.equal(joins[0].options.friendInviteToken,TOKEN);
  assert.equal(context.publicPartyMyRequests[0].expiresAt,FixedDate.now()+(expiresAt-serverNow),
    'server_now must convert the server expiry into a device-local deadline');
}

// A targeted Realtime decision wakeup immediately forces the authoritative
// requester refresh; unrelated usernames cannot trigger it.
{
  const {context}=baseContext({socialProfile:{handle:'Requester'}});let refreshes=0;
  context.partyPublicRefresh=async force=>{assert.equal(force,true);refreshes++;return true;};
  assert.equal(context.partyPublicHandleRealtimeWakeup({to:'SomeoneElse',requestId:REQUEST_ID,status:'accepted'}),false);
  assert.equal(refreshes,0);
  assert.equal(context.partyPublicHandleRealtimeWakeup({to:'Requester',requestId:REQUEST_ID,status:'accepted'}),true);
  assert.equal(refreshes,1);
  assert.match(context.socialStatus,/APPROVED/);
}

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}

// A forced refresh arriving during an active read must get a second pass. The
// first generation cannot overwrite that second pass.
{
  FixedDate.clock=2_000_000;
  const firstDirectory=deferred(),firstMine=deferred(),secondDirectory=deferred(),secondMine=deferred();
  const calls=[];
  const {context}=baseContext();
  context.sb={rpc:(name)=>{
    calls.push(name);const round=Math.ceil(calls.length/2),mine=name==='list_my_outpost_zero_public_party_requests';
    return (round===1?(mine?firstMine:firstDirectory):(mine?secondMine:secondDirectory)).promise;
  },channel:()=>({})};
  const initial=context.partyPublicRefresh(true);
  const forced=context.partyPublicRefresh(true);
  firstDirectory.resolve({data:[{party_id:PARTY_ID,party_name:'Stale Party',host_username:'Old',member_count:1,capacity:4,created_at:new FixedDate().toISOString()}],error:null});
  firstMine.resolve({data:[],error:null});
  await flush();
  assert.equal(calls.length,4,'the force request must queue one complete follow-up read');
  secondDirectory.resolve({data:[{party_id:PARTY_ID,party_name:'Fresh Party',host_username:'New',member_count:1,capacity:4,created_at:new FixedDate().toISOString()}],error:null});
  secondMine.resolve({data:[],error:null});
  await Promise.all([initial,forced]);await flush();
  assert.equal(context.publicPartyRows[0]?.name,'Fresh Party');
  assert.equal(context.publicPartyRows[0]?.host,'New');
}

// Reset/account generation changes make an in-flight response stale even when
// that response eventually succeeds.
{
  const directory=deferred(),mine=deferred();
  const {context}=baseContext();
  context.sb={rpc:name=>name==='list_outpost_zero_public_parties'?directory.promise:mine.promise,channel:()=>({})};
  const pending=context.partyPublicRefresh(true);
  context.partyPublicReset();
  directory.resolve({data:[{party_id:PARTY_ID,party_name:'Stale Party',host_username:'Old',member_count:1,capacity:4,created_at:new FixedDate().toISOString()}],error:null});
  mine.resolve({data:[],error:null});
  await pending;
  assert.equal(context.publicPartyRows.length,0,'a stale generation must not restore reset directory data');
}

console.log('PASS Public-party approvals are immediate, race-safe, clock-safe, and Realtime-woken');
