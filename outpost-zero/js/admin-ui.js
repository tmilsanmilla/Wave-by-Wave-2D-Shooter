"use strict";

// Admin Inbox and Suggestions pages are workspaces, not pop-up cards. On wide
// Home screens their outer edges meet the inner edges of the two ad rails, so
// the ads never sit on top of the workspace. Phones keep the thin safe edge.
function adminInboxBounds(){
  const edge=Math.max(2,Math.min(6,Math.floor(Math.min(W,H)/20)));
  let px=edge,pw=Math.max(1,W-edge*2);
  const geo=typeof sideAdMetrics==='function'?sideAdMetrics():null;
  if(geo){
    let railLeft=geo.edge+geo.aw,railRight=W-geo.edge-geo.aw;
    if(typeof adLeftRect!=='undefined'&&adLeftRect&&Number.isFinite(adLeftRect.x)&&Number.isFinite(adLeftRect.w))
      railLeft=adLeftRect.x+adLeftRect.w;
    if(typeof adRightRect!=='undefined'&&adRightRect&&Number.isFinite(adRightRect.x))
      railRight=adRightRect.x;
    const railWidth=railRight-railLeft;
    if(railWidth>=Math.min(360,pw)){px=railLeft;pw=railWidth;}
  }
  return {pw,ph:Math.max(1,H-edge*2),px,py:edge};
}
function adminControlStrip(px,pw,maxWidth,padding=16){
  const available=Math.max(1,pw-padding*2),w=Math.min(available,maxWidth);
  return {x:px+(pw-w)/2,w};
}

