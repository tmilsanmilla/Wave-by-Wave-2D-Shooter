"use strict";

// Completed local CPU matches and the network Party CPU host contribute small,
// aggregate tactical signals. Party members and non-host devices never submit.
// No email, username, loadout, input history, or raw position trail is stored.
// The server derives auth.uid() and de-duplicates the stable event UUID.
const AI_TRAINING_QUEUE_KEY='oz_ai_training_queue_v1';
const AI_TRAINING_INSTALL_KEY='oz_ai_training_install_v1';
const AI_TRAINING_QUEUE_MAX=64,AI_TRAINING_TTL_MS=30*24*60*60*1000;
const AI_TRAINING_RETRY_MS=Object.freeze([2000,10000,30000,120000]);
const AI_TRAINING_SIGNAL_KEYS=Object.freeze([
  'bot_shots','bot_hits','bot_damage_dealt','bot_damage_taken','bot_distance_px','bot_wall_contacts',
  'bot_stuck_recoveries','bot_path_replans','bot_portal_uses','bot_tnt_avoidances','bot_tnt_detonations'
]);
const AI_TRAINING_SIGNAL_CAPS=Object.freeze({
  bot_shots:100000,bot_hits:100000,bot_damage_dealt:1000000,bot_damage_taken:1000000,
  bot_distance_px:100000000,bot_wall_contacts:100000,bot_stuck_recoveries:100000,
  bot_path_replans:100000,bot_portal_uses:100000,bot_tnt_avoidances:100000,bot_tnt_detonations:100000
});

let aiTrainingQueue=[],aiTrainingQueueLoaded=false,aiTrainingFlushPromise=null,aiTrainingRetryTimer=null,aiTrainingRetryLevel=0;
let aiTrainingFlushRequested=false;
let aiTrainingInstallationCache='',aiTrainingLastStatus='IDLE',aiTrainingLastSyncAt=0,aiTrainingRejectedCount=0;
let aiTrainingSummaryRows=[],aiTrainingSummaryState='idle',aiTrainingSummaryFetchedAt=0,aiTrainingSyncEventsBound=false;

function aiTrainingUuid(value){
  value=String(value||'').toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)?value:'';
}
function aiTrainingOwner(){return authUser&&aiTrainingUuid(authUser.id)||'guest';}
function aiTrainingInstallationId(){
  if(aiTrainingUuid(aiTrainingInstallationCache))return aiTrainingInstallationCache;
  try{aiTrainingInstallationCache=aiTrainingUuid(localStorage.getItem(AI_TRAINING_INSTALL_KEY));}catch(e){aiTrainingInstallationCache='';}
  if(!aiTrainingInstallationCache){
    aiTrainingInstallationCache=typeof createBotLadderMatchId==='function'?aiTrainingUuid(createBotLadderMatchId()):'';
    if(aiTrainingInstallationCache)try{localStorage.setItem(AI_TRAINING_INSTALL_KEY,aiTrainingInstallationCache);}catch(e){}
  }
  return aiTrainingInstallationCache;
}
function emptyAiTrainingSignals(){return Object.fromEntries(AI_TRAINING_SIGNAL_KEYS.map(key=>[key,0]));}
function normalizeAiTrainingSignals(raw,strict=true){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(Object.keys(raw).some(key=>!AI_TRAINING_SIGNAL_KEYS.includes(key)))return null;
  const out=emptyAiTrainingSignals();
  for(const key of AI_TRAINING_SIGNAL_KEYS){
    if(!Object.prototype.hasOwnProperty.call(raw,key))continue;
    const n=raw[key],cap=AI_TRAINING_SIGNAL_CAPS[key];
    if(strict&&(!Number.isInteger(n)||n<0||n>cap))return null;
    if(!strict){const value=Number(n);out[key]=Number.isFinite(value)?Math.min(cap,Math.max(0,Math.round(value))):0;}
    else out[key]=n;
  }
  if(out.bot_hits>out.bot_shots)return null;
  return out;
}
function normalizeAiTrainingQueueEntry(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)return null;
  const eventId=typeof raw.eventId==='string'?aiTrainingUuid(raw.eventId):'',installationId=typeof raw.installationId==='string'?aiTrainingUuid(raw.installationId):'',
    owner=raw.owner==='guest'?'guest':typeof raw.owner==='string'?aiTrainingUuid(raw.owner):'',mode=raw.mode,modelId=raw.modelId,
    allowedModel=typeof BOT_MODEL_RELEASES!=='undefined'&&BOT_MODEL_RELEASES.some(model=>model.id===modelId),
    mapId=raw.mapId,allowedMap=typeof ARENA_MAP_IDS!=='undefined'?ARENA_MAP_IDS.includes(mapId):['arena','dimension','construction'].includes(mapId),
    finishedMs=typeof raw.clientFinishedAt==='string'?Date.parse(raw.clientFinishedAt):NaN,queuedAt=raw.queuedAt,clock=Date.now(),
    wholeFields=['difficulty','playerScore','botScore','rounds','durationMs','queuedAt'];
  if(!eventId||!installationId||!owner||typeof mode!=='string'||!['ai1v1','ai2v2','party2v2'].includes(mode)||typeof modelId!=='string'||!allowedModel||
     typeof mapId!=='string'||!allowedMap||typeof raw.won!=='boolean'||wholeFields.some(key=>!Number.isInteger(raw[key]))||
     !Number.isFinite(finishedMs)||new Date(finishedMs).toISOString()!==raw.clientFinishedAt||queuedAt<=0||
     finishedMs<clock-AI_TRAINING_TTL_MS||queuedAt<clock-AI_TRAINING_TTL_MS||finishedMs>clock+300000||queuedAt>clock+300000||finishedMs>queuedAt+300000)return null;
  if(raw.difficulty<0||raw.difficulty>4||raw.playerScore<0||raw.playerScore>5||raw.botScore<0||raw.botScore>5||
     (raw.won?(raw.playerScore!==5||raw.botScore>4):(raw.botScore!==5||raw.playerScore>4))||
     raw.rounds<1||raw.rounds<raw.playerScore+raw.botScore||raw.rounds>50||raw.durationMs<5000||raw.durationMs>3600000)return null;
  if(mode==='party2v2'&&(modelId!=='apex-v5'||raw.difficulty!==2||mapId!=='arena'))return null;
  const signals=normalizeAiTrainingSignals(raw.signals,true);if(!signals)return null;
  return {v:1,owner,eventId,installationId,modelId,mode,difficulty:raw.difficulty,mapId,won:raw.won,
    playerScore:raw.playerScore,botScore:raw.botScore,rounds:raw.rounds,durationMs:raw.durationMs,
    clientFinishedAt:raw.clientFinishedAt,signals,queuedAt};
}
function saveAiTrainingQueue(entries=aiTrainingQueue){
  const nowMs=Date.now(),seen=new Set(),clean=[];
  for(const raw of Array.isArray(entries)?entries:[]){
    const entry=normalizeAiTrainingQueueEntry(raw);if(!entry||nowMs-entry.queuedAt>AI_TRAINING_TTL_MS||entry.queuedAt>nowMs+300000||seen.has(entry.eventId))continue;
    seen.add(entry.eventId);clean.push(entry);
  }
  clean.sort((a,b)=>a.queuedAt-b.queuedAt||a.eventId.localeCompare(b.eventId));
  aiTrainingQueue=clean.slice(-AI_TRAINING_QUEUE_MAX);aiTrainingQueueLoaded=true;
  try{localStorage.setItem(AI_TRAINING_QUEUE_KEY,JSON.stringify(aiTrainingQueue));}catch(e){}
  return aiTrainingQueue.slice();
}
function loadAiTrainingQueue(force=false){
  if(aiTrainingQueueLoaded&&!force)return aiTrainingQueue.slice();
  let raw=[];try{const parsed=JSON.parse(localStorage.getItem(AI_TRAINING_QUEUE_KEY)||'[]');if(Array.isArray(parsed))raw=parsed;}catch(e){}
  return saveAiTrainingQueue(raw);
}
function enqueueAiTrainingEvent(raw){
  const entry=normalizeAiTrainingQueueEntry(raw);if(!entry)return false;
  const queue=loadAiTrainingQueue();if(queue.some(item=>item.eventId===entry.eventId))return true;
  queue.push(entry);saveAiTrainingQueue(queue);aiTrainingLastStatus='QUEUED';return true;
}
function aiTrainingQueueCount(owner=null){
  const queue=loadAiTrainingQueue();return owner==null?queue.length:queue.filter(entry=>entry.owner===owner).length;
}
function initializeAiTrainingMatch(match){
  if(!match||typeof match!=='object')return false;
  const mode=String(match.botLadderMode||''),partyHost=mode==='party2v2'&&match.local!==true&&
      typeof partyCpuIsHost==='function'&&partyCpuIsHost(),
    eligible=!match.botAdminTest&&(mode==='ai1v1'||(mode==='ai2v2'&&match.local===true)||partyHost),
    eventId=eligible?aiTrainingUuid(match.botLadderMatchId)||(typeof createBotLadderMatchId==='function'?aiTrainingUuid(createBotLadderMatchId()):''):'';
  match.aiTrainingEligible=!!(eligible&&eventId&&aiTrainingInstallationId());match.aiTrainingRecorded=false;
  match.aiTrainingEventId=eventId;match.aiTrainingOwner=aiTrainingOwner();match.aiTrainingInstallationId=aiTrainingInstallationId();
  match.aiTrainingStartedAt=Date.now();match.aiTrainingSignals=emptyAiTrainingSignals();
  match.aiTrainingSyncStatus=match.aiTrainingEligible?'collecting':'excluded';return match.aiTrainingEligible;
}
function aiTrainingSetEventStatus(eventId,status){
  eventId=aiTrainingUuid(eventId);if(!eventId)return false;let changed=false;
  for(const match of [typeof arena!=='undefined'?arena:null,typeof partyCpuMatch!=='undefined'?partyCpuMatch:null]){
    if(match&&aiTrainingUuid(match.aiTrainingEventId)===eventId){match.aiTrainingSyncStatus=String(status||'queued');changed=true;}
  }
  return changed;
}
function aiTrainingMatchStatusText(match,compact=false){
  if(!match||!match.aiTrainingEligible||!match.aiTrainingRecorded||match.botAdminTest)return '';
  const status=String(match.aiTrainingSyncStatus||'queued');
  if(status==='synced')return 'AI MATCH DATA · SYNCED';
  if(status==='rejected')return 'INVALID MATCH DATA DROPPED SAFELY';
  if(compact)return 'AI MATCH DATA · QUEUED FOR SYNC';
  return 'AI MATCH DATA · QUEUED ON THIS DEVICE · WILL SYNC ONLINE';
}
function recordAiTrainingSignal(match,key,amount=1){
  if(!match||!match.aiTrainingEligible||!AI_TRAINING_SIGNAL_KEYS.includes(String(key)))return false;
  if(!match.aiTrainingSignals||typeof match.aiTrainingSignals!=='object')match.aiTrainingSignals=emptyAiTrainingSignals();
  const n=Number(amount);if(!Number.isFinite(n)||n<=0)return false;
  match.aiTrainingSignals[key]=Math.min(AI_TRAINING_SIGNAL_CAPS[key],Math.max(0,(+match.aiTrainingSignals[key]||0)+n));return true;
}
function aiTrainingMatchForBot(bot){
  if(!bot)return null;
  if(typeof isBotArena==='function'&&isBotArena()&&arena&&arena.opponent===bot)return arena;
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()&&bot.team==='B'&&partyCpuMatch.bots.includes(bot))return partyCpuMatch;
  if(typeof isPartyCpuMatch==='function'&&isPartyCpuMatch()&&typeof partyCpuIsHost==='function'&&partyCpuIsHost()&&
     bot.team==='B'&&partyCpuMatch.bots.includes(bot))return partyCpuMatch;
  return null;
}
function recordAiTrainingBotSignal(bot,key,amount=1){return recordAiTrainingSignal(aiTrainingMatchForBot(bot),key,amount);}
function recordAiTrainingBotSignalById(botId,key,amount=1){
  botId=String(botId||'');
  if(typeof isBotArena==='function'&&isBotArena()&&arena&&arena.opponent&&String(arena.opponent.id)===botId)return recordAiTrainingSignal(arena,key,amount);
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()){
    const bot=partyCpuMatch.bots.find(item=>item.team==='B'&&String(item.id)===botId);if(bot)return recordAiTrainingSignal(partyCpuMatch,key,amount);
  }
  if(typeof isPartyCpuMatch==='function'&&isPartyCpuMatch()&&typeof partyCpuIsHost==='function'&&partyCpuIsHost()){
    const bot=partyCpuMatch.bots.find(item=>item.team==='B'&&String(item.id)===botId);if(bot)return recordAiTrainingSignal(partyCpuMatch,key,amount);
  }
  return false;
}
function completedAiTrainingEntry(won,match){
  if(!match||!match.aiTrainingEligible||match.botAdminTest)return null;
  const mode=String(match.botLadderMode||''),team=mode==='ai2v2'||mode==='party2v2',scores=match.scores||{},
    playerScore=team?+scores.allies||0:+scores[LOCAL_DUEL_PLAYER]||0,botScore=team?+scores.cpus||0:+scores[LOCAL_DUEL_BOT]||0,
    finishedAt=Date.now(),mapId=String(match.mapId||(typeof arena!=='undefined'&&arena&&arena.mapId)||'arena');
  const signals=normalizeAiTrainingSignals(match.aiTrainingSignals,false);if(!signals)return null;
  return normalizeAiTrainingQueueEntry({v:1,owner:match.aiTrainingOwner,eventId:match.aiTrainingEventId,installationId:match.aiTrainingInstallationId,
    modelId:match.botModelId,mode,difficulty:match.botDifficulty,mapId,won:!!won,playerScore,botScore,
    rounds:Math.min(50,Math.max(Math.floor(+match.round||0),playerScore+botScore,1)),
    durationMs:Math.min(3600000,Math.max(5000,Math.round(finishedAt-(+match.aiTrainingStartedAt||finishedAt)))),
    clientFinishedAt:new Date(finishedAt).toISOString(),signals,queuedAt:finishedAt});
}
function recordCompletedAiTrainingMatch(won,match){
  if(!match||match.aiTrainingRecorded)return false;match.aiTrainingRecorded=true;
  const entry=completedAiTrainingEntry(won,match);if(!entry){match.aiTrainingSyncStatus='rejected';return false;}
  const prior=flushAiTrainingQueue();if(!enqueueAiTrainingEvent(entry)){match.aiTrainingSyncStatus='rejected';return false;}match.aiTrainingSyncStatus='queued';
  void Promise.resolve(prior).finally(()=>flushAiTrainingQueue());return true;
}
function aiTrainingRpcArgs(entry){
  return {p_event_id:entry.eventId,p_installation_id:entry.installationId,p_model_id:entry.modelId,p_mode:entry.mode,
    p_difficulty:entry.difficulty,p_map_id:entry.mapId,p_won:entry.won,p_player_score:entry.playerScore,p_bot_score:entry.botScore,
    p_rounds:entry.rounds,p_duration_ms:entry.durationMs,p_client_finished_at:entry.clientFinishedAt,p_signals:entry.signals};
}
function clearAiTrainingRetry(){if(aiTrainingRetryTimer){clearTimeout(aiTrainingRetryTimer);aiTrainingRetryTimer=null;}}
function scheduleAiTrainingRetry(rateLimited=false){
  clearAiTrainingRetry();if(!loadAiTrainingQueue().some(entry=>entry.owner===aiTrainingOwner()))return false;
  const index=Math.min(aiTrainingRetryLevel,AI_TRAINING_RETRY_MS.length-1),delay=rateLimited?Math.max(30000,AI_TRAINING_RETRY_MS[index]):AI_TRAINING_RETRY_MS[index];
  aiTrainingRetryLevel=Math.min(aiTrainingRetryLevel+1,AI_TRAINING_RETRY_MS.length-1);
  aiTrainingRetryTimer=setTimeout(()=>{aiTrainingRetryTimer=null;void flushAiTrainingQueue();},delay);return true;
}
async function flushAiTrainingQueue(){
  if(aiTrainingFlushPromise){aiTrainingFlushRequested=true;return aiTrainingFlushPromise;}
  let request;
  request=(async()=>{
    saveAiTrainingQueue(loadAiTrainingQueue());const owner=aiTrainingOwner();let retryScheduled=false;
    if(!sb||typeof sb.rpc!=='function'||(typeof navigator!=='undefined'&&navigator.onLine===false)){
      aiTrainingLastStatus='QUEUED OFFLINE';for(const entry of aiTrainingQueue.filter(item=>item.owner===owner))aiTrainingSetEventStatus(entry.eventId,'queued');
      scheduleAiTrainingRetry();return {sent:0,queued:aiTrainingQueueCount(owner)};
    }
    let sent=0;
    while(true){
      if(aiTrainingOwner()!==owner){aiTrainingFlushRequested=true;break;}
      const entry=loadAiTrainingQueue().find(item=>item.owner===owner);if(!entry)break;
      try{
        const {data,error}=await sb.rpc('submit_outpost_zero_ai_training_match',aiTrainingRpcArgs(entry));if(error)throw error;
        if(aiTrainingOwner()!==owner){aiTrainingFlushRequested=true;break;}
        const row=Array.isArray(data)?data[0]||{}:data||{},reason=String(row.reason||'');
        if(row.accepted===true||reason==='accepted'||reason==='duplicate'){
          aiTrainingSetEventStatus(entry.eventId,'synced');
          saveAiTrainingQueue(aiTrainingQueue.filter(item=>item.eventId!==entry.eventId));sent++;aiTrainingRetryLevel=0;
          aiTrainingLastStatus=reason==='duplicate'?'SYNCED · DUPLICATE SAFE':'SYNCED';aiTrainingLastSyncAt=Date.now();continue;
        }
        if(reason==='rate_limited'){aiTrainingSetEventStatus(entry.eventId,'queued');aiTrainingLastStatus='QUEUED · RATE LIMITED';retryScheduled=scheduleAiTrainingRetry(true);break;}
        if(reason==='duplicate_conflict'||reason.startsWith('invalid_')){
          aiTrainingSetEventStatus(entry.eventId,'rejected');
          saveAiTrainingQueue(aiTrainingQueue.filter(item=>item.eventId!==entry.eventId));aiTrainingRejectedCount++;
          aiTrainingLastStatus='DROPPED INVALID MATCH DATA';continue;
        }
        aiTrainingSetEventStatus(entry.eventId,'queued');aiTrainingLastStatus='QUEUED · SERVER RETRY';retryScheduled=scheduleAiTrainingRetry();break;
      }catch(e){aiTrainingSetEventStatus(entry.eventId,'queued');aiTrainingLastStatus='QUEUED · NETWORK RETRY';retryScheduled=scheduleAiTrainingRetry();break;}
    }
    const queued=aiTrainingQueueCount(owner);
    if(!queued&&!retryScheduled&&aiTrainingOwner()===owner){clearAiTrainingRetry();aiTrainingRetryLevel=0;}
    return {sent,queued};
  })();
  aiTrainingFlushPromise=request;
  try{return await request;}finally{
    if(aiTrainingFlushPromise===request)aiTrainingFlushPromise=null;
    const again=aiTrainingFlushRequested;aiTrainingFlushRequested=false;
    if(again)Promise.resolve().then(()=>flushAiTrainingQueue());
  }
}
function bindAiTrainingSyncEvents(){
  if(aiTrainingSyncEventsBound)return false;aiTrainingSyncEventsBound=true;loadAiTrainingQueue();aiTrainingInstallationId();
  if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('online',()=>{aiTrainingRetryLevel=0;clearAiTrainingRetry();void flushAiTrainingQueue();});
  return true;
}
async function refreshAiTrainingSummary(force=false){
  if(!isMainAdmin())return [];
  if(!sb||typeof sb.rpc!=='function'){aiTrainingSummaryState='offline';return aiTrainingSummaryRows.slice();}
  if(!force&&aiTrainingSummaryFetchedAt&&Date.now()-aiTrainingSummaryFetchedAt<30000)return aiTrainingSummaryRows.slice();
  aiTrainingSummaryState='syncing';
  try{
    const {data,error}=await sb.rpc('list_outpost_zero_ai_training_summary');if(error)throw error;
    aiTrainingSummaryRows=(Array.isArray(data)?data:[]).filter(row=>BOT_MODEL_RELEASES.some(model=>model.id===String(row&&row.model_id||'')));
    aiTrainingSummaryFetchedAt=Date.now();aiTrainingSummaryState='ready';
  }catch(e){aiTrainingSummaryState='offline';}
  return aiTrainingSummaryRows.slice();
}
function aiTrainingModelSummary(modelId){return aiTrainingSummaryRows.find(row=>String(row&&row.model_id||'')===String(modelId||''))||null;}
function aiTrainingCompactNumber(value){
  const n=Math.max(0,Math.floor(+value||0));return n>=1000000?(n/1000000).toFixed(n>=10000000?0:1)+'M':n>=1000?(n/1000).toFixed(n>=10000?0:1)+'K':String(n);
}
function aiTrainingAdminStatusText(){
  const cloud=aiTrainingSummaryRows.reduce((sum,row)=>sum+Math.max(0,Math.floor(+row.matches||0)),0),queued=aiTrainingQueueCount();
  return 'MATCH EVIDENCE · CLOUD '+(aiTrainingSummaryState==='ready'?aiTrainingCompactNumber(cloud):String(aiTrainingSummaryState).toUpperCase())+
    ' · THIS DEVICE QUEUED '+queued+(aiTrainingLastSyncAt?' · LAST SYNC OK':'');
}
