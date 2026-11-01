import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=name=>fs.readFileSync(new URL('../js/'+name,import.meta.url),'utf8');
const source=read('overdrive.js');
function fn(text,name){const start=text.indexOf(`function ${name}(`),end=text.indexOf('\nfunction ',start+1);assert.ok(start>=0);return text.slice(start,end<0?undefined:end);}
function harness(){
  const c={console,Math,Number,Array,Object,String,now:1000,keys:{d:true},sticks:{move:{id:null,dx:0,dy:0}},STICK_R:60,
    player:{x:100,y:100,r:15,hp:100,hurtCd:7,dashUntil:0},menuOpen:false,state:'play',practiceMode:null,playerFrozenUntil:0,
    perks:{dash:0},aiming:false,arenaCanAct:()=>true,arenaUtilityFrozen:()=>false,aimAngle:()=>0,sfx:()=>{},
    activeArenaBounds:()=>({left:0,top:0,right:2400,bottom:1800}),circleHitsRects:()=>false,
    enemies:[],pickups:[],practiceSpawns:[],cam:{},waveMsg:'',waveMsgT:0,
  };
  vm.createContext(c);vm.runInContext(source,c);vm.runInContext(fn(read('gameplay.js'),'moveActorSwept'),c);
  return {...c,c,run:code=>vm.runInContext(code,c)};
}
test('normal acceleration and braking are smooth, finite and bounded',()=>{
  const {c}=harness(),d=c.freshDrive(0);let distance=0;
  for(let at=16;at<=1600;at+=16){const step=c.driveStep(d,{x:1,y:0},4,16,at);distance+=step.x;assert.ok(d.vx>=0&&d.vx<=4);}
  assert.ok(distance>300);const before=d.vx;c.driveStep(d,{x:0,y:0},4,16,1616);assert.ok(d.vx>0&&d.vx<before);
  for(let at=1632;at<2000;at+=16)c.driveStep(d,{x:0,y:0},4,16,at);assert.equal(d.vx,0);
});
test('diagonal and over-range analog input cannot exceed straight-line speed',()=>{
  const {c}=harness(),straight=c.freshDrive(),diagonal=c.freshDrive();
  for(let at=16;at<=2000;at+=16){c.driveStep(straight,{x:1,y:0},4,16,at);c.driveStep(diagonal,{x:9,y:9},4,16,at);}
  assert.ok(Math.abs(Math.hypot(diagonal.vx,diagonal.vy)-straight.vx)<1e-8);
});
for(const mode of ['run','burst','slide'])test(`${mode} travel is frame-rate independent at 30/60/144Hz`,()=>{
  const {c}=harness();const travel=hz=>{
    const d=c.freshDrive(0);d.vx=4;
    if(mode!=='run')assert.equal(c.driveActivate(d,mode,{x:1,y:0},0),true);
    let x=0,clock=0;for(let i=0;i<hz;i++){const ms=1000/hz;clock+=ms;x+=c.driveStep(d,{x:1,y:0},4,ms,clock).x;}return x;
  };
  const reference=travel(60);assert.ok(Math.abs(travel(30)-reference)<.08);assert.ok(Math.abs(travel(144)-reference)<.08);
});
test('burst is universal, directional, bounded and never grants invulnerability',()=>{
  const {c}=harness();c.keys={w:true};assert.equal(c.requestDriveAction('burst'),true);
  assert.equal(c.player.drive.energy,62);assert.equal(c.player.drive.dy,-1);assert.equal(c.player.hurtCd,7);
  assert.equal(c.player.dashUntil,0);assert.equal(c.requestDriveAction('burst'),false);
});
test('burst from idle follows aim and touch movement overrides keyboard direction',()=>{
  const {c}=harness();c.keys={};c.aimAngle=()=>Math.PI/2;assert.equal(c.requestDriveAction('burst'),true);assert.equal(c.player.drive.dy,1);
  c.resetDriveMotion(c.player,true);c.keys={d:true};c.sticks.move={id:1,dx:-60,dy:0};assert.equal(c.requestDriveAction('burst'),true);assert.equal(c.player.drive.dx,-1);
});
test('slide needs momentum; opposing input brakes it without refunding energy',()=>{
  const {c}=harness(),d=c.freshDrive();assert.equal(c.driveActivate(d,'slide',{x:1,y:0},1000),false);
  d.vx=4;assert.equal(c.driveActivate(d,'slide',{x:1,y:0},1000),true);assert.equal(d.energy,78);
  c.driveStep(d,{x:-1,y:0},4,16,1016);assert.equal(d.mode,'run');assert.equal(d.energy,78);
});
test('slide direction steers gently; aim cancels a slide into controlled movement',()=>{
  const {c}=harness();c.player.drive=c.freshDrive();c.player.drive.vx=4;c.requestDriveAction('slide');
  c.driveStep(c.player.drive,{x:0,y:1},4,16,1016);assert.ok(c.player.drive.dx>c.player.drive.dy&&c.player.drive.dy>0);
  c.aiming=true;c.now=1032;c.updateDriveMovement(0,1,2,16,false);assert.equal(c.player.drive.mode,'run');
});
test('holding Shift builds momentum then slides once until released',()=>{
  const {c}=harness();c.keys={d:true,shift:true};
  for(let i=0;i<7;i++){c.now=1000+i*16;c.updateDriveMovement(1,0,4,16);}
  assert.equal(c.player.drive.mode,'slide');assert.equal(c.player.drive.energy,78);
  for(let i=7;i<90;i++){c.now=1000+i*16;c.updateDriveMovement(1,0,4,16);}
  assert.equal(c.player.drive.mode,'run');assert.equal(c.player.drive.slideLatched,true);
  c.keys.shift=false;c.now+=16;c.updateDriveMovement(1,0,4,16);
  c.keys.shift=true;c.now+=16;const before=c.player.drive.energy;c.updateDriveMovement(1,0,4,16);
  assert.equal(c.player.drive.mode,'slide');assert.ok(Math.abs(c.player.drive.energy-(before-22))<1e-8);
});
test('Shift buffering cannot spend energy in menus or while aiming',()=>{
  const {c}=harness();c.keys={d:true,shift:true};c.player.drive=c.freshDrive();c.player.drive.vx=4;c.menuOpen=true;
  c.updateDriveMovement(1,0,4,16);assert.equal(c.player.drive.energy,100);assert.equal(c.player.drive.mode,'run');
  c.menuOpen=false;c.aiming=true;c.now+=16;c.updateDriveMovement(1,0,4,16);assert.equal(c.player.drive.energy,100);
});
test('remote trails are bounded, reset across teleports, and recover afterward',()=>{
  const {c}=harness();c.drawDriveTrail=()=>{};const actor={x:0,y:0,r:15};c.drawRemoteDriveTrail(actor);
  for(let i=1;i<40;i++){c.now+=32;actor.x+=4;c.drawRemoteDriveTrail(actor);}
  assert.ok(actor.driveGhost.trail.length>1&&actor.driveGhost.trail.length<=9);
  actor.x+=1000;c.now+=32;c.drawRemoteDriveTrail(actor);assert.equal(actor.driveGhost.trail.length,0);
  actor.x+=4;c.now+=32;c.drawRemoteDriveTrail(actor);assert.equal(actor.driveGhost.trail.length,1);
  c.now-=100;c.drawRemoteDriveTrail(actor);assert.equal(actor.driveGhost.trail.length,0);
});
test('energy regenerates only after the real delay, and never exceeds100',()=>{
  const {c}=harness(),d=c.freshDrive();c.driveActivate(d,'burst',{x:1,y:0},1000);
  for(let at=1010;at<=1650;at+=10)c.driveStep(d,{x:1,y:0},4,10,at);assert.equal(d.energy,62);
  for(let at=1660;at<=2650;at+=10)c.driveStep(d,{x:1,y:0},4,10,at);assert.ok(Math.abs(d.energy-86)<1e-7);
  for(let at=2660;at<10000;at+=10)c.driveStep(d,{x:0,y:0},4,10,at);assert.equal(d.energy,100);
});
test('resource and cooldown jointly prevent spam; the old Dash perk lowers cost only',()=>{
  const {c}=harness(),d=c.freshDrive();assert.equal(c.driveActivate(d,'burst',{x:1,y:0},1000),true);
  c.driveStep(d,{x:0,y:0},4,16,1200);assert.equal(c.driveActivate(d,'burst',{x:1,y:0},1500),false);
  assert.equal(c.driveActivate(d,'burst',{x:1,y:0},1620),true);c.driveStep(d,{x:0,y:0},4,16,1800);
  d.energy=0;assert.equal(c.driveActivate(d,'burst',{x:1,y:0},2400),false);
  const enhanced=c.freshDrive();c.driveActivate(enhanced,'burst',{x:1,y:0},1000,true);assert.equal(enhanced.energy,70);
});
test('menu/input resets stop drift but cannot refill energy or erase cooldown',()=>{
  const {c}=harness();c.requestDriveAction('burst');const deadline=c.player.drive.burstReady;
  c.resetDriveMotion(c.player);assert.equal(c.player.drive.mode,'run');assert.equal(c.player.drive.vx,0);
  assert.equal(c.player.drive.energy,62);assert.equal(c.player.drive.burstReady,deadline);
  c.resetDriveMotion(c.player,true);assert.equal(c.player.drive.energy,100);
});
for(const hold of ['menu','dead','countdown','frozen','legacy-ability'])test(`${hold} rejects movement abilities without spending energy`,()=>{
  const {c}=harness();c.player.drive=c.freshDrive();
  if(hold==='menu')c.menuOpen=true;if(hold==='dead')c.player.hp=0;
  if(hold==='countdown'){c.practiceMode='arena';c.arenaCanAct=()=>false;}
  if(hold==='frozen')c.playerFrozenUntil=2000;if(hold==='legacy-ability')c.player.dashUntil=2000;
  assert.equal(c.requestDriveAction('burst'),false);assert.equal(c.player.drive.energy,100);
});
test('freezing cancels momentum and movement without changing health',()=>{
  const {c}=harness(),d=c.freshDrive();d.vx=8;d.mode='slide';d.until=2000;
  assert.deepEqual(JSON.parse(JSON.stringify(c.driveStep(d,{x:1,y:0},4,16,1100,true))),{x:0,y:0});
  assert.equal(d.vx,0);assert.equal(d.mode,'run');assert.equal(c.player.hp,100);
});
test('burst/slide cannot tunnel through a thin wall and terminate at contact',()=>{
  const {c}=harness();c.player.x=90;c.circleHitsRects=(x,_y,r)=>x+r>=110&&x-r<=114;
  assert.equal(c.requestDriveAction('burst'),true);c.now=1016.667;c.updateDriveMovement(1,0,4,16.667);
  assert.ok(c.player.x<96);assert.equal(c.player.drive.mode,'run');assert.equal(c.player.drive.vx,0);
});
test('large and malformed steps stay finite and do not turn tab returns into teleports',()=>{
  const {c}=harness(),d=c.freshDrive();
  const delta=c.driveStep(d,{x:Infinity,y:NaN},4,60000,60000);assert.ok(Number.isFinite(delta.x)&&Number.isFinite(delta.y));
  assert.ok(Math.hypot(delta.x,delta.y)<=12);assert.deepEqual(JSON.parse(JSON.stringify(c.driveStep(d,{x:1,y:1},-1,16,10))),{x:0,y:0});
});
for(const [width,height] of [[320,568],[390,844],[844,390],[1280,720]])test(`touch movement buttons avoid each other and the joystick at ${width}x${height}`,()=>{
  const {c}=harness(),g=c.driveTouchLayout(width,height),items=[g.burst,g.slide,{x:g.x,y:g.aimY,r:g.radius},{x:g.x,y:g.reloadY,r:g.radius}];
  for(const item of items){assert.ok(item.x-item.r>=0&&item.x+item.r<=width&&item.y-item.r>=0&&item.y+item.r<=height);}
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(Math.hypot(items[i].x-items[j].x,items[i].y-items[j].y)>=items[i].r+items[j].r);
  const stick={x:110,y:height-120,r:60};for(const item of items)assert.ok(Math.hypot(item.x-stick.x,item.y-stick.y)>=item.r+stick.r);
});
test('segment gates catch a fast pass but refuse distant/skipped gates',()=>{
  const {c}=harness();assert.equal(c.driveGateCrossed({x:0,y:0},{x:100,y:0},{x:50,y:0},10),true);
  assert.equal(c.driveGateCrossed({x:0,y:0},{x:100,y:0},{x:50,y:30},10),false);
  const circuit=c.newDriveCircuit();c.driveCircuitTick(circuit,{x:705,y:900},1000);
  c.driveCircuitTick(circuit,{x:1200,y:520},1100);assert.equal(circuit.next,1);assert.equal(circuit.laps,0);
});
test('ordered local circuit finishes honest laps, retains best time, and has no account side effects',()=>{
  const {c}=harness(),circuit=c.newDriveCircuit();let clock=1000;
  function lap(delay){
    c.driveCircuitTick(circuit,{x:705,y:900},clock+=delay);
    for(const target of circuit.points.slice(1)){
      const previous={...circuit.previous},distance=Math.hypot(target.x-previous.x,target.y-previous.y),steps=Math.ceil(distance/20);
      for(let i=1;i<=steps;i++)c.driveCircuitTick(circuit,{x:previous.x+(target.x-previous.x)*i/steps,y:previous.y+(target.y-previous.y)*i/steps},clock+=delay);
    }
  }
  lap(16);assert.equal(circuit.laps,1);assert.ok(circuit.best>0);const first=circuit.best;
  lap(20);assert.equal(circuit.laps,2);assert.equal(circuit.best,first);
  assert.doesNotMatch(source,/fetch\(|\.rpc\(|localStorage|saveProfile|addGems|submitScore/);
});
test('circuit owns independent walls; standard/tracking maps remain separate',()=>{
  const {c}=harness();c.practiceMode='flow';c.activeArenaMap=()=>null;c.obstacles=[{x:0,y:0,w:10,h:10}];
  vm.runInContext(fn(read('world.js'),'activeObstacles'),c);assert.equal(c.activeObstacles().length,3);
  c.practiceMode='tracking';assert.equal(c.activeObstacles().length,0);c.practiceMode=null;assert.equal(c.activeObstacles(),c.obstacles);
});
test('every spawn resets movement; controls and mobile buttons are reachable in the actual entry points',()=>{
  assert.match(read('gameplay.js'),/resetDriveMotion\(player,true\)/);
  assert.match(read('input.js'),/k==='shift'&&!e.repeat[\s\S]{0,100}requestDriveAction\('slide'\)/);
  assert.match(read('input.js'),/k===' '&&!e.repeat\) doDash/);
  assert.match(read('rendering.js'),/iconBtn\('sld'/);assert.match(read('rendering.js'),/drawDriveHUD\(\)/);
  assert.match(read('upgrades.js'),/return requestDriveAction\('burst'\)/);
  assert.match(read('ui.js'),/mode:'flow',name:'OVERDRIVE CIRCUIT'/);
  assert.match(read('multidevice.js'),/movementRequired&&p.movementVersion!==1/);
});
test('a new multiplayer receiver refuses an old movement round without changing match state',()=>{
  const {c}=harness();vm.runInContext(read('multidevice.js'),c);
  const config={matchId:'00000000-0000-4000-8000-000000000001',epoch:'overdrive',hostId:'a',mode:'1v1',source:'queue',
    roster:[{id:'a',team:'A',loadout:{primary:'ar'}},{id:'b',team:'B',loadout:{primary:'ar'}}]},
    match=c.multideviceCreate(config,'b',1000),packet={from:'a',matchId:config.matchId,epoch:'overdrive',round:1,scores:{A:0,B:0},startInMs:3000,remainingMs:93000};
  match.movementRequired=true;
  for(const version of [undefined,0,2,'1']){
    assert.equal(c.multideviceRoundBegin(match,{...packet,movementVersion:version},1000),false);
    assert.equal(match.round,0);assert.equal(match.phase,'setup');
  }
  assert.equal(c.multideviceRoundBegin(match,{...packet,movementVersion:1},1000),true);
  assert.equal(match.round,1);assert.equal(match.phase,'countdown');
});
