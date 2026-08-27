"use strict";

/* ---------------- online arena: signed-in casual 1v1 ----------------
   Supabase Presence/Broadcast carries the live match. This first version is
   intentionally CASUAL: ranked ratings need a trusted game server, not a
   browser that can be edited by either player. */
const ARENA_FORFEIT_GRACE_MS=5000;
function arenaLoadoutReady(){ return !!(loadout.primary&&loadout.secondary&&loadout.melee); }
function arenaGuard(){
  if(!sb||!authUser){
    arenaAuthPending=true; $('aguest').style.display='none';
    $('authmsg').textContent='Sign in is required for Online multiplayer on different devices.';
    $('authwrap').style.display='flex'; sfx('dry'); return false;
  }
  if(!arenaLoadoutReady()){
    arena.status='Pick a PRIMARY, SIDEARM, and MELEE on the loadout screen first.'; sfx('dry'); return false;
  }
  return true;
}
function arenaPresenceList(ch){
  if(!ch||typeof ch.presenceState!=='function') return [];
  const raw=ch.presenceState()||{}, byId=new Map();
  for(const list of Object.values(raw)) for(const m of (Array.isArray(list)?list:[list])){
    if(!m||!m.id) continue;
    const old=byId.get(m.id);
    if(!old || +(m.joined||0)<+(old.joined||0)) byId.set(m.id,m);
  }
  return [...byId.values()].sort((a,b)=>(+(a.joined||0)-+(b.joined||0))||String(a.id).localeCompare(String(b.id)));
}
function arenaPairCode(ids){
  const s=[...ids].sort().join('|'); let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return ('Q'+(h>>>0).toString(36).toUpperCase().padStart(7,'0')).slice(0,6);
}
function randomArenaCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out='';
  if(globalThis.crypto&&crypto.getRandomValues){ const a=new Uint32Array(6); crypto.getRandomValues(a); for(const n of a) out+=chars[n%chars.length]; }
  else for(let i=0;i<6;i++) out+=chars[(Math.random()*chars.length)|0];
  return out;
}
function arenaMapValid(id){ return ARENA_MAP_IDS.includes(String(id||'')); }
function arenaMapName(id){ return (ARENA_MAPS.find(m=>m.id===id)||ARENA_MAPS[0]).name; }
function arenaMapHash(text){
  let h=2166136261;
  for(const c of String(text||'')){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); }
  return h>>>0;
}
function arenaIsLocalMapVote(){
  return isBotArena()||(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2());
}
function arenaLocalMapVoterId(){
  if(isBotArena()) return LOCAL_DUEL_PLAYER;
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) return LOCAL_CPU2V2_PLAYER;
  return authUser&&String(authUser.id);
}
function arenaOtherMapVoterId(){
  if(isBotArena()) return LOCAL_DUEL_BOT;
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) return LOCAL_CPU2V2_CPU_TEAM;
  return arena&&arena.opponent&&String(arena.opponent.id);
}
function arenaMapVoterIds(){
  if(isBotArena()) return [LOCAL_DUEL_PLAYER,LOCAL_DUEL_BOT];
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) return [LOCAL_CPU2V2_PLAYER,LOCAL_CPU2V2_CPU_TEAM];
  if(!authUser||!arena.opponent) return [];
  return [String(authUser.id),String(arena.opponent.id)].sort();
}
/* Deterministic weighted draw over one sanitized vote per eligible player.
   The vote nonce is committed before voting opens, so retries and packet order
   cannot change the result. Counts are the weights: 2 Arena votes and 1
   Dimension vote give Arena exactly two of the three ticket positions. */
function arenaResolveMapVote(votes=arena.mapVotes,voteId=arena.mapVoteId,voterIds=arenaMapVoterIds()){
  const ids=[...new Set((voterIds||[]).map(String))].sort();
  const clean={}, counts=Object.fromEntries(ARENA_MAP_IDS.map(id=>[id,0]));
  for(const id of ids){
    const mapId=arenaMapValid(votes&&votes[id])?String(votes[id]):'arena';
    clean[id]=mapId; counts[mapId]++;
  }
  // Keep the helper useful to tests/future party votes even without an
  // explicit roster, while normal 1v1 always supplies its exact two IDs.
  if(!ids.length&&votes) for(const id of Object.keys(votes).sort()){
    if(!arenaMapValid(votes[id])) continue;
    ids.push(id); clean[id]=String(votes[id]); counts[clean[id]]++;
  }
  if(!ids.length){ ids.push('default'); clean.default='arena'; counts.arena=1; }
  const ballot=ids.map(id=>id+'='+clean[id]).join('|');
  const draw=arenaMapHash(String(voteId||'arena-vote')+'|'+ballot), total=ids.length;
  let ticket=Math.floor((draw/4294967296)*total), mapId='arena';
  for(const id of ARENA_MAP_IDS){
    if(ticket<counts[id]){ mapId=id; break; }
    ticket-=counts[id];
  }
  return {voteId:String(voteId||''),mapId,counts,votes:clean,voterIds:ids,draw,total,
          resultId:String(voteId||'')+':'+draw.toString(36)+':'+mapId};
}
function arenaResetMapVote(mapId='arena'){
  arena.mapId=arenaMapValid(mapId)?mapId:'arena'; arena.mapVotePhase='idle'; arena.mapVoteId='';
  arena.mapVoteDeadline=0; arena.mapVotes={}; arena.mapVoteResult=null; arena.mapVoteAcks=new Set();
  arena.mapVoteRevealUntil=0; arena.mapVoteSyncAt=0; arena.mapVoteStartPending=false;
}
function arenaMapVotePacket(clock=Date.now()){
  return {voteId:arena.mapVoteId,duration:ARENA_MAP_VOTE_MS,
          remainingMs:clamp(arena.mapVoteDeadline-clock,0,ARENA_MAP_VOTE_MS),votes:Object.assign({},arena.mapVotes),
          scores:Object.assign({},arena.scores)};
}
function arenaMapVoteResultPacket(clock=Date.now()){
  const r=arena.mapVoteResult;
  if(!r) return null;
  return Object.assign({},r,{votes:Object.assign({},r.votes),counts:Object.assign({},r.counts),
    voterIds:r.voterIds.slice(),revealMs:clamp(arena.mapVoteRevealUntil-clock,0,ARENA_MAP_REVEAL_MS)});
}
/* Start one vote per first-to-five match. Subsequent rounds retain mapId;
   a mutually accepted rematch receives a fresh nonce and another vote. */
