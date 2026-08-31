import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=fs.readFileSync(path.join(root,'js/ai.js'),'utf8');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');
let obstacles=[];
const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,WeakSet,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  WORLD:{w:1200,h:900},
  activeArenaBounds:()=>({left:0,top:0,right:1200,bottom:900}),
  activeObstacles:()=>obstacles,
  activeArenaPortals:()=>[],
});
vm.runInContext(ai,context,{filename:'ai.js'});

const run=code=>vm.runInContext(code,context);
function functionSource(source,name){
  const start=source.search(new RegExp(`function\\s+${name}\\s*\\(`));assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}
const tiers=JSON.parse(run('JSON.stringify(BOT_DIFFICULTIES)'));
for(let i=1;i<tiers.length;i++){
  assert.ok(tiers[i].dodgeChance>tiers[i-1].dodgeChance,'dodge chance must rise each tier');
  assert.ok(tiers[i].dodgeReactionMs<tiers[i-1].dodgeReactionMs,'dodge reaction must improve each tier');
  assert.ok(tiers[i].dodgeLookaheadMs>tiers[i-1].dodgeLookaheadMs,'dodge lookahead must rise each tier');
  assert.ok(tiers[i].dodgeSpeedScale>tiers[i-1].dodgeSpeedScale,'dodge burst speed must rise each tier');
  assert.ok(tiers[i].thinkMs<tiers[i-1].thinkMs,'higher tiers must execute a committed route more responsively');
}
assert.ok(tiers[3].moveCommitMin>=1100&&tiers[4].moveCommitMin>tiers[3].moveCommitMin&&tiers[4].moveCommitMax>=1900,
  'Hard and Impossible must commit to tactical movement instead of rerolling it every reaction tick');
assert.ok(tiers[4].moveSpeed>=3.4&&tiers[4].moveSpeed>tiers[3].moveSpeed,
  'Impossible must be able to keep pace with the 3.4-speed player');
for(const tier of tiers)for(const unfair of ['damage','fireMs','hp','health','mag','reload'])
  assert.equal(tier[unfair],undefined,'difficulty must not gain '+unfair);

const committedRoute=JSON.parse(run(`(()=>{
  const config=Object.assign({},botDifficulty(4),{useNavigation:false}),target={id:'player',x:880,y:430,r:15,hp:250},
    bot={id:'commit',team:'B',x:420,y:450,r:15,hp:250,aiRng:8080,aiTactic:'',aiTacticUntil:0,aiTacticMinUntil:0,
      aiSide:1,aiPlanMoveX:0,aiPlanMoveY:0},moves=[];
  for(let clock=1000;clock<=1960;clock+=40){
    const move=cpuAiPickMove(bot,target,[bot],clock,config,null);moves.push({x:move.x,y:move.y,tactic:move.tactic,side:bot.aiSide});
    bot.x+=move.x*config.moveSpeed*2.4;bot.y+=move.y*config.moveSpeed*2.4;
  }
  let minDot=1;
  for(let i=1;i<moves.length;i++)minDot=Math.min(minDot,moves[i-1].x*moves[i].x+moves[i-1].y*moves[i].y);
  return JSON.stringify({moves,minDot,until:bot.aiTacticUntil,minUntil:bot.aiTacticMinUntil});
})()`));
assert.equal(new Set(committedRoute.moves.map(move=>move.tactic)).size,1,'Impossible must keep one tactic through the minimum plan window');
assert.equal(new Set(committedRoute.moves.map(move=>move.side)).size,1,'Impossible must keep one movement side through the minimum plan window');
assert.ok(committedRoute.minDot>.45,'same-plan steering must stay directionally committed instead of rapidly reversing');
assert.ok(committedRoute.minUntil>=2250&&committedRoute.until>=committedRoute.minUntil);

const geometry=JSON.parse(run(`(()=>{
  const bot={id:'bot',team:'B',x:500,y:450,r:15},config=botDifficulty(4);
  const approaching={id:'a',team:'A',x:200,y:450,vx:10,vy:0,life:2000};
  const receding={id:'r',team:'A',x:200,y:450,vx:-10,vy:0,life:2000};
  const missing={id:'m',team:'A',x:200,y:560,vx:10,vy:0,life:2000};
  const friendly={id:'f',team:'B',x:200,y:450,vx:10,vy:0,life:2000};
  const expired={id:'e',team:'A',x:200,y:450,vx:10,vy:0,life:0};
  return JSON.stringify({
    hit:cpuAiProjectileThreats(bot,[approaching],config).map(x=>({impactMs:x.impactMs,miss:x.miss})),
    ignored:cpuAiProjectileThreats(bot,[receding,missing,friendly,expired],config).length,
  });
})()`));
assert.equal(geometry.hit.length,1,'an already-fired collision-course projectile must be detected');
assert.ok(Math.abs(geometry.hit[0].impactMs-500)<1&&geometry.hit[0].miss<.001);
assert.equal(geometry.ignored,0,'receding, missing, friendly, and expired shots must be ignored');

