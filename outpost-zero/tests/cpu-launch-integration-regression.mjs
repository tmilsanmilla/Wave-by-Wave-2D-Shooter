import assert from 'node:assert/strict';
import test from 'node:test';
import {gameSimulation} from './helpers/game-simulation.mjs';

for(const mode of ['ai1v1','ai2v2'])test(`guest ${mode}: actual menu→primary→deferred launch→map→countdown→fight`,async()=>{
  const h=gameSimulation();
  assert.equal(h.run(`chooseGameMode('${mode}','offlinecpu')`),true);
  assert.equal(h.run('launchSelectedMode()'),true);
  await h.settle();
  assert.equal(h.run('botLadderLaunchPending'),'');
  assert.equal(h.run('arena.phase'),'map_vote');
  assert.equal(h.run('loadout.primary'),'smg');assert.equal(h.run('loadout.secondary'),null);
  h.run('now=arena.mapVoteDeadline;arenaMapVoteTick();');
  assert.equal(h.run('arena.phase'),'map_reveal');
  h.run('now=arena.mapVoteRevealUntil;arenaMapVoteTick();');
  assert.equal(h.run('arena.phase'),'countdown');assert.equal(h.run('state'),'play');
  h.run(`now=arena.roundStartAt;${mode==='ai1v1'?'arenaBotRoundTick()':'offlineCpu2v2RoundTick()'};`);
  assert.equal(h.run('arena.phase'),'fight');assert.equal(h.run('arenaCanAct()'),true);
  assert.equal(h.networkCalls(),0);
});

test('CPU launch timeout clears its latch and exposes a retry without starting a stale match',async()=>{
  const h=gameSimulation();h.run(`authUser={id:'synthetic-account'};pendingGameMode='ai1v1';selPage='loadout';refreshBotLadder=()=>new Promise(()=>{});`);
  h.run(`deferBotLadderMatchStart('ai1v1',()=>{throw new Error('timed-out match must not launch');})`);
  h.fireTimers(8000);await h.settle();
  assert.equal(h.run('botLadderLaunchPending'),'');assert.match(h.run('modeBoardNotice'),/TRY START AGAIN/);
  h.run(`refreshBotLadder=()=>Promise.resolve();var retried=0;deferBotLadderMatchStart('ai1v1',()=>retried++);`);
  await h.settle();assert.equal(h.run('retried'),1);
});

test('account changes and leaving the loadout invalidate late CPU preparation',async()=>{
  for(const action of [`authUser={id:'different-account'}`,`selPage='hub'`,`cancelCpuLaunchIntent()`]){
    const h=gameSimulation();h.run(`authUser={id:'synthetic-account'};pendingGameMode='ai1v1';selPage='loadout';var finish,started=0;refreshBotLadder=()=>new Promise(r=>finish=r);deferBotLadderMatchStart('ai1v1',()=>started++);`);
    await h.settle();h.run(action+';finish();');await h.settle();assert.equal(h.run('started'),0);
  }
});

test('guest double-Start coalesces to exactly one CPU launch',async()=>{
  const h=gameSimulation();h.run(`pendingGameMode='ai1v1';selPage='loadout';var started=0;deferBotLadderMatchStart('ai1v1',()=>started++);deferBotLadderMatchStart('ai1v1',()=>started++);`);
  await h.settle();assert.equal(h.run('started'),1);assert.equal(h.run('botLadderLaunchPending'),'');
});

test('an immediate CPU start refusal returns false and displays its real reason',()=>{
  const h=gameSimulation();h.run(`chooseGameMode('ai1v1','offlinecpu');startBotArena=()=>{arena.status='TEST SELECTED PRIMARY UNAVAILABLE';return false;};`);
  assert.equal(h.run('launchSelectedMode()'),false);assert.equal(h.run('modeBoardNotice'),'TEST SELECTED PRIMARY UNAVAILABLE');
});

