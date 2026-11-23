import assert from 'node:assert/strict';
import test from 'node:test';
import {gameSimulation} from './helpers/game-simulation.mjs';

// Explicit design contract: don't let alphabetical/name-only reskins grow
// the shop again. Vault entries keep their separate existing publication gates.
const lineup={
  PRIMARY:'ar smg shotgun sniper dmr anchor longbow quasar warpwave fireworks',
  SIDEARM:'m9 revolver g18 volt dart shorty nailgun timeturner solarrifle',
  MELEE:'knife chainsaw scythe hammer twinsai pike terafists bdaggers',
  UTILITY:'medkit grenade freezer redball portal beachball'
};
const legacyKit={primary:'avalanche',secondary:'sawedoff',melee:'mace',utility:'heavycharge'};
const currentKit={primary:'anchor',secondary:'shorty',melee:'hammer',utility:'grenade'};
const js=JSON.stringify;

test('a party CPU setup with an old peer explains retired equipment instead of hanging or adopting it',()=>{
  const h=gameSimulation();
  h.run(`var aborts=[]; partyCpuAbort=(reason,notify)=>aborts.push([reason,notify]);
    Object.assign(partyCpuMatch,{phase:'waiting',round:0,epoch:20,hostEpoch:10,hostId:'host',humanIds:['host','guest']});
    party.self={id:'host'};var ready={from:'guest',matchEpoch:20,hostEpoch:10,loadout:${js(legacyKit)}};
    partyCpuReceive('cpu_ready',{...ready,from:'other'});
    partyCpuReceive('cpu_ready',{...ready,matchEpoch:19});
    partyCpuReceive('cpu_ready',{...ready,loadout:{}});
    partyCpuMatch.round=1;partyCpuReceive('cpu_ready',ready);partyCpuMatch.round=0;`);
  assert.equal(h.run('aborts.length'),0);
  h.run("partyCpuReceive('cpu_ready',ready)");
  assert.match(h.run('aborts[0][0]'),/RETIRED GEAR/);assert.equal(h.run('aborts[0][1]'),true);
  assert.equal(h.run('!!partyCpuMatch.ready.guest'),false);
  h.run(`party.self={id:'guest'};state='select';selPage='party';
    var start={from:'host',matchEpoch:20,hostEpoch:10,round:1,loadouts:{host:${js(legacyKit)},guest:${js(currentKit)}}};
    partyCpuApplyRoundStart({...start,from:'other'});partyCpuApplyRoundStart(start);`);
  assert.equal(h.run('aborts.length'),2);assert.match(h.run('aborts[1][0]'),/REFRESH AND REJOIN/);
  assert.equal(h.run('partyCpuMatch.round'),0);assert.equal(h.networkCalls(),0);
});

test('one regular pick per role across all four active/seasonal rosters, without publishing reserve gear',()=>{
  const h=gameSimulation();
  for(const [cat,expected] of Object.entries(lineup)){
    const listed=h.json(`(()=>{const row=CATS.find(c=>c[0]==='${cat}');return [...row[2](),...row[3]()];})()`);
    assert.deepEqual(listed.sort(),expected.split(' ').sort(),cat);
    assert.equal(new Set(listed).size,listed.length);
  }
  assert.equal(h.run('WEAPONS.longbow.mag'),1);
  assert.equal(h.run('WEAPONS.anchor.mag'),90);
  assert.ok(h.run('WEAPONS.shotgun.selfRecoil')>0);
  assert.ok(h.run('WEAPONS.nailgun.pierce')>0);
  assert.ok(h.run('WEAPONS.quasar.bounce')>0);
  assert.deepEqual(h.json('Object.entries(VAULT_ACTIVE).filter(([,v])=>!v).map(([k])=>k).sort()'),['railgun','timecapsule','turret']);
});