const sniperReaction=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'sniper-target',team:'B',x:500,y:450,r:15,hp:100,aiRng:99,moveX:0,moveY:1},
    shot={id:'awm',team:'A',weapon:'sniper',x:200,y:450,vx:37.8,vy:0,fg:1,life:2000};
  const observed=cpuAiApplyProjectileDodge(bot,[shot],1000,config,null,[bot]);
  const reacted=cpuAiApplyProjectileDodge(bot,[shot],1050,config,null,[bot]);
  return JSON.stringify({observed,reacted,threat:bot.aiDodgeThreat||null});
})()`));
assert.equal(sniperReaction.observed.active,false);
assert.equal(sniperReaction.reacted.active,false);
assert.equal(sniperReaction.threat,null,'bots must not react after an AWM round is already in flight');

obstacles=[{x:330,y:420,w:35,h:60}];
assert.equal(run(`cpuAiProjectileThreats({id:'bot',team:'B',x:500,y:450,r:15},
  [{team:'A',x:200,y:450,vx:10,vy:0,life:2000}],botDifficulty(4)).length`),0,
  'a normal bullet that will die against cover must not trigger a dodge');
assert.equal(run(`cpuAiProjectileThreats({id:'bot',team:'B',x:500,y:450,r:15},
  [{team:'A',x:200,y:450,vx:10,vy:0,life:2000,phaseWalls:1}],botDifficulty(4)).length`),1,
  'one phase charge may cross exactly one ordinary wall');
obstacles=[{x:300,y:420,w:25,h:60},{x:390,y:420,w:25,h:60}];
assert.equal(run(`cpuAiProjectileThreats({id:'bot',team:'B',x:500,y:450,r:15},
  [{team:'A',x:200,y:450,vx:10,vy:0,life:2000,phaseWalls:1}],botDifficulty(4)).length`),0,
  'one phase charge must not see through two walls');
obstacles=[{id:'tnt',kind:'tnt',x:330,y:420,w:35,h:60}];
assert.equal(run(`cpuAiProjectileThreats({id:'bot',team:'B',x:500,y:450,r:15},
  [{team:'A',x:200,y:450,vx:10,vy:0,life:2000,phaseWalls:1}],botDifficulty(4)).length`),0,
  'live TNT must absorb a phase shot before it reaches the bot');
obstacles=[];

const evasion=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),shot={id:'live',team:'A',x:200,y:450,vx:10,vy:0,life:2000};
  const bot={id:'bot',team:'B',x:500,y:450,r:15,hp:100,aiRng:12345,aiDodgeSide:0,
    aiPeekPhase:'commit',aiPeekTargetId:'player',aiNavPath:[{x:600,y:450}],aiNavUntil:9000,
    aiTacticUntil:9000,thinkAt:9000,moveX:1,moveY:0};
  const observed=cpuAiApplyProjectileDodge(bot,[shot],1000,config,null,[bot]);
  const before=cpuAiProjectileThreats(bot,[shot],config)[0];
  const stationary=cpuAiDodgeClearance(bot,before,0,0,config);
  const active=cpuAiApplyProjectileDodge(bot,[shot],1050,config,null,[bot]);
  const clearance=cpuAiDodgeClearance(bot,before,active.x,active.y,config);
  const committed=cpuAiApplyProjectileDodge(bot,[shot,{id:'second',team:'A',x:260,y:450,vx:10,vy:0,life:2000}],1120,config,null,[bot]);
  return JSON.stringify({observed,active,stationary,clearance,committed,peek:bot.aiPeekPhase,path:bot.aiNavPath.length,
    until:bot.aiDodgeUntil,fireUntil:bot.aiDodgeFireUntil});
})()`));
assert.equal(evasion.observed.active,false,'Impossible still observes a real shot before reacting');
assert.equal(evasion.active.active,true,'Impossible must start a committed dodge after its reaction delay');
assert.ok(Math.hypot(evasion.active.x,evasion.active.y)>.99,'the dodge direction must be normalized');
assert.ok(evasion.clearance>evasion.stationary+.5&&evasion.clearance>1,
  'the selected movement must turn a predicted hit into meaningful clearance');
assert.deepEqual({x:evasion.committed.x,y:evasion.committed.y},{x:evasion.active.x,y:evasion.active.y},
  'a later pellet must not reroll the committed direction');
assert.equal(evasion.peek,'','an urgent dodge must interrupt only the current peek');
assert.equal(evasion.path,0,'a dodge must clear the stale navigation route');
assert.ok(evasion.until>1120,'the dodge must remain active for a bounded commitment window');
assert.equal(evasion.fireUntil,1110,'Impossible must briefly withhold fire at dodge start');

