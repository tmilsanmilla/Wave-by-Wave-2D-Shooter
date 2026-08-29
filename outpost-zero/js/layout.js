"use strict";

// ---- HUB LAYOUT: main admins can drag these blocks; the offsets apply for every player ----
const LAYOUT_BLOCKS={
  banner:  'SEASON BANNER',
  posts:   'UPDATES BOARD',
  adleft:  'LLR AD (LEFT)',
  adright: 'MOVES AD (RIGHT)',
  streak:  'STREAK STRIP',
  tasks:   'DAILY TASKS',
  board:   'LEADERBOARD',
  coins:   'GEMS + COINS',
  account: 'ACCOUNT CHIP',
};
let layout={}, layoutMode=false, layoutRects=[], layoutDrag=null, layoutDirty=false, layoutPick=null, layoutLocalSaveT=0;
const LAYOUT_DRAFT_KEY='oz_ui_layout_draft';
const LAYOUT_COLOURS=[
  {id:'',       name:'DEFAULT', hex:null},
  {id:'gold',   name:'GOLD',    hex:'#e8b658'},
  {id:'green',  name:'GREEN',   hex:'#a7c15e'},
  {id:'blue',   name:'BLUE',    hex:'#7fd8ff'},
  {id:'red',    name:'RED',     hex:'#d05548'},
  {id:'purple', name:'PURPLE',  hex:'#bfa8ff'},
  {id:'white',  name:'WHITE',   hex:'#f2f2e8'},
];
function offCol(id){ const o=layout[id]; return (o && o.col) ? o.col : null; }
// run a block's drawing with every fillText forced to the chosen colour
function withBlockColour(id, draw){
  const c=offCol(id);
  if(!c){ draw(); return; }
  const orig=ctx.fillText;
  ctx.fillText=function(t,x,y,m){ const keep=this.fillStyle; this.fillStyle=c;
    const r=orig.call(this,t,x,y,m); this.fillStyle=keep; return r; };
  try{ draw(); } finally { ctx.fillText=orig; }
}
function offX(id){ const o=layout[id]; return (o&&+o.dx)||0; }
function offY(id){ const o=layout[id]; return (o&&+o.dy)||0; }
// register a block so layout mode can outline and drag it
function layoutBlock(id,x,y,w,h){ if(layoutMode) layoutRects.push({id,x,y,w,h}); }
function readLayoutDraft(){
  try{
    const saved=JSON.parse(localStorage.getItem(LAYOUT_DRAFT_KEY)||'null');
    return saved&&typeof saved==='object'&&saved.layout&&typeof saved.layout==='object' ? saved.layout : null;
  }catch(e){ return null; }
}
function persistLayoutDraft(){
  try{
    localStorage.setItem(LAYOUT_DRAFT_KEY,JSON.stringify({layout,updatedAt:Date.now()}));
    localStorage.setItem('oz_ui_layout',JSON.stringify(layout));
    return true;
  }catch(e){ return false; }
}
function clearLayoutDraft(){ try{ localStorage.removeItem(LAYOUT_DRAFT_KEY); }catch(e){} }
async function fetchLayout(){
  const draft=readLayoutDraft();
  if(draft){ layout=draft; layoutDirty=true; }
  else try{ const v=JSON.parse(localStorage.getItem('oz_ui_layout')||'null'); if(v&&typeof v==='object') layout=v; }catch(e){}
  if(!sb||draft) return;                            // never replace an unsaved local edit with an older server copy
  try{
    const { data } = await sb.from('ui_layout').select('data').eq('id','hub').maybeSingle();
    if(layoutDirty||readLayoutDraft()) return;       // an edit may have begun before its draft flush
    if(data && data.data && typeof data.data==='object'){ layout=data.data; localStorage.setItem('oz_ui_layout',JSON.stringify(layout)); }
  }catch(e){}
}
async function saveLayout(){
  if(!isMainAdmin()) return false;
  const snapshot=JSON.stringify(layout), savedLayout=JSON.parse(snapshot);
  persistLayoutDraft();                             // secure the edit before waiting for the network
  try{ localStorage.setItem('oz_ui_layout',snapshot); }catch(e){}
  try{
    if(sb){ const {error}=await sb.from('ui_layout').upsert({id:'hub',data:savedLayout,updated_by:adminEmail()},{onConflict:'id'}); if(error) throw error; }
    const current=JSON.stringify(layout)===snapshot;
    layoutDirty=!current;
    if(current) clearLayoutDraft(); else persistLayoutDraft();
    sfx(current?'pickup':'aim'); return current;
  }catch(e){ waveMsg='LAYOUT SAVE FAILED: '+String((e&&e.message)||e).slice(0,80); waveMsgT=now+4000; sfx('dry'); return false; }
}
function resetLayout(){ layout={}; layoutPick=null; layoutDirty=true; sfx('dry'); }
function drawLayoutOverlay(){
  if(!layoutMode) return;
  ctx.save();
  for(const r of layoutRects){
    const on = layoutDrag && layoutDrag.id===r.id;
    ctx.setLineDash([5,4]);
    ctx.strokeStyle = on ? '#7dff8c' : '#7fd8ff'; ctx.lineWidth = on ? 2 : 1;
    ctx.strokeRect(r.x+0.5, r.y+0.5, r.w, r.h);
    ctx.setLineDash([]);
    ctx.fillStyle = on ? 'rgba(125,255,140,0.9)' : 'rgba(127,216,255,0.85)';
    ctx.font='700 8px ui-monospace,Consolas,monospace';
    ctx.textAlign='left'; ctx.textBaseline='bottom';
    ctx.fillText(fitLine(LAYOUT_BLOCKS[r.id]||r.id, r.w), r.x+2, Math.max(10, r.y-2));
  }
  // colour row for the block you last touched
  if(layoutPick){
    const cw2=Math.min(70,(W-40)/LAYOUT_COLOURS.length), chh=24;
    const tot=cw2*LAYOUT_COLOURS.length+6*(LAYOUT_COLOURS.length-1);
    let cx2=W/2-tot/2; const cy2=H-30-8-chh-12;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillStyle='#7fd8ff'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('TEXT COLOUR \u00b7 '+(LAYOUT_BLOCKS[layoutPick]||layoutPick), W-24), W/2, cy2-4);
    for(const c of LAYOUT_COLOURS){
      layoutRects.push({id:'col:'+c.id, x:cx2, y:cy2, w:cw2, h:chh, tool:true});
      const on=(offCol(layoutPick)||'')===(c.hex||'');
      const hv=mouse.x>=cx2&&mouse.x<=cx2+cw2&&mouse.y>=cy2&&mouse.y<=cy2+chh;
      ctx.fillStyle= c.hex ? (on||hv? c.hex : c.hex+'55') : (on||hv?'#8a9268':'rgba(255,255,255,0.06)');
      ctx.fillRect(cx2,cy2,cw2,chh);
      ctx.strokeStyle= on?'#ffffff':'#4a4634'; ctx.lineWidth= on?2:1; ctx.strokeRect(cx2+0.5,cy2+0.5,cw2,chh);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle= c.hex?'#101208':'#cdd6b0'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(c.name,cw2-4), cx2+cw2/2, cy2+chh/2);
      cx2+=cw2+6;
    }
    ctx.textBaseline='top';
  }
  // toolbar
  const bw=Math.min(120,(W-40)/3), bh=30, gap=8;
  const total=bw*3+gap*2, bx0=W/2-total/2, by=H-bh-8;
  const btns=[['save', layoutDirty?'UPDATE':'UPDATED','#a7c15e'],
              ['reset','RESET','#e8b658'],
              ['done','DONE','#d05548']];
  let bx=bx0;
  for(const [id,lbl,col] of btns){
    layoutRects.push({id:'tb:'+id, x:bx, y:by, w:bw, h:bh, tool:true});
    const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
    ctx.fillStyle=hv?col:'rgba(8,10,5,0.92)'; ctx.fillRect(bx,by,bw,bh);
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,bw-8), bx+bw/2, by+bh/2);
    bx+=bw+gap;
  }
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#7fd8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('LAYOUT MODE \u00b7 drag any outlined block', W-24), W/2, by-10);
  ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.restore();
}
function layoutMouseDown(){
  // tools first: a block sitting under the toolbar must not swallow the click
  for(let i=layoutRects.length-1;i>=0;i--){
    const r=layoutRects[i];
    if(!r.tool) continue;
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id);
      if(id==='tb:save'){ saveLayout(); return true; }
      if(id==='tb:reset'){ resetLayout(); return true; }
      if(id==='tb:done'){ layoutMode=false; layoutDrag=null; layoutPick=null; sfx('swap'); return true; }
      if(id.indexOf('col:')===0 && layoutPick){
        const c=LAYOUT_COLOURS.find(x=>x.id===id.slice(4));
        const cur=layout[layoutPick]||{};
        layout[layoutPick]={dx:cur.dx||0, dy:cur.dy||0, col:(c&&c.hex)||null};
        layoutDirty=true; sfx('aim'); return true;
      }
      return true;
    }
  }
  // Match canvas paint order: when two moved sections overlap, the block
  // drawn last is the visible one and must receive the drag. Forward order
  // made an older hidden rectangle silently capture the press instead.
  for(let i=layoutRects.length-1;i>=0;i--){
    const r=layoutRects[i];
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.tool){
        const id=String(r.id).slice(3);
        if(id==='save'){ saveLayout(); return true; }
        if(id==='reset'){ resetLayout(); return true; }
        if(id==='done'){ layoutMode=false; layoutDrag=null; layoutPick=null; sfx('swap'); return true; }
        if(id.indexOf('col:')===0 && layoutPick){
          const c=LAYOUT_COLOURS.find(x=>x.id===id.slice(4));
          const cur=layout[layoutPick]||{};
          layout[layoutPick]={dx:cur.dx||0, dy:cur.dy||0, col:(c&&c.hex)||null};
          layoutDirty=true; sfx('aim'); return true;
        }
        return true;
      }
      layoutPick=r.id;
      layoutDrag={id:r.id, ox:mouse.x-offX(r.id), oy:mouse.y-offY(r.id)};
      sfx('aim');
      return true;
    }
  }
  return true;                                        // layout mode swallows clicks
}
function layoutMouseMove(){
  if(!layoutDrag) return;
  const id=layoutDrag.id;
  const cur=layout[id]||{};
  layout[id]={dx:Math.round(mouse.x-layoutDrag.ox), dy:Math.round(mouse.y-layoutDrag.oy), col:cur.col||null};
  layoutDirty=true;
}
function layoutMouseUp(){
  // A completed drag is valuable editor work. Flush it at the interaction
  // boundary as well as from the frame timer so a quick DONE/tab-close cannot
  // lose the last movement.
  if(layoutDrag&&layoutDirty) persistLayoutDraft();
  layoutDrag=null;
}
