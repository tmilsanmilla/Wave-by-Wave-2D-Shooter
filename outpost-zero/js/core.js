"use strict";

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let state = 'select';                 // select | play | over (menu is an overlay)
let cvLeft=0;
function px(x){ return x - cvLeft; }

// --- side ribbons: alternate MOVES FOR A MISSION (hearts) and SUBSCRIBE TO LLR (YouTube badges) ---
function setupRibbons(){
  const DONATE='https://movesforamission.org/donate-now/#1740457740469-d24153b1-38c1';
  const LLR='https://www.youtube.com/@AsrtsbLLR';
  const letters = t => { let h=''; for(const c of t) h+='<span class="ch">'+(c===' '?'&nbsp;':c)+'</span>'; return h; };
  const heart = '<span class="ch hz">\u2665</span>';
  const ytBadge = '<span class="yt"></span>';
  const movesSeg = () =>
    '<a class="seg" href="'+DONATE+'" target="_blank" rel="noopener">'+
      heart+heart+ letters('DONATE TO MOVES FOR A MISSION NOW!') +heart+heart+
    '</a>';
  const llrSeg = () =>
    '<a class="seg" href="'+LLR+'" target="_blank" rel="noopener">'+
      ytBadge+ letters('SUBSCRIBE TO LLR') +ytBadge+
    '</a>';
  const chain = () => movesSeg()+'<div class="gap"></div>'+llrSeg()+'<div class="gap"></div>';
  const colHTML = () => '<div class="col">'+chain()+chain()+'</div>';   // duplicate for seamless loop
  const L=document.getElementById('llrL'), R=document.getElementById('llrR');
  if(L&&R){ L.innerHTML=colHTML(); R.innerHTML=colHTML(); }
}
let _ribbonShown=null;
function layoutRibbons(){
  const L=document.getElementById('llrL'), R=document.getElementById('llrR');
  if(!L||!R) return;
  const gut=cvLeft;                       // width of each side gutter (canvas is centered)
  // only show in the menus/armory, never during a live run
  const show = false;   // replaced by the canvas-drawn side ads, which the layout audit can see
  if(show===_ribbonShown) return;         // no change -> don't touch the DOM
  _ribbonShown=show;
  if(show){
    L.style.display=R.style.display='flex';
    L.style.left='0px';  L.style.width=gut+'px';
    R.style.right='0px'; R.style.width=gut+'px';
  } else {
    L.style.display=R.style.display='none';
  }
}
let W = 0, H = 0;
let DPR=1;
function resize(){
  // fit the canvas to the viewport EXACTLY (no overflow), crisp on retina via devicePixelRatio
  DPR = Math.min(1.5, window.devicePixelRatio||1);        // keep retina clarity without asking slower GPUs to draw 4x the pixels
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  W = vw; H = vh;                                          // logical (CSS) pixels == the whole viewport
  cv.style.width = vw+'px'; cv.style.height = vh+'px';
  cv.width  = Math.round(vw*DPR);                          // backing store scaled for sharpness
  cv.height = Math.round(vh*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);                       // draw in CSS-pixel coordinates
  cvLeft = cv.getBoundingClientRect().left;
  _ribbonShown=null;
  if(typeof layoutRibbons==='function') layoutRibbons();
}
function bindCoreEvents(){
  addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', ()=>setTimeout(resize,60));
  document.addEventListener('webkitfullscreenchange', ()=>setTimeout(resize,60));
  addEventListener('orientationchange', ()=>setTimeout(resize,120));
  resize();
}

const TAU = Math.PI * 2;
const clamp = (v,a,b)=> v < a ? a : v > b ? b : v;
const rand  = (a,b)=> a + Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };
