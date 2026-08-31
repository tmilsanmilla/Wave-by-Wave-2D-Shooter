import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const administration=read('js/administration.js');
const persistence=read('js/persistence.js');
const state=read('js/state.js');
const gameplay=read('js/gameplay.js');
const combat=read('js/combat.js');
const ai=read('js/ai.js');
const online=read('js/online.js');
const party=read('js/party.js');
const networking=read('js/networking.js');
const loop=read('js/loop.js');
const ui=read('js/ui.js');
const index=fs.readFileSync(path.join(root,'..','index.html'),'utf8');

function between(source,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`missing source range: ${start} ... ${end}`);
  return source.slice(from,to);
}

const definitions=between(administration,'const DAILY_TASK_SCHEMA_VERSION=2;','function saveMetaLocal');
const progressFunctions=between(persistence,'function dailyTaskGameplayEligible()','const LOCKED_KEYS');
const arenaHelpers=between(state,'function arenaResetDailyTaskTracking','arena=freshArena');
const context=vm.createContext({console});
vm.runInContext(`
  let dailyTasks=[],tasksDate='day-a',gems=0,testMode=false,sb={},authUser={id:'player'};
  let practiceMode=null;
  let profileLoaded=true,profileOwnerUserId='player',dailyEndlessTaskOwner='player',pendingDailyTaskEvents=Object.create(null),
    pendingDailyTaskOwner='player',pendingDailyTaskDay='day-a',dailyTaskBatchDepth=0;
  let unrankedRun=false,adminUsed=false,waveMsg='',waveMsgT=0,now=1000,saves=0,currentDay='day-a';
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function todayIndex(){return currentDay;}
  function saveMeta(){saves++;}
  function sfx(){}
  function gemRewardsEnabled(){return !testMode&&(!sb||!!authUser);}
  function addGems(amount){if(!gemRewardsEnabled())return false;gems+=Math.max(0,Math.round(+amount||0));saveMeta();return true;}
  ${definitions}
  ${progressFunctions}
`,context);

const run=code=>vm.runInContext(code,context);
const defs=JSON.parse(run(`JSON.stringify(DAILY_TASK_DEFS.map(task=>({
  id:task.id,reward:task.reward,paths:task.paths.map(path=>({id:path.id,goal:path.goal,label:path.label}))
})))`));
assert.deepEqual(defs,[
  {id:'games',reward:60,paths:[{id:'duels',goal:5,label:'1v1 DUELS'},{id:'endless',goal:2,label:'ENDLESS GAMES (1+ WAVE)'}]},
  {id:'eliminations',reward:150,paths:[{id:'duels',goal:15,label:'1v1 KOs'},{id:'endless',goal:100,label:'ENDLESS KILLS'}]},
  {id:'victories',reward:300,paths:[{id:'duels',goal:2,label:'1v1 WINS'},{id:'chests',goal:1,label:'MOD CHESTS'}]},
]);

const splitProgress=JSON.parse(run(`(()=>{
  dailyTasks=freshDailyTasks();gems=0;testMode=false;authUser={id:'player'};unrankedRun=false;adminUsed=false;
  taskProgress('duel_game',4);taskProgress('endless_game',1);
  const before={gems,task:dailyTasks.find(task=>task.id==='games')};
  taskProgress('endless_game',1);
  const completed={gems,task:dailyTasks.find(task=>task.id==='games')};
  taskProgress('duel_game',99);
  return JSON.stringify({before,completed,after:gems});
})()`));
assert.equal(splitProgress.before.gems,0,'unlike OR paths must not combine');
assert.equal(splitProgress.before.task.done,false);
assert.deepEqual(splitProgress.before.task.progress,{duels:4,endless:1});
assert.equal(splitProgress.completed.gems,60);
assert.equal(splitProgress.completed.task.done,true);
assert.equal(splitProgress.completed.task.completedBy,'endless');
assert.equal(splitProgress.after,60,'the unused alternative must not pay a second time');

const allRewards=JSON.parse(run(`(()=>{
  dailyTasks=freshDailyTasks();gems=0;
  taskProgress('duel_game',5);taskProgress('endless_game',999);
  taskProgress('endless_kill',100);taskProgress('duel_elimination',999);
  taskProgress('duel_win',2);taskProgress('mod_chest',999);
  return JSON.stringify({gems,tasks:dailyTasks});
})()`));
assert.equal(allRewards.gems,510,'all three rows must pay exactly 60 + 150 + 300');
assert.equal(allRewards.tasks.every(task=>task.done),true);

for(const [eventId,amount,reward,taskId,completedBy] of [
  ['duel_game',5,60,'games','duels'],['endless_game',2,60,'games','endless'],
  ['duel_elimination',15,150,'eliminations','duels'],['endless_kill',100,150,'eliminations','endless'],
  ['duel_win',2,300,'victories','duels'],['mod_chest',1,300,'victories','chests'],
]){
  const result=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;waveMsg='';
    taskProgress(${JSON.stringify(eventId)},${amount});
    return JSON.stringify({gems,task:dailyTasks.find(task=>task.id===${JSON.stringify(taskId)})});})()`));
  assert.equal(result.gems,reward,`${eventId} must pay its row reward`);
  assert.equal(result.task.done,true,`${eventId} must complete its route`);
  assert.equal(result.task.completedBy,completedBy);
}

const otherSplit=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;
  taskProgress('duel_elimination',14);taskProgress('endless_kill',99);taskProgress('duel_win',1);
  return JSON.stringify({gems,tasks:dailyTasks});})()`));
assert.equal(otherSplit.gems,0,'partial progress across either remaining OR row must not combine');
assert.equal(otherSplit.tasks[1].done,false);
assert.equal(otherSplit.tasks[2].done,false);

const doubleCompletion=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;waveMsg='';
  dailyTasks[0].progress.duels=4;dailyTasks[2].progress.duels=1;
  recordDailyDuelMatch(true);return JSON.stringify({gems,waveMsg});})()`));
assert.equal(doubleCompletion.gems,360,'one duel may correctly finish both eligible rows');
assert.match(doubleCompletion.waveMsg,/2 DAILY TASKS COMPLETE \+360 GEMS/,'both rewards must be explained together');

vm.runInContext(`var arena={matchEpoch:9,round:5,dailyTaskMatchRecorded:false,dailyTaskRounds:new Set(),dailyTaskOwner:'player',
  dailyTaskCompletedCount:0,dailyTaskReward:0,dailyTaskResult:''};${arenaHelpers}`,context);
const finalRoundCompletion=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;waveMsg='';
  dailyTasks[0].progress.duels=4;dailyTasks[1].progress.duels=14;dailyTasks[2].progress.duels=1;
  arena=Object.assign(arena,{dailyTaskMatchRecorded:false,dailyTaskRounds:new Set(),dailyTaskCompletedCount:0,dailyTaskReward:0,dailyTaskResult:''});
  arenaRecordDailyOutcome('player','player','knockout',true,true);
  return JSON.stringify({gems,waveMsg,result:arena.dailyTaskResult,done:dailyTasks.filter(task=>task.done).length});})()`));
assert.deepEqual(finalRoundCompletion,{gems:510,waveMsg:'\uD83D\uDC8E 3 DAILY TASKS COMPLETE +510 GEMS',
  result:'DAILY TASKS COMPLETE \u00b7 +510 GEMS',done:3},
  'a final-round KO that finishes all three tasks must show and pay the full combined reward');