let feedXRects=[],feedReadRects=[];
async function deleteBanner(id){                     // mains: pull a post off everyone's feed (no archive)
  if(!isMainAdmin()) return;
  if(!sb){ const i=banners.findIndex(b=>b.id===id); if(i>=0) banners.splice(i,1); return; }
  try{
    const {data,error}=await sb.rpc('delete_outpost_zero_update',{p_banner_id:id});
    if(error)throw error;
    if(data!==true)return;
  }catch(e){return;}
  fetchBanners();
}
function drawHubPosts(topY, maxBottom){
  // UPDATES board: newest first, capped at 5 posts / 10 lines, each post wraps to two lines max
  bannerXRect=null; feedXRects=[];feedReadRects=[];
  if(!banners.length) return topY;
  const bw=Math.min(560,W-56), bx=W/2-bw/2;
  const head=20, pad=8, lineH=13;
  const xw = isMainAdmin() ? 18 : 0;                 // room for the remove button
  const maxCh=Math.max(8, Math.floor((bw-38-xw)/6.8));
  // lay out up to 5 posts / 10 lines within the room we have
  const room=Math.max(0, (maxBottom-topY) - head - pad*2);
  const items=[];
  let usedLines=0, usedH=0;
  for(const b of banners){
    if(items.length>=5 || usedLines>=10) break;
    const msg=String(b.heading||b.message||'');
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
  const g=ctx.createLinearGradient(bx,topY,bx,topY+bh);
  g.addColorStop(0,'rgba(232,182,88,0.16)'); g.addColorStop(1,'rgba(232,182,88,0.05)');
  ctx.fillStyle=g; ctx.fillRect(bx,topY,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(bx+0.5,topY+0.5,bw,bh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#e8b658'; ctx.font='700 12px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDCE2 UPDATES', bx+bw/2, topY+head/2+4);
  ctx.textAlign='left';
  let ry=topY+head+pad;
  for(let i=0;i<items.length;i++){
    const it=items[i];
    ctx.fillStyle= i%2 ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.26)';
    ctx.fillRect(bx+6, ry, bw-12, it.h-3);
    feedReadRects.push({x:bx+6,y:ry,w:bw-12-xw,h:it.h-3,b:it.b});
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
let readerOpen=false, readerTitle='', readerMeta='', readerBody='', readerRects=[], readerScroll=0, readerAccess='public',readerActions=[];
function clearReaderState(){
  readerOpen=false;readerTitle='';readerMeta='';readerBody='';readerRects=[];readerScroll=0;readerAccess='public';readerActions=[];
}
function readerAccessAllowed(){
  return readerAccess==='main'?isMainAdmin():readerAccess==='admin'?isAdmin():true;
}
function enforceReaderAccess(){if(readerOpen&&!readerAccessAllowed()){clearReaderState();return false;}return true;}
function openReader(title, meta, body, access='public',action=null){
  readerOpen=true; readerTitle=String(title||''); readerMeta=String(meta||'');
  readerBody=String(body||''); readerScroll=0;readerAccess=['admin','main'].includes(access)?access:'public';
  const choices=Array.isArray(action)?action:[action];readerActions=choices.filter(item=>item&&typeof item.run==='function').slice(0,4)
    .map(item=>({label:String(item.label||'OPEN').slice(0,20),owner:String(item.owner||''),run:item.run}));
}
function readerLines(maxW){
  const out=[],width=Math.max(1,Number(maxW)||1);
  const wordParts=word=>{
    if(ctx.measureText(word).width<=width)return [word];
    // URLs, invite tokens, and other unbroken strings must remain readable.
    // Split by Unicode code point so a surrogate pair is never cut in half.
    const parts=[],chars=Array.from(word);let part='';
    for(const char of chars){
      const next=part+char;
      if(part&&ctx.measureText(next).width>width){parts.push(part);part=char;}
      else part=next;
    }
    if(part)parts.push(part);
    return parts;
  };
  for(const para of readerBody.split(/\n/)){
    if(!para.trim()){ out.push(''); continue; }
    let line='';
    for(const word of para.split(' ')){
      if(!word){
        if(line){const spaced=line+' ';if(ctx.measureText(spaced).width>width){out.push(line);line='';}else line=spaced;}
        continue;
      }
      const parts=wordParts(word);
      for(let i=0;i<parts.length;i++){
        const part=parts[i],test=line?line+(i===0?' ':'')+part:part;
        if(ctx.measureText(test).width>width&&line){out.push(line);line=part;}
        else line=test;
        if(i<parts.length-1&&line){out.push(line);line='';}
      }
    }
    if(line) out.push(line);
  }
  return out;
}
function drawReader(){
  if(!enforceReaderAccess())return;
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const privateInboxReader=readerAccess==='admin'||readerAccess==='main';
  const bounds=privateInboxReader?adminInboxBounds():{pw:Math.min(520,W-24),ph:Math.min(460,H-24),px:W/2-Math.min(520,W-24)/2,py:H/2-Math.min(460,H-24)/2};
  const {pw,ph,px,py}=bounds;
  ctx.fillStyle='#0a0c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#bfe8ff'; ctx.font='700 14px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(readerTitle, pw-24), W/2, py+24);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(readerMeta, pw-24), W/2, py+40);
  readerRects=[];
  // A player profile can expose Message, Add Friend, Block, and Report. Lay
  // those controls out as a compact grid instead of silently dropping all but
  // the first two or squeezing six buttons into an unreadable single row.
  const optionalReaderActions=typeof readerActions!=='undefined'&&Array.isArray(readerActions)?readerActions:
    (typeof readerAction!=='undefined'&&readerAction?[readerAction]:[]);
  const actions=optionalReaderActions.map((action,index)=>['action:'+index,action.label,index===2?'#e06b58':index?'#e8b658':'#bfa8ff'])
    .concat([['copy','COPY TEXT','#a7c15e'],['close','CLOSE','#7fd8ff']]);
  const buttonGap=8,rowGap=6,buttonCols=Math.max(1,Math.min(actions.length,pw<420?2:3)),
    buttonRows=Math.ceil(actions.length/buttonCols),buttonH=34,
    footerH=buttonRows*buttonH+(buttonRows-1)*rowGap,
    x0=px+18, top=py+56, bottom=py+ph-footerH-14, lh=15;
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
  const cbw=Math.min(150,(pw-36-buttonGap*(buttonCols-1))/buttonCols),firstY=py+ph-footerH-6;
  const button=(id,label,bx,by,col)=>{
    readerRects.push({x:bx,y:by,w:cbw,h:buttonH,id});
    const hv=mouse.x>=bx&&mouse.x<=bx+cbw&&mouse.y>=by&&mouse.y<=by+buttonH;
    ctx.fillStyle=hv?col:'rgba(127,216,255,0.14)'; ctx.fillRect(bx,by,cbw,buttonH);
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,cbw,buttonH);
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=hv?'#101208':'#bfe8ff';
    ctx.font='700 10px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(label,cbw-8),bx+cbw/2,by+buttonH/2);
  };
  actions.forEach((item,index)=>{
    const row=Math.floor(index/buttonCols),col=index%buttonCols,
      rowCount=Math.min(buttonCols,actions.length-row*buttonCols),rowW=cbw*rowCount+buttonGap*(rowCount-1),
      rowX=W/2-rowW/2;
    button(item[0],item[1],rowX+col*(cbw+buttonGap),firstY+row*(buttonH+rowGap),item[2]);
  });
  ctx.textAlign='left'; ctx.textBaseline='top';
}
async function copyReaderText(){
  if(!enforceReaderAccess())return;
  const text=[readerTitle,readerMeta,readerBody].filter(Boolean).join('\n');
  try{ await navigator.clipboard.writeText(text); readerMeta='COPIED \u2014 paste it anywhere'; sfx('pickup'); }
  catch(e){ try{ window.prompt('Copy this text:',text); }catch(e2){} }
}
function readerClick(){
  if(!enforceReaderAccess())return;
  for(const r of readerRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='close'){ clearReaderState(); sfx('swap'); return; }
      if(r.id==='copy'){ copyReaderText(); return; }
      if(String(r.id).indexOf('action:')===0){
        const action=readerActions[+String(r.id).slice(7)],owner=authUser?String(authUser.id||''):'';
        if(!action||action.owner&&action.owner!==owner){clearReaderState();sfx('dry');return;}
        try{action.run();sfx('swap');}catch(error){clearReaderState();sfx('dry');}return;
      }
      if(r.id==='up'){ readerScroll=Math.max(0,readerScroll-3); sfx('aim'); return; }
      if(r.id==='down'){ readerScroll+=3; sfx('aim'); return; }
      return;
    }
  }
}
// Messages and their archive are the Admin Inbox. Reports, admin suggestions,
// and the audit log live in the separate main-only Suggestions workspace.
function drawInboxTabs(px,py,pw,y,rects){
  const TABS=[];
  if(isAdmin())     TABS.push(['msgs','\u2709 MESSAGES'+(unreadMsgs?' ('+unreadMsgs+')':'')]);
  if(isAdmin())     TABS.push(['archive','\uD83D\uDDC3 ARCHIVE']);
  if(TABS.length<2) return y;                       // nothing to switch between
  const strip=adminControlStrip(px,pw,520),gap=pw<500?4:8,tw=Math.max(1,(strip.w-gap*(TABS.length-1))/TABS.length),th=pw<500?26:32;
  let tx=strip.x;
  for(const [id,lbl] of TABS){
    rects.push({x:tx,y,w:tw,h:th,id:'itab:'+id});
    const on=inboxTab===id;
    const hv=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    ctx.fillStyle= on?'#7fd8ff':hv?'rgba(127,216,255,0.2)':'rgba(0,0,0,0.35)'; ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(tx+0.5,y+0.5,tw,th);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle= on?'#101208':'#bfe8ff'; ctx.font='700 '+(pw<500?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(lbl,tw-6), tx+tw/2, y+th/2);
    ctx.textBaseline='alphabetic';
    tx+=tw+gap;
  }
  return y+th+10;
}
function inboxTabClick(id){
  if(String(id).indexOf('itab:')!==0) return false;
  const t=String(id).slice(5);
  inboxTab=t;
  msgsOpen=archOpen=false;
  if(t==='msgs'){ msgsOpen=true; fetchMsgs().then(ok=>{if(ok)markMsgsRead();}); }
  else if(t==='archive'){ archOpen=true; fetchMsgs(); }
  else {inboxTab='msgs';msgsOpen=true;fetchMsgs().then(ok=>{if(ok)markMsgsRead();});}
  sfx('aim');
  return true;
}
function drawSuggestionsTabs(px,py,pw,y,rects){
  if(!isMainAdmin())return y;
  const tabs=[['reports','\uD83D\uDCE5 REPORTS'],['admin','\uD83D\uDCCB ADMIN SUGGESTIONS'],['log','\uD83D\uDCDC LOG']],
    strip=adminControlStrip(px,pw,720),gap=pw<500?4:8,tw=Math.max(1,(strip.w-gap*(tabs.length-1))/tabs.length),th=pw<500?27:32;
  let tx=strip.x;
  for(const [id,label] of tabs){
    const on=id==='reports'?updatesOpen:id==='admin'?weaponSuggestionsOpen:auditOpen;
    rects.push({x:tx,y,w:tw,h:th,id:'stab:'+id});
    const hot=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    ctx.fillStyle=on?'#e8b658':hot?'rgba(232,182,88,.22)':'rgba(0,0,0,.35)';ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#e8b658';ctx.strokeRect(tx+.5,y+.5,tw,th);
    ctx.fillStyle=on?'#101208':'#e8d9a8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(pw<500?7:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(label,tw-6),tx+tw/2,y+th/2);tx+=tw+gap;
  }
  ctx.textBaseline='alphabetic';return y+th+9;
}
function drawSuggestionArchiveTabs(px,pw,y,rects,kind){
  const audit=kind==='audit',active=audit?adminAuditView:weaponSuggestionView,
    prefix=audit?'audit_view:':'ws_view:',tabs=audit?[['current','RECENT'],['archive','ARCHIVE']]:[['pending','PENDING'],['archive','ARCHIVE']],
    strip=adminControlStrip(px,pw,420),gap=6,tw=(strip.w-gap)/2,th=pw<500?23:26;
  let tx=strip.x;
  for(const [id,label] of tabs){
    const on=active===id,hot=mouse.x>=tx&&mouse.x<=tx+tw&&mouse.y>=y&&mouse.y<=y+th;
    rects.push({x:tx,y,w:tw,h:th,id:prefix+id});
    ctx.fillStyle=on?'#7fd8ff':hot?'rgba(127,216,255,.18)':'rgba(0,0,0,.28)';ctx.fillRect(tx,y,tw,th);
    ctx.strokeStyle='#7fd8ff';ctx.strokeRect(tx+.5,y+.5,tw,th);
    ctx.fillStyle=on?'#081116':'#bfe8ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(pw<500?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(label,tx+tw/2,y+th/2);tx+=tw+gap;
  }
  ctx.textBaseline='alphabetic';return y+th+7;
}
function openSuggestionsSection(tab='reports'){
  if(!isMainAdmin()){sfx('dry');return false;}
  updatesOpen=weaponSuggestionsOpen=auditOpen=false;
  reportActionMenuOpen=reportAmountMenuOpen=false;
  if(tab==='admin'){weaponSuggestionsOpen=true;void fetchWeaponSuggestions();}
  else if(tab==='log'){auditOpen=true;void fetchAdminAuditLog(true);}
  else{updatesOpen=true;reportView='open';resetReportScroll();void fetchUpdatesFeed();}
  return true;
}
function suggestionsTabClick(id){
  if(String(id).indexOf('stab:')!==0)return false;
  const tab=String(id).slice(5);openSuggestionsSection(tab);sfx('aim');return true;
}
function drawUpdates(){
  if(!canAccessReports()){updatesOpen=false;updatesFeed={reports:[]};updatesResolved=[];resetReportScroll();return;}
  ctx.fillStyle='rgba(4,6,3,.97)';ctx.fillRect(0,0,W,H);
  const {pw,ph,px,py}=adminInboxBounds(),compact=ph<430||pw<520,x0=px+(compact?8:16),rw=pw-(compact?16:32);
  ctx.fillStyle='#080c0e';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#e8b658';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#ffe0a0';ctx.font='700 '+(compact?14:18)+'px ui-monospace,Consolas,monospace';ctx.fillText('SUGGESTIONS',W/2,py+(compact?21:27));
  ctx.fillStyle='#8a9268';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText(sb?'MAIN / CREATOR ONLY \u00b7 REPORT REVIEW':'REPORTS LIVE ON THE DEPLOYED SITE',W/2,py+(compact?37:44));
  updatesRects=[];
  const tabsBottom=drawSuggestionsTabs(px,py,pw,py+(compact?44:52),updatesRects),filterH=compact?23:27,filterGap=6,filterW=Math.min(170,(rw-filterGap)/2),filterX=W/2-filterW-filterGap/2;
  for(const [id,label,on,bx] of [['open','OPEN \u00b7 '+(updatesFeed.reports||[]).length,reportView==='open',filterX],['resolved','RESOLVED \u00b7 '+updatesResolved.length,reportView==='resolved',filterX+filterW+filterGap]]){
    updatesRects.push({x:bx,y:tabsBottom,w:filterW,h:filterH,id:'report_view:'+id});
    const hot=mouse.x>=bx&&mouse.x<=bx+filterW&&mouse.y>=tabsBottom&&mouse.y<=tabsBottom+filterH;
    ctx.fillStyle=on?'#7fd8ff':hot?'rgba(127,216,255,.22)':'rgba(255,255,255,.04)';ctx.fillRect(bx,tabsBottom,filterW,filterH);ctx.strokeStyle='#7fd8ff';ctx.strokeRect(bx+.5,tabsBottom+.5,filterW,filterH);
    ctx.fillStyle=on?'#101208':'#bfe8ff';ctx.font='700 '+(compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.textBaseline='middle';ctx.fillText(label,bx+filterW/2,tabsBottom+filterH/2);
  }
  if(reportView==='resolved'&&reportBulkAction==='resolve')reportBulkAction='copy';
  const footerY=py+ph-(compact?29:34),footerH=compact?24:28,bulkH=compact?25:29,bulkY=footerY-bulkH-7,statusY=bulkY-6,
    viewTop=tabsBottom+filterH+7,viewBottom=statusY-8,rows=reportView==='resolved'?updatesResolved:(updatesFeed.reports||[]),rowH=compact?34:40,rowGap=4;
  reportScrollViewport={x:x0,y:viewTop,w:rw,h:Math.max(1,viewBottom-viewTop)};
  const rowStride=rowH+rowGap;
  reportScrollMax=Math.max(0,rows.length*rowStride-reportScrollViewport.h);reportScroll=Math.max(0,Math.min(reportScroll,reportScrollMax));
  const fixedRectCount=updatesRects.length;
  ctx.save();ctx.beginPath();ctx.rect(x0,viewTop,rw,reportScrollViewport.h);ctx.clip();
  const firstVisible=Math.max(0,Math.floor(reportScroll/rowStride)),lastVisible=Math.min(rows.length,Math.ceil((reportScroll+reportScrollViewport.h)/rowStride)+1);
  let y=viewTop+firstVisible*rowStride-reportScroll;
  if(!rows.length){ctx.fillStyle='#5a5648';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText(reportView==='resolved'?'NO RESOLVED REPORTS':'NO OPEN REPORTS',W/2,viewTop+24);}
  for(let index=firstVisible;index<lastVisible;index++){
    const r=rows[index];
    const resolved=reportView==='resolved',rbw=compact?47:58,actionCount=resolved?1:2,actionsW=actionCount*(rbw+4)+4,
      when=String(r.created_at||'').slice(5,16).replace('T',' '),msg=String(r.message||'').replace(/^\[STAFF\]\s*/,''),
      read={t:'REPORT #'+String(r.id!=null?r.id:'?')+' \u00b7 '+adminAccountLabel(r.name,'UNKNOWN REPORTER'),m:when,b:msg};
    ctx.fillStyle=index%2?'rgba(255,255,255,.025)':'rgba(127,216,255,.055)';ctx.fillRect(x0,y,rw,rowH);ctx.strokeStyle=resolved?'#6b7455':'#7fd8ff';ctx.strokeRect(x0+.5,y+.5,rw,rowH);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=resolved?'#8a9268':'#bfe8ff';ctx.font='700 '+(compact?7:8)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine((resolved?'\u2713 ':'')+adminAccountLabel(r.name,'UNKNOWN REPORTER')+(when?' \u00b7 '+when:''),rw-actionsW-18),x0+7,y+11);
    ctx.fillStyle='#cdd6b0';ctx.font=(compact?8:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(msg,rw-actionsW-18),x0+7,y+rowH-11);
    const readX=x0+rw-actionsW,buttonY=y+6,buttonH=rowH-12;
    for(const [id,label,col,bx,enabled] of [['read','READ','#7fd8ff',readX,true],['resolve','RESOLVE','#a7c15e',readX+rbw+4,!resolved&&!reportCopyBusy&&!reportResolveBusy.has(+r.id)]]){
      if(id==='resolve'&&resolved)continue;
      const hot=enabled&&mouse.x>=bx&&mouse.x<=bx+rbw&&mouse.y>=buttonY&&mouse.y<=buttonY+buttonH;
      ctx.fillStyle=hot?col:'rgba(255,255,255,.05)';ctx.fillRect(bx,buttonY,rbw,buttonH);ctx.strokeStyle=enabled?col:'#42463b';ctx.strokeRect(bx+.5,buttonY+.5,rbw,buttonH);
      ctx.textAlign='center';ctx.fillStyle=hot?'#101208':enabled?col:'#5a5648';ctx.font='700 '+(compact?6:7)+'px ui-monospace,Consolas,monospace';ctx.fillText(id==='resolve'&&!enabled?'SAVING\u2026':label,bx+rbw/2,y+rowH/2);
      if(enabled)updatesRects.push({x:bx,y:buttonY,w:rbw,h:buttonH,id:id==='read'?'rd:'+r.id:'rs:'+r.id,read:id==='read'?read:null});
    }
    updatesRects.push({x:x0,y,w:Math.max(1,rw-actionsW-3),h:rowH,id:'rdrow:'+r.id,read});y+=rowStride;
  }
  ctx.restore();
  const visible=updatesRects.slice(0,fixedRectCount),vt=viewTop,vb=viewBottom;
  for(const rect of updatesRects.slice(fixedRectCount)){const top=Math.max(vt,rect.y),bottom=Math.min(vb,rect.y+rect.h);if(bottom>top)visible.push(Object.assign({},rect,{y:top,h:bottom-top}));}
  updatesRects=visible;
  if(reportScrollMax>0){const sx=x0+rw-3,sh=reportScrollViewport.h-4,thumbH=Math.max(18,sh*(reportScrollViewport.h/(reportScrollViewport.h+reportScrollMax))),thumbY=viewTop+2+(sh-thumbH)*(reportScroll/reportScrollMax);ctx.fillStyle='rgba(127,216,255,.12)';ctx.fillRect(sx,viewTop+2,2,sh);ctx.fillStyle='#7fd8ff';ctx.fillRect(sx-1,thumbY,4,thumbH);}
  const bulkStrip=adminControlStrip(px,pw,720,compact?8:16),copyY=bulkY,copyH=bulkH,copyGap=compact?4:7,
    controlW=(bulkStrip.w-copyGap*2)/3,visibleStatus=reportLoadStatus||reportCopyStatus;
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=/FAILED|COULD NOT|MUST/.test(visibleStatus)?'#d05548':'#8a9268';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(visibleStatus||'CHOOSE AN ACTION AND AMOUNT, THEN RUN IT',rw),W/2,statusY);
  const amountText=reportCopyMode==='custom'?String(reportCopyCustomCount):'ALL',working=reportCopyBusy||reportResolveBusy.size>0,controls=[
    {id:'report_action_menu',x:bulkStrip.x,label:reportBulkAction.toUpperCase()+' \u25BE',col:'#7fd8ff'},
    {id:'report_amount_menu',x:bulkStrip.x+controlW+copyGap,label:'AMOUNT: '+amountText+' \u25BE',col:'#e8b658'},
    {id:'report_run',x:bulkStrip.x+(controlW+copyGap)*2,label:working?'WORKING\u2026':'RUN '+reportBulkAction.toUpperCase()+' \u00b7 '+amountText,col:reportBulkAction==='resolve'?'#d05548':'#a7c15e'}];
  for(const b of controls){const enabled=!working;updatesRects.push({x:b.x,y:copyY,w:controlW,h:copyH,id:b.id,enabled});const hot=enabled&&mouse.x>=b.x&&mouse.x<=b.x+controlW&&mouse.y>=copyY&&mouse.y<=copyY+copyH;ctx.fillStyle=hot?b.col:'rgba(255,255,255,.06)';ctx.fillRect(b.x,copyY,controlW,copyH);ctx.strokeStyle=enabled?b.col:'#42463b';ctx.strokeRect(b.x+.5,copyY+.5,controlW,copyH);ctx.fillStyle=hot?'#101208':enabled?'#cdd6b0':'#5a5648';ctx.font='700 '+(compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.textBaseline='middle';ctx.fillText(fitLine(b.label,controlW-6),b.x+controlW/2,copyY+copyH/2);}
  const gap2=8,bw2=Math.min(170,(rw-gap2)/2),rx=W/2-bw2-gap2/2,cx=W/2+gap2/2,byy=footerY;
  for(const [id,bx,label,col] of [['refresh',rx,'\u21BB REFRESH','#7fd8ff'],['close',cx,'CLOSE','#d05548']]){updatesRects.push({x:bx,y:byy,w:bw2,h:footerH,id});const hot=mouse.x>=bx&&mouse.x<=bx+bw2&&mouse.y>=byy&&mouse.y<=byy+footerH;ctx.fillStyle=hot?col:'rgba(255,255,255,.06)';ctx.fillRect(bx,byy,bw2,footerH);ctx.strokeStyle=col;ctx.strokeRect(bx+.5,byy+.5,bw2,footerH);ctx.fillStyle=hot?'#101208':'#cdd6b0';ctx.font='700 9px ui-monospace,Consolas,monospace';ctx.fillText(label,bx+bw2/2,byy+footerH/2);}
  const drawMenu=(open,bx,items)=>{if(!open)return;const mh=compact?23:27;items.forEach((item,index)=>{const my=copyY-mh*(items.length-index),enabled=item.enabled!==false;updatesRects.push({x:bx,y:my,w:controlW,h:mh,id:item.id,enabled});const hot=enabled&&mouse.x>=bx&&mouse.x<=bx+controlW&&mouse.y>=my&&mouse.y<=my+mh;ctx.fillStyle=hot?item.col:'#111716';ctx.fillRect(bx,my,controlW,mh);ctx.strokeStyle=enabled?item.col:'#42463b';ctx.strokeRect(bx+.5,my+.5,controlW,mh);ctx.fillStyle=hot?'#101208':enabled?'#e8d9a8':'#5a5648';ctx.font='700 '+(compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(item.label,bx+controlW/2,my+mh/2);});};
  drawMenu(reportActionMenuOpen,bulkStrip.x,[{id:'report_action_copy',label:'COPY',col:'#7fd8ff'},{id:'report_action_resolve',label:'RESOLVE',col:'#d05548',enabled:reportView==='open'}]);
  drawMenu(reportAmountMenuOpen,bulkStrip.x+controlW+copyGap,[{id:'report_amount_all',label:'ALL',col:'#e8b658'},{id:'report_amount_custom',label:'CUSTOM',col:'#e8b658'}]);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function updatesClick(){
  for(let i=updatesRects.length-1;i>=0;i--){
    const r=updatesRects[i];
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||''),menuControl=/^report_(action|amount)/.test(id);
      if((reportActionMenuOpen||reportAmountMenuOpen)&&!menuControl){reportActionMenuOpen=reportAmountMenuOpen=false;sfx('aim');return;}
      if(suggestionsTabClick(r.id))return;
      if(r.enabled===false){sfx('dry');return;}
      if(r.id==='close'){ updatesOpen=false;reportActionMenuOpen=reportAmountMenuOpen=false;sfx('swap'); }
      else if(r.id==='refresh'){ fetchUpdatesFeed(); sfx('swap'); }
      else if(String(r.id).indexOf('report_view:')===0){reportView=String(r.id).slice(12);reportCopyStatus='';reportActionMenuOpen=reportAmountMenuOpen=false;resetReportScroll();sfx('aim');}
      else if(r.id==='report_action_menu'){reportActionMenuOpen=!reportActionMenuOpen;reportAmountMenuOpen=false;sfx('aim');}
      else if(r.id==='report_amount_menu'){reportAmountMenuOpen=!reportAmountMenuOpen;reportActionMenuOpen=false;sfx('aim');}
      else if(r.id==='report_action_copy'){reportBulkAction='copy';reportCopyStatus='';reportActionMenuOpen=false;sfx('aim');}
      else if(r.id==='report_action_resolve'){reportBulkAction='resolve';reportCopyStatus='';reportActionMenuOpen=false;sfx('aim');}
      else if(r.id==='report_amount_all'){chooseReportCopyAll();reportAmountMenuOpen=false;sfx('aim');}
      else if(r.id==='report_amount_custom'){if(chooseReportCopyCustom())sfx('aim');reportAmountMenuOpen=false;}
      else if(r.id==='report_run'){void runReportBulkAction();}
      else if(String(r.id).indexOf('rs:')===0){ resolveReport(+String(r.id).slice(3)); sfx('pickup'); }
      else if(r.read){ openReader(r.read.t, r.read.m, r.read.b,'main'); sfx('swap'); }
      return;
    }
  }
  if(reportActionMenuOpen||reportAmountMenuOpen){reportActionMenuOpen=reportAmountMenuOpen=false;sfx('aim');}
}
function drawArchive(){
  if(!isAdmin()){archOpen=false;adminMsgs=[];return;}
  ctx.fillStyle='rgba(4,6,3,.96)';ctx.fillRect(0,0,W,H);
  const {pw,ph,px,py}=adminInboxBounds(),x0=px+16,rw=pw-32;
  ctx.fillStyle='#0c0b07';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#e8b658';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#e8d9a8';ctx.font='700 17px ui-monospace,Consolas,monospace';ctx.fillText('\u2709 ADMIN INBOX',W/2,py+26);
  ctx.fillStyle='#8a9268';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText('ARCHIVED ADMIN MESSAGES',W/2,py+42);
  archRects=[];let y=drawInboxTabs(px,py,pw,py+50,archRects);
  const list=adminMsgs.filter(msgArchived),h=38,maxRows=Math.max(1,Math.floor((py+ph-50-y)/(h+5)));
  if(!list.length){ctx.fillStyle='#5a5648';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText('NOTHING ARCHIVED YET',W/2,y+20);}
  for(const m of list.slice(0,maxRows)){
    if(y+h>py+ph-44)break;
    const when=String(m.created_at||'').slice(5,16).replace('T',' '),body=String(m.message||'');
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x0,y,rw,h);ctx.strokeStyle='#5a5648';ctx.strokeRect(x0+.5,y+.5,rw,h);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#8a9268';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(adminAccountLabel(m.from_username,'STAFF')+' \u2192 '+adminAccountLabel(m.to_username,'STAFF')+(when?' \u00b7 '+when:''),rw-16),x0+8,y+10);
    ctx.fillStyle='#a9b28f';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(body,rw-16),x0+8,y+24);
    archRects.push({x:x0,y,w:rw,h,id:'archived_message',read:{t:adminAccountLabel(m.from_username,'STAFF'),m:when,b:body}});y+=h+5;
  }
  const cbw=170,cbh=34,cbx=W/2-cbw/2,cby=py+ph-40;archRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'close'});
  const hot=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;ctx.fillStyle=hot?'#e8b658':'rgba(232,182,88,.14)';ctx.fillRect(cbx,cby,cbw,cbh);ctx.strokeStyle='#e8b658';ctx.strokeRect(cbx+.5,cby+.5,cbw,cbh);ctx.fillStyle=hot?'#101208':'#e8d9a8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 11px ui-monospace,Consolas,monospace';ctx.fillText('CLOSE',W/2,cby+cbh/2);ctx.textAlign='left';ctx.textBaseline='alphabetic';
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
      if(r.read){openReader(r.read.t,r.read.m,r.read.b,'admin');sfx('swap');return;}
      return;
    }
  }
}
let storageTab='storage',storagePage=0;
let weaponEditOpen=false, weaponEditKey=null, weaponEditDraft=null, weaponEditRects=[], weaponDefs={}, weaponDefsLoaded=false, weaponDefsRequestVersion=0;
// the numeric fields an admin may tune, with sane bounds
const WFIELDS=[
  {k:'dmg',      label:'DAMAGE',        min:1,   max:9999},
  {k:'fireRate', label:'FIRE RATE (ms)',min:40,  max:3000},
  {k:'mag',      label:'MAG SIZE',      min:1,   max:500},
  {k:'reload',   label:'RELOAD (ms)',   min:0,   max:6000},
  {k:'range',    label:'RANGE',         min:20,  max:99999},
  {k:'pellets',  label:'PELLETS',       min:1,   max:20},
  {k:'pierce',   label:'PIERCE',        min:0,   max:20},
  {k:'cd',            label:'COOLDOWN (ms)',      min:1000,max:120000},
  {k:'rechargeKills', label:'RECHARGE KILLS',     min:1,   max:100},
  {k:'speed',         label:'THROW SPEED',         min:1,   max:30},
  {k:'fuseMs',        label:'FUSE (ms)',           min:100, max:10000},
  {k:'radius',        label:'BLAST RADIUS',        min:10,  max:500},
  {k:'freezeMs',      label:'FREEZE TIME (ms)',    min:100, max:15000},
];
const WEAPON_COMMON_EDITOR_FIELDS=new Set(['dmg','fireRate','mag','reload','range','pellets','pierce']);
const UTILITY_EDITOR_FIELDS=Object.freeze({
  medkit:new Set(['rechargeKills']),
  grenade:new Set(['dmg','range','cd']),
  freezer:new Set(['cd','speed','fuseMs','radius','freezeMs']),
  redball:new Set(['cd']),
  beachball:new Set(['cd']),
  turret:new Set(['cd']),
  portal:new Set(['cd']),
  timecapsule:new Set(['cd']),
});
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
const WEAPON_EDITOR_ROSTERS={};
for(const k of PRIMARIES)WEAPON_EDITOR_ROSTERS[k]=PRIMARIES;
for(const k of SECONDARIES)WEAPON_EDITOR_ROSTERS[k]=SECONDARIES;
for(const k of MELEES)WEAPON_EDITOR_ROSTERS[k]=MELEES;
for(const k of UTILKEYS)WEAPON_EDITOR_ROSTERS[k]=UTILKEYS;
for(const k of TEMP_PRIMARY)WEAPON_EDITOR_ROSTERS[k]=TEMP_PRIMARY;
for(const k of TEMP_SECONDARY)WEAPON_EDITOR_ROSTERS[k]=TEMP_SECONDARY;
for(const k of TEMP_MELEE)WEAPON_EDITOR_ROSTERS[k]=TEMP_MELEE;
for(const k of TEMP_UTILITY)WEAPON_EDITOR_ROSTERS[k]=TEMP_UTILITY;
for(const k in VAULT_SLOTS)if(!WEAPON_EDITOR_ROSTERS[k]){
  const slot=VAULT_SLOTS[k];
  WEAPON_EDITOR_ROSTERS[k]=slot==='primary'?PRIMARIES:slot==='secondary'?SECONDARIES:slot==='melee'?MELEES:UTILKEYS;
}
const WEAPON_PUBLISHED_DEFAULTS={};
for(const k in WEAPON_EDITOR_SLOTS){
  WEAPON_PUBLISHED_DEFAULTS[k]=FALL_KEYS.includes(k)?false:
    (Object.prototype.hasOwnProperty.call(VAULT_ACTIVE,k)?!!VAULT_ACTIVE[k]:true);
}
function savedWeaponPublished(k){
  if(!Object.prototype.hasOwnProperty.call(WEAPON_EDITOR_SLOTS,k)) return false;
  if(FALL_KEYS.includes(k)) return false;            // next season cannot be made public from saved data
  if(weaponDefs[k] && typeof weaponDefs[k].published==='boolean') return weaponDefs[k].published;
  if(typeof WEAPON_PUBLISHED_DEFAULTS==='object'&&Object.prototype.hasOwnProperty.call(WEAPON_PUBLISHED_DEFAULTS,k))
    return !!WEAPON_PUBLISHED_DEFAULTS[k];           // immutable source default; deleted cloud rows cannot leave stale access
  if(Object.prototype.hasOwnProperty.call(VAULT_ACTIVE,k))return !!VAULT_ACTIVE[k];
  return true;
}
function weaponIsPublished(k){ return savedWeaponPublished(k); } // Test Mode never changes saved publish state
function weaponDefOf(k){ return WEAPONS[k] || VAULT_WEAPONS[k] || UTILITIES[k] || VAULT_UTILITIES[k] || null; }
function weaponPrice(k){ const it=GEM_SHOP.find(i=>i.key===k); return it? it.cost : null; }
function weaponEditorFieldAllowed(k,field){
  const key=String(k||''),fieldKey=typeof field==='string'?field:String(field&&field.k||'');
  if(WEAPON_EDITOR_SLOTS[key]!=='utility')return WEAPON_COMMON_EDITOR_FIELDS.has(fieldKey);
  const allowed=UTILITY_EDITOR_FIELDS[key];return !!(allowed&&allowed.has(fieldKey));
}
function weaponEditorFields(k){return WFIELDS.filter(field=>weaponEditorFieldAllowed(k,field));}
async function fetchWeaponDefs(){
  if(!sb) return false;
  const requestVersion=++weaponDefsRequestVersion;
  try{
    const { data,error } = await sb.from('weapon_defs').select('key,stats,price,published').limit(80);
    if(error) throw error;
    if(requestVersion!==weaponDefsRequestVersion)return null;
    weaponDefs={};
    weaponDefsLoaded=true;
    for(const raw of (data||[])){
      const key=String(raw&&raw.key||'').trim().toLowerCase();
      if(!key||weaponDefs[key])continue;
      const r=Object.assign({},raw,{key});
      weaponDefs[key]=r;
      applyWeaponDef(r);
    }
    reconcileWeaponPublication();
    if(typeof syncOwnedWeapons==='function')syncOwnedWeapons();
    if(typeof canRestoreAccountLoadout==='function'&&canRestoreAccountLoadout()&&typeof restoreLastLoadoutForMode==='function')
      restoreLastLoadoutForMode(typeof pendingGameMode==='undefined'?null:pendingGameMode);
    return true;
  }catch(e){return requestVersion===weaponDefsRequestVersion?false:null;}
}
function applyWeaponDefRealtime(payload){
  const event=String(payload&&payload.eventType||'').toUpperCase(),raw=event==='DELETE'?payload&&payload.old:payload&&payload.new;
  const key=String(raw&&raw.key||'').trim().toLowerCase();
  if(!key||!Object.prototype.hasOwnProperty.call(WEAPON_EDITOR_SLOTS,key))return false;
  weaponDefsRequestVersion++;                        // an older snapshot may never overwrite this newer event
  if(event==='DELETE')delete weaponDefs[key];
  else{
    const row=Object.assign({},weaponDefs[key]||{},raw,{key});
    if(typeof row.published!=='boolean')return false;
    weaponDefs[key]=row;applyWeaponDef(row);
  }
  if(event==='DELETE')reconcileWeaponPublication();
  return true;
}
function reconcileWeaponPublication(){
  for(const k in WEAPON_EDITOR_SLOTS){
    if(FALL_KEYS.includes(k)){
      if(fallEligible())publishVaultKey(k);else unpublishVaultKey(k);
    }else if(savedWeaponPublished(k))publishVaultKey(k);
    else unpublishVaultKey(k);
  }
}
function applyWeaponDef(r){
  const def=weaponDefOf(r.key); if(!def) return;
  const staleSniperPair=r.key==='sniper'&&r.stats&&r.stats.dmg===204&&r.stats.fireRate===1150;
  if(r.stats) for(const f of weaponEditorFields(r.key)) if(typeof r.stats[f.k]==='number'){
    // Old untouched cloud defaults must not undo the current AWM balance;
    // every genuinely customized value still wins over the source definition.
    const staleSniperDefault=staleSniperPair&&(f.k==='dmg'||f.k==='fireRate');
    if(!staleSniperDefault)def[f.k]=r.stats[f.k];
  }
  if(FALL_KEYS.includes(r.key)){
    if(fallEligible())publishVaultKey(r.key);else unpublishVaultKey(r.key);
    return;
  }
  if(r.published) publishVaultKey(r.key); else unpublishVaultKey(r.key);
}
function publishVaultKey(k){
  if(FALL_KEYS.includes(k) && !fallEligible()){ unpublishVaultKey(k); return; }
  const slot=WEAPON_EDITOR_SLOTS[k];
  if(VAULT_WEAPONS[k] && !WEAPONS[k]) WEAPONS[k]=VAULT_WEAPONS[k];
  if(VAULT_UTILITIES[k] && !UTILITIES[k]) UTILITIES[k]=VAULT_UTILITIES[k];
  const r=typeof WEAPON_EDITOR_ROSTERS==='object'?(WEAPON_EDITOR_ROSTERS[k]||null):
    (slot==='primary'?PRIMARIES:slot==='secondary'?SECONDARIES:slot==='melee'?MELEES:null);
  if(r && !r.includes(k)) r.push(k);
  if(WEAPONS[k] && !WKEYS.includes(k)) WKEYS.push(k);
}
function unpublishVaultKey(k){
  const rosters=[PRIMARIES,SECONDARIES,MELEES,UTILKEYS,WKEYS];
  if(typeof TEMP_PRIMARY!=='undefined')rosters.push(TEMP_PRIMARY);
  if(typeof TEMP_SECONDARY!=='undefined')rosters.push(TEMP_SECONDARY);
  if(typeof TEMP_MELEE!=='undefined')rosters.push(TEMP_MELEE);
  if(typeof TEMP_UTILITY!=='undefined')rosters.push(TEMP_UTILITY);
  for(const arr of rosters){
    let i;while((i=arr.indexOf(k))>=0)arr.splice(i,1);
  }
  // Pulling a weapon back into storage revokes legacy ownership, remembered
  // loadouts, and temporary access immediately. The profile save prevents a
  // second device from restoring the old entitlement on its next sync.
  if(typeof purgeUnpublishedWeaponState==='function'&&purgeUnpublishedWeaponState([k])){
    if(typeof saveMeta==='function')saveMeta();
  }
}
function openWeaponEdit(k){
  weaponEditKey=k; storageOpen=false; weaponEditOpen=false;
  const def=weaponDefOf(k)||{};
  weaponEditDraft={};
  for(const f of weaponEditorFields(k)) if(typeof def[f.k]==='number') weaponEditDraft[f.k]=def[f.k];
  const pr=weaponPrice(k); if(pr!==null) weaponEditDraft.price=pr;
  weaponEditDraft.published = FALL_KEYS.includes(k) ? false : savedWeaponPublished(k);
  showWeaponForm();
}
function showWeaponForm(){
  const k=weaponEditKey, def=weaponDefOf(k)||{}, d=weaponEditDraft;
  const nextSeason=FALL_KEYS.includes(k);
  if(nextSeason) d.published=false;
  const fields=[];
  for(const f of weaponEditorFields(k)) if(typeof d[f.k]==='number')
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
  for(const f of weaponEditorFields(k)) if(typeof d[f.k]==='number') stats[f.k]=d[f.k];
  const row={key:k,stats,price:null,published:nextSeason?false:!!d.published,updated_by:adminSelfUsername||myRank().toUpperCase()||'STAFF'};
  $('formstatus').textContent='saving...';
  try{
    if(sb){
      const result=await sb.rpc('save_outpost_zero_weapon_definition',{
        p_weapon_key:k,p_stats:stats,
        p_price:typeof d.price==='number'?Math.round(d.price/GEM_PRICE_SCALE):null,
        p_published:row.published
      });
      if(result.error)throw result.error;
      const raw=Array.isArray(result.data)?result.data[0]:result.data;
      const returnedKey=String(raw&&(raw.weapon_key||raw.key)||'').toLowerCase();
      if(!raw||returnedKey!==k)throw new Error('WEAPON_SAVE_NOT_CONFIRMED');
      const saved=Object.assign({},raw,{key:returnedKey});
      weaponDefsRequestVersion++;weaponDefs[k]=saved;applyWeaponDef(saved);
      if(typeof saved.price==='number')setGemPrice(k,saved.price*GEM_PRICE_SCALE);
    }else{
      if(typeof d.price==='number'&&d.price!==weaponPrice(k))setGemPrice(k,d.price);
      weaponDefsRequestVersion++;
      weaponDefs[k]=row;
      applyWeaponDef(row);
    }
    weaponEditOpen=false; closeForm(); weaponEditKey=null; weaponEditDraft=null; storageOpen=true;
    storageTab = row.published ? 'published' : 'storage';
    sfx('pickup');
  }catch(e){
    const msg=String((e&&e.message)||e||'save failed');
    formError(/save_outpost_zero_weapon_definition|PGRST202|42883/i.test(msg)?'SAVE FAILED · RUN ADMIN 02 ADMINS, THEN RETRY.':'SAVE FAILED: '+msg.slice(0,120)); sfx('dry');
  }
}
function drawWeaponEdit(){
  if(!isMainAdmin()){weaponEditOpen=false;return;}
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
  for(const f of weaponEditorFields(weaponEditKey)){
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
  if(!canViewWeaponStorage()){storageOpen=false;return;}
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

  const selected=storageTab==='published'?pubList:stoList,
    pageSize=Math.max(1,Math.floor((py+ph-96-y)/30)),pageCount=Math.max(1,Math.ceil(selected.length/pageSize));
  storagePage=Math.max(0,Math.min(pageCount-1,Math.floor(+storagePage||0)));
  const section=(list, tint)=>{
    if(!list.length){
      ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
      ctx.fillText('nothing here', x0+4, y+8); y+=18; return;
    }
    for(const r of list.slice(storagePage*pageSize,(storagePage+1)*pageSize)){
      const h=26, bw2=46;
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

  const navY=py+ph-70,navH=24,navGap=8,navW=Math.min(92,(rw-navGap)/2),navX=W/2-navW-navGap/2;
  for(const [id,label,bx,enabled] of [['prev','‹ PREV',navX,storagePage>0],['next','NEXT ›',navX+navW+navGap,storagePage<pageCount-1]]){
    if(enabled)storageRects.push({x:bx,y:navY,w:navW,h:navH,id});
    const hv=enabled&&mouse.x>=bx&&mouse.x<=bx+navW&&mouse.y>=navY&&mouse.y<=navY+navH;
    ctx.fillStyle=hv?'rgba(191,168,255,.34)':'rgba(255,255,255,.05)';ctx.fillRect(bx,navY,navW,navH);
    ctx.strokeStyle=enabled?'#bfa8ff':'#42463b';ctx.strokeRect(bx+.5,navY+.5,navW,navH);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=enabled?'#d8c8ff':'#5a5648';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText(label,bx+navW/2,navY+navH/2);
  }
  ctx.fillStyle='#8a9268';ctx.font='7px ui-monospace,Consolas,monospace';ctx.fillText('PAGE '+(storagePage+1)+' / '+pageCount,W/2,navY-4);

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
      if(id.indexOf('tab:')===0){ storageTab=id.slice(4);storagePage=0;sfx('aim'); return; }
      if(id==='prev'){storagePage=Math.max(0,storagePage-1);sfx('aim');return;}
      if(id==='next'){storagePage++;sfx('aim');return;}
      if(id.indexOf('edit:')===0){
        if(!isMainAdmin()){ sfx('dry'); return; }
        openWeaponEdit(id.slice(5)); sfx('swap'); return;   // straight to the edit page
      }
      return;
    }
  }
}
function drawPromoAdmin(){
  if(!isMainAdmin()){promoAdminOpen=false;return;}
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
    bits.push(pc.uses_count+' ACCOUNTS \u00b7 EACH ONCE');
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
  if(!canUsePlayerTools()){playersOpen=false;playersTab='lookup';playersRects=[];banList=[];appealList=[];return;}
  if(!['lookup','banned','appeals'].includes(playersTab))playersTab='lookup';
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
    .concat(canUsePlayerTools()?[['banned','\u26D4 BANNED'+(banList.length?' ('+banList.length+')':'')],
                       ['appeals','\u2696 APPEALS'+(appealList.filter(a=>a.status==='open').length?' ('+appealList.filter(a=>a.status==='open').length+')':'')]]:[]);
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
        ctx.fillText(fitLine(adminAccountLabel(r.target_username,'UNKNOWN PLAYER'), rw-2*bw2-24), x0+8, y+9);
        ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(patchSummary(r.patch)+'  by '+String(r.requested_by||'?'), rw-2*bw2-24), x0+8, y+20);
        if(isMainAdmin()){
          const ax=x0+rw-2*bw2-8, rx=x0+rw-bw2-4,busy=scoreRequestDecisionBusy.has(String(r.id));
          if(!busy){playersRects.push({x:ax,y:y+4,w:bw2,h:h-8,id:'ok:'+r.id});playersRects.push({x:rx,y:y+4,w:bw2,h:h-8,id:'no:'+r.id});}
          ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax,y+4,bw2,h-8);
          ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax+0.5,y+4.5,bw2,h-8);
          ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx,y+4,bw2,h-8);
          ctx.strokeStyle='#d05548'; ctx.strokeRect(rx+0.5,y+4.5,bw2,h-8);
          ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
          ctx.fillStyle=busy?'#8a9268':'#cfe0a8'; ctx.fillText(busy?'WAIT':'OK', ax+bw2/2, y+h/2);
          ctx.fillStyle=busy?'#8a9268':'#e0a8a0'; ctx.fillText(busy?'…':'NO', rx+bw2/2, y+h/2);
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
      const who=adminAccountLabel(b.target_username,'UNKNOWN PLAYER');
      ctx.fillText(fitLine(who, rw-bw2-100), x0+8, y+10);
      ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
      const scopes=Array.isArray(b.scopes)?b.scopes.join('+'):'account';
      ctx.fillText(fitLine('['+scopes+'] '+(b.until?('until '+String(b.until).slice(0,10)):'permanent')+
                           '  by '+adminAccountLabel(b.banned_by_username,'STAFF'), rw-bw2-24), x0+8, y+21);
      ctx.fillStyle='#6b7455';
      ctx.fillText(fitLine(b.note||'', rw-bw2-24), x0+8, y+31);
      if(canBan()){
        const ux=x0+rw-bw2-6,key=String(b.ban_id||''),busy=playerBanActionBusy.has(key);
        if(!busy&&/^\d+$/.test(key))playersRects.push({x:ux,y:y+7,w:bw2,h:h-14,id:'unban:'+key});
        const hv=mouse.x>=ux&&mouse.x<=ux+bw2&&mouse.y>=y+7&&mouse.y<=y+h-7;
        ctx.fillStyle=hv?'rgba(167,193,94,0.34)':'rgba(167,193,94,0.16)'; ctx.fillRect(ux,y+7,bw2,h-14);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ux+0.5,y+7.5,bw2,h-14);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle=busy?'#8a9268':'#cfe0a8'; ctx.fillText(busy?'WAIT…':'UNBAN', ux+bw2/2, y+h/2);
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
      ctx.fillText(fitLine(adminAccountLabel(a.player_username,'UNKNOWN PLAYER')+'  \u00b7  '+String(a.created_at||'').slice(5,16).replace('T',' '), rw-2*bw2-24), x0+8, y+11);
      ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
      wrapTextClamped(String(a.message||''), x0+8, y+24, rw-2*bw2-24, 11, 2);
      if(open && canBan()){
        const ax=x0+rw-2*bw2-8, rx=x0+rw-bw2-4,busy=appealDecisionBusy.has(String(a.id));
        if(!busy){playersRects.push({x:ax,y:y+8,w:bw2,h:h-16,id:'apok:'+a.id});playersRects.push({x:rx,y:y+8,w:bw2,h:h-16,id:'apno:'+a.id});}
        ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax,y+8,bw2,h-16);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax+0.5,y+8.5,bw2,h-16);
        ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx,y+8,bw2,h-16);
        ctx.strokeStyle='#d05548'; ctx.strokeRect(rx+0.5,y+8.5,bw2,h-16);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle=busy?'#8a9268':'#cfe0a8'; ctx.fillText(busy?'WAIT':'LIFT', ax+bw2/2, y+h/2);
        ctx.fillStyle=busy?'#8a9268':'#e0a8a0'; ctx.fillText(busy?'…':'DENY', rx+bw2/2, y+h/2);
      } else if(!open){
        ctx.textAlign='right'; ctx.fillStyle='#6b7455'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillText(String(a.status||'').toUpperCase(), x0+rw-10, y+h/2);
      }
      ctx.textBaseline='alphabetic'; y+=h+5;
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
      if(id==='go_lookup'){ playersOpen=false; scoresOpen=true; peStep='choose'; peData=null; peMode='edit'; resetPlayerEditScroll(); openScoreEdit(); sfx('swap'); return; }
      if(id==='go_ban'){ if(!canBan()){ sfx('dry'); return; } playersOpen=false; scoresOpen=true; peMode='ban'; openScoreEdit(); sfx('swap'); return; }
      if(id.indexOf('unban:')===0){const banId=id.slice(6);if(banId&&canBan())void unbanPlayerFromList(banId);sfx('pickup');return;}
      if(id.indexOf('apok:')===0){ const a=appealList.find(x=>String(x.id)===id.slice(5));
        if(a && canBan()) resolveAppeal(a.id,'lift'); sfx('pickup'); return; }
      if(id.indexOf('apno:')===0){ const a=appealList.find(x=>String(x.id)===id.slice(5));
        if(a && canBan()) resolveAppeal(a.id,'denied'); sfx('dry'); return; }
      if(id.indexOf('ok:')===0){ const q=scoreReqs.find(x=>String(x.id)===id.slice(3)); if(q) approveScoreReq(q); sfx('pickup'); return; }
      if(id.indexOf('no:')===0){ const q=scoreReqs.find(x=>String(x.id)===id.slice(3)); if(q) rejectScoreReq(q); sfx('dry'); return; }
      return;
    }
  }
}
function drawScores(){
  const privateScores=peMode==='ban'||(peData&&!peData.publicOnly);
  const containsMainOnlyGiftData=!!(peData&&!peData.publicOnly&&peData.tempGrantsLoaded);
  if((privateScores&&!canUsePlayerTools())||(containsMainOnlyGiftData&&!isMainAdmin())){clearPrivatePlayerEditor();return;}
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(480,W-24), ph=Math.min(500,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#080c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#bfe8ff'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText(canEditPlayer()?'\u270E PLAYER EDIT':'\uD83D\uDD0D PLAYER LOOKUP', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(isCreator()?'CREATOR \u00b7 changes apply immediately'
                      : isMainAdmin()?'MAIN ADMIN \u00b7 changes apply immediately'
                      : canSeeStats()?'CO-ADMIN \u00b7 full stats, view only'
                      :'anyone can look up a player\u2019s score', pw-24), W/2, py+42);
  scoresRects=[];
  const x0=px+16, rw=pw-32;
  let y=py+54;
  const scrollablePanel=peStep==='panel'&&peData&&!peData.publicOnly&&canSeeStats();
  const scrollTop=py+54, scrollBottom=py+ph-44;
  let scrollRectStart=-1,renderedScroll=0;
  if(scrollablePanel){
    peScrollViewport={x:px+8,y:scrollTop,w:pw-16,h:Math.max(1,scrollBottom-scrollTop)};
    peScroll=Math.max(0,Math.min(peScrollMax,peScroll));
    renderedScroll=peScroll;
    scrollRectStart=scoresRects.length;
    ctx.save();
    ctx.beginPath();
    ctx.rect(peScrollViewport.x,peScrollViewport.y,peScrollViewport.w,peScrollViewport.h);
    ctx.clip();
    // Keep content and its hitboxes in the same screen-space transform.
    y-=peScroll;
  } else {
    peScrollViewport=null;
  }

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
    if(typeof adminNotificationComposerAvailable==='function'&&adminNotificationComposerAvailable())
      big('go_message','\u2709 MESSAGE PLAYER','send by username or exact account email',
          ['rgba(191,168,255,0.14)','rgba(191,168,255,0.32)','#bfa8ff','#e5dcff']);
    y+=4;
    if(!canEditPlayer()) return peFooter(px,py,pw,ph);
    ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('PENDING REQUESTS'+(scoreReqs.length?' ('+scoreReqs.length+')':''), x0, y+8);
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
      const room=isMainAdmin()? rw-2*bw2-24 : rw-24;
      ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(adminAccountLabel(r.target_username,'UNKNOWN PLAYER'), room), x0+8, y+11);
      ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(patchSummary(r.patch)+'   by '+String(r.requested_by||'?'), room), x0+8, y+23);
      if(isMainAdmin()){
        const ax2=x0+rw-2*bw2-8, rx2=x0+rw-bw2-4,busy=scoreRequestDecisionBusy.has(String(r.id));
        if(!busy){scoresRects.push({x:ax2,y:y+5,w:bw2,h:h-10,id:'ok:'+r.id});scoresRects.push({x:rx2,y:y+5,w:bw2,h:h-10,id:'no:'+r.id});}
        ctx.fillStyle='rgba(167,193,94,0.25)'; ctx.fillRect(ax2,y+5,bw2,h-10);
        ctx.strokeStyle='#a7c15e'; ctx.strokeRect(ax2+0.5,y+5.5,bw2,h-10);
        ctx.fillStyle='rgba(208,85,72,0.25)'; ctx.fillRect(rx2,y+5,bw2,h-10);
        ctx.strokeStyle='#d05548'; ctx.strokeRect(rx2+0.5,y+5.5,bw2,h-10);
        ctx.textAlign='center'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillStyle=busy?'#8a9268':'#cfe0a8'; ctx.fillText(busy?'WAIT…':'APPROVE', ax2+bw2/2, y+h/2);
        ctx.fillStyle=busy?'#8a9268':'#e0a8a0'; ctx.fillText(busy?'…':'REJECT',  rx2+bw2/2, y+h/2);
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
    if(peNotice){
      ctx.fillStyle=peNotice.indexOf('Could not')===0?'#e0a8a0':'#a7c15e';
      ctx.font='700 8px ui-monospace,Consolas,monospace';
      wrapTextClamped(peNotice,x0,y+7,rw,10,2); y+=24;
    }
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
      if(pePanelTab==='items'&&canEditLoadedPlayer()){
        ctx.textAlign='left'; ctx.fillStyle='#8a9268'; ctx.font='700 8px ui-monospace,Consolas,monospace';
        ctx.fillText('GIFT TYPE / LENGTH',x0,y+8); y+=13;
        const gap=3,dw=(rw-gap*(PE_GIFT_DURATIONS.length-1))/PE_GIFT_DURATIONS.length,dh=22;
        let dx=x0;
        for(const option of PE_GIFT_DURATIONS){
          const on=peGiftMode===option.id,id='giftmode:'+option.id;
          scoresRects.push({x:dx,y,w:dw,h:dh,id});
          const hot=mouse.x>=dx&&mouse.x<=dx+dw&&mouse.y>=y&&mouse.y<=y+dh;
          ctx.fillStyle=on?'#e8b658':hot?'rgba(232,182,88,.22)':'rgba(0,0,0,.32)';ctx.fillRect(dx,y,dw,dh);
          ctx.strokeStyle='#e8b658';ctx.strokeRect(dx+.5,y+.5,dw,dh);
          ctx.fillStyle=on?'#101208':'#e8d9a8';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.font='700 '+(dw<52?6:7)+'px ui-monospace,Consolas,monospace';
          const label=option.id==='custom'&&on?peGiftDurationLabel(peGiftDuration()).toUpperCase():option.label;
          ctx.fillText(fitLine(label,dw-4),dx+dw/2,y+dh/2);dx+=dw+gap;
        }
        ctx.textBaseline='alphabetic'; y+=dh+7;
      }
      ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
      const giftHint=peGiftMode==='permanent'?'PERMANENT':('TEMPORARY \u00b7 '+peGiftDurationLabel(peGiftDuration()).toUpperCase());
      ctx.fillText(canEditPlayer()? (pePanelTab==='items'?('EDIT WEAPONS \u00b7 SELECTED: '+giftHint+' \u00b7 + / \u2212'):'EDIT UPGRADES \u00b7 + / \u2212 how many they hold')
                                  : (pePanelTab==='items'?'WEAPONS OWNED':'UPGRADES HELD'), x0, y+8);
      y+=14;
      if(pePanelTab==='items'&&peData.tempGrantError){
        ctx.fillStyle='#e0a8a0';ctx.font='8px ui-monospace,Consolas,monospace';
        wrapTextClamped(peData.tempGrantError,x0,y+6,rw,10,2);y+=24;
      }
      const pending=pePendingSummary();
      if(pending){
        ctx.fillStyle='rgba(127,216,255,.09)';ctx.fillRect(x0,y,rw,27);ctx.strokeStyle='#315568';ctx.strokeRect(x0+.5,y+.5,rw,27);
        ctx.fillStyle='#bfe8ff';ctx.font='700 7px ui-monospace,Consolas,monospace';ctx.fillText('PENDING',x0+7,y+9);
        ctx.fillStyle='#9fb6b8';ctx.font='8px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(pending,rw-14),x0+7,y+21);y+=33;
      }
      const items = pePanelTab==='items' ? PE_ITEMS() : [];
      for(const k of items){
        const h=30,bw2=28,owns=!!peEdit.owned[k],had=!!peData.owned[k],
          temp=peEdit.tempGrants&&peEdit.tempGrants[k],hadTemp=peData.tempGrants&&peData.tempGrants[k],accessible=owns||!!temp;
        const nm=(WEAPONS[k]||UTILITIES[k]||VAULT_WEAPONS[k]||VAULT_UTILITIES[k]||{}).name||k;
        ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(x0,y,rw,h);
        const changed=owns!==had||!!temp!==!!hadTemp||(temp&&temp.draft);
        ctx.strokeStyle=changed?'#7fd8ff':'#5a5648';ctx.lineWidth=1;ctx.strokeRect(x0+.5,y+.5,rw,h);
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=accessible?'#cfe0a8':'#6b7455';ctx.font='700 9px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine((accessible?'\u2714 ':'\u00b7 ')+nm,rw-104),x0+8,y+10);
        ctx.fillStyle=temp?'#e8b658':owns?'#8fa873':'#4f5548';ctx.font='7px ui-monospace,Consolas,monospace';
        const status=(owns?'PERMANENT':'')+(owns&&temp?' + ':'')+(temp?((temp.draft?'TEMP PENDING \u00b7 ':'TEMP \u00b7 ')+(temp.draft?peGiftDurationLabel(temp.durationMinutes):('until '+peExpiryLabel(temp)))):'');
        ctx.fillText(fitLine(status||'NOT OWNED',rw-104),x0+8,y+22);
        if(canEditPlayer()){
          const mx=x0+rw-2*bw2-10,px2=x0+rw-bw2-6,editingTemp=peGiftMode!=='permanent',canTemp=peData.tempGrantsLoaded;
          scoresRects.push({x:mx,y:y+4,w:bw2,h:h-8,id:(editingTemp?'tm:':'m:')+k,enabled:!editingTemp||canTemp});
          scoresRects.push({x:px2,y:y+4,w:bw2,h:h-8,id:(editingTemp?'tp:':'p:')+k,enabled:!editingTemp||canTemp});
          const mayRemove=editingTemp?!!temp:owns,mayAdd=editingTemp?canTemp:!owns;
          ctx.fillStyle=mayRemove?'rgba(208,85,72,.28)':'rgba(255,255,255,.05)';ctx.fillRect(mx,y+4,bw2,h-8);
          ctx.strokeStyle=(!editingTemp||canTemp)?'#d05548':'#4a4634';ctx.strokeRect(mx+.5,y+4.5,bw2,h-8);
          ctx.fillStyle=mayAdd?'rgba(167,193,94,.28)':'rgba(255,255,255,.05)';ctx.fillRect(px2,y+4,bw2,h-8);
          ctx.strokeStyle=(!editingTemp||canTemp)?'#a7c15e':'#4a4634';ctx.strokeRect(px2+.5,y+4.5,bw2,h-8);
          ctx.textAlign='center';ctx.font='700 11px ui-monospace,Consolas,monospace';ctx.fillStyle='#e0a8a0';ctx.fillText('\u2212',mx+bw2/2,y+h/2);
          ctx.fillStyle='#cfe0a8';ctx.fillText('+',px2+bw2/2,y+h/2);
        }
        ctx.textBaseline='alphabetic';y+=h+4;
      }
      // ---- UPGRADES (stocked powerups) ----
      if(pePanelTab==='ups'){
        for(const pu of POWERUPS){
          const h=22, bw2=24;
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

  if(scrollablePanel){
    // Convert the finished screen-space cursor back to logical content height,
    // then clamp the offset. This automatically adapts to weapon additions and
    // to short portrait/landscape canvases without hard-coded row counts.
    const contentBottom=y+peScroll+4;
    peScrollMax=Math.max(0,contentBottom-scrollTop-peScrollViewport.h);
    peScroll=Math.max(0,Math.min(peScrollMax,peScroll));

    // Only visible portions are clickable. In particular, a row hidden below
    // the fixed footer can never receive an award/remove click.
    const visible=scoresRects.slice(0,scrollRectStart);
    const vt=peScrollViewport.y, vb=vt+peScrollViewport.h;
    for(const r of scoresRects.slice(scrollRectStart)){
      const top=Math.max(vt,r.y), bottom=Math.min(vb,r.y+r.h);
      if(bottom>top) visible.push(Object.assign({},r,{y:top,h:bottom-top}));
    }
    scoresRects=visible;
    // A resize can shrink the maximum while this frame was laid out with the
    // older offset. Suppress its stale hitboxes; the next frame redraws at the
    // newly clamped position.
    if(peScroll!==renderedScroll) scoresRects=[];
    ctx.restore();

    if(peScrollMax>0){
      const tx=px+pw-10, ty=scrollTop+3, th=Math.max(18,peScrollViewport.h-6);
      const thumbH=Math.max(22,th*(peScrollViewport.h/(peScrollViewport.h+peScrollMax)));
      const thumbY=ty+(th-thumbH)*(peScroll/peScrollMax);
      ctx.fillStyle='rgba(127,216,255,0.12)'; ctx.fillRect(tx,ty,2,th);
      ctx.fillStyle='#7fd8ff'; ctx.fillRect(tx-1,thumbY,4,thumbH);
      ctx.textAlign='right'; ctx.textBaseline='alphabetic';
      ctx.fillStyle='rgba(127,216,255,0.72)'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillText(peScroll>0?'\u25B2':'',tx-4,ty+7);
      ctx.fillText(peScroll<peScrollMax?'SCROLL \u25BC':'',tx-4,ty+th-1);
    }
  }

  peFooter(px,py,pw,ph);
}
function peFooter(px,py,pw,ph){
  const fb=[];
  if(peStep==='panel' && canEditLoadedPlayer())
    fb.push([peBusy?'busy':'apply',peBusy?'WORKING\u2026':peDirty()?'APPLY':'NO CHANGES',peBusy?'#5a5648':peDirty()?'#a7c15e':'#5a5648']);
  if(!peBusy){
    if(peStep!=='choose') fb.push(['back','\u2039 BACK','#7fd8ff']);
    fb.push(['close','CLOSE','#d05548']);
  }
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
      if(peBusy){sfx('dry');return;}
      if(id==='close'){ scoresOpen=false; peStep='choose'; peData=null; resetPlayerEditScroll(); if(canUsePlayerTools()) playersOpen=true; sfx('swap'); return; }
      if(id==='back'){ peStep='choose'; peData=null; resetPlayerEditScroll(); sfx('swap'); return; }
      if(id==='go_edit'){ peMode='edit'; openScoreEdit(); sfx('swap'); return; }
      if(id==='go_ban'){ if(!canEditPlayer()){ sfx('dry'); return; } peMode='ban'; openScoreEdit(); sfx('swap'); return; }
      if(id==='go_message'){ if(typeof adminOpenPlayerTargetMessage==='function')adminOpenPlayerTargetMessage();else sfx('dry'); return; }
      if(id==='busy'){sfx('dry');return;}
      if(id==='apply'){ if(canEditLoadedPlayer() && peDirty()) peApply(); else sfx('dry'); return; }
      if(!canEditLoadedPlayer() && (id.indexOf('n_')===0||id.indexOf('p:')===0||id.indexOf('m:')===0||id.indexOf('tp:')===0||id.indexOf('tm:')===0||id.indexOf('pp:')===0||id.indexOf('pm:')===0)){ sfx('dry'); return; }
      if(id==='n_score'){ peEdit.score=peNum('new high score for '+peTarget+':', peEdit.score, 99999999); sfx('aim'); return; }
      if(id==='n_gems'){  peEdit.gems =peNum('new gem count for '+peTarget+':',  peEdit.gems, 9999999); sfx('aim'); return; }
      if(id==='n_coins'){ peEdit.coins=peNum('new coin count for '+peTarget+':', peEdit.coins, 9999999); sfx('aim'); return; }
      if(id.indexOf('p:')===0){ peEdit.owned[id.slice(2)]=true; sfx('pickup'); return; }
      if(id.indexOf('ptab:')===0){ pePanelTab=id.slice(5); resetPlayerEditScroll(); sfx('aim'); return; }
      if(id.indexOf('giftmode:')===0){
        const mode=id.slice(9);if(!PE_GIFT_DURATIONS.some(option=>option.id===mode)){sfx('dry');return;}
        if(mode==='custom'){
          let raw=null;try{raw=window.prompt('Temporary gift length in hours (5 minutes to 365 days):',String(Math.max(1,peCustomGiftMinutes/60)));}catch(error){}
          if(raw===null)return;
          const hours=+raw;if(!Number.isFinite(hours)||hours<5/60||hours>8760){peNotice='Custom gift must be between 5 minutes and 365 days.';sfx('dry');return;}
          peCustomGiftMinutes=Math.max(5,Math.min(525600,Math.round(hours*60)));
        }
        peGiftMode=mode;peNotice='';sfx('aim');return;
      }
      if(id.indexOf('tp:')===0){
        if(!peData.tempGrantsLoaded){peNotice=peData.tempGrantError||'Refresh temporary gifts first.';sfx('dry');return;}
        const k=id.slice(3),minutes=peGiftDuration();peEdit.tempGrants=peEdit.tempGrants||{};peEdit.tempRevokes=peEdit.tempRevokes||{};
        delete peEdit.tempRevokes[k];
        peEdit.tempGrants[k]={expiresAt:new Date(Date.now()+minutes*60000).toISOString(),durationMinutes:minutes,draft:true,operationId:adminOperationUuid()};
        peNotice='Temporary '+((WEAPONS[k]||UTILITIES[k]||{}).name||k)+' staged for '+peGiftDurationLabel(minutes)+'.';sfx('pickup');return;
      }
      if(id.indexOf('tm:')===0){
        if(!peData.tempGrantsLoaded){peNotice=peData.tempGrantError||'Refresh temporary gifts first.';sfx('dry');return;}
        const k=id.slice(3),had=!!(peData.tempGrants&&peData.tempGrants[k]);peEdit.tempRevokes=peEdit.tempRevokes||{};
        delete peEdit.tempGrants[k];if(had)peEdit.tempRevokes[k]=adminOperationUuid();else delete peEdit.tempRevokes[k];
        peNotice=had?'Temporary gift revoke staged. Permanent ownership is unchanged.':'Unsaved temporary gift removed.';sfx('dry');return;
      }
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
  if(!canManageAdmins()){adminsOpen=false;adminsRects=[];return;}
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(500,W-24), ph=Math.min(470,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0e0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8d9a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDC65 ADMINS', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(isCreator()?'CREATOR \u00b7 manage every staff tier':'MAIN ADMIN \u00b7 manage co-admins + testers', W/2, py+42);
  adminsRects=[];
  const x0=px+16, rw=pw-32;
  let y=py+56;
  // header
  ctx.textAlign='left'; ctx.fillStyle='#6b7455'; ctx.font='700 8px ui-monospace,Consolas,monospace';
  ctx.fillText('ACCOUNT', x0+6, y+8);
  ctx.fillText('RANK', x0+Math.floor(rw*0.46), y+8);
  ctx.textAlign='right'; ctx.fillText('ACTIONS', x0+rw-6, y+8);
  y+=14;
  const roster=adminRoster().slice(0,8);
  for(const row of roster){
    const h=26, bw2=44, bg=4;
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle= row.rank==='creator' ? '#e8b658' : '#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    // email
    ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
    const canPromote=(row.rank==='tester'&&canManageAdmins())||(row.rank==='co'&&isCreator()),canDemote=(row.rank==='co'&&canManageAdmins())||(row.rank==='main'&&isCreator()),
      canKick=(row.rank==='tester'||row.rank==='co')&&canManageAdmins()||row.rank==='main'&&isCreator(),nAct=(row.isSelf?0:1)+(canPromote?1:0)+(canDemote?1:0)+(canKick?1:0);
    const actW=nAct*(bw2+bg);
    const rankW=Math.min(84, Math.max(26, rw-actW-120));
    const rankX=x0+rw-actW-rankW-4;
    ctx.fillText(fitLine(adminAccountLabel(row.username,'UNKNOWN STAFF'), Math.max(40, rankX-x0-12)), x0+6, y+h/2);
    // rank
    const rl = row.rank==='creator' ? (row.isSelf?'CREATOR (ME)':'CREATOR') : row.rank==='main' ? 'MAIN ADMIN' : row.rank==='co'?'CO-ADMIN':'TESTER';
    ctx.fillStyle= row.rank==='creator' ? '#e8b658' : row.rank==='main' ? '#e0a8a0' : row.rank==='co'?'#a7c15e':'#7fd8ff';
    ctx.font='700 8px ui-monospace,Consolas,monospace';
    const rlShort = rankW<60 ? (row.rank==='creator'?(row.isSelf?'ME':'CR'):row.rank==='main'?'MAIN':row.rank==='co'?'CO':'TEST') : rl;
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
    if(canKick) act('ak:'+row.username,'KICK','#d05548',['rgba(208,85,72,0.18)','rgba(208,85,72,0.36)'],'#e0a8a0');
    if(canDemote) act('ad:'+row.username,'DEMOTE','#7fd8ff',['rgba(127,216,255,0.14)','rgba(127,216,255,0.32)'],'#bfe8ff');
    if(canPromote) act('ap:'+row.username,'PROMOTE','#e8b658',['rgba(232,182,88,0.16)','rgba(232,182,88,0.34)'],'#e8d9a8');
    if(!row.isSelf) act('am:'+row.username,'MESSAGE','#a7c15e',['rgba(167,193,94,0.16)','rgba(167,193,94,0.34)'],'#cfe0a8');
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
      if(id==='add'){ addAdmin(); sfx('swap'); return; }
      if(id.indexOf('ak:')===0){ kickAdmin(id.slice(3)); sfx('dry'); return; }
      if(id.indexOf('ap:')===0){ promoteAdmin(id.slice(3)); sfx('pickup'); return; }
      if(id.indexOf('ad:')===0){ demoteAdmin(id.slice(3)); sfx('aim'); return; }
      if(id.indexOf('am:')===0){ openMsgCompose(id.slice(3)); sfx('swap'); return; }
      return;
    }
  }
}
function drawWeaponSuggestions(){
  if(!canReviewWeaponSuggestions()){weaponSuggestionsOpen=false;weaponSuggestions=[];weaponSuggestionPage=0;return;}
  ctx.fillStyle='rgba(4,6,3,0.96)';ctx.fillRect(0,0,W,H);
  const {pw,ph,px,py}=adminInboxBounds(),tiny=ph<430||pw<520,x0=px+(tiny?8:16),rw=pw-(tiny?16:32);
  ctx.fillStyle='#0b0d0b';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#e8b658';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#ffe0a0';ctx.font='700 '+(tiny?14:18)+'px ui-monospace,Consolas,monospace';ctx.fillText('SUGGESTIONS',W/2,py+(tiny?21:27));
  ctx.fillStyle=/COULD NOT|UNAVAILABLE/.test(weaponSuggestionStatus)?'#d05548':'#8a9268';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(weaponSuggestionStatus||'STORED ADMIN WEAPON SUGGESTIONS',pw-26),W/2,py+(tiny?37:44));
  weaponSuggestionsRects=[];let y=drawSuggestionsTabs(px,py,pw,py+(tiny?44:52),weaponSuggestionsRects);
  y=drawSuggestionArchiveTabs(px,pw,y,weaponSuggestionsRects,'suggestions');
  const footerH=tiny?24:28,footerY=py+ph-footerH-6,rowH=tiny?48:58,room=footerY-y-7,maxRows=Math.max(1,Math.floor(room/rowH)),
    pages=Math.max(1,Math.ceil(weaponSuggestions.length/maxRows));
  weaponSuggestionPage=Math.max(0,Math.min(pages-1,Math.floor(+weaponSuggestionPage||0)));
  const rows=weaponSuggestions.slice(weaponSuggestionPage*maxRows,(weaponSuggestionPage+1)*maxRows);
  if(!rows.length&&!weaponSuggestionBusy){ctx.fillStyle='#5a5648';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText(weaponSuggestionView==='archive'?'NO REVIEWED ADMIN SUGGESTIONS':'NO PENDING ADMIN SUGGESTIONS',W/2,y+24);}
  for(let index=0;index<rows.length;index++){
    const row=rows[index],archived=weaponSuggestionView==='archive',h=rowH-5,buttonW=Math.min(58,Math.max(44,rw*.14)),buttonCount=archived?1:3,buttonsW=buttonW*buttonCount+Math.max(0,buttonCount-1)*4,contentW=rw-buttonsW-12;
    ctx.fillStyle=index%2?'rgba(255,255,255,.025)':'rgba(255,255,255,.055)';ctx.fillRect(x0,y,rw,h);ctx.strokeStyle='#566047';ctx.strokeRect(x0+.5,y+.5,rw,h);
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=archived&&row.status==='rejected'?'#e0a8a0':archived?'#a7c15e':'#e8b658';ctx.font='700 9px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(String(row.weapon_key||'WEAPON').toUpperCase()+' · '+(archived?String(row.status||'reviewed').toUpperCase():String(row.author_role||'STAFF').toUpperCase()),contentW-8),x0+7,y+5);
    ctx.fillStyle='#cdd6b0';ctx.font='8px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(String(row.suggestion||''),contentW-8),x0+7,y+20);
    ctx.fillStyle='#777f68';ctx.font='7px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(adminAccountLabel(row.author_username,'STAFF')+' · '+String(row.created_at||'').slice(0,16).replace('T',' '),contentW-8),x0+7,y+36);
    const bx=x0+rw-buttonsW-4,by=y+9,bh=h-18,defs=archived?[['ws_read','READ','#7fd8ff']]:[['ws_read','READ','#7fd8ff'],['ws_approve','OK','#a7c15e'],['ws_reject','NO','#d05548']];
    defs.forEach((def,i)=>{const x=bx+i*(buttonW+4),enabled=!weaponSuggestionBusy;weaponSuggestionsRects.push({x,y:by,w:buttonW,h:bh,id:def[0],suggestionId:row.id,row,enabled});const hv=enabled&&mouse.x>=x&&mouse.x<=x+buttonW&&mouse.y>=by&&mouse.y<=by+bh;
      ctx.fillStyle=hv?def[2]:'rgba(255,255,255,.05)';ctx.fillRect(x,by,buttonW,bh);ctx.strokeStyle=def[2];ctx.strokeRect(x+.5,by+.5,buttonW,bh);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=hv?'#101208':'#d9dec9';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText(def[1],x+buttonW/2,by+bh/2);});
    y+=rowH;
  }
  const footerStrip=adminControlStrip(px,pw,620,tiny?8:16),bh=footerH,gap=5,bw=(footerStrip.w-gap*3)/4,fy=footerY,defs=[
    {id:'ws_newer',label:'\u2039 NEWER',col:'#7fd8ff',enabled:weaponSuggestionPage>0},
    {id:'ws_older',label:'OLDER \u203a',col:'#7fd8ff',enabled:weaponSuggestionPage+1<pages},
    {id:'ws_refresh',label:'\u21BB REFRESH',col:'#a7c15e',enabled:!weaponSuggestionBusy},
    {id:'ws_close',label:'CLOSE',col:'#d05548',enabled:true}
  ];
  defs.forEach((def,index)=>{const x=footerStrip.x+index*(bw+gap),enabled=def.enabled&&!weaponSuggestionBusy;
    weaponSuggestionsRects.push({x,y:fy,w:bw,h:bh,id:def.id,enabled});const hv=enabled&&mouse.x>=x&&mouse.x<=x+bw&&mouse.y>=fy&&mouse.y<=fy+bh;
    ctx.fillStyle=hv?def.col:'rgba(255,255,255,.05)';ctx.fillRect(x,fy,bw,bh);ctx.strokeStyle=enabled?def.col:'#42463b';ctx.strokeRect(x+.5,fy+.5,bw,bh);ctx.fillStyle=hv?'#101208':enabled?'#d9dec9':'#5a5648';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(tiny?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(def.label,x+bw/2,fy+bh/2);
  });
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function weaponSuggestionsClick(){
  for(const r of weaponSuggestionsRects){
    if(mouse.x<r.x||mouse.x>r.x+r.w||mouse.y<r.y||mouse.y>r.y+r.h)continue;if(r.enabled===false){sfx('dry');return;}
    if(suggestionsTabClick(r.id))return;
    if(String(r.id).indexOf('ws_view:')===0){if(setWeaponSuggestionView(String(r.id).slice(8)))void fetchWeaponSuggestions();sfx('aim');return;}
    if(r.id==='ws_close'){weaponSuggestionsOpen=false;sfx('swap');return;}
    if(r.id==='ws_newer'){weaponSuggestionPage=Math.max(0,weaponSuggestionPage-1);sfx('aim');return;}
    if(r.id==='ws_older'){weaponSuggestionPage++;sfx('aim');return;}
    if(r.id==='ws_refresh'){void fetchWeaponSuggestions();sfx('swap');return;}
    if(r.id==='ws_read'){const row=r.row||{},review=weaponSuggestionView==='archive'?('\n\nDECISION: '+String(row.status||'reviewed').toUpperCase()+(row.reviewed_at?' · '+String(row.reviewed_at).slice(0,16).replace('T',' '):'')+(row.reviewer_note?'\nREVIEWER NOTE: '+String(row.reviewer_note):'')):'';openReader('WEAPON SUGGESTION',String(row.weapon_key||'WEAPON').toUpperCase()+' · '+String(row.author_role||'STAFF').toUpperCase(),String(row.suggestion||'')+review,'main');sfx('swap');return;}
    if(r.id==='ws_approve'){void reviewWeaponSuggestion(r.suggestionId,'approved');return;}
    if(r.id==='ws_reject'){void reviewWeaponSuggestion(r.suggestionId,'rejected');return;}
  }
}
function drawAdminRequests(){
  if(!isMainAdmin()){requestsOpen=false;return;}
  ctx.fillStyle='rgba(4,6,3,.97)';ctx.fillRect(0,0,W,H);
  const {pw,ph,px,py}=adminInboxBounds(),tiny=ph<420||pw<520;
  ctx.fillStyle='#0b0c0e';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#e8b658';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#ffe0a0';ctx.font='700 '+(tiny?14:18)+'px ui-monospace,Consolas,monospace';ctx.fillText('REQUESTS',W/2,py+(tiny?21:28));
  ctx.fillStyle='#8a9268';ctx.font=(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine('PLAYER EDITS · UPDATE APPROVALS · BAN APPEALS',pw-20),W/2,py+(tiny?36:45));
  requestsRects=[];const rows=adminRequestRows(),x0=px+(tiny?7:16),rw=pw-(tiny?14:32),top=py+(tiny?48:58),footerY=py+ph-(tiny?31:40),
    rowH=tiny?47:58,gap=tiny?3:5,pageSize=Math.max(1,Math.floor((footerY-top-8)/(rowH+gap))),pages=Math.max(1,Math.ceil(rows.length/pageSize));
  requestsPage=Math.max(0,Math.min(pages-1,Math.floor(+requestsPage||0)));
  const shown=rows.slice(requestsPage*pageSize,(requestsPage+1)*pageSize),typeText={player:'PLAYER EDIT',update:'OFFICIAL UPDATE',appeal:'BAN APPEAL'};
  if(!shown.length){ctx.fillStyle='#5a5648';ctx.font='10px ui-monospace,Consolas,monospace';ctx.fillText(requestsBusy?'LOADING…':'NO REQUESTS WAITING',W/2,top+40);}
  shown.forEach((item,index)=>{
    const row=item.row||{},y=top+index*(rowH+gap),buttonW=tiny?42:58,buttonGap=4,actionSpan=buttonW*3+buttonGap*2,contentW=rw-actionSpan-18,
      title=item.kind==='player'?adminAccountLabel(row.target_username,'UNKNOWN PLAYER'):
        item.kind==='update'?String(row.heading||row.message||'UPDATE'):adminAccountLabel(row.player_username,'UNKNOWN PLAYER'),
      body=item.kind==='player'?patchSummary(row.patch)+' · by '+adminAccountLabel(row.requested_by,'UNKNOWN STAFF'):
        item.kind==='update'?String(row.details||row.message||'')+' · by '+String(row.author||'STAFF'):
        String(row.message||'');
    ctx.fillStyle=index%2?'rgba(255,255,255,.025)':'rgba(232,182,88,.07)';ctx.fillRect(x0,y,rw,rowH);ctx.strokeStyle='#65552f';ctx.strokeRect(x0+.5,y+.5,rw,rowH);
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e8b658';ctx.font='700 '+(tiny?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(typeText[item.kind]+' · '+fitLine(title,contentW-90),x0+7,y+6);
    ctx.fillStyle='#cdd6b0';ctx.font=(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';wrapTextClamped(body,x0+7,y+(tiny?19:23),contentW-8,tiny?9:11,tiny?2:3);
    const defs=[['read','READ','#7fd8ff'],['approve',item.kind==='appeal'?'LIFT':'APPROVE','#a7c15e'],['reject',item.kind==='appeal'?'DENY':'REJECT','#d05548']],bx0=x0+rw-actionSpan-7;
    defs.forEach((def,i)=>{const bx=bx0+i*(buttonW+buttonGap),busy=requestsBusy||weaponSuggestionBusy||scoreRequestDecisionBusy.has(String(row.id))||appealDecisionBusy.has(String(row.id));
      requestsRects.push({x:bx,y:y+6,w:buttonW,h:rowH-12,id:def[0],item,enabled:def[0]==='read'||!busy});const hot=!busy&&mouse.x>=bx&&mouse.x<=bx+buttonW&&mouse.y>=y+6&&mouse.y<=y+rowH-6;
      ctx.fillStyle=hot?def[2]:'rgba(0,0,0,.35)';ctx.fillRect(bx,y+6,buttonW,rowH-12);ctx.strokeStyle=def[2];ctx.strokeRect(bx+.5,y+6.5,buttonW,rowH-12);ctx.fillStyle=hot?'#101208':busy&&def[0]!=='read'?'#5a5648':def[2];ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(tiny?6:7)+'px ui-monospace,Consolas,monospace';ctx.fillText(def[1],bx+buttonW/2,y+rowH/2);
    });
  });
  const defs=[['prev','‹ PREV',requestsPage>0,'#8a9268'],['refresh',requestsBusy?'LOADING…':'↻ REFRESH',!requestsBusy,'#7fd8ff'],['next','NEXT ›',requestsPage<pages-1,'#8a9268'],['close','CLOSE',true,'#d05548']],fg=5,fw=(rw-fg*(defs.length-1))/defs.length,fh=tiny?24:30;
  defs.forEach((def,i)=>{const x=x0+i*(fw+fg),enabled=def[2];requestsRects.push({x,y:footerY,w:fw,h:fh,id:def[0],enabled});const hot=enabled&&mouse.x>=x&&mouse.x<=x+fw&&mouse.y>=footerY&&mouse.y<=footerY+fh;ctx.fillStyle=hot?def[3]:'rgba(255,255,255,.05)';ctx.fillRect(x,footerY,fw,fh);ctx.strokeStyle=enabled?def[3]:'#42463b';ctx.strokeRect(x+.5,footerY+.5,fw,fh);ctx.fillStyle=hot?'#101208':enabled?'#cdd6b0':'#5a5648';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(tiny?6:8)+'px ui-monospace,Consolas,monospace';ctx.fillText(def[1],x+fw/2,footerY+fh/2);});
  ctx.fillStyle='#8a9268';ctx.font='7px ui-monospace,Consolas,monospace';ctx.fillText((requestsStatus||rows.length+' PENDING')+' · PAGE '+(requestsPage+1)+'/'+pages,W/2,footerY-5);ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function adminRequestsClick(){
  if(!isMainAdmin()){requestsOpen=false;return;}
  for(const hit of requestsRects){
    if(mouse.x<hit.x||mouse.x>hit.x+hit.w||mouse.y<hit.y||mouse.y>hit.y+hit.h)continue;
    if(hit.enabled===false){sfx('dry');return;}
    if(hit.id==='close'){requestsOpen=false;adminPanelOpen=true;sfx('swap');return;}
    if(hit.id==='prev'){requestsPage=Math.max(0,requestsPage-1);sfx('aim');return;}
    if(hit.id==='next'){requestsPage++;sfx('aim');return;}
    if(hit.id==='refresh'){void refreshAdminRequests();sfx('aim');return;}
    const item=hit.item||{},row=item.row||{};
    if(hit.id==='read'){
      const title=item.kind==='update'?String(row.heading||row.message||'OFFICIAL UPDATE'):item.kind==='appeal'?'BAN APPEAL · '+adminAccountLabel(row.player_username,'PLAYER'):'PLAYER EDIT · '+adminAccountLabel(row.target_username,'PLAYER'),
        body=item.kind==='update'?String(row.details||row.message||''):item.kind==='appeal'?String(row.message||''):patchSummary(row.patch);
      openReader(title,String(row.created_at||''),body,'main');sfx('swap');return;
    }
    let action=null;
    if(item.kind==='player')action=hit.id==='approve'?approveScoreReq(row):rejectScoreReq(row);
    else if(item.kind==='update')action=hit.id==='approve'?approveBanner(row.id):rejectBanner(row.id);
    else if(item.kind==='appeal')action=resolveAppeal(row.id,hit.id==='approve'?'lift':'deny');
    if(action)void Promise.resolve(action).then(()=>{requestsStatus=adminRequestRows().length+' PENDING REQUESTS';});return;
  }
}
function drawMsgs(){
  if(!isAdmin()){msgsOpen=false;adminMsgs=[];unreadMsgs=0;return;}
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const {pw,ph,px,py}=adminInboxBounds();
  ctx.fillStyle='#0a0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2709 ADMIN INBOX', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(sb?'admin messages \u00b7 newest first':'admin messages live on the deployed site', W/2, py+42);
  msgsRects=[];
  const x0=px+16, rw=pw-32; let y=drawInboxTabs(px,py,pw,py+50,msgsRects);
  if(isMainAdmin()){                                 // COMPOSE: start a message from here
    const composeStrip=adminControlStrip(px,pw,520),cbh=28;
    msgsRects.push({x:composeStrip.x,y,w:composeStrip.w,h:cbh,id:'compose'});
    const hv=mouse.x>=composeStrip.x&&mouse.x<=composeStrip.x+composeStrip.w&&mouse.y>=y&&mouse.y<=y+cbh;
    ctx.fillStyle=hv?'rgba(167,193,94,0.32)':'rgba(167,193,94,0.14)'; ctx.fillRect(composeStrip.x,y,composeStrip.w,cbh);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(composeStrip.x+0.5,y+0.5,composeStrip.w,cbh);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#cfe0a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('\u270E COMPOSE', W/2, y+cbh/2);
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    y+=cbh+10;
  }
  const inboxList=adminMsgs.filter(m=>!msgArchived(m));
  if(!inboxList.length){
    ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('no messages yet', W/2, y+14);
  }
  const h=38,maxRows=Math.max(1,Math.floor((py+ph-54-y)/(h+5)));
  for(const m of inboxList.slice(0,maxRows)){
    if(y+h>py+ph-46) break;
    const unread=m.is_incoming&&!m.read;
    ctx.fillStyle= unread ? 'rgba(167,193,94,0.14)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle= unread ? '#a7c15e' : '#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle= unread ? '#cfe0a8' : '#8a9268'; ctx.font='700 8px ui-monospace,Consolas,monospace';
    const when=String(m.created_at||'').slice(5,16).replace('T',' ');
    ctx.fillText(fitLine((unread?'\u25CF ':'')+adminAccountLabel(m.from_username,'STAFF')+' \u2192 '+adminAccountLabel(m.to_username,'STAFF')+(when?'  \u00b7 '+when:''), rw-120), x0+8, y+10);
    ctx.fillStyle='#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
    const abw=m.is_incoming?50:0;
    const body=String(m.message||'');
    ctx.fillText(fitLine(body, rw-24-abw-52), x0+8, y+24);
    // row + READ open the whole message
    msgsRects.push({x:x0,y,w:rw-abw-56,h,id:'rd',
                    read:{t:adminAccountLabel(m.from_username,'STAFF'), m:when, b:body}});
    {
      const rbw=48, bx3=x0+rw-abw-rbw-6;
      const hv3=mouse.x>=bx3&&mouse.x<=bx3+rbw&&mouse.y>=y+6&&mouse.y<=y+h-6;
      ctx.fillStyle=hv3?'rgba(127,216,255,0.34)':'rgba(127,216,255,0.16)'; ctx.fillRect(bx3,y+6,rbw,h-12);
      ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(bx3+0.5,y+6.5,rbw,h-12);
      ctx.textAlign='center'; ctx.font='700 7px ui-monospace,Consolas,monospace';
      ctx.fillStyle='#bfe8ff'; ctx.fillText('READ', bx3+rbw/2, y+h/2);
      ctx.textAlign='left';
      msgsRects.push({x:bx3,y:y+6,w:rbw,h:h-12,id:'rd2',
                      read:{t:adminAccountLabel(m.from_username,'STAFF'), m:when, b:body}});
    }
    if(m.is_incoming){                               // ARCHIVE now instead of waiting the 7 days
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
  const footerStrip=adminControlStrip(px,pw,370),gap2=10,bw2=(footerStrip.w-gap2)/2,bh2=34;
  const rx=footerStrip.x,cx2=footerStrip.x+bw2+gap2,byy=py+ph-40;
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
      else if(r.id==='refresh'){ fetchMsgs().then(ok=>{if(ok)markMsgsRead();}); sfx('swap'); }
      else if(String(r.id).indexOf('ar:')===0){ archiveMsg(+String(r.id).slice(3)); sfx('swap'); }
      else if(r.read){ openReader(r.read.t, r.read.m, r.read.b,'admin'); sfx('swap'); }
      return;
    }
  }
}
function drawAdminAuditLog(){
  if(!isMainAdmin()){auditOpen=false;return;}
  ctx.fillStyle='rgba(4,6,3,0.97)';ctx.fillRect(0,0,W,H);
  const tiny=W<520||H<480,{pw,ph,px,py}=adminInboxBounds();
  ctx.fillStyle='#080c0e';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#7fd8ff';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#bfe8ff';ctx.font='700 '+(tiny?15:18)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('SUGGESTIONS',W/2,py+25);
  ctx.fillStyle='#8a9268';ctx.font=(tiny?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('MAIN / CREATOR ONLY \u00b7 GIFTS, BANS, EDITS, REQUESTS AND DECISIONS',pw-20),W/2,py+42);
  auditRects=[];
  const x0=px+(tiny?10:16),rw=pw-(tiny?20:32),tabsBottom=drawSuggestionsTabs(px,py,pw,py+50,auditRects),archiveTabsBottom=drawSuggestionArchiveTabs(px,pw,tabsBottom,auditRects,'audit');
  const headerY=archiveTabsBottom,headerH=22,footerY=py+ph-38,viewTop=headerY+headerH,viewBottom=footerY-6;
  ctx.fillStyle='rgba(127,216,255,.10)';ctx.fillRect(x0,headerY,rw,headerH);ctx.strokeStyle='#315568';ctx.strokeRect(x0+.5,headerY+.5,rw,headerH);
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#bfe8ff';ctx.font='700 '+(tiny?7:8)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('ACTION / TIME',x0+7,headerY+headerH/2);
  ctx.textAlign='center';ctx.fillText('ACTOR \u2192 TARGET',x0+rw*.58,headerY+headerH/2);
  ctx.textAlign='right';ctx.fillText('PAGE '+(adminAuditPage+1),x0+rw-7,headerY+headerH/2);

  auditScrollViewport={x:x0,y:viewTop,w:rw,h:Math.max(1,viewBottom-viewTop)};
  const rows=adminAuditPageRows(),rowH=tiny?45:50,gap=4,logicalH=rows.length*(rowH+gap);
  auditScrollMax=Math.max(0,logicalH-auditScrollViewport.h);auditScroll=Math.max(0,Math.min(auditScroll,auditScrollMax));
  const rectStart=auditRects.length;
  ctx.save();ctx.beginPath();ctx.rect(auditScrollViewport.x,auditScrollViewport.y,auditScrollViewport.w,auditScrollViewport.h);ctx.clip();
  let y=viewTop-auditScroll;
  if(adminAuditLoading&&!rows.length){
    ctx.textAlign='center';ctx.fillStyle='#7fd8ff';ctx.font='700 10px ui-monospace,Consolas,monospace';ctx.fillText('LOADING LOG\u2026',W/2,y+24);
  }else if(adminAuditError&&!rows.length){
    ctx.textAlign='center';ctx.fillStyle='#e0a8a0';ctx.font='700 9px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(adminAuditError,rw-20),W/2,y+24);
  }else if(!rows.length){
    ctx.textAlign='center';ctx.fillStyle='#5a5648';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText(adminAuditView==='archive'?'NO LOGS OLDER THAN 7 DAYS':'NO LOGS FROM THE LAST 7 DAYS',W/2,y+24);
  }
  for(const row of rows){
    const ok=['ok','accepted','success','applied','submitted'].includes(row.result),neutral=row.result==='no_change',
      col=ok?'#a7c15e':neutral?'#e8b658':'#e0a8a0';
    ctx.fillStyle='rgba(0,0,0,.34)';ctx.fillRect(x0,y,rw,rowH);ctx.strokeStyle='#4a5960';ctx.strokeRect(x0+.5,y+.5,rw,rowH);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=col;ctx.font='700 '+(tiny?7:8)+'px ui-monospace,Consolas,monospace';
    let when=row.createdAt;try{when=new Date(row.createdAt).toLocaleString();}catch(error){}
    ctx.fillText(fitLine(adminAuditActionTitle(row.action)+' \u00b7 '+String(when).replace(' GMT',''),rw-14),x0+7,y+10);
    ctx.fillStyle='#cdd6b0';ctx.font=(tiny?7:9)+'px ui-monospace,Consolas,monospace';
    const targetLabel=(row.actor||'?')+' \u2192 '+(row.target||'GLOBAL');
    ctx.fillText(fitLine(targetLabel,rw-72),x0+7,y+25);
    ctx.fillStyle='#8a9268';ctx.font=(tiny?7:8)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(adminAuditDetailsSummary(row),rw-78),x0+7,y+rowH-8);
    ctx.textAlign='right';ctx.fillStyle='#bfe8ff';ctx.font='700 7px ui-monospace,Consolas,monospace';ctx.fillText('READ',x0+rw-8,y+rowH/2);
    auditRects.push({x:x0,y,w:rw,h:rowH,id:'audit:'+row.eventId,row});
    y+=rowH+gap;
  }
  ctx.restore();
  const vt=viewTop,vb=viewBottom,visible=auditRects.slice(0,rectStart);
  for(const r of auditRects.slice(rectStart)){
    const top=Math.max(vt,r.y),bottom=Math.min(vb,r.y+r.h);if(bottom>top)visible.push(Object.assign({},r,{y:top,h:bottom-top}));
  }
  auditRects=visible;
  if(auditScrollMax>0){
    const sx=x0+rw-4,sh=auditScrollViewport.h-6,thumbH=Math.max(20,sh*(auditScrollViewport.h/(auditScrollViewport.h+auditScrollMax))),
      thumbY=viewTop+3+(sh-thumbH)*(auditScroll/auditScrollMax);
    ctx.fillStyle='rgba(127,216,255,.12)';ctx.fillRect(sx,viewTop+3,2,sh);ctx.fillStyle='#7fd8ff';ctx.fillRect(sx-1,thumbY,4,thumbH);
  }
  const defs=[['newer','\u2039 NEWER',adminAuditPage>0,'#7fd8ff'],['older','OLDER \u203a',adminAuditHasMore,'#7fd8ff'],
    ['refresh','\u21BB REFRESH',!adminAuditLoading,'#a7c15e'],['close','CLOSE',true,'#d05548']];
  const footerStrip=adminControlStrip(px,pw,680,tiny?10:16),gap2=5,bw=(footerStrip.w-gap2*(defs.length-1))/defs.length,bh=27;let bx=footerStrip.x;
  for(const [id,label,enabled,col] of defs){
    const r={x:bx,y:footerY,w:bw,h:bh,id,enabled};auditRects.push(r);
    const hot=enabled&&mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=footerY&&mouse.y<=footerY+bh;
    ctx.fillStyle=!enabled?'rgba(255,255,255,.025)':hot?col:'rgba(255,255,255,.06)';ctx.fillRect(bx,footerY,bw,bh);
    ctx.strokeStyle=enabled?col:'#3d463c';ctx.strokeRect(bx+.5,footerY+.5,bw,bh);
    ctx.fillStyle=!enabled?'#5a5648':hot?'#101208':'#cdd6b0';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(bw<72?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(label,bw-5),bx+bw/2,footerY+bh/2);bx+=bw+gap2;
  }
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function adminAuditClick(){
  if(!isMainAdmin()){auditOpen=false;return;}
  for(const r of auditRects){
    if(mouse.x<r.x||mouse.x>r.x+r.w||mouse.y<r.y||mouse.y>r.y+r.h)continue;
    if(suggestionsTabClick(r.id))return;
    if(String(r.id).indexOf('audit_view:')===0){if(setAdminAuditView(String(r.id).slice(11)))void fetchAdminAuditLog(false);sfx('aim');return;}
    if(r.enabled===false){sfx('dry');return;}
    if(r.id==='close'){auditOpen=false;sfx('swap');return;}
    if(r.id==='refresh'){void fetchAdminAuditLog(true);sfx('swap');return;}
    if(r.id==='older'){void adminAuditOlder();sfx('aim');return;}
    if(r.id==='newer'){adminAuditNewer();sfx('aim');return;}
    if(r.row){openReader(adminAuditActionTitle(r.row.action).toUpperCase(),r.row.createdAt,adminAuditDetailsText(r.row),'main');sfx('swap');return;}
  }
}
function drawAiLearning(){
  if(!isMainAdmin()){aiLearningOpen=false;return;}
  if(!isMainAdmin()){ closeAiLearning(); return; }
  aiLearningRects=[];
  ctx.fillStyle='rgba(4,6,3,0.97)';ctx.fillRect(0,0,W,H);
  const tiny=W<520||H<430,pw=Math.min(920,W-12),ph=Math.min(650,H-10),px=W/2-pw/2,py=H/2-ph/2;
  ctx.fillStyle='#080f12';ctx.fillRect(px,py,pw,ph);ctx.strokeStyle='#7fd8ff';ctx.lineWidth=1.5;ctx.strokeRect(px+.5,py+.5,pw,ph);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#bfe8ff';ctx.font='700 '+(tiny?15:20)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('AI BOT MODELS',W/2,py+(tiny?18:25));
  ctx.fillStyle='#8a9268';ctx.font=(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('TACTICAL RELEASES · PLAYER DIFFICULTY IS SEPARATE · TESTS USE IMPOSSIBLE',pw-18),W/2,py+(tiny?34:44));

  const cardX=px+(tiny?6:14),cardW=pw-(tiny?12:28),headerY=py+(tiny?47:61),headerH=tiny?22:28,
    btnH=tiny?25:32,btnY=py+ph-btnH-(tiny?6:10),noticeH=tiny?48:58,noticeY=btnY-noticeH-(tiny?4:7),
    listY=headerY+headerH,gap=tiny?2:4,available=noticeY-listY-(tiny?4:8),rowH=Math.max(22,(available-gap*4)/5),
    modelW=cardW*(tiny?.22:.18),noteW=cardW*(tiny?.35:.42),testW=cardW*(tiny?.18:.17),bringW=cardW-modelW-noteW-testW,
    colX=[cardX,cardX+modelW,cardX+modelW+noteW,cardX+modelW+noteW+testW,cardX+cardW];
  ctx.fillStyle='rgba(127,216,255,.12)';ctx.fillRect(cardX,headerY,cardW,headerH);ctx.strokeStyle='#315568';ctx.lineWidth=1;ctx.strokeRect(cardX+.5,headerY+.5,cardW,headerH);
  const headers=['Model','What improved','Test Model','Bring Back Model'];
  ctx.textAlign='center';ctx.fillStyle='#bfe8ff';ctx.font='700 '+(tiny?7:8)+'px ui-monospace,Consolas,monospace';
  for(let i=0;i<headers.length;i++){
    if(i){ctx.strokeStyle='#315568';ctx.beginPath();ctx.moveTo(colX[i]+.5,headerY);ctx.lineTo(colX[i]+.5,headerY+headerH);ctx.stroke();}
    ctx.fillText(headers[i],(colX[i]+colX[i+1])/2,headerY+headerH/2);
  }
  BOT_MODEL_RELEASES.forEach((model,i)=>{
    const y=listY+i*(rowH+gap),selected=aiLearningSelectedModelId===model.id,live=activeBotModelId===model.id,
      training=typeof aiTrainingModelSummary==='function'?aiTrainingModelSummary(model.id):null,
      rowCol=live?'rgba(167,193,94,.13)':selected?'rgba(127,216,255,.10)':'rgba(255,255,255,.035)';
    ctx.fillStyle=rowCol;ctx.fillRect(cardX,y,cardW,rowH);ctx.strokeStyle=live?'#a7c15e':selected?'#7fd8ff':'#315568';ctx.lineWidth=live||selected?1.5:1;ctx.strokeRect(cardX+.5,y+.5,cardW,rowH);
    for(let c=1;c<4;c++){ctx.strokeStyle='#263d48';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(colX[c]+.5,y);ctx.lineTo(colX[c]+.5,y+rowH);ctx.stroke();}
    ctx.textAlign='left';ctx.fillStyle=live?'#a7c15e':selected?'#bfe8ff':'#e8d9a8';ctx.font='700 '+(tiny?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(model.name,modelW-(tiny?7:12)),cardX+(tiny?4:7),y+rowH*.38);
    ctx.fillStyle=live?'#a7c15e':'#65725d';ctx.font='700 '+(tiny?6:7)+'px ui-monospace,Consolas,monospace';
    const cloudGames=training&&typeof aiTrainingCompactNumber==='function'?aiTrainingCompactNumber(training.matches):'';
    ctx.fillText(fitLine((live?'LIVE NOW':'ARCHIVED')+(cloudGames?' · MATCH DATA '+cloudGames:''),modelW-(tiny?7:12)),cardX+(tiny?4:7),y+rowH*.70);
    ctx.fillStyle=selected?'#d7efff':'#9ca58b';ctx.font=(tiny?'7':'8')+'px ui-monospace,Consolas,monospace';ctx.textBaseline='top';
    wrapTextClamped(model.improved,colX[1]+(tiny?4:7),y+rowH/2-(tiny?7:8),noteW-(tiny?8:14),tiny?8:10,2);ctx.textBaseline='middle';

    const pad=tiny?3:6,bh=Math.max(20,rowH-(tiny?4:14)),by=y+(rowH-bh)/2,
      test={id:'model_test_'+model.id,modelId:model.id,x:colX[2]+pad,y:by,w:testW-pad*2,h:bh,enabled:true},
      restore={id:'model_restore_'+model.id,modelId:model.id,x:colX[3]+pad,y:by,w:bringW-pad*2,h:bh,enabled:!live&&!aiLearningRestoreBusyId};
    aiLearningRects.push(test,restore);
    const drawModelAction=(r,label,col)=>{
      const hot=r.enabled&&mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
      ctx.fillStyle=!r.enabled?'rgba(255,255,255,.025)':hot?col:'rgba(0,0,0,.36)';ctx.fillRect(r.x,r.y,r.w,r.h);
      ctx.strokeStyle=r.enabled?col:'#3d463c';ctx.lineWidth=1;ctx.strokeRect(r.x+.5,r.y+.5,r.w,r.h);
      ctx.fillStyle=!r.enabled?'#65725d':hot?'#101208':col;ctx.textAlign='center';ctx.font='700 '+(tiny?6:7)+'px ui-monospace,Consolas,monospace';ctx.fillText(label,r.x+r.w/2,r.y+r.h/2);
    };
    drawModelAction(test,'TEST MODEL','#7fd8ff');
    drawModelAction(restore,live?'LIVE NOW':aiLearningRestoreBusyId===model.id?'WORKING…':'BRING BACK','#e8b658');
  });

  ctx.fillStyle='rgba(232,182,88,.07)';ctx.fillRect(cardX,noticeY,cardW,noticeH);ctx.strokeStyle='#5b4c2a';ctx.strokeRect(cardX+.5,noticeY+.5,cardW,noticeH);
  ctx.textAlign='center';ctx.fillStyle='#e8b658';ctx.font='700 '+(tiny?6:8)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(aiLearningNotice||'Tests never deploy a model.',cardW-12),W/2,noticeY+noticeH*.32);
  ctx.fillStyle='#7f876e';ctx.font=(tiny?'6':'7')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(typeof aiTrainingAdminStatusText==='function'?aiTrainingAdminStatusText():'MATCH EVIDENCE · CLOUD UNAVAILABLE',cardW-12),W/2,noticeY+noticeH*.55);
  ctx.fillText(fitLine('BRING BACK REQUIRES CONFIRMATION · CHANGES FUTURE MATCHES ONLY · PLAYER RANKS NEVER CHANGE',cardW-12),W/2,noticeY+noticeH*.79);

  const closeW=Math.min(220,cardW),closeX=W/2-closeW/2,close={id:'model_close',x:closeX,y:btnY,w:closeW,h:btnH,enabled:!aiLearningRestoreBusyId};aiLearningRects.push(close);
  const closeHot=close.enabled&&mouse.x>=close.x&&mouse.x<=close.x+close.w&&mouse.y>=close.y&&mouse.y<=close.y+close.h;
  ctx.fillStyle=closeHot?'#d05548':'rgba(255,255,255,.05)';ctx.fillRect(close.x,close.y,close.w,close.h);ctx.strokeStyle=close.enabled?'#d05548':'#3d463c';ctx.strokeRect(close.x+.5,close.y+.5,close.w,close.h);
  ctx.fillStyle=closeHot?'#101208':close.enabled?'#e8d9a8':'#65725d';ctx.textAlign='center';ctx.font='700 '+(tiny?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText('CLOSE',W/2,btnY+btnH/2);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function aiLearningClick(){
  if(!isMainAdmin()){ closeAiLearning(); return; }
  for(const r of aiLearningRects){
    if(!r.enabled||mouse.x<r.x||mouse.x>r.x+r.w||mouse.y<r.y||mouse.y>r.y+r.h) continue;
    if(String(r.id).indexOf('model_test_')===0){aiLearningSelectedModelId=r.modelId;startAiLearningBotTest(r.modelId);}
    else if(String(r.id).indexOf('model_restore_')===0){aiLearningSelectedModelId=r.modelId;void confirmAiLearningModelRestore(r.modelId);}
    else if(r.id==='model_close')closeAiLearning();
    sfx('swap');return;
  }
}
function drawAdminPanel(){
  if(!isAdmin()){adminPanelOpen=false;return;}
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(430,W-30), ph=Math.min(500,H-24), px=W/2-pw/2, py=H/2-ph/2;
  const compactAdmin=ph<390;
  ctx.fillStyle='#0e0a0a'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e0a8a0'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2699 ADMIN TOOLS', W/2, py+(compactAdmin?20:26));
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText(isMainAdmin()?'MAIN ADMIN \u00b7 full access':isCoAdmin()?'CO-ADMIN \u00b7 shared powers':'TESTER \u00b7 test mode only', W/2, py+(compactAdmin?34:42));
  ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('test mode taints the run \u2014 it will not be ranked', W/2, py+(compactAdmin?47:56));

  adminPanelRects=[];
  const gap=compactAdmin?2:7, x0=px+18, rw=pw-36;
  let y=py+(compactAdmin?56:68);
  const actionBtn=(id,label,accent)=>{
    const h=compactAdmin?22:28;
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
    const h=compactAdmin?22:28;
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

  // Testers deliberately skip reports, player lookup, posts, logs, and every
  // editor. Co-admins keep their existing shared staff tools.
  if(isCoAdmin() && !isMainAdmin()) actionBtn('staffreport','\u26A0 REPORT A PROBLEM \u2014 send to the mains');
  if(canPostUpdates())actionBtn('post','\uD83D\uDCE2 POST UPDATE \u2014 Home + every Inbox'+(isMainAdmin()?'':' (needs approval)'));
  if(canUsePlayerTools())actionBtn('players','\uD83D\uDC65 PLAYERS \u2014 look up'+(isMainAdmin()?' \u00b7 edit \u00b7 ban':' \u00b7 view only'));
  if(isMainAdmin()) actionBtn('promos','\uD83C\uDF81 PROMO CODES \u2014 create \u00b7 edit \u00b7 expire');

  toggle('testmode','\uD83E\uDDEA TEST MODE \u2014 all weapons \u00b7 no gems', testMode, true);
  if(canViewWeaponStorage())actionBtn('storage', isMainAdmin() ? '\u2699 WEAPON EDITOR \u2014 stats \u00b7 price \u00b7 publish'
                                     : '\u2699 WEAPON EDITOR \u2014 view every weapon');
  if(isMainAdmin())actionBtn('requests','\uD83D\uDCCB REQUESTS \u2014 edits \u00b7 updates \u00b7 appeals');

  const cbw=140, cbh=compactAdmin?24:28, cbx=W/2-cbw/2, cby=py+ph-cbh-8;
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
      if(id==='post'){ if(canPostUpdates())openPost();else sfx('dry'); return; }
      if(id==='promos'){ adminPanelOpen=false; promoAdminOpen=true; fetchPromos(); sfx('swap'); return; }
      if(id==='players'){ if(!canUsePlayerTools()){sfx('dry');return;}adminPanelOpen=false; playersOpen=true; playersTab='lookup'; fetchPlayersData(); if(isMainAdmin()) fetchScoreReqs(); sfx('swap'); return; }
      if(id==='testmode'){ setTestMode(!testMode); sfx('swap'); return; }
      if(id==='storage'){ if(!canViewWeaponStorage()){sfx('dry');return;}adminPanelOpen=false; storageOpen=true; sfx('swap'); return; }
      if(id==='requests'){openAdminRequests();sfx('swap');return;}
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
  const lineClear=t=>typeof arenaMeleeLineClear!=='function'||arenaMeleeLineClear(x,y,t.x,t.y);
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()){
    return partyCpuMatch.bots.filter(t=>t.team==='B'&&t.hp>0&&lineClear(t)&&
      dist2(t.x,t.y,x,y)<(radius+(t.r||15))*(radius+(t.r||15)));
  }
  const t=arena&&arena.opponent;
  return t&&t.hp>0&&lineClear(t)&&dist2(t.x,t.y,x,y)<(radius+(t.r||15))*(radius+(t.r||15))?[t]:[];
}
function arenaMeleeSpecialHit(target,dmg,kind,sourceX,sourceY){
  if(!target||practiceMode!=='arena'||!arenaCanAct()) return false;
  const x=Number.isFinite(+sourceX)?+sourceX:player.x,y=Number.isFinite(+sourceY)?+sourceY:player.y;
  if(typeof arenaMeleeLineClear==='function'&&!arenaMeleeLineClear(x,y,target.x,target.y)) return false;
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return partyCpuHitBot(target,dmg,kind);
  arenaHitOpponent(dmg,kind); return true;
}
