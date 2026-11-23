import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// OWNED LOCAL QA ONLY: real canvas and two browser pages, synthetic players,
// BroadcastChannel transport rather than production Realtime/WebRTC. No SDK,
// credentials, accounts, persistence service, database or external requests.
const root=fileURLToPath(new URL('../../../',import.meta.url)),port=8804;
const baseline=JSON.parse(await fs.readFile(new URL('./remote-visual-baseline.json',import.meta.url),'utf8'));
const reference=baseline.shot.replace('function stepRemoteShotVisuals(','function publishedStepRemoteShotVisuals(');
const fixture=reference+'\n'+String.raw`
window.fetch=()=>Promise.reject(Error('External requests disabled in local performance fixture'));
goFullscreen=()=>{};loadMeta();bindCoreEvents();resize();
// Synthetic roster admission belongs only to this account-free fixture. This
// explicitly does NOT exercise or weaken production login/username admission.
requireResolvedUsernameForGameplay=()=>true;usernameGateBlocksGameplay=()=>false;
usernameClaimOpen=false;$('usernameclaimwrap').style.display='none';
const role=new URL(location.href).searchParams.get('role')==='guest'?'guest':'host',
  selfId='perf-'+role,peerId='perf-'+(role==='host'?'guest':'host');
authUser={id:selfId};sb=null;soloPractice=true;tryStartWeapon='ar';startPractice('dps');
practiceMode='arena';arena=freshArena();arena.mode='private';arena.hostId='perf-host';arena.active=true;
arena.phase='fight';arena.round=1;arena.matchEpoch=1;arena.roundEndAt=Date.now()+3600000;
arena.mapId='construction';arena.mapVotePhase='locked';arena.matchCommitted=true;
player.hp=250;player.x=role==='host'?700:1700;player.y=900;player.cur='ar';
loadout={primary:'ar',secondary:'m9',melee:'knife',utility:null};enemies=[];bullets=[];ebullets=[];
arena.opponent={id:peerId,name:'LOCAL '+peerId.toUpperCase(),x:role==='host'?1700:700,y:900,
  tx:role==='host'?1700:700,ty:900,hp:250,loadout:{...loadout},cur:'ar',r:15};
resetMeleeAbilityVisual(arena.opponent);state='play';menuOpen=false;zoom=duelArenaFitZoom();
const transport=new BroadcastChannel('outpost-owned-perf-20261121-v1'),
  counts={sent:0,received:0,shots:0,pongs:0},rtts=[],frameCpu=[],frameGaps=[],reports={};
const remember=(list,n)=>{list.push(n);if(list.length>600)list.shift();},
  quantile=(list,q)=>{const a=[...list].sort((a,b)=>a-b);return a.length?+a[Math.min(a.length-1,Math.floor(a.length*q))].toFixed(3):null;};
const channel={send:({event,payload})=>{counts.sent++;transport.postMessage({type:'game',event,payload});return Promise.resolve('ok');}};
arena.matchChannel=channel;
transport.onmessage=({data})=>{
  if(!data||data.from===selfId)return;
  if(data.type==='ping')transport.postMessage({type:'pong',to:data.from,at:data.at});
  else if(data.type==='pong'&&data.to===selfId){counts.pongs++;remember(rtts,performance.now()-data.at);}
  else if(data.type==='game'&&data.payload?.from===peerId){counts.received++;arenaReceive(data.event,data.payload,channel);}
};
const panel=document.createElement('section');panel.setAttribute('aria-label','Local online performance QA');
panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#fff;color:#111;padding:8px;font:12px monospace;max-height:42vh;overflow:auto';
const title=document.createElement('strong');title.textContent='LOCAL '+role.toUpperCase()+' · two synthetic players · BroadcastChannel, NOT production transport';panel.append(title);
const output=document.createElement('pre');output.id='perf-result';output.style.cssText='white-space:pre-wrap;margin:6px 0';
function show(){output.textContent=JSON.stringify({role,visibility:document.visibilityState,width:W,height:H,counts,
  fixtureTransportRttMedianMs:quantile(rtts,.5),rafGapMedianMs:quantile(frameGaps,.5),rafGapP95Ms:quantile(frameGaps,.95),
  frameCpuMedianMs:quantile(frameCpu,.5),frameCpuP95Ms:quantile(frameCpu,.95),reports},null,2);}
function profile(mode){
  const fn=mode==='published'?publishedStepRemoteShotVisuals:stepRemoteShotVisuals,
    original=arena.remoteShots,samples=[],render=[],calls=[],base=activeObstacles,baseTnt=activeArenaTnt;
  let geometry=0,tnt=0;activeObstacles=(...args)=>{geometry++;return base(...args);};activeArenaTnt=(...args)=>{tnt++;return baseTnt(...args);};
  try{
    for(let i=0;i<30;i++){
      const list=Array.from({length:300},()=>({x:700,y:900,ox:700,oy:900,vx:22,vy:0,life:2000,dist:0,bounce:0,wv:false,phaseWalls:0}));
      const countAt=geometry,tntAt=tnt,start=performance.now();fn(list,250);samples.push(performance.now()-start);
      calls.push({obstacles:geometry-countAt,tnt:tnt-tntAt});
      arena.remoteShots=list;const drawing=performance.now();drawWorld();drawHUD();render.push(performance.now()-drawing);
    }
    reports[mode]={kind:'300-tracer / 250ms catch-up synthetic workload, real browser JavaScript/canvas submission; NOT real-match FPS/GPU completion',
      samples:30,stepMedianMs:quantile(samples,.5),stepP95Ms:quantile(samples,.95),renderMedianMs:quantile(render,.5),
      renderP95Ms:quantile(render,.95),geometryBuildsPerStep:calls[0],tracersRetained:arena.remoteShots.length};
  }finally{activeObstacles=base;activeArenaTnt=baseTnt;arena.remoteShots=original;}
  show();
}
for(const [name,action]of [['PROFILE PUBLISHED',()=>profile('published')],['PROFILE FIX',()=>profile('fixed')],['READ METRICS',show]]){
  const b=document.createElement('button');b.textContent=name;b.style.cssText='margin:5px;padding:6px 10px';b.onclick=action;panel.append(b);
}
panel.append(output);document.body.append(panel);show();
let previousFrame=performance.now();const originalFrame=frame;
frame=()=>{const start=performance.now();remember(frameGaps,start-previousFrame);previousFrame=start;originalFrame();remember(frameCpu,performance.now()-start);};
const shotTimer=setInterval(()=>{if(arena.phase!=='fight')return;const a=role==='host'?0:Math.PI,speed=weaponBulletSpeed('ar');
  arenaBroadcastShot('ar',[{x:player.x,y:player.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed}]);counts.shots++;
},150),pingTimer=setInterval(()=>transport.postMessage({type:'ping',from:selfId,at:performance.now()}),250);
addEventListener('pagehide',()=>{clearInterval(shotTimer);clearInterval(pingTimer);transport.close();},{once:true});
requestAnimationFrame(frame);
`;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/__online-perf.js'){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(fixture);return;
    }
    if(url.pathname==='/'||url.pathname==='/index.html'){
      const html=(await fs.readFile(path.join(root,'index.html'),'utf8')).replace(/<script src="https:[^"]*"><\/script>/g,'')
        .replace(/<script src="\.\/outpost-zero\/js\/bootstrap\.js[^"]*"><\/script>/,'<script src="/__online-perf.js"></script>');
      res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;
    }
    const relative=decodeURIComponent(url.pathname).slice(1);
    if(!/^outpost-zero\/[a-zA-Z0-9_./-]+\.(js|css|svg|png|webp|jpg|mp3|ogg|wav)$/.test(relative)||relative.split('/').includes('..')){res.writeHead(404);res.end();return;}
    const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
    const bytes=await fs.readFile(path.join(root,relative));res.writeHead(200,{'Content-Type':types[path.extname(relative)],'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log('Owned local performance QA: http://127.0.0.1:'+port+'/?role=host and ?role=guest'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