const midMatchKoCompletion=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;waveMsg='';
  dailyTasks[1].progress.duels=14;arena=Object.assign(arena,{matchEpoch:10,round:2,dailyTaskMatchRecorded:false,
    dailyTaskRounds:new Set(),dailyTaskCompletedCount:0,dailyTaskReward:0,dailyTaskResult:''});
  let forcedSaves=0;globalThis.saveProfile=()=>{forcedSaves++;return Promise.resolve(true);};
  arenaRecordDailyOutcome('player','player','knockout',false,true);
  return JSON.stringify({gems,forcedSaves,result:arena.dailyTaskResult});})()`));
assert.deepEqual(midMatchKoCompletion,{gems:150,forcedSaves:1,result:'DAILY TASK COMPLETE \u00b7 +150 GEMS'},
  'a KO-row reward earned before match end must immediately start one durable save');

const queuedDuringProfileRead=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;profileLoaded=false;
  profileOwnerUserId='player';pendingDailyTaskOwner='player';pendingDailyTaskDay='day-a';pendingDailyTaskEvents=Object.create(null);
  taskProgress('duel_game',1);const held={progress:dailyTasks[0].progress.duels,queued:pendingDailyTaskEvents.duel_game};
  profileLoaded=true;flushPendingDailyTaskEvents();return JSON.stringify({held,progress:dailyTasks[0].progress.duels});})()`));
assert.deepEqual(queuedDuringProfileRead,{held:{progress:0,queued:1},progress:1},'profile reads must hold, then replay earned progress');

const switchedEndlessOwner=JSON.parse(run(`(()=>{dailyTasks=freshDailyTasks();gems=0;profileLoaded=true;
  dailyEndlessTaskOwner='player';authUser={id:'other'};profileOwnerUserId='other';taskProgress('endless_kill',1);
  return JSON.stringify({gems,progress:dailyTasks[1].progress.endless});})()`));
assert.deepEqual(switchedEndlessOwner,{gems:0,progress:0},'an Endless run must stay bound to the account that started it');

for(const blocked of [
  'testMode=true',
  'testMode=false;authUser=null',
  "authUser={id:'player'};profileLoaded=false;pendingDailyTaskOwner='other'",
  "authUser={id:'player'};unrankedRun=true",
  'unrankedRun=false;adminUsed=true',
  "adminUsed=false;practiceMode='range'",
]){
  const result=JSON.parse(run(`(()=>{
    dailyTasks=freshDailyTasks();gems=0;testMode=false;authUser={id:'player'};profileLoaded=true;profileOwnerUserId='player';unrankedRun=false;adminUsed=false;practiceMode=null;
    ${blocked};taskProgress('duel_game',5);
    return JSON.stringify({gems,progress:dailyTasks[0].progress.duels,done:dailyTasks[0].done});
  })()`));
  assert.deepEqual(result,{gems:0,progress:0,done:false},`blocked context advanced tasks: ${blocked}`);
}

const migrated=JSON.parse(run(`(()=>{
  dailyTasks=[{id:'kills',goal:40,prog:39,done:false}];
  const changed=normalizeDailyRewards();return JSON.stringify({changed,tasks:dailyTasks});
})()`));
assert.equal(migrated.changed,true);
assert.deepEqual(migrated.tasks.map(task=>task.id),['games','eliminations','victories']);
assert.equal(migrated.tasks.every(task=>Object.values(task.progress).every(value=>value===0)),true);

const merged=JSON.parse(run(`(()=>{
  const a=freshDailyTasks(),b=freshDailyTasks();
  a[0].progress.duels=4;a[0].progress.endless=0;
  b[0].progress.duels=2;b[0].progress.endless=1;
  b[2].progress.chests=1;b[2].done=true;b[2].completedBy='chests';
  return JSON.stringify(mergeDailyTaskSets(a,b));
})()`));
assert.deepEqual(merged[0].progress,{duels:4,endless:1},'cloud merge must max each OR path separately');
assert.equal(merged[0].done,false);
assert.equal(merged[2].done,true);
assert.equal(merged[2].completedBy,'chests');

const alternateResultText=run(`(()=>{dailyTasks=freshDailyTasks();
  dailyTasks[0].done=true;dailyTasks[0].completedBy='endless';
  dailyTasks[1].done=true;dailyTasks[1].completedBy='endless';
  dailyTasks[2].done=true;dailyTasks[2].completedBy='chests';
  return dailyDuelTaskProgressText();})()`);
assert.match(alternateResultText,/PLAY \u2713 VIA ENDLESS/);
assert.match(alternateResultText,/ELIMS \u2713 VIA ENDLESS/);
assert.match(alternateResultText,/WIN \u2713 VIA CHEST/);
assert.doesNotMatch(alternateResultText,/DUELS \u2713|KOs \u2713|WINS \u2713/,
  'Arena results must not claim a Duel route finished when its alternative completed the row');

