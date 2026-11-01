import assert from 'node:assert/strict';
import test from 'node:test';
import {gameSimulation} from './helpers/game-simulation.mjs';

const baseline=gameSimulation(),keys=baseline.json('ARMORY_EXPANSION_KEYS');
test('the expansion adds exactly 35 unique named guns:24primary/11sidearm, no replacement or grants',()=>{
  assert.equal(keys.length,35);assert.equal(new Set(keys).size,35);
  const defs=baseline.json('ARMORY_EXPANSION.map(([key])=>({key,...WEAPONS[key]}))');
  assert.equal(new Set(defs.map(d=>d.name)).size,35);
  assert.equal(defs.filter(d=>d.armorySlot==='primary').length,24);
  assert.equal(defs.filter(d=>d.armorySlot==='secondary').length,11);
  assert.equal(baseline.run('WEAPONS.volt.dmg'),24);assert.equal(baseline.run('WEAPONS.volt.fireRate'),145);
  assert.deepEqual(baseline.json('gemOwned'),{});
  for(const d of defs){
    for(const field of ['dmg','mag','reload','fireRate','pellets','spread','aimSpread','speed','range','fall','moveMod','len','kick','zoom'])
      assert.ok(Number.isFinite(d[field]),d.key+':'+field);
    assert.ok(d.dmg>0&&d.mag>=1&&d.mag<=90&&d.reload>=800&&d.fireRate>=55&&d.pellets>=1&&d.pellets<=10);
    assert.ok(d.fall>0&&d.fall<=1&&d.aimSpread<=d.spread&&d.range>0);
    assert.ok(d.gimmick?.copy&&d.blurb&&d.armoryFrame&&d.armoryAccent);
    assert.equal(baseline.run(`storedLoadoutSlot('${d.key}')`),d.armorySlot);
    assert.equal(baseline.run(`WKEYS.filter(k=>k==='${d.key}').length`),1);
    assert.equal(baseline.run(`savedWeaponPublished('${d.key}')`),true);
    assert.equal(baseline.run(`isLocked('${d.key}')`),false);
  }
});

for(const key of keys)test(`${key}:actual Practice→equip→fire→dummy damage→finite-mag reload`,()=>{
  const h=gameSimulation(),slot=h.run(`WEAPONS.${key}.armorySlot`);
  h.run(`loadout={primary:'ar',secondary:'m9',melee:'knife',utility:null};loadout.${slot}='${key}';tryStartWeapon='${key}';soloPractice=true;startPractice('dps');
    now+=3000;player.equipEnd=0;player.reloadEnd=0;player.x=100;player.y=100;cam.x=player.x;cam.y=player.y;zoom=1;mouse.x=W/2+100;mouse.y=H/2;aiming=true;
    enemies[0].x=160;enemies[0].y=100;enemies[0].r=30;practiceSpawns[0].x=160;practiceSpawns[0].y=100;`);
  assert.equal(h.run('player.cur'),key);
  const mag=h.run(`WEAPONS.${key}.mag`),pellets=h.run(`WEAPONS.${key}.pellets`);
  assert.equal(h.run('tryFire()'),true);assert.equal(h.run('player.mags[player.cur]'),mag-1);
  assert.equal(h.run('bullets.length'),pellets);assert.equal(h.run('tryFire()'),false);
  assert.equal(h.run(`bullets.every(b=>b.weapon==='${key}'&&b.dmg>0&&Number.isFinite(b.vx)&&Number.isFinite(b.vy))`),true);
  h.run(`for(let i=0;i<12;i++){now+=1000/60;update(1000/60);}`);
  assert.ok(h.run('dpsTotal')>0,'real projectile collision must damage the dummy');
  if(h.run(`WEAPONS.${key}.poison===true`))assert.ok(h.run('enemies[0].poisonStacks')>0);
  if(h.run(`WEAPONS.${key}.fire===true`))assert.ok(h.run('enemies[0].burnUntil>now'));
  if(h.run(`WEAPONS.${key}.chrono===true`))assert.ok(h.run('enemies[0].chronoStacks')>0);
  h.run(`player.mags['${key}']=0;player.reserve['${key}']=${mag*2};player.reloadEnd=0;startReload();`);
  assert.ok(h.run('player.reloadEnd')>h.run('now'));
  h.run('now=player.reloadEnd+1;update(1000/60);');
  assert.equal(h.run('player.mags[player.cur]'),mag);assert.equal(h.run('player.reserve[player.cur]'),mag);
  h.run(`drawGunIcon(50,50,'${key}','#fff',1);drawArmoryHeldGun(WEAPONS.${key});drawArmoryHeldGun(WEAPONS.${key},true);`);
  assert.equal(h.networkCalls(),0);
});

