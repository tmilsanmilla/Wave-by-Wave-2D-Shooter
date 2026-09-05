import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const online=fs.readFileSync(path.join(root,'js/online.js'),'utf8');
const stateSource=fs.readFileSync(path.join(root,'js/state.js'),'utf8');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
  const brace=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

// The same accounts can immediately requeue. Their new queue timestamps must
// lead to a new room topic so a lingering old topic cannot replay epoch 1.
const pairContext={Array,Object,String,Number,Math};vm.createContext(pairContext);
for(const name of ['arenaPairMembers','arenaPairCode'])vm.runInContext(functionSource(online,name),pairContext);
const first=[{id:'alpha',joined:1000,protocol:3},{id:'bravo',joined:1001,protocol:3}];
assert.equal(pairContext.arenaPairCode(first),pairContext.arenaPairCode(first.slice().reverse()),
  'both clients must derive the same room regardless of Presence order');
assert.notEqual(pairContext.arenaPairCode(first),pairContext.arenaPairCode([{id:'alpha',joined:2000},{id:'bravo',joined:2001}]),
  'a new queue attempt by the same accounts must not reuse the stale room topic');

const syncSource=functionSource(online,'arenaQueueSync'),offerSource=functionSource(online,'arenaQueueOffer');
assert.match(syncSource,/arenaPairCode\(members\)/,'Quick Match must bind its room to the current queue sessions');
assert.match(syncSource,/members:c\.members/,'the reciprocal offer must carry those queue sessions');

// An offer from the same two account IDs but an older queue visit is stale.
let syncCalls=0;
const channel={presenceState:()=>({alpha:[first[0]],bravo:[first[1]]})};
const staleContext={Array,Object,String,Number,Math,Map,Set,Date:{now:()=>1100},clearTimeout:()=>{},ARENA_PROTOCOL:3,
  authUser:{id:'alpha'},arena:{queueChannel:channel,matchChannel:null,queueCandidate:null,queueOffer:null},
  arenaQueueSync:()=>{syncCalls++;}};
vm.createContext(staleContext);
for(const name of ['arenaPresenceList','arenaPairMembers','arenaPairCode','arenaQueueOffer'])
  vm.runInContext(functionSource(online,name),staleContext);
const staleMembers=[{id:'alpha',joined:900},{id:'bravo',joined:901}];
staleContext.arenaQueueOffer(channel,{from:'bravo',to:'alpha',ids:['alpha','bravo'],members:staleMembers,
  code:staleContext.arenaPairCode(staleMembers)});
assert.equal(staleContext.arena.queueOffer,null,'an old queue-session offer must be ignored');
assert.equal(syncCalls,0,'an old offer must not advance current matchmaking');

// Entering the room itself is not readiness. Existing Presence sync marks a
// Quick Match ready only after it has found the expected opponent.
const connectSource=functionSource(online,'arenaConnectRoom'),presenceSource=functionSource(online,'arenaMatchPresenceSync');
assert.match(connectSource,/arena\.localReady=false; arena\.remoteReady=false/,
  'joining one side of a Quick Match must begin unready');
assert.ok(presenceSource.indexOf("if(!om)")<presenceSource.indexOf("arenaSetReady(true)"),
  'the missing-opponent return must occur before automatic queue readiness');
