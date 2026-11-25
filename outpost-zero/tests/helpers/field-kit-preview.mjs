import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Local visual-QA fixture, never loaded by the production entry point. It
// omits bootstrap/auth initialization and all remote scripts. No credentials,
// database, synthetic account, network transport, or persistence service.
const root=fileURLToPath(new URL('../../../',import.meta.url));
const port=Number(process.argv[2]||8798);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid local preview port');
const fixture=String.raw`
"use strict";
window.fetch=()=>Promise.reject(new Error('Network disabled in local gameplay fixture'));
// Keep this credential-free QA fixture inside its side tab.
goFullscreen=()=>{};
loadMeta();bindCoreEvents();resize();
const bar=document.createElement('section');bar.id='field-kit-qa';
bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;padding:6px;background:#15212bec;color:#edf8ff;font:12px system-ui;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
const label=document.createElement('span');label.textContent='LOCAL GAMEPLAY QA · synthetic guest · no accounts';bar.append(label);
const makeButton=(text,act)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='padding:5px 10px;background:#344e61;color:white;border:1px solid #8bb7c6;border-radius:4px';b.onclick=()=>{act();cv.focus();};bar.append(b);};
const reset=()=>{if(arena&&arena.active)leaveArena('',false);tutorialOn=false;menuOpen=false;soloPractice=false;tryStartWeapon=null;loadout={primary:'ar',secondary:'m9',melee:'knife',utility:null};};
for(const id of ['arena','dimension','construction'])makeButton(id.toUpperCase(),()=>{reset();startBotArena({ladderReady:true});arena.mapId=id;arena.mapVotePhase='locked';arenaBotStartRound();});
makeButton('ENDLESS',()=>{reset();startGame();});
for(const key of [...FIELD_MELEE_KEYS,...FIELD_UTILITY_KEYS])makeButton((WEAPONS[key]||UTILITIES[key]).name,()=>{
  reset();soloPractice=true;
  if(WEAPONS[key]){loadout.melee=key;tryStartWeapon=key;}else{loadout.utility=key;loadout.primary=null;loadout.secondary=null;loadout.melee=null;}
  startPractice('dps');
  // Bring the existing infinite-HP range target into melee distance for QA.
  enemies[0].x=player.x+65;enemies[0].y=player.y;practiceSpawns[0].x=enemies[0].x;practiceSpawns[0].y=enemies[0].y;
});
makeButton('CATALOG',()=>{reset();state='select';selPage='weaponbrowse';weaponBrowserCat='MELEE';});
reset();
const view=new URLSearchParams(location.search).get('view');
if(view==='moderation'){
  state='select';selPage='hub';openReport();
}else if(view==='armory'){
  // Show the actual guest armory without the diagnostic toolbar covering it.
  state='select';selPage='weapons';
}else{
  document.body.append(bar);startBotArena({ladderReady:true});arena.mapId='arena';arena.mapVotePhase='locked';arenaBotStartRound();
}
requestAnimationFrame(frame);
`;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/__field-kit-preview.js'){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(fixture);return;
    }
    if(url.pathname==='/'||url.pathname==='/index.html'){
      let html=await fs.readFile(path.join(root,'index.html'),'utf8');
      html=html.replace(/<script src="https:[^\"]*"><\/script>/g,'')
        .replace(/<script src="\.\/outpost-zero\/js\/bootstrap\.js[^\"]*"><\/script>/,
          '<script src="/__field-kit-preview.js"></script>');
      res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;
    }
    const relative=decodeURIComponent(url.pathname).slice(1);
    if(!/^outpost-zero\/[a-zA-Z0-9_./-]+\.(js|css|svg|png|webp|jpg|mp3|ogg|wav)$/.test(relative)||relative.split('/').includes('..')){
      res.writeHead(404);res.end('Not a preview asset');return;
    }
    const data=await fs.readFile(path.join(root,relative));
    const type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'}[path.extname(relative)];
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Preview asset unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log('Credential-free local gameplay QA: http://127.0.0.1:'+port));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
