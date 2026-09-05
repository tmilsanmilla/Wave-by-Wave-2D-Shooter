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
let sb = null, authUser = null, board = [], arenaBoard = [], boardT = 0, boardRequestT = 0, recovering = false;
let leaderboardFetchVersion=0;
const leaderboardAppliedVersion={endless:0,arena:0};
const leaderboardFailedVersion={endless:0,arena:0};
const leaderboardReadState={endless:'idle',arena:'idle'};
let leaderboardRetryTimer=null,leaderboardRetryLevel=0;
let arenaAuthPending=false, arena=null;
let leaderboardRowRects=[];
const ARENA_WIN_RECEIPT_PREFIX='oz_arena_win_receipt_v1:';
const ARENA_WIN_RETRY_MS=Object.freeze([1500,5000,15000,60000]);
let arenaWinMemoryQueue=new Map(),arenaWinFlushPromise=null,arenaWinFlushRequested=false;
let arenaWinRetryTimer=null,arenaWinRetryLevel=0,arenaOwnWinTotal=null;
const ONBOARDING_VERSION=1;
let onboardingVersion=ONBOARDING_VERSION;
let firstAccountTutorialUserId='', firstAccountWelcomeOpen=false, firstAccountWelcomeRects=[];
let authProfileRequestVersion=0;
let postUsernameGateUserId='';
const AUTH_IDENTIFIER_FUNCTION='outpost-zero-sign-in';
const AUTH_INVALID_CREDENTIALS='Email/username or password is incorrect. If you just signed up, verify your email first.';
const AUTH_TRY_LATER='Too many sign-in attempts. Wait a moment and try again.';
const AUTH_SIGNIN_SETUP='Username sign-in needs the secure Outpost Zero Edge Function deployed. Email sign-in is still available.';
const AUTH_AMBIGUOUS_IDENTIFIER='AMBIGUOUS_IDENTIFIER';
let authActionBusy=false,authActionEpoch=0,authAccountChoiceOpen=false;
let accountSettingsOpen=false, accountSettingsRequiredUsername=false, accountSettingsBusy=false, accountSettingsUserId='', accountSettingsSection='menu', accountSettingsReturnFocus=null, accountSettingsEpoch=0;
let accountMenuOpen=false, accountMenuConfirming=false, accountMenuBusy=false, accountMenuUserId='', accountMenuReturnView='';
const $ = id => document.getElementById(id);

