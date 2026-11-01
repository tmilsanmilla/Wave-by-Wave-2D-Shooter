"use strict";

// Overdrive is movement, not armor: these actions never set hurtCd, change
// damage, teleport an actor, or bypass a wall. Units are px per 60Hz frame.
const DRIVE=Object.freeze({max:100,regen:24,regenDelay:650,burstCost:38,slideCost:22,
  burstMs:135,slideMs:480,burstSpeed:11,burstCooldown:620,slideCooldown:850,speedMul:1.22});
function freshDrive(clock=0){
  return {vx:0,vy:0,energy:DRIVE.max,mode:'run',until:0,started:clock,regenAt:clock,
    burstReady:0,slideReady:0,slideLatched:false,dx:1,dy:0,trail:[],trailAt:0};
}
function resetDriveMotion(actor=player,refill=false){
  if(!actor)return;
  const previous=actor.drive;
  actor.drive=freshDrive(typeof now==='number'?now:0);
  if(!refill&&previous){
    actor.drive.energy=previous.energy;actor.drive.regenAt=previous.regenAt;
    actor.drive.burstReady=previous.burstReady;actor.drive.slideReady=previous.slideReady;
  }
}
function driveInput(){
  let x=(keys.d?1:0)-(keys.a?1:0),y=(keys.s?1:0)-(keys.w?1:0);
  if(sticks.move.id!==null){x=sticks.move.dx/STICK_R;y=sticks.move.dy/STICK_R;}
  const length=Math.hypot(x,y),scale=Math.max(1,length);
  return {x:x/scale,y:y/scale};
}
function driveActivate(d,kind,input,clock=0,enhanced=false){
  if(!d||!['burst','slide'].includes(kind)||d.mode==='burst'||d.mode==='slide')return false;
  const cost=kind==='burst'?(enhanced?30:DRIVE.burstCost):DRIVE.slideCost;
  if(!Number.isFinite(clock)||clock<(kind==='burst'?d.burstReady:d.slideReady)||d.energy<cost)return false;
  let x=input.x,y=input.y,length=Math.hypot(x,y),speed=Math.hypot(d.vx,d.vy);
  if(kind==='slide'&&speed<1.8)return false; // build momentum before sliding
  if(!length){x=d.vx;y=d.vy;length=speed;}
  if(!length||!Number.isFinite(length))return false;
  d.energy-=cost;d.regenAt=clock+DRIVE.regenDelay;d.started=clock;d.mode=kind;
  d.until=clock+(kind==='burst'?DRIVE.burstMs:DRIVE.slideMs);d.dx=x/length;d.dy=y/length;
  if(kind==='burst')d.burstReady=clock+DRIVE.burstCooldown;
  else {d.slideReady=clock+DRIVE.slideCooldown;const launch=Math.min(8,Math.max(5.4,speed*1.45));d.vx=d.dx*launch;d.vy=d.dy*launch;}
  return true;
}
function driveStep(d,input,speed,dtms,clock,frozen=false){
  const ms=Math.max(0,Math.min(50,+dtms||0)),frame=1000/60;
  if(!d||!Number.isFinite(speed)||speed<0||!Number.isFinite(clock))return {x:0,y:0};
  const ix=Number.isFinite(input.x)?input.x:0,iy=Number.isFinite(input.y)?input.y:0,scale=Math.max(1,Math.hypot(ix,iy));
  input={x:ix/scale,y:iy/scale};
  if(frozen){d.vx=0;d.vy=0;d.mode='run';d.until=clock;return {x:0,y:0};}
  const regenMs=Math.max(0,clock-Math.max(clock-ms,d.regenAt));
  d.energy=Math.min(DRIVE.max,Math.max(0,d.energy)+DRIVE.regen*regenMs/1000);
  let x=0,y=0,remaining=ms;
  if(d.mode==='burst'){
    const active=Math.max(0,Math.min(ms,d.until-(clock-ms)));
    x=d.dx*DRIVE.burstSpeed*active/frame;y=d.dy*DRIVE.burstSpeed*active/frame;
    d.vx=d.dx*speed;d.vy=d.dy*speed;remaining-=active;
    if(clock>=d.until)d.mode='run';
  }else if(d.mode==='slide'){
    const inputLength=Math.hypot(input.x,input.y),dot=inputLength?(input.x*d.dx+input.y*d.dy)/inputLength:0;
    if(dot<-.55){d.mode='run';d.vx*=.35;d.vy*=.35;} // counter-steer to brake out
    else{
      const active=Math.max(0,Math.min(ms,d.until-(clock-ms))),turn=1-Math.exp(-active/240);
      if(inputLength){
        let dx=d.dx*(1-turn)+input.x/inputLength*turn,dy=d.dy*(1-turn)+input.y/inputLength*turn;
        const length=Math.hypot(dx,dy)||1;d.dx=dx/length;d.dy=dy/length;
      }
      const old=Math.hypot(d.vx,d.vy),decay=Math.exp(-active/680),distance=old*680/frame*(1-decay);
      x=d.dx*distance;y=d.dy*distance;d.vx=d.dx*old*decay;d.vy=d.dy*old*decay;remaining-=active;
      if(clock>=d.until)d.mode='run';
    }
  }
  if(remaining>0){
    const magnitude=Math.min(1,Math.hypot(input.x,input.y)),tau=magnitude?75:55,
      decay=Math.exp(-remaining/tau),tx=input.x*speed,ty=input.y*speed;
    // Analytic acceleration/braking: the same travel at 30, 60 and 144Hz.
    x+=tx*remaining/frame+(d.vx-tx)*tau/frame*(1-decay);
    y+=ty*remaining/frame+(d.vy-ty)*tau/frame*(1-decay);
    d.vx=tx+(d.vx-tx)*decay;d.vy=ty+(d.vy-ty)*decay;
    if(Math.hypot(d.vx,d.vy)<.025){d.vx=0;d.vy=0;}
  }
  return {x,y};
}
function requestDriveAction(kind){
  if(state!=='play'||menuOpen||player.hp<=0||
     practiceMode==='arena'&&!arenaCanAct()||playerFrozenUntil>now||
     typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()||now<player.dashUntil)return false;
  if(kind==='slide'&&aiming)return false;
  const d=player.drive||(player.drive=freshDrive(now)),input=driveInput();
  if(kind==='burst'&&!Math.hypot(input.x,input.y)&&!Math.hypot(d.vx,d.vy)){
    const angle=aimAngle();input.x=Math.cos(angle);input.y=Math.sin(angle);
  }
  const result=driveActivate(d,kind,input,now,!!perks.dash);
  if(result&&kind==='slide')d.slideLatched=true;
  if(result&&typeof sfx==='function')sfx('swap');return result;
}
function updateDriveMovement(mx,my,speed,dtms,frozen=false){
  const d=player.drive||(player.drive=freshDrive(now)),input={x:mx,y:my};
  if(!keys.shift)d.slideLatched=false;
  if(keys.shift&&!d.slideLatched&&!aiming&&!frozen&&Math.hypot(d.vx,d.vy)>=1.8)requestDriveAction('slide');
  if(aiming&&d.mode==='slide'){d.mode='run';d.vx*=.6;d.vy*=.6;}
  const delta=driveStep(d,input,speed*DRIVE.speedMul,dtms,now,frozen),before={x:player.x,y:player.y};
  // Axis-separated swept moves preserve wall sliding without tunneling.
  const movedX=moveActorSwept(player,delta.x,0),movedY=moveActorSwept(player,0,delta.y);
  if(!movedX)d.vx=0;if(!movedY)d.vy=0;
  if((!movedX||!movedY)&&d.mode!=='run'){d.mode='run';d.until=now;}
  if(Math.hypot(player.x-before.x,player.y-before.y)>2&&now>=d.trailAt){
    d.trailAt=now+32;d.trail.push({x:player.x,y:player.y,at:now,mode:d.mode});
  }
  d.trail=d.trail.filter(p=>now-p.at<260).slice(-9);
}
function driveTouchLayout(width,height){
  const radius=width<380?30:40,x=width-(width<380?44:72),aimY=height-118,reloadY=height-(width<380?197:210);
  return {radius,x,aimY,reloadY,burst:{x:x-radius-34,y:aimY,r:24},slide:{x:x-radius-34,y:reloadY,r:24}};
}
function drawDriveTrail(actor,hostile=false,visual=null){
  const d=visual||actor&&actor.drive;if(!d||!d.trail||d.trail.length<2)return;
  ctx.save();ctx.lineCap='round';
  for(let i=1;i<d.trail.length;i++){
    const p=d.trail[i],last=d.trail[i-1],age=now-p.at;
    if(age<0||age>260||Math.hypot(p.x-last.x,p.y-last.y)>70)continue;
    ctx.strokeStyle=hostile?'#ff6b66':p.mode==='slide'?'#ffb65d':'#63e6df';
    ctx.globalAlpha=(1-age/260)*(p.mode==='run'?.16:.5);ctx.lineWidth=(actor.r||15)*(p.mode==='run'?.4:.8);
    ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();
  }ctx.restore();
}
function drawRemoteDriveTrail(actor,hostile=true){
  if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.y))return;
  const d=actor.driveGhost||(actor.driveGhost={x:actor.x,y:actor.y,at:now,trail:[]}),ms=now-d.at,
    distance=Math.hypot(actor.x-d.x,actor.y-d.y);
  if(distance>100||ms<0){d.trail=[];d.x=actor.x;d.y=actor.y;d.at=now;}
  else if(ms>=32){
    if(distance>.5)d.trail.push({x:actor.x,y:actor.y,at:now,mode:distance/ms*1000/60>5.2?'burst':'run'});
    d.x=actor.x;d.y=actor.y;d.at=now;
  }
  d.trail=d.trail.filter(p=>now-p.at<260).slice(-9);drawDriveTrail(actor,hostile,d);
}
function drawDriveHUD(){
  const d=player.drive||(player.drive=freshDrive(now)),width=Math.max(112,Math.min(220,W-180)),x=(W-width)/2,y=practiceMode==='arena'?94:82;
  ctx.save();ctx.fillStyle='rgba(6,15,24,.9)';ctx.fillRect(x-8,y-7,width+16,39);
  ctx.fillStyle='#1c3443';ctx.fillRect(x,y+13,width,5);
  ctx.fillStyle=d.mode==='slide'?'#ffb65d':'#63e6df';ctx.fillRect(x,y+13,width*d.energy/DRIVE.max,5);
  for(const fraction of [DRIVE.slideCost/100,DRIVE.burstCost/100]){ctx.fillStyle='#e9f4ef';ctx.fillRect(x+width*fraction,y+11,1,9);}
  ctx.font='700 10px ui-monospace,Consolas,monospace';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#c6e5e7';
  ctx.fillText(d.mode==='run'?'DRIVE':d.mode==='burst'?'BURST':'SLIDE',x,y);
  ctx.textAlign='right';ctx.fillStyle='#7fabb4';ctx.fillText(Math.floor(d.energy)+'%',x+width,y);
  ctx.restore();
}