for(const [W,H] of [[320,568],[390,844],[844,390],[1280,720]])test(`all35loadout/armory/shop choices remain reachable and bounded ${W}x${H}`,()=>{
  const h=gameSimulation(W,H);
  for(const [cat,slot] of [['PRIMARY','primary'],['SIDEARM','secondary']]){
    const seen=new Set();h.run(`pendingGameMode='arena';`);
    for(let p=0;p<40;p++){
      h.run(`categoryPages.${cat}=${p};cardRects=[];drawCategory('${cat}');`);
      for(const r of h.json('cardRects').filter(r=>!r.tryIt&&!r.gotoShop)){
        assert.ok(r.x>=0&&r.x+r.w<=W);assert.ok(r.y>=0&&r.y+r.h<=H-65);seen.add(r.key);
      }
    }
    for(const key of keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==slot))assert.ok(seen.has(key),key);
    const shopSeen=new Set();
    for(let p=0;p<40;p++){
      h.run(`shopWeaponPickerCat='${slot}';shopWeaponPickerTarget='cosmetics';categoryPages['shop:${slot}']=${p};shopWeaponPickerRects=[];drawShopWeaponPicker(Math.min(400,W-30),H<520?95:125);`);
      for(const r of h.json('shopWeaponPickerRects').filter(r=>r.kind==='weapon')){
        assert.ok(r.x>=0&&r.x+r.w<=W);assert.ok(r.y>=0&&r.y+r.h<=H-72,`${r.key} stays above Back`);shopSeen.add(r.key);
      }
    }
    for(const key of keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==slot))assert.ok(shopSeen.has(key),key);
  }
});

test('new guns use existing publication enforcement;unpublishing cannot be bypassed by a loadout',()=>{
  const h=gameSimulation();
  for(const key of keys){
    h.run(`weaponDefs['${key}']={published:false};`);
    assert.equal(h.run(`isLocked('${key}')`),true);
    assert.equal(h.run(`arenaRemoteLoadout({primary:'${key}',secondary:'m9',melee:'knife'})`),null);
  }
  assert.deepEqual(h.json('gemOwned'),{});assert.equal(h.networkCalls(),0);
});

for(const key of keys)test(`${key}:remote receiver renders its real pellet count and rejects replay/unowned shots`,()=>{
  const h=gameSimulation(),slot=h.run(`WEAPONS.${key}.armorySlot`);
  h.run(`var peerKit={primary:'ar',secondary:'m9',melee:'knife',utility:null};peerKit.${slot}='${key}';
    arena=freshArena('synthetic receiver');arena.mode='private';arena.active=true;arena.phase='fight';arena.round=1;arena.matchEpoch=1;practiceMode='arena';
    arena.opponent={id:'peer',x:700,y:900,tx:700,ty:900,r:15,hp:250,angle:0,cur:'${key}',loadout:peerKit};
    var realShots=Array.from({length:WEAPONS.${key}.pellets},()=>({x:706,y:900,vx:weaponBulletSpeed('${key}'),vy:0}));
    var packet={...remoteShotPacketFromBullets('peer:1:1:shot:1','${key}',realShots),from:'peer',epoch:1,round:1};`);
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),true);
  assert.equal(h.run('arena.remoteShots.length'),h.run(`WEAPONS.${key}.pellets`));
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),false,'a replay cannot duplicate enemy bullets');
  h.run('drawArenaOpponentWorld();');
  h.run(`arena.opponent.loadout={primary:'ar',secondary:'m9',melee:'knife',utility:null};packet.id='peer:1:1:shot:2';`);
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),false,'a peer cannot shoot an uncarried weapon');
  assert.equal(h.networkCalls(),0);
});

for(const key of keys.filter(k=>baseline.run(`WEAPONS.${k}.armorySlot`)==='primary'))test(`${key}:primary-only guest CPU launch accepts its exact new weapon`,async()=>{
  const h=gameSimulation();h.run(`chooseGameMode('ai1v1','offlinecpu');loadout.primary='${key}';launchSelectedMode();`);await h.settle();
  assert.equal(h.run('arena.phase'),'map_vote');assert.equal(h.run('player.cur'),key);
  assert.equal(h.run(`player.reserve['${key}']`),h.run(`WEAPONS.${key}.energy?Infinity:WEAPONS.${key}.mag*5`));
  assert.deepEqual(h.json('loadout'),{primary:key,secondary:null,melee:null,utility:null});assert.equal(h.networkCalls(),0);
});

test('every new primary/sidearm pairing validates in its actual online slots',()=>{
  const h=gameSimulation(),primaries=keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==='primary'),sidearms=keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==='secondary');
  for(const primary of primaries)for(const secondary of sidearms){
    const kit={primary,secondary,melee:'knife',utility:null};
    assert.deepEqual(h.json(`arenaRemoteLoadout(${JSON.stringify(kit)})`),kit);
    assert.equal(h.run(`arenaRemoteLoadout({primary:'${secondary}',secondary:'${primary}',melee:'knife'})`),null);
  }
});

test('new team match handshake refuses pre-armory peers without entering combat',()=>{
  const h=gameSimulation();h.run(`var cfg={matchId:'00000000-0000-4000-8000-000000000099',epoch:'synthetic',hostId:'host',mode:'1v1',source:'queue',ranked:false,
    roster:[{id:'host',team:'A',loadout:{primary:'ar',secondary:'m9',melee:'knife'}},{id:'peer',team:'B',loadout:{primary:'ar',secondary:'m9',melee:'knife'}}]};
    multidevice=multideviceCreate(cfg,'host',10000);multidevice.loadoutRequired=true;multidevice.movementRequired=true;multidevice.channel={};
    var ready={from:'peer',matchId:cfg.matchId,epoch:cfg.epoch,round:0,loadoutVersion:1,movementVersion:1};`);
  assert.equal(h.run(`multideviceReceive('ready',ready,multidevice.channel)`),false);
  assert.equal(h.run(`multidevice.ready.has('peer')`),false);assert.equal(h.run('multidevice.phase'),'setup');
  assert.match(h.run('multidevice.status'),/REFRESH/);
});