function arenaStartMapVote(){
  const local=arenaIsLocalMapVote(), host=local||!!(authUser&&authUser.id===arena.hostId);
  if((!local&&!arena.opponent)||!host) return false;
  const clock=local?now:Date.now(), ids=arenaMapVoterIds();
  if(ids.length!==2) return false;
  arenaResetMapVote('arena');
  arena.mapVotePhase='voting'; arena.mapVoteId=[arena.room||'OFFLINE',arena.matchEpoch,randomArenaCode()].join(':');
  arena.mapVoteDeadline=clock+ARENA_MAP_VOTE_MS; arena.mapVotes=Object.fromEntries(ids.map(id=>[id,'arena']));
  if(local){
    // The other side commits a deterministic preference as soon as voting
    // opens; the human still has the full five seconds to change their team's.
    const otherId=arenaOtherMapVoterId(), botPick=ARENA_MAP_IDS[arenaMapHash(arena.mapVoteId+'|cpu-team')%ARENA_MAP_IDS.length];
    arena.mapVotes[otherId]=botPick;
  }
  arena.phase='map_vote'; arena.status='Vote for a map — 5 seconds.'; arena.mapVoteSyncAt=0;
  if(local){ state='select'; selPage='arena'; menuOpen=false; }
  else { arenaSend('map_vote_open',arenaMapVotePacket(clock)); arena.mapVoteSyncAt=clock+500; }
  return true;
}
function arenaCastMapVote(mapId){
  mapId=String(mapId||'');
  if(!arenaMapValid(mapId)||arena.mapVotePhase!=='voting') return false;
  const local=arenaIsLocalMapVote(), clock=local?now:Date.now();
  if(clock>=arena.mapVoteDeadline) return false;
  const me=arenaLocalMapVoterId();
  if(!me||!Object.prototype.hasOwnProperty.call(arena.mapVotes,me)) return false;
  arena.mapVotes[me]=mapId; arena.status='Voted for '+arenaMapName(mapId)+'. You can change it until time expires.';
  if(!local){
    arenaSend('map_vote',{voteId:arena.mapVoteId,mapId});
    if(authUser&&authUser.id===arena.hostId) arena.mapVoteSyncAt=0;
  }
  sfx('swap'); return true;
}
function arenaApplyMapVoteOpen(p){
  if(!p||p.from!==arena.hostId||!p.voteId) return false;
  const epoch=Math.floor(+p.epoch||0);
  if(epoch<arena.matchEpoch) return false;
  if(epoch>arena.matchEpoch){
    arena.matchEpoch=epoch; arena.round=0; arena.scores=Object.assign({},p.scores||{});
    arena.roundStartAt=0; arena.roundEndAt=0; arena.nextRoundAt=0; arena.roundResolved=false; arena.active=false;
    arena.rematchVotes=new Set(); arena.seenHits=new Set(); arena.hitSeq=0; arena.winRecorded=false;
    arena.departureAnnounced=''; arena.departurePromise=null; arena.forfeitResultId=''; arena.forfeitPacket=null;
    arenaResetMapVote('arena');
  }
  if(arena.mapVoteId&&arena.mapVoteId!==String(p.voteId)) return false;
  if(arena.mapVotePhase==='reveal'||arena.mapVotePhase==='locked') return false;
  const ids=arenaMapVoterIds(), incoming={}, oldLocal=arena.mapVotes&&arena.mapVotes[String(authUser.id)];
  for(const id of ids) incoming[id]=arenaMapValid(p.votes&&p.votes[id])?String(p.votes[id]):'arena';
  if(arenaMapValid(oldLocal)) incoming[String(authUser.id)]=oldLocal;
  arena.mapVoteId=String(p.voteId); arena.mapVotes=incoming; arena.mapVotePhase='voting'; arena.phase='map_vote';
  arena.mapVoteDeadline=Date.now()+clamp(+p.remainingMs||0,0,ARENA_MAP_VOTE_MS);
  arena.status='Vote for a map — '+Math.max(1,Math.ceil((arena.mapVoteDeadline-Date.now())/1000))+' seconds.';
  // Repeating the current ballot makes a dropped first vote harmless.
  arenaSend('map_vote',{voteId:arena.mapVoteId,mapId:incoming[String(authUser.id)]});
  return true;
}
function arenaApplyMapVoteResult(p){
  if(!p||p.from!==arena.hostId||Math.floor(+p.epoch||0)!==arena.matchEpoch||String(p.voteId||'')!==arena.mapVoteId) return false;
  const expectedIds=arenaMapVoterIds(), gotIds=Array.isArray(p.voterIds)?p.voterIds.map(String).sort():[];
  if(expectedIds.join('|')!==gotIds.join('|')) return false;
  const expected=arenaResolveMapVote(p.votes,p.voteId,gotIds);
  if(expected.mapId!==p.mapId||expected.draw!==(p.draw>>>0)||expected.resultId!==p.resultId) return false;
  if(arena.mapVoteResult&&arena.mapVoteResult.resultId!==expected.resultId) return false;
  if(arena.mapVotePhase==='locked'){
    if(authUser.id!==arena.hostId) arenaSend('map_vote_ack',{voteId:arena.mapVoteId,resultId:expected.resultId});
    return true;
  }
  arena.mapVotes=Object.assign({},expected.votes); arena.mapVoteResult=expected; arena.mapId=expected.mapId;
  arena.mapVotePhase='reveal'; arena.phase='map_reveal';
  arena.mapVoteRevealUntil=Date.now()+clamp(+p.revealMs||0,0,ARENA_MAP_REVEAL_MS);
  arena.mapVoteAcks.add(String(authUser.id)); arena.status=arenaMapName(arena.mapId)+' selected.';
  if(authUser.id!==arena.hostId) arenaSend('map_vote_ack',{voteId:arena.mapVoteId,resultId:expected.resultId});
  return true;
}
function arenaHostResolveMapVote(){
  if(!authUser||authUser.id!==arena.hostId||arena.mapVotePhase!=='voting') return false;
  const result=arenaResolveMapVote(arena.mapVotes,arena.mapVoteId,arenaMapVoterIds()), clock=Date.now();
  arena.mapVoteResult=result; arena.mapVoteRevealUntil=clock+ARENA_MAP_REVEAL_MS;
  const packet=Object.assign({},result,{from:authUser.id,room:arena.room,epoch:arena.matchEpoch,round:arena.round,revealMs:ARENA_MAP_REVEAL_MS});
  arenaApplyMapVoteResult(packet); arenaSend('map_vote_result',packet); arena.mapVoteSyncAt=clock+450;
  return true;
}
function arenaLocalResolveMapVote(){
  if(!arenaIsLocalMapVote()||arena.mapVotePhase!=='voting') return false;
  const result=arenaResolveMapVote(arena.mapVotes,arena.mapVoteId,arenaMapVoterIds());
  arena.mapVoteResult=result; arena.mapVotes=Object.assign({},result.votes); arena.mapId=result.mapId;
  arena.mapVotePhase='reveal'; arena.phase='map_reveal'; arena.mapVoteRevealUntil=now+ARENA_MAP_REVEAL_MS;
  arena.status=arenaMapName(arena.mapId)+' selected.'; return true;
}
function arenaMapVoteTick(){
  if(!arena||arena.networkHold||!['voting','reveal'].includes(arena.mapVotePhase)) return;
  const local=arenaIsLocalMapVote(), clock=local?now:Date.now();
  if(arena.mapVotePhase==='voting'){
    if(clock>=arena.mapVoteDeadline){
      if(local) arenaLocalResolveMapVote();
      else if(authUser&&authUser.id===arena.hostId) arenaHostResolveMapVote();
      return;
    }
    if(local) return;
    if(clock>=arena.mapVoteSyncAt){
      arena.mapVoteSyncAt=clock+500;
      if(authUser&&authUser.id===arena.hostId) arenaSend('map_vote_open',arenaMapVotePacket(clock));
      else if(authUser&&arena.mapVotes[authUser.id]) arenaSend('map_vote',{voteId:arena.mapVoteId,mapId:arena.mapVotes[authUser.id]});
    }
    return;
  }
  if(local){
    if(clock>=arena.mapVoteRevealUntil){
      arena.mapVotePhase='locked';
      if(isBotArena()) arenaBotStartRound();
      else if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) offlineCpu2v2BeginRound();
    }
    return;
  }
  if(clock>=arena.mapVoteSyncAt){
    arena.mapVoteSyncAt=clock+450;
    if(authUser&&authUser.id===arena.hostId){
      const packet=arenaMapVoteResultPacket(clock); if(packet) arenaSend('map_vote_result',packet);
    } else if(authUser&&arena.mapVoteResult){
      arenaSend('map_vote_ack',{voteId:arena.mapVoteId,resultId:arena.mapVoteResult.resultId});
    }
  }
  if(authUser&&authUser.id===arena.hostId&&arena.opponent&&arena.mapVoteResult&&
     arena.mapVoteAcks.has(String(authUser.id))&&arena.mapVoteAcks.has(String(arena.opponent.id))&&
     clock>=arena.mapVoteRevealUntil&&!arena.mapVoteStartPending){
    arena.mapVoteStartPending=true; arena.mapVotePhase='locked'; arenaHostStartRound();
  }
}
function arenaDropChannel(ch){
  if(!ch||!sb) return;
  try{ ch.untrack(); }catch(e){}
  try{ sb.removeChannel(ch); }catch(e){}
}
function arenaSend(event,payload){
  if(!arena.matchChannel||!authUser) return;
  const body=Object.assign({from:authUser.id,room:arena.room,epoch:arena.matchEpoch,round:arena.round},payload||{});
  try{ return arena.matchChannel.send({type:'broadcast',event,payload:body}); }catch(e){ return null; }
}
const REMOTE_SHOT_QUEUE_MAX=300, REMOTE_SHOT_SEEN_MAX=500;
function remoteShotWeaponOwned(loadout,weaponId){
  const id=String(weaponId||''),w=WEAPONS[id];
  if(!w||w.melee||w.firework||!loadout) return false;
  return [loadout.primary,loadout.secondary].some(k=>String(k||'')===id);
}
function remoteShotIdValid(id,owner,epoch,round){
  const value=String(id||''); if(!value||value.length>120)return false;
  const prefix=String(owner)+':'+Math.floor(+epoch||0)+':'+Math.floor(+round||0)+':shot:';
  if(!value.startsWith(prefix))return false;
  const seq=value.slice(prefix.length);
  return /^\d{1,10}$/.test(seq)&&+seq>0;
}
function remoteShotRemember(seen,id){
  if(!(seen instanceof Set))return false;
  if(seen.has(id))return false;
  seen.add(id);
  if(seen.size>REMOTE_SHOT_SEEN_MAX){
    const keep=[...seen].slice(-Math.floor(REMOTE_SHOT_SEEN_MAX/2));seen.clear();for(const value of keep)seen.add(value);
  }
  return true;
}
function remoteShotPortalOriginValid(packet,sender,x,y){
  if(activeArenaMapId()!=='dimension'||typeof activeArenaPortals!=='function')return false;
  const oldSeq=Math.max(0,Math.floor(+sender.portalSeq||0)),seq=+packet.portalSeq;
  if(!Number.isSafeInteger(seq)||seq!==oldSeq+1)return false;
  const portals=activeArenaPortals(),exit=portals.find(p=>Math.hypot(x-p.x,y-p.y)<=p.r+110);
  if(!exit)return false;
  const entry=portals.find(p=>p.id===exit.pair);if(!entry)return false;
  const positions=[[+sender.x,+sender.y],[+sender.tx,+sender.ty]].filter(v=>v.every(Number.isFinite));
  return positions.some(v=>Math.hypot(v[0]-entry.x,v[1]-entry.y)<=entry.r+180);
}
function remoteShotBuild(packet,sender,loadout){
  const weaponId=String(packet&&packet.weapon||''),w=WEAPONS[weaponId];
  if(!remoteShotWeaponOwned(loadout,weaponId)||!Array.isArray(packet.angles))return null;
  const pelletCap=Math.min(16,Math.max(1,Math.floor(+w.pellets||1)));
  if(packet.angles.length<1||packet.angles.length>pelletCap)return null;
  const x=+packet.x,y=+packet.y;
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const bounds=activeArenaBounds();
  if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return null;
  const sx=Number.isFinite(+sender.tx)?+sender.tx:+sender.x,sy=Number.isFinite(+sender.ty)?+sender.ty:+sender.y;
  const nearCurrent=Number.isFinite(+sender.x)&&Number.isFinite(+sender.y)&&Math.hypot(x-sender.x,y-sender.y)<=180;
  const nearTarget=Number.isFinite(sx)&&Number.isFinite(sy)&&Math.hypot(x-sx,y-sy)<=180;
  if(!nearCurrent&&!nearTarget&&!remoteShotPortalOriginValid(packet,sender,x,y))return null;
  const angles=[];
  for(const raw of packet.angles){
    const a=+raw;if(!Number.isFinite(a)||Math.abs(a)>TAU*1000)return null;angles.push(Math.atan2(Math.sin(a),Math.cos(a)));
  }
  const speed=weaponBulletSpeed(weaponId),life=weaponBulletLife(weaponId,w.range>2000?6000:1200);
  if(!Number.isFinite(speed)||speed<=0||speed>40||!Number.isFinite(life)||life<=0||life>7000)return null;
  return angles.map(a=>({x,y,ox:x,oy:y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life,dist:0,
    bounce:Math.max(0,Math.min(8,Math.floor(+w.bounce||0))),wv:!!w.wave,ba:a,
    wamp:w.wave?24*(1+0.5*Math.sin(now/700)):0,wk:w.wave?0.05*(1+0.4*Math.sin(now/1100+2)):0,
    phaseWalls:Math.max(0,Math.min(2,Math.floor(+w.phaseWalls||0))),phaseWallActive:false,
    gimmickId:w.gimmick&&typeof w.gimmick.id==='string'?w.gimmick.id:'',
    col:weaponColor(weaponId,w.tracer||null),weapon:weaponId,ownerId:String(packet.from||'')}));
}
function remoteShotPacketFromBullets(id,weaponId,spawned){
  if(!Array.isArray(spawned)||!spawned.length)return null;
  const first=spawned[0],angles=[];
  if(!first||!Number.isFinite(+first.x)||!Number.isFinite(+first.y))return null;
  for(const b of spawned.slice(0,16)){
    if(!b||!Number.isFinite(+b.vx)||!Number.isFinite(+b.vy)||Math.hypot(+b.vx,+b.vy)<=0)return null;
    angles.push(Math.atan2(+b.vy,+b.vx));
  }
  return {id:String(id),weapon:String(weaponId||''),x:+first.x,y:+first.y,angles};
}
function arenaBroadcastShot(weaponId,spawned){
  if(!arena||!authUser||!arena.matchChannel||!arena.opponent||arena.phase!=='fight'||!arenaCanAct()||
     isBotArena()||(typeof isCpuTeamArena==='function'&&isCpuTeamArena())||!remoteShotWeaponOwned(loadout,weaponId))return false;
  const id=String(authUser.id)+':'+arena.matchEpoch+':'+arena.round+':shot:'+(++arena.shotSeq),packet=remoteShotPacketFromBullets(id,weaponId,spawned);
  if(!packet)return false;packet.portalSeq=Math.max(0,Math.floor(+player.portalSeq||0));arenaSend('shot',packet);return true;
}
function arenaApplyRemoteShot(p){
  if(!p||!arena||!arena.active||arena.networkHold||!arena.opponent||arena.phase!=='fight'||p.round!==arena.round||String(p.from)!==String(arena.opponent.id)||
     !remoteShotIdValid(p.id,p.from,arena.matchEpoch,arena.round))return false;
  if(!(arena.seenShots instanceof Set))arena.seenShots=new Set();
  if(arena.seenShots.has(String(p.id)))return false;
  const visuals=remoteShotBuild(p,arena.opponent,arena.opponent.loadout);if(!visuals)return false;
  if(!remoteShotRemember(arena.seenShots,String(p.id)))return false;
  if(!Array.isArray(arena.remoteShots))arena.remoteShots=[];
  arena.remoteShots.push(...visuals);if(arena.remoteShots.length>REMOTE_SHOT_QUEUE_MAX)arena.remoteShots.splice(0,arena.remoteShots.length-REMOTE_SHOT_QUEUE_MAX);
  arena.opponent.cur=String(p.weapon);arena.opponent.flash=now+55;return true;
}
function stepRemoteShotVisuals(list,dtms){
  if(!Array.isArray(list)||!list.length)return;
  const elapsed=Math.max(0,+dtms||0),dt=elapsed/16.667;
  for(let i=list.length-1;i>=0;i--){
    const b=list[i];b.life-=elapsed;let dead=b.life<=0;
    const stepLen=Math.hypot(b.vx,b.vy)*dt,steps=Math.max(1,Math.ceil(stepLen/7)),stepDt=dt/steps;
    for(let s=0;s<steps&&!dead;s++){
      const bx=b.x,by=b.y;b.x+=b.vx*stepDt;b.y+=b.vy*stepDt;b.dist+=Math.hypot(b.vx,b.vy)*stepDt;
      if(b.wv){const A=b.wamp||24,K=b.wk||0.05;b.x=b.ox+Math.cos(b.ba)*b.dist-Math.sin(b.ba)*A*Math.sin(b.dist*K);b.y=b.oy+Math.sin(b.ba)*b.dist+Math.cos(b.ba)*A*Math.sin(b.dist*K);}
      if(projectileOutsideArena(b)){
        if(b.bounce>0){
          const bounds=activeArenaBounds();if(b.x<bounds.left||b.x>bounds.right)b.vx*=-1;if(b.y<bounds.top||b.y>bounds.bottom)b.vy*=-1;
          b.x=clamp(b.x,bounds.left+1,bounds.right-1);b.y=clamp(b.y,bounds.top+1,bounds.bottom-1);b.bounce--;continue;
        }
        dead=true;break;
      }
      // Remote tracers are cosmetic only, but must mirror the real collision
      // order: live Construction TNT absorbs a Railgun before wall phasing.
      // This receiver-owned visual path never mutates TNT health or authority.
      if(isArenaMapBattlefield()&&activeArenaMapId()==='construction'&&
         typeof arenaTntAtPoint==='function'&&arenaTntAtPoint(b.x,b.y,4)){
        dead=true;break;
      }
      if(projectileHitsSolidWall(b)){
        if(b.bounce>0){
          if(!pointInRects(bx,b.y))b.vx*=-1;else if(!pointInRects(b.x,by))b.vy*=-1;else{b.vx*=-1;b.vy*=-1;}
          b.x=bx;b.y=by;b.bounce--;continue;
        }
        dead=true;break;
      }
    }
    if(dead)list.splice(i,1);
  }
}
/* A match becomes binding as soon as both ready players enter map voting and
   stays binding between rounds. Leaving a room before that point is harmless;
   leaving after it is a whole-match forfeit, not merely one lost round. */
