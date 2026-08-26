"use strict";

let feedXRects=[];
async function deleteBanner(id){                     // mains: pull a post off everyone's feed (no archive)
  if(!isMainAdmin()) return;
  if(!sb){ const i=banners.findIndex(b=>b.id===id); if(i>=0) banners.splice(i,1); return; }
  try{ await sb.from('banners').delete().eq('id',id); }catch(e){}
  fetchBanners();
}
function drawHubPosts(topY, maxBottom){
  // UPDATES board: newest first, capped at 5 posts / 10 lines, each post wraps to two lines max
  bannerXRect=null; feedXRects=[];
  if(!banners.length) return topY;
  const bw=Math.min(560,W-56), bx=W/2-bw/2+offX('posts');
  topY += offY('posts');
  const head=20, pad=8, lineH=13;
  const xw = isMainAdmin() ? 18 : 0;                 // room for the remove button
  const maxCh=Math.max(8, Math.floor((bw-38-xw)/6.8));
  // lay out up to 5 posts / 10 lines within the room we have
  const room=Math.max(0, (maxBottom-topY) - head - pad*2);
  const items=[];
  let usedLines=0, usedH=0;
  for(const b of banners){
    if(items.length>=5 || usedLines>=10) break;
    const msg=String(b.message||'');
    let lines=[msg.slice(0,maxCh)];
    if(msg.length>maxCh && usedLines+2<=10) lines.push(msg.slice(maxCh,maxCh*2-1)+(msg.length>maxCh*2-1?'\u2026':''));
    const h=6+lines.length*lineH+3;
    if(usedH+h>room && items.length) break;
    if(usedH+h>room && !items.length){ lines=[lines[0]]; }
    items.push({b, lines, h:6+lines.length*lineH+3});
    usedLines+=lines.length; usedH+=items[items.length-1].h;
  }
  if(!items.length) return topY;
  const bh=head+pad*2+usedH;
  hubPostsRect={x:bx,y:topY,w:bw,h:bh};
  layoutBlock('posts',bx,topY,bw,bh);
  const postCol=offCol('posts');
  const g=ctx.createLinearGradient(bx,topY,bx,topY+bh);
  g.addColorStop(0,'rgba(232,182,88,0.16)'); g.addColorStop(1,'rgba(232,182,88,0.05)');
  ctx.fillStyle=g; ctx.fillRect(bx,topY,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(bx+0.5,topY+0.5,bw,bh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=postCol||'#e8b658'; ctx.font='700 12px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDCE2 UPDATES', bx+bw/2, topY+head/2+4);
  ctx.textAlign='left';
  let ry=topY+head+pad;
  for(let i=0;i<items.length;i++){
    const it=items[i];
    ctx.fillStyle= i%2 ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.26)';
    ctx.fillRect(bx+6, ry, bw-12, it.h-3);
    ctx.fillStyle='#e8d9a8'; ctx.font='11px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2022 '+it.lines[0], bx+14, ry+3+lineH/2+2);
    if(it.lines[1]){
      ctx.fillStyle='#e8d9a8'; ctx.font='11px ui-monospace,Consolas,monospace';
      ctx.fillText('  '+it.lines[1], bx+14, ry+3+lineH+lineH/2+2);
    }
    if(isMainAdmin()){                               // remove from the feed for everyone (not archived)
      const xr={x:bx+bw-22,y:ry+3,w:14,h:14,id:it.b.id};
      feedXRects.push(xr);
      const hv=mouse.x>=xr.x&&mouse.x<=xr.x+xr.w&&mouse.y>=xr.y&&mouse.y<=xr.y+xr.h;
      ctx.textAlign='center';
      ctx.fillStyle=hv?'#d05548':'#8a9268'; ctx.font='700 11px ui-monospace,Consolas,monospace';
      ctx.fillText('\u2715', xr.x+7, xr.y+7);
      ctx.textAlign='left';
    }
    ry+=it.h;
  }
  if(banners.length>items.length){
    ctx.textAlign='right'; ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('+'+(banners.length-items.length)+' more', bx+bw-12, topY+head/2+4);
    ctx.textAlign='left';
  }
  ctx.textBaseline='alphabetic';
  return topY+bh;
}
let readerOpen=false, readerTitle='', readerMeta='', readerBody='', readerRects=[], readerScroll=0;
function openReader(title, meta, body){
  readerOpen=true; readerTitle=String(title||''); readerMeta=String(meta||'');
  readerBody=String(body||''); readerScroll=0;
}
function readerLines(maxW){
  const out=[];
  for(const para of readerBody.split(/\n/)){
    if(!para.trim()){ out.push(''); continue; }
    let line='';
    for(const word of para.split(' ')){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width>maxW && line){ out.push(line); line=word; }
      else line=test;
    }
    if(line) out.push(line);
  }
  return out;
}
function drawReader(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(520,W-24), ph=Math.min(460,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#bfe8ff'; ctx.font='700 14px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(readerTitle, pw-24), W/2, py+24);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(readerMeta, pw-24), W/2, py+40);
  readerRects=[];
  const x0=px+18, top=py+56, bottom=py+ph-46, lh=15;
  ctx.font='11px ui-monospace,Consolas,monospace';
  // measure once with the arrow gutter reserved, so the two can never collide
  const gutter=58;
  const rwFull=pw-36, rwNarrow=pw-36-gutter;
  const fit=Math.max(1, Math.floor((bottom-top)/lh));
  let lines=readerLines(rwFull);
  const needsScroll=lines.length>fit;
  const rw = needsScroll ? rwNarrow : rwFull;
  if(needsScroll) lines=readerLines(rw);
  const maxScroll=Math.max(0, lines.length-fit);
  if(readerScroll>maxScroll) readerScroll=maxScroll;
  ctx.textAlign='left'; ctx.fillStyle='#cdd6b0';
  for(let i=0;i<fit && i+readerScroll<lines.length;i++)
    ctx.fillText(lines[i+readerScroll], x0, top+i*lh+10);
  if(maxScroll>0){
    // up / down when there is more than fits
    const bw2=40, bh2=22, bx2=px+pw-bw2-14;
    const mk=(id,lbl,yy,on)=>{
      readerRects.push({x:bx2,y:yy,w:bw2,h:bh2,id});
      const hv=mouse.x>=bx2&&mouse.x<=bx2+bw2&&mouse.y>=yy&&mouse.y<=yy+bh2;
      ctx.fillStyle= on ? (hv?'rgba(127,216,255,0.4)':'rgba(127,216,255,0.16)') : 'rgba(255,255,255,0.04)';
      ctx.fillRect(bx2,yy,bw2,bh2);
      ctx.strokeStyle= on?'#7fd8ff':'#4a4634'; ctx.lineWidth=1; ctx.strokeRect(bx2+0.5,yy+0.5,bw2,bh2);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle= on?'#bfe8ff':'#5a5648'; ctx.font='700 12px ui-monospace,Consolas,monospace';
      ctx.fillText(lbl, bx2+bw2/2, yy+bh2/2);
      ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    };
    mk('up','\u25B2', top-2, readerScroll>0);
    mk('down','\u25BC', bottom-bh2+2, readerScroll<maxScroll);
    ctx.textAlign='right'; ctx.fillStyle='#6b7455'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText((readerScroll+1)+'-'+Math.min(lines.length,readerScroll+fit)+' of '+lines.length, px+pw-14, bottom+12);
  }
  const cbw=Math.min(130,(pw-50)/2), cbh=28, gap=10, cby=py+ph-36;
  const button=(id,label,bx,col)=>{
    readerRects.push({x:bx,y:cby,w:cbw,h:cbh,id});
    const hv=mouse.x>=bx&&mouse.x<=bx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
    ctx.fillStyle=hv?col:'rgba(127,216,255,0.14)'; ctx.fillRect(bx,cby,cbw,cbh);
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,cby+0.5,cbw,cbh);
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=hv?'#101208':'#bfe8ff';
    ctx.font='700 11px ui-monospace,Consolas,monospace'; ctx.fillText(label,bx+cbw/2,cby+cbh/2);
  };
  const first=W/2-cbw-gap/2;
  button('copy','COPY TEXT',first-cbw,'#a7c15e');
  button('close','CLOSE',first+gap,'#7fd8ff');
  ctx.textAlign='left'; ctx.textBaseline='top';
}
async function copyReaderText(){
  const text=[readerTitle,readerMeta,readerBody].filter(Boolean).join('\n');
  try{ await navigator.clipboard.writeText(text); readerMeta='COPIED \u2014 paste it anywhere'; sfx('pickup'); }
  catch(e){ try{ window.prompt('Copy this text:',text); }catch(e2){} }
}
function readerClick(){
  for(const r of readerRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='close'){ readerOpen=false; sfx('swap'); return; }
      if(r.id==='copy'){ copyReaderText(); return; }
      if(r.id==='up'){ readerScroll=Math.max(0,readerScroll-3); sfx('aim'); return; }
      if(r.id==='down'){ readerScroll+=3; sfx('aim'); return; }
      return;
    }
  }
}
// the two admin inboxes share one screen; this draws the tab strip and returns the new y
function drawInboxTabs(px,py,pw,y,rects){
  const TABS=[];
  if(isAdmin())     TABS.push(['msgs','\u2709 MESSAGES'+(unreadMsgs?' ('+unreadMsgs+')':'')]);
  if(isMainAdmin()) TABS.push(['updates','\uD83D\uDCE5 UPDATES']);
  if(isAdmin())     TABS.push(['archive','\uD83D\uDDC3 ARCHIVE']);
  if(TABS.length<2) return y;                       // nothing to switch between
  const tw=Math.min(160,(pw-40)/TABS.length), th=22;
  let tx=W/2-(TABS.length*tw+8*(TABS.length-1))/2;
  for(const [id,lbl] of TABS){
    rects.push({x:tx,y,w:tw,h:th,id:'itab:'+id});
    const on=inboxTab===id;
    const hv=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    ctx.fillStyle= on?'#7fd8ff':hv?'rgba(127,216,255,0.2)':'rgba(0,0,0,0.35)'; ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(tx+0.5,y+0.5,tw,th);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle= on?'#101208':'#bfe8ff'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,tw-6), tx+tw/2, y+th/2);
    ctx.textBaseline='alphabetic';
    tx+=tw+8;
  }
  return y+th+10;
}
function inboxTabClick(id){
  if(String(id).indexOf('itab:')!==0) return false;
  const t=String(id).slice(5);
  inboxTab=t;
  msgsOpen=updatesOpen=archOpen=false;
  if(t==='msgs'){ msgsOpen=true; fetchMsgs().then(()=>markMsgsRead()); }
  else if(t==='updates'){ updatesOpen=true; fetchUpdatesFeed(); }
  else { archOpen=true; archTab='msgs'; fetchMsgs(); fetchUpdatesFeed(); }
  sfx('aim');
  return true;
}
function drawUpdates(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(460,W-30), ph=Math.min(520,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#080c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#bfe8ff'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDCE5 UPDATES', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(sb?'staff reports first, then player reports':'reports live on the deployed site \u2014 preview shows none', W/2, py+42);
  updatesRects=[];
  const x0=px+18, rw=pw-36; let y=drawInboxTabs(px,py,pw,py+52,updatesRects);
  const section=(title,rows,tint)=>{
    ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText(title, x0, y+8); y+=14;
    if(!rows.length){
      ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('nothing here yet', x0+4, y+8); y+=18; return;
    }
    for(const r of rows.slice(0,5)){
      const h=30, rbw=52;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle=tint; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textBaseline='middle';
      ctx.fillStyle=tint; ctx.font='700 8px ui-monospace,Consolas,monospace';
      const when=String(r.created_at||'').slice(5,16).replace('T',' ');
      ctx.fillText(String(r.name||'?').slice(0,26)+(when?'  \u00b7  '+when:''), x0+8, y+9);
      ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
      const msg=String(r.message||'').replace('[STAFF] ','');
      const clipped=fitLine(msg, rw-28-rbw*2);
      ctx.fillText(clipped, x0+8, y+21);
      // the whole row opens the full text, so nothing is unreadable
      updatesRects.push({x:x0,y,w:rw-rbw*2-8,h,id:'rd:'+(r.id!=null?r.id:'x'),
                         read:{t:String(r.name||'report'), m:when, b:msg}});
      {                                              // READ button
        const bx3=x0+rw-rbw*2-6;
        const hv3=mouse.x>=bx3&&mouse.x<=bx3+rbw&&mouse.y>=y+5&&mouse.y<=y+h-5;
        ctx.fillStyle=hv3?'rgba(127,216,255,0.34)':'rgba(127,216,255,0.16)'; ctx.fillRect(bx3,y+5,rbw,h-10);
        ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(bx3+0.5,y+5.5,rbw,h-10);
        ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
        ctx.fillStyle='#bfe8ff'; ctx.fillText('READ', bx3+rbw/2, y+h/2);
        ctx.textAlign='left';
        updatesRects.push({x:bx3,y:y+5,w:rbw,h:h-10,id:'rd2:'+(r.id!=null?r.id:'x'),
                           read:{t:String(r.name||'report'), m:when, b:msg}});
      }
      if(r.id!=null){                                // RESOLVE: clears it from this feed into the archive
        const bx2=x0+rw-rbw-4;
        updatesRects.push({x:bx2,y:y+5,w:rbw,h:h-10,id:'rs:'+r.id});
        const hv=mouse.x>=bx2&&mouse.x<=bx2+rbw&&mouse.y>=y+5&&mouse.y<=y+h-5;
        ctx.fillStyle=hv?'rgba(167,193,94,0.34)':'rgba(167,193,94,0.16)'; ctx.fillRect(bx2,y+5,rbw,h-10);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(bx2+0.5,y+5.5,rbw,h-10);
        ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
        ctx.fillStyle='#cfe0a8'; ctx.fillText('RESOLVE', bx2+rbw/2, y+h/2);
        ctx.textAlign='left';
      }
      ctx.textBaseline='alphabetic';
      y+=h+5;
    }
    y+=4;
  };
  section('\u26A0 STAFF REPORTS'+(updatesFeed.staff.length?' ('+updatesFeed.staff.length+')':''), updatesFeed.staff, '#e0a8a0');
  section('\uD83D\uDC65 PLAYER REPORTS'+(updatesFeed.player.length?' ('+updatesFeed.player.length+')':''), updatesFeed.player, '#8a9268');
  const bw2=110, bh2=26, gap2=10;
  const rx=W/2-bw2-gap2/2, cx=W/2+gap2/2, byy=py+ph-34;
  updatesRects.push({x:rx,y:byy,w:bw2,h:bh2,id:'refresh'});
  updatesRects.push({x:cx,y:byy,w:bw2,h:bh2,id:'close'});
  for(const [bx2,lbl,st] of [[rx,'\u21BB REFRESH','#7fd8ff'],[cx,'CLOSE','#d05548']]){
    const hv=mouse.x>=bx2&&mouse.x<=bx2+bw2&&mouse.y>=byy&&mouse.y<=byy+bh2;
    ctx.fillStyle=hv?st:'rgba(255,255,255,0.06)'; ctx.fillRect(bx2,byy,bw2,bh2);
    ctx.strokeStyle=st; ctx.strokeRect(bx2+0.5,byy+0.5,bw2,bh2);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(lbl, bx2+bw2/2, byy+bh2/2);
    ctx.textBaseline='alphabetic';
  }
  ctx.textAlign='left';
}
function updatesClick(){
  for(const r of updatesRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(inboxTabClick(r.id)) return;
      if(r.id==='close'){ updatesOpen=false; sfx('swap'); }
      else if(r.id==='refresh'){ fetchUpdatesFeed(); sfx('swap'); }
      else if(String(r.id).indexOf('rs:')===0){ resolveReport(+String(r.id).slice(3)); sfx('pickup'); }
      else if(r.read){ openReader(r.read.t, r.read.m, r.read.b); sfx('swap'); }
      return;
    }
  }
}
function drawArchive(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(480,W-24), ph=Math.min(480,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0c0b07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8d9a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2709 INBOX \u00b7 ARCHIVE', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('read messages land here after 7 days \u00b7 resolved reports too', W/2, py+42);
  archRects=[];
  const inboxY=drawInboxTabs(px,py,pw,py+50,archRects);
  const x0=px+16, rw=pw-32;
  let y=inboxY;
  // sub-sections: old messages | resolved reports (reports only for mains)
  if(!isMainAdmin()) archTab='msgs';
  const tabs=[['msgs','OLD MESSAGES']].concat(isMainAdmin()?[['reports','RESOLVED REPORTS']]:[]);
  const tw=Math.min(150,(rw-8)/2), th=20;
  let tx=W/2 - (tabs.length*tw + (tabs.length-1)*8)/2;
  for(const [id,lbl] of tabs){
    archRects.push({x:tx,y,w:tw,h:th,id:'tab:'+id});
    const on=archTab===id;
    const hv=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    ctx.fillStyle= on ? '#e8b658' : hv?'rgba(232,182,88,0.2)':'rgba(0,0,0,0.35)';
    ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#e8b658'; ctx.lineWidth=1; ctx.strokeRect(tx+0.5,y+0.5,tw,th);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle= on ? '#101208' : '#e8d9a8'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(lbl, tx+tw/2, y+th/2);
    ctx.textBaseline='alphabetic';
    tx+=tw+8;
  }
  y+=th+10;
  const me=adminEmail();
  if(archTab==='msgs'){
    const list=adminMsgs.filter(msgArchived);
    if(!list.length){
      ctx.textAlign='center'; ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('nothing archived yet', W/2, y+14);
    }
    for(const m of list.slice(0,9)){
      const h=34;
      if(y+h>py+ph-46) break;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='#8a9268'; ctx.font='700 8px ui-monospace,Consolas,monospace';
      const when=String(m.created_at||'').slice(5,16).replace('T',' ');
      ctx.fillText(String(m.from_email||'?').slice(0,24)+' \u2192 '+String(m.to_email||'?').slice(0,24)+(when?'  \u00b7 '+when:''), x0+8, y+10);
      ctx.fillStyle='#a9b28f'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText(String(m.message||'').slice(0, Math.floor((rw-16)/5.6)), x0+8, y+24);
      ctx.textBaseline='alphabetic';
      y+=h+5;
    }
  } else {
    const list=updatesResolved;
    if(!list.length){
      ctx.textAlign='center'; ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('no resolved reports yet', W/2, y+14);
    }
    for(const r of list.slice(0,9)){
      const h=30;
      if(y+h>py+ph-46) break;
      const staff=(r.meta&&r.meta.staff) || String(r.message||'').indexOf('[STAFF]')===0;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle= staff?'#e0a8a0':'#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle= staff?'#e0a8a0':'#8a9268'; ctx.font='700 8px ui-monospace,Consolas,monospace';
      ctx.fillText('\u2713 '+String(r.name||'?').slice(0,26), x0+8, y+9);
      ctx.fillStyle='#a9b28f'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText(String(r.message||'').replace('[STAFF] ','').slice(0, Math.floor((rw-16)/5.6)), x0+8, y+21);
      ctx.textBaseline='alphabetic';
      y+=h+5;
    }
  }
  const cbw=140, cbh=28, cbx=W/2-cbw/2, cby=py+ph-36;
  archRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'close'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#e8d9a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText('CLOSE', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function archReadable(r){ return !!r.read; }
function archClick(){
  for(const r of archRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(inboxTabClick(r.id)) return;
      break;
    }
  }
  for(const r of archRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='close'){ archOpen=false; sfx('swap'); return; }
      if(id.indexOf('tab:')===0){ archTab=id.slice(4); sfx('aim'); return; }
      return;
    }
  }
}
let storageTab='storage';
let weaponEditOpen=false, weaponEditKey=null, weaponEditDraft=null, weaponEditRects=[], weaponDefs={};
// the numeric fields an admin may tune, with sane bounds
const WFIELDS=[
  {k:'dmg',      label:'DAMAGE',        min:1,   max:9999},
  {k:'fireRate', label:'FIRE RATE (ms)',min:40,  max:3000},
  {k:'mag',      label:'MAG SIZE',      min:1,   max:500},
  {k:'reload',   label:'RELOAD (ms)',   min:0,   max:6000},
  {k:'range',    label:'RANGE',         min:20,  max:99999},
  {k:'pellets',  label:'PELLETS',       min:1,   max:20},
  {k:'pierce',   label:'PIERCE',        min:0,   max:20},
];
const WEAPON_EDITOR_SLOTS={};
for(const k of PRIMARIES) WEAPON_EDITOR_SLOTS[k]='primary';
for(const k of SECONDARIES) WEAPON_EDITOR_SLOTS[k]='secondary';
for(const k of MELEES) WEAPON_EDITOR_SLOTS[k]='melee';
for(const k of UTILKEYS) WEAPON_EDITOR_SLOTS[k]='utility';
for(const k of TEMP_PRIMARY) WEAPON_EDITOR_SLOTS[k]='primary';
for(const k of TEMP_SECONDARY) WEAPON_EDITOR_SLOTS[k]='secondary';
for(const k of TEMP_MELEE) WEAPON_EDITOR_SLOTS[k]='melee';
for(const k of TEMP_UTILITY) WEAPON_EDITOR_SLOTS[k]='utility';
for(const k in VAULT_SLOTS) WEAPON_EDITOR_SLOTS[k]=VAULT_SLOTS[k];
function savedWeaponPublished(k){
  if(FALL_KEYS.includes(k)) return false;            // next season cannot be made public from saved data
  if(weaponDefs[k] && typeof weaponDefs[k].published==='boolean') return weaponDefs[k].published;
  if(VAULT_ACTIVE.hasOwnProperty(k)) return !!VAULT_ACTIVE[k];
  return true;                                       // built-in weapons start published unless an admin saves otherwise
}
function weaponIsPublished(k){ return savedWeaponPublished(k); } // Test Mode never changes saved publish state
function weaponDefOf(k){ return WEAPONS[k] || VAULT_WEAPONS[k] || UTILITIES[k] || VAULT_UTILITIES[k] || null; }
function weaponPrice(k){ const it=GEM_SHOP.find(i=>i.key===k); return it? it.cost : null; }
async function fetchWeaponDefs(){
  if(!sb) return;
  try{
    const { data } = await sb.from('weapon_defs').select('key,stats,price,published').limit(80);
    weaponDefs={};
    for(const r of (data||[])){
      weaponDefs[r.key]=r;
      applyWeaponDef(r);
    }
  }catch(e){}
}
function applyWeaponDef(r){
  const def=weaponDefOf(r.key); if(!def) return;
  if(r.stats) for(const f of WFIELDS) if(typeof r.stats[f.k]==='number') def[f.k]=r.stats[f.k];
  if(FALL_KEYS.includes(r.key)){
    VAULT_ACTIVE[r.key]=false;                       // ignore stale/accidental public publish records
    unpublishVaultKey(r.key);
    if(fallEligible()) publishVaultKey(r.key);
    return;
  }
  if(VAULT_ACTIVE.hasOwnProperty(r.key)) VAULT_ACTIVE[r.key]=!!r.published;
  if(r.published) publishVaultKey(r.key); else unpublishVaultKey(r.key);
}
function publishVaultKey(k){
  if(FALL_KEYS.includes(k) && !fallEligible()){ unpublishVaultKey(k); return; }
  const slot=WEAPON_EDITOR_SLOTS[k];
  if(VAULT_WEAPONS[k] && !WEAPONS[k]) WEAPONS[k]=VAULT_WEAPONS[k];
  if(VAULT_UTILITIES[k] && !UTILITIES[k]) UTILITIES[k]=VAULT_UTILITIES[k];
  const r = slot==='primary'?PRIMARIES : slot==='secondary'?SECONDARIES : slot==='melee'?MELEES : null;
  if(r && !r.includes(k)) r.push(k);
  if(!r && VAULT_UTILITIES[k] && !UTILKEYS.includes(k)) UTILKEYS.push(k);
  if(WEAPONS[k] && !WKEYS.includes(k)) WKEYS.push(k);
}
function unpublishVaultKey(k){
  for(const arr of [PRIMARIES,SECONDARIES,MELEES,UTILKEYS,WKEYS]){
    const i=arr.indexOf(k); if(i>=0) arr.splice(i,1);
  }
  for(const slot of ['primary','secondary','melee','utility'])
    if(loadout[slot]===k) loadout[slot]=null;
}
function openWeaponEdit(k){
  weaponEditKey=k; storageOpen=false; weaponEditOpen=false;
  const def=weaponDefOf(k)||{};
  weaponEditDraft={};
  for(const f of WFIELDS) if(typeof def[f.k]==='number') weaponEditDraft[f.k]=def[f.k];
  const pr=weaponPrice(k); if(pr!==null) weaponEditDraft.price=pr;
  weaponEditDraft.published = FALL_KEYS.includes(k) ? false : savedWeaponPublished(k);
  showWeaponForm();
}
function showWeaponForm(){
  const k=weaponEditKey, def=weaponDefOf(k)||{}, d=weaponEditDraft;
  const nextSeason=FALL_KEYS.includes(k);
  if(nextSeason) d.published=false;
  const fields=[];
  for(const f of WFIELDS) if(typeof d[f.k]==='number')
    fields.push({id:f.k, label:f.label, min:f.min, max:f.max, value:d[f.k], was:def[f.k]});
  if(typeof d.price==='number')
    fields.push({id:'price', label:'GEM PRICE', min:0, max:9999, value:d.price, was:weaponPrice(k)});
  openForm({
    title:'\u2699 '+(def.name||k),
    hint:(nextSeason?'NEXT SEASON \u00b7 ADMIN PREVIEW ONLY'
                    :(d.published?'PUBLISHED \u00b7 players can use it':'IN STORAGE \u00b7 not live yet'))
         +' \u00b7 type straight into the boxes',
    fields,
    saveLabel:'SAVE',
    onCancel:()=>{ weaponEditKey=null; weaponEditDraft=null; storageOpen=true; },
    extraButton:nextSeason ? null : {
      label: d.published?'\u2193 UNPUBLISH (back to storage)':'\u2191 PUBLISH (make it live)',
      onClick:()=>{                                  // keep what is typed, flip the state, redraw
        const v=formValues();
        for(const key in v) if(v[key]!==null) weaponEditDraft[key]=v[key];
        weaponEditDraft.published=!weaponEditDraft.published;
        showWeaponForm();
      }
    },
    onSave:(v)=>{
      for(const key in v) if(v[key]!==null) weaponEditDraft[key]=v[key];
      saveWeaponEdit();
    }
  });
}
async function saveWeaponEdit(){
  if(!isMainAdmin() || !weaponEditKey){ formError('main-admin access required'); return; }
  const k=weaponEditKey, d=weaponEditDraft, nextSeason=FALL_KEYS.includes(weaponEditKey);
  if(nextSeason) d.published=false;
  const stats={};
  for(const f of WFIELDS) if(typeof d[f.k]==='number') stats[f.k]=d[f.k];
  const row={key:k, stats, price:null, published:nextSeason?false:!!d.published, updated_by:adminEmail()};
  $('formstatus').textContent='saving...';
  try{
    if(sb){
      const {error}=await sb.from('weapon_defs').upsert(row,{onConflict:'key'});
      if(error) throw error;
      if(typeof d.price==='number' && d.price!==weaponPrice(k)) await saveGemPrice(k,d.price);
    } else if(typeof d.price==='number' && d.price!==weaponPrice(k)) setGemPrice(k,d.price);
    weaponDefs[k]=row;
    applyWeaponDef(row);                              // change live state only after the save succeeds
    weaponEditOpen=false; closeForm(); weaponEditKey=null; weaponEditDraft=null; storageOpen=true;
    storageTab = row.published ? 'published' : 'storage';
    sfx('pickup');
  }catch(e){
    const msg=String((e&&e.message)||e||'save failed');
    formError('SAVE FAILED: '+msg.slice(0,120)); sfx('dry');
  }
}
function drawWeaponEdit(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(460,W-24), ph=Math.min(520,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0a0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  const def=weaponDefOf(weaponEditKey)||{};
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#d8c8ff'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('\u2699 '+(def.name||weaponEditKey), pw-24), W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(FALL_KEYS.includes(weaponEditKey)?'NEXT SEASON \u00b7 ADMIN PREVIEW ONLY'
               :(weaponEditDraft.published?'PUBLISHED \u00b7 players can use it':'IN STORAGE \u00b7 not live yet'), W/2, py+42);
  weaponEditRects=[];
  const x0=px+16, rw=pw-32; let y=py+54;
  const row=(id,label,val,suffix)=>{
    const h=26;
    weaponEditRects.push({x:x0,y,w:rw,h,id});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=hv?'rgba(191,168,255,0.16)':'rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(label, x0+10, y+h/2);
    ctx.textAlign='right';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(String(val)+(suffix||''), x0+rw-52, y+h/2);
    ctx.textAlign='center'; ctx.fillStyle='#bfe8ff'; ctx.font='700 8px ui-monospace,Consolas,monospace';
    ctx.fillText('EDIT', x0+rw-24, y+h/2);
    ctx.textBaseline='alphabetic';
    y+=h+5;
  };
  for(const f of WFIELDS){
    if(typeof weaponEditDraft[f.k]!=='number') continue;
    row('f:'+f.k, f.label, weaponEditDraft[f.k]);
  }
  if(typeof weaponEditDraft.price==='number') row('f:price','GEM PRICE', weaponEditDraft.price, ' \uD83D\uDC8E');

  // Next-season entries stay private; every other item keeps the publish toggle.
  const th=30;
  const nextSeason=FALL_KEYS.includes(weaponEditKey);
  if(!nextSeason) weaponEditRects.push({x:x0,y,w:rw,h:th,id:'pub'});
  const phv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+th;
  const on=!nextSeason && !!weaponEditDraft.published;
  ctx.fillStyle= on ? (phv?'rgba(208,85,72,0.34)':'rgba(208,85,72,0.16)')
                    : nextSeason?'rgba(191,168,255,0.12)'
                    :(phv?'rgba(167,193,94,0.34)':'rgba(167,193,94,0.16)');
  ctx.fillRect(x0,y,rw,th);
  ctx.strokeStyle= nextSeason?'#bfa8ff':on?'#d05548':'#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,th);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle= nextSeason?'#d8c8ff':on?'#e0a8a0':'#cfe0a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText(nextSeason?'\uD83E\uDDEA TEST MODE ONLY':on?'\u2193 UNPUBLISH (back to storage)':'\u2191 PUBLISH (make it live)', W/2, y+th/2);
  ctx.textBaseline='alphabetic';
  y+=th+10;

  const fb=[['save','SAVE','#a7c15e'],['cancel','CANCEL','#d05548']];
  const fbw=Math.min(130,(pw-40)/fb.length), fgap=8;
  let fx=W/2-(fb.length*fbw+(fb.length-1)*fgap)/2; const fy=py+ph-36;
  for(const [id,lbl,col] of fb){
    weaponEditRects.push({x:fx,y:fy,w:fbw,h:28,id});
    const hv=mouse.x>=fx&&mouse.x<=fx+fbw&&mouse.y>=fy&&mouse.y<=fy+28;
    ctx.fillStyle=hv?col:'rgba(255,255,255,0.06)'; ctx.fillRect(fx,fy,fbw,28);
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(fx+0.5,fy+0.5,fbw,28);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(lbl, fx+fbw/2, fy+14);
    ctx.textBaseline='alphabetic';
    fx+=fbw+fgap;
  }
  ctx.textAlign='left';
}
function weaponEditClick(){
  for(const r of weaponEditRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='cancel'){ weaponEditOpen=false; storageOpen=true; sfx('swap'); return; }
      if(id==='save'){ saveWeaponEdit(); return; }
      if(id==='pub'){
        if(FALL_KEYS.includes(weaponEditKey)){ weaponEditDraft.published=false; sfx('dry'); return; }
        weaponEditDraft.published=!weaponEditDraft.published; sfx('swap'); return;
      }
      if(id.indexOf('f:')===0){
        const key=id.slice(2);
        const f=WFIELDS.find(x=>x.k===key);
        const cur=weaponEditDraft[key];
        let v; try{ v=window.prompt((f?f.label:'GEM PRICE')+' for '+weaponEditKey+':', String(cur)); }catch(e){ v=null; }
        if(v!==null && String(v).trim()!==''){
          const lo=f?f.min:0, hi=f?f.max:9999;
          weaponEditDraft[key]=Math.max(lo, Math.min(hi, Math.round(+v||0)));
          sfx('aim');
        }
        return;
      }
      return;
    }
  }
}
function drawStorage(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(500,W-24), ph=Math.min(500,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0a0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#d8c8ff'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2699 WEAPON EDITOR', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(isMainAdmin()?'edit stats and price \u00b7 publish or pull back to storage'
                                    :'everything in the vault \u00b7 view only', pw-24), W/2, py+42);
  storageRects=[];
  const x0=px+16, rw=pw-32; let y=py+54;

  const rows=[], seen=new Set();
  // Publish state comes from the saved editor record, never from test-mode roster injection.
  for(const k in WEAPON_EDITOR_SLOTS){
    const def=weaponDefOf(k); if(!def||seen.has(k)) continue;
    seen.add(k); rows.push({k,def,pub:weaponIsPublished(k)});
  }

  // tabs: each list gets the whole panel instead of one crowding the other out
  const pubList=rows.filter(r=>r.pub), stoList=rows.filter(r=>!r.pub);
  const TABS=[['storage','\uD83D\uDDC4 IN STORAGE ('+stoList.length+')'],
              ['published','\u2713 PUBLISHED ('+pubList.length+')']];
  const tw=Math.min(150,(rw-8)/2), th=22;
  let tx=W/2-(TABS.length*tw+8)/2;
  for(const [tid,lbl] of TABS){
    storageRects.push({x:tx,y,w:tw,h:th,id:'tab:'+tid});
    const on=storageTab===tid;
    const hv=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    ctx.fillStyle= on?'#bfa8ff':hv?'rgba(191,168,255,0.2)':'rgba(0,0,0,0.35)'; ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=1; ctx.strokeRect(tx+0.5,y+0.5,tw,th);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle= on?'#101208':'#d8c8ff'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,tw-6), tx+tw/2, y+th/2);
    ctx.textBaseline='alphabetic';
    tx+=tw+8;
  }
  y+=th+10;

  const section=(list, tint)=>{
    if(!list.length){
      ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('nothing here', x0+4, y+8); y+=18; return;
    }
    for(const r of list){
      const h=26, bw2=46;
      if(y+h>py+ph-52) break;
      ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle=tint; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
      const actW=isMainAdmin()? bw2+10 : 0;
      ctx.fillText(fitLine(r.def.name||r.k, rw*0.42-8), x0+8, y+h/2);
      ctx.textAlign='right';
      ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
      const bits=[];
      if(typeof r.def.dmg==='number') bits.push('DMG '+r.def.dmg);
      if(typeof r.def.fireRate==='number') bits.push(r.def.fireRate+'ms');
      const pr=weaponPrice(r.k); if(pr!==null) bits.push(pr+' \uD83D\uDC8E');
      ctx.fillText(fitLine(bits.join('  \u00b7  '), rw*0.46), x0+rw-actW-8, y+h/2);
      if(isMainAdmin()){
        const bx2=x0+rw-bw2-6;
        storageRects.push({x:bx2,y:y+4,w:bw2,h:h-8,id:'edit:'+r.k});
        const hv=mouse.x>=bx2&&mouse.x<=bx2+bw2&&mouse.y>=y+4&&mouse.y<=y+h-4;
        ctx.fillStyle=hv?'rgba(127,216,255,0.36)':'rgba(127,216,255,0.16)'; ctx.fillRect(bx2,y+4,bw2,h-8);
        ctx.strokeStyle='#7fd8ff'; ctx.strokeRect(bx2+0.5,y+4.5,bw2,h-8);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle='#bfe8ff'; ctx.fillText('EDIT', bx2+bw2/2, y+h/2);
      }
      ctx.textBaseline='alphabetic';
      y+=h+4;
    }
    y+=4;
  };
  section(storageTab==='published' ? pubList : stoList,
          storageTab==='published' ? '#a7c15e' : '#bfa8ff');

  const cbw=140, cbh=28, cbx=W/2-cbw/2, cby=py+ph-36;
  storageRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'close'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#bfa8ff':'rgba(191,168,255,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=1; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#d8c8ff'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText('CLOSE', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function storageClick(){
  for(const r of storageRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='close'){ storageOpen=false; adminPanelOpen=true; sfx('swap'); return; }
      if(id.indexOf('tab:')===0){ storageTab=id.slice(4); sfx('aim'); return; }
      if(id.indexOf('edit:')===0){
        if(!isMainAdmin()){ sfx('dry'); return; }
        openWeaponEdit(id.slice(5)); sfx('swap'); return;   // straight to the edit page
      }
      return;
    }
  }
}
function drawPromoAdmin(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(500,W-24), ph=Math.min(500,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83C\uDF81 PROMO CODES', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('create \u00b7 edit \u00b7 expire \u00b7 remove', pw-24), W/2, py+42);
  promoRects=[];
  const x0=px+16, rw=pw-32; let y=py+54;
  // new code
  const nbh=30;
  promoRects.push({x:x0,y,w:rw,h:nbh,id:'new'});
  const nhv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+nbh;
  ctx.fillStyle=nhv?'rgba(167,193,94,0.32)':'rgba(167,193,94,0.14)'; ctx.fillRect(x0,y,rw,nbh);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,nbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText('+ NEW CODE', W/2, y+nbh/2);
  ctx.textBaseline='alphabetic'; y+=nbh+10;

  if(!promoList.length){
    ctx.textAlign='center'; ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('no codes yet', W/2, y+14);
  }
  for(const pc of promoList.slice(0,7)){
    const h=40, bw2=42, bg=4;
    if(y+h>py+ph-52) break;
    const dead=promoExpired(pc);
    ctx.fillStyle= dead?'rgba(0,0,0,0.35)':'rgba(167,193,94,0.10)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle= dead?'#5a5648':'#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    const actW=3*(bw2+bg)+bg;
    ctx.fillStyle= dead?'#6b7455':'#e8d9a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(pc.code, rw-actW-20), x0+8, y+13);
    ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    const bits=[];
    if(pc.gems) bits.push(pc.gems+' \uD83D\uDC8E');
    if(pc.coins) bits.push(pc.coins+' \uD83E\uDE99');
    bits.push(pc.uses_max>0 ? (pc.uses_count+'/'+pc.uses_max+' used') : (pc.uses_count+' used'));
    bits.push(dead?'EXPIRED':(pc.expires_at?('until '+String(pc.expires_at).slice(0,10)):'no expiry'));
    ctx.fillText(fitLine(bits.join('  \u00b7  '), rw-actW-20), x0+8, y+28);
    // actions
    let ax=x0+rw-bg;
    const act=(id,lbl,col,fill)=>{
      const bx2=ax-bw2;
      promoRects.push({x:bx2,y:y+9,w:bw2,h:h-18,id:id+':'+pc.code});
      const hv=mouse.x>=bx2&&mouse.x<=bx2+bw2&&mouse.y>=y+9&&mouse.y<=y+h-9;
      ctx.fillStyle=hv?fill[1]:fill[0]; ctx.fillRect(bx2,y+9,bw2,h-18);
      ctx.strokeStyle=col; ctx.strokeRect(bx2+0.5,y+9.5,bw2,h-18);
      ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillStyle=col; ctx.fillText(lbl, bx2+bw2/2, y+h/2);
      ctx.textAlign='left';
      ax=bx2-bg;
    };
    act('del','REMOVE','#d05548',['rgba(208,85,72,0.16)','rgba(208,85,72,0.36)']);
    if(dead) act('revive','REVIVE','#a7c15e',['rgba(167,193,94,0.16)','rgba(167,193,94,0.36)']);
    else     act('exp','EXPIRE','#e8b658',['rgba(232,182,88,0.16)','rgba(232,182,88,0.36)']);
    act('edit','EDIT','#7fd8ff',['rgba(127,216,255,0.16)','rgba(127,216,255,0.36)']);
    ctx.textBaseline='alphabetic';
    y+=h+5;
  }
  const fb=[['refresh','\u21BB REFRESH','#a7c15e'],['close','CLOSE','#d05548']];
  const fbw=Math.min(130,(pw-40)/fb.length), fgap=8;
  let fx=W/2-(fb.length*fbw+(fb.length-1)*fgap)/2; const fy=py+ph-36;
  for(const [id,lbl,col] of fb){
    promoRects.push({x:fx,y:fy,w:fbw,h:28,id});
    const hv=mouse.x>=fx&&mouse.x<=fx+fbw&&mouse.y>=fy&&mouse.y<=fy+28;
    ctx.fillStyle=hv?col:'rgba(255,255,255,0.06)'; ctx.fillRect(fx,fy,fbw,28);
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(fx+0.5,fy+0.5,fbw,28);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,fbw-8), fx+fbw/2, fy+14);
    ctx.textBaseline='alphabetic';
    fx+=fbw+fgap;
  }
  ctx.textAlign='left';
}
function promoAdminClick(){
  for(const r of promoRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='close'){ promoAdminOpen=false; sfx('swap'); return; }
      if(id==='refresh'){ fetchPromos(); sfx('swap'); return; }
      if(id==='new'){ createPromo(); sfx('swap'); return; }
      const [act,code]=id.split(':');
      const pc=promoList.find(p=>p.code===code);
      if(!pc) return;
      if(act==='edit'){ editPromo(pc); sfx('swap'); return; }
      if(act==='exp'){ expirePromo(pc); sfx('dry'); return; }
      if(act==='revive'){ revivePromo(pc); sfx('pickup'); return; }
      if(act==='del'){ removePromo(pc); sfx('dry'); return; }
      return;
    }
  }
}
function drawWheel(){
  wheelUpdate();
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(360,W-24), ph=Math.min(420,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0e0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8b658'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83C\uDFA1 WHEEL SPIN', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(wheelReady>0?'1 spin ready \u00b7 use it before earning another'
                                   :('next spin in '+wheelCountdown()), pw-24), W/2, py+42);
  wheelRects=[];
  // the wheel itself
  const cx=W/2, cy=py+56+Math.min(120,(ph-160)/2), R=Math.min(110,(ph-190)/2, pw/2-30);
  const seg=TAU/WHEEL.length;
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(wheelAngle);
  const COLS=['rgba(127,216,255,0.30)','rgba(232,182,88,0.30)','rgba(191,168,255,0.30)','rgba(167,193,94,0.30)'];
  for(let i=0;i<WHEEL.length;i++){
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,i*seg,(i+1)*seg); ctx.closePath();
    ctx.fillStyle=COLS[i%COLS.length]; ctx.fill();
    ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.stroke();
    ctx.save(); ctx.rotate(i*seg+seg/2);
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText(WHEEL[i].t, R-12, 0);
    ctx.restore();
  }
  ctx.restore();
  // pointer
  ctx.fillStyle='#e8b658';
  ctx.beginPath(); ctx.moveTo(cx+R+2,cy); ctx.lineTo(cx+R+16,cy-7); ctx.lineTo(cx+R+16,cy+7); ctx.closePath(); ctx.fill();
  // result
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  if(wheelResult>=0){
    ctx.fillStyle='#a7c15e'; ctx.font='700 14px ui-monospace,Consolas,monospace';
    ctx.fillText('you won '+WHEEL[wheelResult].t, W/2, cy+R+26);
  }
  // buttons
  const bw=Math.min(150,pw-40), bh=32, bx=W/2-bw/2, by=py+ph-42-(wheelReady>0?36:0);
  if(!wheelSpinning && wheelResult<0 && wheelReady>0){
    wheelRects.push({x:bx,y:by,w:bw,h:bh,id:'spin'});
    const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
    ctx.fillStyle=hv?'#7dff8c':'rgba(94,196,106,0.7)'; ctx.fillRect(bx,by,bw,bh);
    ctx.strokeStyle='#7dff8c'; ctx.lineWidth=2; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
    ctx.textBaseline='middle'; ctx.fillStyle='#06210a'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText('SPIN', bx+bw/2, by+bh/2);
    ctx.textBaseline='alphabetic';
  }
  const cbw=Math.min(120,pw-40), cbh=26, cbx=W/2-cbw/2, cby=py+ph-36;
  if(!wheelSpinning){
    wheelRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'close'});
    const hv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
    ctx.fillStyle=hv?'#d05548':'rgba(208,85,72,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
    ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
    ctx.textBaseline='middle'; ctx.fillStyle=hv?'#101208':'#e0a8a0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(wheelResult>=0?'DONE':'CLOSE', cbx+cbw/2, cby+cbh/2);
    ctx.textBaseline='alphabetic';
  }
  ctx.textAlign='left';
}
function wheelClick(){
  for(const r of wheelRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='spin'){ spinWheel(); return; }
      if(r.id==='close'){ closeWheel(); sfx('swap'); return; }
      return;
    }
  }
}
function drawPlayers(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(520,W-24), ph=Math.min(520,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#bfe8ff'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDC65 PLAYERS', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(canEditPlayer()?'look up, edit, ban \u00b7 every change is logged'
                                      :'look up players \u00b7 view only', pw-24), W/2, py+42);
  playersRects=[];
  const x0=px+16, rw=pw-32; let y=py+52;

  const TABS=[['lookup', canEditPlayer()?'\u270E EDIT':'\uD83D\uDD0D LOOKUP']]
    .concat(isAdmin()?[['banned','\u26D4 BANNED'+(banList.length?' ('+banList.length+')':'')],
                       ['appeals','\u2696 APPEALS'+(appealList.filter(a=>a.status==='open').length?' ('+appealList.filter(a=>a.status==='open').length+')':'')],
                       ['log','\uD83D\uDCDC LOG']]:[]);
  const tw=Math.min(118,(rw-(TABS.length-1)*6)/TABS.length), th=22;
  let tx=W/2-(TABS.length*tw+(TABS.length-1)*6)/2;
  for(const [id,lbl] of TABS){
    playersRects.push({x:tx,y,w:tw,h:th,id:'tab:'+id});
    const on=playersTab===id;
    const hv=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    ctx.fillStyle= on?'#7fd8ff':hv?'rgba(127,216,255,0.2)':'rgba(0,0,0,0.35)'; ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(tx+0.5,y+0.5,tw,th);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle= on?'#101208':'#bfe8ff'; ctx.font='700 '+(tw<100?8:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,tw-6), tx+tw/2, y+th/2);
    ctx.textBaseline='alphabetic';
    tx+=tw+6;
  }
  y+=th+10;

  const empty=(t)=>{ ctx.textAlign='center'; ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
                     ctx.fillText(t, W/2, y+14); };
  if(playersTab==='lookup'){
    const bh=34;
    playersRects.push({x:x0,y,w:rw,h:bh,id:'go_lookup'});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+bh;
    ctx.fillStyle=hv?'rgba(127,216,255,0.30)':'rgba(127,216,255,0.14)'; ctx.fillRect(x0,y,rw,bh);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,bh);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#bfe8ff'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(canEditPlayer()?'\u270E LOOK UP / EDIT A PLAYER':'\uD83D\uDD0D LOOK UP A PLAYER', W/2, y+bh/2);
    ctx.textBaseline='alphabetic'; y+=bh+10;
    if(canBan()){
      playersRects.push({x:x0,y,w:rw,h:bh,id:'go_ban'});
      const hv2=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+bh;
      ctx.fillStyle=hv2?'rgba(208,85,72,0.30)':'rgba(208,85,72,0.14)'; ctx.fillRect(x0,y,rw,bh);
      ctx.strokeStyle='#d05548'; ctx.strokeRect(x0+0.5,y+0.5,rw,bh);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='#e0a8a0'; ctx.font='700 11px ui-monospace,Consolas,monospace';
      ctx.fillText('\u26D4 BAN A PLAYER', W/2, y+bh/2);
      ctx.textBaseline='alphabetic'; y+=bh+10;
    }
    if(isMainAdmin() && scoreReqs.length){
      ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('PENDING REQUESTS ('+scoreReqs.length+')', x0, y+8); y+=14;
      for(const r of scoreReqs.slice(0,4)){
        const h=28, bw2=48;
        if(y+h>py+ph-52) break;
        ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
        ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
        ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(String(r.target_email||''), rw-2*bw2-24), x0+8, y+9);
        ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(patchSummary(r.patch)+'  by '+String(r.requested_by||'?'), rw-2*bw2-24), x0+8, y+20);
        if(isCreator()){
          const ax=x0+rw-2*bw2-8, rx=x0+rw-bw2-4;
          playersRects.push({x:ax,y:y+4,w:bw2,h:h-8,id:'ok:'+r.id});
          playersRects.push({x:rx,y:y+4,w:bw2,h:h-8,id:'no:'+r.id});
          ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax,y+4,bw2,h-8);
          ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax+0.5,y+4.5,bw2,h-8);
          ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx,y+4,bw2,h-8);
          ctx.strokeStyle='#d05548'; ctx.strokeRect(rx+0.5,y+4.5,bw2,h-8);
          ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
          ctx.fillStyle='#cfe0a8'; ctx.fillText('OK', ax+bw2/2, y+h/2);
          ctx.fillStyle='#e0a8a0'; ctx.fillText('NO', rx+bw2/2, y+h/2);
        }
        ctx.textBaseline='alphabetic'; y+=h+5;
      }
    }
  } else if(playersTab==='banned'){
    if(!banList.length) empty('nobody is banned');
    for(const b of banList.slice(0,8)){
      const h=36, bw2=52;
      if(y+h>py+ph-52) break;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='#e0a8a0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
      const who=b.user_email||('device '+String(b.device_id||'').slice(0,10));
      ctx.fillText(fitLine(who, rw-bw2-100), x0+8, y+10);
      ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
      const scopes=Array.isArray(b.scopes)?b.scopes.join('+'):'account';
      ctx.fillText(fitLine('['+scopes+'] '+(b.until?('until '+String(b.until).slice(0,10)):'permanent')+
                           '  by '+String(b.banned_by||'?'), rw-bw2-24), x0+8, y+21);
      ctx.fillStyle='#6b7455';
      ctx.fillText(fitLine(b.note||'', rw-bw2-24), x0+8, y+31);
      if(canBan()){
        const ux=x0+rw-bw2-6;
        playersRects.push({x:ux,y:y+7,w:bw2,h:h-14,id:'unban:'+(b.user_email||'')});
        const hv=mouse.x>=ux&&mouse.x<=ux+bw2&&mouse.y>=y+7&&mouse.y<=y+h-7;
        ctx.fillStyle=hv?'rgba(167,193,94,0.34)':'rgba(167,193,94,0.16)'; ctx.fillRect(ux,y+7,bw2,h-14);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ux+0.5,y+7.5,bw2,h-14);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle='#cfe0a8'; ctx.fillText('UNBAN', ux+bw2/2, y+h/2);
      }
      ctx.textBaseline='alphabetic'; y+=h+5;
    }
  } else if(playersTab==='appeals'){
    if(!appealList.length) empty('no appeals');
    for(const a of appealList.slice(0,7)){
      const h=40, bw2=46;
      if(y+h>py+ph-52) break;
      const open=a.status==='open';
      ctx.fillStyle= open?'rgba(232,182,88,0.10)':'rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle= open?'#e8b658':'#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle= open?'#e8d9a8':'#8a9268'; ctx.font='700 9px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(String(a.player_email||'?')+'  \u00b7  '+String(a.created_at||'').slice(5,16).replace('T',' '), rw-2*bw2-24), x0+8, y+11);
      ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
      wrapTextClamped(String(a.message||''), x0+8, y+24, rw-2*bw2-24, 11, 2);
      if(open && canBan()){
        const ax=x0+rw-2*bw2-8, rx=x0+rw-bw2-4;
        playersRects.push({x:ax,y:y+8,w:bw2,h:h-16,id:'apok:'+a.id});
        playersRects.push({x:rx,y:y+8,w:bw2,h:h-16,id:'apno:'+a.id});
        ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax,y+8,bw2,h-16);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax+0.5,y+8.5,bw2,h-16);
        ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx,y+8,bw2,h-16);
        ctx.strokeStyle='#d05548'; ctx.strokeRect(rx+0.5,y+8.5,bw2,h-16);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle='#cfe0a8'; ctx.fillText('LIFT', ax+bw2/2, y+h/2);
        ctx.fillStyle='#e0a8a0'; ctx.fillText('DENY', rx+bw2/2, y+h/2);
      } else if(!open){
        ctx.textAlign='right'; ctx.fillStyle='#6b7455'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillText(String(a.status||'').toUpperCase(), x0+rw-10, y+h/2);
      }
      ctx.textBaseline='alphabetic'; y+=h+5;
    }
  } else {
    if(!playerLog.length) empty('nothing logged yet');
    for(const l of playerLog.slice(0,9)){
      const h=30;
      if(y+h>py+ph-52) break;
      ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='#7fd8ff'; ctx.font='700 8px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(String(l.action||'').toUpperCase()+'  \u00b7  '+String(l.at||'').slice(5,16).replace('T',' '), rw-16), x0+8, y+10);
      ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(String(l.actor_email||'?')+' \u2192 '+String(l.target_email||'?')+
                           (l.detail? ('  '+JSON.stringify(l.detail).slice(0,60)) : ''), rw-16), x0+8, y+21);
      ctx.textBaseline='alphabetic'; y+=h+4;
    }
  }

  const fb=[['refresh','\u21BB REFRESH','#7fd8ff'],['close','CLOSE','#d05548']];
  const fbw=Math.min(130,(pw-40)/fb.length), fgap=8;
  let fx=W/2-(fb.length*fbw+(fb.length-1)*fgap)/2; const fy=py+ph-36;
  for(const [id,lbl,col] of fb){
    playersRects.push({x:fx,y:fy,w:fbw,h:28,id});
    const hv=mouse.x>=fx&&mouse.x<=fx+fbw&&mouse.y>=fy&&mouse.y<=fy+28;
    ctx.fillStyle=hv?col:'rgba(255,255,255,0.06)'; ctx.fillRect(fx,fy,fbw,28);
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(fx+0.5,fy+0.5,fbw,28);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,fbw-8), fx+fbw/2, fy+14);
    ctx.textBaseline='alphabetic';
    fx+=fbw+fgap;
  }
  ctx.textAlign='left';
}
function playersClick(){
  for(const r of playersRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='close'){ playersOpen=false; sfx('swap'); return; }
      if(id==='refresh'){ fetchPlayersData(); if(isMainAdmin()) fetchScoreReqs(); sfx('swap'); return; }
      if(id.indexOf('tab:')===0){ playersTab=id.slice(4); sfx('aim'); return; }
      if(id==='go_lookup'){ playersOpen=false; scoresOpen=true; peStep='choose'; peData=null; peMode='edit'; openScoreEdit(); sfx('swap'); return; }
      if(id==='go_ban'){ if(!canBan()){ sfx('dry'); return; } playersOpen=false; scoresOpen=true; peMode='ban'; openScoreEdit(); sfx('swap'); return; }
      if(id.indexOf('unban:')===0){ const em=id.slice(6); if(em && canBan()) applyPlayerEdit(em,{ban:'unban'}).then(()=>fetchPlayersData()).catch(()=>{}); sfx('pickup'); return; }
      if(id.indexOf('apok:')===0){ const a=appealList.find(x=>String(x.id)===id.slice(5));
        if(a && canBan()){ applyPlayerEdit(a.player_email,{ban:'unban'}).catch(()=>{}); resolveAppeal(a.id,'lifted'); } sfx('pickup'); return; }
      if(id.indexOf('apno:')===0){ const a=appealList.find(x=>String(x.id)===id.slice(5));
        if(a && canBan()) resolveAppeal(a.id,'denied'); sfx('dry'); return; }
      if(id.indexOf('ok:')===0){ const q=scoreReqs.find(x=>String(x.id)===id.slice(3)); if(q) approveScoreReq(q); sfx('pickup'); return; }
      if(id.indexOf('no:')===0){ const q=scoreReqs.find(x=>String(x.id)===id.slice(3)); if(q) rejectScoreReq(q); sfx('dry'); return; }
      return;
    }
  }
}
function drawScores(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(480,W-24), ph=Math.min(500,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#080c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#bfe8ff'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText(canEditPlayer()?'\u270E PLAYER EDIT':'\uD83D\uDD0D PLAYER LOOKUP', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(isCreator()?'CREATOR \u00b7 changes apply immediately'
                      : isMainAdmin()?'MAIN ADMIN \u00b7 changes need the creator\u2019s approval'
                      : canSeeStats()?'CO-ADMIN \u00b7 full stats, view only'
                      :'anyone can look up a player\u2019s score', pw-24), W/2, py+42);
  scoresRects=[];
  const x0=px+16, rw=pw-32;
  let y=py+54;

  if(peStep==='choose'){
    // step 1: what do you want to do?
    const big=(id,label,sub,col)=>{
      const h=46;
      scoresRects.push({x:x0,y,w:rw,h,id});
      const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
      ctx.fillStyle=hv?col[1]:col[0]; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle=col[2]; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=col[3]; ctx.font='700 12px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(label, rw-16), W/2, y+h/2-8);
      ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(sub, rw-16), W/2, y+h/2+9);
      ctx.textBaseline='alphabetic';
      y+=h+10;
    };
    big('go_edit', canEditPlayer()?'\u270E PLAYER EDIT':'\uD83D\uDD0D PLAYER LOOKUP',
        canEditPlayer()?'score \u00b7 gems \u00b7 coins \u00b7 weapons'
        : canSeeStats()?'score \u00b7 gems \u00b7 coins \u00b7 weapons (view only)':'see a player\u2019s score',
        ['rgba(127,216,255,0.14)','rgba(127,216,255,0.32)','#7fd8ff','#bfe8ff']);
    if(canEditPlayer())
      big('go_ban','\u26D4 BAN','temporary or permanent \u00b7 account / device / leaderboard',
          ['rgba(208,85,72,0.14)','rgba(208,85,72,0.32)','#d05548','#e0a8a0']);
    y+=4;
    if(!canEditPlayer()) return peFooter(px,py,pw,ph);
    ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText(isCreator()?('PENDING REQUESTS'+(scoreReqs.length?' ('+scoreReqs.length+')':'')):'YOUR PENDING REQUESTS', x0, y+8);
    y+=14;
    if(!scoreReqs.length){
      ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('nothing waiting', x0+4, y+8); y+=18;
    }
    for(const r of scoreReqs.slice(0,5)){
      const h=32, bw2=52;
      if(y+h>py+ph-52) break;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      const room=isCreator()? rw-2*bw2-24 : rw-24;
      ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(String(r.target_email||''), room), x0+8, y+11);
      ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(patchSummary(r.patch)+'   by '+String(r.requested_by||'?'), room), x0+8, y+23);
      if(isCreator()){
        const ax2=x0+rw-2*bw2-8, rx2=x0+rw-bw2-4;
        scoresRects.push({x:ax2,y:y+5,w:bw2,h:h-10,id:'ok:'+r.id});
        scoresRects.push({x:rx2,y:y+5,w:bw2,h:h-10,id:'no:'+r.id});
        ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax2,y+5,bw2,h-10);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax2+0.5,y+5.5,bw2,h-10);
        ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx2,y+5,bw2,h-10);
        ctx.strokeStyle='#d05548'; ctx.strokeRect(rx2+0.5,y+5.5,bw2,h-10);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle='#cfe0a8'; ctx.fillText('APPROVE', ax2+bw2/2, y+h/2);
        ctx.fillStyle='#e0a8a0'; ctx.fillText('REJECT',  rx2+bw2/2, y+h/2);
      } else {
        ctx.textAlign='right'; ctx.fillStyle='#e8b658'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillText('AWAITING', x0+rw-10, y+h/2);
      }
      ctx.textBaseline='alphabetic';
      y+=h+5;
    }
  } else if(peStep==='panel'){
    // step 3: their live status, editable
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(peTarget, rw-90), x0, y+8);
    if(peData && peData.ban){
      ctx.textAlign='right'; ctx.fillStyle='#e0a8a0'; ctx.font='700 8px ui-monospace,Consolas,monospace';
      ctx.fillText(peData.ban.until? 'BANNED (temp)':'BANNED', x0+rw, y+8);
    }
    ctx.textBaseline='alphabetic'; y+=22;
    if(!peData){
      ctx.textAlign='center'; ctx.fillStyle='#e0a8a0'; ctx.font='700 11px ui-monospace,Consolas,monospace';
      ctx.fillText(peBusy?'looking up...':'player not found', W/2, y+16); y+=40;
    } else {
      const infoRow=(label,value)=>{
        const h=22; ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fillRect(x0,y,rw,h);
        ctx.strokeStyle='#4a4634'; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
        ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle='#8a9268'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillText(label,x0+9,y+h/2); ctx.textAlign='right'; ctx.fillStyle='#e8d9a8';
        ctx.fillText(fitLine(String(value),rw*0.62),x0+rw-9,y+h/2); ctx.textBaseline='alphabetic'; y+=h+4;
      };
      if(canSeeStats()&&!peData.publicOnly){
        let loginText='unknown';
        if(peData.lastLogin){ const d=new Date(peData.lastLogin); if(!isNaN(+d)) loginText=d.toLocaleString(); }
        infoRow('LAST LOGIN',loginText);
        infoRow('CURRENT STREAK',peData.streak+' days');
        infoRow('LONGEST STREAK',peData.longestStreak+' days');
        infoRow('READY WHEEL SPINS',peData.wheelSpins||0);
        infoRow('COSMETICS / ANIMATIONS',(peData.cosmetics||0)+' / '+(peData.animations||0));
      }
      // numeric rows
      const numRow=(id,label,val,was)=>{
        const h=26;
        if(canEditLoadedPlayer()) scoresRects.push({x:x0,y,w:rw,h,id});
        const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
        ctx.fillStyle=hv?'rgba(127,216,255,0.16)':'rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
        ctx.strokeStyle=(val!==was)?'#7fd8ff':'#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
        ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
        ctx.fillText(label, x0+10, y+h/2);
        ctx.textAlign='right';
        ctx.fillStyle=(val!==was)?'#7fd8ff':'#e8d9a8'; ctx.font='700 10px ui-monospace,Consolas,monospace';
        ctx.fillText(String(val)+(val!==was?'  (was '+was+')':''), x0+rw-52, y+h/2);
        if(canEditLoadedPlayer()){
          ctx.textAlign='center'; ctx.fillStyle='#bfe8ff'; ctx.font='700 8px ui-monospace,Consolas,monospace';
          ctx.fillText('EDIT', x0+rw-24, y+h/2);
        }
        ctx.textBaseline='alphabetic';
        y+=h+5;
      };
      const pre=canEditLoadedPlayer()?'EDIT ':'';
      numRow('n_score',peData.publicOnly?peData.publicMetric:(pre+'HIGH SCORE'), peEdit.score, peData.score);
      if(peData.publicOnly||!canSeeStats()) return peFooter(px,py,pw,ph);
      numRow('n_gems', pre+'GEMS',  peEdit.gems,  peData.gems);
      numRow('n_coins',pre+'COINS', peEdit.coins, peData.coins);
      y+=4;
      // toggle: weapons and upgrades are both long lists, so they share the panel by turns
      const PT=[['items','\u2699 WEAPONS'],['ups','\u2B06 UPGRADES']];
      const ptw=Math.min(140,(rw-8)/2), pth=20;
      let ptx=W/2-(PT.length*ptw+8)/2;
      for(const [tid,lbl] of PT){
        scoresRects.push({x:ptx,y,w:ptw,h:pth,id:'ptab:'+tid});
        const on=pePanelTab===tid;
        const hv=mouse.x>=ptx&&mouse.x<=ptx+ptw&&mouse.y>=y&&mouse.y<=y+pth;
        ctx.fillStyle= on?'#7fd8ff':hv?'rgba(127,216,255,0.2)':'rgba(0,0,0,0.35)'; ctx.fillRect(ptx,y,ptw,pth);
        ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(ptx+0.5,y+0.5,ptw,pth);
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle= on?'#101208':'#bfe8ff'; ctx.font='700 9px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(lbl,ptw-6), ptx+ptw/2, y+pth/2);
        ctx.textBaseline='alphabetic';
        ptx+=ptw+8;
      }
      y+=pth+8;
      ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText(canEditPlayer()? (pePanelTab==='items'?'EDIT WEAPONS \u00b7 + grants \u00b7 \u2212 removes':'EDIT UPGRADES \u00b7 + / \u2212 how many they hold')
                                  : (pePanelTab==='items'?'WEAPONS OWNED':'UPGRADES HELD'), x0, y+8);
      y+=14;
      const items = pePanelTab==='items' ? PE_ITEMS() : [];
      for(const k of items){
        const h=22, bw2=24;
        if(y+h>py+ph-52) break;
        const owns=!!peEdit.owned[k], had=!!peData.owned[k];
        const nm=(WEAPONS[k]||UTILITIES[k]||VAULT_WEAPONS[k]||VAULT_UTILITIES[k]||{}).name||k;
        ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(x0,y,rw,h);
        ctx.strokeStyle=(owns!==had)?'#7fd8ff':'#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
        ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillStyle=owns?'#cfe0a8':'#6b7455'; ctx.font='700 9px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine((owns?'\u2714 ':'\u00b7 ')+nm, rw-90), x0+8, y+h/2);
        if(canEditPlayer()){
          const mx=x0+rw-2*bw2-10, px2=x0+rw-bw2-6;
          scoresRects.push({x:mx,y:y+3,w:bw2,h:h-6,id:'m:'+k});
          scoresRects.push({x:px2,y:y+3,w:bw2,h:h-6,id:'p:'+k});
          ctx.fillStyle=owns?'rgba(208,85,72,0.28)':'rgba(255,255,255,0.05)'; ctx.fillRect(mx,y+3,bw2,h-6);
          ctx.strokeStyle='#d05548'; ctx.strokeRect(mx+0.5,y+3.5,bw2,h-6);
          ctx.fillStyle=!owns?'rgba(167,193,94,0.28)':'rgba(255,255,255,0.05)'; ctx.fillRect(px2,y+3,bw2,h-6);
          ctx.strokeStyle='#a7c15e'; ctx.strokeRect(px2+0.5,y+3.5,bw2,h-6);
          ctx.textAlign='center'; ctx.font='700 11px ui-monospace,Consolas,monospace';
          ctx.fillStyle='#e0a8a0'; ctx.fillText('\u2212', mx+bw2/2, y+h/2);
          ctx.fillStyle='#cfe0a8'; ctx.fillText('+',       px2+bw2/2, y+h/2);
        }
        ctx.textBaseline='alphabetic';
        y+=h+4;
      }
      // ---- UPGRADES (stocked powerups) ----
      if(pePanelTab==='ups'){
        for(const pu of POWERUPS){
          const h=22, bw2=24;
          if(y+h>py+ph-52) break;
          const have=Math.max(0, Math.round((peEdit.pow&&peEdit.pow[pu.id])||0)), had=(peData.pow&&peData.pow[pu.id])||0;
          ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(x0,y,rw,h);
          ctx.strokeStyle=(have!==had)?'#7fd8ff':'#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
          ctx.textAlign='left'; ctx.textBaseline='middle';
          ctx.fillStyle=have?'#cfe0a8':'#6b7455'; ctx.font='700 9px ui-monospace,Consolas,monospace';
          ctx.fillText(fitLine(pu.emoji+' '+pu.name+'  x'+have+(have!==had?('  (was '+had+')'):''), rw-90), x0+8, y+h/2);
          if(canEditPlayer()){
            const mx=x0+rw-2*bw2-10, px2=x0+rw-bw2-6;
            scoresRects.push({x:mx,y:y+3,w:bw2,h:h-6,id:'pm:'+pu.id});
            scoresRects.push({x:px2,y:y+3,w:bw2,h:h-6,id:'pp:'+pu.id});
            ctx.fillStyle=have?'rgba(208,85,72,0.28)':'rgba(255,255,255,0.05)'; ctx.fillRect(mx,y+3,bw2,h-6);
            ctx.strokeStyle='#d05548'; ctx.strokeRect(mx+0.5,y+3.5,bw2,h-6);
            ctx.fillStyle='rgba(167,193,94,0.28)'; ctx.fillRect(px2,y+3,bw2,h-6);
            ctx.strokeStyle='#a7c15e'; ctx.strokeRect(px2+0.5,y+3.5,bw2,h-6);
            ctx.textAlign='center'; ctx.font='700 11px ui-monospace,Consolas,monospace';
            ctx.fillStyle='#e0a8a0'; ctx.fillText('\u2212', mx+bw2/2, y+h/2);
            ctx.fillStyle='#cfe0a8'; ctx.fillText('+',      px2+bw2/2, y+h/2);
          }
          ctx.textBaseline='alphabetic';
          y+=h+4;
        }
      }
    }
  }

  peFooter(px,py,pw,ph);
}
function peFooter(px,py,pw,ph){
  const fb=[];
  if(peStep==='panel' && canEditLoadedPlayer())
    fb.push(['apply', peDirty()?(isCreator()?'APPLY':'REQUEST'):'NO CHANGES', peDirty()?'#a7c15e':'#5a5648']);
  if(peStep!=='choose') fb.push(['back','\u2039 BACK','#7fd8ff']);
  fb.push(['close','CLOSE','#d05548']);
  const fbw=Math.min(130,(pw-40)/fb.length), fgap=8;
  let fx=W/2-(fb.length*fbw+(fb.length-1)*fgap)/2;
  const fy=py+ph-36;
  for(const [id,lbl,col] of fb){
    scoresRects.push({x:fx,y:fy,w:fbw,h:28,id});
    const hv=mouse.x>=fx&&mouse.x<=fx+fbw&&mouse.y>=fy&&mouse.y<=fy+28;
    ctx.fillStyle=hv?col:'rgba(255,255,255,0.06)'; ctx.fillRect(fx,fy,fbw,28);
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(fx+0.5,fy+0.5,fbw,28);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,fbw-8), fx+fbw/2, fy+14);
    ctx.textBaseline='alphabetic';
    fx+=fbw+fgap;
  }
  ctx.textAlign='left';
}
function scoresClick(){
  for(const r of scoresRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='close'){ scoresOpen=false; peStep='choose'; peData=null; if(isAdmin()) playersOpen=true; sfx('swap'); return; }
      if(id==='back'){ peStep='choose'; peData=null; sfx('swap'); return; }
      if(id==='go_edit'){ peMode='edit'; openScoreEdit(); sfx('swap'); return; }
      if(id==='go_ban'){ if(!canEditPlayer()){ sfx('dry'); return; } peMode='ban'; openScoreEdit(); sfx('swap'); return; }
      if(id==='apply'){ if(canEditLoadedPlayer() && peDirty()) peApply(); else sfx('dry'); return; }
      if(!canEditLoadedPlayer() && (id.indexOf('n_')===0||id.indexOf('p:')===0||id.indexOf('m:')===0||id.indexOf('pp:')===0||id.indexOf('pm:')===0)){ sfx('dry'); return; }
      if(id==='n_score'){ peEdit.score=peNum('new high score for '+peTarget+':', peEdit.score, 99999999); sfx('aim'); return; }
      if(id==='n_gems'){  peEdit.gems =peNum('new gem count for '+peTarget+':',  peEdit.gems, 9999999); sfx('aim'); return; }
      if(id==='n_coins'){ peEdit.coins=peNum('new coin count for '+peTarget+':', peEdit.coins, 9999999); sfx('aim'); return; }
      if(id.indexOf('p:')===0){ peEdit.owned[id.slice(2)]=true; sfx('pickup'); return; }
      if(id.indexOf('ptab:')===0){ pePanelTab=id.slice(5); sfx('aim'); return; }
      if(id.indexOf('pp:')===0){ const k=id.slice(3); peEdit.pow=peEdit.pow||{}; peEdit.pow[k]=Math.min(99,(peEdit.pow[k]||0)+1); sfx('pickup'); return; }
      if(id.indexOf('pm:')===0){ const k=id.slice(3); peEdit.pow=peEdit.pow||{}; peEdit.pow[k]=Math.max(0,(peEdit.pow[k]||0)-1); sfx('dry'); return; }
      if(id.indexOf('m:')===0){ delete peEdit.owned[id.slice(2)]; sfx('dry'); return; }
      if(id.indexOf('ok:')===0){ const q=scoreReqs.find(x=>String(x.id)===id.slice(3)); if(q) approveScoreReq(q); sfx('pickup'); return; }
      if(id.indexOf('no:')===0){ const q=scoreReqs.find(x=>String(x.id)===id.slice(3)); if(q) rejectScoreReq(q); sfx('dry'); return; }
      return;
    }
  }
}
function drawAdminsMenu(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(500,W-24), ph=Math.min(470,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0e0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8d9a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDC65 ADMINS', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(isCreator()?'CREATOR \u00b7 you can kick main admins too':'MAIN ADMIN \u00b7 manage co-admins', W/2, py+42);
  adminsRects=[];
  const x0=px+16, rw=pw-32;
  let y=py+56;
  // header
  ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='700 8px ui-monospace,Consolas,monospace';
  ctx.fillText('EMAIL', x0+6, y+8);
  ctx.fillText('RANK', x0+Math.floor(rw*0.46), y+8);
  ctx.textAlign='right'; ctx.fillText('ACTIONS', x0+rw-6, y+8);
  y+=14;
  const roster=adminRoster().slice(0,8);
  const me=adminEmail();
  for(const row of roster){
    const h=26, bw2=44, bg=4;
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle= row.rank==='creator' ? '#e8b658' : '#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    // email
    ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
    const nAct=(row.email===me?0:1)+((row.rank==='co'&&isMainAdmin())?1:0)
              +(((row.rank==='co'&&isMainAdmin())||(row.rank==='main'&&isCreator()))?1:0);
    const actW=nAct*(bw2+bg);
    const rankW=Math.min(84, Math.max(26, rw-actW-120));
    const rankX=x0+rw-actW-rankW-4;
    ctx.fillText(fitLine(row.email, Math.max(40, rankX-x0-12)), x0+6, y+h/2);
    // rank
    const rl = row.rank==='creator' ? (row.email===me?'CREATOR (ME)':'CREATOR') : row.rank==='main' ? 'MAIN ADMIN' : 'CO-ADMIN';
    ctx.fillStyle= row.rank==='creator' ? '#e8b658' : row.rank==='main' ? '#e0a8a0' : '#a7c15e';
    ctx.font='700 8px ui-monospace,Consolas,monospace';
    const rlShort = rankW<60 ? (row.rank==='creator'?(row.email===me?'ME':'CR'):row.rank==='main'?'MAIN':'CO') : rl;
    ctx.fillText(fitLine(rlShort, rankW), rankX, y+h/2);
    // actions, right-aligned: [MESSAGE] [PROMOTE] [KICK]
    let ax=x0+rw-4;
    const act=(id,lbl,stroke,fill,txt)=>{
      const bx2=ax-bw2;
      adminsRects.push({x:bx2,y:y+3,w:bw2,h:h-6,id});
      const hv=mouse.x>=bx2&&mouse.x<=bx2+bw2&&mouse.y>=y+3&&mouse.y<=y+h-3;
      ctx.fillStyle=hv?fill[1]:fill[0]; ctx.fillRect(bx2,y+3,bw2,h-6);
      ctx.strokeStyle=stroke; ctx.strokeRect(bx2+0.5,y+3.5,bw2,h-6);
      ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillStyle=txt; ctx.fillText(lbl, bx2+bw2/2, y+h/2);
      ctx.textAlign='left';
      ax=bx2-bg;
    };
    const canKick = (row.rank==='co' && isMainAdmin()) || (row.rank==='main' && isCreator());
    if(canKick) act('ak:'+row.email,'KICK','#d05548',['rgba(208,85,72,0.18)','rgba(208,85,72,0.36)'],'#e0a8a0');
    if(row.rank==='co' && isMainAdmin()) act('ap:'+row.email,'PROMOTE','#e8b658',['rgba(232,182,88,0.16)','rgba(232,182,88,0.34)'],'#e8d9a8');
    if(row.email!==me) act('am:'+row.email,'MESSAGE','#a7c15e',['rgba(167,193,94,0.16)','rgba(167,193,94,0.34)'],'#cfe0a8');
    ctx.textBaseline='alphabetic';
    y+=h+5;
  }
  // add admin
  const ah2=24, aw2=160;
  adminsRects.push({x:x0,y,w:aw2,h:ah2,id:'add'});
  const ahv=mouse.x>=x0&&mouse.x<=x0+aw2&&mouse.y>=y&&mouse.y<=y+ah2;
  ctx.fillStyle=ahv?'rgba(167,193,94,0.3)':'rgba(167,193,94,0.12)'; ctx.fillRect(x0,y,aw2,ah2);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,aw2,ah2);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 9px ui-monospace,Consolas,monospace';
  ctx.fillText('+ ADD ADMIN', x0+aw2/2, y+ah2/2);
  // close
  const cbw=140, cbh=28, cbx=W/2-cbw/2, cby=py+ph-36;
  adminsRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'close'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.fillStyle=chv?'#101208':'#e8d9a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText('CLOSE', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function adminsClick(){
  for(const r of adminsRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=r.id||'';
      if(id==='close'){ adminsOpen=false; sfx('swap'); return; }
      if(id==='add'){ addCoAdmin(); sfx('swap'); return; }
      if(id.indexOf('ak:')===0){ kickAdmin(id.slice(3)); sfx('dry'); return; }
      if(id.indexOf('ap:')===0){ promoteAdmin(id.slice(3)); sfx('pickup'); return; }
      if(id.indexOf('am:')===0){ openMsgCompose(id.slice(3)); sfx('swap'); return; }
      return;
    }
  }
}
function drawMsgs(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(480,W-24), ph=Math.min(480,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2709 MESSAGES', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(sb?'admin-to-admin mail \u00b7 newest first':'messages live on the deployed site', W/2, py+42);
  msgsRects=[];
  const x0=px+16, rw=pw-32; let y=drawInboxTabs(px,py,pw,py+50,msgsRects);
  if(isMainAdmin()){                                 // COMPOSE: start a message from here
    const cbh=28;
    msgsRects.push({x:x0,y,w:rw,h:cbh,id:'compose'});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+cbh;
    ctx.fillStyle=hv?'rgba(167,193,94,0.32)':'rgba(167,193,94,0.14)'; ctx.fillRect(x0,y,rw,cbh);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,cbh);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#cfe0a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('\u270E COMPOSE', W/2, y+cbh/2);
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    y+=cbh+10;
  }
  const me=adminEmail();
  const inboxList=adminMsgs.filter(m=>!msgArchived(m));
  if(!inboxList.length){
    ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('no messages yet', W/2, y+14);
  }
  for(const m of inboxList.slice(0,9)){
    const h=34;
    if(y+h>py+ph-46) break;
    const unread = m.to_email===me && !m.read;
    ctx.fillStyle= unread ? 'rgba(167,193,94,0.14)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle= unread ? '#a7c15e' : '#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle= unread ? '#cfe0a8' : '#8a9268'; ctx.font='700 8px ui-monospace,Consolas,monospace';
    const when=String(m.created_at||'').slice(5,16).replace('T',' ');
    ctx.fillText(fitLine((unread?'\u25CF ':'')+String(m.from_email||'?')+' \u2192 '+String(m.to_email||'?')+(when?'  \u00b7 '+when:''), rw-120), x0+8, y+10);
    ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
    const abw = m.to_email===me ? 50 : 0;
    const body=String(m.message||'');
    ctx.fillText(fitLine(body, rw-24-abw-52), x0+8, y+24);
    // row + READ open the whole message
    msgsRects.push({x:x0,y,w:rw-abw-56,h,id:'rd',
                    read:{t:String(m.from_email||'?'), m:when, b:body}});
    {
      const rbw=48, bx3=x0+rw-abw-rbw-6;
      const hv3=mouse.x>=bx3&&mouse.x<=bx3+rbw&&mouse.y>=y+6&&mouse.y<=y+h-6;
      ctx.fillStyle=hv3?'rgba(127,216,255,0.34)':'rgba(127,216,255,0.16)'; ctx.fillRect(bx3,y+6,rbw,h-12);
      ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(bx3+0.5,y+6.5,rbw,h-12);
      ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillStyle='#bfe8ff'; ctx.fillText('READ', bx3+rbw/2, y+h/2);
      ctx.textAlign='left';
      msgsRects.push({x:bx3,y:y+6,w:rbw,h:h-12,id:'rd2',
                      read:{t:String(m.from_email||'?'), m:when, b:body}});
    }
    if(m.to_email===me){                             // ARCHIVE now instead of waiting the 7 days
      const bx2=x0+rw-abw-4;
      msgsRects.push({x:bx2,y:y+7,w:abw,h:h-14,id:'ar:'+m.id});
      const hv=mouse.x>=bx2&&mouse.x<=bx2+abw&&mouse.y>=y+7&&mouse.y<=y+h-7;
      ctx.fillStyle=hv?'rgba(232,182,88,0.30)':'rgba(232,182,88,0.14)'; ctx.fillRect(bx2,y+7,abw,h-14);
      ctx.strokeStyle='#e8b658'; ctx.strokeRect(bx2+0.5,y+7.5,abw,h-14);
      ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillStyle='#e8d9a8'; ctx.fillText('ARCHIVE', bx2+abw/2, y+h/2);
      ctx.textAlign='left';
    }
    ctx.textBaseline='alphabetic';
    y+=h+5;
  }
  const bw2=110, bh2=26, gap2=10;
  const rx=W/2-bw2-gap2/2, cx2=W/2+gap2/2, byy=py+ph-34;
  msgsRects.push({x:rx,y:byy,w:bw2,h:bh2,id:'refresh'});
  msgsRects.push({x:cx2,y:byy,w:bw2,h:bh2,id:'close'});
  for(const [bx2,lbl,st] of [[rx,'\u21BB REFRESH','#a7c15e'],[cx2,'CLOSE','#d05548']]){
    const hv=mouse.x>=bx2&&mouse.x<=bx2+bw2&&mouse.y>=byy&&mouse.y<=byy+bh2;
    ctx.fillStyle=hv?st:'rgba(255,255,255,0.06)'; ctx.fillRect(bx2,byy,bw2,bh2);
    ctx.strokeStyle=st; ctx.strokeRect(bx2+0.5,byy+0.5,bw2,bh2);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(lbl, bx2+bw2/2, byy+bh2/2);
    ctx.textBaseline='alphabetic';
  }
  ctx.textAlign='left';
}
function msgsClick(){
  for(const r of msgsRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(inboxTabClick(r.id)) return;
      if(r.id==='compose'){ openComposePick(); sfx('swap'); return; }
      if(String(r.id).indexOf('to:')===0){ const to=String(r.id).slice(3); composePickOpen=false; openMsgCompose(to); sfx('swap'); return; }
      if(r.id==='pickcancel'){ composePickOpen=false; sfx('swap'); return; }
      if(r.id==='close'){ msgsOpen=false; sfx('swap'); }
      else if(r.id==='refresh'){ fetchMsgs().then(()=>markMsgsRead()); sfx('swap'); }
      else if(String(r.id).indexOf('ar:')===0){ archiveMsg(+String(r.id).slice(3)); sfx('swap'); }
      else if(r.read){ openReader(r.read.t, r.read.m, r.read.b); sfx('swap'); }
      return;
    }
  }
}
function aiLearningSelectedXp(){
  const liveLevel=botTrainingLevel(), level=clamp(Math.floor(+aiLearningModelLevel||1),1,liveLevel);
  aiLearningModelLevel=level;
  return level===liveLevel?botTrainingXp:(level-1)*BOT_TRAINING_XP_PER_LEVEL;
}
function aiLearningMetricRows(xp){
  const base=arenaBotTuning(0), model=arenaBotTuning(xp), n=(value,digits)=>Number(value).toFixed(digits);
  return [
    ['REACTION',base.reactionMs+' ms',model.reactionMs+' ms'],
    ['DECISION REFRESH',base.thinkMs+' ms',model.thinkMs+' ms'],
    ['MOVEMENT SPEED',n(base.moveSpeed,2),n(model.moveSpeed,2)],
    ['AIM NOISE',n(base.aimNoise,3),n(model.aimNoise,3)],
    ['SHOT JITTER',n(base.shotJitter,3),n(model.shotJitter,3)],
    ['FIRE TOLERANCE',n(base.fireAimError,3),n(model.fireAimError,3)],
    ['MOVEMENT LEAD',n(base.leadFactor,2),n(model.leadFactor,2)],
    ['LEAD HORIZON',base.maxLeadMs+' ms',model.maxLeadMs+' ms'],
    ['TURN RATE',n(base.turnRate,3),n(model.turnRate,3)],
  ];
}
function drawAiLearning(){
  if(!isMainAdmin()){ closeAiLearning(); return; }
  aiLearningRects=[];
  ctx.fillStyle='rgba(4,6,3,0.97)';ctx.fillRect(0,0,W,H);
  const tiny=W<430||H<430,dense=H<610,pw=Math.min(720,W-16),ph=Math.min(620,H-12),px=W/2-pw/2,py=H/2-ph/2;
  ctx.fillStyle='#080f12';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#7fd8ff';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#bfe8ff';ctx.font='700 '+(tiny?15:20)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('AI BOT LEARNING',W/2,py+(tiny?18:25));
  ctx.fillStyle='#8a9268';ctx.font=(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('CREATOR + MAIN ADMINS ONLY · TESTS ARE LOCAL AND NEVER CHANGE THE LIVE MODEL',pw-18),W/2,py+(tiny?34:44));

  const live=currentGlobalBotTraining(),liveLevel=botTrainingLevel(live.xp),selectedXp=aiLearningSelectedXp(),selectedLevel=botTrainingLevel(selectedXp),
    cardX=px+(tiny?7:14),cardW=pw-(tiny?14:28),cardY=py+(tiny?45:57),cardH=tiny?38:48;
  ctx.fillStyle='rgba(127,216,255,.09)';ctx.fillRect(cardX,cardY,cardW,cardH);ctx.strokeStyle='#315568';ctx.strokeRect(cardX+.5,cardY+.5,cardW,cardH);
  ctx.fillStyle='#7fd8ff';ctx.font='700 '+(tiny?9:12)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('LIVE GLOBAL · LV '+liveLevel+' · '+live.xp+'/'+BOT_TRAINING_MAX_XP+' XP',W/2,cardY+(tiny?11:15));
  ctx.fillStyle='#8a9268';ctx.font=(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(live.matches+' CURATED MATCHES · '+live.wins+' CREATOR/MAIN WINS · '+String(botTrainingSyncState).toUpperCase(),cardW-12),W/2,cardY+(tiny?27:34));

  const chooserY=cardY+cardH+(tiny?5:8),arrowW=tiny?40:54,arrowH=tiny?24:30,labelW=Math.max(100,cardW-arrowW*2-12);
  const chooser=(id,x,label,enabled)=>{
    const r={id,x,y:chooserY,w:id==='model_label'?labelW:arrowW,h:arrowH,enabled};aiLearningRects.push(r);
    const hv=enabled&&mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
    ctx.fillStyle=!enabled?'rgba(255,255,255,.025)':hv?'#7fd8ff':'rgba(127,216,255,.10)';ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.strokeStyle=enabled?'#7fd8ff':'#3a3f38';ctx.strokeRect(r.x+.5,r.y+.5,r.w,r.h);
    ctx.fillStyle=hv?'#101208':enabled?'#d7efff':'#5a6259';ctx.font='700 '+(tiny?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(label,r.w-8),r.x+r.w/2,r.y+r.h/2);
  };
  const groupW=arrowW*2+labelW+12,gx=W/2-groupW/2;
  chooser('model_prev',gx,'‹ PREV',selectedLevel>1);
  chooser('model_label',gx+arrowW+6,(selectedLevel===liveLevel?'LIVE':'ARCHIVE')+' MODEL · LV '+selectedLevel,false);
  chooser('model_next',gx+arrowW+labelW+12,'NEXT ›',selectedLevel<liveLevel);

  const rows=aiLearningMetricRows(selectedXp),sectionY=chooserY+arrowH+(tiny?9:15);
  ctx.textAlign='left';ctx.fillStyle='#a7c15e';ctx.font='700 '+(tiny?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText('XP-TUNED EXECUTION · LV 1  →  SELECTED',cardX,sectionY);
  if(tiny){
    const groups=[
      rows.slice(0,3).map(r=>r[0]+' '+r[1]+'→'+r[2]).join(' · '),
      rows.slice(3,6).map(r=>r[0]+' '+r[1]+'→'+r[2]).join(' · '),
      rows.slice(6).map(r=>r[0]+' '+r[1]+'→'+r[2]).join(' · '),
    ];
    ctx.fillStyle='#cdd6b0';ctx.font='7px ui-monospace,Consolas,monospace';
    groups.forEach((line,i)=>ctx.fillText(fitLine(line,cardW),cardX,sectionY+14+i*13));
  }else{
    const cols=2,colGap=18,colW=(cardW-colGap)/2,rowH=dense?18:21;
    rows.forEach((r,i)=>{
      const col=i%cols,row=Math.floor(i/cols),x=cardX+col*(colW+colGap),y=sectionY+18+row*rowH;
      ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(x,y-8,colW,rowH-2);
      ctx.fillStyle='#8a9268';ctx.font='8px ui-monospace,Consolas,monospace';ctx.fillText(r[0],x+6,y+1);
      ctx.textAlign='right';ctx.fillStyle='#cdd6b0';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText(r[1]+'  →  '+r[2],x+colW-6,y+1);ctx.textAlign='left';
    });
  }
  const coreY=tiny?sectionY+61:sectionY+18+Math.ceil(rows.length/2)*(dense?18:21)+7;
  ctx.fillStyle='#e8b658';ctx.font='700 '+(tiny?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText('SHARED TACTICAL ENGINE · CORE AT EVERY LEVEL',cardX,coreY);
  const core=['WALL + CORNER ROUTING','COVER SELECTION','STUCK RECOVERY','DELIBERATE PORTAL MOBILITY'];
  ctx.fillStyle='#cdd6b0';ctx.font='700 '+(tiny?7:9)+'px ui-monospace,Consolas,monospace';
  if(tiny)ctx.fillText(fitLine(core.map(v=>'✓ '+v).join(' · '),cardW),cardX,coreY+15);
  else core.forEach((v,i)=>ctx.fillText('✓ '+v+'  ·  ENABLED',cardX+(i%2)*(cardW/2),coreY+18+Math.floor(i/2)*18));
  const explainY=tiny?coreY+30:coreY+58;
  ctx.fillStyle='#65725d';ctx.font=(tiny?'7':'8')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('Archived levels reconstruct the fixed tuning curve. Core navigation stays enabled so the comparison isolates learned execution.',cardW),cardX,explainY);
  if(aiLearningNotice){ctx.fillStyle='#8a9268';ctx.textAlign='center';ctx.fillText(fitLine(aiLearningNotice,cardW),W/2,explainY+(tiny?13:16));ctx.textAlign='left';}

  const btnH=tiny?25:32,btnY=py+ph-btnH-(tiny?6:10),gap=6,totalW=cardW,btnW=(totalW-gap*2)/3;
  const actions=[['model_test','TEST LV '+selectedLevel,'#a7c15e'],['model_refresh','REFRESH','#7fd8ff'],['model_close','CLOSE','#d05548']];
  actions.forEach((a,i)=>{
    const x=cardX+i*(btnW+gap),r={id:a[0],x,y:btnY,w:btnW,h:btnH,enabled:true};aiLearningRects.push(r);
    const hv=mouse.x>=x&&mouse.x<=x+btnW&&mouse.y>=btnY&&mouse.y<=btnY+btnH;
    ctx.fillStyle=hv?a[2]:'rgba(255,255,255,.05)';ctx.fillRect(x,btnY,btnW,btnH);ctx.strokeStyle=a[2];ctx.strokeRect(x+.5,btnY+.5,btnW,btnH);
    ctx.fillStyle=hv?'#101208':'#e8d9a8';ctx.textAlign='center';ctx.font='700 '+(tiny?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(a[1],x+btnW/2,btnY+btnH/2);
  });
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function aiLearningClick(){
  if(!isMainAdmin()){ closeAiLearning(); return; }
  for(const r of aiLearningRects){
    if(!r.enabled||mouse.x<r.x||mouse.x>r.x+r.w||mouse.y<r.y||mouse.y>r.y+r.h) continue;
    const live=botTrainingLevel();
    if(r.id==='model_prev') aiLearningModelLevel=clamp(aiLearningModelLevel-1,1,live);
    else if(r.id==='model_next') aiLearningModelLevel=clamp(aiLearningModelLevel+1,1,live);
    else if(r.id==='model_refresh'){ aiLearningNotice='Refreshing the shared model...';void refreshGlobalBotTraining(true).then(()=>{if(aiLearningOpen){aiLearningModelLevel=botTrainingLevel();aiLearningNotice='Shared model is up to date.';}}); }
    else if(r.id==='model_test'){ startAiLearningModelTest(aiLearningSelectedXp()); }
    else if(r.id==='model_close') closeAiLearning();
    sfx('swap');return;
  }
}
function drawAdminPanel(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(430,W-30), ph=Math.min(430,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0e0a0a'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e0a8a0'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2699 ADMIN TOOLS', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText(isMainAdmin()?'MAIN ADMIN \u00b7 full access':'CO-ADMIN \u00b7 shared powers', W/2, py+42);
  ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('test mode taints the run \u2014 it will not be ranked', W/2, py+56);

  adminPanelRects=[];
  const gap=7, x0=px+18, rw=pw-36;
  let y=py+68;
  const actionBtn=(id,label,accent)=>{
    const h=28;
    adminPanelRects.push({x:x0,y,w:rw,h,id,enabled:true});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=hv?(accent||'rgba(208,85,72,0.35)'):'rgba(208,85,72,0.14)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(rw<300?9:11)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(label, rw-14), x0+rw/2, y+h/2);
    ctx.textBaseline='alphabetic'; y+=h+gap;
  };
  const toggle=(id,label,on,enabled)=>{
    const h=28;
    adminPanelRects.push({x:x0,y,w:rw,h,id,enabled});
    const hv=enabled && mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle= !enabled ? 'rgba(255,255,255,0.03)' : on ? 'rgba(167,193,94,0.22)' : hv?'rgba(208,85,72,0.2)':'rgba(0,0,0,0.35)';
    ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle= !enabled ? '#3a3a30' : on ? '#a7c15e' : '#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle= !enabled ? '#5a5648' : '#e8d9a8'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(label, x0+10, y+h/2);
    ctx.textAlign='right';
    ctx.fillStyle= !enabled ? '#5a5648' : on ? '#a7c15e' : '#8a9268';
    ctx.fillText(!enabled ? 'MAIN ONLY' : on?'ON':'OFF', x0+rw-10, y+h/2);
    ctx.textBaseline='alphabetic'; y+=h+gap;
  };
  const label=(t)=>{ ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace'; ctx.fillText(t, x0, y+8); y+=14; };

  // co-admins: their own report channel, right at the top
  if(isCoAdmin() && !isMainAdmin()) actionBtn('staffreport','\u26A0 STAFF REPORT \u2014 flag a problem to the mains');
  // everyone with admin: broadcast a banner
  actionBtn('post','\uD83D\uDCE2 POST UPDATE \u2014 banner for all players'+(isMainAdmin()?'':' (needs approval)'));
  actionBtn('players','\uD83D\uDC65 PLAYERS \u2014 look up \u00b7 ban \u00b7 log');
  if(isMainAdmin()) actionBtn('ailearning','\uD83E\uDDE0 AI BOT LEARNING \u2014 progress \u00b7 compare old models');
  if(isMainAdmin()) actionBtn('layout','\u2194 LAYOUT EDITOR \u2014 move home page sections');
  if(isMainAdmin()) actionBtn('promos','\uD83C\uDF81 PROMO CODES \u2014 create \u00b7 edit \u00b7 expire');

  toggle('testmode','\uD83E\uDDEA TEST MODE \u2014 all weapons \u00b7 no gems', testMode, true);
  actionBtn('storage', isMainAdmin() ? '\u2699 WEAPON EDITOR \u2014 stats \u00b7 price \u00b7 publish'
                                     : '\u2699 WEAPON EDITOR \u2014 view every weapon');

  if(isMainAdmin()){
    // pending co-admin posts: approve or reject, right here in the admin menu
    label('PENDING POSTS'+(pendingBanners.length?' ('+pendingBanners.length+')':''));
    if(!pendingBanners.length){
      ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.textAlign='left'; ctx.fillText('nothing awaiting approval', x0+4, y+8); y+=18;
    }
    for(const b of pendingBanners.slice(0,2)){
      const h=22;
      const bw2=52;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
      ctx.strokeStyle='#5a5648'; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText(String(b.message||'').slice(0, Math.floor((rw-2*bw2-30)/5.6)), x0+8, y+h/2);
      const ax2=x0+rw-2*bw2-6, rx2=x0+rw-bw2-2;
      adminPanelRects.push({x:ax2,y:y+2,w:bw2,h:h-4,id:'appr:'+b.id});
      adminPanelRects.push({x:rx2,y:y+2,w:bw2,h:h-4,id:'rej:'+b.id});
      ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax2,y+2,bw2,h-4);
      ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax2+0.5,y+2.5,bw2,h-4);
      ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx2,y+2,bw2,h-4);
      ctx.strokeStyle='#d05548'; ctx.strokeRect(rx2+0.5,y+2.5,bw2,h-4);
      ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
      ctx.fillStyle='#cfe0a8'; ctx.fillText('APPROVE', ax2+bw2/2, y+h/2);
      ctx.fillStyle='#e0a8a0'; ctx.fillText('REJECT',  rx2+bw2/2, y+h/2);
      ctx.textBaseline='alphabetic'; y+=h+5;
    }
  }

  const cbw=140, cbh=28, cbx=W/2-cbw/2, cby=py+ph-36;
  adminPanelRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'close'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#d05548':'rgba(208,85,72,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#d05548'; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#e0a8a0'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText('CLOSE', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function adminPanelClick(){
  for(const r of adminPanelRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=r.id||'';
      if(id==='close'){ adminPanelOpen=false; sfx('swap'); return; }
      if(id==='staffreport'){ openStaffReport(); sfx('swap'); return; }
      if(id==='post'){ openPost(); sfx('swap'); return; }
      if(id==='promos'){ adminPanelOpen=false; promoAdminOpen=true; fetchPromos(); sfx('swap'); return; }
      if(id==='players'){ adminPanelOpen=false; playersOpen=true; playersTab='lookup'; fetchPlayersData(); if(isMainAdmin()) fetchScoreReqs(); sfx('swap'); return; }
      if(id==='ailearning'){ openAiLearning(); sfx('swap'); return; }
      if(id==='layout'){
        if(!isMainAdmin()){ sfx('dry'); return; }
        adminPanelOpen=false; selPage='hub'; layoutMode=true; layoutPick=null; sfx('swap'); return;
      }
      if(id==='testmode'){ setTestMode(!testMode); sfx('swap'); return; }
      if(id==='storage'){ adminPanelOpen=false; storageOpen=true; sfx('swap'); return; }
      if(id.indexOf('appr:')===0){ approveBanner(+id.slice(5)); sfx('pickup'); return; }
      if(id.indexOf('rej:')===0){ rejectBanner(+id.slice(4)); sfx('dry'); return; }
      return;
    }
  }
}
function warpStun(){                                 // WARPWAVE E: stun everything in a war-hammer radius
  const k='warpwave';
  if(now < (abilityCD[k]||0)){ sfx('dry'); return; }
  const R=160;                                       // same radius as the war hammer slam
  for(const e of enemies){
    if(Math.hypot(e.x-player.x, e.y-player.y) < R+e.r){
      e.stunUntil=now+2000;                          // 2s hard stun: no moving, full damage taken
      burst(e.x,e.y,'#bfa8ff',8,4);
    }
  }
  for(let i=0;i<18;i++) particles.push({x:player.x,y:player.y,
    vx:Math.cos(i/18*TAU)*rand(2,5), vy:Math.sin(i/18*TAU)*rand(2,5),
    life:380,max:380,col:'#bfa8ff',size:3});
  addShake(8); sfx('swap'); noiseBurst(0.18,0.25,300);
  abilityCD[k]=now+abilityCdOf(k);
}
function timeDragField(){                            // TIMETURNER E: slow every enemy in a war-hammer radius
  const k='timeturner';
  if(now < (abilityCD[k]||0)){ sfx('dry'); return; }
  const R=160;                                       // same radius as the war hammer slam
  for(const e of enemies){
    if(Math.hypot(e.x-player.x, e.y-player.y) < R+e.r){
      e.chronoStacks=Math.min(8,(e.chronoStacks||0)+4);   // heavy time-drag: +4 stacks at once
      e.dragUntil=Math.max(e.dragUntil||0, now+3000);      // held for 3s (longer than a single round)
      burst(e.x,e.y,'#e6c878',8,4);
    }
  }
  for(let i=0;i<18;i++) particles.push({x:player.x,y:player.y,
    vx:Math.cos(i/18*TAU)*rand(2,5), vy:Math.sin(i/18*TAU)*rand(2,5),
    life:420,max:420,col:'#e6c878',size:3});
  addShake(6); sfx('swap'); noiseBurst(0.16,0.22,260);
  abilityCD[k]=now+abilityCdOf(k);
}
// Arena opponents do not live in the Campaign `enemies` array. Keep special
// collision in one helper so Offline AI, Online Arena, and Party CPU all use
// their existing authoritative/deduplicated hit path.
function arenaMeleeTargetsAt(x,y,radius){
  if(practiceMode!=='arena'||!arenaCanAct()) return [];
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()){
    return partyCpuMatch.bots.filter(t=>t.team==='B'&&t.hp>0&&dist2(t.x,t.y,x,y)<(radius+(t.r||15))*(radius+(t.r||15)));
  }
  const t=arena&&arena.opponent;
  return t&&t.hp>0&&dist2(t.x,t.y,x,y)<(radius+(t.r||15))*(radius+(t.r||15))?[t]:[];
}
function arenaMeleeSpecialHit(target,dmg,kind){
  if(!target||practiceMode!=='arena'||!arenaCanAct()) return false;
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return partyCpuHitBot(target,dmg,kind);
  arenaHitOpponent(dmg,kind); return true;
}