// A local movement-only circuit. It never submits scores, quests, rewards or
// account data. Ordered segment/gate tests also catch gates crossed mid-burst.
let driveCircuit=null;
const DRIVE_CIRCUIT_WALLS=Object.freeze([
  Object.freeze({x:1030,y:730,w:340,h:340}),
  Object.freeze({x:820,y:640,w:160,h:50}),Object.freeze({x:1420,y:1110,w:160,h:50})
]);
function newDriveCircuit(clock=0){
  return {points:[{x:700,y:900},{x:700,y:520},{x:1200,y:520},{x:1700,y:900},{x:1700,y:1280},{x:1200,y:1280},{x:700,y:900}],
    next:1,startedAt:null,best:null,last:null,laps:0,previous:{x:700,y:900},splits:[],noticeUntil:0};
}
function driveGateCrossed(a,b,point,r=48){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy)<=r;
}
function driveCircuitTick(circuit,position,clock){
  if(!circuit||!Number.isFinite(position.x)||!Number.isFinite(position.y)||!Number.isFinite(clock))return false;
  const old=circuit.previous;circuit.previous={x:position.x,y:position.y};
  if(Math.hypot(position.x-old.x,position.y-old.y)>100){circuit.next=1;circuit.startedAt=null;circuit.splits=[];return false;}
  if(circuit.startedAt===null){
    if(Math.hypot(position.x-circuit.points[0].x,position.y-circuit.points[0].y)>75)return false;
    if(Math.hypot(position.x-old.x,position.y-old.y)<.5)return false;
    circuit.startedAt=clock;
  }
  if(!driveGateCrossed(old,position,circuit.points[circuit.next]))return false;
  circuit.splits.push(clock-circuit.startedAt);circuit.next++;
  if(circuit.next===circuit.points.length){
    circuit.last=clock-circuit.startedAt;circuit.best=circuit.best===null?circuit.last:Math.min(circuit.best,circuit.last);
    circuit.laps++;circuit.next=1;circuit.startedAt=null;circuit.noticeUntil=clock+2600;circuit.splits=[];
  }return true;
}
function startDriveCircuit(){
  driveCircuit=newDriveCircuit(now);player.x=700;player.y=900;cam.x=700;cam.y=900;
  enemies=[];pickups=[];practiceSpawns=[];resetDriveMotion(player,true);
  waveMsg='OVERDRIVE CIRCUIT · FOLLOW THE CYAN GATES';waveMsgT=now+3200;
}
function drawDriveCircuit(){
  if(practiceMode!=='flow'||!driveCircuit)return;
  const c=driveCircuit;
  ctx.save();ctx.lineWidth=3/zoom;ctx.setLineDash([12,16]);ctx.strokeStyle='rgba(99,230,223,.15)';ctx.beginPath();
  c.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
  c.points.forEach((p,i)=>{
    if(i===0)return;const active=i===c.next;
    ctx.strokeStyle=active?'#63e6df':'#284851';ctx.lineWidth=(active?5:2)/zoom;
    ctx.beginPath();ctx.arc(p.x,p.y,active?48+Math.sin(now*.006)*3:36,0,TAU);ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 18px ui-monospace,Consolas,monospace';ctx.fillStyle=active?'#d0ffef':'#52767c';ctx.fillText(String(i),p.x,p.y);
  });ctx.restore();
}
function drawDriveCircuitHUD(){
  if(practiceMode!=='flow'||!driveCircuit)return;
  const c=driveCircuit,elapsed=c.startedAt===null?0:Math.max(0,now-c.startedAt),y=H<500?138:150;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#d0ffef';ctx.font='700 24px ui-monospace,Consolas,monospace';
  ctx.fillText((elapsed/1000).toFixed(2)+'s',W/2,y);
  ctx.font='10px ui-monospace,Consolas,monospace';ctx.fillStyle='#8eafb5';
  ctx.fillText(c.startedAt===null?'MOVE FROM THE START TO BEGIN':'GATE '+c.next+' / 6',W/2,y+30);
  ctx.fillText('BEST '+(c.best===null?'—':(c.best/1000).toFixed(2)+'s')+' · LAPS '+c.laps,W/2,y+46);
  if(c.last!==null&&now<c.noticeUntil){ctx.fillStyle='#ffb65d';ctx.fillText('LAP '+(c.last/1000).toFixed(2)+'s',W/2,y+63);}
  ctx.restore();
}
function drawOverdriveMenuBackground(){
  ctx.save();ctx.fillStyle='#07121b';ctx.fillRect(0,0,W,H);
  const t=(typeof now==='number'?now:0)*.014;
  ctx.strokeStyle='rgba(99,230,223,.07)';ctx.lineWidth=1;
  ctx.beginPath();for(let x=-H;x<W+H;x+=100){ctx.moveTo(x+t%100,0);ctx.lineTo(x+H+t%100,H);}ctx.stroke();
  const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'rgba(17,116,131,.2)');g.addColorStop(.55,'rgba(7,18,27,0)');g.addColorStop(1,'rgba(174,75,31,.18)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.restore();
}
