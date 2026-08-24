"use strict";

/* ---------------- world ---------------- */
const WORLD = { w:2400, h:1800 };
const ARENA_EDGE=20;                                // matches the visible gold playfield fence
const FULL_ARENA_BOUNDS=Object.freeze({left:ARENA_EDGE,top:ARENA_EDGE,right:WORLD.w-ARENA_EDGE,bottom:WORLD.h-ARENA_EDGE});
// Every true 1v1 uses the same centered playfield. At 1440 x 1080 this is 20%
// larger in both dimensions than the old Offline-AI-only arena, while Endless
// and the four-actor CPU modes retain the full 2400 x 1800 world.
const DUEL_ARENA_BOUNDS=Object.freeze({left:480,top:360,right:1920,bottom:1440});

function freezeDuelLayout(layout){
  layout.bounds=DUEL_ARENA_BOUNDS;
  layout.spawns=Object.freeze(layout.spawns.map(Object.freeze));
  layout.obstacles=Object.freeze(layout.obstacles.map(Object.freeze));
  layout.portals=Object.freeze((layout.portals||[]).map(Object.freeze));
  layout.tnt=Object.freeze((layout.tnt||[]).map(Object.freeze));
  return Object.freeze(layout);
}
// Geometry is deterministic and deliberately rotationally symmetric. The map
// vote metadata lives in state.js; this table owns only world geometry.
const DUEL_MAP_LAYOUTS=Object.freeze({
  arena:freezeDuelLayout({
    id:'arena',
    spawns:[{x:700,y:900,angle:0},{x:1700,y:900,angle:Math.PI}],
    obstacles:[
      // This center wall crosses the spawn-to-spawn sightline: neither player
      // can deal opening damage by simply standing still and holding fire.
      {x:1160,y:760,w:80,h:280,kind:'wall'},
      {x:680,y:590,w:210,h:70,kind:'wall'}, {x:1510,y:1140,w:210,h:70,kind:'wall'},
      {x:680,y:1140,w:210,h:70,kind:'wall'}, {x:1510,y:590,w:210,h:70,kind:'wall'},
      {x:1080,y:500,w:240,h:60,kind:'wall'}, {x:1080,y:1240,w:240,h:60,kind:'wall'},
    ],
  }),
  dimension:freezeDuelLayout({
    id:'dimension',
    spawns:[{x:700,y:900,angle:0},{x:1700,y:900,angle:Math.PI}],
    obstacles:[
      {x:1160,y:790,w:80,h:220,kind:'dimension'},
      {x:890,y:610,w:70,h:230,kind:'dimension'}, {x:1440,y:960,w:70,h:230,kind:'dimension'},
      {x:890,y:960,w:70,h:230,kind:'dimension'}, {x:1440,y:610,w:70,h:230,kind:'dimension'},
      {x:1080,y:500,w:240,h:55,kind:'dimension'}, {x:1080,y:1245,w:240,h:55,kind:'dimension'},
    ],
    portals:[
      {id:'dim-a-1',pair:'dim-a-2',x:650,y:600,r:40,color:'#b85cff'},
      {id:'dim-a-2',pair:'dim-a-1',x:1750,y:1200,r:40,color:'#b85cff'},
      {id:'dim-b-1',pair:'dim-b-2',x:650,y:1200,r:40,color:'#51d9ff'},
      {id:'dim-b-2',pair:'dim-b-1',x:1750,y:600,r:40,color:'#51d9ff'},
    ],
  }),
  construction:freezeDuelLayout({
    id:'construction',
    spawns:[{x:700,y:900,angle:0},{x:1700,y:900,angle:Math.PI}],
    obstacles:[
      // A two-crate stack is the Construction Site's opening LOS blocker.
      {x:1128,y:852,w:72,h:96,kind:'crate'}, {x:1200,y:852,w:72,h:96,kind:'crate'},
      {x:760,y:570,w:144,h:72,kind:'crate'}, {x:1496,y:1158,w:144,h:72,kind:'crate'},
      {x:760,y:1158,w:144,h:72,kind:'crate'}, {x:1496,y:570,w:144,h:72,kind:'crate'},
      {x:960,y:470,w:72,h:144,kind:'crate'}, {x:1368,y:1186,w:72,h:144,kind:'crate'},
      {x:960,y:1186,w:72,h:144,kind:'crate'}, {x:1368,y:470,w:72,h:144,kind:'crate'},
    ],
    // TNT is solid until detonated. Its stable id is the round/network dedupe key.
    tnt:[
      {id:'tnt-nw',x:968,y:690,w:46,h:56,radius:190,damage:360,kind:'tnt'},
      {id:'tnt-se',x:1386,y:1054,w:46,h:56,radius:190,damage:360,kind:'tnt'},
      {id:'tnt-sw',x:968,y:1054,w:46,h:56,radius:190,damage:360,kind:'tnt'},
      {id:'tnt-ne',x:1386,y:690,w:46,h:56,radius:190,damage:360,kind:'tnt'},
    ],
  }),
});