test('a refusal after asynchronous preparation exposes its reason instead of a dead Start button',async()=>{
  const h=gameSimulation();h.run(`pendingGameMode='ai1v1';selPage='loadout';deferBotLadderMatchStart('ai1v1',()=>{arena.status='SECURE RESULT SAVE UNAVAILABLE';return false;});`);
  await h.settle();assert.equal(h.run('modeBoardNotice'),'SECURE RESULT SAVE UNAVAILABLE');assert.equal(h.run('botLadderLaunchPending'),'');
});

test('actual CPU combat moves,fires,damages and completes five rounds;guest rematch starts fresh',async()=>{
  const h=gameSimulation();h.run(`chooseGameMode('ai1v1','offlinecpu');launchSelectedMode();`);await h.settle();
  h.run(`now=arena.mapVoteDeadline;arenaMapVoteTick();now=arena.mapVoteRevealUntil;arenaMapVoteTick();now=arena.roundStartAt;arenaBotRoundTick();
    arena.mapId='arena';arenaResetMapRuntime();player.x=700;player.y=900;arena.opponent.x=950;arena.opponent.y=900;
    arena.botTuning=arenaBotTuning(4);arena.opponent.aiRng=12345;var initialBotX=arena.opponent.x,initialBotY=arena.opponent.y,botShots=0,previousShot=0,hpLost=0;
    for(let i=0;i<240;i++){
      now+=1000/60;update(1000/60);
      const stamp=Math.max(...Object.values(arena.opponent.aiWeaponLastShot));if(stamp>previousShot){botShots++;previousShot=stamp;}
      hpLost+=250-player.hp;player.hp=250;
    }`);
  assert.ok(h.run('Math.hypot(arena.opponent.x-initialBotX,arena.opponent.y-initialBotY)')>20);
  assert.ok(h.run('botShots')>0);assert.ok(h.run('hpLost')>0,'actual bot projectiles must damage the player');
  for(let round=1;round<=5;round++){
    assert.equal(h.run('arena.round'),round);assert.equal(h.run('arena.phase'),'fight');
    h.run('arenaHitOpponent(250,"shot");arenaHitOpponent(250,"shot");');
    assert.equal(h.run('arena.scores[LOCAL_DUEL_PLAYER]'),round,'one result per round,never two');
    if(round<5){
      assert.equal(h.run('arena.phase'),'round_end');
      h.run('now=arena.nextRoundAt;arenaBotRoundTick();');assert.equal(h.run('arena.phase'),'countdown');
      h.run('now=arena.roundStartAt;arenaBotRoundTick();');
    }
  }
  assert.equal(h.run('arena.phase'),'match_end');assert.equal(h.run('state'),'select');
  assert.equal(h.run(`cpuResultRematch('ai1v1')`),true);await h.settle();
  assert.equal(h.run('arena.phase'),'map_vote');assert.equal(h.run('arena.round'),0);
  assert.equal(h.run('arena.scores[LOCAL_DUEL_PLAYER]'),0);assert.equal(h.networkCalls(),0);
});

for(const map of ['arena','dimension','construction'])test(`CPU1v1 map ${map}:timeout awards higherHP and advances without a0-0win`,async()=>{
  const h=gameSimulation();h.run(`chooseGameMode('ai1v1','offlinecpu');launchSelectedMode();`);await h.settle();
  assert.equal(h.run('arena.round'),0);assert.equal(h.run('arena.roundResolved'),false);
  h.run(`arenaCastMapVote('${map}');now=arena.mapVoteDeadline;arenaMapVoteTick();now=arena.mapVoteRevealUntil;arenaMapVoteTick();
    arena.mapId='${map}';arenaResetMapRuntime();now=arena.roundStartAt;arenaBotRoundTick();player.hp=130;arena.opponent.hp=100;now=arena.roundEndAt;arenaBotRoundTick();`);
  assert.equal(h.run('arena.phase'),'round_end');assert.equal(h.run('arena.scores[LOCAL_DUEL_PLAYER]'),1);
  h.run('now=arena.nextRoundAt;arenaBotRoundTick();');assert.equal(h.run('arena.round'),2);
});