const boundary=JSON.parse(run(`(()=>{
  dailyTasks=freshDailyTasks();dailyTasks[0].progress.duels=4;tasksDate='day-a';currentDay='day-b';gems=0;
  testMode=false;authUser={id:'player'};unrankedRun=false;adminUsed=false;practiceMode=null;
  taskProgress('duel_game',1);
  return JSON.stringify({tasksDate,progress:dailyTasks[0].progress.duels,gems});
})()`));
assert.deepEqual(boundary,{tasksDate:'day-b',progress:1,gems:0},'the first post-reset event must advance only the new day');

const arenaContext=vm.createContext({console});
vm.runInContext(`
  let eliminationCalls=0,matchCalls=[];
  let currentOwner='me',arena={matchEpoch:8,round:3,dailyTaskMatchRecorded:false,dailyTaskRounds:new Set(),dailyTaskOwner:'me'};
  function dailyTaskOwnerKey(){return currentOwner;}
  function dailyTaskOwnerMatches(owner){return !!owner&&owner===currentOwner;}
  function recordDailyDuelElimination(){eliminationCalls++;return true;}
  function recordDailyDuelMatch(won){matchCalls.push(won);return true;}
  ${arenaHelpers}
`,arenaContext);
assert.equal(vm.runInContext(`arenaRecordDailyElimination('me','me','timeout');eliminationCalls`,arenaContext),0);
assert.equal(vm.runInContext(`arenaRecordDailyElimination('me','me','knockout');arenaRecordDailyElimination('me','me','knockout');eliminationCalls`,arenaContext),1,
  'a repeated round result must award one duel KO');
assert.deepEqual(JSON.parse(vm.runInContext(`arenaRecordDailyMatch('me','me',false);arenaRecordDailyMatch('me','me',true);arenaRecordDailyMatch('me','me',true);JSON.stringify(matchCalls)`,arenaContext)),[true],
  'a qualified terminal match result must record exactly once');
assert.equal(vm.runInContext(`arena=Object.assign(arena,{dailyTaskMatchRecorded:false,dailyTaskOwner:'me'});currentOwner='other';arenaRecordDailyMatch('other','other',true);matchCalls.length`,arenaContext),1,
  'switching accounts during a duel must not credit the new account');

const endlessHelpers=between(gameplay,'function dailyEndlessTaskEligible()','// A voluntary return to the menu');
const endlessContext=vm.createContext({console});
vm.runInContext(`
  let practiceMode=null,testMode=false,unrankedRun=false,adminUsed=false,wave=1;
  let dailyEndlessRunSettled=false,dailyEndlessClearedWaves=0,dailyEndlessTaskOwner='player',currentOwner='player',events=[];
  function dailyTaskOwnerMatches(owner){return owner===currentOwner;}
  function taskProgress(event){events.push(event);return true;}
  ${endlessHelpers}
`,endlessContext);
assert.deepEqual(JSON.parse(vm.runInContext(`recordDailyEndlessWaveClear();completeDailyEndlessTaskRun();completeDailyEndlessTaskRun();JSON.stringify({clears:dailyEndlessClearedWaves,events})`,endlessContext)),
  {clears:1,events:['endless_game']},'an Endless run must settle once after a real wave clear');