function isDuelArena(){
  if(typeof practiceMode==='undefined'||practiceMode!=='arena'||!arena) return false;
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return false;
  return arena.mode!=='partycpu'&&arena.mode!=='ai2v2';
}
function activeArenaMapId(){
  const id=isDuelArena()&&arena&&String(arena.mapId||'arena');
  return DUEL_MAP_LAYOUTS[id]?id:'arena';
}
function activeArenaMap(){ return isDuelArena()?DUEL_MAP_LAYOUTS[activeArenaMapId()]:null; }
function activeArenaLayout(){ return activeArenaMap(); }
function activeArenaBounds(){
  const layout=typeof activeArenaMap==='function'?activeArenaMap():null;
  return layout?layout.bounds:FULL_ARENA_BOUNDS;
}
function projectileOutsideArena(p,r=0){
  const b=activeArenaBounds();
  return p.x-r<b.left || p.y-r<b.top || p.x+r>b.right || p.y+r>b.bottom;
}
function clampProjectileToArena(p,r=0){
  const b=activeArenaBounds();
  p.x=clamp(p.x,b.left+r,b.right-r);
  p.y=clamp(p.y,b.top+r,b.bottom-r);
}
function bounceProjectileAtArenaEdge(p,r=0,damp=1){
  const b=activeArenaBounds(), loX=b.left+r, loY=b.top+r, hiX=b.right-r, hiY=b.bottom-r;
  let hit=false;
  if(p.x<loX){ p.x=loX; if(p.vx<0) p.vx=-p.vx*damp; hit=true; }
  else if(p.x>hiX){ p.x=hiX; if(p.vx>0) p.vx=-p.vx*damp; hit=true; }
  if(p.y<loY){ p.y=loY; if(p.vy<0) p.vy=-p.vy*damp; hit=true; }
  else if(p.y>hiY){ p.y=hiY; if(p.vy>0) p.vy=-p.vy*damp; hit=true; }
  return hit;
}
const obstacles = [
  {x: 420, y: 320, w:150, h: 90}, {x:1830, y: 300, w: 90, h:170},
  {x: 350, y:1380, w: 90, h:160}, {x:1900, y:1400, w:170, h: 90},
  {x:1080, y: 780, w:240, h: 70}, {x:1080, y: 950, w: 70, h:180},
  {x: 760, y: 860, w: 90, h: 90}, {x:1560, y: 860, w: 90, h: 90},
  {x:1180, y: 260, w: 80, h: 80}, {x:1140, y:1460, w:130, h: 80},
];
function arenaDestroyedTnt(){
  if(!arena) return new Set();
  if(!(arena.detonatedTnt instanceof Set)) arena.detonatedTnt=new Set();
  return arena.detonatedTnt;
}
function activeArenaPortals(){ const layout=typeof activeArenaMap==='function'?activeArenaMap():null; return layout?layout.portals:[]; }
function activeArenaTnt(includeDestroyed=false){
  const layout=typeof activeArenaMap==='function'?activeArenaMap():null; if(!layout) return [];
  const dead=arenaDestroyedTnt();
  return includeDestroyed?layout.tnt:layout.tnt.filter(t=>!dead.has(t.id));
}
function activeObstacles(){
  const layout=typeof activeArenaMap==='function'?activeArenaMap():null;
  return layout?layout.obstacles.concat(activeArenaTnt()):obstacles;
}
function duelArenaSpawn(side=0){
  const layout=activeArenaLayout()||DUEL_MAP_LAYOUTS.arena;
  const right=side===1||side==='right';
  return Object.assign({},layout.spawns[right?1:0]);
}
function duelArenaFitZoom(pad=24){
  const b=activeArenaBounds(),bw=b.right-b.left,bh=b.bottom-b.top;
  return Math.max(0.2,Math.min((Math.max(1,W)-pad*2)/bw,(Math.max(1,H)-pad*2)/bh));
}
function arenaResetMapRuntime(){
  if(!arena) return;
  if(arena.hazardArbitrations instanceof Map) for(const a of arena.hazardArbitrations.values()) if(a&&a.timer) clearTimeout(a.timer);
  arena.detonatedTnt=new Set(); arena.tntFx=[];
  arena.pendingHazards=new Map(); arena.hazardReceipts=new Map(); arena.hazardArbitrations=new Map(); arena.localKoCause=null;
  player.portalLockUntil=0; player.portalExitId=''; player.portalSeq=0;
  if(arena.opponent){ arena.opponent.portalLockUntil=0; arena.opponent.portalExitId=''; arena.opponent.portalSeq=0; }
}
function arenaPortalStep(actor,clock){
  if(!actor||!isDuelArena()||activeArenaMapId()!=='dimension') return false;
  const portals=activeArenaPortals(); if(!portals.length||clock<(actor.portalLockUntil||0)) return false;
  const entry=portals.find(p=>dist2(actor.x,actor.y,p.x,p.y)<p.r*p.r);
  if(!entry) return false;
  const exit=portals.find(p=>p.id===entry.pair); if(!exit) return false;
  const a=Math.atan2(exit.y-entry.y,exit.x-entry.x), clearance=exit.r+(actor.r||15)+12;
  actor.x=exit.x+Math.cos(a)*clearance; actor.y=exit.y+Math.sin(a)*clearance;
  actor.portalLockUntil=clock+700; actor.portalExitId=exit.id; actor.portalSeq=Math.max(0,Math.floor(+actor.portalSeq||0))+1;
  clampActorToArena(actor); collideRects(actor); clampActorToArena(actor);
  if(typeof burst==='function'){ burst(entry.x,entry.y,entry.color,8,4); burst(exit.x,exit.y,exit.color,8,4); }
  if(actor===player&&typeof sfx==='function') sfx('pickup');
  return true;
}
function arenaTntAtPoint(x,y,r=0){
  return activeArenaTnt().find(t=>x+r>=t.x&&x-r<=t.x+t.w&&y+r>=t.y&&y-r<=t.y+t.h)||null;
}
function arenaTntDamage(actor,tnt){
  const cx=tnt.x+tnt.w/2,cy=tnt.y+tnt.h/2,d=Math.hypot(actor.x-cx,actor.y-cy);
  return d>=tnt.radius?0:Math.min(ARENA_HP,tnt.damage*(1-d/tnt.radius));
}
// Shared local application. online.js supplies the small broadcast/receive hook;
// the Offline bot and the shooter's own blast are resolved here immediately.
function arenaApplyTntDetonation(tntId,source='remote'){
  if(!isDuelArena()||activeArenaMapId()!=='construction') return false;
  const t=activeArenaTnt(true).find(x=>x.id===String(tntId||''));
  const dead=arenaDestroyedTnt(); if(!t||dead.has(t.id)) return false;
  dead.add(t.id); (arena.tntFx||(arena.tntFx=[])).push({x:t.x+t.w/2,y:t.y+t.h/2,t:now,r:t.radius});

  const playerHit=arenaTntDamage(player,t);
  if(playerHit>0){ damagePlayerHp(playerHit,{kind:'tnt',mergeMs:90}); player.hurtFlash=1; player.hurtCd=240; }
  if(typeof isBotArena==='function'&&isBotArena()&&arena.opponent){
    const bot=arena.opponent,botHit=arenaTntDamage(bot,t),before=Math.max(0,+bot.hp||0);
    if(botHit>0){ const dealt=Math.min(before,botHit); bot.hp=Math.max(0,before-botHit); bot.hitT=now+120; addDamageNumber(bot,dealt,false,90,'tnt'); }
    if(player.hp<=0&&bot.hp<=0) arenaBotResolve(null);
    else if(player.hp<=0) arenaBotResolve(LOCAL_DUEL_BOT);
    else if(bot.hp<=0) arenaBotResolve(LOCAL_DUEL_PLAYER);
  } else {
    const eventId=[arena.matchEpoch,arena.round,t.id].join(':');
    if(source==='local'&&typeof arenaBroadcastTnt==='function') arenaBroadcastTnt(t.id,Math.max(0,+player.hp||0));
    if(player.hp<=0&&typeof arenaLocalKO==='function') arenaLocalKO({kind:'tnt',eventId,tntId:t.id});
  }
  if(typeof burst==='function') burst(t.x+t.w/2,t.y+t.h/2,'#ff9b3d',28,9);
  if(typeof sfx==='function') sfx('die');
  return true;
}
function arenaTryTriggerTntAt(x,y,source='local',r=0){
  const t=arenaTntAtPoint(x,y,r);
  return t?arenaApplyTntDetonation(t.id,source):false;
}
// Compatibility aliases for callers created while the component split was in
// progress. New code uses the explicit Reset / Apply / Try names above.
function resetArenaMapRuntime(){ return arenaResetMapRuntime(); }
function arenaDetonateTnt(tntId,source='remote'){ return arenaApplyTntDetonation(tntId,source); }
function clampActorToArena(e,margin=20){
  const b=activeArenaBounds();
  e.x=clamp(e.x,b.left+margin,b.right-margin);
  e.y=clamp(e.y,b.top+margin,b.bottom-margin);
  return e;
}
