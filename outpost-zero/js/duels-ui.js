"use strict";
let duelMenuRects=[];
function duelUiButton(list,id,label,x,y,w,h,enabled=true,extra={}){
  const hot=enabled&&mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
  list.push({id,x,y,w,h,enabled,...extra});
  ctx.fillStyle=hot?'#bfa8ff':'rgba(0,0,0,.5)';ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=enabled?'#bfa8ff':'#45453e';ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=enabled?(hot?'#101208':'#e8d9a8'):'#66665d';
  ctx.font='700 '+(H<430?10:13)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(label,w-12),x+w/2,y+h/2);
}
function drawDuelRanked(){
  selBg();rankedRects=[];leaderboardRowRects=[];
  const small=H<460,w=Math.min(700,W-24),x=(W-w)/2,gap=8,top=small?8:18;
  ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#e8b658';ctx.font='700 '+(small?23:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('RANKED · RANK + ELO',W/2,top);
  ctx.fillStyle='#a99bb8';ctx.font=(small?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('BETA · 1v1 AND 2v2 ONLY · SEPARATE RATINGS',W/2,top+(small?30:44));
  const tabY=top+(small?45:64),tabH=small?28:36,half=(w-gap)/2;
  for(const [i,mode] of ['1v1','2v2'].entries())duelUiButton(rankedRects,'rank_view',mode+' RANKINGS',x+i*(half+gap),tabY,half,tabH,true,{mode});
  const mine=duelService.profile&&duelService.profile[duelService.rankedMode==='1v1'?'one':'two'];
  const stats=mine?[['RANK',mine.rank],['ELO',String(mine.elo)],['WINS / LOSSES',mine.wins+' / '+mine.losses]]:
    [['RANK',authUser?'LOADING':'SIGN IN'],['ELO','—'],['WINS / LOSSES','—']];
  const statsY=tabY+tabH+gap,sh=small?46:66,sw=(w-gap*2)/3;
  for(let i=0;i<stats.length;i++){
    const sx=x+i*(sw+gap);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(sx,statsY,sw,sh);ctx.strokeStyle='#6f6238';ctx.strokeRect(sx+.5,statsY+.5,sw-1,sh-1);
    ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#8a9268';ctx.font='700 '+(small?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(stats[i][0],sx+sw/2,statsY+7);
    ctx.fillStyle='#e8d9a8';ctx.font='700 '+(small?12:19)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(String(stats[i][1]),sw-8),sx+sw/2,statsY+(small?24:32));
  }
  const buttonsH=small?33:43,backH=30,buttonsY=H-backH-buttonsH-52,listY=statsY+sh+gap,listH=Math.max(28,buttonsY-listY-10);
  ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(x,listY,w,listH);ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e8b658';ctx.font='700 '+(small?8:11)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(duelService.rankedMode+' LEADERBOARD',x+9,listY+6);
  const rowH=Math.max(15,Math.min(25,(listH-24)/5));
  duelService.board.slice(0,5).forEach((row,i)=>{
    const y=listY+23+i*rowH;if(y+rowH>listY+listH)return;
    ctx.textAlign='left';ctx.fillStyle='#cdd6b0';ctx.fillText(fitLine((i+1)+'. '+row.username,w*.58),x+9,y);
    ctx.textAlign='right';ctx.fillText(row.rank+' · '+row.elo,x+w-9,y);
    leaderboardRowRects.push({user_id:row.user_id,name:row.username,x:x+4,y,w:w-8,h:rowH});
  });
  if(!duelService.board.length){ctx.textAlign='center';ctx.fillStyle='#8a9268';ctx.fillText(duelService.rankedLoading?'LOADING…':'NO COMPLETED RANKED MATCHES YET',W/2,listY+Math.min(listH-12,29));}
  for(const [i,mode] of ['1v1','2v2'].entries())duelUiButton(rankedRects,'rank_queue','PLAY RANKED '+mode,x+i*(half+gap),buttonsY,half,buttonsH,!!authUser&&!duelService.busy,{mode:'ranked'+mode});
  if(!authUser)duelUiButton(rankedRects,'signin','SIGN IN',x,buttonsY,w,buttonsH,true);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#a99bb8';ctx.font=(small?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(duelService.status||'ALL PLAYERS MUST AGREE ON THE RESULT · DISPUTES DO NOT CHANGE ELO',w),W/2,buttonsY+buttonsH+12);
  backRect={x,y:H-backH-9,w:150,h:backH};duelUiButton([], 'back','‹ PLAY MENU',x,backRect.y,150,backH);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawMultideviceMenu(){
  selBg();duelMenuRects=[];
  const active=typeof multidevice!=='undefined'?multidevice:null,match=duelService.match,
    ended=active&&['match_end','aborted'].includes(active.phase),small=H<460,w=Math.min(720,W-24),x=(W-w)/2;
  ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#bfa8ff';ctx.font='700 '+(small?23:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText((duelService.ranked?'RANKED ':'')+(match?match.mode:duelService.mode)+' · '+(ended?'RESULT':'MULTI-DEVICE'),W/2,small?10:20);
  const message=active&&active.status?(ended&&active.ranked?active.status+' · '+duelService.status:active.status):duelService.status;
  ctx.fillStyle='#a99bb8';ctx.font=(small?9:12)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(message||'CONNECTING…',w),W/2,small?45:70);
  const roster=match&&match.roster||[],rowH=small?38:55,top=small?74:108;
  roster.forEach((person,i)=>{
    const y=top+i*rowH;if(y+rowH>H-105)return;
    ctx.fillStyle='rgba(0,0,0,.48)';ctx.fillRect(x,y,w,rowH-5);ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#e8d9a8';ctx.font='700 '+(small?11:15)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(person.name+(person.id===duelServiceUser()?' (YOU)':''),w*.65),x+12,y+(rowH-5)/2);
    ctx.textAlign='right';ctx.fillStyle='#bfa8ff';ctx.fillText(ended?'TEAM '+person.team+' · '+((active.scores||{})[person.team]||0):person.accepted?'READY':'CHOOSING LOADOUT',x+w-12,y+(rowH-5)/2);
  });
  if(!roster.length){ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#cdd6b0';ctx.fillText(duelService.queue?'SEARCHING FOR PLAYERS…':'NO ACTIVE MATCH',W/2,H*.45);}
  const bh=small?34:44,y=H-bh-18;
  duelUiButton(duelMenuRects,'cancel',ended?'RETURN TO MENU':'CANCEL / LEAVE',x,y,w,bh,!duelService.busy);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawMultideviceActors(){
  if(typeof isMultideviceArena!=='function'||!isMultideviceArena())return;
  const mine=multidevice.actors[multidevice.selfId];
  for(const e of Object.values(multidevice.actors)){
    if(e.id===multidevice.selfId||e.hp<=0)continue;
    const ally=mine&&mine.team===e.team,a=e.angle||0,r=e.r||15,w=WEAPONS[e.cur]||WEAPONS.ar,
      parry=now<(e.parryUntil||0)&&e.loadout&&e.loadout.melee==='twinsai';
    ctx.fillStyle=ally?'#7fd8ff':'#d05548';ctx.beginPath();ctx.arc(e.x,e.y,r,0,TAU);ctx.fill();ctx.strokeStyle=ally?'#cdeeff':'#ff8b80';ctx.lineWidth=2/zoom;ctx.stroke();
    if(parry)drawTwinSaiParryCircle(e.x,e.y,r,e.parryUntil,now,!ally);
    if(parry||w.melee){
      if(!(e.cur==='bdaggers'&&e.meleeFxKey==='bdaggers'&&now<e.meleeFxUntil)){
        ctx.save();ctx.translate(e.x,e.y);ctx.rotate(a);drawMeleeWeaponSilhouette(parry?'twinsai':e.cur,!ally,parry);ctx.restore();
      }
    }else{
      const len=Math.min(38,w.len||24);ctx.strokeStyle=weaponColor(e.cur,ally?'#bde7ff':'#e0a8a0');ctx.lineWidth=5/zoom;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*6,e.y+Math.sin(a)*6);ctx.lineTo(e.x+Math.cos(a)*(len+8),e.y+Math.sin(a)*(len+8));ctx.stroke();
    }
    drawMeleeAbilityVisual(e,now,!ally,false);
    const dur=e.swingDur||130,progress=(now-(e.swingT||0))/dur;
    if(e.swingT&&progress>=0&&progress<1){ctx.strokeStyle=ally?'#7fd8ff':'#ff3b34';ctx.lineWidth=4/zoom;drawMeleeSwingPath(e.x,e.y,e.swingA||a,e.swingArc||w.arc||.5,e.swingR||w.range||55,progress);}
    ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font='700 9px ui-monospace,Consolas,monospace';ctx.fillStyle=ally?'#cdeeff':'#ffd9d2';ctx.fillText(String(e.name||'PLAYER').slice(0,16),e.x,e.y-r-15);
    if(ally||multidevice.phase==='round_end'){ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(e.x-28,e.y-r-12,56,5);ctx.fillStyle=ally?'#7fd8ff':'#d05548';ctx.fillRect(e.x-28,e.y-r-12,56*clamp(e.hp/ARENA_HP,0,1),5);}
  }
  drawRemoteShotVisuals(multidevice.visualShots.filter(b=>b.hostile===false));
  drawRemoteShotVisuals(multidevice.visualFireworks.filter(b=>b.hostile===false));
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawMultideviceHud(pad){
  const teams=[...new Set(multidevice.roster.map(p=>p.team))],clock=Date.now(),countdown=multidevice.phase==='countdown',
    left=Math.ceil(((countdown?arena.roundStartAt:arena.roundEndAt)-clock)/1000),scores=teams.map(team=>'TEAM '+team+' '+(multidevice.scores[team]||0)).join('  —  ');
  ctx.textAlign='center';ctx.fillStyle='#bfa8ff';ctx.font='700 '+clamp(Math.floor(W/30),13,24)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(scores,W-110),W/2,pad);
  ctx.fillStyle='#cdd6b0';ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('ROUND '+arena.round+' · FIRST TO 5 · '+(countdown?'STARTS IN ':multidevice.phase==='fight'?'TIME ':'ROUND COMPLETE ')+(multidevice.phase==='fight'||countdown?Math.max(0,left)+'s':''),W-36),W/2,pad+32);
  ctx.textAlign='left';
}
