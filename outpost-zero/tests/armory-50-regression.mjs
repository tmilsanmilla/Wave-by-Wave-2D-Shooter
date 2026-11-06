import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {gameSimulation} from './helpers/game-simulation.mjs';

const base=gameSimulation(),keys=base.json('REINFORCEMENT_KEYS');
test('exactly 50 additive reinforcement guns:30primaries/20sidearms, unique profiles, no grants or old stat changes',()=>{
  assert.equal(keys.length,50);assert.equal(new Set(keys).size,50);
  const oldContext=vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('../js/weapons.js',import.meta.url),'utf8'),oldContext);
  const old=JSON.parse(vm.runInContext('JSON.stringify(WEAPONS)',oldContext));
  for(const [key,definition] of Object.entries(old))assert.deepEqual(base.json(`WEAPONS[${JSON.stringify(key)}]`),definition,key+' must remain unchanged');
  const defs=base.json('REINFORCEMENT_KEYS.map(k=>WEAPONS[k])');
  assert.equal(defs.filter(w=>w.armorySlot==='primary').length,30);
  assert.equal(defs.filter(w=>w.armorySlot==='secondary').length,20);
  assert.equal(new Set(base.json('WKEYS.map(k=>WEAPONS[k].name)')).size,base.run('WKEYS.length'));
  const profiles=defs.map(w=>JSON.stringify(['dmg','mag','reload','fireRate','auto','pellets','spread','aimSpread','speed','range','fall','moveMod','pierce','bounce','wave','energy'].map(k=>w[k]??null)));
  assert.equal(new Set(profiles).size,50,'not fifty renamed copies');
  for(const key of keys){
    const w=base.json(`WEAPONS.${key}`);
    for(const f of ['dmg','mag','reload','fireRate','pellets','spread','aimSpread','speed','range','fall','moveMod','len','kick','zoom'])assert.ok(Number.isFinite(w[f]),key+':'+f);
    assert.ok(w.dmg>0&&w.dmg<=185&&w.mag>=1&&w.mag<=100&&w.reload>=800&&w.fireRate>=55&&w.pellets>=1&&w.pellets<=10,key);
    assert.ok(w.fall>0&&w.fall<=1&&w.aimSpread<=w.spread&&w.range>0,key);
    assert.ok(w.gimmick.copy&&w.blurb&&w.armoryAccent&&w.armoryFrame);
    assert.equal(base.run(`WKEYS.filter(k=>k==='${key}').length`),1);
    assert.equal(base.run(`storedLoadoutSlot('${key}')`),w.armorySlot);
    assert.equal(base.run(`savedWeaponPublished('${key}')`),true);
    assert.equal(base.run(`isLocked('${key}')`),false);
    assert.equal(w.phaseWalls,undefined,'new penetrators must not pass through walls');
  }
  assert.deepEqual(base.json('gemOwned'),{});assert.equal(base.networkCalls(),0);
});

