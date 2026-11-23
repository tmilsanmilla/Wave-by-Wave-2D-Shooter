import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {gameSimulation} from './helpers/game-simulation.mjs';

const melees=['pike'],utilities=['grenade','freezer','redball'];
const root=new URL('../',import.meta.url);
function prepare(h,key){
  h.run(`loadout={primary:'ar',secondary:'m9',melee:'${melees.includes(key)?key:'knife'}',utility:${utilities.includes(key)?`'${key}'`:'null'}};
    soloPractice=true;tryStartWeapon=${melees.includes(key)?`'${key}'`:'null'};startPractice('dps');now+=3000;player.equipEnd=0;player.reloadEnd=0;
    player.x=700;player.y=900;cam.x=700;cam.y=900;zoom=1;mouse.x=W/2+200;mouse.y=H/2;aiming=false;
    enemies[0].x=760;enemies[0].y=900;practiceSpawns[0].x=760;practiceSpawns[0].y=900;dpsPrevHp=enemies[0].hp;var initialDummyHp=enemies[0].hp;`);
}
test('Pike remains live with its own thrust; standard utilities retain publication and ownership checks',()=>{
  const h=gameSimulation(),context=vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('js/weapons.js',root),'utf8'),context);
  const before=JSON.parse(vm.runInContext('JSON.stringify({WEAPONS,UTILITIES})',context));
  for(const [key,w] of Object.entries(before.WEAPONS))assert.deepEqual(h.json(`WEAPONS['${key}']`),w);
  for(const [key,u] of Object.entries(before.UTILITIES))assert.deepEqual(h.json(`UTILITIES['${key}']`),u);
  assert.deepEqual(h.json('FIELD_MELEE_KEYS'),melees);assert.deepEqual(h.json('FIELD_UTILITY_KEYS'),[]);
  for(const key of [...melees,...utilities]){
    const melee=melees.includes(key);assert.equal(h.run(`storedLoadoutSlot('${key}')`),melee?'melee':'utility');
    assert.equal(h.run(`isLocked('${key}')`),false);assert.equal(h.run(`savedWeaponPublished('${key}')`),true);
    assert.equal(h.run(`(MELEES.includes('${key}')?MELEES:UTILKEYS).filter(k=>k==='${key}').length`),1);
    assert.ok(h.run(`weaponDetails('${key}').length`)>5);
    h.run(`weaponDefs['${key}']={published:false,stats:{}};`);
    assert.equal(h.run(`isLocked('${key}')`),true,'publication remains mandatory');
  }
  assert.deepEqual(h.json('gemOwned'),{});assert.equal(h.networkCalls(),0);
});
for(const key of melees)test(`${key}: actual Practice swing, ability, cooldown, quick-melee restoration and artwork`,()=>{
  const h=gameSimulation();prepare(h,key);
  assert.equal(h.run('player.cur'),key);assert.equal(h.run('tryFire()'),true);
  assert.equal(h.run('initialDummyHp-enemies[0].hp'),h.run(`WEAPONS.${key}.dmg`));assert.equal(h.run('tryFire()'),false);
  h.run('enemies[0].x=760;now+=2000;meleeAbility();');
  assert.ok(Math.abs(h.run('initialDummyHp-enemies[0].hp')-h.run(`WEAPONS.${key}.dmg*(1+WEAPONS.${key}.fieldSkill.mul)`))<1e-5);
  assert.equal(h.run(`abilityCD.${key}-now`),h.run(`WEAPONS.${key}.fieldSkill.cd`));
  const total=h.run('enemies[0].hp');h.run('meleeAbility();');assert.equal(h.run('enemies[0].hp'),total);
  assert.equal(h.run('player.meleeFxKey'),key);
  assert.equal(h.run('drawMeleeAbilityVisual(player,now+1,false,true)'),true);
  h.run(`drawMeleeWeaponSilhouette('${key}');drawMeleeWeaponSilhouette('${key}',true);drawGunIcon(40,40,'${key}','white',1);`);
  assert.equal(h.run('drawMeleeAbilityVisual(player,player.meleeFxUntil+1)'),false);
  h.run('now+=10000;player.cur="ar";player.equipEnd=0;mouse.down=false;quickMelee();');
  assert.equal(h.run('player.cur'),'ar');assert.equal(h.run('player.meleeFxKey'),key);
  assert.equal(h.networkCalls(),0);
});
for(const key of melees)test(`${key}: Arena ability respects solid cover and exact remote carried-key animation`,()=>{
  const h=gameSimulation();prepare(h,key);
  h.run(`practiceMode='arena';arena=freshArena();arena.active=true;arena.mode='private';arena.phase='fight';arena.round=1;arena.matchEpoch=1;arena.roundEndAt=Date.now()+60000;
    arena.opponent={id:'peer',x:760,y:900,tx:760,ty:900,r:15,hp:250,loadout:{primary:'ar',secondary:'m9',melee:'${key}',utility:null}};
    enemies=[];var hitDamage=0;arenaHitOpponent=d=>{hitDamage+=d;};activeObstacles=()=>[{x:720,y:850,w:20,h:100}];meleeAbility();`);
  assert.equal(h.run('hitDamage'),0);
  h.run('now+=10000;activeObstacles=()=>[];meleeAbility();');
  assert.equal(h.run('hitDamage'),h.run(`WEAPONS.${key}.dmg*WEAPONS.${key}.fieldSkill.mul`));
  h.run(`var remoteFx={meleeFxSeq:1,meleeFxKey:'${key}',meleeFxMs:WEAPONS.${key}.fieldSkill.visualMs,meleeFxAngle:0};`);
  assert.equal(h.run('arenaApplyRemoteMeleeAbilityState(arena.opponent,remoteFx,arena.opponent.loadout,now)'),true);
  assert.equal(h.run('drawMeleeAbilityVisual(arena.opponent,now+1,true)'),true);
  h.run("arena.opponent.loadout.melee='knife';remoteFx.meleeFxSeq=2;");
  assert.equal(h.run('arenaApplyRemoteMeleeAbilityState(arena.opponent,remoteFx,arena.opponent.loadout,now)'),false);
});
for(const key of ['grenade'])test(`${key}: actual throw/fuse/detonation uses own trusted radius, damage, falloff and cooldown`,()=>{
  const h=gameSimulation();prepare(h,key);h.run(`utilCast('${key}');`);
  assert.equal(h.run('grenades.length'),1);assert.equal(h.run('grenades[0].utilityKey'),key);
  assert.equal(h.run('grenades[0].t-now'),h.run(`UTILITIES.${key}.fuseMs||950`));
  assert.equal(h.run('grenades[0].vx'),h.run(`UTILITIES.${key}.speed||14`));
  assert.equal(h.run('utilReadyT-now'),h.run(`UTILITIES.${key}.cd`));
  assert.equal(h.run(`fragDamageAtDistance(fragBlastRadius('${key}')/2,false,'${key}')`),h.run(`UTILITIES.${key}.dmg/2`));
  assert.equal(h.run(`fragDamageAtDistance(fragBlastRadius('${key}'),false,'${key}')`),0);
  h.run(`utilCast('${key}');`);assert.equal(h.run('grenades.length'),1,'cooldown prevents a second throw');
  h.run('grenades[0].vx=0;grenades[0].vy=0;enemies[0].x=grenades[0].x;enemies[0].y=grenades[0].y;now=grenades[0].t;update(1000/60);');
  assert.equal(h.run('grenades.length'),0);assert.equal(h.run('initialDummyHp-enemies[0].hp'),h.run(`UTILITIES.${key}.dmg`));
});
test('Freezer travels, stops at walls, uses own radius/freeze and self-freezes; cover shields blast',()=>{
  const h=gameSimulation();prepare(h,'freezer');h.run("utilCast('freezer');");
  assert.equal(h.run('grenades[0].vx'),11.25);assert.equal(h.run('grenades[0].t-now'),1580);
  assert.equal(h.run('utilReadyT-now'),12500);assert.equal(h.run('playerFrozenUntil'),0);
  h.run('activeObstacles=()=>[{x:725,y:850,w:10,h:100}];var cryo=grenades[0];');
  for(let i=0;i<5&&!h.run('updateFreezerProjectile(cryo,1)');i++);
  assert.ok(h.run('cryo.x')<725);h.run('detonateFreezer(cryo);');
  assert.equal(h.run('freezeFx[0].r'),105);assert.equal(h.run('playerFrozenUntil-now'),2500);
  assert.equal(h.run('enemies[0].frozenUntil||0'),0,'opposite side of wall stays unfrozen');
});
test('Red Ball is the surviving mobile taunt utility',()=>{
  const h=gameSimulation();prepare(h,'redball');h.run("utilCast('redball');");
  assert.deepEqual(h.json('({life:balls[0].life,vx:balls[0].vx,taunt:balls[0].taunt,cd:utilReadyT-now})'),
    {life:3000,vx:6,taunt:750,cd:11000});
  h.run('drawUtilIcon(40,40,"redball","white",1);update(1000/60);');assert.ok(h.run('balls[0].life')<3000);
});
function preparePeer(h,key){
  h.run(`arena=freshArena();practiceMode='arena';arena.mode='private';arena.active=true;arena.phase='fight';arena.round=1;arena.matchEpoch=1;
    authUser={id:'local'};arena.matchChannel={send(){return Promise.resolve();}};arena.roundEndAt=Date.now()+60000;
    arena.opponent={id:'peer',x:700,y:900,tx:700,ty:900,r:15,hp:250,loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:'${key}'}};
    var p={from:'peer',epoch:1,round:1,id:'peer:1:1:utility:1',utility:'${key}',x:700,y:900,angle:0,vx:4.5,vy:0,
      dmg:99999,range:99999,radius:99999,fuseMs:1,freezeMs:99999,lifeMs:99999};`);
}
for(const key of utilities)test(`${key}: Casual reconstructs trusted stats, requires carried key, and rejects replay/cooldown/malformed packets`,()=>{
  const h=gameSimulation();preparePeer(h,key);
  h.run('p.angle=NaN;p.vx=NaN;');assert.equal(h.run('arenaApplyRemoteUtility(p)'),false);
  h.run('p.angle=0;p.vx=4.5;');assert.equal(h.run('arenaApplyRemoteUtility(p)'),true);
  if(key==='redball')assert.equal(h.run('balls[0].life'),3000);
  else{
    assert.equal(h.run('grenades[0].utilityKey'),key);
    assert.equal(h.run('grenades[0].t-now'),h.run(`UTILITIES.${key}.fuseMs||950`));
    assert.equal(h.run('grenades[0].vx'),h.run(`UTILITIES.${key}.speed||14`));
  }
  assert.equal(h.run('arenaApplyRemoteUtility(p)'),false);
  h.run("p.id='peer:1:1:utility:2';");assert.equal(h.run('arenaApplyRemoteUtility(p)'),false);
  h.run("arena.remoteUtilityReadyAt.clear();arena.opponent.loadout.utility='medkit';");
  assert.equal(h.run('arenaApplyRemoteUtility(p)'),false);
});
for(const key of utilities)test(`${key}: multi-device reconstructs same exact kit; allies are not frozen by teammate Freezer`,()=>{
  const h=gameSimulation();
  h.run(`var config={matchId:'00000000-0000-4000-8000-000000000099',epoch:'fixture',hostId:'host',mode:'2v2',source:'party',ranked:false,
    roster:[{id:'host',team:'A',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null}},
      {id:'peer',team:'A',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:'${key}'}},
      {id:'enemy1',team:'B',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null}},
      {id:'enemy2',team:'B',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null}}]};
    multidevice=multideviceCreate(config,'host',10000);multidevice.phase='fight';multidevice.round=1;
    var p={from:'peer',id:'peer:1:1:utility:1',utility:'${key}',x:700,y:900,angle:0,vx:4.5,vy:0};
    multidevice.actors.peer.tx=700;multidevice.actors.peer.ty=900;`);
  assert.equal(h.run('multideviceRemoteUtility(p)'),true);assert.equal(h.run('multideviceRemoteUtility(p)'),false);
  if(key==='freezer'){
    assert.equal(h.run('grenades[0].multideviceAlly'),true);
    h.run('player.x=700;player.y=900;detonateFreezer(grenades[0]);');assert.equal(h.run('playerFrozenUntil'),0);
  }else if(key==='redball')assert.equal(h.run('balls[0].taunt'),750);
  else assert.equal(h.run('grenades[0].utilityKey'),key);
});
for(const [width,height] of [[320,568],[390,844],[844,390],[1280,720]])test(`surviving melee/utilities reachable on loadout and catalog at ${width}x${height}`,()=>{
  const h=gameSimulation(width,height);
  for(const [cat,keys] of [['MELEE',melees],['UTILITY',utilities]]){
    const seen=new Set(),browsed=new Set();h.run("pendingGameMode='arena';");
    for(let p=0;p<20;p++){
      h.run(`categoryPages['${cat}']=${p};cardRects=[];drawCategory('${cat}');`);
      for(const r of h.json('cardRects').filter(r=>r.key&&!r.tryIt&&!r.gotoShop)){
        assert.ok(r.x>=0&&r.x+r.w<=width&&r.y>=0&&r.y+r.h<=height);seen.add(r.key);
      }
      h.run(`weaponBrowserCat='${cat}';categoryPages['browse:${cat}']=${p};weaponBrowserRects=[];drawWeaponBrowser();`);
      for(const r of h.json('weaponBrowserRects').filter(r=>r.key))browsed.add(r.key);
    }
    for(const key of keys){assert.ok(seen.has(key),'loadout:'+key);assert.ok(browsed.has(key),'catalog:'+key);}
  }
});
function luminance(hex){return [...hex.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16)/255)
  .map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);}