function arenaForfeitEligible(){
  if(!arena||!authUser||!arena.matchChannel||!arena.opponent||isBotArena()||
     (typeof isCpuTeamArena==='function'&&isCpuTeamArena())) return false;
  return Math.floor(+arena.matchEpoch||0)>0&&
    ['map_vote','map_reveal','countdown','fight','ko_wait','round_end'].includes(arena.phase);
}
function arenaForfeitResultId(loserId){
  return ['arena-forfeit',String(arena&&arena.room||''),Math.floor(+arena?.matchEpoch||0),String(loserId||'')].join(':');
}
function arenaClearDisconnectHold(resumeClocks){
  if(!arena) return 0;
  const heldFor=Math.max(0,Date.now()-(arena.disconnectAt||Date.now()));
  if(arena.disconnectTimer) clearTimeout(arena.disconnectTimer);
  arena.disconnectTimer=null; arena.disconnectAt=0; arena.disconnectSide=''; arena.networkHold=false;
  if(!resumeClocks||!heldFor) return heldFor;
  if(arena.active&&arena.roundStartAt){
    arena.roundStartAt+=heldFor; arena.roundEndAt+=heldFor;
    if(arena.nextRoundAt) arena.nextRoundAt+=heldFor;
  }
  if(arena.mapVotePhase==='voting'&&arena.mapVoteDeadline) arena.mapVoteDeadline+=heldFor;
  if(arena.mapVotePhase==='reveal'&&arena.mapVoteRevealUntil) arena.mapVoteRevealUntil+=heldFor;
  arena.mapVoteSyncAt=0;
  if(arena.pendingHazards instanceof Map) for(const pending of arena.pendingHazards.values()) pending.nextAt=0;
  return heldFor;
}
function arenaApplyForfeitResult(p){
  if(!arena||!authUser||!arena.opponent||!p) return false;
  const me=String(authUser.id),opp=String(arena.opponent.id),winner=String(p.winner||''),loser=String(p.loser||'');
  const resultId=arenaForfeitResultId(loser),epoch=Math.floor(+p.epoch||0);
  if(String(p.room||'')!==String(arena.room)||epoch!==Math.floor(+arena.matchEpoch||0)||
     p.resultId!==resultId||winner===loser||![me,opp].includes(winner)||![me,opp].includes(loser)||
     !([winner,loser].includes(me)&&[winner,loser].includes(opp))) return false;
  if(arena.forfeitResultId) return arena.forfeitResultId===resultId;
  // A completed normal match cannot be rewritten by a late Presence/leave
  // packet. During an unfinished match, even round_end is still binding.
  if(arena.phase==='match_end'||!arenaForfeitEligible()) return false;
  arenaClearDisconnectHold(false);
  const scores=Object.assign({},arena.scores);
  scores[winner]=Math.max(ARENA_TARGET,Math.max(0,Math.floor(+scores[winner]||0)));
  scores[loser]=Math.max(0,Math.floor(+scores[loser]||0));
  arena.scores=scores; arena.roundResolved=true; arena.nextRoundAt=0; arena.active=false; arena.remoteShots=[];
  arena.mapVoteStartPending=false; arena.rematchVotes=new Set(); arena.forfeitResultId=resultId;
  arena.forfeitPacket={room:arena.room,epoch:arena.matchEpoch,round:arena.round,resultId,winner,loser,
    reason:String(p.reason||'disconnect').slice(0,24)};
  if(winner===me&&!arena.winRecorded){ arena.winRecorded=true; submitArenaWin(); }
  if(arena.savedUtility!==undefined){ loadout.utility=arena.savedUtility; arena.savedUtility=undefined; }
  practiceMode=null; state='select'; selPage='arena'; menuOpen=false; aiming=false; rmbAim=false;
  resetHeldGameplayInput();
  resetWeaponGimmickState();
  arena.phase='match_end';
  arena.status=winner===me
    ?'MATCH WON BY FORFEIT — '+String(arena.opponent.name||'your opponent')+' disconnected.'
    :'MATCH LOST BY FORFEIT — your connection left the match.';
  sfx(winner===me?'pickup':'die');
  return true;
}
function arenaBroadcastForfeitResult(packet){
  if(!packet||!arena.matchChannel||!authUser) return false;
  arenaSend('forfeit_result',packet);
  const channel=arena.matchChannel,resultId=packet.resultId;
  for(const wait of [300,900]) setTimeout(()=>{
    if(arena.matchChannel===channel&&arena.forfeitResultId===resultId) arenaSend('forfeit_result',packet);
  },wait);
  return true;
}
function arenaClaimOpponentForfeit(reason='disconnect'){
  if(!arenaForfeitEligible()||arena.departureAnnounced) return false;
  const packet={room:arena.room,epoch:arena.matchEpoch,round:arena.round,
    resultId:arenaForfeitResultId(arena.opponent.id),winner:String(authUser.id),loser:String(arena.opponent.id),reason};
  if(!arenaApplyForfeitResult(packet)) return false;
  arenaBroadcastForfeitResult(packet); return true;
}
function arenaApplyOwnDisconnectLoss(reason='disconnect'){
  if(!arenaForfeitEligible()) return false;
  const me=String(authUser.id),packet={room:arena.room,epoch:arena.matchEpoch,round:arena.round,
    resultId:arenaForfeitResultId(me),winner:String(arena.opponent.id),loser:me,reason};
  arena.departureAnnounced=packet.resultId;
  // This client never credits the opponent. The still-connected opponent does
  // that once after its own Presence confirmation, preventing two winners if
  // both clients lose the channel at the same time.
  arenaSend('leave',{forfeit:true,resultId:packet.resultId,loser:me,reason});
  return arenaApplyForfeitResult(packet);
}
function arenaBeginDisconnectHold(side,ch){
  if(!arenaForfeitEligible()) return false;
  side=side==='opponent'?'opponent':'self';
  const newlyHeld=!arena.networkHold;
  if(arena.networkHold){
    if(arena.disconnectSide&&arena.disconnectSide!==side) arena.disconnectSide='both';
  }else{
    arena.networkHold=true; arena.disconnectAt=Date.now(); arena.disconnectSide=side;
  }
  const seconds=Math.ceil(ARENA_FORFEIT_GRACE_MS/1000);
  arena.status=arena.disconnectSide==='opponent'
    ?'Opponent connection lost — win by forfeit in '+seconds+' seconds...'
    :arena.disconnectSide==='self'
      ?'Connection interrupted — reconnect within '+seconds+' seconds or forfeit.'
      :'Both connections are interrupted — confirming the match state...';
  // Presence can emit many identical sync snapshots. Keep the first deadline
  // instead of letting duplicate absence packets extend the grace forever.
  if(!newlyHeld) return true;
  if(arena.disconnectTimer) clearTimeout(arena.disconnectTimer);
  const epoch=arena.matchEpoch,heldChannel=ch;
  arena.disconnectTimer=setTimeout(()=>{
    if(arena.matchChannel!==heldChannel||!arena.networkHold||arena.matchEpoch!==epoch) return;
    const disconnected=arena.disconnectSide;
    arenaClearDisconnectHold(false);
    if(disconnected==='opponent') arenaClaimOpponentForfeit('disconnect');
    else arenaApplyOwnDisconnectLoss(disconnected==='both'?'mutual_disconnect':'disconnect');
  },ARENA_FORFEIT_GRACE_MS);
  return true;
}
function arenaNotifyDeparture(reason='left'){
  if(!arena||!arena.matchChannel||!authUser) return false;
  const forfeit=arenaForfeitEligible(),loser=String(authUser.id);
  const resultId=forfeit?arenaForfeitResultId(loser):'';
  if(resultId&&arena.departureAnnounced===resultId) return true;
  if(resultId) arena.departureAnnounced=resultId;
  arena.departurePromise=arenaSend('leave',{forfeit,resultId,loser,reason:String(reason||'left').slice(0,24)});
  return forfeit;
}
function arenaForfeitOnPageExit(){ return arenaNotifyDeparture('page_exit'); }
function arenaForfeitBeforeSignOut(){
  const announced=arenaNotifyDeparture('signed_out');
  if(announced&&arena.departurePromise&&typeof arena.departurePromise.then==='function')
    return Promise.race([arena.departurePromise,new Promise(resolve=>setTimeout(resolve,150))])
      .catch(()=>{}).then(()=>announced);
  return Promise.resolve(announced);
}
function arenaHazardEventId(tntId,epoch=arena.matchEpoch,round=arena.round){ return [epoch,round,String(tntId||'')].join(':'); }
function arenaHazardHp(value){ return Number.isFinite(+value)?clamp(+value,0,ARENA_HP):null; }
function arenaHazardTntKnown(tntId){
  tntId=String(tntId||'');
  const stable=typeof DUEL_MAP_LAYOUTS!=='undefined'&&DUEL_MAP_LAYOUTS.construction&&DUEL_MAP_LAYOUTS.construction.tnt;
  return (stable||activeArenaTnt(true)).some(t=>String(t.id)===tntId);
}
function arenaHazardEnvelopeValid(p){
  if(!p||p.round!==arena.round||arena.mapId!=='construction'||p.mapId!=='construction') return false;
  const tntId=String(p.tntId||''), eventId=arenaHazardEventId(tntId,arena.matchEpoch,arena.round);
  return !!tntId&&p.eventId===eventId&&arenaHazardTntKnown(tntId);
}
function arenaHazardCauseValid(p){
  const tntId=String(p&&(p.tntId||p.hazardTntId)||''), eventId=String(p&&(p.eventId||p.hazardEventId)||'');
  return (p&&(p.kind==='tnt'||p.koKind==='tnt'))&&eventId===arenaHazardEventId(tntId)&&
         arenaHazardTntKnown(tntId);
}
function arenaHostRecordHazardHp(eventId,tntId,actorId,hp){
  if(!authUser||authUser.id!==arena.hostId||!arena.opponent||arena.roundResolved||eventId!==arenaHazardEventId(tntId)) return false;
  hp=arenaHazardHp(hp); actorId=String(actorId||'');
  const me=String(authUser.id),opp=String(arena.opponent.id); if(hp===null||![me,opp].includes(actorId)) return false;
  if(!(arena.hazardArbitrations instanceof Map)) arena.hazardArbitrations=new Map();
  let a=arena.hazardArbitrations.get(eventId);
  if(!a){ a={eventId,tntId:String(tntId),epoch:arena.matchEpoch,round:arena.round,hp:{}}; arena.hazardArbitrations.set(eventId,a); }
  if(a.epoch!==arena.matchEpoch||a.round!==arena.round) return false;
  a.hp[actorId]=hp;
  if(!Object.prototype.hasOwnProperty.call(a.hp,me)||!Object.prototype.hasOwnProperty.call(a.hp,opp)) return true;
  if(a.hp[me]>0&&a.hp[opp]>0){ arena.hazardArbitrations.delete(eventId); return true; }
  arena.hazardArbitrations.delete(eventId);
  const winner=a.hp[me]<=0?(a.hp[opp]<=0?null:opp):me;
  arenaHostResolve(winner);
  return true;
}
/* TNT durability is a per-actor grow-only damage counter. Immediate packets
   make hits feel responsive; the regular state snapshot repeats the same
   cumulative value so a dropped packet or reconnect still converges. */