function prepareRange(h,key,targetX=160){
  const slot=h.run(`WEAPONS.${key}.armorySlot`);
  h.run(`loadout={primary:'ar',secondary:'m9',melee:'knife',utility:null};loadout.${slot}='${key}';tryStartWeapon='${key}';soloPractice=true;startPractice('dps');
    now+=3000;player.equipEnd=0;player.reloadEnd=0;player.x=100;player.y=100;cam.x=100;cam.y=100;zoom=1;mouse.x=W/2+100;mouse.y=H/2;aiming=true;
    enemies[0].x=${targetX};enemies[0].y=100;enemies[0].r=30;practiceSpawns[0].x=${targetX};practiceSpawns[0].y=100;`);
}
for(const key of keys)test(`${key}:actual equip/fire/hit/cadence/reload/render and solid-wall confinement`,()=>{
  const h=gameSimulation();prepareRange(h,key);
  assert.equal(h.run('player.cur'),key);
  const mag=h.run(`WEAPONS.${key}.mag`),pellets=h.run(`WEAPONS.${key}.pellets`);
  assert.equal(h.run('tryFire()'),true);
  assert.equal(h.run('player.mags[player.cur]'),mag-1);assert.equal(h.run('bullets.length'),pellets);
  assert.equal(h.run('tryFire()'),false,'no double shot at the same instant');
  assert.equal(h.run(`bullets.every(b=>b.weapon==='${key}'&&b.dmg>0&&Number.isFinite(b.vx)&&Number.isFinite(b.vy))`),true);
  h.run('for(let i=0;i<12;i++){now+=1000/60;update(1000/60);}');
  assert.ok(h.run('dpsTotal')>0,'real projectile collision must damage the target');
  h.run(`player.mags['${key}']=0;player.reserve['${key}']=${mag*2};player.reloadEnd=0;startReload();`);
  assert.ok(h.run('player.reloadEnd')>h.run('now'));
  assert.equal(h.run('tryFire()'),false,'cannot fire during reload');
  h.run('now=player.reloadEnd+1;update(1000/60);');
  assert.equal(h.run('player.mags[player.cur]'),mag);assert.equal(h.run('player.reserve[player.cur]'),mag);
  h.run(`drawGunIcon(50,50,'${key}','#fff',1);drawArmoryHeldGun(WEAPONS.${key});drawArmoryHeldGun(WEAPONS.${key},true);`);
  const blocked=gameSimulation();prepareRange(blocked,key,220);
  blocked.run(`activeObstacles=()=>[{x:145,y:0,w:20,h:300}];tryFire();for(let i=0;i<10;i++){now+=1000/60;update(1000/60);}`);
  assert.equal(blocked.run('dpsTotal'),0,'piercing is not wall penetration');
  assert.equal(h.networkCalls()+blocked.networkCalls(),0);
});

for(const key of keys)test(`${key}:peer validates/render/steps exact shot type and rejects replay or uncarried weapon`,()=>{
  const h=gameSimulation(),slot=h.run(`WEAPONS.${key}.armorySlot`);
  h.run(`var kit={primary:'ar',secondary:'m9',melee:'knife',utility:null};kit.${slot}='${key}';arena=freshArena('synthetic');arena.mode='private';arena.active=true;arena.phase='fight';arena.round=1;arena.matchEpoch=1;practiceMode='arena';
    arena.opponent={id:'peer',x:700,y:900,tx:700,ty:900,r:15,hp:250,angle:0,cur:'${key}',loadout:kit};
    var spawned=Array.from({length:WEAPONS.${key}.pellets},()=>({x:706,y:900,vx:weaponBulletSpeed('${key}'),vy:0}));
    var packet={...remoteShotPacketFromBullets('peer:1:1:shot:1','${key}',spawned),from:'peer',epoch:1,round:1};`);
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),true);
  assert.equal(h.run('arena.remoteShots.length'),h.run(`WEAPONS.${key}.pellets`));
  assert.equal(h.run('arena.remoteShots[0].bounce'),h.run(`WEAPONS.${key}.bounce||0`));
  assert.equal(h.run('arena.remoteShots[0].wv'),h.run(`!!WEAPONS.${key}.wave`));
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),false);
  h.run('stepRemoteShotVisuals(arena.remoteShots,16.667);drawArenaOpponentWorld();');
  h.run(`arena.opponent.loadout={primary:'ar',secondary:'m9',melee:'knife',utility:null};packet.id='peer:1:1:shot:2';`);
  assert.equal(h.run('arenaApplyRemoteShot(packet)'),false);assert.equal(h.networkCalls(),0);
});

