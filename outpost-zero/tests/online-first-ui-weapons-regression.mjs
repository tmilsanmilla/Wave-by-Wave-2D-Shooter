import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=name=>fs.readFileSync(new URL('../js/'+name,import.meta.url),'utf8'),ui=read('ui.js');
function fn(source,name){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0,name);return source.slice(start,end<0?undefined:end);
}
function uiHarness(W,H){
  const texts=[],shapes=[],canvas=new Proxy({
    fillText:(...args)=>texts.push(args),measureText:t=>({width:String(t).length*7}),
    fillRect:(...args)=>shapes.push(args),createLinearGradient:()=>({addColorStop:()=>{}})
  },{get:(target,key)=>key in target?target[key]:(()=>{})});
  const c={ctx:canvas,W,H,Math,Number,Object,Array,String,Map,Set,console,
    Date:{now:()=>1000},performance:{now:()=>1000},now:1000,mouse:{x:-1,y:-1},
    loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},pendingGameMode:'endless',selPage:'hub',pendingPractice:null,loadoutBackPage:'hub',
    modeBoardNotice:'',modeBoardNoticeT:0,pracNeedMsgT:0,detailKey:null,backRect:null,deployRect:null,catBtns:[],
    selBg:()=>{},sfx:()=>{},isLocked:()=>false,isWeaponPublished:()=>true,gemOwned:{},GEM_SHOP:[],
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),fitLine:(t,w)=>String(t).slice(0,Math.max(1,Math.floor(w/7))),
    wrapTextClamped:()=>{},statBar:()=>{},drawGunIcon:()=>{},drawUtilIcon:()=>{},
    cardRects:[],detailBtns:[],categoryPages:{},categoryPageRects:[],
    ROLECOL:{PRIMARY:'#e8b658',SIDEARM:'#a7c15e',MELEE:'#8fb3c9',UTILITY:'#c98fb8'},
    sb:null,authUser:null,arena:{phase:'idle'},duelService:{},
    isAdmin:()=>false,accountTriggerMetrics:()=>({x:0,w:100}),gearMetrics:()=>({x:W-50}),
    gems:0,coins:0,party:{accepted:false,directCpu:false},dailyTasks:[],
    compactStatus:false,pendingCancelRect:null,diffRects:[],homePlayRects:[],hubPostsRect:null,
    leftColTop:0,boardPanelRect:null,leaderboardRowRects:[],
    drawHubPosts:top=>top,drawHomeLeaderboards:()=>{},pendingReferralId:()=>'',
    referralMsgT:0,fallInjected:false,streakBtnRect:null,streakClaimable:()=>false,
    streakClaimBusy:false,streakDays:0,streakMsgT:0,utilLockMsgT:0,settingsBtnRect:null,tutBtnRect:null,shopBtnRect:null,toolsBtnRect:null,
  };
  vm.createContext(c);vm.runInContext(read('weapons.js'),c);vm.runInContext(read('armory-reinforcements.js'),c);vm.runInContext(read('loadout-flow.js'),c);
  vm.runInContext(`CATS=[['PRIMARY','primary',()=>PRIMARIES,()=>TEMP_PRIMARY],['SIDEARM','secondary',()=>SECONDARIES,()=>TEMP_SECONDARY],['MELEE','melee',()=>MELEES,()=>TEMP_MELEE],['UTILITY','utility',()=>UTILKEYS,()=>TEMP_UTILITY]];`,c);
  for(const name of ['duelUiButton'])vm.runInContext(fn(read('duels-ui.js'),name),c);
  for(const name of ['slotFor','hubUtilityLayout','drawHub','drawLoadout','drawCategory','drawCard'])vm.runInContext(fn(ui,name),c);
  return {c,texts,shapes,run:code=>vm.runInContext(code,c)};
}
for(const [W,H] of [[390,844],[1280,720],[844,390],[320,568]]){
  test(`online hero, armory and settings do not overlap at ${W}x${H}`,()=>{
    const {c}=uiHarness(W,H);c.drawHub();
    const [online,offline,practice,social,weapons]=c.homePlayRects;
    assert.equal(online.id,'play');assert.equal(online.w,weapons.w);assert.equal(weapons.id,'weapons');
    assert.ok(online.y+online.h<=offline.y);assert.equal(offline.y,practice.y);assert.equal(social.y,practice.y);
    assert.ok(social.y+social.h<=weapons.y);assert.ok(weapons.y+weapons.h<=c.settingsBtnRect.y);
    if(c.boardPanelRect)assert.ok(weapons.y+weapons.h<=c.boardPanelRect.y,'Play and armory precede leaderboards');
    assert.ok(c.toolsBtnRect.y+c.toolsBtnRect.h<=H);
  });
  test(`weapon picker pages every new primary inside ${W}x${H}`,()=>{
    const h=uiHarness(W,H),seen=new Set();
    for(let page=0;page<40;page++){
      h.run(`categoryPages.PRIMARY=${page}`);h.c.cardRects=[];h.c.detailBtns=[];h.c.drawCategory('PRIMARY');
      for(const r of h.c.cardRects.filter(r=>!r.tryIt&&!r.gotoShop)){
        assert.ok(r.x>=0&&r.x+r.w<=W);assert.ok(r.y>=0&&r.y+r.h<=h.c.backRect.y-28);seen.add(r.key);
      }
    }
    for(const key of h.run('PRIMARIES.concat(TEMP_PRIMARY)'))assert.ok(seen.has(key),key+' must be reachable');
  });
  test(`offline loadout shows one primary; online retains full slots at ${W}x${H}`,()=>{
    const {c}=uiHarness(W,H);c.drawLoadout();assert.equal(c.catBtns.length,1);assert.equal(c.catBtns[0].cat,'PRIMARY');
    c.pendingGameMode='arena';c.drawLoadout();assert.equal(c.catBtns.length,4);
    c.pendingGameMode='ranked1v1';c.drawLoadout();assert.equal(c.catBtns.length,3);
    for(const r of [...c.catBtns,c.deployRect,c.backRect])assert.ok(r.y+r.h<=H);
  });
  test(`browse-only armory keeps all new weapons reachable at ${W}x${H}`,()=>{
    const h=uiHarness(W,H),seen=new Set();h.c.weaponBrowserCat='PRIMARY';h.c.weaponBrowserRects=[];
    h.c.drawWeaponBrowserCard=(key,_cat,x,y,w,height)=>{
      seen.add(key);assert.ok(height>=75);
      const bottom=H-Math.max(8,Math.min(22,W*.04))-(H<400?33:44);
      assert.ok(x>=0&&x+w<=W&&y+height<=bottom+0.001);
    };
    h.run("weaponBrowserKeys=cat=>{const row=CATS.find(c=>c[0]===cat);return row[2]().concat(row[3]());}");
    vm.runInContext(fn(ui,'drawWeaponBrowser'),h.c);
    for(let page=0;page<40;page++){h.run(`categoryPages['browse:PRIMARY']=${page}`);h.c.drawWeaponBrowser();}
    for(const key of h.run('PRIMARIES.concat(TEMP_PRIMARY)'))assert.ok(seen.has(key),key);
  });
}
for(const key of ['carbine','lmg','dmr','autoshotgun','crossbow','pulserifle','shorty','handcannon'])test(`${key} fires real pellets, spends ammo, respects cadence and reloads`,()=>{
  let reloads=0;const c={console,Math,Number,Object,Array,Map,Set,now:10000,state:'play',practiceMode:null,fireSuppressT:0,
    parryUntil:0,TWIN_SAI_PARRY_MS:1000,aiming:false,tutorialOn:false,surgeT:0,weaponLastShotAt:{},fanShots:0,fanBurstUntil:0,
    bullets:[],grenades:[],perks:{rate:1,acc:1,dmg:1,pierce:0,velo:1,range:1,noBloom:false},
    player:{cur:key,mags:{},reserve:{},reloadEnd:0,equipEnd:0,lastShot:0,bloom:0,x:100,y:100},
    isLocked:()=>false,sfx:()=>{},addShake:()=>{},aimAngle:()=>0,effSpread:()=>0,
    wm:()=>({rate:1,spread:1,dmg:1,pierce:0,range:1,fall:1,pellets:0}),weaponColor:(key,col)=>col,
    fireCadenceLastShot:()=>c.player.lastShot,weaponBulletSpeed:()=>20,weaponBulletLife:(_key,life)=>life,
    startReload:()=>{reloads++;c.player.reloadEnd=c.now+1000;}
  };
  vm.createContext(c);vm.runInContext(read('weapons.js'),c);vm.runInContext(fn(read('combat.js'),'tryFire'),c);
  const w=vm.runInContext(`WEAPONS.${key}`,c);c.player.mags[key]=w.mag;c.player.reserve[key]=w.mag*5;
  assert.equal(c.tryFire(),true);assert.equal(c.player.mags[key],w.mag-1);assert.equal(c.bullets.length,w.pellets);
  for(const shot of c.bullets){assert.equal(shot.dmg,w.dmg);assert.equal(shot.weapon,key);assert.ok(Math.hypot(shot.vx,shot.vy)>0);}
  assert.equal(c.tryFire(),false);assert.equal(c.bullets.length,w.pellets,'same instant never double-fires');
  c.player.reloadEnd=0;c.player.mags[key]=1;c.now+=w.fireRate;assert.equal(c.tryFire(),true);assert.ok(reloads>=1);
  c.now++;assert.equal(c.tryFire(),false,'reload blocks the trigger');
});
test('queued editing cannot start a Practice loan or jump into the shop',()=>{
  const h=uiHarness(390,844);h.c.authUser={id:'synthetic'};h.c.arena={phase:'queue',queueChannel:{},active:false};
  assert.equal(h.c.openOnlineLoadoutEditor(),true);h.c.selPage='PRIMARY';h.c.drawCategory('PRIMARY');
  assert.equal(h.c.cardRects.some(r=>r.tryIt||r.gotoShop),false);
});
