"use strict";

/* Human duels use an immutable server-created roster and a private room.
   The host controls rounds; each device confirms its own received damage.
   This is deliberately not an anti-cheat server: private Realtime keeps out
   non-members, but cannot make a participant's browser trustworthy. Ranked
   settlement belongs to the server's all-participant agreement workflow. */
const MULTIDEVICE_HP=250, MULTIDEVICE_TARGET=5, MULTIDEVICE_ROUND_MS=90000;
const MULTIDEVICE_GRACE_MS=45000, MULTIDEVICE_SETUP_MS=90000;
let multidevice=null;

function multideviceRoster(config,selfId){
  if(!config||!['1v1','2v2','1v1v1'].includes(config.mode)||
     !['queue','party'].includes(config.source)||config.mode==='1v1v1'&&(config.source!=='party'||config.ranked))return null;
  const count=config.mode==='1v1'?2:config.mode==='2v2'?4:3;
  if(!Array.isArray(config.roster)||config.roster.length!==count)return null;
  const rows=config.roster.map(raw=>({id:String(raw&&raw.id||''),name:String(raw&&raw.name||'OPERATOR').slice(0,32),
    team:String(raw&&raw.team||''),loadout:raw&&raw.loadout,accepted:raw&&raw.accepted!==false}));
  if(rows.some(r=>!r.id||!r.accepted)||new Set(rows.map(r=>r.id)).size!==count||!rows.some(r=>r.id===String(selfId))||
     !rows.some(r=>r.id===String(config.hostId)))return null;
  const teams=[...new Set(rows.map(r=>r.team))];
  if(config.mode==='1v1v1'){
    if(teams.length!==3||teams.some(t=>!['A','B','C'].includes(t)))return null;
  }else if(teams.length!==2||teams.some(t=>!['A','B'].includes(t))||
    teams.some(t=>rows.filter(r=>r.team===t).length!==count/2))return null;
  return rows;
}
function multideviceCreate(config,selfId,clock=Date.now()){
  const roster=multideviceRoster(config,selfId),matchId=String(config&&config.matchId||''),epoch=String(config&&config.epoch||matchId);
  if(!roster||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)||!epoch||epoch.length>80)return null;
  const teams=[...new Set(roster.map(r=>r.team))].sort(),actors={};
  for(const r of roster)actors[r.id]=Object.assign({},r,{r:15,hp:MULTIDEVICE_HP,x:0,y:0,tx:0,ty:0,angle:0,
    stateSeq:0,lastSeen:clock,missingSince:0,parrySeq:0,parryUntil:0,parryReadyAt:0,portalSeq:0});
  return {matchId,epoch,mode:config.mode,source:config.source,ranked:config.ranked===true,selfId:String(selfId),
    hostId:String(config.hostId),roster,teams,actors,phase:'setup',round:0,scores:Object.fromEntries(teams.map(t=>[t,0])),
    ready:new Set(),roundStartAt:0,roundEndAt:0,nextRoundAt:0,roundResolved:false,started:false,controlSeq:0,
    channel:null,connected:false,createdAt:clock,controlAt:0,readyAt:0,syncAt:0,wallAt:0,stateSeq:0,eventSeq:0,
    received:new Map(),sent:new Map(),hitLedger:new Map(),seen:new Set(),visualShots:[],visualFireworks:[],utilityReady:{},
    lastControl:null,resultNotified:false,status:'CONNECTING ALL PLAYERS…',timer:null,timeoutHp:null};
}
function multideviceEnvelope(match,p,hostOnly=false,roundRequired=true){
  return !!(match&&p&&String(p.matchId||'')===match.matchId&&String(p.epoch||'')===match.epoch&&
    match.actors[String(p.from||'')]&&(!hostOnly||String(p.from)===match.hostId)&&
    (!roundRequired||Number.isSafeInteger(p.round)&&p.round===match.round));
}
function multideviceEnemies(match,fromId,targetId){
  const from=match&&match.actors[String(fromId)],target=match&&match.actors[String(targetId)];
  return !!(from&&target&&from.id!==target.id&&from.team!==target.team);
}
function multideviceScoreValid(match,scores){
  return !!(scores&&typeof scores==='object'&&!Array.isArray(scores)&&
    Object.keys(scores).length===match.teams.length&&match.teams.every(t=>Number.isSafeInteger(scores[t])&&scores[t]>=0&&scores[t]<=MULTIDEVICE_TARGET));
}
function multideviceRoundBegin(match,p,clock=Date.now(),recovery=false){
  if(!multideviceEnvelope(match,p,true,false)||match.phase==='match_end'||!Number.isSafeInteger(p.round)||p.round<1||p.round<=match.round||
     !multideviceScoreValid(match,p.scores)||!Number.isFinite(p.startInMs)||p.startInMs<0||p.startInMs>10000||
     !Number.isFinite(p.remainingMs)||p.remainingMs<p.startInMs||p.remainingMs>MULTIDEVICE_ROUND_MS+10000)return false;
  if(!recovery&&(p.round!==match.round+1||match.round>0&&match.phase!=='round_end'||
      match.teams.some(t=>p.scores[t]!==match.scores[t])))return false;
  if(match.teams.some(t=>p.scores[t]>=MULTIDEVICE_TARGET))return false;
  match.round=p.round;match.scores=Object.assign({},p.scores);match.phase=p.startInMs>0?'countdown':'fight';
  match.roundStartAt=clock+p.startInMs;match.roundEndAt=clock+p.remainingMs;match.nextRoundAt=0;match.roundResolved=false;
  match.started=true;match.seen=new Set();match.sent=new Map();match.received=new Map();match.hitLedger=new Map();match.timeoutHp=null;
  match.visualShots=[];match.visualFireworks=[];match.utilityReady={};match.stateSeq=0;
  for(const actor of Object.values(match.actors)){
    actor.hp=MULTIDEVICE_HP;actor.stateSeq=0;actor.parrySeq=0;actor.parryUntil=0;actor.parryReadyAt=0;
    actor.meleeFxSeq=0;actor.meleeFxUntil=0;actor.meleeFxReadyAt=0;actor.meleeFxBlades=[];actor.meleeFxWallRecallSeq=0;
    actor.healUntil=0;actor.cur=actor.loadout&&actor.loadout.primary;actor.utilityOut=false;
  }
  return true;
}
function multideviceRoundWinner(match,timeout=false,hpSnapshot=null){
  const totals=Object.fromEntries(match.teams.map(t=>[t,0]));
  for(const actor of Object.values(match.actors))totals[actor.team]+=Math.max(0,hpSnapshot?+hpSnapshot[actor.id]||0:+actor.hp||0);
  const living=match.teams.filter(t=>totals[t]>0);
  if(living.length===1)return {resolved:true,winner:living[0]};
  if(!living.length)return {resolved:true,winner:null};
  if(!timeout)return {resolved:false,winner:null};
  const best=Math.max(...Object.values(totals)),winners=match.teams.filter(t=>totals[t]===best);
  return {resolved:true,winner:winners.length===1?winners[0]:null};
}
function multideviceRoundResult(match,p,clock=Date.now()){
  if(!multideviceEnvelope(match,p,true)||!match.started||match.round<1||match.roundResolved||
     !['fight','timeout'].includes(match.phase)||!multideviceScoreValid(match,p.scores)||
     p.winner!==null&&!match.teams.includes(p.winner))return false;
  if(match.teams.some(t=>p.scores[t]!==match.scores[t]+(p.winner===t?1:0)))return false;
  const over=!!p.winner&&p.scores[p.winner]===MULTIDEVICE_TARGET;
  if(typeof p.matchOver!=='boolean'||over!==p.matchOver)return false;
  match.scores=Object.assign({},p.scores);match.roundResolved=true;match.winner=p.winner;
  match.phase=over?'match_end':'round_end';match.nextRoundAt=over?0:clock+2600;
  match.visualShots=[];match.visualFireworks=[];match.sent.clear();return true;
}
function multideviceAcceptActorState(match,p,clock=Date.now()){
  if(!multideviceEnvelope(match,p)||!['countdown','fight'].includes(match.phase)||clock>=match.roundEndAt||
     !Number.isSafeInteger(p.seq)||p.seq<1||!['x','y','angle','hp'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]))||
     p.hp<0||p.hp>MULTIDEVICE_HP)return false;
  const actor=match.actors[p.from];if(p.seq<=actor.stateSeq)return false;
  if(p.x<480+15||p.x>1920-15||p.y<360+15||p.y>1440-15||Math.abs(p.angle)>Math.PI*2000)return false;
  actor.stateSeq=p.seq;actor.tx=p.x;actor.ty=p.y;actor.angle=p.angle;actor.lastSeen=clock;actor.missingSince=0;
  // A dead actor cannot resurrect from a delayed state. A validated Medkit
  // activation is the only accepted in-round increase in a remote HP claim.
  actor.hp=actor.hp<=0?0:clock<(actor.healUntil||0)?p.hp:Math.min(actor.hp,p.hp);
  if(actor.loadout&&[actor.loadout.primary,actor.loadout.secondary,actor.loadout.melee].includes(p.cur))actor.cur=p.cur;
  actor.utilityOut=p.utilityOut===true;return true;
}
function multideviceDamageAllowed(match,p){
  return !!(multideviceEnvelope(match,p)&&match.phase==='fight'&&!match.roundResolved&&
    multideviceEnemies(match,p.from,p.to)&&match.actors[p.from].hp>0&&match.actors[p.to].hp>0&&
    typeof p.id==='string'&&p.id.startsWith(p.from+':'+match.round+':hit:')&&p.id.length<=150&&
    typeof p.dmg==='number'&&Number.isFinite(p.dmg)&&p.dmg>0&&p.dmg<=MULTIDEVICE_HP&&
    typeof p.kind==='string'&&p.kind.length<=32);
}
function isMultideviceArena(){return !!(multidevice&&typeof arena!=='undefined'&&arena.mode==='multidevice');}
function multideviceTargets(){
  return isMultideviceArena()?Object.values(multidevice.actors).filter(a=>a.hp>0&&multideviceEnemies(multidevice,multidevice.selfId,a.id)):[];
}
function multideviceCanAct(){
  return !!(isMultideviceArena()&&multidevice.connected&&multidevice.phase==='fight'&&Date.now()<multidevice.roundEndAt&&player.hp>0);
}
function multideviceView(){return multidevice;}
function multideviceSend(event,payload={}){
  const m=multidevice;if(!m||!m.channel)return false;
  const body=Object.assign({},payload,{from:m.selfId,matchId:m.matchId,epoch:m.epoch,round:payload.round===undefined?m.round:payload.round});
  try{return m.channel.send({type:'broadcast',event,payload:body});}catch(e){return false;}
}
function multideviceMirror(){
  const m=multidevice;if(!m)return;
  arena.phase=m.phase;arena.round=m.round;arena.scores=Object.assign({},m.scores);arena.roundStartAt=m.roundStartAt;
  arena.roundEndAt=m.roundEndAt;arena.nextRoundAt=m.nextRoundAt;arena.roundResolved=m.roundResolved;arena.status=m.status;
  arena.remoteShots=m.visualShots;arena.remoteFireworks=m.visualFireworks;
}
function multideviceSpawn(match,actor){
  if(match.mode==='1v1v1'){
    const points={A:{x:710,y:780},B:{x:1690,y:780},C:{x:1200,y:1170}},p=points[actor.team];
    return {x:p.x,y:p.y,angle:Math.atan2(900-p.y,1200-p.x)};
  }
  const side=actor.team==='A',peers=match.roster.filter(a=>a.team===actor.team),i=peers.findIndex(a=>a.id===actor.id);
  return {x:side?710:1690,y:900+(peers.length===1?0:i===0?-110:110),angle:side?0:Math.PI};
}
function multideviceResetLocalRound(){
  const m=multidevice,mine=m&&m.actors[m.selfId];if(!mine||!arenaRemoteLoadout(mine.loadout))return false;
  const continuing=m.round>1;
  loadout=Object.assign({},mine.loadout);soloPractice=false;
  if(!arenaLoadoutReady()||startGame({preserveMovement:continuing})===false)return false;
  practiceMode='arena';arena.mode='multidevice';arena.active=true;arena.mapId='arena';arena.mapVotePhase='locked';
  resetRoundTransitionInput(continuing);resetWeaponGimmickState();clearCameraShake();
  perks.maxhp=MULTIDEVICE_HP;player.hp=MULTIDEVICE_HP;player.hurtCd=0;player.hurtFlash=0;
  bullets=[];ebullets=[];enemies=[];particles=[];pickups=[];damageNumbers=[];grenades=[];pearls=[];balls=[];flames=[];freezeFx=[];splitBalls=[];
  utilReadyT=0;medChan=0;medChanHeal=0;medHealPct=0;medKillCharge=medKillsRequired();utilityOut=false;
  abilityCD={};quickReadyT=0;sawFuel=100;sawLock=false;daggersOut=null;comboStep=0;comboNextT=0;
  parryUntil=0;parrySeq=0;teraHitCharge=15;fistFlurryUntil=0;sawChargeUntil=0;playerFrozenUntil=0;
  player.cur=loadout.primary;player.reloadEnd=0;player.equipEnd=now+600;player.bloom=0;player.lastShot=0;
  for(const key of [loadout.primary,loadout.secondary,loadout.melee]){
    player.mags[key]=magSize(key);player.reserve[key]=(WEAPONS[key].melee||WEAPONS[key].energy||WEAPONS[key].infinite)?Infinity:magSize(key)*5;
  }
  arenaResetMapRuntime();
  for(const actor of Object.values(m.actors)){
    const p=multideviceSpawn(m,actor);actor.x=actor.tx=p.x;actor.y=actor.ty=p.y;actor.angle=p.angle;
    resetMeleeAbilityVisual(actor);
  }
  player.x=mine.x;player.y=mine.y;cam.x=mine.x;cam.y=mine.y;zoom=duelArenaFitZoom();
  m.gameClockAnchor=now;m.gameWallAnchor=Date.now();
  state='play';menuOpen=false;aiming=false;rmbAim=false;
  waveMsg='ROUND '+m.round+' — GET READY';waveMsgT=now+2800;multideviceMirror();sfx('wave');return true;
}
function multideviceControlSnapshot(){
  const m=multidevice,clock=Date.now();
  return {controlSeq:++m.controlSeq,phase:m.phase,round:m.round,scores:Object.assign({},m.scores),winner:m.winner||null,
    startInMs:Math.max(0,m.roundStartAt-clock),remainingMs:Math.max(0,m.roundEndAt-clock),nextInMs:Math.max(0,m.nextRoundAt-clock),
    actors:Object.values(m.actors).map(a=>({id:a.id,hp:a.hp,x:a.tx,y:a.ty,angle:a.angle,cur:a.cur}))};
}
function multidevicePublishControl(){
  const m=multidevice;if(!m||m.selfId!==m.hostId||!m.round)return false;
  const packet=multideviceControlSnapshot();m.lastControl=packet;multideviceSend('control',packet);return true;
}
function multideviceHostBegin(){
  const m=multidevice;if(!m||m.selfId!==m.hostId||m.phase!=='setup'&&m.phase!=='round_end')return false;
  if(m.phase==='setup'&&!m.roster.every(a=>m.ready.has(a.id)))return false;
  const packet={from:m.hostId,matchId:m.matchId,epoch:m.epoch,round:m.round+1,scores:Object.assign({},m.scores),startInMs:3000,remainingMs:93000};
  if(!multideviceRoundBegin(m,packet)||!multideviceResetLocalRound()){multideviceAbort('Could not prepare the next round. No ranked result was submitted.');return false;}
  m.status='ROUND '+m.round+' · GET READY';multidevicePublishControl();return true;
}
function multideviceFinishLocal(){
  const m=multidevice;if(!m||m.resultNotified||m.phase!=='match_end')return;
  m.resultNotified=true;arena.active=false;practiceMode=null;state='select';selPage='multidevice';menuOpen=false;
  aiming=false;rmbAim=false;resetHeldGameplayInput();
  const won=m.actors[m.selfId].team===m.winner;
  m.status=won?'MATCH WON!':'MATCH LOST.';multideviceMirror();sfx(won?'pickup':'die');
  if(m.ranked&&typeof duelServiceSubmitRanked==='function')
    void duelServiceSubmitRanked({matchId:m.matchId,winningTeam:m.winner,scoreA:m.scores.A,scoreB:m.scores.B});
}
function multideviceHostResolve(winner,reason='knockout'){
  const m=multidevice;if(!m||m.selfId!==m.hostId)return false;
  const scores=Object.assign({},m.scores);if(winner)scores[winner]++;
  const packet={from:m.hostId,matchId:m.matchId,epoch:m.epoch,round:m.round,winner,scores,matchOver:!!winner&&scores[winner]===MULTIDEVICE_TARGET,reason};
  if(!multideviceRoundResult(m,packet))return false;
  resetRoundTransitionInput(!packet.matchOver);bullets=[];grenades=[];balls=[];daggersOut=null;
  multideviceSend('result',packet);multideviceMirror();multidevicePublishControl();
  waveMsg=winner?(winner===m.actors[m.selfId].team?'ROUND WON':'ROUND LOST'):'ROUND DRAW';waveMsgT=now+2300;
  multideviceFinishLocal();return true;
}
function multideviceApplyControl(p){
  const m=multidevice;
  if(!multideviceEnvelope(m,p,true,false)||m.phase==='match_end'||m.selfId===m.hostId||!Number.isSafeInteger(p.controlSeq)||p.controlSeq<=m.controlSeq||
     !Number.isSafeInteger(p.round)||p.round<Math.max(1,m.round)||!multideviceScoreValid(m,p.scores)||
     !['countdown','fight','timeout','round_end','match_end'].includes(p.phase)||!Array.isArray(p.actors)||p.actors.length!==m.roster.length)return false;
  const ids=new Set();
  for(const a of p.actors){
    if(!a||!m.actors[a.id]||ids.has(a.id)||!['hp','x','y','angle'].every(k=>Number.isFinite(a[k]))||a.hp<0||a.hp>MULTIDEVICE_HP||
       a.x<495||a.x>1905||a.y<375||a.y>1425||Math.abs(a.angle)>TAU*1000)return false;
    ids.add(a.id);
  }
  if(!Number.isFinite(p.startInMs)||p.startInMs<0||p.startInMs>10000||!Number.isFinite(p.remainingMs)||
     p.remainingMs<0||p.remainingMs>100000||!Number.isFinite(p.nextInMs)||p.nextInMs<0||p.nextInMs>10000)return false;
  const newRound=p.round>m.round;
  if(newRound){
    if(!multideviceRoundBegin(m,Object.assign({},p,{remainingMs:Math.max(p.startInMs,p.remainingMs)}),Date.now(),true))return false;
    if(!multideviceResetLocalRound()){multideviceAbort('A selected weapon is no longer available.');return false;}
  }
  m.controlSeq=p.controlSeq;m.hostSeenAt=Date.now();
  // Host snapshots repair a missed result/start packet. Only advance phases;
  // a delayed countdown must never restart a round already being played.
  const order={countdown:0,fight:1,timeout:2,round_end:3,match_end:4};
  if(order[p.phase]<order[m.phase])return false;
  if(p.phase==='match_end'&&(!m.teams.includes(p.winner)||p.scores[p.winner]!==MULTIDEVICE_TARGET))return false;
  if(p.phase==='timeout'&&!m.timeoutHp)m.timeoutHp={at:Date.now(),confirmed:{[m.selfId]:Math.max(0,player.hp)},
    fallback:Object.fromEntries(Object.values(m.actors).map(a=>[a.id,a.id===m.selfId?Math.max(0,player.hp):a.hp]))};
  m.phase=p.phase;m.scores=Object.assign({},p.scores);m.winner=p.winner;
  m.roundResolved=p.phase==='round_end'||p.phase==='match_end';
  m.roundStartAt=Date.now()+p.startInMs;m.roundEndAt=Date.now()+p.remainingMs;m.nextRoundAt=p.nextInMs?Date.now()+p.nextInMs:0;
  for(const row of p.actors){
    const actor=m.actors[row.id];
    if(row.id===m.selfId){if(newRound)player.hp=row.hp;actor.hp=Math.min(player.hp,row.hp);}
    else{
      actor.hp=newRound||Date.now()<(actor.healUntil||0)?row.hp:Math.min(actor.hp,row.hp);
      actor.tx=row.x;actor.ty=row.y;actor.angle=row.angle;
    }
  }
  if(m.roundResolved){bullets=[];grenades=[];balls=[];daggersOut=null;m.visualShots=[];m.visualFireworks=[];}
  multideviceMirror();multideviceFinishLocal();return true;
}
function multideviceSyncTick(wall){
  const m=multidevice;if(!isMultideviceArena()||!m.started||m.phase==='match_end'||wall<m.syncAt)return;
  m.syncAt=wall+50;
  const actor=m.actors[m.selfId];actor.x=actor.tx=player.x;actor.y=actor.ty=player.y;actor.hp=Math.max(0,Math.min(MULTIDEVICE_HP,player.hp));
  actor.angle=aimAngle();actor.cur=player.cur;
  multideviceSend('state',{seq:++m.stateSeq,x:player.x,y:player.y,angle:actor.angle,cur:player.cur,hp:actor.hp,utilityOut:!!utilityOut,
    parrySeq:Math.max(0,Math.floor(+parrySeq||0)),parryMs:clamp(parryUntil-now,0,TWIN_SAI_PARRY_MS),
    meleeFxSeq:Math.max(0,Math.floor(+player.meleeFxSeq||0)),meleeFxKey:String(player.meleeFxKey||''),
    meleeFxMs:clamp((+player.meleeFxUntil||0)-now,0,MELEE_ABILITY_VISUAL_MAX_MS),meleeFxAngle:+player.meleeFxAngle||0,
    meleeFxBlades:meleeAbilityVisualBlades(),meleeFxWallRecallSeq:Math.max(0,Math.floor(+player.meleeFxWallRecallSeq||0))});
}
function multideviceReceive(event,p,channel){
  const m=multidevice;if(!m||channel!==m.channel||!multideviceEnvelope(m,p,false,false)||p.from===m.selfId)return false;
  m.actors[p.from].lastSeen=Date.now();m.actors[p.from].missingSince=0;
  if(event==='ready'&&m.phase==='setup'){m.ready.add(p.from);if(m.selfId===m.hostId)multideviceHostBegin();return true;}
  if(event==='resume'){if(m.selfId===m.hostId)multidevicePublishControl();return true;}
  if(event==='control')return multideviceApplyControl(p);
  if(event==='abort'&&p.from===m.hostId){multideviceAbort(String(p.reason||'Match ended without a result.'),false);return true;}
  if(!multideviceEnvelope(m,p))return false;
  if(event==='state'){
    if(!multideviceAcceptActorState(m,p))return false;
    arenaApplyRemoteParryState(m.actors[p.from],p,now);
    arenaApplyRemoteMeleeAbilityState(m.actors[p.from],p,m.actors[p.from].loadout,now);return true;
  }
  if(event==='result'){
    if(!multideviceRoundResult(m,p))return false;
    resetRoundTransitionInput(!p.matchOver);bullets=[];grenades=[];balls=[];daggersOut=null;
    multideviceMirror();multideviceFinishLocal();return true;
  }
  if(event==='timeout_hp'){
    if(m.phase!=='timeout'||!m.timeoutHp||!Number.isFinite(p.hp)||p.hp<0||p.hp>MULTIDEVICE_HP)return false;
    if(m.timeoutHp.confirmed[p.from]===undefined)m.timeoutHp.confirmed[p.from]=p.hp;return true;
  }
  if(event==='hit'){
    if(p.to===m.selfId&&m.received.has(p.id)){
      multideviceSend('hit_result',m.received.get(p.id).reply);return false;
    }
    if(!multideviceDamageAllowed(m,p)||m.hitLedger.size>=4096&&!m.hitLedger.has(p.id))return false;
    if(!m.hitLedger.has(p.id))m.hitLedger.set(p.id,{from:p.from,to:p.to,dmg:p.dmg,kind:p.kind});
    return p.to===m.selfId?multideviceTakeHit(p):true;
  }
  if(event==='hit_result')return multideviceHitResult(p);
  if(m.phase!=='fight')return false;
  if(event==='shot'||event==='firework'||event==='melee')return multideviceRemoteVisual(event,p);
  if(event==='reflection')return multideviceRemoteReflection(p);
  if(event==='utility')return multideviceRemoteUtility(p);
  return false;
}
function multideviceRemoteVisual(event,p){
  const m=multidevice,actor=m.actors[p.from],id=String(p.id||'');
  if(actor.hp<=0||m.seen.has(id)||m.seen.size>=4096)return false;
  let visuals;
  if(event==='shot'){
    if(!remoteShotIdValid(id,p.from,1,m.round))return false;
    visuals=remoteShotBuild(p,actor,actor.loadout);if(!visuals)return false;
    for(const b of visuals)b.hostile=multideviceEnemies(m,m.selfId,p.from);
    m.visualShots.push(...visuals);if(m.visualShots.length>REMOTE_SHOT_QUEUE_MAX)m.visualShots.splice(0,m.visualShots.length-REMOTE_SHOT_QUEUE_MAX);
  }else if(event==='firework'){
    if(!remoteFireworkIdValid(id,p.from,1,m.round))return false;
    const visual=remoteFireworkBuild(p,actor,actor.loadout);if(!visual)return false;
    visual.hostile=multideviceEnemies(m,m.selfId,p.from);m.visualFireworks.push(visual);
    if(m.visualFireworks.length>REMOTE_FIREWORK_QUEUE_MAX)m.visualFireworks.shift();
  }else{
    if(!remoteMeleeIdValid(id,p.from,1,m.round)||!remoteMeleeWeaponOwned(actor.loadout,p.weapon)||
       !['angle','arc','range','duration'].every(k=>Number.isFinite(p[k]))||p.arc<.1||p.arc>TAU||p.range<15||p.range>220||
       p.duration<60||p.duration>400||Math.abs(p.angle)>TAU*1000)return false;
    Object.assign(actor,{swingT:now,swingA:p.angle,swingArc:p.arc,swingR:p.range,swingDur:p.duration,swingSide:p.side===-1?-1:1});
  }
  m.seen.add(id);actor.cur=p.weapon;actor.flash=now+55;return true;
}
function multideviceBroadcastShot(weaponId,spawned,firework=false){
  if(!multideviceCanAct())return false;const m=multidevice,event=firework?'firework':'shot';
  const id=m.selfId+':1:'+m.round+':'+event+':'+(++m.eventSeq),p=firework?
    remoteFireworkPacketFromProjectile(id,weaponId,spawned):remoteShotPacketFromBullets(id,weaponId,spawned);
  if(!p)return false;p.portalSeq=0;multideviceSend(event,p);return true;
}
function multideviceBroadcastMelee(weapon,angle,arc,range,duration,side){
  if(!multideviceCanAct())return false;const m=multidevice;
  multideviceSend('melee',{id:m.selfId+':1:'+m.round+':melee:'+(++m.eventSeq),weapon,angle,arc,range,duration,side});return true;
}
function multideviceRemoteReflection(p){
  const m=multidevice,actor=m.actors[p.from],root=m.hitLedger.get(String(p.rootHitId||''));
  if(!root||root.to!==p.from||root.kind==='parry'||m.seen.has(p.id)||m.seen.size>=4096||
     !remoteShotIdValid(p.id,p.from,1,m.round)||!['x','y','angle'].every(k=>Number.isFinite(p[k]))||
     Math.hypot(p.x-actor.tx,p.y-actor.ty)>210||Math.abs(p.angle)>TAU*1000)return false;
  m.seen.add(p.id);m.visualShots.push({x:p.x,y:p.y,ox:p.x,oy:p.y,vx:Math.cos(p.angle)*22,vy:Math.sin(p.angle)*22,
    life:900,dist:0,bounce:0,wv:false,phaseWalls:0,weapon:'twinsai',ownerId:p.from,hostile:multideviceEnemies(m,m.selfId,p.from),
    col:'#bfe8ff',dangerRadius:8});return true;
}
function multideviceHit(target,dmg,kind='shot',meta={}){
  const m=multidevice;if(!multideviceCanAct()||!target||!multideviceEnemies(m,m.selfId,target.id)||target.hp<=0)return false;
  const damage=Math.min(MULTIDEVICE_HP,Math.max(0,+dmg||0));if(!damage)return false;
  if(kind==='parry'){
    const received=m.received.get(String(meta.rootHitId||''));
    if(!received||received.kind==='parry'||received.dmg!==damage||meta.parryDepth!==1)return false;
  }
  const p={id:m.selfId+':'+m.round+':hit:'+(++m.eventSeq),to:target.id,dmg:damage,kind,
    rootHitId:kind==='parry'?String(meta.rootHitId):undefined,parryDepth:kind==='parry'?1:undefined};
  if(m.sent.size>=4096)return false;m.sent.set(p.id,{packet:p,at:Date.now(),retry:Date.now()+180,tries:0});
  m.hitLedger.set(p.id,{from:m.selfId,to:target.id,dmg:damage,kind});
  multideviceSend('hit',p);return p.id;
}
function multideviceTakeHit(p){
  const m=multidevice;if(!multideviceDamageAllowed(m,p)||p.to!==m.selfId||Date.now()>=m.roundEndAt)return false;
  const prior=m.received.get(p.id);if(prior){multideviceSend('hit_result',prior.reply);return false;}
  if(m.received.size>=4096||player.hp<=0)return false;
  if(p.kind==='parry'){
    const original=m.hitLedger.get(String(p.rootHitId||''));
    if(!original||original.to!==p.from||original.kind==='parry'||original.dmg!==p.dmg||p.parryDepth!==1)return false;
  }
  const parried=now<parryUntil&&now>=parryUntil-TWIN_SAI_PARRY_MS&&
    !['melee','knife','hammer','chainsaw','bdaggers','utility_grenade','utility_redball','utility_beachball','firework'].includes(p.kind);
  let damage=p.dmg;
  if(!parried&&arenaUtilityFrozen()){clearPlayerFreezerFreeze();damage*=.5;}
  const dealt=parried?0:Math.min(player.hp,damage);
  const reply={id:p.id,to:p.from,dealt,parried,hp:Math.max(0,player.hp-dealt)};
  m.received.set(p.id,{dmg:p.dmg,kind:p.kind,reply});
  if(!parried){cancelMedHeal();damagePlayerHp(damage);player.hurtFlash=1;player.hurtCd=240;addShake(4);sfx('hurt');}
  else if(p.kind!=='parry'){
    const reflection=spawnTwinSaiReflection(player.x,player.y,p.dmg,{rootHitId:p.id,parryDepth:1,online:true});
    if(reflection)multideviceSend('reflection',{id:m.selfId+':1:'+m.round+':shot:'+(++m.eventSeq),rootHitId:p.id,
      x:reflection.x,y:reflection.y,angle:Math.atan2(reflection.vy,reflection.vx)});
  }
  m.actors[m.selfId].hp=Math.max(0,player.hp);multideviceSend('hit_result',reply);
  if(player.hp<=0)multideviceLocalKO();return true;
}
function multideviceHitResult(p){
  const m=multidevice,actor=m.actors[p.from];
  if(!actor||!Number.isFinite(p.hp)||p.hp<0||p.hp>MULTIDEVICE_HP||!Number.isFinite(p.dealt)||p.dealt<0||p.dealt>MULTIDEVICE_HP||typeof p.parried!=='boolean')return false;
  const pending=m.sent.get(p.id);
  if(p.to===m.selfId){
    if(!pending||pending.packet.to!==p.from||pending.acknowledged||p.dealt>pending.packet.dmg||p.parried&&p.dealt!==0)return false;
    pending.acknowledged=true;
    // Keep the original sent event for validating a later aimed reflection.
    if(!p.parried&&p.dealt>0)addDamageNumber(actor,p.dealt,pending.packet.kind==='parry');
  }
  actor.hp=Math.min(actor.hp,p.hp);return true;
}
function multideviceLocalKO(){
  const m=multidevice;if(!isMultideviceArena()||m.phase!=='fight')return false;
  player.hp=0;m.actors[m.selfId].hp=0;resetHeldGameplayInput();
  m.syncAt=0;multideviceSyncTick(0);waveMsg='ELIMINATED · WATCH YOUR TEAM';waveMsgT=now+2500;return true;
}
function multideviceBroadcastUtility(key,data={}){
  const m=multidevice;if(!multideviceCanAct()||casualArenaUtilityKey(key,true)!==key||loadout.utility!==key)return false;
  const id=m.selfId+':1:'+m.round+':utility:'+(++m.eventSeq);
  multideviceSend('utility',Object.assign({},data,{id,utility:key}));return id;
}
function multideviceRemoteUtility(p){
  const m=multidevice,a=m.actors[p.from],key=String(p.utility||''),clock=Date.now();
  if(!a||a.hp<=0||!arenaUtilityIdValid(p.id,p.from,1,m.round)||m.seen.has(p.id)||m.seen.size>=4096||
     casualArenaUtilityKey(key)!==key||a.loadout.utility!==key||clock<(m.utilityReady[p.from]||0))return false;
  const hostile=multideviceEnemies(m,m.selfId,p.from),x=+p.x,y=+p.y;
  if(key!=='medkit'&&(!Number.isFinite(x)||!Number.isFinite(y)||x<492||x>1908||y<372||y>1428||Math.hypot(x-a.tx,y-a.ty)>210))return false;
  if((key==='grenade'||key==='freezer')&&(!Number.isFinite(+p.angle)||Math.abs(p.angle)>TAU*1000))return false;
  if((key==='redball'||key==='beachball')&&(!Number.isFinite(+p.vx)||!Number.isFinite(+p.vy)||Math.hypot(p.vx,p.vy)>8))return false;
  if(key==='medkit'){
    a.healUntil=clock+10000;burst(a.x,a.y,'#5ec46a',12,4);
  }else if(key==='grenade')grenades.push({x,y,vx:Math.cos(p.angle)*14,vy:Math.sin(p.angle)*14,t:now+950,remoteUtility:true,hostile,arenaUtility:true});
  else if(key==='freezer'){
    const projectile=launchFreezer(p.angle,{x,y,remoteUtility:true,hostile,arenaUtility:true});projectile.multideviceAlly=!hostile;
  }else{
    const fire=key==='beachball';balls.push({x,y,vx:+p.vx,vy:+p.vy,life:3000,hitT:0,taunt:fire?0:750,flee:fire,fire,dmg:8,gen:0,
      splitT:fire?now+1000:0,remoteUtility:true,hostile,arenaUtility:true,utilitySeed:p.id});
  }
  m.seen.add(p.id);m.utilityReady[p.from]=clock+Math.max(1000,Math.min(120000,+UTILITIES[key].cd||1000))-250;return true;
}
function multideviceWallTick(wall){
  const m=multidevice;if(!isMultideviceArena())return;
  const clock=Date.now(),elapsed=m.wallAt?Math.min(250,Math.max(0,wall-m.wallAt)):0;m.wallAt=wall;
  // Human matches cannot pause their defenses by opening a menu or hiding
  // the tab. Keep ability/reload/projectile clocks on the existing round's
  // wall-time anchor; only movement waits for actual local input/simulation.
  if(m.started&&m.phase!=='match_end'&&Number.isFinite(m.gameClockAnchor))
    now=Math.max(now,m.gameClockAnchor+Math.max(0,clock-m.gameWallAnchor));
  if(m.phase==='setup'){
    if(clock-m.createdAt>MULTIDEVICE_SETUP_MS){multideviceAbort('Not all players connected. Match cancelled without a result.');return;}
    if(m.connected&&clock>=m.readyAt){m.readyAt=clock+1500;m.ready.add(m.selfId);multideviceSend('ready');if(m.selfId===m.hostId)multideviceHostBegin();}
  }
  if(m.phase==='countdown'&&clock>=m.roundStartAt){m.phase='fight';waveMsg='FIGHT';waveMsgT=now+800;}
  if(m.phase==='fight'&&clock>=m.roundEndAt){
    m.phase='timeout';m.timeoutHp={at:clock,confirmed:{[m.selfId]:Math.max(0,player.hp)},
      fallback:Object.fromEntries(Object.values(m.actors).map(a=>[a.id,a.id===m.selfId?Math.max(0,player.hp):a.hp]))};
  }
  if(m.phase==='timeout'&&m.timeoutHp){
    if(clock>=(m.timeoutSendAt||0)){m.timeoutSendAt=clock+200;multideviceSend('timeout_hp',{hp:m.timeoutHp.confirmed[m.selfId]});}
    if(m.selfId===m.hostId&&(Object.keys(m.timeoutHp.confirmed).length===m.roster.length||clock-m.timeoutHp.at>=1500)){
      const hp=Object.assign({},m.timeoutHp.fallback,m.timeoutHp.confirmed);multideviceHostResolve(multideviceRoundWinner(m,true,hp).winner,'timeout');
    }
  }
  if(m.selfId===m.hostId&&m.phase==='fight'){
    m.actors[m.selfId].hp=Math.max(0,player.hp);
    if(Object.values(m.actors).some(a=>a.id!==m.selfId&&clock-a.lastSeen>MULTIDEVICE_GRACE_MS)){
      multideviceAbort('A player did not reconnect. Match cancelled; no ranked change.');return;
    }
    const result=multideviceRoundWinner(m);if(result.resolved)multideviceHostResolve(result.winner);
  }
  if(m.selfId!==m.hostId&&m.started&&m.phase!=='match_end'&&clock-Math.max(m.hostSeenAt||m.createdAt,m.actors[m.hostId].lastSeen)>MULTIDEVICE_GRACE_MS){
    multideviceAbort('Host did not reconnect. Match cancelled; no ranked change.');return;
  }
  if(m.phase==='round_end'&&m.selfId===m.hostId&&clock>=m.nextRoundAt)multideviceHostBegin();
  if(m.selfId===m.hostId&&m.started&&clock>=m.controlAt){m.controlAt=clock+700;multidevicePublishControl();}
  if(m.started&&m.selfId!==m.hostId&&clock>=m.controlAt){m.controlAt=clock+2000;multideviceSend('resume');}
  if(m.phase==='fight'){
    stepRemoteShotVisuals(m.visualShots,elapsed);stepRemoteFireworkVisuals(m.visualFireworks,elapsed);
    for(const pending of m.sent.values())if(!pending.acknowledged&&pending.tries<3&&clock>=pending.retry){
      pending.tries++;pending.retry=clock+400;multideviceSend('hit',pending.packet);
    }
  }
  const alpha=1-Math.pow(.78,elapsed/16.667);
  for(const actor of Object.values(m.actors))if(actor.id!==m.selfId){actor.x+=(actor.tx-actor.x)*alpha;actor.y+=(actor.ty-actor.y)*alpha;}
  multideviceMirror();
}
async function multideviceLaunch(config){
  if(!sb||!authUser||!arenaLoadoutReady())return false;
  if(multidevice&&multidevice.matchId===String(config&&config.matchId))return true;
  const next=multideviceCreate(config,String(authUser.id));if(!next)return false;
  for(const actor of Object.values(next.actors)){const kit=arenaRemoteLoadout(actor.loadout);if(!kit)return false;actor.loadout=kit;}
  if(multidevice)multideviceLeave('',false);
  if(arena&&(arena.active||arena.matchChannel||arena.queueChannel))leaveArena('',false);
  next.savedLoadout=Object.assign({},loadout);multidevice=next;
  arena=freshArena(next.status);arena.mode='multidevice';arena.room=next.matchId;arena.hostId=next.hostId;arena.matchEpoch=1;
  state='select';selPage='multidevice';menuOpen=false;practiceMode=null;
  const channel=sb.channel('oz-duel:'+next.matchId,{config:{private:true,broadcast:{self:false,ack:true},presence:{key:next.selfId}}});
  next.channel=channel;arena.matchChannel=channel;
  for(const event of ['ready','resume','control','abort','state','result','timeout_hp','hit','hit_result','shot','firework','melee','reflection','utility'])
    channel.on('broadcast',{event},({payload})=>multideviceReceive(event,payload,channel));
  channel.on('presence',{event:'sync'},()=>{
    if(multidevice!==next)return;
    // Presence is advisory. A sync missing one tab never awards an instant
    // win; actual traffic and a full grace interval determine absence.
    for(const member of arenaPresenceList(channel))if(next.actors[String(member.id)])next.actors[String(member.id)].missingSince=0;
  });
  channel.subscribe(async status=>{
    if(multidevice!==next)return;
    if(status==='SUBSCRIBED'){
      next.connected=false;next.status='CONFIRMING SECURE MATCH START…';
      if(typeof duelServiceAcknowledgeStart!=='function'||!await duelServiceAcknowledgeStart(next.matchId)){
        if(multidevice===next)multideviceAbort('Secure match start could not be confirmed. Please queue again.');return;
      }
      if(multidevice!==next)return;
      next.connected=true;next.status='WAITING FOR ALL '+next.roster.length+' PLAYERS';
      try{await channel.track({id:next.selfId,matchId:next.matchId});}catch(e){}
      if(multidevice!==next)return;next.readyAt=0;multideviceSend('resume');
    }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
      next.connected=false;next.status='RECONNECTING · THE MATCH CONTINUES';
    }
  });
  next.timer=setInterval(()=>{if(multidevice===next){multideviceWallTick(performance.now());multideviceSyncTick(performance.now());}},100);
  return true;
}
function multideviceAbort(message,broadcast=true){
  const m=multidevice;if(!m)return false;
  if(broadcast&&m.selfId===m.hostId)multideviceSend('abort',{reason:String(message||'Match cancelled.').slice(0,180)});
  if(typeof duelServiceAbortMatch==='function')void duelServiceAbortMatch(m.matchId);
  return multideviceLeave(message||'MATCH CANCELLED · NO RANK CHANGE',false);
}
function multideviceLeave(message='',toHub=false){
  const m=multidevice;if(!m)return false;
  if(m.timer)clearInterval(m.timer);multidevice=null;
  try{if(m.channel&&sb)void sb.removeChannel(m.channel);}catch(e){}
  if(m.savedLoadout)loadout=Object.assign({},m.savedLoadout);
  practiceMode=null;arena=freshArena(message||'MULTI-DEVICE DUELS');state='select';selPage=toHub?'hub':'multidevice';
  menuOpen=false;aiming=false;rmbAim=false;resetHeldGameplayInput();
  bullets=[];ebullets=[];grenades=[];balls=[];pearls=[];flames=[];freezeFx=[];daggersOut=null;parryUntil=0;playerFrozenUntil=0;
  return true;
}
