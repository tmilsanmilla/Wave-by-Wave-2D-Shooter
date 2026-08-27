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
  if(authUser&&String(u.id||'')===String(authUser.id||'')&&typeof socialProfile!=='undefined'&&socialProfile&&socialProfile.handle){
    const live=cleanUsername(socialProfile.handle);
    if(live){
      const key=live.toLowerCase(), suffix=String(u.id||'').replace(/-/g,'').toLowerCase();
      const pending=key==='username_not_set'||key==='usernamenotset'||
        (!!suffix&&(key==='op_'+suffix.slice(0,20)||key==='op_'+suffix.slice(0,8)));
      return pending?'operator':live;
    }
  }
  const meta=u.user_metadata||{};
  return cleanUsername(meta.username||meta.preferred_username||meta.full_name||meta.name)||'operator';
}
function leaderboardUsername(row){
  if(leaderboardNeedsUsername(row)){
    const mine=authUser&&String(row.user_id!=null?row.user_id:row.userId||'')===String(authUser.id||'');
    return mine?'CHOOSE USERNAME':'USERNAME NOT SET';
  }
  return cleanUsername(row&&((row.username!=null?row.username:row.name)))||'USERNAME NOT SET';
}
function paintUserbar(){
  $('uname').textContent = authUser ? displayName(authUser) : 'not signed in';
  $('uemail').textContent = '';
  $('ubtn').textContent  = authUser ? 'SIGN OUT' : 'SIGN IN';
}
async function initAuth(){
  if(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase){
    try{
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data } = await sb.auth.getSession();
      authUser = data.session ? data.session.user : null;
      prepareLastLoadoutForAccount(authUser?String(authUser.id):'');
      prepareBotLadderForAccount(authUser?String(authUser.id):'');
      if(authUser) beginUsernameClaimCheck();
      void refreshBotLadder(true);
      sb.auth.onAuthStateChange((_e, sess)=>{
        authUser = sess ? sess.user : null;
        const profileUserId=authUser ? String(authUser.id) : '';
        prepareLastLoadoutForAccount(profileUserId);
        prepareBotLadderForAccount(profileUserId);
        void refreshBotLadder(false);
        const profileRequestVersion=++authProfileRequestVersion;
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
        fetchProfile(profileUserId,profileRequestVersion).then(profileReady=>{ // wait for account progress first
          // Auth may change while the profile request is in flight. A response
          // for the previous account must never open rewards or onboarding for
          // the account that is signed in now.
          const liveUserId=authUser ? String(authUser.id) : '';
          if(!profileReady || profileRequestVersion!==authProfileRequestVersion || liveUserId!==profileUserId) return;
          processReferral();
          if(!openDailyGate()) maybeFirstRunTutorial();
        });
        fetchScoreReqs(); fetchMyBan(); fetchWeaponDefs(); fetchOwnBest();
        setupRealtime();                              // re-subscribe: RLS scope changes with the signed-in user
        if(authUser&&!recovering) beginUsernameClaimCheck();
        if(authUser) fetchSocial(true);
        if(_e==='PASSWORD_RECOVERY'){
          recovering=true;
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
async function toggleAuth(){
  if(authUser && sb){
    try{ if(typeof arenaForfeitBeforeSignOut==='function') await arenaForfeitBeforeSignOut(); }
    catch(error){ console.warn('arena sign-out forfeit failed',error); }
    await sb.auth.signOut(); authUser=null; paintUserbar();
  }
  else { arenaAuthPending=false; $('aguest').style.display='block'; $('authwrap').style.display='flex'; }
}
function creds(){
  return { email: $('aemail').value.trim(), password: $('apass').value };
}
function signupUsername(){
  return String($('ausername')&&$('ausername').value||'').trim().replace(/^@/,'');
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
  $('ubtn').onclick = toggleAuth;
  $('aguest').onclick = ()=>{ if(!recovering && !arenaAuthPending) $('authwrap').style.display='none'; };
  $('acancel').onclick = async ()=>{
  if(recovering && sb){
    // abandoning a password reset: sign out so the recovery session is dropped
    await sb.auth.signOut();
    authUser=null; paintUserbar();
    recovering=false;
    $('resetbox').style.display='none';
    $('rsave').style.display='block'; $('rdone').style.display='none';
    $('rpass1').value=''; $('rpass2').value='';
    $('authmsg').textContent='Password reset cancelled. That link is no longer valid \u2014 request a new one if you still need it.';
    return;   // keep the panel open so they see the message
  }
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