const resumedPlan=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),shot={id:'resume-live',team:'A',x:200,y:450,vx:10,vy:0,life:2000},
    bot={id:'resume',team:'B',x:500,y:450,r:15,hp:100,aiRng:4321,aiTactic:'orbit',aiSide:-1,
      aiTacticUntil:2000,aiTacticMinUntil:1700,thinkAt:1600,moveX:0,moveY:1,aiNavPath:[{x:500,y:600}]};
  cpuAiApplyProjectileDodge(bot,[shot],1000,config,null,[bot]);
  cpuAiApplyProjectileDodge(bot,[shot],1050,config,null,[bot]);
  const paused={until:bot.aiTacticUntil,minUntil:bot.aiTacticMinUntil,dodgeUntil:bot.aiDodgeUntil};
  cpuAiApplyProjectileDodge(bot,[],bot.aiDodgeUntil+1,config,null,[bot]);
  return JSON.stringify({paused,tactic:bot.aiTactic,side:bot.aiSide,afterUntil:bot.aiTacticUntil,afterMin:bot.aiTacticMinUntil});
})()`));
assert.deepEqual({tactic:resumedPlan.tactic,side:resumedPlan.side},{tactic:'orbit',side:-1},
  'an urgent dodge must resume the same tactical idea and side');
assert.equal(resumedPlan.paused.until,2260);
assert.equal(resumedPlan.paused.minUntil,1960);
assert.equal(resumedPlan.afterUntil,2260);
assert.equal(resumedPlan.afterMin,1960);

const hitCommit=JSON.parse(run(`(()=>{
  const bot={aiTactic:'push',aiSide:1,aiTacticUntil:2400,aiTacticMinUntil:1900,thinkAt:1800,aiHitResponseUntil:0};
  cpuAiRegisterIncomingHit(bot,1200);return JSON.stringify(bot);
})()`));
assert.equal(hitCommit.aiTactic,'push');assert.equal(hitCommit.aiSide,1);assert.equal(hitCommit.aiTacticUntil,2400);
assert.equal(hitCommit.thinkAt,1200,'incoming damage may refresh execution without abandoning the committed plan');

obstacles=[{x:420,y:355,w:160,h:70}];
const wallDodge=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),shot={team:'A',x:200,y:450,vx:10,vy:0,life:2000},
    bot={id:'wall-bot',team:'B',x:500,y:450,r:15,hp:100,aiRng:77,aiDodgeSide:-1,moveX:0,moveY:-1};
  cpuAiApplyProjectileDodge(bot,[shot],2000,config,null,[bot]);
  return JSON.stringify(cpuAiApplyProjectileDodge(bot,[shot],2050,config,null,[bot]));
})()`));
assert.equal(wallDodge.active,true);
assert.ok(wallDodge.y>0,'when the preferred upper lane is blocked, the bot must choose the open lower dodge');
obstacles=[];

const seededSides=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),out=[];
  for(let seed=1;seed<=32;seed++){
    const shot={team:'A',x:200,y:450,vx:10,vy:0,life:2000},bot={id:'b'+seed,team:'B',x:500,y:450,r:15,hp:100,aiRng:seed,moveX:0,moveY:0};
    cpuAiApplyProjectileDodge(bot,[shot],3000,config,null,[bot]);
    const move=cpuAiApplyProjectileDodge(bot,[shot],3050,config,null,[bot]);out.push(Math.sign(move.y));
  }
  return JSON.stringify(out);
})()`));
assert.deepEqual(seededSides,JSON.parse(run(`(()=>{
  const config=botDifficulty(4),out=[];
  for(let seed=1;seed<=32;seed++){
    const shot={team:'A',x:200,y:450,vx:10,vy:0,life:2000},bot={id:'b'+seed,team:'B',x:500,y:450,r:15,hp:100,aiRng:seed,moveX:0,moveY:0};
    cpuAiApplyProjectileDodge(bot,[shot],3000,config,null,[bot]);
    const move=cpuAiApplyProjectileDodge(bot,[shot],3050,config,null,[bot]);out.push(Math.sign(move.y));
  }
  return JSON.stringify(out);
})()`)),'the same seeds and volley must choose the same dodge sides');
assert.deepEqual([...new Set(seededSides)].sort(),[-1,1],'seeded bots must use both lateral sides instead of one learnable route');

const sequential=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'repeat',team:'B',x:500,y:450,r:15,hp:100,aiRng:9,moveX:0,moveY:0},out=[];
  let clock=4000;
  for(let volley=0;volley<8;volley++){
    const shot={id:'volley-'+volley,team:'A',x:200,y:450,vx:10,vy:0,life:2000};
    cpuAiApplyProjectileDodge(bot,[shot],clock,config,null,[bot]);
    const move=cpuAiApplyProjectileDodge(bot,[shot],clock+50,config,null,[bot]);out.push(Math.sign(move.y));
    clock=bot.aiDodgeCooldownUntil+1;
  }
  return JSON.stringify(out);
})()`));
assert.equal(new Set(sequential).size,2,'one bot must vary its side across separate centered volleys');
assert.ok(!sequential.some((side,i)=>i>=2&&side===sequential[i-1]&&side===sequential[i-2]),
  'one bot must never expose a three-volley same-side pattern');

