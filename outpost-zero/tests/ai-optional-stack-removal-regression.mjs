import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const index=read('../index.html'),ai=read('js/ai.js'),party=read('js/party.js'),ui=read('js/ui.js'),
  adminUi=read('js/admin-ui.js'),administration=read('js/administration.js'),input=read('js/input.js'),
  networking=read('js/networking.js'),world=read('js/world.js'),bootstrap=read('js/bootstrap.js'),
  playerStats=read('sql/player/Player-01-stats.sql');
const runtime=[index,ai,party,ui,adminUi,administration,input,networking,world,bootstrap].join('\n');

assert.equal(fs.existsSync(path.join(root,'js/ai-training.js')),false,
  'the removed evidence client must stay deleted');
assert.doesNotMatch(index,/ai-training\.js/,'the removed evidence client must not load');
assert.doesNotMatch(runtime,
  /get_outpost_zero_bot_model|list_outpost_zero_bot_models|activate_outpost_zero_bot_model|submit_outpost_zero_ai_training_match|list_outpost_zero_ai_training_summary/,
  'the browser must not call removed model-history or match-evidence RPCs');
assert.doesNotMatch(runtime,
  /aiLearning|recordAiTraining|initializeAiTraining|flushAiTraining|BOT_MODEL_RELEASES|activeBotModel|botModelRelease|AI BOT MODELS|MATCH EVIDENCE|BRING BACK MODEL/,
  'removed model/evidence state and UI must not return');

const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,WeakSet,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),WORLD:{w:1200,h:900},WEAPONS:{
    ar:{dmg:48,mag:25,reload:1600,fireRate:145,melee:false,range:620,fall:.781,speed:19},
    m9:{dmg:38,mag:12,reload:800,fireRate:200,melee:false,range:340,fall:.55,speed:17,quickdrawMs:120},
    knife:{dmg:48,mag:Infinity,reload:0,fireRate:380,melee:true,range:130,arc:.35},
  },
  weaponEquipMs:key=>key==='m9'?120:380,weaponBulletSpeed:key=>key==='ar'?19:17,
  activeArenaBounds:()=>({left:0,top:0,right:1200,bottom:900}),activeObstacles:()=>[],activeArenaPortals:()=>[],
  arenaMeleeLineClear:()=>true,
});
vm.runInContext(ai,context,{filename:'ai.js'});
const tactics=JSON.parse(vm.runInContext('JSON.stringify(BOT_TACTICS)',context));
assert.deepEqual(tactics,{usePrediction:true,useNavigation:true,useStuckRecovery:true,useReactiveCover:true,useTnt:true,usePortals:true},
  'all CPUs must retain the complete current tactical feature set');
assert.equal(vm.runInContext('arenaBotTuning(0).usePrediction',context),false,
  'Beginner difficulty must still disable prediction');
assert.equal(vm.runInContext('arenaBotTuning(4).usePrediction',context),true,
  'Impossible difficulty must retain prediction');
assert.match(ai,/get_outpost_zero_bot_ladder/,'Player 01 ladder reads must remain');
assert.match(ai,/submit_outpost_zero_bot_ladder/,'Player 01 ladder result submission must remain');
assert.match(ai,/function recordCompletedBotLadderMatch\(/,'Player 01 exact-once client result path must remain');
assert.match(playerStats,/create table if not exists public\.outpost_zero_bot_ladder\b/,
  'Player 01 must own the private CPU ladder');
assert.match(playerStats,/create table if not exists public\.outpost_zero_bot_ladder_matches\b/,
  'Player 01 must own exact-once CPU match receipts');
assert.match(playerStats,/function public\.get_outpost_zero_bot_ladder\(/,
  'Player 01 must retain the ladder read RPC');
assert.match(playerStats,/function public\.submit_outpost_zero_bot_ladder\(/,
  'Player 01 must retain the ladder result RPC');

console.log('AI optional stack removal regression: PASS');