for(const key of keys.filter(k=>base.run(`WEAPONS.${k}.armorySlot`)==='primary'))test(`${key}:guest CPU launch starts with only its primary and correct ammo`,async()=>{
  const h=gameSimulation();h.run(`chooseGameMode('ai1v1','offlinecpu');loadout.primary='${key}';launchSelectedMode();`);await h.settle();
  assert.equal(h.run('arena.phase'),'map_vote');assert.equal(h.run('player.cur'),key);
  assert.deepEqual(h.json('loadout'),{primary:key,secondary:null,melee:null,utility:null});
  assert.equal(h.run(`player.reserve['${key}']`),h.run(`WEAPONS.${key}.energy?Infinity:WEAPONS.${key}.mag*5`));
  assert.equal(h.networkCalls(),0);
});

for(const [W,H] of [[320,568],[390,844],[844,390],[1280,720]])test(`50newguns reachable via loadout, browser and cosmetics picker at ${W}x${H}`,()=>{
  const h=gameSimulation(W,H);
  for(const [cat,slot] of [['PRIMARY','primary'],['SIDEARM','secondary']]){
    const seen=new Set(),shopSeen=new Set(),browserSeen=new Set();h.run("pendingGameMode='arena';");
    for(let p=0;p<80;p++){
      h.run(`categoryPages.${cat}=${p};cardRects=[];drawCategory('${cat}');`);
      for(const r of h.json('cardRects').filter(r=>!r.tryIt&&!r.gotoShop)){
        assert.ok(r.x>=0&&r.x+r.w<=W&&r.y>=0&&r.y+r.h<=H-65);seen.add(r.key);
      }
      h.run(`shopWeaponPickerCat='${slot}';shopWeaponPickerTarget='cosmetics';categoryPages['shop:${slot}']=${p};shopWeaponPickerRects=[];drawShopWeaponPicker(Math.min(400,W-30),H<520?95:125);`);
      for(const r of h.json('shopWeaponPickerRects').filter(r=>r.kind==='weapon')){
        assert.ok(r.x>=0&&r.x+r.w<=W&&r.y>=0&&r.y+r.h<=H-72);shopSeen.add(r.key);
      }
      h.run(`weaponBrowserCat='${cat}';categoryPages['browse:${cat}']=${p};weaponBrowserRects=[];drawWeaponBrowser();`);
      for(const r of h.json('weaponBrowserRects').filter(r=>r.key))browserSeen.add(r.key);
    }
    for(const key of keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==slot)){
      assert.ok(seen.has(key),'loadout:'+key);assert.ok(shopSeen.has(key),'cosmetics:'+key);assert.ok(browserSeen.has(key),'browser:'+key);
    }
  }
});

test('600new primary/sidearm pairings validate, reversed slots fail and unpublished guns remain blocked',()=>{
  const h=gameSimulation(),primary=keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==='primary'),secondary=keys.filter(k=>h.run(`WEAPONS.${k}.armorySlot`)==='secondary');
  for(const p of primary)for(const s of secondary){
    const kit={primary:p,secondary:s,melee:'knife',utility:null};assert.deepEqual(h.json(`arenaRemoteLoadout(${JSON.stringify(kit)})`),kit);
    assert.equal(h.run(`arenaRemoteLoadout({primary:'${s}',secondary:'${p}',melee:'knife'})`),null);
  }
  for(const key of keys){
    h.run(`weaponDefs['${key}']={published:false};`);assert.equal(h.run(`isLocked('${key}')`),true);
    const slot=h.run(`WEAPONS.${key}.armorySlot`),kit={primary:'ar',secondary:'m9',melee:'knife',utility:null};kit[slot]=key;
    assert.equal(h.run(`arenaRemoteLoadout(${JSON.stringify(kit)})`),null);
  }
  assert.deepEqual(h.json('gemOwned'),{});assert.equal(h.networkCalls(),0);
});