const boxed=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),shot={team:'A',x:200,y:450,vx:10,vy:0,life:2000},
    bot={id:'boxed',team:'B',x:500,y:450,r:15,hp:100,aiRng:88,moveX:0,moveY:0},mates=[];
  for(let i=0;i<32;i++){const a=i*Math.PI/16;mates.push({id:'m'+i,x:500+Math.cos(a)*55,y:450+Math.sin(a)*55,r:15,hp:100});}
  cpuAiApplyProjectileDodge(bot,[shot],5000,config,null,[bot,...mates]);
  return JSON.stringify(cpuAiApplyProjectileDodge(bot,[shot],5050,config,null,[bot,...mates]));
})()`));
assert.equal(boxed.active,false,'a bot must not dodge through a boxed-in teammate');

const collision=JSON.parse(run(`(()=>{
  function simulate(distance,speed,fg,dodge){
    const config=botDifficulty(4),bot={id:'sim',team:'B',x:500,y:450,r:15,hp:100,aiRng:123,moveX:0,moveY:0},
      shot={team:'A',x:500-distance,y:450,vx:speed,vy:0,fg,life:2000};
    for(let clock=0;clock<1000;clock+=16.667){
      const move=dodge?cpuAiApplyProjectileDodge(bot,[shot],clock,config,null,[bot]):{active:false};
      if(move.active){bot.x+=move.x*config.moveSpeed*move.speedScale;bot.y+=move.y*config.moveSpeed*move.speedScale;}
      shot.x+=shot.vx;shot.life-=16.667;
      if(Math.hypot(bot.x-shot.x,bot.y-shot.y)<bot.r+4+fg)return true;
      if(shot.x>bot.x+80)return false;
    }
    return false;
  }
  return JSON.stringify({control:simulate(300,19*1.15,15.4,false),impossible:simulate(300,19*1.15,15.4,true),
    closeSniper:simulate(150,28*1.35,1,true)});
})()`));
assert.deepEqual(collision,{control:true,impossible:false,closeSniper:true},
  'Impossible must evade a readable mid-range AR shot while close sniper fire remains valid counterplay');

const partyBox=vm.createContext({Array,String});
vm.runInContext(`
  let partyCpuMatch={shots:[
    {id:'a-red-1',team:'A',targetId:'red-1'},{id:'a-red-2',team:'A',targetId:'red-2'},
    {id:'a-free',team:'A',targetId:''},{id:'b-ally',team:'B',targetId:'ally'},
    {id:'b-human',team:'B',targetId:'human'}],visualShots:[{id:'remote-human'}]};
  let bullets=[{id:'local-human'}];
  ${functionSource(party,'partyCpuDodgeShots')}
  globalThis.red=partyCpuDodgeShots({id:'red-1',team:'B'}).map(x=>x.id);
  globalThis.ally=partyCpuDodgeShots({id:'ally',team:'A'}).map(x=>x.id);
`,partyBox);
assert.deepEqual([...partyBox.red],['a-red-1','a-free','local-human','remote-human'],
  'a red CPU must see only its targetable A-team shots plus local and remote human fire');
assert.deepEqual([...partyBox.ally],['b-ally'],
  'the ally CPU must ignore friendly human fire and red shots targeted at somebody else');

assert.match(ai,/cpuAiApplyProjectileDodge\(b,bullets,now,tuning/,
  'CPU 1v1 must feed live player bullets into the shared dodge controller');
assert.match(party,/cpuAiApplyProjectileDodge\(b,partyCpuDodgeShots\(b\),clock,profile/,
  'CPU 2v2 must use the same dodge controller');
assert.match(ai,/now<\(\+b\.aiDodgeFireUntil\|\|0\)/,'CPU 1v1 must respect the brief dodge fire hold');
assert.match(party,/clock<\(\+b\.aiDodgeFireUntil\|\|0\)/,'CPU 2v2 must respect the brief dodge fire hold');
assert.match(ai,/aiDodgeHandled:new WeakSet\(\)/);
assert.match(party,/aiDodgeHandled:new WeakSet\(\)/);

console.log('SUMMARY PASS bot projectile dodge');
