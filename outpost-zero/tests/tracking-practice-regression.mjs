import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const state=read('js/state.js'),world=read('js/world.js'),gameplay=read('js/gameplay.js');
const combat=read('js/combat.js'),rendering=read('js/rendering.js'),ui=read('js/ui.js'),index=read('../index.html');
const approx=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: expected ${expected}, got ${actual}`);

assert.match(state,/PRACTICE_TRACKING_SPEED_MIN=0\.5, PRACTICE_TRACKING_SPEED_MAX=5, PRACTICE_TRACKING_SPEED_STEP=0\.5/,
  'tracking speed must move in 0.5x steps and cap at 5x');
assert.match(state,/PRACTICE_TRACKING_DIRECTION_STEP=45/,
  'tracking direction controls must move through the eight 45-degree directions');

const optionContext=vm.createContext({
  practiceTrackingSpeed:1,practiceTrackingDirection:0,DEFAULT_PRACTICE_TRACKING_SPEED:1,
  PRACTICE_TRACKING_SPEED_MIN:0.5,PRACTICE_TRACKING_SPEED_MAX:5,PRACTICE_TRACKING_SPEED_STEP:0.5,
  PRACTICE_TRACKING_DIRECTION_STEP:45,clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
});
vm.runInContext(gameplay,optionContext,{filename:'gameplay.js'});
const options=vm.runInContext(`(()=>{
  const angles=[];for(let i=0;i<9;i++){angles.push(normalizePracticeTrackingDirection());adjustPracticeTrackingDirection(45);}
  practiceTrackingSpeed=.5;const speeds=[practiceTrackingSpeed];for(let i=0;i<11;i++){adjustPracticeTrackingSpeed(.5);speeds.push(practiceTrackingSpeed);}
  return {angles,speeds,snapAngle:normalizePracticeTrackingDirection(17),snapSpeed:normalizePracticeTrackingSpeed(1.3)};
})()`,optionContext);
assert.deepEqual([...options.angles],[0,45,90,135,180,225,270,315,0],
  'direction selection must expose only 0, 45, ... 315 and then wrap');
assert.deepEqual([...options.speeds],[.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5,5],
  'speed selection must rise by 0.5x and remain capped at 5x');
assert.equal(options.snapAngle,0,'a stale non-45-degree value must snap to the nearest allowed direction');
assert.equal(options.snapSpeed,1.5,'a stale non-step speed must snap to the nearest 0.5x value');

const worldContext=vm.createContext({practiceMode:'tracking',arena:null,clamp:(value,min,max)=>Math.max(min,Math.min(max,value))});
vm.runInContext(world,worldContext,{filename:'world.js'});
assert.equal(vm.runInContext('activeObstacles().length',worldContext),0,
  'Tracking Dummy must remove every interior wall from rendering and collision');
worldContext.practiceMode='range';
assert.ok(vm.runInContext('activeObstacles().length',worldContext)>0,
  'removing Tracking walls must not erase walls from other Practice modes');

const movementContext=vm.createContext({now:1000,clamp:(value,min,max)=>Math.max(min,Math.min(max,value))});
vm.runInContext(combat,movementContext,{filename:'combat.js'});
const movement=vm.runInContext(`(()=>{
  const bounds={left:0,top:0,right:100,bottom:100};
  const horizontal={x:90,y:50,r:0,practiceDir:0};
  const turned=movePracticeTrackingDummy(horizontal,15,bounds,1000);
  const diagonal={x:50,y:50,r:0,practiceDir:Math.PI/4};
  movePracticeTrackingDummy(diagonal,70,bounds,2000);
  return {turned,horizontal,diagonal};
})()`,movementContext);
assert.equal(movement.turned,true,'the dummy must register a turnaround at the outer edge');
approx(movement.horizontal.practiceTurnMarker.x,98,'the turnaround marker must sit at the exact edge point');
approx(movement.horizontal.x,91,'unused movement must continue back along the same lane after turning');
approx(Math.abs(movement.horizontal.practiceDir),Math.PI,'a horizontal edge hit must reverse exactly 180 degrees');
approx(movement.diagonal.practiceTurnMarker.x,98,'the 45-degree lane must mark its exact corner turnaround');
approx(movement.diagonal.practiceTurnMarker.y,98,'the 45-degree lane must preserve the selected line');
approx(movement.diagonal.practiceDir,-3*Math.PI/4,'a 45-degree path must reverse to 225 degrees');
assert.equal(movement.diagonal.practiceTurnMarker.until-movement.diagonal.practiceTurnMarker.startAt,900,
  'the turnaround marker must remain visible long enough to read');

assert.match(rendering,/e\.practiceMoving&&e\.practiceTurnMarker[\s\S]{0,500}ctx\.arc\(turn\.x,turn\.y,radius/,
  'a small fading circle must render where the dummy reverses');
assert.match(ui,/open arena \\u00b7 0\.5\\u00d7 speed steps to 5\\u00d7 \\u00b7 eight 45\\u00b0 directions/,
  'the Practice card must explain the open arena, speed steps, cap, and directions');
for(const [script,version] of [['state','20260831-duel-stability-v1'],['world','20260902-ai-cleanup-v1'],
  ['gameplay','20260831-practice-loan-v1'],['combat','20260831-utility-preround-v1'],
  ['rendering','20260831-mobile-quick-melee-v1'],['ui','20260902-ai-cleanup-v1']])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=${version}`),`${script}.js needs its current cache tag`);

console.log('PASS open-lane Tracking Dummy controls, reversal, and marker');
