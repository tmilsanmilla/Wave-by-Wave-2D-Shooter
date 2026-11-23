import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {performance} from 'node:perf_hooks';
import {gameSimulation} from './helpers/game-simulation.mjs';

// Previous published implementation: an equivalence reference, not a second
// production collision path. No browser/GPU/hosted latency claim in this suite.
const baseline=JSON.parse(fs.readFileSync(new URL('./helpers/remote-visual-baseline.json',import.meta.url),'utf8'));
function client(map='construction',role='host',legacy=false){
  const h=gameSimulation();h.run(`
    authUser={id:'perf-${role}'};arena=freshArena();arena.mode='private';arena.hostId='perf-host';
    arena.active=true;arena.phase='fight';arena.round=1;arena.matchEpoch=1;arena.roundEndAt=Date.now()+90000;
    arena.mapId='${map}';arena.mapVotePhase='locked';practiceMode='arena';state='play';
    player.hp=250;player.x=700;player.y=900;arena.opponent={id:'perf-${role==='host'?'guest':'host'}',
      x:700,y:900,tx:700,ty:900,hp:250,loadout:{primary:'ar',secondary:'m9',melee:'knife'}};
    var geometryCalls={obstacles:0,tnt:0},originalObstacles=activeObstacles,originalTnt=activeArenaTnt;
    activeObstacles=(...args)=>{geometryCalls.obstacles++;return originalObstacles(...args);};
    activeArenaTnt=(...args)=>{geometryCalls.tnt++;return originalTnt(...args);};
  `);
  if(legacy)h.run(baseline.shot+'\n'+baseline.firework);
  return h;
}
function tracers(h){
  h.run(`var testShots=Array.from({length:32},(_,i)=>({x:540+i*38,y:520+(i%6)*130,ox:540+i*38,oy:520+(i%6)*130,
    vx:Math.cos(i*.47)*22,vy:Math.sin(i*.47)*22,life:i%5?1300:20,dist:0,bounce:i%3,wv:i%4===0,
    ba:i*.47,wamp:24,wk:.05,phaseWalls:i%2,phaseWallActive:false}));`);
}
for(const role of ['host','guest'])for(const map of ['arena','dimension','construction'])for(const elapsed of [0,16.667,250]){
  test(`${role}/${map}/${elapsed}ms: every swept tracer matches published positions, walls, phasing, bounce and lifetime`,()=>{
    const old=client(map,role,true),next=client(map,role);tracers(old);tracers(next);
    for(let i=0;i<4;i++){
      old.run(`stepRemoteShotVisuals(testShots,${elapsed})`);next.run(`stepRemoteShotVisuals(testShots,${elapsed})`);
      assert.deepEqual(next.json('testShots'),old.json('testShots'));
    }
    assert.equal(next.networkCalls(),0);assert.equal(next.run('player.hp'),250);
    assert.deepEqual(next.json('[...arena.tntDamage]'),[]);
  });
}
for(const map of ['arena','dimension','construction'])test(`${map}: firework sweep/bounce/edge/fuse and explosion FX remain identical`,()=>{
  const old=client(map,'host',true),next=client(map);
  for(const h of [old,next])h.run(`var testFireworks=Array.from({length:24},(_,i)=>({x:500+i*57,y:390+(i%6)*150,
    vx:12,vy:i%2?8:-8,tx:1500,ty:900,life:i%4?480:25}));arena.remoteFireworkFx=[];`);
  for(const elapsed of [16.667,80,250,250]){
    old.run(`stepRemoteFireworkVisuals(testFireworks,${elapsed})`);next.run(`stepRemoteFireworkVisuals(testFireworks,${elapsed})`);
    assert.deepEqual(next.json('testFireworks'),old.json('testFireworks'));
    assert.deepEqual(next.json('arena.remoteFireworkFx'),old.json('arena.remoteFireworkFx'));
  }
});
test('300 tracers/250ms builds geometry once rather than once per pellet substep; no visual/damage/packet budget reduction',()=>{
  const evidence=[];
  for(const legacy of [true,false]){
    const h=client('construction','guest',legacy);
    h.run(`var testShots=Array.from({length:300},()=>({x:700,y:900,ox:700,oy:900,vx:22,vy:0,life:2000,dist:0,bounce:0,wv:false,phaseWalls:0}));`);
    const started=performance.now();h.run('stepRemoteShotVisuals(testShots,250)');
    evidence.push({mode:legacy?'published':'fixed',jsMs:performance.now()-started,...h.json('geometryCalls')});
    assert.equal(h.run('testShots.length'),300);assert.equal(h.run('REMOTE_SHOT_QUEUE_MAX'),300);
    assert.equal(h.run('player.hp'),250);assert.equal(h.networkCalls(),0);
  }
  assert.equal(evidence[1].obstacles,1);assert.equal(evidence[1].tnt,2);
  assert.ok(evidence[0].obstacles>=14000);assert.ok(evidence[0].tnt>=28000);
  // Timing is reported, never a flaky machine-dependent performance assertion.
  console.log('TRACER_JS_MODEL_BENCHMARK '+JSON.stringify(evidence));
});
test('TNT destruction and map switches are visible on the NEXT pass, never a stale cross-frame cache',()=>{
  const h=client();const shot=`({x:946,y:710,ox:946,oy:710,vx:40,vy:0,life:1200,dist:0,bounce:0,wv:false,phaseWalls:2})`;
  h.run(`var testShots=[${shot}];stepRemoteShotVisuals(testShots,16.667);`);assert.equal(h.run('testShots.length'),0);
  h.run(`arena.detonatedTnt.add('tnt-nw');testShots=[${shot}];stepRemoteShotVisuals(testShots,16.667);`);
  assert.equal(h.run('testShots.length'),1);assert.equal(h.run('testShots[0].phaseWalls'),2);
  h.run(`arena.mapId='dimension';testShots=[${shot}];stepRemoteShotVisuals(testShots,16.667);`);assert.equal(h.run('testShots.length'),1);
  assert.deepEqual(h.json('[...arena.tntDamage]'),[]);
});
test('empty tracer/firework passes allocate no geometry while existing FX still expire',()=>{
  const h=client();h.run('arena.remoteFireworkFx=[{x:700,y:900,life:10,maxLife:650}];stepRemoteShotVisuals([],250);stepRemoteFireworkVisuals([],250);');
  assert.deepEqual(h.json('geometryCalls'),{obstacles:0,tnt:0});assert.deepEqual(h.json('arena.remoteFireworkFx'),[]);
});
for(const role of ['host','guest'])test(`${role}: validated received shots retain carried-weapon/replay rules and are cosmetic only`,()=>{
  const h=client('construction',role),peer=role==='host'?'guest':'host';
  h.run(`var packet={from:'perf-${peer}',id:'perf-${peer}:1:1:shot:1',epoch:1,round:1,weapon:'ar',x:700,y:900,angles:[0]};`);
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),true);assert.equal(h.run('arenaApplyRemoteShot(packet)'),false);
  h.run('stepRemoteShotVisuals(arena.remoteShots,250);');assert.equal(h.run('player.hp'),250);
  h.run("packet.id=packet.id.replace('shot:1','shot:2');packet.weapon='sniper';");
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),false);assert.equal(h.networkCalls(),0);
});
