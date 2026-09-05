"use strict";

// Supabase owns enrollment and Elo accounting. Combat is peer-hosted BETA;
// agreement between participants is not a trusted anti-cheat simulation.
let duelService={owner:'',serial:0,busy:false,queue:false,mode:'2v2',ranked:false,
  match:null,invite:null,status:'',nextPoll:0,polling:false,channel:null,live:false,
  profile:null,board:[],rankedMode:'1v1',rankedLoading:false,result:null,resultBusy:false};
function duelServiceUser(){return authUser?String(authUser.id||''):'';}
function duelServiceMode(mode){return ['1v1','2v2','1v1v1'].includes(mode)?mode:'';}
function duelServiceNotice(message){
  duelService.status=String(message||'');
  if(typeof arena!=='undefined'&&arena)arena.status=duelService.status;
  if(typeof party!=='undefined'&&party&&party.accepted)party.status=duelService.status;
  modeBoardNotice=duelService.status;modeBoardNoticeT=performance.now()+5000;
}
function duelServiceError(error){
  const text=String(error&&error.message||error||'Connection failed');
  if(/could not find|does not exist|schema cache/i.test(text))return 'MULTIPLAYER SETUP IS NOT READY · RETRY AFTER THE SQL IS INSTALLED';
  return text.replace(/[_]+/g,' ').slice(0,180);
}
async function duelServiceRpc(name,args={}){
  if(!sb||!duelServiceUser()||navigator.onLine===false)throw new Error('SIGN IN AND RECONNECT TO PLAY');
  const result=await sb.rpc(name,args);if(result.error)throw result.error;return result.data;
}
function duelServiceReset(){
  if(duelService.channel&&sb)try{sb.removeChannel(duelService.channel);}catch(e){}
  if(typeof isMultideviceArena==='function'&&isMultideviceArena())multideviceLeave('ACCOUNT CHANGED');
  duelService={owner:duelServiceUser(),serial:duelService.serial+1,busy:false,queue:false,mode:'2v2',ranked:false,
    match:null,invite:null,status:'',nextPoll:0,polling:false,channel:null,live:false,
    profile:null,board:[],rankedMode:'1v1',rankedLoading:false,result:null,resultBusy:false};
  try{
    const saved=JSON.parse(localStorage.getItem('oz-ranked-result-v1:'+duelService.owner)||'null');
    if(saved&&saved.owner===duelService.owner&&/^[0-9a-f-]{36}$/i.test(saved.matchId)&&['A','B'].includes(saved.winningTeam)&&
      Number.isInteger(saved.scoreA)&&Number.isInteger(saved.scoreB))duelService.result={...saved,nextTry:0};
  }catch(e){}
}
function duelServiceSubscribe(){
  if(!sb||!duelService.owner||duelService.channel)return;
  const owner=duelService.owner,ch=sb.channel('oz-duel-wakeups:'+owner);
  duelService.channel=ch;
  for(const event of ['INSERT','UPDATE'])ch.on('postgres_changes',{event,schema:'public',table:'outpost_zero_duel_wakeups',filter:'user_id=eq.'+owner},()=>{
    if(duelService.owner!==owner||duelService.channel!==ch)return;
    duelService.nextPoll=0;void duelServiceRefresh();
    if(selPage==='ranked')void duelServiceRankedRefresh();
  });
  ch.subscribe(status=>{if(duelService.channel===ch)duelService.live=status==='SUBSCRIBED';});
}
function duelServicePartyMatches(match){
  return !!(match&&match.source==='party'&&party&&party.accepted&&String(party.hostId)===String(match.hostId)&&
    Array.isArray(match.roster)&&match.roster.length===party.members.length&&
    match.roster.every(p=>party.members.some(m=>String(m.id)===String(p.id))));
}
function duelServiceApplyAssignment(response,allowLaunch=true){
  if(!response||typeof response!=='object')return false;
  const match=response.match;
  if(match&&Array.isArray(match.roster)&&match.roster.some(p=>String(p.id)===duelService.owner)){
    // Polling must enforce the same party boundary as invitation broadcasts.
    const known=duelService.match&&duelService.match.matchId===match.matchId;
    if(match.source==='party'&&!known&&!duelServicePartyMatches(match))return false;
    const mine=match.roster.find(p=>String(p.id)===duelService.owner);
    if(response.status==='pending'){
      duelService.invite=match;
      if(duelService.match&&duelService.match.matchId===match.matchId)duelService.match=match;
      duelServiceNotice(match.mode+' PARTY MATCH · '+match.roster.filter(p=>p.accepted).length+'/'+match.roster.length+' READY');
      return true;
    }
    if(response.status==='matched'&&mine.accepted!==false){
      const expected=duelService.queue||(duelService.match&&duelService.match.matchId===match.matchId);
      duelService.invite=null;duelService.match=match;duelService.queue=false;
      if(allowLaunch&&expected&&state==='select'&&selPage==='multidevice'&&
         !(typeof isMultideviceArena==='function'&&isMultideviceArena())){
        duelServiceNotice('MATCH FOUND · CONNECTING');return multideviceLaunch(match);
      }
    }
  }
  if(['expired','left','cancelled','finished'].includes(response.status)&&duelService.match&&
    (!match||match.matchId===duelService.match.matchId)){
    if(typeof isMultideviceArena==='function'&&isMultideviceArena()&&!['match_end','aborted'].includes(multidevice.phase))multideviceLeave('MATCH ENDED BY THE SERVER');
    duelService.queue=false;duelService.invite=null;duelService.match=null;
    duelServiceNotice('MATCH '+response.status.toUpperCase()+' · NO ELO CHANGE');
  }else if(response.status==='idle'&&duelService.queue){
    duelService.queue=false;duelServiceNotice('QUEUE ENDED · JOIN AGAIN');
  }
  return false;
}
async function duelServiceQueue(mode='2v2',ranked=false){
  if(!['1v1','2v2'].includes(mode))return duelServiceNotice('1v1v1 IS PARTY ONLY');
  if(duelService.busy)return false;
  if(typeof testMode!=='undefined'&&testMode)return duelServiceNotice('TURN OFF TEST MODE FOR MULTIPLAYER');
  if(typeof arenaLoadoutReady==='function'&&!arenaLoadoutReady())return duelServiceNotice('CHOOSE YOUR PUBLISHED LOADOUT FIRST');
  if(party&&party.accepted&&party.members.length>1)return duelServiceNotice('LEAVE YOUR PARTY TO JOIN THE SOLO QUEUE · PARTY MATCHES ARE IN PARTY PLAY');
  if(duelService.owner!==duelServiceUser())duelServiceReset();
  const owner=duelService.owner,serial=++duelService.serial;
  duelService.busy=true;duelService.mode=mode;duelService.ranked=ranked;duelService.queue=true;
  duelService.match=null;duelService.invite=null;selPage='multidevice';
  duelServiceNotice('JOINING '+(ranked?'RANKED ':'')+mode+' QUEUE');
  try{
    const response=await duelServiceRpc('join_outpost_zero_duel_queue',{p_mode:mode,p_ranked:ranked,p_loadout:{...loadout,utility:null}});
    if(owner!==duelServiceUser()||serial!==duelService.serial)return false;
    duelServiceNotice('SEARCHING FOR '+(mode==='2v2'?'3 OTHER PLAYERS':'AN OPPONENT'));
    duelServiceApplyAssignment(response);duelService.nextPoll=Date.now()+3000;return true;
  }catch(e){if(owner===duelServiceUser()&&serial===duelService.serial){duelService.queue=false;duelServiceNotice(duelServiceError(e));}return false;}
  finally{if(serial===duelService.serial)duelService.busy=false;}
}
function duelServiceChooseParty(mode){
  if(!duelServiceMode(mode)||!party||!party.accepted||!partyIsHost())return partyModeNotice('ONLY THE PARTY LEADER CAN START A MATCH');
  if(party.members.length!==({ '1v1':2,'2v2':4,'1v1v1':3 }[mode]))return partyModeNotice(mode+' NEEDS EXACTLY '+({'1v1':2,'2v2':4,'1v1v1':3}[mode])+' PARTY PLAYERS');
  if(!duelServiceUser())return partyModeNotice('EVERY PLAYER MUST SIGN IN FOR MULTI-DEVICE DUELS');
  if(!party.members.every(p=>/^[0-9a-f-]{36}$/i.test(String(p.id))))return partyModeNotice('EVERY PARTY PLAYER MUST SIGN IN FIRST');
  partySetMode(mode,mode+' · CHOOSE YOUR LOADOUT');
  duelService.invite=null;pendingGameMode='partyduel_'+mode;loadoutBackPage='party';selPage='loadout';return true;
}
function duelServiceOpenInvite(){
  const invite=duelService.invite;if(!invite)return false;
  if(!duelServicePartyMatches(invite))return duelServiceNotice('PARTY PLAYERS CHANGED · ASK THE HOST TO START AGAIN');
  pendingGameMode='partyduel_'+invite.mode;loadoutBackPage='party';selPage='loadout';return true;
}
async function duelServicePartyReady(mode){
  if(duelService.busy||!duelServiceMode(mode))return false;
  if(typeof testMode!=='undefined'&&testMode)return duelServiceNotice('TURN OFF TEST MODE FOR MULTIPLAYER');
  if(duelService.owner!==duelServiceUser())duelServiceReset();
  const owner=duelService.owner,serial=++duelService.serial,invite=duelService.invite,partySession=party;
  duelService.busy=true;selPage='multidevice';duelService.mode=mode;duelService.ranked=false;
  try{
    let response;
    if(invite&&invite.mode===mode){
      if(!duelServicePartyMatches(invite))throw new Error('PARTY PLAYERS CHANGED · ASK THE HOST TO START AGAIN');
      response=await duelServiceRpc('accept_outpost_zero_party_duel',{p_match_id:invite.matchId,p_loadout:{...loadout,utility:null}});
    }
    else{
      if(!partyIsHost()||party.members.length!==({'1v1':2,'2v2':4,'1v1v1':3}[mode]))throw new Error('PARTY PLAYERS CHANGED · CHOOSE THE MODE AGAIN');
      const members=party.members.slice().sort((a,b)=>a.order-b.order).map(p=>String(p.id));
      response=await duelServiceRpc('create_outpost_zero_party_duel',{p_mode:mode,p_members:members,p_loadout:{...loadout,utility:null}});
    }
    if(owner!==duelServiceUser()||serial!==duelService.serial)return false;
    if(party!==partySession||!duelServicePartyMatches(response.match)){
      if(response.match)void duelServiceAbortMatch(response.match.matchId);
      throw new Error('PARTY PLAYERS CHANGED · CHOOSE THE MODE AGAIN');
    }
    duelService.match=response.match||null;duelServiceApplyAssignment(response);
    if(response.match)partySend('duel_invite',{matchId:response.match.matchId});
    duelService.nextPoll=0;return true;
  }catch(e){if(owner===duelServiceUser()&&serial===duelService.serial)duelServiceNotice(duelServiceError(e));return false;}
  finally{if(serial===duelService.serial)duelService.busy=false;}
}
async function duelServicePartyReceive(p){
  if(!party||!party.accepted||!p||p.from!==party.hostId||!/^[-0-9a-f]{36}$/i.test(String(p.matchId||'')))return;
  const owner=duelServiceUser(),session=duelService,serial=session.serial,partySession=party,host=party.hostId;if(!owner)return;
  try{
    const response=await duelServiceRpc('get_outpost_zero_duel',{p_match_id:p.matchId});
    if(owner!==duelServiceUser()||session!==duelService||serial!==duelService.serial||party!==partySession||!party.accepted||party.hostId!==host)return;
    if(response.match&&response.match.source==='party'&&response.match.roster.every(p=>party.members.some(m=>m.id===p.id)))duelServiceApplyAssignment(response,false);
  }catch(e){if(session===duelService&&serial===duelService.serial&&party===partySession)duelServiceNotice(duelServiceError(e));}
}
async function duelServiceRefresh(){
  if(duelService.polling||!duelServiceUser())return;
  const owner=duelService.owner,session=duelService,serial=session.serial;session.polling=true;
  try{
    const data=await duelServiceRpc(session.match?'get_outpost_zero_duel':'get_outpost_zero_duel_assignment',session.match?{p_match_id:session.match.matchId}:{});
    if(session===duelService&&owner===duelServiceUser()&&serial===session.serial)duelServiceApplyAssignment(data);
  }
  catch(e){if(session===duelService&&owner===duelServiceUser()&&serial===session.serial&&(session.queue||session.match))duelServiceNotice('CONNECTION RETRY · '+duelServiceError(e));}
  finally{if(session===duelService){session.polling=false;session.nextPoll=Date.now()+5000;}}
}
async function duelServiceCancel(){
  if(duelService.busy)return false;
  const owner=duelServiceUser(),session=duelService,serial=++session.serial,match=session.match||session.invite;session.busy=true;
  try{
    const response=await duelServiceRpc(match?'release_outpost_zero_duel':'leave_outpost_zero_duel_queue',match?{p_match_id:match.matchId}:{});
    if(session!==duelService||owner!==duelServiceUser()||serial!==session.serial)return false;
    if(response&&response.status==='pending'){
      duelServiceNotice('AWAITING RESULT CONFIRMATIONS · RATING NOT FINAL');selPage='multidevice';return false;
    }
    if(typeof isMultideviceArena==='function'&&isMultideviceArena())multideviceLeave('LEFT THE MATCH');
    session.queue=false;session.match=null;session.invite=null;duelServiceNotice('LEFT MULTIPLAYER');selPage=session.ranked?'ranked':'modeboard';return true;
  }catch(e){if(session===duelService&&owner===duelServiceUser()&&serial===session.serial)duelServiceNotice('COULD NOT CONFIRM LEAVING · '+duelServiceError(e));return false;}
  finally{if(session===duelService&&serial===session.serial)session.busy=false;}
}
async function duelServiceRankedRefresh(mode=duelService.rankedMode){
  if(!['1v1','2v2'].includes(mode)||duelService.rankedLoading||!duelServiceUser())return;
  const owner=duelServiceUser(),session=duelService;session.rankedMode=mode;session.rankedLoading=true;
  try{
    const [profile,board]=await Promise.all([duelServiceRpc('get_outpost_zero_ranked_profile'),duelServiceRpc('list_outpost_zero_ranked_leaderboard',{p_mode:mode,p_limit:5})]);
    if(owner!==duelServiceUser()||session!==duelService||session.rankedMode!==mode)return;
    duelService.profile=profile;duelService.board=Array.isArray(board)?board:[];
  }catch(e){if(owner===duelServiceUser()&&session===duelService)duelServiceNotice(duelServiceError(e));}
  finally{if(session===duelService)session.rankedLoading=false;}
}
function duelServiceSubmitRanked(result){
  if(!result||!duelService.match||duelService.match.ranked!==true||result.matchId!==duelService.match.matchId)return false;
  if(typeof testMode!=='undefined'&&testMode)return false;
  if(duelService.result)return duelService.result.matchId===result.matchId;
  duelService.result={...result,owner:duelServiceUser(),nextTry:0};
  try{localStorage.setItem('oz-ranked-result-v1:'+duelService.owner,JSON.stringify(duelService.result));}catch(e){duelServiceNotice('DEVICE STORAGE UNAVAILABLE · KEEP THIS TAB OPEN UNTIL YOUR RATING SAVES');}
  void duelServiceRetryResult();return true;
}
async function duelServiceRetryResult(){
  const result=duelService.result;if(!result||duelService.resultBusy||result.owner!==duelServiceUser())return;
  const session=duelService;session.resultBusy=true;
  try{
    const data=await duelServiceRpc('submit_outpost_zero_ranked_result',{p_match_id:result.matchId,p_winning_team:result.winningTeam,p_score_a:result.scoreA,p_score_b:result.scoreB});
    if(session!==duelService||duelService.result!==result||result.owner!==duelServiceUser())return;
    if(['finalized','disputed','expired','cancelled'].includes(data.status)){
      duelService.result=null;
      try{localStorage.removeItem('oz-ranked-result-v1:'+result.owner);}catch(e){}
      duelServiceNotice(data.status==='finalized'?'RANK + ELO SAVED':data.status==='disputed'?'RESULTS DISAGREED · NO ELO CHANGED':'RESULT EXPIRED · NO ELO CHANGED');
      void duelServiceRankedRefresh();
    }else{duelServiceNotice('AWAITING ALL PLAYERS’ RESULTS · ELO NOT CHANGED YET');result.nextTry=Date.now()+5000;}
  }catch(e){if(duelService.result===result){result.nextTry=Date.now()+5000;duelServiceNotice('RATING SAVE RETRY · '+duelServiceError(e));}}
  finally{if(session===duelService)session.resultBusy=false;}
}
async function duelServiceAcknowledgeStart(matchId){
  const session=duelService,owner=duelServiceUser();
  try{
    const result=await duelServiceRpc('acknowledge_outpost_zero_duel_start',{p_match_id:matchId});
    return session===duelService&&owner===duelServiceUser()&&['pending','matched'].includes(result.status);
  }catch(e){if(session===duelService)duelServiceNotice(duelServiceError(e));return false;}
}
async function duelServiceAbortMatch(matchId){
  const session=duelService;
  try{await duelServiceRpc('abort_outpost_zero_duel_setup',{p_match_id:matchId});if(session===duelService)session.nextPoll=0;}
  catch(e){if(session===duelService)duelServiceNotice('MATCH CLEANUP RETRY · '+duelServiceError(e));}
}
function duelServiceTick(clock){
  if(duelService.owner!==duelServiceUser())duelServiceReset();
  if(!duelService.owner)return;
  duelServiceSubscribe();
  if(!duelService.busy&&clock>=duelService.nextPoll&&(duelService.queue||duelService.match||party&&party.accepted))void duelServiceRefresh();
  if(duelService.result&&clock>=duelService.result.nextTry)void duelServiceRetryResult();
}
