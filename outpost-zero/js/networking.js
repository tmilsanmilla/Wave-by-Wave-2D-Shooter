"use strict";

/* ============================================================
   OUTPOST ZERO — top-down tactical wave shooter
   WASD move · mouse fire · E (or hold RMB) scope aim · R reload
   1-4 swap weapons · ESC menu
   ============================================================ */

/* ============================================================
   AUTH + LEADERBOARD (Supabase)
   Paste your project URL and anon key below. Leave blank to
   run guest-only. The anon key is safe to expose client-side.
   ============================================================ */
const SUPABASE_URL = 'https://edvurrilylypgfyvjyas.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zbDDclXDMzEh92-WCDdpsQ_AYZB9x8I';

const PUBLIC_BOARD_LIMIT=5;
let sb = null, authUser = null, board = [], arenaBoard = [], boardT = 0, recovering = false;
let leaderboardFetchVersion=0;
const leaderboardReadState={endless:'idle',arena:'idle'};
let arenaAuthPending=false, arena=null;
let leaderboardRowRects=[];
const ONBOARDING_VERSION=1;
let onboardingVersion=ONBOARDING_VERSION;
let firstAccountTutorialUserId='', firstAccountWelcomeOpen=false, firstAccountWelcomeRects=[];
let authProfileRequestVersion=0;
let postUsernameGateUserId='';
let accountSettingsOpen=false, accountSettingsRequiredUsername=false, accountSettingsBusy=false, accountSettingsUserId='';
let accountMenuOpen=false, accountMenuConfirming=false, accountMenuBusy=false, accountMenuUserId='', accountMenuReturnView='';
const $ = id => document.getElementById(id);