assert.doesNotMatch(functionSource(online,'arenaDropChannel'),/\.untrack\(/,
  'removing a channel must not spend an extra rate-limited Presence operation');
assert.doesNotMatch(functionSource(online,'arenaSetReady'),/\.track\(/,
  'ready state must use Broadcast instead of retracking Presence');
assert.doesNotMatch(functionSource(online,'arenaSetBackgrounded'),/\.track\(/,
  'hide/show must use Broadcast instead of consuming two Presence operations');
assert.match(functionSource(online,'arenaTrackMatchPresence'),/result==='ok'/,
  'match Presence setup must inspect the track acknowledgement instead of silently accepting an error');
assert.match(presenceSource,/else if\(arena\.localReady\)arenaSend\('ready',\{ready:true\}\)/,
  'a late Presence retry must make an already-ready peer repeat its idempotent ready Broadcast');
assert.match(functionSource(online,'arenaSyncTick'),/backgrounded:[\s\S]{0,120}presenceSeq:/,
  'the repeating state stream must carry current foreground/background sequence metadata');
assert.match(functionSource(online,'arenaReceive'),/event==='state'[\s\S]{0,1400}arenaApplyRemoteBackground\(p\)/,
  'validated state must recover a foreground player when the one-off visibility Broadcast was lost');

// Presence tracking must retry resolved error statuses (which do not reject
// the Promise) and stop immediately after the first acknowledged success.
const trackResponses=['error','timed out','ok'];let trackCalls=0,trackResumes=0;
const trackChannel={track:async()=>trackResponses[trackCalls++]};
const trackContext={Promise,arenaPresenceTrackSerial:0,ARENA_PRESENCE_RETRY_DELAYS_MS:[0,1,1],
  setTimeout:fn=>{fn();return 1;},arena:{matchChannel:trackChannel,active:false,opponent:null,status:''},authUser:{id:'me'},
  arenaOwnPresence:()=>({id:'me'}),arenaRequestResume:()=>{trackResumes++;return true;}};
vm.createContext(trackContext);vm.runInContext('async '+functionSource(online,'arenaTrackMatchPresence'),trackContext);
assert.equal(await trackContext.arenaTrackMatchPresence(trackChannel),true);
assert.equal(trackCalls,3,'resolved Presence errors must retry with bounded delays');
assert.equal(trackResumes,1,'only the acknowledged track may request match recovery');

// A result is authoritative only for this live round and map-vote nonce, and
// must represent exactly one legal score transition. In particular, a packet
// can never turn an untouched 0-0 match into MATCH WON / MATCH LOST.
const resultContext={Array,Object,String,Number,Math,ARENA_TARGET:5,authUser:{id:'guest'},arena:{
  room:'QROOM1',hostId:'host',opponent:{id:'host'},matchEpoch:1,round:1,mapVoteId:'QROOM1:1:LIVE',
  scores:{guest:0,host:0},roundResolved:false,phase:'fight',active:true
}};
vm.createContext(resultContext);
for(const name of ['arenaRoundResultSnapshot','arenaApplyRoundResult'])
  vm.runInContext(functionSource(online,name),resultContext);
const falseFinish={from:'host',room:'QROOM1',epoch:1,round:1,mapVoteId:'QROOM1:1:LIVE',
  winner:'host',scores:{guest:0,host:0},matchOver:true};
assert.equal(resultContext.arenaRoundResultSnapshot(falseFinish),null,'0-0 cannot be a completed match result');
assert.equal(resultContext.arenaApplyRoundResult(falseFinish),false,'the invalid result must be rejected before UI state changes');
assert.equal(resultContext.arena.phase,'fight');
assert.equal(resultContext.arena.active,true);
assert.deepEqual({...resultContext.arena.scores},{guest:0,host:0});

const staleFinish={...falseFinish,mapVoteId:'QROOM1:1:OLD',scores:{guest:0,host:1},matchOver:false};
assert.equal(resultContext.arenaRoundResultSnapshot(staleFinish),null,'an earlier match nonce must not resolve the new round');
resultContext.arena.phase='countdown';
assert.equal(resultContext.arenaRoundResultSnapshot({...falseFinish,scores:{guest:0,host:1},matchOver:false}),null,
  'a score packet cannot end a round before live combat begins');
resultContext.arena.phase='fight';
resultContext.arena.scores={guest:2,host:4};
const realFinish={...falseFinish,scores:{guest:2,host:5},matchOver:true};
assert.deepEqual({...resultContext.arenaRoundResultSnapshot(realFinish).scores},{guest:2,host:5},
  'a legitimate fifth point from the current host remains valid');

const hostSource=functionSource(online,'arenaHostResolve');
assert.match(hostSource,/mapVoteId:arena\.mapVoteId/,'host results must carry the current match nonce');
assert.match(hostSource,/if\(!arenaApplyRoundResult\(p\)\) return false/,
  'the host must not broadcast a locally rejected round result');

// Protocol 3 isolates the grace/commit rules in the public queue, advertises
// itself in Presence, and
// rejects an old private-room peer with an actionable message.
assert.match(online,/const ARENA_PROTOCOL=3;/);
assert.match(online,/oz-arena-queue-v3/,'new clients must not pair with an older public queue protocol');
assert.doesNotMatch(online,/oz-arena-queue-v[12]/,'retired public queue topics must not remain reachable');
assert.match(presenceSource,/REFRESH REQUIRED[\s\S]{0,100}Both players must refresh/,
  'a mixed-version private room must fail clearly instead of waiting forever');
const protocolContext={Math,Number,String,Date:{now:()=>3000},ARENA_PROTOCOL:3,
  arena:{joinedAt:2500,wantsHost:true,localReady:true,localBackgrounded:false,presenceSeq:0},
  authUser:{id:'guest'},loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},
  arenaLoadoutReady:()=>true,arenaPageBackgrounded:()=>false,displayName:()=> 'Guest',casualArenaUtilityKey:()=>''};
vm.createContext(protocolContext);vm.runInContext(functionSource(online,'arenaOwnPresence'),protocolContext);
assert.equal(protocolContext.arenaOwnPresence().protocol,3,'every current match Presence row must identify protocol 3');

// Presence cannot score a room until a real current-round state proves that
// combat has started. Map voting and a loading countdown remain harmless.
const eligibilityContext={Math,String,authUser:{id:'me'},isBotArena:()=>false,isCpuTeamArena:()=>false,
  arena:{matchChannel:{},opponent:{id:'them'},matchEpoch:1,round:0,phase:'map_vote',mapVoteId:'VOTE',matchCommitted:false}};
vm.createContext(eligibilityContext);vm.runInContext(functionSource(online,'arenaForfeitEligible'),eligibilityContext);
assert.equal(eligibilityContext.arenaForfeitEligible(),false,'map voting at 0-0 is never a scored match');
eligibilityContext.arena.round=1;eligibilityContext.arena.phase='fight';
assert.equal(eligibilityContext.arenaForfeitEligible(),false,'loading a round without remote combat state is not committed');
eligibilityContext.arena.matchCommitted=true;
assert.equal(eligibilityContext.arenaForfeitEligible(),true,'a live round confirmed by remote state remains forfeit-protected');
eligibilityContext.arena.phase='map_vote';eligibilityContext.arena.round=0;
assert.equal(eligibilityContext.arenaForfeitEligible(),false,'pre-round phases stay ineligible even if a stale flag survived');
assert.match(stateSource,/matchCommitted:false/,'new Arena state must begin uncommitted');
for(const name of ['arenaMaybeStart','arenaApplyMapVoteOpen','arenaApplyRematchStart']){
  const body=functionSource(online,name);
  assert.match(body,/matchCommitted=false/,name+' must clear prior-match commitment');
  assert.match(body,/arenaClearDisconnectHold\(false\)/,name+' must retire an older outage before changing epochs');
}
let lobbyStarts=0,lobbyClears=0;
const lobbyContext={authUser:{id:'host'},arena:{
  active:false,phase:'lobby',mapVotePhase:'idle',hostId:'host',localReady:true,remoteReady:true,matchEpoch:0,
  opponent:{id:'guest',backgrounded:true,away:true},disconnectAt:100,disconnectTimer:1,networkHold:false,
  disconnectSide:'opponent',localBackgrounded:false
},arenaPageBackgrounded:()=>false,arenaClearDisconnectHold:()=>{lobbyClears++;},arenaStartMapVote:()=>{lobbyStarts++;}};
vm.createContext(lobbyContext);vm.runInContext(functionSource(online,'arenaMaybeStart'),lobbyContext);
assert.equal(lobbyContext.arenaMaybeStart(),false,'an away ready player must not start a fresh 0-0 match');
assert.equal(lobbyStarts,0);assert.equal(lobbyClears,0,'match startup must preserve the lobby return deadline');
lobbyContext.arena.opponent.backgrounded=false;lobbyContext.arena.opponent.away=false;
lobbyContext.arena.disconnectAt=0;lobbyContext.arena.disconnectTimer=null;lobbyContext.arena.disconnectSide='';
assert.equal(lobbyContext.arenaMaybeStart(),true,'a real foreground lobby may start normally');
assert.equal(lobbyStarts,1);assert.equal(lobbyContext.arena.matchEpoch,1);
assert.doesNotMatch(functionSource(online,'arenaApplyRoundStart'),/matchCommitted=false/,
  'later rounds must preserve a commitment established by the live match');
assert.match(functionSource(online,'arenaApplyRoundResult'),/matchCommitted=true/,
  'a fully validated completed round must also prove that the match was live');

// State HP must be a real JSON number. Missing/NaN/string HP cannot become 0,
// and a zero packet cannot be the first evidence that combat existed.
let stateResolves=0;
const stateChannel={};
const hpContext={Math,Number,String,Array,Object,Date:{now:()=>7000},ARENA_HP:250,WORLD:{w:1600,h:900},now:7000,
  authUser:{id:'host'},arena:{matchChannel:stateChannel,room:'HPROOM',opponent:{id:'guest',hp:200,x:1200,y:450,tx:1200,ty:450,
    r:15,portalSeq:0,angle:Math.PI,cur:'ar',loadout:{primary:'ar'}},hostId:'host',matchEpoch:1,round:1,
    mapVoteId:'HPROOM:1:LIVE',phase:'fight',roundEndAt:10000,matchCommitted:false},WEAPONS:{ar:{}},
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),activeArenaMapId:()=> 'arena',
  activeArenaBounds:()=>({left:0,top:0,right:1600,bottom:900}),remoteCarriedWeapon:()=>true,
  arenaControlClockCatchUp:()=>{},arenaApplyRemoteParryState:()=>{},arenaApplyRemoteMeleeAbilityState:()=>{},
  arenaConfirmRemoteTraffic:clock=>{hpContext.arena.opponent.lastSeen=clock;},
  arenaHazardCauseValid:()=>false,arenaHostRecordHazardHp:()=>{},arenaUnscopedKillCause:()=>null,
  arenaHostResolve:()=>{stateResolves++;}};
vm.createContext(hpContext);vm.runInContext(functionSource(online,'arenaReceive'),hpContext);
const statePacket=hp=>({from:'guest',room:'HPROOM',epoch:1,round:1,hp,x:1200,y:450,angle:0,cur:'ar',portalSeq:0});
for(const hp of [undefined,null,'0',NaN,Infinity,-1,251]){
  hpContext.arena.opponent.hp=200;hpContext.arena.matchCommitted=false;
  hpContext.arenaReceive('state',statePacket(hp),stateChannel);
  assert.equal(hpContext.arena.opponent.hp,200,'invalid HP must not mutate the opponent');
  assert.equal(hpContext.arena.matchCommitted,false);assert.equal(stateResolves,0);
}
hpContext.arenaReceive('state',statePacket(0),stateChannel);
assert.equal(hpContext.arena.opponent.hp,200,'a first zero state cannot manufacture a load-time knockout');
assert.equal(stateResolves,0);
hpContext.arenaReceive('state',statePacket(249),stateChannel);
assert.equal(hpContext.arena.opponent.hp,249);assert.equal(hpContext.arena.matchCommitted,true);
hpContext.arenaReceive('state',statePacket(0),stateChannel);
assert.equal(stateResolves,1,'zero HP remains valid after live positive state committed the match');

// A callback retained by an unsubscribed room must not operate on the current
// arena, and leave packets must prove their intent and current match nonce.
const currentChannel={},oldChannel={};let claims=0,leaves=0,holds=0;
const receiveContext={Math,Number,String,Array,Object,Date:{now:()=>5000},
  authUser:{id:'guest'},arena:{matchChannel:currentChannel,room:'ROOM2',opponent:{id:'host'},hostId:'host',
    matchEpoch:2,round:3,mapVoteId:'ROOM2:2:LIVE',phase:'fight',departureAnnounced:''},
  arenaControlClockCatchUp:()=>{},arenaForfeitEligible:()=>true,
  arenaBeginDisconnectHold:(side,ch)=>{assert.equal(side,'opponent');assert.equal(ch,currentChannel);holds++;return true;},
  arenaClaimOpponentForfeit:()=>{claims++;return true;},leaveArena:()=>{leaves++;}};
vm.createContext(receiveContext);
for(const name of ['arenaForfeitResultId','arenaLeavePacketValid','arenaReceive'])
  vm.runInContext(functionSource(online,name),receiveContext);
const validLeave={from:'host',room:'ROOM2',epoch:2,round:3,mapVoteId:'ROOM2:2:LIVE',forfeit:true,
  loser:'host',resultId:receiveContext.arenaForfeitResultId('host'),reason:'left'};
receiveContext.arenaReceive('leave',validLeave,oldChannel);
assert.equal(claims,0,'a stale channel callback must be inert even if its packet otherwise looks current');
receiveContext.arenaReceive('leave',{...validLeave,forfeit:false,resultId:''},currentChannel);
assert.equal(claims,0,'forfeit:false must never award an immediate win');
assert.equal(leaves,0,'a non-forfeit packet cannot close a binding match; Presence still owns disconnect recovery');
receiveContext.arenaReceive('leave',{...validLeave,mapVoteId:'ROOM2:2:OLD',
  resultId:receiveContext.arenaForfeitResultId('host','ROOM2:2:OLD')},currentChannel);
assert.equal(claims,0,'a leave packet from an earlier match nonce must be ignored');
receiveContext.arenaReceive('leave',{...validLeave,reason:'page_exit'},currentChannel);
assert.equal(claims,0,'page exit must not award an immediate win');
assert.equal(holds,1,'page exit must enter the reconnect grace period');
receiveContext.arenaReceive('leave',validLeave,currentChannel);
assert.equal(claims,1,'a valid current-session forfeit leave must still award the connected player');
assert.equal(receiveContext.arenaLeavePacketValid({...validLeave,loser:'guest'}),false,
  'a sender cannot nominate somebody else as the loser');

// The same envelope rules protect direct forfeit-result broadcasts while a
// legitimate current result still finishes the match.
let dailyRecords=0;
const forfeitContext={Math,Number,String,Array,Object,Set,Map,Date:{now:()=>6000},clearTimeout:()=>{},ARENA_TARGET:5,
  authUser:{id:'guest'},arena:{matchChannel:{},room:'ROOM2',opponent:{id:'host',name:'Host'},hostId:'host',
    matchEpoch:2,round:3,mapVoteId:'ROOM2:2:LIVE',phase:'round_end',matchCommitted:false,scores:{guest:1,host:2},roundResolved:true,
    disconnectAt:0,disconnectTimer:null,networkHold:false,remoteShots:[],remoteFireworks:[],remoteFireworkFx:[],
    rematchVotes:new Set(),forfeitResultId:'',savedUtility:undefined,winRecorded:false},
  isBotArena:()=>false,isCpuTeamArena:()=>false,arenaRecordDailyMatch:()=>{dailyRecords++;},
  submitArenaWin:()=>{},arenaWinResultId:()=>'',dropUnownedFromLoadout:()=>{},resetHeldGameplayInput:()=>{},
  resetWeaponGimmickState:()=>{},sfx:()=>{},loadout:{},practiceMode:'arena',state:'play',selPage:'arena',
  menuOpen:false,aiming:false,rmbAim:false};
vm.createContext(forfeitContext);
for(const name of ['arenaForfeitEligible','arenaForfeitResultId','arenaHasCompletedDailyTaskRound','arenaClearDisconnectHold','arenaApplyForfeitResult'])
  vm.runInContext(functionSource(online,name),forfeitContext);
const forfeitResult={from:'host',room:'ROOM2',epoch:2,round:3,mapVoteId:'ROOM2:2:LIVE',forfeit:true,
  winner:'host',loser:'guest',resultId:forfeitContext.arenaForfeitResultId('guest'),reason:'disconnect'};
assert.equal(forfeitContext.arenaApplyForfeitResult({...forfeitResult,forfeit:false}),false,
  'forfeit:false must be rejected as a result too');
assert.equal(forfeitContext.arenaApplyForfeitResult({...forfeitResult,mapVoteId:'ROOM2:2:OLD'}),false,
  'a result from another match nonce must be rejected');
assert.equal(forfeitContext.arenaApplyForfeitResult(forfeitResult),false,
  'a room that never received live combat state cannot be turned into a scored forfeit');
forfeitContext.arena.matchCommitted=true;
assert.equal(forfeitContext.arenaApplyForfeitResult(forfeitResult),true,'a valid current forfeit result must remain usable');
assert.equal(forfeitContext.arena.phase,'match_end');
assert.deepEqual({...forfeitContext.arena.scores},{guest:1,host:5});
assert.equal(dailyRecords,1);
assert.match(forfeitContext.arena.status,/match channel stopped responding/,
  'a transport timeout must describe the match channel instead of claiming the player lost Internet');
assert.doesNotMatch(forfeitContext.arena.status,/disconnected/i);

const startSource=functionSource(online,'arenaHostStartRound');
assert.match(startSource,/const channel=arena\.matchChannel[\s\S]{0,500}arena\.matchChannel===channel/,
  'round-start retries must be tied to the channel that scheduled them');
assert.match(hostSource,/const channel=arena\.matchChannel[\s\S]{0,500}arena\.matchChannel===channel/,
  'round-result retries must be tied to the channel that scheduled them');
assert.match(functionSource(online,'arenaForfeitOnPageExit'),/arenaNotifyDeparture\('page_exit'\)/,
  'a real close or reload should promptly announce page exit so the receiver can start its grace timer');

console.log('PASS Online Casual rejects stale-session and impossible 0-0 match results');
