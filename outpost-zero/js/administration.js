"use strict";

// MAIN ADMINS have every power; CO-ADMINS get the shared ones (test mode, commands) but not storage.
const MAIN_ADMINS = ['tmilsanmilla@gmail.com'];     // full access
const CO_ADMINS   = [];                             // add co-admin emails here
function adminEmail(){ return String((authUser&&authUser.email)||'').toLowerCase(); }
function isCreator(){ return !sb || adminEmail()===ROOT_ADMIN; }   // tmilsanmilla: always top rank
function isMainAdmin(){ return isCreator() || MAIN_ADMINS.includes(adminEmail()) || adminRoles[adminEmail()]==='main'; }
function isCoAdmin(){ return CO_ADMINS.includes(adminEmail()) || adminRoles[adminEmail()]==='co'; }
function myRank(){ return isCreator()?'creator' : isMainAdmin()?'main' : isCoAdmin()?'co' : ''; }
function adminRoster(){                              // creator first, then the table
  const r=[{email:ROOT_ADMIN, rank:'creator'}];
  for(const e of Object.keys(adminRoles)) if(e!==ROOT_ADMIN) r.push({email:e, rank:adminRoles[e]==='main'?'main':'co'});
  return r;
}
function isAdmin(){ return isMainAdmin() || isCoAdmin(); }   // any admin (preview !sb -> main)
let unrankedRun=false;                              // next-season (early access) weapons -> no leaderboard
let adminOpen=false, adminUsed=false, adminBtnRect={x:-99,y:-99,w:0,h:0}, adminRects=[];
let testMode=false;                                 // test mode (all admins); storage is a viewer popout now
let adminPanelOpen=false, adminHubBtnRect=null, adminPanelRects=[];
let aiLearningOpen=false, aiLearningRects=[], aiLearningModelLevel=1, aiLearningNotice='';
const ROOT_ADMIN='tmilsanmilla@gmail.com';          // can never be kicked or demoted
let adminRoles={};                                  // email -> 'main'|'co' (from the Supabase admins table)
let banners=[], pendingBanners=[], updatesFeed={staff:[],player:[]};
let inboxTab='msgs';
let postOpen=false, updatesOpen=false, updatesHubBtnRect=null, updatesRects=[], staffReport=false;
let adminsOpen=false, msgsOpen=false, adminsHubBtnRect=null, msgsHubBtnRect=null, adminsRects=[], msgsRects=[];
let scoresOpen=false, scoresRects=[], scoreEditOpen=false, scoreReqs=[];
let pePanelTab='items';
let peStep='choose', peMode='edit', peTarget='', peData=null, peEdit=null, peBusy=false;
let lookupBtnRect=null;
// Public lookup is username + high score only. Private account state is loaded
// only through the existing admin-only RPC after an admin enters an email.
function canSeeStats(){ return isAdmin(); }
function canEditPlayer(){ return isMainAdmin(); }
function canEditLoadedPlayer(){ return canEditPlayer()&&peData&&!peData.publicOnly&&peTarget.indexOf('@')>0; }
function canBan(){ return isMainAdmin(); }            // main admins may ban directly now
function openAiLearning(){
  if(!isMainAdmin()){ aiLearningOpen=false; sfx('dry'); return false; }
  aiLearningModelLevel=typeof botTrainingLevel==='function'?botTrainingLevel():1;
  aiLearningNotice='Refreshing the shared model...';
  adminPanelOpen=false; aiLearningOpen=true;
  if(typeof refreshGlobalBotTraining==='function') void refreshGlobalBotTraining(true).then(()=>{
    if(!aiLearningOpen) return;
    aiLearningModelLevel=botTrainingLevel(); aiLearningNotice='Shared model is up to date.';
  });
  return true;
}
function closeAiLearning(){ aiLearningOpen=false; aiLearningNotice=''; }
const PE_ITEMS=()=>GEM_SHOP.map(it=>it.key);          // everything ownable
function normalizedPlayerOwned(value){
  if(Array.isArray(value)){ const out={}; for(const key of value) out[key]=true; return out; }
  return value&&typeof value==='object'?value:{};
}
function normalizedPlayerData(value,publicOnly){
  const d=value&&typeof value==='object'?value:{};
  return {
    score:Math.max(0,Math.floor(+(d.high_score!=null?d.high_score:d.score)||0)),
    publicMetric:d.public_metric==='arena_wins'?'1v1 WINS':'ENDLESS SCORE',
    gems:Math.max(0,Math.floor(+d.gems||0)),coins:Math.max(0,Math.floor(+d.coins||0)),
    streak:Math.max(0,Math.floor(+d.streak||0)),
    longestStreak:Math.max(0,Math.floor(+(d.longest_streak!=null?d.longest_streak:d.longestStreak)||0)),
    lastLogin:d.last_login||d.lastLogin||'',owned:normalizedPlayerOwned(d.owned),
    pow:d.pow&&typeof d.pow==='object'?d.pow:{},cosmetics:Math.max(0,Math.floor(+d.cosmetics||0)),
    animations:Math.max(0,Math.floor(+d.animations||0)),daily:Array.isArray(d.daily)?d.daily:[],
    wheelSpins:Math.max(0,Math.floor(+(d.wheel_spins!=null?d.wheel_spins:d.wheelSpins)||0)),
    ban:d.ban||null,publicOnly:!!publicOnly
  };
}
async function lookupPlayer(target){
  peBusy=true; peData=null; peEdit=null;
  try{
    const q=String(target||'').trim();
    if(isAdmin()&&q.indexOf('@')>0){
      const {data,error}=await sb.rpc('admin_get_player',{target_email:q.toLowerCase()});
      if(error) throw error;
      const d=Array.isArray(data)?data[0]:data; if(!d) throw new Error('not found');
      peData=normalizedPlayerData(d,false);
      peTarget=q.toLowerCase();
    } else {
      const publicQuery=/^[A-Za-z0-9_]{3,32}$/.test(q)||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      if(!publicQuery) throw new Error('invalid public lookup');
      const {data,error}=await sb.rpc('get_outpost_zero_public_player',{p_query:q});
      if(error) throw error;
      const d=Array.isArray(data)?data[0]:data; if(!d||!d.user_id) throw new Error('not found');
      peData=normalizedPlayerData(d,true);
      peTarget=leaderboardUsername(d);
    }
    peEdit={score:peData.score, gems:peData.gems, coins:peData.coins,
            owned:Object.assign({}, peData.owned), pow:Object.assign({}, peData.pow)};
    peStep='panel';
  }catch(e){ peData=null; }
  peBusy=false;
}
function peDirty(){
  if(!canEditLoadedPlayer()||!peEdit) return false;
  if(peEdit.score!==peData.score||peEdit.gems!==peData.gems||peEdit.coins!==peData.coins) return true;
  for(const k of PE_ITEMS()) if(!!peEdit.owned[k]!==!!peData.owned[k]) return true;
  for(const pu of POWERUPS) if((peEdit.pow[pu.id]||0)!==(peData.pow[pu.id]||0)) return true;
  return false;
}
function pePatch(){
  const pt={};
  if(peEdit.score!==peData.score) pt.score=peEdit.score;
  if(peEdit.gems!==peData.gems)   pt.gems=peEdit.gems;
  if(peEdit.coins!==peData.coins) pt.coins=peEdit.coins;
  const g=[],r=[];
  for(const k of PE_ITEMS()){
    if(peEdit.owned[k] && !peData.owned[k]) g.push(k);
    if(!peEdit.owned[k] && peData.owned[k]) r.push(k);
  }
  if(g.length) pt.grant=g;
  if(r.length) pt.revoke=r;
  const pw={}; let anyPw=false;
  for(const pu of POWERUPS){
    const v=Math.max(0, Math.min(99, Math.round(peEdit.pow[pu.id]||0)));
    if(v!==(peData.pow[pu.id]||0)) anyPw=true;
    if(v) pw[pu.id]=v;
  }
  if(anyPw) pt.pow=pw;                                // upgrades (stocked powerups)
  return pt;
}
async function peApply(){
  if(!canEditLoadedPlayer()||!peDirty()) return;
  const pt=pePatch();
  peBusy=true;
  try{
    if(isCreator()){ await applyPlayerEdit(peTarget, pt); await lookupPlayer(peTarget); fetchBoard(); }
    else{
      await sb.from('player_requests').insert({requested_by:adminEmail(), target_email:peTarget, patch:pt, status:'pending'});
      peEdit={score:peData.score, gems:peData.gems, coins:peData.coins, owned:Object.assign({}, peData.owned)};
      fetchScoreReqs();
    }
  }catch(e){}
  peBusy=false;
}
function peNum(label, cur, cap){
  let v; try{ v=window.prompt(label, String(cur)); }catch(e){ v=null; }
  if(v===null || String(v).trim()==='') return cur;
  return Math.max(0, Math.min(cap, Math.round(+v||0)));
}
let myBan=null, banMsgT=0;                            // {until, note, scopes} when banned
function deviceId(){
  let d=null;
  try{ d=localStorage.getItem('oz_device'); }catch(e){}
  if(!d){
    d='d'+Math.random().toString(36).slice(2)+Date.now().toString(36);
    try{ localStorage.setItem('oz_device', d); }catch(e){}
  }
  return d;
}
function banScopes(){ return (myBan && myBan.scopes) ? myBan.scopes : []; }
function banBlocksPlay(){ const sc=banScopes(); return sc.includes('account')||sc.includes('device'); }
function banBlocksBoard(){ return !!myBan; }          // any live ban keeps you off the leaderboard
async function fetchScoreReqs(){
  if(!sb || !isMainAdmin()) return;
  try{
    const { data } = await sb.from('player_requests').select('id,requested_by,target_email,patch,status,created_at')
      .eq('status','pending').order('id',{ascending:false}).limit(20);
    scoreReqs=data||[];
  }catch(e){ scoreReqs=[]; }
}
// a short human summary of a patch, for the pending list
function patchSummary(pt){
  if(!pt) return '';
  const bits=[];
  if(pt.score!=null) bits.push('score '+pt.score);
  if(pt.gems!=null)  bits.push('gems '+pt.gems);
  if(pt.coins!=null) bits.push('coins '+pt.coins);
  if(pt.pow) bits.push('upgrades set');
  if(pt.grant && pt.grant.length) bits.push('+'+pt.grant.join('/'));
  if(pt.revoke && pt.revoke.length) bits.push('-'+pt.revoke.join('/'));
  const sc=(pt.scopes||[]).join('+');
  if(pt.ban==='perm') bits.push('BAN permanent'+(sc?' ['+sc+']':''));
  else if(pt.ban==='unban') bits.push('UNBAN');
  else if(pt.ban) bits.push('BAN '+pt.ban+'d'+(sc?' ['+sc+']':''));
  return bits.join(' \u00b7 ') || 'no changes';
}
async function fetchMyBan(){
  if(!sb){ myBan=null; return; }
  try{
    const { data } = await sb.rpc('my_ban', {p_device: deviceId()});   // matches this account or this device
    const d = Array.isArray(data) ? data[0] : data;
    if(!d){ myBan=null; return; }
    if(d.until && Date.parse(d.until) < Date.now()){ myBan=null; return; }          // expired
    if(isCreator()){ myBan=null; return; }                                          // the creator is never banned
    myBan={until:d.until, note:d.note||'', scopes: Array.isArray(d.scopes)? d.scopes : ['account']};
  }catch(e){ myBan=null; }
}
function banBlurb(){
  if(!myBan) return '';
  const when = myBan.until ? ('until '+String(myBan.until).slice(0,10)) : 'permanently';
  const sc=banScopes();
  const what = sc.includes('device') ? 'This device is banned'
             : sc.includes('account') ? 'Your account is banned'
             : 'You are barred from the leaderboard';
  return what+' '+when+(myBan.note?' \u2014 '+myBan.note:'');
}
function openScoreEdit(){
  scoreEditOpen=true; scoresOpen=false; adminPanelOpen=false;
  $('scorewrap').style.display='flex'; $('scorestatus').textContent='';
  for(const id of ['scoreemail','scoreval','pgems','pcoins','pgrant','prevoke','pnote']) $(id).value='';
  $('pban').value='';
  $('pscope_account').checked=true; $('pscope_device').checked=false; $('pscope_board').checked=false;
  const banning = peMode==='ban';
  // Admin edit/ban targets private email; normal player lookup targets username.
  for(const id of ['scoreval','pgems','pcoins','pgrant','prevoke']) $(id).style.display='none';
  $('pban').style.display   = banning?'':'none';
  $('pscopes').style.display= banning?'':'none';
  $('pnote').style.display  = banning?'':'none';
  $('scoretitle').textContent = banning ? '\u26D4 BAN PLAYER'
                              : canEditPlayer() ? '\u270E PLAYER EDIT' : '\uD83D\uDD0D PLAYER LOOKUP';
  const privateEmailMode=banning||isAdmin(), targetInput=$('scoreemail');
  targetInput.type=privateEmailMode?'email':'text';
  targetInput.inputMode=privateEmailMode?'email':'text';
  targetInput.autocomplete='off';
  targetInput.autocapitalize='none';
  $('scorehint').textContent = banning
    ? 'Who are you banning? Pick how long, what it covers, and leave a note.'
    : isAdmin() ? 'Enter the player\u2019s private account email.'
    : 'Enter the player\u2019s username.';
  targetInput.placeholder=privateEmailMode?'player@email.com':'username';
  $('scoresend').textContent = banning ? (isCreator()?'BAN':'REQUEST BAN') : 'LOOK UP';
  try{ $('scoreemail').focus(); }catch(e){}
}
function itemList(v){
  return String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,20);
}
function buildPatch(){                                // read the form into a patch, or return an error
  const email=String($('scoreemail').value||'').trim().toLowerCase();
  if(!email || email.indexOf('@')<0) return {err:'enter a valid email'};
  const num=(id,cap)=>{ const raw=String($(id).value||'').trim();
    if(raw==='') return null; return Math.max(0, Math.min(cap, Math.round(+raw||0))); };
  const pt={};
  const sc=num('scoreval',99999999); if(sc!==null) pt.score=sc;
  const gm=num('pgems',9999999);     if(gm!==null) pt.gems=gm;
  const cn=num('pcoins',9999999);    if(cn!==null) pt.coins=cn;
  const g=itemList($('pgrant').value), r=itemList($('prevoke').value);
  if(g.length) pt.grant=g;
  if(r.length) pt.revoke=r;
  const ban=String($('pban').value||'');
  if(ban && ban!=='unban' && email===ROOT_ADMIN) return {err:'the creator cannot be banned'};
  if(ban){
    pt.ban = ban==='perm' ? 'perm' : ban==='unban' ? 'unban' : String(Math.max(1,Math.min(3650,+ban||1)));
    if(ban!=='unban'){
      const sc=[];
      if($('pscope_account').checked) sc.push('account');
      if($('pscope_device').checked)  sc.push('device');
      if($('pscope_board').checked)   sc.push('leaderboard');
      if(!sc.length) return {err:'pick what the ban covers'};
      pt.scopes=sc;
    }
  }
  const note=String($('pnote').value||'').trim().slice(0,200);
  if(note) pt.note=note;
  if(!Object.keys(pt).filter(k=>k!=='note').length) return {err:'nothing to change'};
  if(pt.ban && pt.ban!=='unban' && !pt.note) return {err:'a ban needs a note'};
  return {email, patch:pt};
}
async function applyPlayerEdit(email, patch){          // creator only: the server re-checks the rank
  email=String(email).toLowerCase();
  if(patch && patch.ban && patch.ban!=='unban' && email===ROOT_ADMIN) throw new Error('creator cannot be banned');
  const { data, error } = await sb.rpc('admin_edit_player', {target_email:email, patch});
  if(error) throw error;
  if(data===false || data===null) throw new Error('no such player');
  return true;
}
function closeScoreEdit(){ scoreEditOpen=false; $('scorewrap').style.display='none'; if(!scoresOpen){ scoresOpen=true; peStep=peData?'panel':'choose'; } }
async function submitScoreEdit(){
  if(peMode!=='ban'){
    const query=String($('scoreemail').value||'').trim();
    if(isAdmin()){
      if(!query||query.indexOf('@')<1){ $('scorestatus').textContent='enter a valid email'; return; }
    } else if(!/^[A-Za-z0-9_]{3,32}$/.test(query)){
      $('scorestatus').textContent='enter a valid username'; return;
    }
    if(!sb){ $('scorestatus').textContent='preview build \u2014 works on the live site'; return; }
    $('scorestatus').textContent='looking up...';
    await lookupPlayer(query);
    if(!peData){ $('scorestatus').textContent=isAdmin()?'no player with that email':'username not found'; return; }
    closeScoreEdit(); scoresOpen=true; peStep='panel';
    return;
  }
  const f=buildPatch();
  if(f.err){ $('scorestatus').textContent=f.err; return; }
  if(!sb){ $('scorestatus').textContent='preview build \u2014 works on the live site'; return; }
  if(!canEditPlayer()){ $('scorestatus').textContent='not allowed'; return; }
  $('scorestatus').textContent='working...';
  try{
    if(isCreator() || (peMode==='ban' && canBan())){      // mains can ban outright
      await applyPlayerEdit(f.email, f.patch);
      $('scorestatus').textContent='player updated';
      fetchBoard(); fetchPlayersData();
    } else {
      const { error } = await sb.from('player_requests').insert(
        {requested_by: adminEmail(), target_email: f.email, patch: f.patch, status:'pending'});
      if(error) throw error;
      $('scorestatus').textContent='sent to the creator for approval';
    }
    setTimeout(closeScoreEdit, 1200);
  }catch(err){ $('scorestatus').textContent='failed \u2014 check the email and try again'; }
}
async function approveScoreReq(r){                  // creator only
  if(!isCreator() || !sb) return;
  try{
    await applyPlayerEdit(r.target_email, r.patch);
    await sb.from('player_requests').update({status:'approved', decided_by:adminEmail()}).eq('id',r.id);
    fetchBoard();
  }catch(e){
    try{ await sb.from('player_requests').update({status:'failed', decided_by:adminEmail()}).eq('id',r.id); }catch(e2){}
  }
  fetchScoreReqs();
}
async function rejectScoreReq(r){
  if(!isCreator() || !sb) return;
  try{ await sb.from('player_requests').update({status:'rejected', decided_by:adminEmail()}).eq('id',r.id); }catch(e){}
  fetchScoreReqs();
}
let archOpen=false, archTab='msgs', archRects=[], storageOpen=false, storageRects=[], archHubBtnRect=null;
let updatesResolved=[];
let adminMsgs=[], unreadMsgs=0, msgOpen=false, msgTo='';
async function fetchMsgs(){
  if(!sb || !authUser){ return; }
  try{
    const { data } = await sb.from('admin_msgs').select('id,from_email,to_email,message,read,read_at,archived,created_at')
      .order('id',{ascending:false}).limit(30);
    adminMsgs=data||[];
    const me=adminEmail();
    unreadMsgs=adminMsgs.filter(m=>m.to_email===me && !m.read).length;
  }catch(e){}
}
function msgArchived(m){                             // manual archive, or auto 7 days after being read
  if(m.archived) return true;
  if(m.read && m.read_at && (Date.now()-Date.parse(m.read_at)) > 7*86400000) return true;
  return false;
}
async function markMsgsRead(){
  const me=adminEmail(), ts=new Date().toISOString();
  if(sb && authUser){
    try{ await sb.from('admin_msgs').update({read:true, read_at:ts}).eq('to_email',me).eq('read',false); }catch(e){}
  }
  for(const m of adminMsgs) if(m.to_email===me && !m.read){ m.read=true; m.read_at=ts; }
  unreadMsgs=0;
}
async function archiveMsg(id){                        // recipients can tuck a message away early
  const me=adminEmail();
  const m=adminMsgs.find(x=>x.id===id);
  if(m && m.to_email===me){ m.archived=true; }
  if(sb && authUser){ try{ await sb.from('admin_msgs').update({archived:true}).eq('id',id); }catch(e){} }
}
let composePickOpen=false;
function openComposePick(){ composePickOpen=true; fetchAdmins(); }
function drawComposePick(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(420,W-24), ph=Math.min(400,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText('\u270E WHO TO?', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('pick an admin to message', W/2, py+42);
  msgsRects=[];                                      // the picker owns the rects while it is up
  const x0=px+16, rw=pw-32; let y=py+56;
  const me=adminEmail();
  const list=adminRoster().filter(r=>r.email!==me);
  if(!list.length){
    ctx.fillStyle='#5a5648'; ctx.fillText('no other admins yet', W/2, y+14);
  }
  for(const r of list.slice(0,8)){
    const h=30;
    if(y+h>py+ph-52) break;
    msgsRects.push({x:x0,y,w:rw,h,id:'to:'+r.email});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=hv?'rgba(167,193,94,0.28)':'rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(r.email, rw-90), x0+10, y+h/2);
    ctx.textAlign='right'; ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText(r.rank==='creator'?'CREATOR':r.rank==='main'?'MAIN':'CO', x0+rw-10, y+h/2);
    ctx.textBaseline='alphabetic';
    y+=h+5;
  }
  const cbw=Math.min(140,pw-40), cbh=28, cbx=W/2-cbw/2, cby=py+ph-36;
  msgsRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'pickcancel'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#d05548':'rgba(208,85,72,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#e0a8a0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText('CANCEL', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='top';
}
function openMsgCompose(to){
  msgTo=String(to||'').toLowerCase(); if(!msgTo) return;
  msgKind='admin'; socialMessageTo=null;
  msgOpen=true; adminsOpen=false;
  $('msgwrap').style.display='flex'; $('msgstatus').textContent='';
  $('msgmsg').value='';
  $('msgto').textContent='to: '+msgTo;
  const title=$('msgbox').querySelector('h2'); if(title) title.textContent='✉ MESSAGE';
  try{ $('msgmsg').focus(); }catch(e){}
}
function closeMsgCompose(){
  msgOpen=false; $('msgwrap').style.display='none'; msgKind='admin'; socialMessageTo=null;
  const title=$('msgbox').querySelector('h2'); if(title) title.textContent='✉ MESSAGE';
}
async function sendMsg(){
  if(msgKind==='social'){ await sendSocialMessage(); return; }
  const txt=($('msgmsg').value||'').trim();
  if(!txt){ $('msgstatus').textContent='write something first'; return; }
  if(!sb){
    adminMsgs.unshift({id:Date.now(), from_email:'preview', to_email:msgTo, message:txt.slice(0,500), read:false, created_at:new Date().toISOString()});
    $('msgstatus').textContent='sent (preview only)'; $('msgmsg').value='';
    setTimeout(closeMsgCompose, 900); return;
  }
  $('msgstatus').textContent='sending...';
  try{
    const { error } = await sb.from('admin_msgs').insert({ from_email: adminEmail()||'admin', to_email: msgTo, message: txt.slice(0,500) });
    if(error) throw error;
    $('msgstatus').textContent='sent!';
    $('msgmsg').value='';
    setTimeout(closeMsgCompose, 900);
  }catch(err){ $('msgstatus').textContent='could not send \u2014 try again'; }
}
let bannerXRect=null, hubPostsRect=null, bannerDismissed=+((typeof localStorage!=='undefined'&&localStorage.getItem('oz_banner_dismiss'))||0);
async function fetchAdmins(){
  if(!sb || !authUser) return;
  try{
    const { data } = await sb.from('admins').select('email,role');
    adminRoles={}; (data||[]).forEach(r=>{ adminRoles[String(r.email||'').toLowerCase()]=r.role; });
  }catch(e){}
  syncFallAccess();                                  // role changes immediately grant/revoke admin preview
}
async function fetchBanners(){
  if(!sb) return;
  try{
    const { data } = await sb.from('banners').select('id,author,message,approved,created_at')
      .order('id',{ascending:false}).limit(10);
    const all=data||[];
    banners=all.filter(b=>b.approved);
    pendingBanners=all.filter(b=>!b.approved);
  }catch(e){}
}
async function fetchUpdatesFeed(){
  if(!sb){ updatesFeed={staff:[],player:[]}; updatesResolved=[]; return; }
  try{
    const { data } = await sb.from('reports').select('id,name,message,created_at,meta,resolved')
      .order('id',{ascending:false}).limit(40);
    const all=data||[];
    const isStaff=r=>(r.meta&&r.meta.staff) || String(r.message||'').indexOf('[STAFF]')===0;
    const open=all.filter(r=>!r.resolved);
    updatesFeed={ staff: open.filter(isStaff), player: open.filter(r=>!isStaff(r)) };
    updatesResolved=all.filter(r=>r.resolved);
  }catch(e){ updatesFeed={staff:[],player:[]}; updatesResolved=[]; }
}
async function resolveReport(id){                    // mains: mark handled; it moves to the archive
  if(!isMainAdmin()) return;
  if(!sb){
    for(const k of ['staff','player']){
      const i=updatesFeed[k].findIndex(r=>r.id===id);
      if(i>=0){ const r=updatesFeed[k][i]; r.resolved=true; updatesResolved.unshift(r); updatesFeed[k].splice(i,1); }
    }
    return;
  }
  try{ await sb.from('reports').update({resolved:true}).eq('id',id); }catch(e){}
  fetchUpdatesFeed();
}
function openPost(){ postOpen=true; adminPanelOpen=false; $('postwrap').style.display='flex'; $('poststatus').textContent=''; try{$('postmsg').focus();}catch(e){} }
function closePost(){ postOpen=false; $('postwrap').style.display='none'; }
async function sendPost(){
  const msg=($('postmsg').value||'').trim();
  if(!msg){ $('poststatus').textContent='write something first'; return; }
  if(!sb){                                          // preview: banner goes up locally, instantly
    banners.unshift({id:Date.now(), author:'preview', message:msg.slice(0,300), approved:true});
    $('poststatus').textContent='posted (preview only)'; $('postmsg').value='';
    setTimeout(closePost, 900); return;
  }
  $('poststatus').textContent='posting...';
  try{
    const live=isMainAdmin();                       // mains go live now; co-admins await approval
    const { error } = await sb.from('banners').insert({ author: adminEmail()||'admin', message: msg.slice(0,300), approved: live });
    if(error) throw error;
    $('poststatus').textContent= live ? 'posted — live for everyone!' : 'submitted — awaiting main-admin approval';
    $('postmsg').value='';
    fetchBanners();
    setTimeout(closePost, 1100);
  }catch(err){ $('poststatus').textContent='could not post — try again'; }
}
async function approveBanner(id){
  if(!sb){ const i=pendingBanners.findIndex(b=>b.id===id); if(i>=0){ pendingBanners[i].approved=true; banners.unshift(pendingBanners[i]); pendingBanners.splice(i,1);} return; }
  try{ await sb.from('banners').update({approved:true}).eq('id',id); }catch(e){}
  fetchBanners();
}
async function rejectBanner(id){
  if(!sb){ const i=pendingBanners.findIndex(b=>b.id===id); if(i>=0) pendingBanners.splice(i,1); return; }
  try{ await sb.from('banners').delete().eq('id',id); }catch(e){}
  fetchBanners();
}
async function kickAdmin(email){
  if(!isMainAdmin()) return;                         // co-admins cannot manage the roster
  email=String(email||'').toLowerCase(); if(email===ROOT_ADMIN) return;
  if(!sb){ delete adminRoles[email]; return; }
  try{ await sb.from('admins').delete().eq('email',email); }catch(e){}
  fetchAdmins();
}
async function promoteAdmin(email){
  if(!isMainAdmin()) return;                         // co-admins cannot manage the roster
  email=String(email||'').toLowerCase(); if(email===ROOT_ADMIN) return;
  if(!sb){ adminRoles[email]='main'; return; }
  try{ await sb.from('admins').update({role:'main'}).eq('email',email); }catch(e){}
  fetchAdmins();
}
async function addCoAdmin(){
  if(!isMainAdmin()) return;                         // co-admins cannot manage the roster
  let em; try{ em=window.prompt('co-admin email:'); }catch(e){ em=null; }
  em=String(em||'').trim().toLowerCase(); if(!em || em.indexOf('@')<0) return;
  if(!sb){ adminRoles[em]='co'; return; }
  try{ await sb.from('admins').insert({email:em, role:'co'}); }catch(e){}
  fetchAdmins();
}
const LLR_URL   = 'https://www.youtube.com/@AsrtsbLLR';
const MOVES_URL = 'https://movesforamission.org/donate-now/#1740457740469-d24153b1-38c1';
function powerupMax(id){ return (POWERUPS.find(x=>x.id===id)||{}).max||0; }
const GEM_PRICE_SCALE=10;                           // the whole gem economy uses 10x legacy values
const GEM_SHOP=[
  {key:'ar',      cost:120*GEM_PRICE_SCALE, slot:'primary'},
  {key:'volt',    cost:400*GEM_PRICE_SCALE, slot:'secondary'},
  {key:'dart',    cost:75*GEM_PRICE_SCALE,  slot:'secondary'},
  {key:'hammer',  cost:400*GEM_PRICE_SCALE, slot:'melee'},
  {key:'twinsai', cost:90*GEM_PRICE_SCALE,  slot:'melee'},
  {key:'railgun', cost:60*GEM_PRICE_SCALE,  slot:'primary'},
  {key:'medkit',  cost:200*GEM_PRICE_SCALE, slot:'utility'},
  {key:'grenade', cost:30*GEM_PRICE_SCALE,  slot:'utility'},
  {key:'freezer', cost:30*GEM_PRICE_SCALE,  slot:'utility'},
];
const GEM_PRICE_DEFAULTS={};                        // filled below; lets us reset/compare
for(const it of GEM_SHOP) GEM_PRICE_DEFAULTS[it.key]=it.cost;
function setGemPrice(key,cost){
  const it=GEM_SHOP.find(i=>i.key===key); if(!it) return false;
  cost=Math.max(0, Math.min(9999, Math.round(+cost||0)));
  it.cost=cost; return true;
}
async function fetchPrices(){
  if(!sb) return;
  try{
    const { data } = await sb.from('weapon_prices').select('key,cost');
    for(const r of (data||[])) setGemPrice(r.key, r.cost*GEM_PRICE_SCALE);
  }catch(e){}
}
async function saveGemPrice(key,cost){
  if(!setGemPrice(key,cost)) return;
  if(!sb) return;                                    // preview: local only
  try{ await sb.from('weapon_prices').upsert({key, cost:Math.round(GEM_SHOP.find(i=>i.key===key).cost/GEM_PRICE_SCALE)}); }catch(e){}
}
const DAILY_TASK_DEFS=[
  {id:'kills',  d:'Defeat 40 enemies', goal:40, baseReward:5},
  {id:'waves',  d:'Clear 8 waves',     goal:8,  baseReward:10},
  {id:'bosses', d:'Defeat 3 warlords', goal:3,  baseReward:35},
  {id:'chests', d:'Open a mod chest',  goal:1,  baseReward:20},
].map(t=>Object.assign({},t,{reward:t.baseReward*GEM_REWARD_SCALE}));
const DAILY_ACTIVE_IDS=['kills','waves','chests'];
const DAILY_REWARDS=Object.fromEntries(DAILY_TASK_DEFS.map(t=>[t.id,t.reward]));
function freshDailyTasks(){
  return DAILY_ACTIVE_IDS.map(id=>{
    const t=DAILY_TASK_DEFS.find(x=>x.id===id);
    return {id:t.id,d:t.d,goal:t.goal,reward:t.reward,prog:0,done:false};
  });
}
function normalizeDailyRewards(){
  for(const t of dailyTasks){
    const d=DAILY_TASK_DEFS.find(x=>x.id===t.id); if(!d) continue;
    t.d=d.d; t.goal=d.goal; t.reward=d.reward;
    t.prog=clamp(+t.prog||0,0,t.goal); if(t.done) t.prog=t.goal;
  }
}
function saveMetaLocal(){ try{ localStorage.setItem('oz_meta', JSON.stringify({gems, gv:GEM_ECONOMY_VERSION, gre:gemResetVersion, owned:gemOwned, date:tasksDate, tasks:dailyTasks, coins, cos:cosmeticOwned, cosEq:cosmeticEquipped, pow:powerStock, anim:animOwned, animEq:animEquipped, stk:streakDays, stkMax:streakLongest, stkDay:streakLastDay, refUsed:referralUsed, refPaid:referralPaid, wr:wheelReady, wa:Math.round(wheelAcc), hi:hiScore, mv:musicVol, sv:sfxVol})); }catch(e){} }
function saveMeta(){ saveMetaLocal(); queueProfileSave(); }