test('retired IDs are storage-only, never gear, picker entries, fresh offers, remote loadouts or admin publication overrides',()=>{
  const h=gameSimulation(),retired=h.json('RETIRED_EQUIPMENT');
  assert.equal(retired.recurve,'longbow');assert.equal(retired.avalanche,'anchor');
  assert.equal(Object.keys(retired).length,94);
  const publicIds=new Set(h.json('[...WKEYS,...UTILKEYS,...TEMP_UTILITY,...GEM_SHOP.map(i=>i.key),...Object.keys(WEAPON_EDITOR_SLOTS),...CATS.flatMap(c=>weaponBrowserKeys(c[0])),...Object.values(shopWeaponPickerGroups()).flat()]'));
  for(const [key,replacement] of Object.entries(retired)){
    const slot=h.run(`storedLoadoutSlot(${js(replacement)})`);
    assert.ok(['primary','secondary','melee','utility'].includes(slot),key);
    assert.equal(Object.hasOwn(retired,replacement),false,'no chained alias '+key);
    assert.equal(publicIds.has(key),false,key);
    assert.equal(h.run(`!!(WEAPONS[${js(key)}]||UTILITIES[${js(key)}])`),false,key);
    assert.equal(h.run(`applyWeaponDefRealtime({eventType:'INSERT',new:{key:${js(key)},published:true}})`),false,key);
    assert.equal(h.run(`isWeaponPublished(${js(key)})`),false,key);
    assert.equal(h.run(`isLocked(${js(key)})`),true,key);
    assert.equal(h.run(`arenaRemoteLoadout(${js({...currentKit,[slot]:key})})`),null,key);
    assert.equal(h.run(`storedLastLoadout(${js({...currentKit,[slot]:key})})[${js(slot)}]`),replacement,key);
  }
  assert.equal(h.networkCalls(),0);
});

test('a legacy guest loadout survives a save/reload and works in a match; purchases and currencies are not converted',async()=>{
  const h=gameSimulation();
  h.run(`pendingGameMode='arena';gems=173;coins=56;gemOwned={avalanche:true,mace:true};cosmeticOwned={sentinel:true};
    localStorage.setItem(localLoadoutStorageKey(''),${js(js(legacyKit))});lastLoadout=readLastLoadoutLocal('');restoreLastLoadoutForMode('arena');
    syncOwnedWeapons();persistLastLoadoutLocal();`);
  assert.deepEqual(h.json('loadout'),currentKit);
  assert.deepEqual(h.json("readLastLoadoutLocal('')"),currentKit);
  assert.deepEqual(h.json('metaPayload().loadout'),currentKit);
  assert.equal(h.run('arenaLoadoutReady()'),true);
  assert.deepEqual(h.json('({owned:gemOwned,gems,coins,cos:cosmeticOwned})'),{owned:{avalanche:true,mace:true},gems:173,coins:56,cos:{sentinel:true}});
  h.run(`chooseGameMode('ai1v1','offlinecpu');launchSelectedMode();`);await h.settle();
  assert.equal(h.run('arena.phase'),'map_vote');assert.equal(h.run('player.cur'),'anchor');
  assert.deepEqual(h.json('lastLoadout'),currentKit,'launching with a single primary must not erase the full saved kit');
  assert.equal(h.networkCalls(),0);
});

test('an unavailable replacement falls back to a playable item, not a free unlock; null and wrong slots stay safe',()=>{
  const h=gameSimulation();
  h.run(`weaponDefs.anchor={published:false};weaponDefs.smg={published:false};weaponDefs.warpwave={published:false};`);
  const fallback=h.run(`playableLastLoadout(${js(legacyKit)}).primary`);
  assert.equal(h.run(`storedLoadoutSlot(${js(fallback)})`),'primary');
  assert.equal(h.run(`isWeaponPublished(${js(fallback)})&&!isLocked(${js(fallback)})`),true);
  h.run('purgeUnpublishedWeaponState();syncFallAccess();');
  assert.notEqual(h.run("playableLastLoadout({primary:'resonator'}).primary"),'warpwave');
  assert.equal(h.run("isLocked('warpwave')"),true);
  assert.equal(h.run("tryWeaponOnRange('warpwave','dps')"),false);
  assert.equal(h.run('playableLastLoadout({utility:null}).utility'),null);
  assert.notEqual(h.run("storedLastLoadout({secondary:'recurve'}).secondary"),'longbow');
  assert.deepEqual(h.json('gemOwned'),{});
});
