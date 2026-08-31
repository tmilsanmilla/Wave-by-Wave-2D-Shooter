import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=fs.readFileSync(path.join(root,'js/ai.js'),'utf8');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');

const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  WORLD:{w:2400,h:1800},
  activeArenaBounds:()=>({left:0,top:0,right:2400,bottom:1800}),
  activeObstacles:()=>[],
  activeArenaPortals:()=>[],
});
vm.runInContext(ai,context,{filename:'ai.js'});

const hitBurst=vm.runInContext(`(()=>{
  const hitBot={thinkAt:900,aiTacticUntil:900,aiStuckUntil:0,aiHitResponseUntil:0,underFireUntil:0};
  const first=cpuAiRegisterIncomingHit(hitBot,100);
  hitBot.thinkAt=900;hitBot.aiTacticUntil=900;
  const repeated=[180,260,340,420,500,580].map(clock=>cpuAiRegisterIncomingHit(hitBot,clock));
  const during={thinkAt:hitBot.thinkAt,tacticUntil:hitBot.aiTacticUntil,responseUntil:hitBot.aiHitResponseUntil,underFireUntil:hitBot.underFireUntil};
  hitBot.thinkAt=1800;hitBot.aiTacticUntil=1800;
  const separate=cpuAiRegisterIncomingHit(hitBot,1300);
  return {first,repeated,during,separate,after:{thinkAt:hitBot.thinkAt,tacticUntil:hitBot.aiTacticUntil}};
})()
`,context);
assert.equal(hitBurst.first,true,'the first hit in a burst should trigger one immediate response');
assert.deepEqual([...hitBurst.repeated],[false,false,false,false,false,false],
  'pellets from the same burst must not keep forcing route re-rolls');
assert.equal(hitBurst.during.thinkAt,900,'repeated hits must preserve the committed think deadline');
assert.equal(hitBurst.during.tacticUntil,900,'repeated hits must preserve the committed tactic');
assert.equal(hitBurst.during.responseUntil,1230,'each pellet should extend, not restart, the burst quiet window');
assert.equal(hitBurst.during.underFireUntil,1480,'reactive-cover pressure should still extend through the burst');
assert.equal(hitBurst.separate,true,'a later, separate burst should be allowed to trigger a new response');
assert.deepEqual({...hitBurst.after},{thinkAt:1300,tacticUntil:1800},
  'a later burst may wake execution without discarding the movement idea');

const oscillation=vm.runInContext(`(()=>{
  const bot={id:'hard-bot',x:100,y:100,r:15,hp:100,lastThinkX:100,lastThinkY:100,moveX:1,moveY:0,
    aiSide:1,aiRng:123,aiTactic:'orbit',aiTacticUntil:2000,aiNavPath:[{x:140,y:100,key:'old'}],
    aiStuckTicks:0,aiStuckUntil:0,aiHitResponseUntil:0,underFireUntil:0};
  const samples=[];
  for(const [clock,x] of [[100,110],[200,100],[300,110],[400,100]]){
    cpuAiRegisterIncomingHit(bot,clock);bot.x=x;
    samples.push(cpuAiObserveMovement(bot,clock));
  }
  const recovered={side:bot.aiSide,until:bot.aiStuckUntil,failedX:bot.aiFailedMoveX,pathLength:bot.aiNavPath.length,peekPhase:bot.aiPeekPhase};
  const move=cpuAiPickMove(bot,{id:'player',x:500,y:100,hp:100},[bot],400,botDifficulty(4),null);
  const committedUntil=bot.aiTacticUntil,committedSide=bot.aiSide;
  const recoveryHit=cpuAiRegisterIncomingHit(bot,450);
  const afterRecoveryHit={until:bot.aiTacticUntil,side:bot.aiSide};
  const postRecoveryClock=recovered.until+1;bot.aiTacticUntil=postRecoveryClock;
  const nextMove=cpuAiPickMove(bot,{id:'player',x:500,y:100,hp:100},[bot],postRecoveryClock,botDifficulty(4),null);
  return {samples,recovered,move,committedUntil,committedSide,recoveryHit,afterRecoveryHit,postRecoveryClock,nextMove};
})()
`,context);
assert.deepEqual([...oscillation.samples],[false,false,false,true],
  'three rapid direction reversals with little net progress should enter recovery');
assert.equal(oscillation.recovered.side,-1,'recovery should deterministically flip away from the failed side');
assert.equal(oscillation.recovered.until,1300,'oscillation recovery must be bounded');
assert.equal(oscillation.recovered.failedX,-10,'the failed direction should be retained temporarily for route avoidance');
assert.equal(oscillation.recovered.pathLength,0,'a compromised cached route must be discarded');
assert.equal(oscillation.recovered.peekPhase,'','recovery must leave an in-progress fake peek');
assert.equal(oscillation.move.tactic,'flank','the recovered bot should commit to a meaningful flank replan');
assert.ok(Math.hypot(oscillation.move.x,oscillation.move.y)>.9,'the recovery replan must produce real movement');
assert.ok(oscillation.committedUntil>400,'the recovery direction must remain committed for a tactical interval');
assert.equal(oscillation.recoveryHit,false,'a hit during recovery must not cancel the committed route');
assert.deepEqual({...oscillation.afterRecoveryHit},{until:oscillation.committedUntil,side:oscillation.committedSide});
assert.ok(oscillation.postRecoveryClock>oscillation.recovered.until-1,'the test must advance beyond the recovery window');
assert.ok(Math.hypot(oscillation.nextMove.x,oscillation.nextMove.y)>.9,'normal varied movement must resume after recovery');

const unpressured=vm.runInContext(`(()=>{
  const bot={x:100,y:100,lastThinkX:100,lastThinkY:100,moveX:1,moveY:0,aiSide:1,underFireUntil:0};
  return [[100,110],[200,100],[300,110],[400,100]].map(([clock,x])=>{bot.x=x;return cpuAiObserveMovement(bot,clock);});
})()
`,context);
assert.deepEqual([...unpressured],[false,false,false,false],
  'ordinary route variation and fake peeks must not be treated as broken movement when the bot is not under fire');

assert.equal((party.match(/cpuAiRegisterIncomingHit\(target,partyCpuAiClock\(\)\)/g)||[]).length,3,
  'every authoritative CPU 2v2 bot-damage path should share the bounded hit response');
assert.match(ai,/cpuAiRegisterIncomingHit\(arena\.opponent,now\)/,
  'CPU 1v1 damage should use the bounded hit response');

console.log('SUMMARY PASS 18');