const saveFunctions=between(persistence,'function profileWritesPending()','function loadMeta()');
const saveContext=vm.createContext({console,Promise,Date,AbortController,setTimeout,clearTimeout});
vm.runInContext(`
  let profileLoaded=true,profileSaveT=0,profilePending=false,profilePendingUserId='',profileMutationVersion=0,
    profileSaveQueued=0,profileSaveTail=Promise.resolve(false),profileSaveRequestSerial=0,
    profileLatestSaveSerialByUser=Object.create(null),profileActiveSaveController=null,profileActiveSaveUserId='';
  let authUser={id:'player'},gems=1,writes=[],resolvers=[];
  function metaPayload(){return {gems};}
  const sb={from(){return {upsert(row){return {abortSignal(signal){return new Promise(resolve=>{
    writes.push(row.data.gems);resolvers.push(()=>resolve({error:null}));
    signal.addEventListener('abort',()=>resolve({error:new Error('aborted')}),{once:true});
  });}};}};}};
  ${saveFunctions}
`,saveContext);
const oldSave=vm.runInContext(`saveProfile(false)`,saveContext);
await new Promise(resolve=>setTimeout(resolve,0));
const finalSave=vm.runInContext(`gems=2;queueProfileSave();saveProfile(true)`,saveContext);
await new Promise(resolve=>setTimeout(resolve,0));
vm.runInContext(`resolvers[resolvers.length-1]()`,saveContext);
assert.equal(await oldSave,false,'a forced final snapshot must cancel the older in-flight snapshot');
assert.equal(await finalSave,true,'the newest forced snapshot must finish after cancelling the old one');
assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify({writes,profilePending,profileSaveQueued})`,saveContext)),
  {writes:[1,2],profilePending:false,profileSaveQueued:0},'only the newest confirmed snapshot may clear the dirty state');

assert.match(administration,/tasksV:DAILY_TASK_SCHEMA_VERSION/,'local saves need the task schema marker');
assert.match(persistence,/tasksV:DAILY_TASK_SCHEMA_VERSION/,'cloud saves need the task schema marker');
assert.match(persistence,/mergeDailyTaskSets\(dailyTasks,m\.tasks\)/,'cloud profiles must merge both alternatives');
assert.match(gameplay,/dailyEndlessClearedWaves<1/,'an immediate Endless exit must not count as a played game');
assert.match(gameplay,/dailyEndlessTaskOwner=typeof dailyTaskOwnerKey/,'Endless attempts must bind to their starting account');
assert.match(gameplay,/if\(sb&&authUser&&\(!profileLoaded/,'every direct start/replay path must wait for account progress');
assert.match(combat,/taskProgress\('endless_kill',1\)/);
assert.match(combat,/taskProgress\('mod_chest',1\)/);
assert.doesNotMatch(combat,/taskProgress\('(kills|waves|bosses|chests)'/,'retired task metrics must not remain connected');
assert.match(ai,/arenaBotResolve\(arenaTimeoutWinner\([^;]+\),'timeout'\)/,'CPU timeout wins cannot count as KOs');
assert.match(ai,/arenaRecordDailyOutcome\(LOCAL_DUEL_PLAYER,winnerId,reason,!!over,true\)/);
assert.match(online,/roundEndReason:cause&&cause\.kind==='timeout'\?'timeout':'knockout'/);
assert.match(online,/arenaRecordDailyOutcome\(authUser\.id,p\.winner,roundEndReason,!!p\.matchOver,true\)/);
assert.match(online,/arenaRecordDailyMatch\(me,winner,hadCompletedRound\)/,'zero-round forfeits must not farm played duels');
assert.match(online,/wasBot&&!arena\.botAdminTest.+arenaRecordDailyMatch\(LOCAL_DUEL_PLAYER,'',arenaHasCompletedDailyTaskRound\(\)\)/s,
  'leaving CPU 1v1 after a completed round must count the same as an online forfeit');
assert.match(online,/arenaHasCompletedDailyTaskRound\(\)/,'drawn completed rounds must qualify for forfeit credit');
assert.match(online,/\['ko_wait','round_end'\]\.includes\(arena\.phase\)/,'a player leaving after a confirmed KO must keep played-duel credit');
assert.match(online,/forfeit&&\['left','signed_out'\]\.includes\(reason\).+arenaRecordDailyMatch/s,'an explicit leave or awaited sign-out must receive qualified play credit');
assert.match(state,/dailyTaskMatchRecorded:false,dailyTaskRounds:new Set\(\)/,'Arena task receipts must be idempotent');
assert.match(state,/dailyTaskOwner:/,'Arena task receipts must bind to their starting account');
assert.match(ui,/COMPLETE EITHER SIDE/);
assert.match(ui,/\.join\('  OR  '\)/);
assert.doesNotMatch(ui,/dailyPanelReserve=H<540\?0/,'short screens must not suppress the daily task panel');
assert.match(ui,/ultraCompactDaily=H<430,compactDaily=H<640/,'short screens need compact task geometry');
assert.match(ui,/stackY=actionTop\+cardH\*2\+actionGap\+dailyTopGap/,'tasks must be anchored beneath WEAPONS, not below the bottom nav');
assert.match(ui,/LOADING YOUR ACCOUNT PROGRESS/,'a signed-in run must not launch over an unfinished profile read');
assert.match(networking,/reuseLoadedProfile=sameLoadedProfile&&typeof profileWritesPending/,'a known-dirty same-account auth event must not reread stale progress');
assert.match(networking,/fetchProfile\(profileUserId,profileRequestVersion,profileMutationAtSchedule\)/,'mutations during auth setup must invalidate a later profile read');
assert.match(networking,/profileLoaded&&profileOwnerUserId===liveUserId.+Promise\.race\(\[saveProfile\(true\)/s,'sign-out must attempt a bounded task-progress flush first');
assert.match(networking,/persistNormalEndlessScoreOnExit\(\)/,'sign-out must settle a qualified Endless attempt before saving');
assert.match(networking,/if\(!profileSaved\)return false/,'sign-out must stop instead of discarding progress when its final save fails');
assert.match(persistence,/profileSaveTail\.then/,'profile snapshots must be serialized');
assert.match(persistence,/profileActiveSaveController\.abort\(\)/,'a forced final snapshot must cancel an older same-account write');
assert.match(persistence,/profileLatestSaveSerialByUser\[userId\]!==requestSerial/,'obsolete queued snapshots must never reach Supabase');
assert.match(persistence,/profilePending=true;profilePendingUserId=userId;profileSaveT=Date\.now\(\)\+3000/,'failed task saves must remain dirty for retry');
assert.match(loop,/profilePending&&profileSaveQueued===0/,'the frame retry must not duplicate an in-flight profile write');
assert.match(party,/flushProfileOnExit\(\)/,'reload and close paths must attempt an immediate final profile flush');
assert.match(persistence,/completedNow&&!dailyTaskBatchDepth&&sb&&authUser.+saveProfile\(true\)/,'a completed reward must start an immediate cloud save');
assert.match(persistence,/\(completed\|\|completedTask\)&&changed&&sb&&authUser.+saveProfile\(true\)/,'a finished duel or newly completed KO task must immediately flush progress');
assert.match(gameplay,/changed&&typeof sb!=='undefined'&&sb&&authUser.+saveProfile\(true\)/,'a finished Endless attempt must immediately flush its task progress');
assert.match(ui,/arena\.dailyTaskResult\|\|\(typeof dailyDuelTaskProgressText/,'Arena results must visibly explain daily-task progress or rewards');
assert.match(ui,/CHEST \+'\+r\.gems\+\(r\.taskReward\?' \\u00b7 DAILY TASK \+'/,'the chest modal must distinguish its random gems from task gems');
assert.match(combat,/chestRewardOpen=\{coins:coinDrop,gems:awardedGems,taskReward/,'the chest modal must receive the task reward amount');
for(const [script,version] of [['networking','20260830-daily-or-tasks-v2'],['administration','20260830-daily-or-tasks-v2'],
  ['persistence','20260830-daily-or-tasks-v2'],['state','20260830-daily-or-tasks-v2'],['online','20260830-freezer-projectile-v1'],
  ['ui','20260830-freezer-projectile-v1'],['loop','20260830-daily-or-tasks-v2']])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=${version}`),`${script}.js needs its current cache-buster`);
for(const script of ['party'])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=20260830-cpu-combat-v2`),`${script}.js needs the current CPU cache-buster`);
for(const [script,version] of [['gameplay','20260830-freezer-projectile-v1'],['combat','20260830-freezer-projectile-v1'],
  ['ai','20260830-sniper-fire-v1']])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=${version}`),`${script}.js needs its current gameplay cache-buster`);

console.log('SUMMARY PASS daily task alternatives');