for(const key of ['quasar','capacitor'])test(`${key}:real local and peer wall ricochets spend a bounded bounce`,()=>{
  const h=gameSimulation();prepareRange(h,key,500);
  h.run(`activeObstacles=()=>[{x:145,y:0,w:20,h:300}];tryFire();var originalBounce=bullets[0].bounce;var visual=bullets.map(b=>({...b}));
    for(let i=0;i<3;i++){now+=1000/60;update(1000/60);stepRemoteShotVisuals(visual,1000/60);}`);
  assert.equal(h.run('bullets.length'),1);assert.equal(h.run('visual.length'),1);
  assert.equal(h.run('bullets[0].bounce'),h.run('originalBounce-1'));assert.equal(h.run('visual[0].bounce'),h.run('originalBounce-1'));
  assert.ok(h.run('bullets[0].vx')<0);assert.ok(h.run('visual[0].vx')<0);
});

test('peers from the earlier 35-gun release fail the reinforcement handshake clearly',()=>{
  const h=gameSimulation();h.run(`var cfg={matchId:'00000000-0000-4000-8000-000000000099',epoch:'fixture',hostId:'host',mode:'1v1',source:'queue',ranked:false,
    roster:[{id:'host',team:'A',loadout:{primary:'ar',secondary:'m9',melee:'knife'}},{id:'peer',team:'B',loadout:{primary:'ar',secondary:'m9',melee:'knife'}}]};
    multidevice=multideviceCreate(cfg,'host',10000);multidevice.loadoutRequired=true;multidevice.movementRequired=true;multidevice.channel={};
    var p={from:'peer',matchId:cfg.matchId,epoch:cfg.epoch,round:0,loadoutVersion:2,movementVersion:1};`);
  assert.equal(h.run("multideviceReceive('ready',p,multidevice.channel)"),false);assert.match(h.run('multidevice.status'),/REFRESH/);
  h.run('p.loadoutVersion=3;');assert.equal(h.run("multideviceReceive('ready',p,multidevice.channel)"),true);
  assert.equal(h.run('ARENA_PROTOCOL'),7);
});

test('bounded publication fetch fits the whole expanded registry and retains a late unpublished sidearm',async()=>{
  const h=gameSimulation();
  h.run(`var requestedLimit=0;var catalogRows=Object.keys(WEAPON_EDITOR_SLOTS).map(key=>({key,stats:{},published:key!=='capacitor'}));
    sb={from:table=>{if(table!=='weapon_defs')throw new Error('Unexpected table');return {select:()=>({limit:n=>{requestedLimit=n;return Promise.resolve({data:catalogRows.slice(0,n),error:null});}})};}};`);
  assert.equal(await h.run('fetchWeaponDefs()'),true);
  assert.ok(h.run('requestedLimit')>=h.run('catalogRows.length'));
  assert.ok(h.run('requestedLimit')<=256,'catalog reads remain bounded');
  assert.ok(h.run('catalogRows.findIndex(r=>r.key==="capacitor")')>=80,'the fixture exercises the old truncation boundary');
  assert.equal(h.run('weaponDefs.capacitor.published'),false);
  assert.equal(h.run('isWeaponPublished("capacitor")'),false);
  assert.equal(h.run('isLocked("capacitor")'),true);
  assert.equal(h.run('isWeaponPublished("peregrine")'),true);
  assert.equal(h.networkCalls(),0,'synthetic command result only; no hosted query');
});

test('currency HUD never covers narrow armory cards, while the desktop balance remains visible',()=>{
  for(const width of [320,390,844]){
    const h=gameSimulation(width,844);
    for(const page of ['weapons','weaponbrowse','loadout','PRIMARY','SIDEARM','MELEE','UTILITY']){
      h.draws.length=0;h.run(`state='select';selPage='${page}';drawCurrencyHUD();`);assert.equal(h.draws.length,0,page);
    }
  }
  const desktop=gameSimulation();desktop.draws.length=0;desktop.run("state='select';selPage='weaponbrowse';drawCurrencyHUD();");assert.ok(desktop.draws.length>=3);
});