function cleanUsername(value){
  return String(value||'').trim().replace(/^@/,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
}
function cleanAccountEmail(value){
  const email=String(value||'').trim().toLowerCase().slice(0,254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';
}
function cleanAccountIdentity(value){
  const raw=String(value||'').trim(),email=cleanAccountEmail(raw);
  if(email)return email;
  const username=raw.replace(/^@/,'');
  return /^[A-Za-z0-9_]{3,32}$/.test(username)?username:'';
}
function accountIdentityLabel(value,fallback='UNKNOWN PLAYER'){
  const identity=cleanAccountIdentity(value);
  return identity?(cleanAccountEmail(identity)?identity:'@'+identity):String(fallback||'UNKNOWN PLAYER');
}
function leaderboardNeedsUsername(row){
  if(!row) return false;
  if(row.needsUsername===true) return true;
  const raw=String(row.username!=null?row.username:row.name||'').trim();
  const username=cleanUsername(raw).toLowerCase();
  if(!/^[A-Za-z0-9_]{3,32}$/.test(raw)||!username||cleanAccountEmail(raw)) return true;
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
    // Public board RPCs remain email-free. Creator/main clients may separately
    // enrich unfinished rows through a role-checked Admin 01 RPC; everyone
    // else can see only their own Auth-session email.
    const adminFallback=(typeof isMainAdmin==='function'&&isMainAdmin())
      ?cleanAccountEmail(row&&row.adminIdentityLabel):'';
    if(adminFallback)return adminFallback;
    if(mine) return cleanAccountEmail(authUser.email)||'CHOOSE USERNAME';
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
        arenaOwnWinTotal=null;
        if(typeof prepareBotLadderForAuthChange==='function')prepareBotLadderForAuthChange(initialNextUserId);
        if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange(initialNextUserId);
        if(typeof closeAccountMenu==='function')closeAccountMenu(true);
        if(typeof scrubPrivilegedUiForAccountChange==='function')scrubPrivilegedUiForAccountChange();
        if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange(initialNextUserId);
      }
      authUser = initialUser;
      if(authUser)void flushArenaWinReceipts();
      prepareSocialForAccount(authUser?String(authUser.id):'');
      if(authUser) beginUsernameClaimCheck();
      const initialProfileUserId=authUser?String(authUser.id):'',initialAccountChanged=
        typeof prepareAccountProgressForAuth==='function'&&prepareAccountProgressForAuth(initialProfileUserId);
      if(typeof prepareTemporaryWeaponGrantsForAccount==='function')prepareTemporaryWeaponGrantsForAccount(initialProfileUserId,!initialAccountChanged);
      prepareLastLoadoutForAccount(initialProfileUserId);
      prepareBotLadderForAccount(authUser?String(authUser.id):'');
      void refreshBotLadder(true);
      sb.auth.onAuthStateChange((_e, sess)=>{
        // A login/logout/recovery event supersedes every in-flight form
        // request. In particular, a late username resolver may never install
        // a session after the account has changed in another tab.
        if(typeof authActionCancel==='function')authActionCancel(false);
        if(_e==='PASSWORD_RECOVERY'){
          recovering=true;
          if(typeof closeAccountMenu==='function')closeAccountMenu(true);
        }
        const previousAuthUserId=authUser?String(authUser.id||''):'',nextAuthUser=sess?sess.user:null,
          nextAuthUserId=nextAuthUser?String(nextAuthUser.id||''):'';
        if(previousAuthUserId!==nextAuthUserId){
          arenaOwnWinTotal=null;
          if(typeof prepareBotLadderForAuthChange==='function')prepareBotLadderForAuthChange(nextAuthUserId);
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
        // Token refreshes can fire between a local reward and its cloud write.
        // Skip a known-dirty same-account read, and pass the scheduling
        // revision so a mutation during fetchWeaponDefs also invalidates the
        // later profile response.
        const sameLoadedProfile=!accountChanged&&profileLoaded&&profileOwnerUserId===profileUserId,
          reuseLoadedProfile=sameLoadedProfile&&typeof profileWritesPending==='function'&&profileWritesPending(),
          profileMutationAtSchedule=typeof profileMutationVersion==='number'?profileMutationVersion:0;
        if(!sameLoadedProfile)profileLoaded=false;
        Promise.resolve(fetchWeaponDefs()).then(()=>reuseLoadedProfile?true:fetchProfile(profileUserId,profileRequestVersion,profileMutationAtSchedule)).then(async profileReady=>{ // publication authority, then account progress
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
        fetchScoreReqs(); fetchMyBan(); fetchOwnBest();
        setupRealtime();                              // re-subscribe: RLS scope changes with the signed-in user
        if(authUser&&!recovering) beginUsernameClaimCheck();
        if(authUser) fetchSocial(true);
        if(authUser)void flushArenaWinReceipts();
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
      fetchWeaponDefs();                             // shared stat/price/publish overrides
      setupRealtime();
      if(authUser) fetchSocial(true);
    }catch(err){ console.warn('supabase init failed', err); sb=null; }
  }
  paintUserbar();
}
// ---- REALTIME: one independent channel per owning section ----
// A Leaderboards outage must not take Weapons, Admin Updates, or either Admin
// Inbox feed down with it. Social has its own isolated channel in social.js.
const REALTIME_SECTIONS=Object.freeze([
  'adminUpdates','leaderboards','weapons','adminInbox','adminReports'
]);
const realtimeSections=Object.create(null);
let rtLastEvent=0;
function realtimeSection(name){
  if(!realtimeSections[name])realtimeSections[name]={channel:null,status:'off',retry:0,retryAt:0,lastEvent:0,lastFallbackAt:0,generation:0};
  return realtimeSections[name];
}
function rtBump(name){
  const at=Date.now(),section=realtimeSection(name);rtLastEvent=at;section.lastEvent=at;
}
function realtimeSectionLive(name){return realtimeSection(name).status==='live';}
function teardownRealtimeSection(name){
  const section=realtimeSection(name),channel=section.channel;
  section.generation++;section.channel=null;section.status='off';section.retryAt=0;
  if(channel&&sb){try{sb.removeChannel(channel);}catch(e){}}
}
function teardownRealtime(name){
  if(name){teardownRealtimeSection(name);return;}
  for(const sectionName of REALTIME_SECTIONS)teardownRealtimeSection(sectionName);
}
function realtimeSectionDown(name,generation){
  const section=realtimeSection(name);
  if(section.generation!==generation)return;
  section.status='down';section.retry=Math.min(section.retry+1,6);
  section.retryAt=Date.now()+Math.min(30000,1000*Math.pow(2,section.retry));
}
function startRealtimeSection(name,channelName,attach,onLive){
  if(!sb||typeof sb.channel!=='function')return false;
  teardownRealtimeSection(name);
  const section=realtimeSection(name),generation=section.generation;
  section.status='connecting';
  try{
    let channel=attach(sb.channel(channelName));
    section.channel=channel;
    channel.subscribe(status=>{
      if(section.generation!==generation||section.channel!==channel)return;
      if(status==='SUBSCRIBED'){
        section.status='live';section.retry=0;section.retryAt=0;rtBump(name);
        if(typeof onLive==='function')onLive();
      }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
        realtimeSectionDown(name,generation);
      }
    });
    return true;
  }catch(error){
    section.channel=null;realtimeSectionDown(name,generation);return false;
  }
}
function setupAdminUpdatesRealtime(){
  return startRealtimeSection('adminUpdates','oz-admin-updates-live',channel=>
    channel.on('postgres_changes',{event:'*',schema:'public',table:'banners'},()=>{rtBump('adminUpdates');fetchBanners();}),
  ()=>{fetchBanners();});
}
function setupLeaderboardsRealtime(){
  return startRealtimeSection('leaderboards','oz-leaderboards-live',channel=>
    channel.on('postgres_changes',{event:'*',schema:'public',table:'scores'},payload=>{
      rtBump('leaderboards');fetchBoard();
      // A referrer who is already online should not have to reload to receive
      // their gift. Login-time and fallback reads still cover missed events.
      const changed=payload&&payload.new&&payload.new.game;
      if(authUser&&changed==='outpost-zero-arena-wins'&&String(payload.new.user_id||'')===String(authUser.id))fetchOwnBest();
      if(authUser&&changed==='outpost-zero-referral:'+authUser.id)payReferralClaims();
    }),
  ()=>{fetchBoard();if(authUser)void flushArenaWinReceipts();});
}
function setupWeaponsRealtime(){
  return startRealtimeSection('weapons','oz-weapons-live',channel=>{
    channel=channel.on('postgres_changes',{event:'*',schema:'public',table:'weapon_prices'},()=>{rtBump('weapons');fetchPrices();});
    return channel.on('postgres_changes',{event:'*',schema:'public',table:'weapon_defs'},payload=>{
      rtBump('weapons');if(typeof applyWeaponDefRealtime==='function')applyWeaponDefRealtime(payload);fetchWeaponDefs();
    });
  },()=>{fetchPrices();fetchWeaponDefs();});
}
function addPrivateWakeupHandlers(channel,table,sectionName,callback){
  for(const event of ['INSERT','UPDATE'])channel=channel.on('postgres_changes',{event,schema:'public',table},()=>{
    rtBump(sectionName);callback();
  });
  return channel;
}
function setupAdminInboxRealtime(){
  return startRealtimeSection('adminInbox','oz-admin-inbox-live',channel=>
    addPrivateWakeupHandlers(channel,'outpost_zero_admin_msg_wakeups','adminInbox',()=>{if(isAdmin())fetchMsgs();}),
  ()=>{if(isAdmin())fetchMsgs();});
}
function setupAdminReportsRealtime(){
  return startRealtimeSection('adminReports','oz-admin-reports-live',channel=>
    addPrivateWakeupHandlers(channel,'outpost_zero_report_wakeups','adminReports',()=>{if(isMainAdmin())fetchUpdatesFeed();}),
  ()=>{if(isMainAdmin())fetchUpdatesFeed();});
}
function setupRealtimeSection(name){
  if(name==='adminUpdates')return setupAdminUpdatesRealtime();
  if(name==='leaderboards')return setupLeaderboardsRealtime();
  if(name==='weapons')return setupWeaponsRealtime();
  if(name==='adminInbox')return setupAdminInboxRealtime();
  if(name==='adminReports')return setupAdminReportsRealtime();
  return false;
}
function setupRealtime(){
  if(!sb||typeof sb.channel!=='function')return false;
  teardownRealtime();
  for(const name of REALTIME_SECTIONS)setupRealtimeSection(name);
  return true;
}
function realtimeRetryTick(at=Date.now()){
  if(!sb)return;
  for(const name of REALTIME_SECTIONS){
    const section=realtimeSection(name);
    if(section.status==='down'&&section.retryAt&&at>=section.retryAt)setupRealtimeSection(name);
  }
}
function realtimeFallbackTick(at=Date.now()){
  if(!sb)return;
  const due=(name,callback)=>{
    const section=realtimeSection(name);
    if(section.status==='live'||at-section.lastFallbackAt<30000)return;
    section.lastFallbackAt=at;callback();
  };
  due('adminUpdates',()=>fetchBanners());
  due('weapons',()=>{fetchPrices();fetchWeaponDefs();});
  due('adminInbox',()=>{if(authUser&&isAdmin())fetchMsgs();});
  due('adminReports',()=>{if(authUser&&isMainAdmin())fetchUpdatesFeed();});
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
function arenaWinOwnerId(value){
  value=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)?value:'';
}
function arenaWinMatchId(value){
  value=String(value||'').trim();
  return value.length<=240&&/^arena-win-v1:[A-Za-z0-9:_-]{16,220}$/.test(value)?value:'';
}
function arenaWinResultId(match=arena,user=authUser){
  const owner=arenaWinOwnerId(user&&user.id),opponent=arenaWinOwnerId(match&&match.opponent&&match.opponent.id);
  if(!owner||!opponent)return '';
  const participants=[owner,opponent].sort(),vote=String(match&&match.mapVoteId||'').replace(/[^A-Za-z0-9:_-]/g,'').slice(0,100),
    fallback=[String(match&&match.room||''),Math.floor(+match?.matchEpoch||0)].join(':').replace(/[^A-Za-z0-9:_-]/g,'').slice(0,100),
    seed=vote||fallback;
  return arenaWinMatchId(['arena-win-v1',seed,participants[0],participants[1]].join(':'));
}
function normalizeArenaWinReceipt(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)return null;
  const owner=arenaWinOwnerId(raw.owner),matchId=arenaWinMatchId(raw.matchId),queuedAt=Number(raw.queuedAt);
  if(!owner||!matchId||!Number.isSafeInteger(queuedAt)||queuedAt<=0)return null;
  return {v:1,owner,matchId,queuedAt};
}
function arenaWinReceiptKey(owner,matchId){return ARENA_WIN_RECEIPT_PREFIX+arenaWinOwnerId(owner)+':'+arenaWinMatchId(matchId);}
function readArenaWinReceipts(){
  const rows=new Map(arenaWinMemoryQueue);
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key||!key.startsWith(ARENA_WIN_RECEIPT_PREFIX))continue;
      let raw=null;try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch(e){}
      const entry=normalizeArenaWinReceipt(raw);if(entry)rows.set(arenaWinReceiptKey(entry.owner,entry.matchId),entry);
    }
  }catch(e){}
  return [...rows.values()].sort((a,b)=>a.queuedAt-b.queuedAt||a.matchId.localeCompare(b.matchId));
}
function persistArenaWinReceipt(raw){
  const entry=normalizeArenaWinReceipt(raw);if(!entry)return false;
  const key=arenaWinReceiptKey(entry.owner,entry.matchId),serialized=JSON.stringify(entry);arenaWinMemoryQueue.set(key,entry);
  try{localStorage.setItem(key,serialized);if(localStorage.getItem(key)===serialized)return true;}catch(e){}
  return arenaWinMemoryQueue.has(key);
}
function removeArenaWinReceipt(owner,matchId){
  const key=arenaWinReceiptKey(owner,matchId);arenaWinMemoryQueue.delete(key);
  try{localStorage.removeItem(key);}catch(e){}
  return !readArenaWinReceipts().some(entry=>entry.owner===owner&&entry.matchId===matchId);
}
function enqueueArenaWinReceipt(owner,matchId,clock=Date.now()){
  owner=arenaWinOwnerId(owner);matchId=arenaWinMatchId(matchId);clock=Math.floor(+clock||0);
  if(!owner||!matchId||!Number.isSafeInteger(clock)||clock<=0)return false;
  const existing=readArenaWinReceipts().find(entry=>entry.owner===owner&&entry.matchId===matchId);
  return existing?true:persistArenaWinReceipt({v:1,owner,matchId,queuedAt:clock});
}
function scheduleArenaWinRetry(){
  if(arenaWinRetryTimer||!sb||!authUser)return false;
  const delay=ARENA_WIN_RETRY_MS[Math.min(arenaWinRetryLevel,ARENA_WIN_RETRY_MS.length-1)];
  arenaWinRetryLevel=Math.min(arenaWinRetryLevel+1,ARENA_WIN_RETRY_MS.length-1);
  arenaWinRetryTimer=setTimeout(()=>{arenaWinRetryTimer=null;void flushArenaWinReceipts();},delay);return true;
}
async function flushArenaWinReceipts(){
  if(arenaWinFlushPromise){arenaWinFlushRequested=true;return arenaWinFlushPromise;}
  const owner=arenaWinOwnerId(authUser&&authUser.id);if(!sb||!owner)return false;
  arenaWinFlushPromise=(async()=>{
    let saved=false,failed=false;
    for(const entry of readArenaWinReceipts().filter(row=>row.owner===owner)){
      if(arenaWinOwnerId(authUser&&authUser.id)!==owner){failed=true;break;}
      try{
        const {data,error}=await sb.rpc('record_outpost_zero_arena_win',{p_match_id:entry.matchId,p_expected_user_id:owner});
        if(error)throw error;
        const row=Array.isArray(data)?data[0]:data,wins=Number(row&&row.wins);
        if(!row||typeof row.applied!=='boolean'||!Number.isSafeInteger(wins)||wins<0)throw new Error('Invalid Arena win receipt response.');
        if(!removeArenaWinReceipt(owner,entry.matchId))throw new Error('Could not acknowledge saved Arena win receipt.');
        arenaOwnWinTotal=wins;saved=true;
      }catch(error){failed=true;console.warn('arena win sync failed',error);break;}
    }
    if(saved)await fetchBoard();
    if(failed)scheduleArenaWinRetry();
    else{
      arenaWinRetryLevel=0;
      if(arenaWinRetryTimer){clearTimeout(arenaWinRetryTimer);arenaWinRetryTimer=null;}
    }
    return saved&&!failed;
  })();
  try{return await arenaWinFlushPromise;}
  finally{
    arenaWinFlushPromise=null;
    if(arenaWinFlushRequested){arenaWinFlushRequested=false;queueMicrotask(()=>void flushArenaWinReceipts());}
  }
}
async function submitArenaWin(matchId=arenaWinResultId()){
  if(typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay())return false;
  if(banBlocksBoard()||unrankedRun||adminUsed||!sb||!authUser)return false;
  const owner=arenaWinOwnerId(authUser.id),receipt=arenaWinMatchId(matchId);
  if(!owner||!receipt||!enqueueArenaWinReceipt(owner,receipt))return false;
  return flushArenaWinReceipts();
}
if(typeof window!=='undefined')window.addEventListener('online',()=>void flushArenaWinReceipts());
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void flushArenaWinReceipts();
});
function scheduleLeaderboardRetry(){
  if(leaderboardRetryTimer||!sb)return false;
  const delay=Math.min(30000,1500*Math.pow(2,Math.min(leaderboardRetryLevel,4)));
  leaderboardRetryLevel=Math.min(leaderboardRetryLevel+1,4);
  leaderboardRetryTimer=setTimeout(()=>{leaderboardRetryTimer=null;void fetchBoard();},delay);return true;
}
function syncLeaderboardRetry(){
  const pending=Object.keys(leaderboardFailedVersion).some(key=>leaderboardFailedVersion[key]>leaderboardAppliedVersion[key]);
  if(pending)return scheduleLeaderboardRetry();
  leaderboardRetryLevel=0;if(leaderboardRetryTimer){clearTimeout(leaderboardRetryTimer);leaderboardRetryTimer=null;}return false;
}
async function fetchBoard(){
  if(!sb) return false;
  boardRequestT=Date.now();
  const requestVersion=++leaderboardFetchVersion;
  if(!leaderboardAppliedVersion.endless)leaderboardReadState.endless='loading';
  if(!leaderboardAppliedVersion.arena)leaderboardReadState.arena='loading';
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
  if(authUser&&typeof isMainAdmin==='function'&&isMainAdmin()){
    const identityOwner=String(authUser.id||'');
    const ids=[...new Set(results.filter(result=>!result.error).flatMap(result=>result.rows||[])
      .filter(leaderboardNeedsUsername).map(row=>String(row.user_id||''))
      .filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))].slice(0,10);
    if(ids.length)try{
      const identityResult=await sb.rpc('list_outpost_zero_admin_identity_labels',{p_user_ids:ids});
      if(!identityResult.error&&authUser&&String(authUser.id||'')===identityOwner&&isMainAdmin()){
        const labels=new Map((identityResult.data||[]).map(row=>[String(row.user_id||''),
          String(row.identity_kind||'')==='email'?cleanAccountEmail(row.identity_label):'']));
        for(const result of results)for(const row of result.rows||[])row.adminIdentityLabel=labels.get(String(row.user_id||''))||'';
      }
    }catch(error){}
  }
  let anySuccess=false;
  for(const result of results){
    const arenaResult=result.game==='outpost-zero-arena-wins', key=arenaResult?'arena':'endless';
    if(result.error){
      leaderboardFailedVersion[key]=Math.max(leaderboardFailedVersion[key],requestVersion);
      if(requestVersion>=leaderboardAppliedVersion[key])leaderboardReadState[key]=leaderboardReadFailure(result.error);
      continue;
    }
    // A successful response may publish unless a newer successful response
    // already did. A newer failed request never invalidates useful older data.
    if(requestVersion<leaderboardAppliedVersion[key])continue;
    if(arenaResult) arenaBoard=result.rows; else board=result.rows;
    leaderboardAppliedVersion[key]=requestVersion;
    if(requestVersion>=leaderboardFailedVersion[key])leaderboardFailedVersion[key]=0;
    leaderboardReadState[key]='ready'; anySuccess=true;
  }
  if(anySuccess){boardT=Date.now();syncFallAccess();}
  syncLeaderboardRetry();
  return anySuccess;
}
// ---- report a problem: signed-in, server-attributed report RPC ----
let reportOpen=false, lastReportT=0, reportTargetUsername='';
function openStaffReport(){ if(!isCoAdmin()||isMainAdmin()){sfx('dry');return false;}staffReport=true; adminPanelOpen=false; openReport();return true; }
function openReport(targetUsername=''){
  const clean=String(targetUsername||'').trim().replace(/^@/,'');
  reportTargetUsername=/^[A-Za-z0-9_]{3,32}$/.test(clean)?clean:'';
  reportOpen=true; menuOpen=false;
  $('repwrap').style.display='flex'; $('repstatus').textContent='';
  const title=$('repbox')&&$('repbox').querySelector('h2'),hint=$('repbox')&&$('repbox').querySelector('p');
  if(title)title.textContent=reportTargetUsername?'\u26A0 REPORT @'+reportTargetUsername.toUpperCase():'\u26A0 REPORT A PROBLEM';
  if(hint)hint.textContent=reportTargetUsername
    ? 'Describe what this player did. Their public username is attached automatically; private account details are never included.'
    : 'What went wrong? Include the wave, weapon, and what you expected \u2014 it all helps.';
  if(!authUser)$('repstatus').textContent='sign in to send a report';
  try{ $('repmsg').focus(); }catch(e){}
}
function openReportForUsername(username){staffReport=false;openReport(username);}
function closeReport(){ reportOpen=false; staffReport=false; reportTargetUsername=''; $('repwrap').style.display='none'; }
async function sendReport(){
  if(staffReport&&(!isCoAdmin()||isMainAdmin())){closeReport();return;}
  if(!sb){ $('repstatus').textContent='preview build \u2014 reporting works on the live site'; return; }
  if(!authUser){ $('repstatus').textContent='sign in to send a report'; return; }
  const msg=($('repmsg').value||'').trim();
  if(!msg){ $('repstatus').textContent='write a few words first'; return; }
  const staffActor=typeof isAdmin==='function'&&isAdmin();
  if(!staffActor&&Date.now()-lastReportT<30000){ $('repstatus').textContent='hold on \u2014 one report per 30s'; return; }
  $('repstatus').textContent='sending...';
  const meta={ wave:Math.max(0,Math.min(999999999,Math.floor(+wave||0))),
               score:Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(+score||0))),
               state:String(state||'select').replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)||'select',w:W,h:H,
               dpr:(window.devicePixelRatio||1),
               ua:String((typeof navigator!=='undefined'&&navigator.userAgent)||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160) };
  if(reportTargetUsername)meta.category='player';
  try{
    const { error } = await sb.rpc('submit_outpost_zero_report',{
      p_message:msg.slice(0,1000),p_context:meta,p_reported_username:reportTargetUsername||null
    });
    if(error) throw error;
    if(!staffActor)lastReportT=Date.now();
    $('repstatus').textContent='sent \u2014 thank you!';
    $('repmsg').value='';
    setTimeout(closeReport, 1200);
  }catch(err){
    const detail=[err&&err.message,err&&err.details,err&&err.hint].filter(Boolean).join(' ');
    if(/REPORT_RATE_LIMIT/.test(detail))$('repstatus').textContent='hold on \u2014 one report per 30s';
    else if(/REPORT_SIGN_IN_REQUIRED/.test(detail))$('repstatus').textContent='sign in to send a report';
    else if(/REPORT_USERNAME_REQUIRED/.test(detail))$('repstatus').textContent='choose your username before reporting';
    else if(/REPORTED_USERNAME_NOT_FOUND/.test(detail))$('repstatus').textContent='that username no longer exists';
    else $('repstatus').textContent='could not send \u2014 try again in a bit';
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
  if(typeof prepareBotLadderForAuthChange==='function')prepareBotLadderForAuthChange('');
  if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange('');
  if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange('');
  authUser=null;arenaOwnWinTotal=null;authProfileRequestVersion++;postUsernameGateUserId='';prepareLocalGuestAfterAuthLoss();
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
    : 'ACCOUNT EMAIL \u00b7 visible to you and creator/main staff until you choose a username';
  if(el.detail)el.detail.textContent=chosen
    ? 'Manage your public username and password, or safely sign out of this device.'
    : 'Choose a public username in Settings before playing. Until then, creator/main staff may use your email as the account label.';
  if(el.actions)el.actions.hidden=accountMenuConfirming;
  if(el.confirm)el.confirm.hidden=!accountMenuConfirming;
  if(el.warning)el.warning.textContent=accountMenuForfeitWarning();
  for(const button of [el.settings,el.signout,el.cancel,el.confirmCancel,el.confirmSignout])if(button)button.disabled=accountMenuBusy;
  if(el.status)el.status.textContent=accountMenuBusy?'SIGNING OUT\u2026':'';
  return true;
}
function restoreAccountMenuFocus(){
  if(typeof restoreAccountTriggerFocus==='function'&&restoreAccountTriggerFocus())return true;
  const canvas=$('c');
  if(canvas&&typeof canvas.focus==='function')try{
    canvas.focus({preventScroll:true});
    return typeof document==='undefined'||document.activeElement===canvas;
  }catch(error){try{canvas.focus();return typeof document==='undefined'||document.activeElement===canvas;}catch(focusError){}}
  return false;
}
function closeAccountMenu(force=false){
  if(accountMenuBusy&&!force)return false;
  const el=accountMenuElements(),hadFocus=!!(typeof document!=='undefined'&&el.wrap&&typeof el.wrap.contains==='function'&&el.wrap.contains(document.activeElement));
  accountMenuOpen=false;accountMenuConfirming=false;accountMenuBusy=false;accountMenuUserId='';accountMenuReturnView='';
  if(el.wrap){el.wrap.style.display='none';el.wrap.setAttribute('aria-hidden','true');el.wrap.classList.remove('confirming','busy');}
  if(el.actions)el.actions.hidden=false;if(el.confirm)el.confirm.hidden=true;
  if(el.identity)el.identity.textContent='';if(el.email)el.email.textContent='';if(el.status)el.status.textContent='';
  for(const button of [el.settings,el.signout,el.cancel,el.confirmCancel,el.confirmSignout])if(button)button.disabled=false;
  // Forced closes happen after sign-out/account replacement too. Do not leave
  // keyboard focus inside the now-hidden account or confirmation dialog.
  if(hadFocus)restoreAccountMenuFocus();
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
  if(!ok&&authUser&&String(authUser.id||'')===userId){
    accountMenuBusy=false;syncAccountMenu();
    const status=accountMenuElements().status;
    if(status)status.textContent='COULD NOT SAFELY SAVE PROGRESS. RECONNECT AND TRY AGAIN.';
  }
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
    if(typeof persistNormalEndlessScoreOnExit==='function')persistNormalEndlessScoreOnExit();
    if(typeof isBotArena==='function'&&isBotArena()&&typeof arenaRecordDailyMatch==='function')
      arenaRecordDailyMatch(LOCAL_DUEL_PLAYER,'',typeof arenaHasCompletedDailyTaskRound==='function'&&arenaHasCompletedDailyTaskRound());
    try{if(typeof arenaForfeitBeforeSignOut==='function')await arenaForfeitBeforeSignOut();}
    catch(error){console.warn('arena sign-out forfeit failed',error);}
    if(profileLoaded&&profileOwnerUserId===liveUserId&&typeof saveProfile==='function'){
      const profileSaved=await Promise.race([saveProfile(true),new Promise(resolve=>setTimeout(()=>resolve(false),9000))]);
      if(!profileSaved)return false;
    }
    let signOutError=null;
    if(sb)try{const result=await sb.auth.signOut();signOutError=result&&result.error||null;}
    catch(error){signOutError=error;}
    if(signOutError)console.warn('cloud sign-out failed; clearing this screen locally',signOutError);
    if(authUser&&String(authUser.id||'')!==liveUserId){closeAccountMenu(true);return true;}
    if(authUser&&typeof scrubPrivilegedUiForAccountChange==='function')scrubPrivilegedUiForAccountChange();
    if(typeof prepareBotLadderForAuthChange==='function')prepareBotLadderForAuthChange('');
    if(typeof partyPrepareForAuthChange==='function')partyPrepareForAuthChange('');
    if(typeof clearMyBanForAuthChange==='function')clearMyBanForAuthChange('');
    authUser=null;arenaOwnWinTotal=null;authProfileRequestVersion++;postUsernameGateUserId='';
    closeAccountMenu(true);prepareLocalGuestAfterAuthLoss();
    if(typeof resetSocialState==='function')resetSocialState('SIGNED OUT');
    else if(typeof closeUsernameClaim==='function')closeUsernameClaim(true);
    paintUserbar();return true;
  }
  closeAccountMenu(true);authActionCancel(false);arenaAuthPending=false;$('aguest').style.display='block';$('authwrap').style.display='flex';
  try{setTimeout(()=>$('aidentifier').focus(),0);}catch(error){}
  return true;
}
function authElements(){
  if(typeof document==='undefined')return {};
  return {wrap:$('authwrap'),section:$('authsignin'),identifier:$('aidentifier'),password:$('apass'),
    signIn:$('ain'),signUp:$('aup'),forgot:$('aforgot'),message:$('authmsg'),choice:$('authaccountchoice'),
    chooseEmail:$('achooseemail'),chooseUsername:$('achooseusername')};
}
function authIdentifierValue(){
  const el=authElements();return String(el.identifier&&el.identifier.value||'').trim();
}
function authIdentifierKind(raw){
  const value=String(raw||'').trim();
  if(!value||value.length>254||/\s/.test(value))return '';
  if(value[0]!=='@'&&/^[^@]+@[^@]+$/.test(value))return 'email';
  return /^[A-Za-z0-9_]{3,32}$/.test(value.replace(/^@/,''))?'username':'';
}
function authActionSync(){
  const el=authElements(),busy=!!authActionBusy;
  if(el.section&&el.section.classList)el.section.classList.toggle('busy',busy);
  for(const control of [el.identifier,el.password,el.signIn,el.signUp,el.chooseEmail,el.chooseUsername])if(control)control.disabled=busy;
  if(el.forgot){el.forgot.setAttribute('aria-disabled',busy?'true':'false');el.forgot.tabIndex=busy?-1:0;}
  return busy;
}
function authAccountChoice(show=false,message=''){
  const el=authElements();authAccountChoiceOpen=!!show;
  if(el.choice)el.choice.hidden=!authAccountChoiceOpen;
  const title=typeof document!=='undefined'?$('authaccountchoicetitle'):null;
  if(title&&message)title.textContent=String(message);
  return authAccountChoiceOpen;
}
function authActionCurrent(epoch){return !!epoch&&authActionBusy&&epoch===authActionEpoch;}
function authActionStart(message){
  if(authActionBusy)return 0;
  authActionBusy=true;const epoch=++authActionEpoch;
  const el=authElements();if(el.message)el.message.textContent=String(message||'');
  authActionSync();return epoch;
}
function authActionFinish(epoch){
  if(!authActionCurrent(epoch))return false;
  authActionBusy=false;authActionSync();return true;
}
function authActionCancel(clearPassword=false){
  ++authActionEpoch;authActionBusy=false;
  const el=authElements();if(clearPassword&&el.password)el.password.value='';
  authAccountChoice(false);
  authActionSync();return true;
}
function authFunctionStatus(error){
  const context=error&&error.context;
  return Number(context&&context.status||error&&error.status||0)||0;
}
function authSignInFailure(error,edge=false){
  const status=authFunctionStatus(error),code=String(error&&error.code||'').toLowerCase(),name=String(error&&error.name||'');
  if(status===429||code.includes('rate_limit'))return {ok:false,message:AUTH_TRY_LATER,reason:'rate'};
  if(edge&&(status===404||/FunctionsFetchError|FunctionsRelayError/.test(name)))
    return {ok:false,message:AUTH_SIGNIN_SETUP,reason:'setup'};
  if(status===400||status===401||status===403||code==='invalid_credentials'||code==='email_not_confirmed')
    return {ok:false,message:AUTH_INVALID_CREDENTIALS,reason:'credentials'};
  return {ok:false,message:'Could not reach sign-in. Check your connection and try again.',reason:'unavailable'};
}
async function authDirectEmailSignIn(identifier,password,epoch=authActionEpoch){
  try{
    // Availability fallback for a deployment where the Edge Function is not
    // installed yet. A current deployment routes email through the function
    // first so its credential-verified legacy-collision guard can run.
    const detached=authDetachedClient('signin',epoch);
    if(!detached)return {ok:false,message:'Email sign-in is temporarily unavailable. Reload and try again.',reason:'unavailable'};
    const result=await detached.auth.signInWithPassword({email:identifier,password});
    if(!authActionCurrent(epoch))return {ok:false,stale:true,reason:'stale'};
    if(result&&result.error)return authSignInFailure(result.error);
    const session=result&&result.data&&result.data.session,
      accessToken=String(session&&session.access_token||''),refreshToken=String(session&&session.refresh_token||'');
    if(!accessToken||!refreshToken)return {ok:false,message:'Email sign-in is temporarily unavailable. Try again.',reason:'unavailable'};
    if(!authActionCurrent(epoch))return {ok:false,stale:true,reason:'stale'};
    const installed=await sb.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
    return installed&&installed.error?authSignInFailure(installed.error):{ok:true};
  }catch(error){return authSignInFailure(error);}
}
async function authSignInWithIdentifier(rawIdentifier,password,epoch=authActionEpoch,accountKind=''){
  const kind=authIdentifierKind(rawIdentifier),identifier=String(rawIdentifier||'').trim(),choice=String(accountKind||'');
  if(!kind||!password||!['','email','username'].includes(choice)||
     (choice==='email'&&kind!=='email'))
    return {ok:false,message:'Email or username and password are required.',reason:'invalid'};
  if(!sb)return {ok:false,message:'Sign-in unavailable here \u2014 works once deployed.',reason:'unavailable'};
  const normalized=kind==='username'?identifier.replace(/^@/,''):identifier;
  try{
    if(!sb.functions||typeof sb.functions.invoke!=='function')
      return kind==='email'&&!choice?authDirectEmailSignIn(identifier,password,epoch):
        {ok:false,message:AUTH_SIGNIN_SETUP,reason:'setup'};
    // Both identity types go through the server so an email-shaped malformed
    // legacy username can be detected without exposing either account. The
    // shared client receives tokens only after the form epoch is still active.
    const body={identifier:normalized,password};if(choice)body.account_kind=choice;
    const result=await sb.functions.invoke(AUTH_IDENTIFIER_FUNCTION,{body});
    if(!authActionCurrent(epoch))return {ok:false,stale:true,reason:'stale'};
    if(result&&result.error){
      const failure=authSignInFailure(result.error,true);
      return kind==='email'&&!choice&&failure.reason==='setup'
        ?authDirectEmailSignIn(identifier,password,epoch):failure;
    }
    const session=result&&result.data,keys=session&&typeof session==='object'?Object.keys(session).sort():[];
    if(!choice&&session&&session.code===AUTH_AMBIGUOUS_IDENTIFIER)
      return {ok:false,ambiguous:true,message:String(session.message||'Choose which account you want to sign in to.'),reason:'ambiguous'};
    if(keys.length!==2||keys[0]!=='access_token'||keys[1]!=='refresh_token'||
       typeof session.access_token!=='string'||!session.access_token||
       typeof session.refresh_token!=='string'||!session.refresh_token)
      return {ok:false,message:'Sign-in is temporarily unavailable. Try again.',reason:'unavailable'};
    if(!authActionCurrent(epoch))return {ok:false,stale:true,reason:'stale'};
    const installed=await sb.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    return installed&&installed.error?authSignInFailure(installed.error):{ok:true};
  }catch(error){return authSignInFailure(error,true);}
}
async function authSubmitSignIn(accountKind=''){
  const identifier=authIdentifierValue(),password=$('apass').value,choice=String(accountKind||'');
  if(!authIdentifierKind(identifier)||!password){$('authmsg').textContent='Email or username and password are required.';return false;}
  if(!choice)authAccountChoice(false);
  const epoch=authActionStart(choice?'SIGNING IN TO '+choice.toUpperCase()+' ACCOUNT\u2026':'SIGNING IN\u2026');if(!epoch)return false;
  const result=await authSignInWithIdentifier(identifier,password,epoch,choice);
  if(!authActionFinish(epoch)||result.stale)return false;
  if(result.ambiguous){
    authAccountChoice(true,result.message);
    $('authmsg').textContent='CHOOSE EMAIL ACCOUNT OR USERNAME ACCOUNT';
    try{$('achooseemail').focus();}catch(error){}
    return false;
  }
  if(result.ok)authAccountChoice(false);
  else if(choice&&result.reason==='credentials')authAccountChoice(true);
  $('authmsg').textContent=result.ok?'SIGNED IN\u2026':result.message;
  return !!result.ok;
}
function authDetachedClient(purpose,epoch){
  const factory=typeof window!=='undefined'&&window.supabase;
  if(!factory||typeof factory.createClient!=='function')return null;
  return factory.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,
    detectSessionInUrl:false,storageKey:'oz-detached-'+String(purpose||'auth')+'-'+String(epoch||Date.now())}});
}
async function authCreateAccount(rawIdentifier,password,epoch=authActionEpoch){
  const identifier=String(rawIdentifier||'').trim();
  if(authIdentifierKind(identifier)!=='email')
    return {ok:false,message:'Creating an account needs your private email address. You choose a username after signing in.'};
  if(password.length<6)return {ok:false,message:'Password must be at least 6 characters.'};
  if(!sb)return {ok:false,message:'Account creation works once deployed.'};
  try{
    // Deliberately omit username metadata. Social creates a temporary private-
    // email-free handle, then the existing post-auth gate requires the player
    // to make one durable public choice from Settings.
    const detached=authDetachedClient('signup',epoch);
    if(!detached)return {ok:false,message:'Account creation is temporarily unavailable. Reload and try again.'};
    const result=await detached.auth.signUp({email:identifier,password});
    if(!authActionCurrent(epoch))return {ok:false,stale:true};
    if(result&&result.error){
      const status=authFunctionStatus(result.error),code=String(result.error.code||'').toLowerCase();
      if(status===429||code.includes('rate_limit'))return {ok:false,message:AUTH_TRY_LATER};
      if(code.includes('weak_password'))return {ok:false,message:'Use a stronger password with at least 6 characters.'};
      return {ok:false,message:'Could not create that account. Try signing in, resetting your password, or using a different email.'};
    }
    const session=result&&result.data&&result.data.session;
    if(session){
      const accessToken=String(session.access_token||''),refreshToken=String(session.refresh_token||'');
      if(!accessToken||!refreshToken)return {ok:false,message:'Account created, but automatic sign-in failed. Sign in again here.'};
      if(!authActionCurrent(epoch))return {ok:false,stale:true};
      const installed=await sb.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
      if(installed&&installed.error)return {ok:false,message:'Account created, but automatic sign-in failed. Sign in again here.'};
    }
    return {ok:true,authenticated:!!(result&&result.data&&result.data.session),
      message:'Account created. Check your email to verify it, then sign in here. You will choose your username after sign-in.'};
  }catch(error){return {ok:false,message:'Could not create the account. Check your connection and try again.'};}
}
async function authRequestPasswordReset(rawIdentifier){
  const email=String(rawIdentifier||'').trim();
  if(authIdentifierKind(email)!=='email')
    return {ok:false,message:'Enter your private email above for password recovery. Usernames never reveal account emails.'};
  if(!sb)return {ok:false,message:'Password reset works once deployed.'};
  try{
    const result=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.href});
    if(result&&result.error){
      const status=authFunctionStatus(result.error),code=String(result.error.code||'').toLowerCase();
      if(status===429||code.includes('rate_limit'))return {ok:false,message:AUTH_TRY_LATER};
      return {ok:false,message:'Could not send a reset link. Check your connection and try again.'};
    }
    return {ok:true,message:'If that email has an account, a reset link is on the way.'};
  }catch(error){return {ok:false,message:'Could not send a reset link. Check your connection and try again.'};}
}
function accountSettingsElements(){
  if(typeof document==='undefined') return {};
  return {
    wrap:$('settingswrap'),box:$('settingsbox'),title:$('settingstitle'),account:$('settingsaccount'),intro:$('settingsintro'),
    home:$('settingshome'),usernameOpen:$('settingsusernameopen'),usernameSummary:$('settingsusernamesummary'),
    passwordOpen:$('settingspasswordopen'),passwordSummary:$('settingspasswordsummary'),
    usernamePanel:$('settingsusernamepanel'),passwordPanel:$('settingspasswordpanel'),
    username:$('settingsusername'),usernameHint:$('settingsusernamehint'),
    usernameSave:$('settingsusernamesave'),usernameStatus:$('settingsusernamestatus'),usernameBack:$('settingsusernameback'),
    pass1:$('settingspass1'),pass2:$('settingspass2'),passwordSave:$('settingspasswordsave'),
    passwordStatus:$('settingspasswordstatus'),passwordBack:$('settingspasswordback'),
    signout:$('settingssignout'),close:$('settingsclose')
  };
}
function accountSettingsSetStatus(kind,message,error=false){
  const el=accountSettingsElements(), target=kind==='password'?el.passwordStatus:el.usernameStatus;
  if(!target) return;
  target.textContent=String(message||''); target.className='settings-status'+(error?' error':'');
  if(kind==='username'&&el.username)el.username.setAttribute('aria-invalid',error?'true':'false');
}
function accountSettingsCaptureFocus(){
  if(typeof document==='undefined') return null;
  const active=document.activeElement,menu=$('accountmenuwrap'),gate=$('usernameclaimwrap');
  if(active&&menu&&typeof menu.contains==='function'&&menu.contains(active)) return $('accountmenutrigger')||$('c');
  if(active&&gate&&typeof gate.contains==='function'&&gate.contains(active)) return $('c');
  if(!active||active===document.body||active===document.documentElement||typeof active.focus!=='function')return $('c');
  return active;
}
function accountSettingsRestoreFocus(){
  const target=accountSettingsReturnFocus;accountSettingsReturnFocus=null;
  const trigger=$('accountmenutrigger');
  if(target===trigger&&typeof restoreAccountTriggerFocus==='function'&&restoreAccountTriggerFocus()) return true;
  const fallback=$('c'),next=target&&target.isConnected!==false&&!target.disabled?target:fallback;
  if(next&&typeof next.focus==='function')try{
    next.focus({preventScroll:true});
    if(typeof document==='undefined'||document.activeElement===next)return true;
  }catch(error){try{next.focus();if(typeof document==='undefined'||document.activeElement===next)return true;}catch(focusError){}}
  if(fallback&&typeof fallback.focus==='function')try{fallback.focus();return true;}catch(error){}
  return false;
}
function accountSettingsFocusable(){
  const el=accountSettingsElements();
  const choices=accountSettingsSection==='username'
    ?[el.username,el.usernameSave,accountSettingsRequiredUsername?null:el.usernameBack,el.signout,accountSettingsRequiredUsername?null:el.close]
    :accountSettingsSection==='password'
      ?[el.pass1,el.pass2,el.passwordSave,el.passwordBack,el.signout,el.close]
      :[el.usernameOpen,el.passwordOpen,el.signout,el.close];
  return choices.filter(node=>node&&!node.disabled&&typeof node.focus==='function');
}
function accountSettingsTrapTab(event){
  const controls=accountSettingsFocusable();
  if(!controls.length){event.preventDefault();return false;}
  const first=controls[0],last=controls[controls.length-1],active=document.activeElement;
  if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
  return true;
}
function accountSettingsSetSection(section='menu',focus=false){
  const el=accountSettingsElements();
  let next=['username','password'].includes(section)?section:'menu';
  if(accountSettingsRequiredUsername) next='username';
  if(accountSettingsBusy&&next!==accountSettingsSection)return accountSettingsSection;
  const previous=accountSettingsSection;
  accountSettingsSection=next;
  if(previous==='password'&&next!=='password'){
    if(el.pass1) el.pass1.value='';
    if(el.pass2) el.pass2.value='';
    accountSettingsSetStatus('password','');
  }
  if(el.title) el.title.textContent=next==='username'?'USERNAME SETTINGS':next==='password'?'PASSWORD SETTINGS':'ACCOUNT SETTINGS';
  if(el.intro) el.intro.hidden=next!=='menu';
  if(el.home) el.home.hidden=next!=='menu';
  if(el.usernamePanel) el.usernamePanel.hidden=next!=='username';
  if(el.passwordPanel) el.passwordPanel.hidden=next!=='password';
  if(el.close) el.close.textContent='CLOSE';
  if(focus){
    const target=next==='username'
      ?(!el.username||el.username.disabled?(accountSettingsRequiredUsername?el.signout:el.usernameBack):el.username)
      :next==='password'?el.pass1:el.usernameOpen;
    try{setTimeout(()=>target&&target.focus(),0);}catch(error){}
  }
  return next;
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
    ? ('SIGNED IN AS '+(email||'YOUR ACCOUNT')+' · ACCOUNT EMAIL')
    : 'SIGN IN TO MANAGE YOUR ACCOUNT';
  const current=chosen?String(socialProfile.handle||''):'';
  if(el.username&&(resetInput||!el.username.value)) el.username.value=current;
  const readyAt=chosen?accountSettingsUsernameReadyAt():0, locked=readyAt>Date.now();
  if(el.usernameHint) el.usernameHint.textContent=!signedIn
    ? 'Sign in before choosing a public username.'
    : !chosen
      ? 'Choose the public username shown throughout the game. Until then, creator/main staff may see your email as the fallback account label.'
      : locked
        ? 'Your username is @'+current+'. It can be changed again on '+accountSettingsDate(readyAt)+'.'
        : 'Your username is @'+current+'. After saving a different one, you must wait 21 days before changing it again.';
  if(el.usernameSummary) el.usernameSummary.textContent=!chosen
    ? 'Choose your public username'
    : locked?('@'+current+' · locked until '+accountSettingsDate(readyAt)):('@'+current+' · change available');
  if(el.passwordSummary) el.passwordSummary.textContent='Private · update your sign-in password';
  if(el.usernameSave){
    el.usernameSave.textContent=chosen?'CHANGE USERNAME':'CHOOSE USERNAME';
    el.usernameSave.disabled=accountSettingsBusy||!profileReady||locked;
  }
  if(el.username) el.username.disabled=accountSettingsBusy||!profileReady||locked;
  if(el.passwordSave) el.passwordSave.disabled=accountSettingsBusy||!signedIn||!sb;
  if(el.pass1) el.pass1.disabled=accountSettingsBusy||!signedIn;
  if(el.pass2) el.pass2.disabled=accountSettingsBusy||!signedIn;
  if(el.signout) el.signout.disabled=accountSettingsBusy||!signedIn;
  for(const control of [el.usernameOpen,el.passwordOpen,el.usernameBack,el.passwordBack,el.close])
    if(control)control.disabled=accountSettingsBusy;
  accountSettingsRequiredUsername=!!(signedIn&&accountSettingsRequiredUsername&&!chosen);
  el.wrap.classList.toggle('required',accountSettingsRequiredUsername);
  accountSettingsSetSection(accountSettingsSection);
  return true;
}
function openAccountSettings(options={}){
  if(!authUser){ toggleAuth(); return false; }
  if(!accountSettingsOpen){accountSettingsReturnFocus=accountSettingsCaptureFocus();accountSettingsEpoch++;}
  if(accountMenuOpen)closeAccountMenu(true);
  const opts=options&&typeof options==='object'?options:{};
  accountSettingsOpen=true;
  accountSettingsUserId=String(authUser.id||'');
  const settingsEpoch=accountSettingsEpoch,settingsUserId=accountSettingsUserId;
  if(typeof resetHeldGameplayInput==='function') resetHeldGameplayInput();
  accountSettingsRequiredUsername=!!(opts.requiredUsername||
    (typeof usernameClaimRequired==='function'&&usernameClaimRequired()));
  accountSettingsSection=accountSettingsRequiredUsername?'username':
    opts.focus==='username'?'username':opts.focus==='password'?'password':'menu';
  const el=accountSettingsElements();
  if(el.wrap) el.wrap.style.display='flex';
  const gate=typeof document!=='undefined'&&document.getElementById('usernameclaimwrap');
  if(gate) gate.style.display='none';
  accountSettingsSetStatus('username',''); accountSettingsSetStatus('password','');
  accountSettingsSync(true);
  if((!socialProfile||String(socialProfile.user_id||'')!==String(authUser.id||''))&&typeof fetchSocial==='function'){
    void Promise.resolve(fetchSocial(true)).then(()=>{
      if(accountSettingsOpen&&accountSettingsEpoch===settingsEpoch&&accountSettingsUserId===settingsUserId&&
         authUser&&String(authUser.id||'')===settingsUserId)accountSettingsSync(true);
    });
  }
  accountSettingsSetSection(accountSettingsSection,true);
  return true;
}
function closeAccountSettings(force=false){
  if(!accountSettingsOpen) return true;
  if(accountSettingsBusy&&!force){
    accountSettingsSetStatus(accountSettingsSection==='password'?'password':'username','Wait for this account change to finish.');
    return false;
  }
  if(!force&&accountSettingsRequiredUsername&&
     typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()){
    accountSettingsSetStatus('username','Choose a username before leaving account setup.',true); return false;
  }
  const el=accountSettingsElements();
  const hadFocus=!!(typeof document!=='undefined'&&el.wrap&&typeof el.wrap.contains==='function'&&el.wrap.contains(document.activeElement));
  accountSettingsEpoch++;
  accountSettingsOpen=false; accountSettingsRequiredUsername=false; accountSettingsBusy=false; accountSettingsUserId=''; accountSettingsSection='menu';
  if(el.wrap){ el.wrap.style.display='none'; el.wrap.classList.remove('required'); }
  if(el.pass1) el.pass1.value=''; if(el.pass2) el.pass2.value='';
  if(!force&&typeof usernameClaimRequired==='function'&&usernameClaimRequired()&&typeof openUsernameClaim==='function')
    openUsernameClaim('required','Open Settings to choose your public username.');
  if(hadFocus)accountSettingsRestoreFocus();else accountSettingsReturnFocus=null;
  return true;
}
async function saveAccountSettingsUsername(){
  const el=accountSettingsElements(), value=String(el.username&&el.username.value||'').trim();
  if(accountSettingsBusy) return false;
  if(typeof socialUsernameValidationMessage==='function'){
    const problem=socialUsernameValidationMessage(value,authUser&&authUser.id);
    if(problem){accountSettingsSetStatus('username',problem,true);return false;}
  }
  if(typeof socialUpdateHandle!=='function'){
    accountSettingsSetStatus('username','Username settings are still loading. Try again.',true); return false;
  }
  const userId=String(authUser&&authUser.id||''),settingsEpoch=typeof accountSettingsEpoch==='number'?accountSettingsEpoch:0;
  accountSettingsBusy=true; accountSettingsSetStatus('username','Saving username…'); accountSettingsSync();
  let ok=false;
  try{ ok=await socialUpdateHandle(value,accountSettingsRequiredUsername); }
  finally{
    if(accountSettingsOpen&&accountSettingsUserId===userId&&authUser&&String(authUser.id||'')===userId&&
       (typeof accountSettingsEpoch!=='number'||accountSettingsEpoch===settingsEpoch)){
      accountSettingsBusy=false; accountSettingsSync(!!ok);
    }
  }
  if(!accountSettingsOpen||accountSettingsUserId!==userId||!authUser||String(authUser.id||'')!==userId||
     (typeof accountSettingsEpoch==='number'&&accountSettingsEpoch!==settingsEpoch)) return false;
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
  const userId=String(authUser.id||''),settingsEpoch=typeof accountSettingsEpoch==='number'?accountSettingsEpoch:0;
  accountSettingsBusy=true; accountSettingsSetStatus('password','Changing password…'); accountSettingsSync();
  try{
    const result=await sb.auth.updateUser({password:first});
    if(result&&result.error) throw result.error;
    if(!accountSettingsOpen||accountSettingsUserId!==userId||!authUser||String(authUser.id||'')!==userId||
       (typeof accountSettingsEpoch==='number'&&accountSettingsEpoch!==settingsEpoch)) return false;
    if(el.pass1) el.pass1.value=''; if(el.pass2) el.pass2.value='';
    accountSettingsSetStatus('password','Password changed successfully. Use it the next time you sign in.');
    return true;
  }catch(error){
    if(accountSettingsOpen&&accountSettingsUserId===userId&&authUser&&String(authUser.id||'')===userId&&
       (typeof accountSettingsEpoch!=='number'||accountSettingsEpoch===settingsEpoch))
      accountSettingsSetStatus('password',String(error&&error.message||'Could not change password. Try again.'),true);
    return false;
  }finally{
    if(accountSettingsOpen&&accountSettingsUserId===userId&&authUser&&String(authUser.id||'')===userId&&
       (typeof accountSettingsEpoch!=='number'||accountSettingsEpoch===settingsEpoch)){
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
    closeAccountMenu(true);openAccountSettings(required?{focus:'username',requiredUsername:true}:{});
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
  if(typeof accountSettingsSetSection==='function'){
    $('settingsusernameopen').onclick=()=>accountSettingsSetSection('username',true);
    $('settingspasswordopen').onclick=()=>accountSettingsSetSection('password',true);
    $('settingsusernameback').onclick=()=>accountSettingsSetSection('menu',true);
    $('settingspasswordback').onclick=()=>accountSettingsSetSection('menu',true);
  }
  if(typeof closeAccountSettings==='function'){
    $('settingsclose').onclick=()=>closeAccountSettings();
    $('settingssignout').onclick=()=>requestSignOut('settings');
    $('settingswrap').addEventListener('keydown',event=>{
      // Keep every Settings key inside the DOM modal. Enter/Space retain their
      // native button behavior; Escape closes and Tab stays within the dialog.
      event.stopPropagation();
      if(event.key==='Escape'){ event.preventDefault(); closeAccountSettings(); }
      else if(event.key==='Tab'&&typeof accountSettingsTrapTab==='function')accountSettingsTrapTab(event);
    });
  }
  if(typeof saveAccountSettingsUsername==='function')
    $('settingsusername').addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); saveAccountSettingsUsername(); } });
  $('settingsusername').addEventListener('input',()=>{
    const el=typeof accountSettingsElements==='function'?accountSettingsElements():{};
    if(!el.usernameStatus||!el.usernameStatus.classList.contains('error'))return;
    const problem=typeof socialUsernameValidationMessage==='function'
      ? socialUsernameValidationMessage(el.username&&el.username.value,authUser&&authUser.id):'';
    accountSettingsSetStatus('username',problem,!!problem);
  });
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
  $('aguest').onclick = ()=>{
    if(!recovering&&!arenaAuthPending){authActionCancel(true);$('authmsg').textContent='';$('authwrap').style.display='none';}
  };
  $('acancel').onclick = async ()=>{
  authActionCancel(true);
  if(await cancelPasswordRecoverySession())return;   // keep the panel open so they see the recovery message
  recovering=false;
  arenaAuthPending=false; $('aguest').style.display='block';
  $('resetbox').style.display='none';
  $('rsave').style.display='block'; $('rdone').style.display='none';
  $('authmsg').textContent='';
  $('authwrap').style.display='none';
  };
  for(const id of ['aidentifier','apass']){
    $(id).addEventListener('input',()=>authAccountChoice(false));
    $(id).addEventListener('keydown', e=>{ if(e.key==='Enter'){e.preventDefault();$('ain').click();} });
  }
  $('ain').onclick = ()=>authSubmitSignIn('');
  $('achooseemail').onclick = ()=>authSubmitSignIn('email');
  $('achooseusername').onclick = ()=>authSubmitSignIn('username');
  $('aup').onclick = async ()=>{
  const identifier=authIdentifierValue(),password=$('apass').value;
  if(authIdentifierKind(identifier)!=='email'){
    $('authmsg').textContent='Creating an account needs your private email address. You choose a username after signing in.';return;
  }
  const epoch=authActionStart('CREATING ACCOUNT\u2026');if(!epoch)return;
  const result=await authCreateAccount(identifier,password,epoch);
  if(!authActionFinish(epoch))return;
  $('authmsg').textContent=result.message;
  };
  $('aforgot').onclick = async (ev)=>{
  ev.preventDefault();
  if(authActionBusy)return;
  const identifier=authIdentifierValue();
  if(authIdentifierKind(identifier)!=='email'){
    $('authmsg').textContent='Enter your private email above for password recovery. Usernames never reveal account emails.';return;
  }
  const epoch=authActionStart('SENDING RESET LINK\u2026');if(!epoch)return;
  const result=await authRequestPasswordReset(identifier);
  if(!authActionFinish(epoch))return;
  $('authmsg').textContent=result.message;
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