function arenaBroadcastTntHit(tntId,damage){
  if(isBotArena()||(typeof isCpuTeamArena==='function'&&isCpuTeamArena())||!authUser||!arena.matchChannel||
     !arena.active||arena.phase!=='fight'||activeArenaMapId()!=='construction') return false;
  tntId=String(tntId||'');damage=arenaTntDamageValue(damage);
  if(damage===null||!arenaHazardTntKnown(tntId)) return false;
  arenaSend('map_tnt_hit',{mapId:'construction',tntId,eventId:arenaHazardEventId(tntId),damage});
  return true;
}
/* TNT is locally detected and immediately applied, then this stores a stable
   post-blast envelope until the opponent acknowledges that exact round/event. */
function arenaBroadcastTnt(tntId,sourceHp=player.hp){
  if(isBotArena()||!authUser||!arena.matchChannel||!arena.active||arena.phase!=='fight'||activeArenaMapId()!=='construction') return false;
  tntId=String(tntId||''); sourceHp=arenaHazardHp(sourceHp);
  if(sourceHp===null||!arenaHazardTntKnown(tntId)) return false;
  const packet={epoch:arena.matchEpoch,round:arena.round,mapId:'construction',tntId,
                eventId:arenaHazardEventId(tntId),sourceHp};
  if(!(arena.pendingHazards instanceof Map)) arena.pendingHazards=new Map();
  if(!(arena.hazardReceipts instanceof Map)) arena.hazardReceipts=new Map();
  arena.pendingHazards.set(packet.eventId,{packet,nextAt:Date.now()+500});
  arena.hazardReceipts.set(packet.eventId,{tntId,receiverHp:sourceHp});
  if(authUser.id===arena.hostId) arenaHostRecordHazardHp(packet.eventId,tntId,authUser.id,sourceHp);
  arenaSend('map_hazard',packet); return true;
}
function arenaHazardAck(packet,receiverHp){
  arenaSend('map_hazard_ack',{mapId:'construction',tntId:packet.tntId,eventId:packet.eventId,receiverHp});
}
function arenaHazardSyncTick(clock=Date.now()){
  if(!arena||isBotArena()||arena.networkHold||!authUser||!arena.matchChannel||!(arena.pendingHazards instanceof Map)) return;
  for(const [eventId,pending] of arena.pendingHazards){
    const p=pending&&pending.packet;
    if(!p||p.epoch!==arena.matchEpoch||p.round!==arena.round){ arena.pendingHazards.delete(eventId); continue; }
    if(clock>=(pending.nextAt||0)){ arenaSend('map_hazard',p); pending.nextAt=clock+650; }
  }
}
function arenaOwnPresence(){
  return {id:authUser.id,name:displayName(authUser),joined:arena.joinedAt||Date.now(),host:!!arena.wantsHost,
          ready:!!arena.localReady,primary:loadout.primary,secondary:loadout.secondary,melee:loadout.melee};
}
function arenaRefreshUsername(){
  if(!authUser||!arena) return false;
  try{
    if(arena.queueChannel){
      const queued=arena.queueChannel.track({id:authUser.id,name:displayName(authUser),joined:arena.joinedAt||Date.now()});
      if(queued&&typeof queued.catch==='function') queued.catch(()=>{});
    }
    if(arena.matchChannel){
      const matched=arena.matchChannel.track(arenaOwnPresence());
      if(matched&&typeof matched.catch==='function') matched.catch(()=>{});
    }
  }catch(e){ return false; }
  return true;
}
function arenaQuickMatch(){
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()){
    arena.status='Choose your username before entering Online multiplayer.'; sfx('dry'); return false;
  }
  // Recheck at the real queue boundary: a friend may have joined the party
  // while this player was choosing weapons or viewing the Arena menu.
  if(!partyAllowsQueue('arena')) return false;
  if(!sb||navigator.onLine===false){
    arena.status='Online games are unavailable. Reconnect and try again.';
    sfx('dry'); return false;
  }
  if(!arenaGuard()) return false;
  leaveArena('',false);
  arena.mode='queue'; arena.phase='queue'; arena.status='Searching for another signed-in operator...'; arena.joinedAt=Date.now();
  const ch=sb.channel('oz-arena-queue-v1',{config:{presence:{key:authUser.id}}});
  ch.on('presence',{event:'sync'},()=>arenaQueueSync(ch));
  ch.on('broadcast',{event:'pair_offer'},msg=>arenaQueueOffer(ch,msg&&msg.payload));
  ch.subscribe(async st=>{
    if(ch!==arena.queueChannel) return;
    if(st==='SUBSCRIBED'){
      arena.status='Searching for another signed-in operator...';
      try{ await ch.track({id:authUser.id,name:displayName(authUser),joined:arena.joinedAt}); }catch(e){}
    } else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT') arena.status='Could not reach matchmaking. Try again.';
  });
  arena.queueChannel=ch;
  return true;
}
function arenaQueueSync(ch){
  if(ch!==arena.queueChannel||arena.matchChannel||!authUser) return;
  const list=arenaPresenceList(ch), idx=list.findIndex(x=>x.id===authUser.id), clock=Date.now();
  if(idx<0) return;
  const present=new Set(list.map(x=>String(x.id)));
  let c=arena.queueCandidate;

  // Once selected, keep the same opponent through temporary Presence churn.
  // Releasing only on a timeout prevents C/D from being re-paired when A/B
  // leave the shared queue a fraction of a second apart.
  if(c && clock>=c.expiresAt){
    if(c.retryTimer) clearTimeout(c.retryTimer);
    if(arena.queueOffer&&arena.queueOffer.from===c.id) arena.queueOffer=null;
    arena.queueCandidate=null; c=null;
  }
  if(!c){
    const pairStart=idx-(idx%2), pair=list.slice(pairStart,pairStart+2);
    if(pair.length<2){ arena.status='Searching for another signed-in operator...'; return; }
    const ids=pair.map(x=>String(x.id)).sort();
    const other=ids.find(id=>id!==String(authUser.id)), code=arenaPairCode(ids);
    c=arena.queueCandidate={id:other,code,ids,lockedAt:clock,expiresAt:clock+8000,nextOfferAt:0,retryTimer:null};
  }

  const otherMeta=list.find(x=>String(x.id)===c.id);
  const bothPresent=c.ids.every(id=>present.has(id));
  arena.status=bothPresent
    ? 'Confirming '+String(otherMeta&&otherMeta.name||'opponent')+'...'
    : 'Holding your opponent slot...';

  // Repeat the offer while locked. Broadcast is intentionally treated as
  // at-most-once, so either side can recover from one missed packet.
  if(bothPresent && clock>=c.nextOfferAt){
    c.nextOfferAt=clock+900;
    try{ ch.send({type:'broadcast',event:'pair_offer',payload:{from:authUser.id,to:c.id,code:c.code,ids:c.ids}}); }catch(e){}
  }
  const offer=arena.queueOffer;
  const reciprocal=offer&&offer.from===c.id&&offer.to===authUser.id&&offer.code===c.code
                   &&Array.isArray(offer.ids)&&offer.ids.slice().map(String).sort().join('|')===c.ids.join('|');
  if(bothPresent&&reciprocal){
    if(c.retryTimer) clearTimeout(c.retryTimer);
    arena.status='Opponent confirmed. Connecting...';
    arenaConnectRoom(c.code,c.ids[0]===String(authUser.id),'queue',c.ids);
    return;
  }
  if(!c.retryTimer){
    c.retryTimer=setTimeout(()=>{
      if(arena.queueCandidate!==c) return;
      c.retryTimer=null; arenaQueueSync(ch);
    },Math.max(100,Math.min(900,c.expiresAt-clock)));
  }
}
function arenaQueueOffer(ch,p){
  if(ch!==arena.queueChannel||!authUser||!p||String(p.to)!==String(authUser.id)) return;
  const ids=Array.isArray(p.ids)?p.ids.map(String).sort():[];
  if(ids.length!==2||new Set(ids).size!==2||!ids.includes(String(authUser.id))||!ids.includes(String(p.from))) return;
  if(p.code!==arenaPairCode(ids)) return;
  // The first client may already be opening the match room while the second
  // is still waiting for its reciprocal packet. Keep answering on the queue
  // channel until Presence confirms that both clients reached the room.
  if(arena.matchChannel){
    const c=arena.queueCandidate;
    if(c&&c.id===String(p.from)&&c.code===p.code&&c.ids.join('|')===ids.join('|')){
      try{ ch.send({type:'broadcast',event:'pair_offer',payload:{from:authUser.id,to:c.id,code:c.code,ids:c.ids}}); }catch(e){}
    }
    return;
  }
  // An offer can beat the Presence callback by one event-loop turn. Build the
  // local lock first, then accept only the offer from that exact candidate.
  if(!arena.queueCandidate) arenaQueueSync(ch);
  let c=arena.queueCandidate;
  if(c&&c.id!==String(p.from)){
    const present=new Set(arenaPresenceList(ch).map(x=>String(x.id)));
    // Presence churn by itself never changes the lock. A valid reciprocal
    // offer can replace it only when the old, still-unconfirmed peer is gone.
    if(!present.has(c.id)&&present.has(String(p.from))){
      if(c.retryTimer) clearTimeout(c.retryTimer);
      arena.queueOffer=null;
      c=arena.queueCandidate={id:String(p.from),code:p.code,ids,lockedAt:Date.now(),expiresAt:Date.now()+8000,nextOfferAt:0,retryTimer:null};
    }
  }
  if(!c||c.id!==String(p.from)||c.code!==p.code||c.ids.join('|')!==ids.join('|')) return;
  arena.queueOffer={from:String(p.from),to:String(p.to),code:p.code,ids,receivedAt:Date.now()};
  arenaQueueSync(ch);
}
function arenaCreatePrivate(){
  if(!arenaGuard()) return;
  leaveArena('',false);
  arenaConnectRoom(randomArenaCode(),true,'private',null);
}
function arenaPromptJoin(){
  if(!arenaGuard()) return;
  openForm({title:'JOIN PRIVATE ARENA',hint:'Paste the 6-character room code from your friend.',saveLabel:'JOIN',
    fields:[{id:'code',label:'ROOM CODE',type:'text',value:'',placeholder:'ABC123',upper:true}],
    onSave:v=>{
      const code=String(v.code||'').replace(/[^A-Z0-9]/g,'').slice(0,6);
      if(code.length!==6){ $('formstatus').textContent='Enter the full 6-character code.'; return; }
      closeForm(); leaveArena('',false); arenaConnectRoom(code,false,'private',null);
    }});
}
function arenaConnectRoom(code,wantsHost,mode,expectedIds){
  if(!sb||!authUser) return;
  arena.room=code; arena.mode=mode; arena.phase='room'; arena.status=mode==='queue'?'Joining match...':'Waiting for the other player...';
  arena.wantsHost=!!wantsHost; arena.expectedIds=expectedIds; arena.joinedAt=arena.joinedAt||Date.now();
  arena.localReady=mode==='queue'; arena.remoteReady=false;
  const ch=sb.channel('oz-arena-v1-'+code,{config:{broadcast:{self:false,ack:false},presence:{key:authUser.id}}});
  for(const ev of ['state','shot','hit','ko','round_start','round_result','ready','rematch','rematch_start','forfeit_result',
                    'map_vote_open','map_vote','map_vote_result','map_vote_ack','map_tnt_hit','map_hazard','map_hazard_ack','leave','room_full'])
    ch.on('broadcast',{event:ev},msg=>arenaReceive(ev,msg&&msg.payload));
  ch.on('presence',{event:'sync'},()=>arenaMatchPresenceSync(ch));
  ch.subscribe(async st=>{
    if(ch!==arena.matchChannel) return;
    if(st==='SUBSCRIBED'){
      if(!(arena.phase==='match_end'&&arena.forfeitResultId))
        arena.status=mode==='queue'?'Opponent found. Preparing match...':(wantsHost?'Room '+code+' created. Waiting for another player...':'Joining room '+code+'...');
      try{ await ch.track(arenaOwnPresence()); }catch(e){}
    } else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){
      if(!arenaBeginDisconnectHold('self',ch)&&!(arena.phase==='match_end'&&arena.forfeitResultId))
        arena.status='Room connection failed. Go back and try again.';
    }
  });
  arena.matchChannel=ch;
}
function arenaMatchPresenceSync(ch){
  if(ch!==arena.matchChannel||!authUser) return;
  const all=arenaPresenceList(ch);
  let chosen;
  if(arena.expectedIds) chosen=arena.expectedIds.map(id=>all.find(x=>x.id===id)).filter(Boolean);
  else {
    const creator=all.find(x=>x.host), other=all.filter(x=>!creator||x.id!==creator.id)[0];
    chosen=creator?[creator].concat(other?[other]:[]):all.slice(0,2);
  }
  if(chosen.length>=2 && !chosen.some(x=>x.id===authUser.id)){
    arenaSend('room_full',{to:authUser.id});
    leaveArena('That room already has two players.',false); return;
  }
  const oldOpp=arena.opponent, om=chosen.find(x=>x.id!==authUser.id);
  if(oldOpp&&!om){
    if(arena.phase==='match_end'&&arena.forfeitResultId) return;
    if(arenaForfeitEligible()){
      arenaBeginDisconnectHold('opponent',ch);
    }else if(!arena.networkHold){
      arena.networkHold=true; arena.disconnectAt=Date.now(); arena.disconnectSide='opponent';
      arena.status='Opponent reconnecting \u2014 holding the room for 15 seconds...';
      const heldChannel=ch;
      arena.disconnectTimer=setTimeout(()=>{
        if(arena.matchChannel===heldChannel&&arena.networkHold) leaveArena('The other player disconnected.',false);
      },15000);
    }
    return;
  }
  if(!om){ arena.status=arena.mode==='queue'?'Waiting for matched player to connect...':'Share room code '+arena.room+' with your friend.'; return; }
  if(arena.networkHold) arenaClearDisconnectHold(true);
  arena.opponent=Object.assign(oldOpp||{x:WORLD.w/2+380,y:WORLD.h/2,tx:WORLD.w/2+380,ty:WORLD.h/2,angle:Math.PI,hp:ARENA_HP,cur:om.primary||'ar',lastSeen:Date.now()},
                               {id:om.id,name:om.name||'opponent',loadout:{primary:om.primary,secondary:om.secondary,melee:om.melee}});
  // Stay visible in the quick queue until both confirmed IDs have actually
  // arrived in the match room. This closes the one-sided transition race.
  if(arena.mode==='queue'&&arena.expectedIds&&arena.expectedIds.every(id=>chosen.some(x=>String(x.id)===String(id)))&&arena.queueChannel){
    arenaDropChannel(arena.queueChannel); arena.queueChannel=null;
  }
  arena.hostId=(chosen.find(x=>x.host)||chosen.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0]).id;
  arena.remoteReady=!!om.ready;
  if(!['match_end','map_vote','map_reveal'].includes(arena.phase)) arena.phase=arena.active?arena.phase:'lobby';
  if(arena.phase==='match_end'&&arena.forfeitPacket&&String(arena.forfeitPacket.winner)===String(authUser.id))
    arenaSend('forfeit_result',arena.forfeitPacket);
  else if(arena.mapVotePhase==='voting') arena.status='Vote for a map — '+Math.max(1,Math.ceil((arena.mapVoteDeadline-Date.now())/1000))+' seconds.';
  else if(arena.mapVotePhase==='reveal') arena.status=arenaMapName(arena.mapId)+' selected.';
  else arena.status=arena.mode==='queue'?'Match found: '+arena.opponent.name:(arena.opponent.name+' joined room '+arena.room+'.');
  if(arena.mode==='queue'&&!arena.localReady) arenaSetReady(true);
  arenaMaybeStart();
}
function arenaSetReady(ready){
  if(!arena.matchChannel||!authUser) return;
  arena.localReady=ready!==false;
  try{ arena.matchChannel.track(arenaOwnPresence()); }catch(e){}
  arenaSend('ready',{ready:arena.localReady});
  arenaMaybeStart();
}
function arenaMaybeStart(){
  if(!authUser||!arena.opponent||arena.active||arena.phase==='match_end'||['voting','reveal','locked'].includes(arena.mapVotePhase)) return;
  if(authUser.id===arena.hostId && arena.localReady&&arena.remoteReady){
    arena.matchEpoch++; arena.scores={[authUser.id]:0,[arena.opponent.id]:0}; arena.round=0; arenaStartMapVote();
  }
}
function arenaReceive(event,p){
  if(!p||p.room!==arena.room||!authUser) return;
  if(p.to&&p.to!==authUser.id) return;
  if(event==='room_full'){ leaveArena('That room already has two players.',false); return; }
  if(!arena.opponent||p.from!==arena.opponent.id) return;
  if(event==='ready'){
    arena.remoteReady=!!p.ready; arenaMaybeStart(); return;
  }
  if(event==='rematch_start' && p.from===arena.hostId){ arenaApplyRematchStart(p); return; }
  if(event==='map_vote_open' && p.from===arena.hostId){ arenaApplyMapVoteOpen(p); return; }
  if(event==='map_vote_result' && p.from===arena.hostId){ arenaApplyMapVoteResult(p); return; }
  if(event==='round_start' && p.from===arena.hostId){ arenaApplyRoundStart(p); return; }
  if(Math.floor(+p.epoch||0)!==arena.matchEpoch) return; // ignore late packets from the previous match
  if(event==='forfeit_result'){
    if(String(p.winner)!==String(p.from)||String(p.loser)!==String(authUser.id)) return;
    arenaApplyForfeitResult(p); return;
  }
  if(event==='map_vote'){
    if(authUser.id!==arena.hostId||arena.mapVotePhase!=='voting'||String(p.voteId||'')!==arena.mapVoteId||
       !arenaMapValid(p.mapId)||Date.now()>=arena.mapVoteDeadline) return;
    arena.mapVotes[String(p.from)]=String(p.mapId); arena.mapVoteSyncAt=0; return;
  }
  if(event==='map_vote_ack'){
    if(authUser.id!==arena.hostId||arena.mapVotePhase!=='reveal'||!arena.mapVoteResult||
       String(p.voteId||'')!==arena.mapVoteId||p.resultId!==arena.mapVoteResult.resultId) return;
    arena.mapVoteAcks.add(String(p.from)); return;
  }
  if(event==='map_tnt_hit'){
    if(!arenaHazardEnvelopeValid(p)||arena.phase!=='fight') return;
    const cumulative=arenaTntDamageValue(p.damage);if(cumulative===null)return;
    arenaMergeTntDamageSnapshot(String(p.from),{[String(p.tntId)]:cumulative});return;
  }
  if(event==='map_hazard'){
    if(!arenaHazardEnvelopeValid(p)||!['fight','ko_wait','round_end','match_end'].includes(arena.phase)) return;
    const sourceHp=arenaHazardHp(p.sourceHp); if(sourceHp===null) return;
    if(!(arena.hazardReceipts instanceof Map)) arena.hazardReceipts=new Map();
    let receipt=arena.hazardReceipts.get(p.eventId);
    if(!receipt){
      if(arena.phase==='fight'||arena.phase==='ko_wait') arenaApplyTntDetonation(p.tntId,'remote');
      receipt={tntId:String(p.tntId),receiverHp:Math.max(0,+player.hp||0)}; arena.hazardReceipts.set(p.eventId,receipt);
    }
    if(authUser.id===arena.hostId){
      arenaHostRecordHazardHp(p.eventId,p.tntId,p.from,sourceHp);
      arenaHostRecordHazardHp(p.eventId,p.tntId,authUser.id,receipt.receiverHp);
    }
    arenaHazardAck(p,receipt.receiverHp); return;
  }
  if(event==='map_hazard_ack'){
    if(!(arena.pendingHazards instanceof Map)) arena.pendingHazards=new Map();
    const pending=arena.pendingHazards.get(p.eventId), sent=pending&&pending.packet, receiverHp=arenaHazardHp(p.receiverHp);
    if(!sent||receiverHp===null||sent.epoch!==arena.matchEpoch||sent.round!==arena.round||sent.mapId!=='construction'||
       p.mapId!==sent.mapId||String(p.tntId||'')!==sent.tntId||p.eventId!==sent.eventId) return;
    arena.pendingHazards.delete(p.eventId);
    if(authUser.id===arena.hostId){
      arenaHostRecordHazardHp(p.eventId,p.tntId,authUser.id,pending.packet.sourceHp);
      arenaHostRecordHazardHp(p.eventId,p.tntId,p.from,receiverHp);
    }
    return;
  }
  if(event==='shot'){ arenaApplyRemoteShot(p); return; }
  if(event==='state'){
    if(p.round!==arena.round) return;
    if(activeArenaMapId()==='construction'&&p.tntDamage&&typeof p.tntDamage==='object')
      arenaMergeTntDamageSnapshot(String(p.from),p.tntDamage);
    const r=arena.opponent, bounds=typeof activeArenaBounds==='function'?activeArenaBounds():{left:0,top:0,right:WORLD.w,bottom:WORLD.h}, margin=Math.max(1,+r.r||15);
    const oldPortalSeq=Math.max(0,Math.floor(+r.portalSeq||0)), hasPortalSeq=p.portalSeq!==undefined&&p.portalSeq!==null;
    const portalSeq=hasPortalSeq?+p.portalSeq:oldPortalSeq;
    if(!Number.isSafeInteger(portalSeq)||portalSeq<oldPortalSeq) return;
    const tx=clamp(Number.isFinite(+p.x)?+p.x:r.tx,bounds.left+margin,bounds.right-margin);
    const ty=clamp(Number.isFinite(+p.y)?+p.y:r.ty,bounds.top+margin,bounds.bottom-margin);
    if(portalSeq>oldPortalSeq||Math.hypot(tx-r.x,ty-r.y)>180){ r.x=tx; r.y=ty; }
    r.tx=tx; r.ty=ty; r.portalSeq=portalSeq;
    r.angle=Number.isFinite(+p.angle)?+p.angle:r.angle; r.cur=WEAPONS[p.cur]?p.cur:r.cur;
    r.hp=clamp(+p.hp||0,0,ARENA_HP); r.lastSeen=Date.now();
    if(authUser.id===arena.hostId&&r.hp<=0){
      if(arenaHazardCauseValid(p)) arenaHostRecordHazardHp(p.hazardEventId,p.hazardTntId,r.id,0);
      else if(arena.phase==='fight') arenaHostResolve(authUser.id,arenaUnscopedKillCause(p,authUser.id));
    }
    return;
  }
  if(event==='hit'){ arenaTakeHit(p); return; }
  if(event==='ko' && p.round===arena.round && arena.phase!=='match_end'){
    if(String(p.dead)!==String(p.from)) return;
    if(arenaHazardCauseValid(p)){
      if(authUser.id===arena.hostId)arenaHostRecordHazardHp(p.eventId,p.tntId,p.dead,0);
      return;
    }
    const shotCause=arenaUnscopedKillCause(p,authUser.id);
    arenaCelebrateConfirmedUnscopedKill(shotCause,authUser.id);
    if(authUser.id===arena.hostId)arenaHostResolve(authUser.id,shotCause);
    return;
  }
  if(event==='round_result' && p.from===arena.hostId){ arenaApplyRoundResult(p); return; }
  if(event==='rematch'){
    arena.rematchVotes.add(p.from); arenaCheckRematch(); return;
  }
  if(event==='leave'){
    if(arenaForfeitEligible()&&!arena.departureAnnounced){ arenaClaimOpponentForfeit(String(p.reason||'left')); return; }
    if(arena.phase!=='match_end') leaveArena('The other player left the Arena.',false);
  }
}
function arenaHostStartRound(){
  if(!authUser||authUser.id!==arena.hostId||!arena.opponent) return;
  const p={from:authUser.id,room:arena.room,epoch:arena.matchEpoch,round:arena.round+1,startDelay:3000,startAt:Date.now()+3000,
           scores:Object.assign({},arena.scores),mapId:arenaMapValid(arena.mapId)?arena.mapId:'arena',
           mapVoteId:arena.mapVoteId,mapResultId:arena.mapVoteResult&&arena.mapVoteResult.resultId};
  arenaApplyRoundStart(p); arenaSend('round_start',p);
  // Broadcast control messages are not guaranteed delivery, so repeat the
  // same idempotent start packet while both clients are still on this round.
  for(const wait of [300,900]) setTimeout(()=>{
    if(arena.matchChannel&&arena.matchEpoch===p.epoch&&arena.round===p.round) arenaSend('round_start',p);
  },wait);
}
function arenaApplyRematchStart(p){
  const epoch=Math.floor(+p?.epoch||0);
  if(!authUser||!arena.opponent||p.from!==arena.hostId||epoch<=arena.matchEpoch) return false;
  arena.matchEpoch=epoch; arena.round=0; arena.scores={[authUser.id]:0,[arena.opponent.id]:0};
  arena.roundStartAt=0; arena.roundEndAt=0; arena.nextRoundAt=0; arena.roundResolved=false; arena.active=false;
  arena.rematchVotes=new Set(); arena.seenHits=new Set(); arena.hitSeq=0; arena.pendingUnscopedHits=new Set();
  arena.seenShots=new Set(); arena.shotSeq=0; arena.remoteShots=[]; arena.winRecorded=false;
  arena.departureAnnounced=''; arena.departurePromise=null; arena.forfeitResultId=''; arena.forfeitPacket=null;
  arenaResetMapVote('arena');
  arena.phase='lobby'; arena.status='Rematch confirmed. Starting round 1...';
  return true;
}
function arenaApplyRoundStart(p){
  if(!p||!arena.opponent) return;
  const epoch=Math.floor(+p.epoch||0);
  if(epoch>arena.matchEpoch) arenaApplyRematchStart(p); // also recovers if rematch_start arrives late
  if(epoch!==arena.matchEpoch||p.round<=arena.round) return;
  const packetMap=arenaMapValid(p.mapId)?String(p.mapId):'arena';
  if(arena.mapVoteResult&&(arena.mapVoteResult.mapId!==packetMap||
     (p.mapResultId&&arena.mapVoteResult.resultId!==p.mapResultId))) return;
  arena.mapId=packetMap; arena.mapVotePhase='locked'; arena.mapVoteStartPending=false;
  resetHeldGameplayInput();
  resetWeaponGimmickState();
  clearCameraShake();
  arena.round=p.round; arena.scores=Object.assign({},p.scores||arena.scores); arena.roundResolved=false;
  arena.seenShots=new Set();arena.shotSeq=0;arena.remoteShots=[];arena.pendingUnscopedHits=new Set();
  // Use a relative countdown on each device. Absolute browser clocks can be
  // minutes apart even when both players have a healthy connection.
  const startDelay=Number.isFinite(+p.startDelay)?clamp(+p.startDelay,0,10000):clamp((+p.startAt||Date.now())-Date.now(),0,10000);
  arena.roundStartAt=Date.now()+startDelay; arena.roundEndAt=arena.roundStartAt+ARENA_ROUND_MS; arena.nextRoundAt=0; arena.phase='countdown';
  if(!arena.active){
    arena.savedUtility=loadout.utility; loadout.utility=null;
    startGame(); practiceMode='arena'; arena.active=true;
  }
  perks.maxhp=ARENA_HP; player.hp=ARENA_HP; player.hurtCd=0; player.hurtFlash=0;
  bullets=[]; ebullets=[]; enemies=[]; particles=[]; pickups=[]; damageNumbers=[]; grenades=[]; pearls=[]; balls=[]; flames=[]; freezeFx=[];
  abilityCD={}; quickReadyT=0; sawFuel=100; sawLock=false; daggersOut=null; comboStep=0; comboNextT=0;
  parryUntil=0; parrySeq=0; teraHitCharge=15; fistFlurryUntil=0; sawChargeUntil=0;
  player.cur=loadout.primary; player.reloadEnd=0; player.equipEnd=now+600; player.bloom=0; player.lastShot=0;
  for(const k of [loadout.primary,loadout.secondary,loadout.melee]) if(k&&WEAPONS[k]){
    player.mags[k]=magSize(k); player.reserve[k]=(WEAPONS[k].melee||WEAPONS[k].energy||WEAPONS[k].infinite)?Infinity:magSize(k)*5;
  }
  if(typeof arenaResetMapRuntime==='function') arenaResetMapRuntime();
  const left=authUser.id===arena.hostId, mine=typeof duelArenaSpawn==='function'?duelArenaSpawn(left?0:1):{x:WORLD.w/2+(left?-500:500),y:WORLD.h/2,angle:left?0:Math.PI};
  const theirs=typeof duelArenaSpawn==='function'?duelArenaSpawn(left?1:0):{x:WORLD.w/2+(left?500:-500),y:WORLD.h/2,angle:left?Math.PI:0};
  player.x=mine.x; player.y=mine.y; cam.x=player.x;cam.y=player.y;
  if(typeof duelArenaFitZoom==='function') zoom=duelArenaFitZoom();
  arena.opponent.x=theirs.x; arena.opponent.y=theirs.y; arena.opponent.tx=theirs.x; arena.opponent.ty=theirs.y; arena.opponent.angle=theirs.angle;
  arena.opponent.hp=ARENA_HP; arena.opponent.cur=arena.opponent.loadout.primary||'ar';
  state='play'; menuOpen=false; aiming=false; rmbAim=false;
  waveMsg='ROUND '+arena.round+' \u2014 GET READY'; waveMsgT=now+2800; sfx('wave');
}
function arenaCanAct(){
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return !!(arena.active&&partyCpuMatch.phase==='fight'&&cpuTeamClock()<partyCpuMatch.roundEndAt&&player.hp>0);
  const clock=isBotArena()?now:Date.now();
  return !!(arena&&arena.active&&!arena.networkHold&&arena.phase==='fight'&&clock<arena.roundEndAt&&player.hp>0);
}
function arenaWallTick(wall){
  if(!arena) return;
  arenaMapVoteTick();
  arenaHazardSyncTick(Date.now());
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return;
  if(isBotArena()) return;                              // local duels use the pausable fixed-step game clock
  const elapsed=arena.wallTickAt?clamp(wall-arena.wallTickAt,0,250):16.667;
  arena.wallTickAt=wall;
  if(arena.active&&arena.phase==='fight'&&!arena.networkHold)stepRemoteShotVisuals(arena.remoteShots,elapsed);
  if(arena.opponent){
    const alpha=1-Math.pow(0.78,elapsed/16.667);           // same smoothing at 20, 60, or 144 FPS
    arena.opponent.x+=(arena.opponent.tx-arena.opponent.x)*alpha;
    arena.opponent.y+=(arena.opponent.ty-arena.opponent.y)*alpha;
  }
  if(!arena.active) return;
  if(arena.networkHold) return;
  const clock=Date.now();
  if(arena.phase==='countdown'&&clock>=arena.roundStartAt){
    arena.phase='fight'; aiming=false; rmbAim=false;
    if(typeof duelArenaFitZoom==='function') zoom=duelArenaFitZoom();
    waveMsg='FIGHT'; waveMsgT=now+800;
  }
  if(arena.phase==='fight'&&clock>=arena.roundEndAt&&authUser&&authUser.id===arena.hostId&&
     (!(arena.hazardArbitrations instanceof Map)||arena.hazardArbitrations.size===0)){
    const rhp=arena.opponent?arena.opponent.hp:0;
    arenaHostResolve(player.hp===rhp?null:(player.hp>rhp?authUser.id:arena.opponent.id));
  }
  if(arena.phase==='round_end'&&arena.nextRoundAt&&clock>=arena.nextRoundAt&&authUser&&authUser.id===arena.hostId){
    arena.nextRoundAt=0; arenaHostStartRound();
  }
}
function arenaSyncTick(wall){
  if(!arena||!arena.active||arena.networkHold||isBotArena()||(typeof isCpuTeamArena==='function'&&isCpuTeamArena())) return;
  if(wall>=arena.syncAt&&arena.matchChannel&&authUser){
    arena.syncAt=arena.syncAt?arena.syncAt+ARENA_SYNC_MS:wall+ARENA_SYNC_MS;
    if(arena.syncAt<wall-ARENA_SYNC_MS) arena.syncAt=wall+ARENA_SYNC_MS;
    const cause=arena.localKoCause;
    arenaSend('state',{x:player.x,y:player.y,angle:aimAngle(),cur:player.cur,hp:Math.max(0,player.hp),
      tntDamage:activeArenaMapId()==='construction'?arenaTntOwnDamageSnapshot(String(authUser.id)):undefined,
      detonatedTnt:activeArenaMapId()==='construction'?[...arenaDestroyedTnt()]:undefined,
      portalSeq:Math.max(0,Math.floor(+player.portalSeq||0)),koKind:cause&&cause.kind,
      killKind:cause&&cause.killKind,killHitId:cause&&cause.killHitId,
      hazardEventId:cause&&cause.eventId,hazardTntId:cause&&cause.tntId});
  }
}
function arenaUnscopedKillCause(raw,killerId){
  if(!raw||String(raw.killKind||raw.kind||'')!=='unscoped_sniper')return null;
  const hitId=String(raw.killHitId||raw.hitId||'');
  const prefix=String(killerId||'')+':'+arena.round+':';
  if(!killerId||!hitId.startsWith(prefix)||hitId.length>120)return null;
  return {killKind:'unscoped_sniper',killHitId:hitId};
}
function arenaCelebrateConfirmedUnscopedKill(raw,killerId){
  const cause=arenaUnscopedKillCause(raw,killerId);
  if(!cause||!authUser||String(killerId)!==String(authUser.id))return false;
  if(!(arena.pendingUnscopedHits instanceof Set)||!arena.pendingUnscopedHits.has(cause.killHitId))return false;
  arena.pendingUnscopedHits.delete(cause.killHitId);
  return triggerUnscopedSniperKillCelebration(1,0,{weapon:'sniper',unscopedShot:true,
    confirmationId:'arena:'+arena.matchEpoch+':'+arena.round+':'+cause.killHitId});
}
function arenaSendHit(dmg,kind){
  if(!arenaCanAct()||!arena.opponent) return;
  const hit=clamp(dmg,1,ARENA_HP);
  addDamageNumber(arena.opponent,hit,kind==='crit'||kind==='parry');
  const id=authUser.id+':'+arena.round+':'+(++arena.hitSeq);
  if(kind==='unscoped_sniper'){
    if(!(arena.pendingUnscopedHits instanceof Set))arena.pendingUnscopedHits=new Set();
    arena.pendingUnscopedHits.add(id);
    if(arena.pendingUnscopedHits.size>64)arena.pendingUnscopedHits=new Set([...arena.pendingUnscopedHits].slice(-32));
  }
  arenaSend('hit',{to:arena.opponent.id,id,dmg:hit,kind:kind||'shot'});
  return id;
}
function arenaTakeHit(p){
  if(Math.floor(+p.epoch||0)!==arena.matchEpoch||p.round!==arena.round||!arenaCanAct()||arena.seenHits.has(p.id)) return;
  arena.seenHits.add(p.id); if(arena.seenHits.size>500) arena.seenHits=new Set([...arena.seenHits].slice(-250));
  const dmg=clamp(+p.dmg||0,0,ARENA_HP); if(!dmg) return;
  if(now<parryUntil){
    parryUntil=0;
    arenaSendHit(dmg,'parry');
    burst(player.x,player.y,'#bfe8ff',10,4); addShake(3); sfx('hit');
    waveMsg='TWIN SAI PARRY'; waveMsgT=now+900;
    return;
  }
  const before=Math.max(0,+player.hp||0);
  damagePlayerHp(dmg); player.hurtFlash=1; player.hurtCd=240; addShake(4); sfx('hurt');
  burst(player.x,player.y,'#d05548',8,3);
  if(before>0&&player.hp<=0){
    const shotCause=p.kind==='unscoped_sniper'?{kind:'unscoped_sniper',hitId:p.id}:null;
    arenaLocalKO(shotCause);
  }
}
function arenaLocalKO(cause=null){
  if(arena.phase!=='fight') return;
  const hazard=arenaHazardCauseValid(cause)?{kind:'tnt',eventId:String(cause.eventId),tntId:String(cause.tntId)}:null;
  const shot=hazard?null:arenaUnscopedKillCause(cause,arena.opponent&&arena.opponent.id);
  arena.phase='ko_wait'; player.hp=0; arena.localKoCause=hazard||shot; arena.remoteShots=[];
  arenaSend('ko',Object.assign({dead:authUser.id},hazard||shot||{}));
  if(authUser.id===arena.hostId){
    if(hazard) arenaHostRecordHazardHp(hazard.eventId,hazard.tntId,authUser.id,0);
    else arenaHostResolve(arena.opponent.id,shot);
  }
}
function arenaHostResolve(winnerId,cause=null){
  if(!authUser||authUser.id!==arena.hostId||arena.roundResolved||!arena.opponent) return;
  arena.roundResolved=true;
  const scores=Object.assign({},arena.scores);
  if(winnerId) scores[winnerId]=(scores[winnerId]||0)+1;
  const over=winnerId&&(scores[winnerId]||0)>=ARENA_TARGET;
  const p={from:authUser.id,room:arena.room,epoch:arena.matchEpoch,round:arena.round,winner:winnerId,scores,matchOver:!!over,
           nextDelay:over?0:2600,nextAt:over?0:Date.now()+2600};
  Object.assign(p,arenaUnscopedKillCause(cause,winnerId)||{});
  arenaApplyRoundResult(p); arenaSend('round_result',p);
  for(const wait of [300,900]) setTimeout(()=>{
    if(arena.matchChannel&&arena.matchEpoch===p.epoch&&arena.round===p.round) arenaSend('round_result',p);
  },wait);
}
function arenaApplyRoundResult(p){
  if(!p||Math.floor(+p.epoch||0)!==arena.matchEpoch||p.round!==arena.round) return;
  if(arena.roundResolved&&(arena.phase==='round_end'||arena.phase==='match_end')) return;
  arena.scores=Object.assign({},p.scores||arena.scores); arena.roundResolved=true; arena.remoteShots=[];
  arenaCelebrateConfirmedUnscopedKill(p,p.winner);
  arena.pendingUnscopedHits=new Set();
  const nextDelay=Number.isFinite(+p.nextDelay)?clamp(+p.nextDelay,0,10000):clamp((+p.nextAt||0)-Date.now(),0,10000);
  arena.nextRoundAt=p.matchOver?0:Date.now()+nextDelay;
  if(p.matchOver){
    arena.phase='match_end'; arena.active=false; arena.rematchVotes=new Set();
    if(p.winner===authUser.id&&!arena.winRecorded){ arena.winRecorded=true; submitArenaWin(); }
    if(arena.savedUtility!==undefined){ loadout.utility=arena.savedUtility; arena.savedUtility=undefined; }
    practiceMode=null; state='select'; selPage='arena'; menuOpen=false;
    arena.status=p.winner===authUser.id?'MATCH WON!':'MATCH LOST.'; sfx(p.winner===authUser.id?'pickup':'die');
  } else {
    arena.phase='round_end';
    waveMsg=p.winner?(p.winner===authUser.id?'ROUND WON':'ROUND LOST'):'ROUND DRAW'; waveMsgT=now+2200;
    sfx(p.winner===authUser.id?'pickup':'die');
  }
}
function arenaVoteRematch(){
  if(arena.phase!=='match_end'||!authUser) return;
  arena.rematchVotes.add(authUser.id); arenaSend('rematch',{accept:true}); arena.status='Rematch requested. Waiting for opponent...';
  arenaCheckRematch();
}
function arenaCheckRematch(){
  if(!authUser||authUser.id!==arena.hostId||arena.phase!=='match_end'||!arena.opponent) return;
  if(arena.rematchVotes.has(authUser.id)&&arena.rematchVotes.has(arena.opponent.id)){
    const p={from:authUser.id,room:arena.room,epoch:arena.matchEpoch+1,round:0,
             scores:{[authUser.id]:0,[arena.opponent.id]:0}};
    arenaApplyRematchStart(p); arenaSend('rematch_start',p);
    arena.localReady=true; arena.remoteReady=true; arenaStartMapVote();
  }
}
function arenaPlayAgain(){ leaveArena('',false); arenaQuickMatch(); }
function leaveArena(status,toHub){
  if(!arena) return;
  if(typeof isPartyCpuMatch==='function'&&isPartyCpuMatch()){ partyCpuAbort(status||'You left the Party CPU match.',true); return; }
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()){ offlineCpu2v2Leave(status,toHub); return; }
  const wasBot=isBotArena(),returnToAiLearning=wasBot&&arena.botAdminTest&&arena.botAdminReturnToLearning&&
    typeof isMainAdmin==='function'&&isMainAdmin(),
    aiLearningReturnPage=String(arena.botAdminReturnPage||'hub'),
    aiLearningReturnDifficulty=wasBot&&arena.botAdminTest?clamp(Math.floor(+arena.botDifficulty||0),0,4):4,
    aiLearningReturnModelId=wasBot&&arena.botAdminTest?String(arena.botModelId||LATEST_BOT_MODEL_ID):'',
    aiLearningSavedLoadout=wasBot&&arena.botAdminTest&&arena.botAdminSavedLoadout?
      Object.assign({},arena.botAdminSavedLoadout):null;
  if(wasBot&&typeof cancelBotLadderSubmission==='function')cancelBotLadderSubmission(arena);
  const oldMatchChannel=arena.matchChannel,forfeitAnnounced=oldMatchChannel&&authUser?arenaNotifyDeparture('left'):false;
  if(arena.disconnectTimer) clearTimeout(arena.disconnectTimer);
  if(arena.hazardArbitrations instanceof Map) for(const a of arena.hazardArbitrations.values()) if(a&&a.timer) clearTimeout(a.timer);
  arenaDropChannel(arena.queueChannel);
  // Give an explicit forfeit broadcast one brief websocket flush window. An
  // unannounced close is still covered by the opponent's Presence deadline.
  if(forfeitAnnounced) setTimeout(()=>arenaDropChannel(oldMatchChannel),150);
  else arenaDropChannel(oldMatchChannel);
  if(arena.savedUtility!==undefined) loadout.utility=arena.savedUtility;
  if(aiLearningSavedLoadout) loadout={primary:aiLearningSavedLoadout.primary||null,
    secondary:aiLearningSavedLoadout.secondary||null,melee:aiLearningSavedLoadout.melee||null,
    utility:aiLearningSavedLoadout.utility||null};
  if(practiceMode==='arena'){
    practiceMode=null;
    enemies=[]; bullets=[]; ebullets=[]; pickups=[]; damageNumbers=[]; grenades=[]; pearls=[]; balls=[]; flames=[]; freezeFx=[]; splitBalls=[];
    daggersOut=null; comboStep=0; comboNextT=0; parryUntil=0; parrySeq=0; teraHitCharge=15; fistFlurryUntil=0; sawChargeUntil=0;
  }
  const msg=status||''; arena=freshArena(msg||'Casual 1v1 ready.');
  if(state==='play'||state==='over'||state==='upgrade') state='select';
  if(wasBot){
    pendingGameMode=null; modeBoardMode=toHub?null:'endless';
    if(returnToAiLearning){
      modeBoardMode=null; selPage=aiLearningReturnPage; aiLearningDifficulty=aiLearningReturnDifficulty;aiLearningSelectedModelId=aiLearningReturnModelId;
      aiLearningNotice='Returned from '+botModelRelease(aiLearningReturnModelId).name+' at IMPOSSIBLE. Account ladder was unchanged.';
      aiLearningOpen=true; menuOpen=false; aiming=false; rmbAim=false;
      return;
    }
    selPage=toHub?'hub':'offlinecpu'; menuOpen=false; aiming=false; rmbAim=false;
    return;
  }
  if(toHub){ pendingGameMode=null; modeBoardMode=null; }
  selPage=toHub?'hub':'arena'; menuOpen=false; aiming=false; rmbAim=false;
}
function arenaCopyCode(){
  const code=arena.room; if(!code) return;
  try{
    const p=navigator.clipboard&&navigator.clipboard.writeText(code);
    if(p&&p.then) p.then(()=>arena.status='Room code copied: '+code).catch(()=>arena.status='Room code: '+code);
    else arena.status='Room code: '+code;
  }catch(e){ arena.status='Room code: '+code; }
  sfx('pickup');
}