test('all map floors are substantially brighter, distinct and maintain dark cover contrast without geometry changes',()=>{
  const h=gameSimulation(),themes=h.json('MAP_VISUAL_THEMES');
  assert.equal(new Set(Object.values(themes).map(t=>t.floor)).size,4);
  for(const [key,t] of Object.entries(themes)){
    assert.ok(luminance(t.floor)>.055,key+' is visibly brighter than the former near-black floor');
    assert.ok(luminance(t.floor)>luminance(t.wall)*1.5,key+' retains dark solid cover');
    assert.ok(luminance(t.trim)>luminance(t.floor)*2,key+' retains a bright wall outline');
  }
  for(const mapId of ['arena','dimension','construction']){
    h.run(`loadout={primary:'ar',secondary:null,melee:null,utility:null};startBotArena({ladderReady:true});arena.mapId='${mapId}';arenaBotStartRound();`);
    const geometry=h.json('activeArenaMap()');h.run('drawWorld();');assert.deepEqual(h.json('activeArenaMap()'),geometry);
    assert.equal(h.run('worldVisualTheme(activeArenaMapId(),true)===MAP_VISUAL_THEMES[activeArenaMapId()]'),true);
  }
  h.run('practiceMode=null;arena.active=false;drawWorld();');
  assert.equal(h.run("worldVisualTheme('arena',false)===MAP_VISUAL_THEMES.endless"),true);
  assert.equal(h.networkCalls(),0);
});