function cleanUsername(value){
  return String(value||'').trim().replace(/^@/,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
}
function leaderboardNeedsUsername(row){
  if(!row) return false;
  if(row.needsUsername===true) return true;
  const username=cleanUsername(row.username!=null?row.username:row.name).toLowerCase();
  // Newer database migrations may return this explicit marker instead of the
  // deterministic op_<uuid> transport fallback. Treat both spellings as the
  // same unfinished identity so the owner is routed to Choose Username.
  if(username==='username_not_set'||username==='usernamenotset') return true;
  const suffix=String(row.user_id!=null?row.user_id:row.userId||'').replace(/-/g,'').toLowerCase();
  return !!suffix&&(username==='op_'+suffix.slice(0,20)||username==='op_'+suffix.slice(0,8));
}
function leaderboardReadFailure(error){
  const text=[error&&error.code,error&&error.message,error&&error.details,error&&error.hint,error]
    .filter(Boolean).join(' ').toLowerCase();
  return /pgrst202|schema cache|could not find[^\n]*function|get_outpost_zero_leaderboard|permission denied|does not exist/.test(text)
    ? 'setup' : 'error';
}
function displayName(u){
  if(!u) return 'guest';
  const own=authUser&&String(u.id||'')===String(authUser.id||'');
  const matchingProfile=own&&typeof socialProfile!=='undefined'&&socialProfile&&socialProfile.handle&&
    (socialProfile.user_id==null||String(socialProfile.user_id)===String(u.id||''));
  if(matchingProfile){
    const live=cleanUsername(socialProfile.handle);
    if(live){
      const key=live.toLowerCase(), suffix=String(u.id||'').replace(/-/g,'').toLowerCase();
      const pending=key==='username_not_set'||key==='usernamenotset'||
        (!!suffix&&(key==='op_'+suffix.slice(0,20)||key==='op_'+suffix.slice(0,8)));
      const needsClaim=typeof usernameNeedsClaim==='function'&&usernameNeedsClaim(socialProfile,u);
      return pending||needsClaim?'operator':live;
    }
  }
  if(own&&typeof usernameNeedsClaim==='function'&&usernameNeedsClaim(null,u)) return 'operator';
  const meta=u.user_metadata||{};
  return cleanUsername(meta.username||meta.preferred_username||meta.full_name||meta.name)||'operator';
}
function leaderboardUsername(row){
  if(leaderboardNeedsUsername(row)){
    const mine=authUser&&String(row.user_id!=null?row.user_id:row.userId||'')===String(authUser.id||'');
    // The signed-in owner already received this email from Supabase Auth, so
    // it is safe to use as their private fallback. Never put another player's
    // email on the public board: the leaderboard RPC deliberately does not
    // return Auth email addresses.
    if(mine) return String(authUser.email||'').trim().slice(0,160)||'CHOOSE USERNAME';
    return 'NEW OPERATOR';
  }
  return cleanUsername(row&&((row.username!=null?row.username:row.name)))||'NEW OPERATOR';
}
function paintUserbar(){
  $('uname').textContent = authUser
    ? (typeof ownerPrivateDisplayName==='function'?ownerPrivateDisplayName(authUser):displayName(authUser))
    : 'not signed in';
  $('uemail').textContent = '';
  $('ubtn').textContent  = authUser ? 'SIGN OUT' : 'SIGN IN';
}
function continueAfterUsernameGate(userId){
  const id=String(userId||''), liveId=authUser?String(authUser.id||''):'';
  if(!id||id!==liveId) return false;
  if(typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()){
    postUsernameGateUserId=id; return false;
  }
  postUsernameGateUserId='';
  processReferral();
  if(!openDailyGate()) maybeFirstRunTutorial();
  return true;
}
function resumeAfterUsernameClaim(){
  const id=authUser?String(authUser.id||''):'';
  if(!id||postUsernameGateUserId!==id||!profileLoaded) return false;
  return continueAfterUsernameGate(id);
}
async function initAuth(){
  if(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase){
    try{
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      // Do not expose a cached signed-in account while getSession is pending.
      // A cache explicitly marked owner:'' is legitimate guest progress and is
      // preserved; an account-owned or legacy-unmarked cache fails closed.
      if(typeof prepareAccountProgressForAuth==='function')prepareAccountProgressForAuth('');
      const { data } = await sb.auth.getSession();
      const initialUser=data.session?data.session.user:null,initialPreviousUserId=authUser?String(authUser.id||''):'',
        initialNextUserId=initialUser?String(initialUser.id||''):'';
      if(initialPreviousUserId!==initialNextUserId){
        if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange(initialNextUserId);
        if(typeof closeAccountMenu==='function')closeAccountMenu(true);
        if(typeof scrubPrivilegedUiForAccountChange==='function')scrubPrivilegedUiForAccountChange();
        if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange(initialNextUserId);
      }
      authUser = initialUser;
      prepareSocialForAccount(authUser?String(authUser.id):'');
      if(authUser) beginUsernameClaimCheck();
      const initialProfileUserId=authUser?String(authUser.id):'',initialAccountChanged=
        typeof prepareAccountProgressForAuth==='function'&&prepareAccountProgressForAuth(initialProfileUserId);
      if(typeof prepareTemporaryWeaponGrantsForAccount==='function')prepareTemporaryWeaponGrantsForAccount(initialProfileUserId,!initialAccountChanged);
      prepareLastLoadoutForAccount(initialProfileUserId);
      prepareBotLadderForAccount(authUser?String(authUser.id):'');
      void refreshBotLadder(true);
      if(typeof refreshActiveBotModel==='function')void refreshActiveBotModel(true);
      sb.auth.onAuthStateChange((_e, sess)=>{
        if(_e==='PASSWORD_RECOVERY'){
          recovering=true;
          if(typeof closeAccountMenu==='function')closeAccountMenu(true);
        }
        const previousAuthUserId=authUser?String(authUser.id||''):'',nextAuthUser=sess?sess.user:null,
          nextAuthUserId=nextAuthUser?String(nextAuthUser.id||''):'';
        if(previousAuthUserId!==nextAuthUserId){
          if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange(nextAuthUserId);
          if(typeof closeAccountMenu==='function')closeAccountMenu(true);
          if(typeof scrubPrivilegedUiForAccountChange==='function')scrubPrivilegedUiForAccountChange();
          if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange(nextAuthUserId);
        }
        authUser = nextAuthUser;
        if(typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen){
          const liveSettingsUser=authUser?String(authUser.id||''):'';
          if((!liveSettingsUser||liveSettingsUser!==accountSettingsUserId)&&typeof closeAccountSettings==='function') closeAccountSettings(true);
          else if(authUser&&typeof accountSettingsSync==='function') accountSettingsSync();
        }
        const profileUserId=authUser ? String(authUser.id) : '';
        prepareSocialForAccount(profileUserId);
        if(authUser&&!recovering) beginUsernameClaimCheck();
        const accountChanged=typeof prepareAccountProgressForAuth==='function'&&prepareAccountProgressForAuth(profileUserId);
        if(typeof prepareTemporaryWeaponGrantsForAccount==='function')prepareTemporaryWeaponGrantsForAccount(profileUserId,!accountChanged);
        prepareLastLoadoutForAccount(profileUserId);
        prepareBotLadderForAccount(profileUserId);
        void refreshBotLadder(false);
        if(typeof refreshActiveBotModel==='function')void refreshActiveBotModel(false);
        if(typeof flushAiTrainingQueue==='function')void flushAiTrainingQueue();
        const profileRequestVersion=++authProfileRequestVersion;
        if(postUsernameGateUserId&&postUsernameGateUserId!==profileUserId) postUsernameGateUserId='';
        if(profileUserId && firstAccountTutorialUserId && firstAccountTutorialUserId!==profileUserId){
          firstAccountWelcomeOpen=false;
          firstAccountTutorialUserId='';
        }
        paintUserbar();
        if(!authUser){
          firstAccountWelcomeOpen=false;
          firstAccountTutorialUserId='';
          onboardingVersion=ONBOARDING_VERSION;
          if(arena && !isBotArena() && !(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) && (arena.matchChannel||arena.queueChannel||arena.active)) leaveArena('Signed out.');
          for(const slot of ['primary','secondary','melee'])
            if(loadout[slot] && LOCKED_KEYS.includes(loadout[slot])) loadout[slot]=null;
          loadout.utility=null;
          restoreLastLoadoutForMode(null);
          resetSocialState();
        } else if(arenaAuthPending){
          arenaAuthPending=false;
          $('aguest').style.display='block';
          pendingGameMode='arena'; modeBoardMode='arena'; loadoutBackPage='modeboard';
          restoreLastLoadoutForMode('arena');
          selPage='loadout';
        }
        syncFallAccess();
        fetchAdmins(); fetchBanners(); fetchMsgs(); fetchPrices();
        profileLoaded=false;
        fetchProfile(profileUserId,profileRequestVersion).then(async profileReady=>{ // wait for account progress first
          // Auth may change while the profile request is in flight. A response
          // for the previous account must never open rewards or onboarding for
          // the account that is signed in now.
          const liveUserId=authUser ? String(authUser.id) : '';
          if(!profileReady || profileRequestVersion!==authProfileRequestVersion || liveUserId!==profileUserId) return;
          if(typeof fetchTemporaryWeaponGrants==='function')
            await fetchTemporaryWeaponGrants(profileUserId,profileRequestVersion);
          if(profileRequestVersion!==authProfileRequestVersion||!authUser||String(authUser.id)!==profileUserId)return;
          continueAfterUsernameGate(profileUserId);
        });
        fetchScoreReqs(); fetchMyBan(); fetchWeaponDefs(); fetchOwnBest();
        setupRealtime();                              // re-subscribe: RLS scope changes with the signed-in user
        if(authUser&&!recovering) beginUsernameClaimCheck();
        if(authUser) fetchSocial(true);
        if(_e==='PASSWORD_RECOVERY'){
          closeUsernameClaim();
          $('authwrap').style.display='flex';
          $('resetbox').style.display='block';
          $('authmsg').textContent='Recovery link accepted \u2014 choose a new password below.';
        } else if(!recovering){
          $('authwrap').style.display='none';
        }
        fetchBoard();
      });
      fetchBoard();
      fetchMyBan();                                  // device bans apply even signed out
      fetchBanners();                                // the UPDATES board is for everyone
      fetchLayout();                                 // where admins placed the hub blocks
      fetchWeaponDefs();                             // shared stat/price/publish overrides
      setupRealtime();
      if(authUser) fetchSocial(true);
    }catch(err){ console.warn('supabase init failed', err); sb=null; }
  }
  paintUserbar();
}
// ---- REALTIME: push updates instead of making players refresh ----
let rtChannel=null, rtStatus='off', rtLastEvent=0, rtRetry=0, rtRetryT=0;
function rtBump(){ rtLastEvent=Date.now(); }
function teardownRealtime(){
  if(rtChannel && sb){ try{ sb.removeChannel(rtChannel); }catch(e){} }
  rtChannel=null; rtStatus='off';
}
function setupRealtime(){
  if(!sb || typeof sb.channel!=='function') return;
  teardownRealtime();
  rtStatus='connecting';
  try{
    let ch=sb.channel('oz-live');
    // everyone: new posts, leaderboard moves, price changes
    ch=ch.on('postgres_changes', {event:'*', schema:'public', table:'banners'},       ()=>{ rtBump(); fetchBanners(); });
    ch=ch.on('postgres_changes', {event:'*', schema:'public', table:'scores'},        payload=>{
      rtBump(); fetchBoard();
      // A referrer who is already online should not have to reload to receive
      // their gift. The login check below remains the fallback when Realtime is
      // unavailable or the project does not expose row payloads to this client.
      const changed=payload&&payload.new&&payload.new.game;
      if(authUser && changed==='outpost-zero-referral:'+authUser.id) payReferralClaims();
    });
    ch=ch.on('postgres_changes', {event:'*', schema:'public', table:'weapon_prices'}, ()=>{ rtBump(); fetchPrices(); });
    // admins only: roster changes, inbox, report feed
    ch=ch.on('postgres_changes', {event:'*', schema:'public', table:'admins'},        ()=>{ rtBump(); fetchAdmins(); });
    ch=ch.on('postgres_changes', {event:'*', schema:'public', table:'admin_msgs'},    ()=>{ rtBump(); if(isAdmin()) fetchMsgs(); });
    ch=ch.on('postgres_changes', {event:'INSERT', schema:'public', table:'reports'},  ()=>{ rtBump(); if(isMainAdmin()) fetchUpdatesFeed(); });
    ch.subscribe((st)=>{
      if(st==='SUBSCRIBED'){ rtStatus='live'; rtRetry=0; rtBump(); }
      else if(st==='CHANNEL_ERROR' || st==='TIMED_OUT' || st==='CLOSED'){
        rtStatus='down';
        rtRetry=Math.min(rtRetry+1, 6);
        rtRetryT=Date.now()+Math.min(30000, 1000*Math.pow(2,rtRetry));   // backoff, capped at 30s
      }
    });
    rtChannel=ch;
  }catch(e){ rtStatus='down'; rtChannel=null; }
}
async function submitScore(sc){
  if(typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()) return;
  if(banBlocksBoard()) return;                       // any live ban keeps you off the leaderboard
  if(practiceMode) return;                           // range/practice runs are never ranked
  if(unrankedRun) return;                            // next-season weapons: practice only, never ranked
  if(adminUsed) return;                              // admin-assisted runs never touch the leaderboard
  if(!sb || !authUser || sc<=0) return;
  try{
    // never lower an existing entry — keep the player's all-time best
    let best=sc;
    try{
      const { data } = await sb.from('scores').select('score')
        .eq('user_id',authUser.id).eq('game','outpost-zero').maybeSingle();
      if(data && data.score>best) best=data.score;
    }catch(e){}
    await sb.from('scores').upsert(
      { user_id: authUser.id, name: displayName(authUser), game: 'outpost-zero', score: best },
      { onConflict: 'user_id,game' }
    );
    fetchBoard();
  }catch(err){ console.warn('score submit failed', err); }
}
async function submitArenaWin(){
  if(typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()) return;
  if(banBlocksBoard()||unrankedRun||adminUsed||!sb||!authUser) return;
  try{
    const game='outpost-zero-arena-wins';
    const {data,error:readError}=await sb.from('scores').select('score')
      .eq('user_id',authUser.id).eq('game',game).maybeSingle();
    if(readError) throw readError;
    const wins=Math.max(0,Math.floor(+(data&&data.score)||0))+1;
    const {error}=await sb.from('scores').upsert(
      {user_id:authUser.id,name:displayName(authUser),game,score:wins},
      {onConflict:'user_id,game'});
    if(error) throw error;
    fetchBoard();
  }catch(err){ console.warn('arena win submit failed',err); }
}
async function fetchBoard(){
  if(!sb) return false;
  const requestVersion=++leaderboardFetchVersion;
  leaderboardReadState.endless='loading'; leaderboardReadState.arena='loading';
  const read=async game=>{
    try{
      const {data,error}=await sb.rpc('get_outpost_zero_leaderboard',{p_game:game,p_limit:PUBLIC_BOARD_LIMIT});
      if(error) throw error;
      return {game,rows:(data||[]).map(row=>({
        user_id:row.user_id,
        username:cleanUsername(row.username),
        name:cleanUsername(row.username),
        needsUsername:leaderboardNeedsUsername(row),
        score:+row.score||0
      }))};
    }catch(error){ console.warn(game+' board fetch failed',error); return {game,error}; }
  };
  const results=await Promise.all([read('outpost-zero'),read('outpost-zero-arena-wins')]);
  // Auth, Realtime, and the 30-second refresh can overlap. Only the newest
  // request may publish results, otherwise a slower old response can put a
  // temporary username or old score back on screen.
  if(requestVersion!==leaderboardFetchVersion) return false;
  let anySuccess=false;
  for(const result of results){
    const arenaResult=result.game==='outpost-zero-arena-wins', key=arenaResult?'arena':'endless';
    if(result.error){ leaderboardReadState[key]=leaderboardReadFailure(result.error); continue; }
    if(arenaResult) arenaBoard=result.rows; else board=result.rows;
    leaderboardReadState[key]='ready'; anySuccess=true;
  }
  boardT=Date.now(); syncFallAccess();
  return anySuccess;
}
// ---- report a problem: small form -> Supabase 'reports' table (write-only) ----
let reportOpen=false, lastReportT=0;
function openStaffReport(){ staffReport=true; adminPanelOpen=false; openReport(); }
function openReport(){
  reportOpen=true; menuOpen=false;
  $('repwrap').style.display='flex'; $('repstatus').textContent='';
  try{ $('repmsg').focus(); }catch(e){}
}
function closeReport(){ reportOpen=false; staffReport=false; $('repwrap').style.display='none'; }
async function sendReport(){
  const msg=($('repmsg').value||'').trim();
  if(!msg){ $('repstatus').textContent='write a few words first'; return; }
  if(Date.now()-lastReportT<30000){ $('repstatus').textContent='hold on \u2014 one report per 30s'; return; }
  if(!sb){ $('repstatus').textContent='preview build \u2014 reporting works on the live site'; return; }
  $('repstatus').textContent='sending...';
  const meta={ wave, score, state, staff:staffReport, w:W, h:H,
               dpr:(window.devicePixelRatio||1),
               ua:String((typeof navigator!=='undefined'&&navigator.userAgent)||'').slice(0,160),
               t:new Date().toISOString() };
  try{
    const { error } = await sb.from('reports').insert({
      game:'outpost-zero',
      name: staffReport ? ('CO-ADMIN '+(adminEmail()||'?')) : (authUser ? displayName(authUser) : 'anonymous'),
      message: (staffReport?'[STAFF] ':'')+msg.slice(0,990),
      meta
    });
    if(error) throw error;
    lastReportT=Date.now();
    $('repstatus').textContent='sent \u2014 thank you!';
    $('repmsg').value='';
    setTimeout(closeReport, 1200);
  }catch(err){
    $('repstatus').textContent='could not send \u2014 try again in a bit';
  }
}
function prepareLocalGuestAfterAuthLoss(){
  const accountChanged=typeof prepareAccountProgressForAuth==='function'&&prepareAccountProgressForAuth('');
  if(typeof prepareTemporaryWeaponGrantsForAccount==='function')prepareTemporaryWeaponGrantsForAccount('',!accountChanged);
  if(typeof prepareLastLoadoutForAccount==='function')prepareLastLoadoutForAccount('');
  if(typeof prepareBotLadderForAccount==='function')prepareBotLadderForAccount('');
  if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();
  return !!accountChanged;
}
async function cancelPasswordRecoverySession(){
  if(!recovering||!sb)return false;
  // Abandoning recovery must clear locally even when the cloud sign-out
  // request fails, otherwise the recovery account remains usable as a guest.
  try{const result=await sb.auth.signOut();if(result&&result.error)console.warn('recovery sign-out failed; clearing this screen locally',result.error);}
  catch(error){console.warn('recovery sign-out failed; clearing this screen locally',error);}
  if(authUser&&typeof scrubPrivilegedUiForAccountChange==='function')scrubPrivilegedUiForAccountChange();
  if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange('');
  if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange('');
  authUser=null;authProfileRequestVersion++;postUsernameGateUserId='';prepareLocalGuestAfterAuthLoss();
  if(typeof resetSocialState==='function')resetSocialState('SIGNED OUT');
  paintUserbar();recovering=false;
  $('resetbox').style.display='none';
  $('rsave').style.display='block';$('rdone').style.display='none';
  $('rpass1').value='';$('rpass2').value='';
  $('authmsg').textContent='Password reset cancelled. That link is no longer valid \u2014 request a new one if you still need it.';
  return true;
}
function accountMenuElements(){
  if(typeof document==='undefined')return {};
  return {
    trigger:$('accountmenutrigger'),wrap:$('accountmenuwrap'),box:$('accountmenubox'),
    title:$('accountmenutitle'),identity:$('accountmenuidentity'),email:$('accountmenuemail'),detail:$('accountmenudetail'),
    actions:$('accountmenuactions'),settings:$('accountmenusettings'),signout:$('accountmenusignout'),cancel:$('accountmenucancel'),
    confirm:$('accountmenuconfirm'),warning:$('accountmenuwarning'),confirmCancel:$('accountmenusignoutcancel'),
    confirmSignout:$('accountmenusignoutconfirm'),status:$('accountmenustatus')
  };
}
function accountMenuHasChosenUsername(){
  return !!(authUser&&typeof socialProfile!=='undefined'&&socialProfile&&
    String(socialProfile.user_id||authUser.id||'')===String(authUser.id||'')&&
    !(typeof usernameNeedsClaim==='function'&&usernameNeedsClaim(socialProfile,authUser)));
}
function accountMenuForfeitWarning(){
  const forfeits=typeof arenaForfeitEligible==='function'&&arenaForfeitEligible();
  return forfeits
    ? 'WARNING: Signing out during this 1v1 counts as a loss, and your opponent receives the win. You will need to sign in again on this device.'
    : 'You will need to sign in again on this device.';
}
function syncAccountMenu(){
  if(!accountMenuOpen)return false;
  const liveUserId=authUser?String(authUser.id||''):'';
  if(!liveUserId||liveUserId!==accountMenuUserId){closeAccountMenu(true);return false;}
  const el=accountMenuElements(),chosen=accountMenuHasChosenUsername(),email=String(authUser.email||'').trim().slice(0,160),
    username=chosen?String(socialProfile.handle||'').trim().slice(0,32):'';
  if(el.wrap){
    el.wrap.style.display='flex';el.wrap.setAttribute('aria-hidden','false');
    el.wrap.classList.toggle('confirming',accountMenuConfirming);el.wrap.classList.toggle('busy',accountMenuBusy);
  }
  if(el.identity)el.identity.textContent=chosen?('@'+username):(email||'USERNAME REQUIRED');
  if(el.email)el.email.textContent=chosen
    ? (email?('PRIVATE EMAIL \u00b7 '+email):'PRIVATE EMAIL UNAVAILABLE')
    : 'PRIVATE EMAIL \u00b7 shown only to you until you choose a public username';
  if(el.detail)el.detail.textContent=chosen
    ? 'Manage your public username and password, or safely sign out of this device.'
    : 'Choose a public username in Settings before playing. Your email remains private.';
  if(el.actions)el.actions.hidden=accountMenuConfirming;
  if(el.confirm)el.confirm.hidden=!accountMenuConfirming;
  if(el.warning)el.warning.textContent=accountMenuForfeitWarning();
  for(const button of [el.settings,el.signout,el.cancel,el.confirmCancel,el.confirmSignout])if(button)button.disabled=accountMenuBusy;
  if(el.status)el.status.textContent=accountMenuBusy?'SIGNING OUT\u2026':'';
  return true;
}
function closeAccountMenu(force=false){
  if(accountMenuBusy&&!force)return false;
  const el=accountMenuElements(),hadFocus=!!(el.wrap&&typeof el.wrap.contains==='function'&&el.wrap.contains(document.activeElement));
  accountMenuOpen=false;accountMenuConfirming=false;accountMenuBusy=false;accountMenuUserId='';accountMenuReturnView='';
  if(el.wrap){el.wrap.style.display='none';el.wrap.setAttribute('aria-hidden','true');el.wrap.classList.remove('confirming','busy');}
  if(el.actions)el.actions.hidden=false;if(el.confirm)el.confirm.hidden=true;
  if(el.identity)el.identity.textContent='';if(el.email)el.email.textContent='';if(el.status)el.status.textContent='';
  for(const button of [el.settings,el.signout,el.cancel,el.confirmCancel,el.confirmSignout])if(button)button.disabled=false;
  if(hadFocus&&!force&&typeof restoreAccountTriggerFocus==='function')restoreAccountTriggerFocus();
  return true;
}
function openAccountMenu(){
  if(!authUser){void toggleAuth();return false;}
  if(recovering)return false;
  if(typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()){
    if(typeof beginUsernameClaimCheck==='function')beginUsernameClaimCheck();return false;
  }
  accountMenuOpen=true;accountMenuConfirming=false;accountMenuBusy=false;
  accountMenuUserId=String(authUser.id||'');accountMenuReturnView='menu';
  if(typeof resetHeldGameplayInput==='function')resetHeldGameplayInput();
  syncAccountMenu();
  const el=accountMenuElements();try{setTimeout(()=>el.settings&&el.settings.focus(),0);}catch(error){}
  return true;
}
function requestSignOut(source=''){
  if(!authUser){void toggleAuth();return false;}
  if(accountMenuBusy)return false;
  const priorMenu=accountMenuOpen&&!accountMenuConfirming;
  accountMenuReturnView=priorMenu?'menu':accountSettingsOpen?'settings':
    ((typeof usernameClaimOpen!=='undefined'&&usernameClaimOpen)?'username':String(source||''));
  accountMenuOpen=true;accountMenuConfirming=true;accountMenuBusy=false;accountMenuUserId=String(authUser.id||'');
  if(typeof resetHeldGameplayInput==='function')resetHeldGameplayInput();
  syncAccountMenu();
  const el=accountMenuElements();try{setTimeout(()=>el.confirmCancel&&el.confirmCancel.focus(),0);}catch(error){}
  return true;
}
function cancelSignOutRequest(){
  if(!accountMenuOpen||!accountMenuConfirming||accountMenuBusy)return false;
  const returning=accountMenuReturnView,el=accountMenuElements();
  if(returning==='menu'){
    accountMenuConfirming=false;accountMenuReturnView='menu';syncAccountMenu();
    try{setTimeout(()=>el.signout&&el.signout.focus(),0);}catch(error){}
    return true;
  }
  closeAccountMenu();
  const target=returning==='settings'?$('settingssignout'):returning==='username'?$('usernameclaimsignout'):null;
  if(target)try{setTimeout(()=>target.focus(),0);}catch(error){}
  return true;
}
async function confirmSignOut(){
  if(!accountMenuOpen||!accountMenuConfirming||accountMenuBusy||!authUser)return false;
  const userId=accountMenuUserId;
  if(!userId||String(authUser.id||'')!==userId){closeAccountMenu(true);return false;}
  accountMenuBusy=true;syncAccountMenu();
  const ok=await toggleAuth({confirmed:true,userId});
  if(!ok&&authUser&&String(authUser.id||'')===userId){accountMenuBusy=false;syncAccountMenu();}
  return !!ok;
}
function accountMenuKeydown(event){
  if(!accountMenuOpen)return;
  event.stopPropagation();
  if(event.key==='Escape'){
    event.preventDefault();if(accountMenuBusy)return;
    if(accountMenuConfirming)cancelSignOutRequest();else closeAccountMenu();return;
  }
  if(event.key!=='Tab')return;
  const el=accountMenuElements(),buttons=(accountMenuConfirming
    ?[el.confirmCancel,el.confirmSignout]:[el.settings,el.signout,el.cancel]).filter(button=>button&&!button.disabled);
  if(!buttons.length){event.preventDefault();return;}
  const first=buttons[0],last=buttons[buttons.length-1],active=document.activeElement;
  if(event.shiftKey&&(active===first||!buttons.includes(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!buttons.includes(active))){event.preventDefault();first.focus();}
}
function activateAccountTrigger(){
  if(authUser)return openAccountMenu();
  void toggleAuth();return true;
}
async function toggleAuth(options){
  if(authUser){
    const opts=options&&typeof options==='object'?options:{};
    if(opts.confirmed!==true){requestSignOut('direct');return false;}
    const expectedUserId=String(opts.userId||''),liveUserId=String(authUser.id||'');
    if(!expectedUserId||expectedUserId!==liveUserId){closeAccountMenu(true);return false;}
    if(accountSettingsOpen)closeAccountSettings(true);
    try{if(typeof arenaForfeitBeforeSignOut==='function')await arenaForfeitBeforeSignOut();}
    catch(error){console.warn('arena sign-out forfeit failed',error);}
    let signOutError=null;
    if(sb)try{const result=await sb.auth.signOut();signOutError=result&&result.error||null;}
    catch(error){signOutError=error;}
    if(signOutError)console.warn('cloud sign-out failed; clearing this screen locally',signOutError);
    if(authUser&&String(authUser.id||'')!==liveUserId){closeAccountMenu(true);return true;}
    if(authUser&&typeof scrubPrivilegedUiForAccountChange==='function')scrubPrivilegedUiForAccountChange();
    if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange('');
    if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange('');
    authUser=null;authProfileRequestVersion++;postUsernameGateUserId='';
    closeAccountMenu(true);prepareLocalGuestAfterAuthLoss();
    if(typeof resetSocialState==='function')resetSocialState('SIGNED OUT');
    else if(typeof closeUsernameClaim==='function')closeUsernameClaim(true);
    paintUserbar();return true;
  }
  closeAccountMenu(true);arenaAuthPending=false;$('aguest').style.display='block';$('authwrap').style.display='flex';
  return true;
}
function creds(){
  return { email: $('aemail').value.trim(), password: $('apass').value };
}
function signupUsername(){
  return String($('ausername')&&$('ausername').value||'').trim().replace(/^@/,'');
}
function accountSettingsElements(){
  if(typeof document==='undefined') return {};
  return {
    wrap:$('settingswrap'),box:$('settingsbox'),account:$('settingsaccount'),
    username:$('settingsusername'),usernameHint:$('settingsusernamehint'),
    usernameSave:$('settingsusernamesave'),usernameStatus:$('settingsusernamestatus'),
    pass1:$('settingspass1'),pass2:$('settingspass2'),passwordSave:$('settingspasswordsave'),
    passwordStatus:$('settingspasswordstatus'),signout:$('settingssignout'),close:$('settingsclose')
  };
}
function accountSettingsSetStatus(kind,message,error=false){
  const el=accountSettingsElements(), target=kind==='password'?el.passwordStatus:el.usernameStatus;
  if(!target) return;
  target.textContent=String(message||''); target.className='settings-status'+(error?' error':'');
}
function accountSettingsUsernameReadyAt(){
  if(typeof socialProfile==='undefined'||!socialProfile) return 0;
  const explicit=Date.parse(socialProfile.next_username_change_at||socialProfile.username_change_available_at||'');
  if(Number.isFinite(explicit)) return explicit;
  const changed=Date.parse(socialProfile.username_changed_at||'');
  return Number.isFinite(changed)?changed+21*24*60*60*1000:0;
}
function accountSettingsDate(value){
  try{return new Date(value).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(error){return new Date(value).toISOString().slice(0,10);}
}
function accountSettingsHasUsername(){
  return !!(authUser&&typeof socialProfile!=='undefined'&&socialProfile&&
    !(typeof usernameNeedsClaim==='function'&&usernameNeedsClaim(socialProfile,authUser)));
}
function accountSettingsSync(resetInput=false){
  const el=accountSettingsElements(); if(!el.wrap) return false;
  const signedIn=!!authUser, chosen=accountSettingsHasUsername(), profileReady=signedIn&&typeof socialProfile!=='undefined'&&!!socialProfile;
  const email=signedIn?String(authUser.email||'').trim():'';
  if(el.account) el.account.textContent=signedIn
    ? ('SIGNED IN AS '+(email||'YOUR ACCOUNT')+' · EMAIL IS PRIVATE')
    : 'SIGN IN TO MANAGE YOUR ACCOUNT';
  const current=chosen?String(socialProfile.handle||''):'';
  if(el.username&&(resetInput||!el.username.value)) el.username.value=current;
  const readyAt=chosen?accountSettingsUsernameReadyAt():0, locked=readyAt>Date.now();
  if(el.usernameHint) el.usernameHint.textContent=!signedIn
    ? 'Sign in before choosing a public username.'
    : !chosen
      ? 'Choose the public username shown in matches, parties, friends, messages, and leaderboards. Your first choice is available now.'
      : locked
        ? 'Your username is @'+current+'. It can be changed again on '+accountSettingsDate(readyAt)+'.'
        : 'Your username is @'+current+'. After saving a different one, you must wait 21 days before changing it again.';
  if(el.usernameSave){
    el.usernameSave.textContent=chosen?'CHANGE USERNAME':'CHOOSE USERNAME';
    el.usernameSave.disabled=accountSettingsBusy||!profileReady||locked;
  }
  if(el.username) el.username.disabled=accountSettingsBusy||!profileReady||locked;
  if(el.passwordSave) el.passwordSave.disabled=accountSettingsBusy||!signedIn||!sb;
  if(el.pass1) el.pass1.disabled=accountSettingsBusy||!signedIn;
  if(el.pass2) el.pass2.disabled=accountSettingsBusy||!signedIn;
  if(el.signout) el.signout.disabled=accountSettingsBusy||!signedIn;
  accountSettingsRequiredUsername=!!(signedIn&&accountSettingsRequiredUsername&&!chosen);
  el.wrap.classList.toggle('required',accountSettingsRequiredUsername);
  return true;
}
function openAccountSettings(options={}){
  if(!authUser){ toggleAuth(); return false; }
  if(accountMenuOpen)closeAccountMenu(true);
  const opts=options&&typeof options==='object'?options:{};
  accountSettingsOpen=true;
  accountSettingsUserId=String(authUser.id||'');
  if(typeof resetHeldGameplayInput==='function') resetHeldGameplayInput();
  accountSettingsRequiredUsername=!!(opts.requiredUsername||
    (typeof usernameClaimRequired==='function'&&usernameClaimRequired()));
  const el=accountSettingsElements();
  if(el.wrap) el.wrap.style.display='flex';
  const gate=typeof document!=='undefined'&&document.getElementById('usernameclaimwrap');
  if(gate) gate.style.display='none';
  accountSettingsSetStatus('username',''); accountSettingsSetStatus('password','');
  accountSettingsSync(true);
  if((!socialProfile||String(socialProfile.user_id||'')!==String(authUser.id||''))&&typeof fetchSocial==='function'){
    void Promise.resolve(fetchSocial(true)).then(()=>{ if(accountSettingsOpen) accountSettingsSync(true); });
  }
  const focus=opts.focus==='password'?el.pass1:el.username;
  try{ setTimeout(()=>focus&&focus.focus(),0); }catch(error){}
  return true;
}
function closeAccountSettings(force=false){
  if(!accountSettingsOpen) return true;
  if(!force&&accountSettingsRequiredUsername&&
     typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()){
    accountSettingsSetStatus('username','Choose a username before leaving account setup.',true); return false;
  }
  const el=accountSettingsElements();
  accountSettingsOpen=false; accountSettingsRequiredUsername=false; accountSettingsBusy=false; accountSettingsUserId='';
  if(el.wrap){ el.wrap.style.display='none'; el.wrap.classList.remove('required'); }
  if(el.pass1) el.pass1.value=''; if(el.pass2) el.pass2.value='';
  if(!force&&typeof usernameClaimRequired==='function'&&usernameClaimRequired()&&typeof openUsernameClaim==='function')
    openUsernameClaim('required','Open Settings to choose your public username.');
  return true;
}
async function saveAccountSettingsUsername(){
  const el=accountSettingsElements(), value=String(el.username&&el.username.value||'').trim();
  if(accountSettingsBusy) return false;
  if(typeof socialUpdateHandle!=='function'){
    accountSettingsSetStatus('username','Username settings are still loading. Try again.',true); return false;
  }
  const userId=String(authUser&&authUser.id||'');
  accountSettingsBusy=true; accountSettingsSetStatus('username','Saving username…'); accountSettingsSync();
  let ok=false;
  try{ ok=await socialUpdateHandle(value,accountSettingsRequiredUsername); }
  finally{
    if(accountSettingsOpen&&accountSettingsUserId===userId&&authUser&&String(authUser.id||'')===userId){
      accountSettingsBusy=false; accountSettingsSync(!!ok);
    }
  }
  if(!accountSettingsOpen||accountSettingsUserId!==userId||!authUser||String(authUser.id||'')!==userId) return false;
  if(ok){
    accountSettingsRequiredUsername=false; accountSettingsSync(true);
    accountSettingsSetStatus('username','Username saved. Your public name is now @'+String(socialProfile&&socialProfile.handle||value)+'.');
  }
  return ok;
}
async function saveAccountSettingsPassword(){
  const el=accountSettingsElements(), first=String(el.pass1&&el.pass1.value||''), second=String(el.pass2&&el.pass2.value||'');
  if(accountSettingsBusy) return false;
  if(!sb||!authUser){ accountSettingsSetStatus('password','Sign in and reconnect first.',true); return false; }
  if(first.length<6){ accountSettingsSetStatus('password','Password must be at least 6 characters.',true); return false; }
  if(first!==second){ accountSettingsSetStatus('password','Passwords do not match.',true); return false; }
  const userId=String(authUser.id||'');
  accountSettingsBusy=true; accountSettingsSetStatus('password','Changing password…'); accountSettingsSync();
  try{
    const result=await sb.auth.updateUser({password:first});
    if(result&&result.error) throw result.error;
    if(!accountSettingsOpen||accountSettingsUserId!==userId||!authUser||String(authUser.id||'')!==userId) return false;
    if(el.pass1) el.pass1.value=''; if(el.pass2) el.pass2.value='';
    accountSettingsSetStatus('password','Password changed successfully. Use it the next time you sign in.');
    return true;
  }catch(error){
    if(accountSettingsOpen&&accountSettingsUserId===userId&&authUser&&String(authUser.id||'')===userId)
      accountSettingsSetStatus('password',String(error&&error.message||'Could not change password. Try again.'),true);
    return false;
  }finally{
    if(accountSettingsOpen&&accountSettingsUserId===userId&&authUser&&String(authUser.id||'')===userId){
      accountSettingsBusy=false; accountSettingsSync();
    }
  }
}
function bindDomEvents(){
  $('repsend').onclick=sendReport;
  $('repcancel').onclick=closeReport;
  $('postsend').onclick=sendPost;
  $('postcancel').onclick=closePost;
  $('msgsend').onclick=sendMsg;
  $('msgcancel').onclick=closeMsgCompose;
  $('formsave').onclick=()=>{ if(formSave) formSave(formValues()); };
  $('formcancel').onclick=cancelForm;
  $('promosend').onclick=redeemPromo;
  $('promocancel').onclick=closePromo;
  $('appealsend').onclick=sendAppeal;
  $('appealcancel').onclick=closeAppeal;
  $('scoresend').onclick=submitScoreEdit;
  $('scorecancel').onclick=closeScoreEdit;
  $('ubtn').onclick=activateAccountTrigger;
  const accountMenu=accountMenuElements();
  if(accountMenu.trigger)accountMenu.trigger.onclick=activateAccountTrigger;
  if(accountMenu.settings)accountMenu.settings.onclick=()=>{
    if(accountMenuBusy)return;
    const required=typeof usernameClaimRequired==='function'&&usernameClaimRequired();
    closeAccountMenu(true);openAccountSettings({focus:'username',requiredUsername:required});
  };
  if(accountMenu.signout)accountMenu.signout.onclick=()=>requestSignOut('menu');
  if(accountMenu.cancel)accountMenu.cancel.onclick=()=>closeAccountMenu();
  if(accountMenu.confirmCancel)accountMenu.confirmCancel.onclick=cancelSignOutRequest;
  if(accountMenu.confirmSignout)accountMenu.confirmSignout.onclick=()=>{void confirmSignOut();};
  if(accountMenu.wrap){
    accountMenu.wrap.addEventListener('keydown',accountMenuKeydown);
    accountMenu.wrap.addEventListener('click',event=>{
      if(event.target!==accountMenu.wrap||accountMenuBusy)return;
      if(accountMenuConfirming)cancelSignOutRequest();else closeAccountMenu();
    });
  }
  if(typeof saveAccountSettingsUsername==='function') $('settingsusernamesave').onclick=saveAccountSettingsUsername;
  if(typeof saveAccountSettingsPassword==='function') $('settingspasswordsave').onclick=saveAccountSettingsPassword;
  if(typeof closeAccountSettings==='function'){
    $('settingsclose').onclick=()=>closeAccountSettings();
    $('settingssignout').onclick=()=>requestSignOut('settings');
    $('settingswrap').addEventListener('keydown',event=>{
      // Keep every Settings key inside the DOM modal. Do not prevent normal
      // Enter/Space button activation; only Escape needs custom handling.
      event.stopPropagation();
      if(event.key==='Escape'){ event.preventDefault(); closeAccountSettings(); }
    });
  }
  if(typeof saveAccountSettingsUsername==='function')
    $('settingsusername').addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); saveAccountSettingsUsername(); } });
  if(typeof saveAccountSettingsPassword==='function') for(const id of ['settingspass1','settingspass2'])
    $(id).addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); saveAccountSettingsPassword(); } });
  const refreshTemporaryGifts=()=>{
    if(authUser&&profileLoaded&&typeof fetchTemporaryWeaponGrants==='function')
      void fetchTemporaryWeaponGrants(String(authUser.id||''),authProfileRequestVersion);
    if(sb&&typeof fetchMyBan==='function')void fetchMyBan();
    if(typeof socialResumeSync==='function')socialResumeSync();
  };
  addEventListener('online',refreshTemporaryGifts);
  addEventListener('focus',refreshTemporaryGifts);
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTemporaryGifts();});
  $('aguest').onclick = ()=>{ if(!recovering && !arenaAuthPending) $('authwrap').style.display='none'; };
  $('acancel').onclick = async ()=>{
  if(await cancelPasswordRecoverySession())return;   // keep the panel open so they see the recovery message
  recovering=false;
  arenaAuthPending=false; $('aguest').style.display='block';
  $('resetbox').style.display='none';
  $('rsave').style.display='block'; $('rdone').style.display='none';
  $('authmsg').textContent='';
  $('authwrap').style.display='none';
  };
  for(const id of ['aemail','apass'])
    $(id).addEventListener('keydown', e=>{ if(e.key==='Enter') $('ain').click(); });
  $('ain').onclick = async ()=>{
  if(!sb){ $('authmsg').textContent='Sign-in unavailable here \u2014 works once deployed.'; return; }
  const c=creds();
  if(!c.email||!c.password){ $('authmsg').textContent='Email and password required.'; return; }
  const { error } = await sb.auth.signInWithPassword(c);
  if(error) $('authmsg').textContent=error.message;
  };
  $('aup').onclick = async ()=>{
  if(!sb){ $('authmsg').textContent='Sign-in unavailable here \u2014 works once deployed.'; return; }
  const c=creds(), username=signupUsername();
  if(!/^[A-Za-z0-9_]{3,32}$/.test(username)){
    $('authmsg').textContent='Choose a username: 3\u201332 letters, numbers, or underscores.'; return;
  }
  if(!c.email||!c.password){ $('authmsg').textContent='Email and password required.'; return; }
  let available=null, availabilityWarning='';
  try{
    const checked=await sb.rpc('outpost_zero_username_available',{p_username:username});
    if(checked.error) throw checked.error;
    available=checked.data===true;
  }catch(error){ availabilityWarning=' Username availability could not be checked; open Social after sign-in to confirm it.'; }
  if(available===false){ $('authmsg').textContent='That username is already taken.'; return; }
  const { error } = await sb.auth.signUp({email:c.email,password:c.password,options:{data:{username}}});
  if(error){ $('authmsg').textContent=error.message; return; }
  // with email confirmation off, signUp signs the user in immediately
  const { error: e2 } = await sb.auth.signInWithPassword(c);
  $('authmsg').textContent = (e2
    ? 'Account created. Now press SIGN IN with the same email and password.'
    : 'Account created \u2014 you are signed in.')+availabilityWarning;
  };
  $('aforgot').onclick = async (ev)=>{
  ev.preventDefault();
  if(!sb){ $('authmsg').textContent='Password reset works once deployed.'; return; }
  const email=$('aemail').value.trim();
  if(!email){ $('authmsg').textContent='Enter your email above, then tap Forgot password.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
  $('authmsg').textContent = error ? error.message
    : 'Reset link sent. Open it, then you\'ll be asked for a new password here.';
  };
  // (password recovery is handled in the main onAuthStateChange listener above)
  $('rsave').onclick = async ()=>{
  if(!sb){ $('authmsg').textContent='Works once deployed.'; return; }
  const a=$('rpass1').value, b=$('rpass2').value;
  if(a.length<6){ $('authmsg').textContent='Password must be at least 6 characters.'; return; }
  if(a!==b){ $('authmsg').textContent='Passwords do not match.'; return; }
  const { error } = await sb.auth.updateUser({ password: a });
  if(error){ $('authmsg').textContent=error.message; return; }
  $('authmsg').textContent='Password saved. Continue to your account.';
  recovering=false;
  $('rpass1').value=''; $('rpass2').value='';
  $('rsave').style.display='none';
  $('rdone').style.display='block';
  };
  $('rdone').onclick = ()=>{
    $('authwrap').style.display='none';
    beginUsernameClaimCheck();
    if(authUser) fetchSocial(true);
  };
  for(const id of ['rpass1','rpass2'])
    $(id).addEventListener('keydown', e=>{ if(e.key==='Enter') $('rsave').click(); });
}
