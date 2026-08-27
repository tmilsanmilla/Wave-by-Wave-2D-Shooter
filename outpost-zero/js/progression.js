"use strict";

// daily login streak: rolls over at 12:00 UTC like the tasks, and must be COLLECTED by hand
let streakDays=0, streakLongest=0, streakLastDay='', streakBtnRect=null, streakMsgT=0, streakMsg='',streakClaimBusy=false,streakClaimAccountEpoch=0;
const STREAK_GEM_REWARDS=Object.freeze([10,20,30,40,50,60,100]);
let referralUsed=false, referralPaid=0, referralMsg='', referralMsgT=0, shareBtnRect=null, referralPending='';
const referralPayInFlight=new Map();
const REFERRAL_GEMS=5;
const REFERRAL_PUBLIC_URL='https://wave-by-wave-2-d-shooter.vercel.app/';
const REFERRAL_PENDING_KEY='oz_pending_referral';
function validReferralId(value){
  const id=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : '';
}
function capturePendingReferral(){
  let fromUrl='';
  try{ fromUrl=validReferralId(new URL(location.href).searchParams.get('ref')); }catch(e){}
  if(fromUrl){
    referralPending=fromUrl;
    try{ localStorage.setItem(REFERRAL_PENDING_KEY,fromUrl); }catch(e){}
    return referralPending;
  }
  try{ referralPending=validReferralId(localStorage.getItem(REFERRAL_PENDING_KEY)); }catch(e){ referralPending=''; }
  return referralPending;
}
function clearPendingReferral(ref){
  ref=validReferralId(ref);
  if(!ref || referralPending===ref) referralPending='';
  try{ if(!ref || validReferralId(localStorage.getItem(REFERRAL_PENDING_KEY))===ref) localStorage.removeItem(REFERRAL_PENDING_KEY); }catch(e){}
  try{
    const u=new URL(location.href);
    if(validReferralId(u.searchParams.get('ref'))===ref){ u.searchParams.delete('ref'); history.replaceState({},'',u.href); }
  }catch(e){}
}
function pendingReferralId(){ return referralPending||capturePendingReferral(); }
function referralLink(){
  if(!authUser) return REFERRAL_PUBLIC_URL;
  const u=new URL(REFERRAL_PUBLIC_URL);               // file:// previews must still share the real website
  u.searchParams.set('ref',authUser.id);
  return u.href;
}
async function copyReferralLink(url){
  if(!navigator.clipboard || typeof navigator.clipboard.writeText!=='function') return false;
  await navigator.clipboard.writeText(url); return true;
}
async function shareReferral(){
  if(!authUser){ referralMsg='SIGN IN TO GET YOUR SHARE LINK'; referralMsgT=now+2400; sfx('dry'); return; }
  const url=referralLink(), text='Play OUTPOST ZERO with me! We both get 5 gems.';
  try{
    if(typeof navigator.share==='function'){
      await navigator.share({title:'OUTPOST ZERO',text,url});
      referralMsg='SHARED \u2014 YOU BOTH GET 5 GEMS';
    } else if(await copyReferralLink(url)) referralMsg='LINK COPIED \u2014 YOU BOTH GET 5 GEMS';
    else { window.prompt('Copy your share link:',url); referralMsg='SHARE THIS LINK \u2014 YOU BOTH GET 5 GEMS'; }
  }catch(e){
    if(e&&e.name==='AbortError') referralMsg='SHARE CANCELLED';
    else try{
      if(await copyReferralLink(url)) referralMsg='LINK COPIED \u2014 YOU BOTH GET 5 GEMS';
      else { window.prompt('Copy your share link:',url); referralMsg='SHARE THIS LINK \u2014 YOU BOTH GET 5 GEMS'; }
    }catch(e2){ window.prompt('Copy your share link:',url); referralMsg='SHARE THIS LINK \u2014 YOU BOTH GET 5 GEMS'; }
  }
  referralMsgT=now+3000; sfx('pickup');
}
async function payReferralClaims(){
  if(!sb||!authUser) return;
  const userId=String(authUser.id||'');
  if(referralPayInFlight.has(userId)) return referralPayInFlight.get(userId);
  const task=(async()=>{
    try{
      const game='outpost-zero-referral:'+userId;
      const {count,error}=await sb.from('scores').select('user_id',{count:'exact',head:true}).eq('game',game);
      if(error) throw error;
      // An old request must never credit whoever signed in after it started.
      if(!authUser||authUser.id!==userId) return;
      const total=count||0, unpaid=Math.max(0,total-referralPaid);
      if(unpaid&&gemRewardsEnabled()){ referralPaid=total; addGems(unpaid*REFERRAL_GEMS); saveMeta();
        referralMsg='FRIEND JOINED! +'+(unpaid*REFERRAL_GEMS)+' GEMS'; referralMsgT=now+4000; }
    }catch(e){ console.warn('referral payout failed',e); }
  })();
  referralPayInFlight.set(userId,task);
  try{ return await task; }
  finally{ if(referralPayInFlight.get(userId)===task) referralPayInFlight.delete(userId); }
}
function awardReferralReceiver(){
  if(referralUsed) return true;
  referralUsed=true;
  if(!addGems(REFERRAL_GEMS)){ referralUsed=false; return false; }
  saveMeta();
  referralMsg='WELCOME GIFT! +5 GEMS \u00b7 YOUR FRIEND GETS 5 TOO'; referralMsgT=now+5000;
  return true;
}
async function processReferral(){
  if(!sb||!authUser) return;
  await payReferralClaims();
  if(!gemRewardsEnabled()) return;
  const ref=pendingReferralId();
  if(!ref) return;
  if(ref===String(authUser.id||'').toLowerCase()){
    clearPendingReferral(ref);
    referralMsg='YOUR OWN SHARE LINK NEEDS A DIFFERENT PLAYER'; referralMsgT=now+4000;
    return;
  }
  // Never create the claim before the account balance has been loaded. If the
  // profile request failed, the saved pending id makes the referral retry-safe.
  if(!profileLoaded) return;
  try{
    const {data:prior,error:priorError}=await sb.from('scores').select('game').eq('user_id',authUser.id)
      .like('game','outpost-zero-referral:%').limit(1);
    if(priorError) throw priorError;
    if(!prior||!prior.length){
      const {error}=await sb.from('scores').upsert(
        {user_id:authUser.id,name:displayName(authUser),game:'outpost-zero-referral:'+ref,score:REFERRAL_GEMS},
        {onConflict:'user_id,game'});
      if(error) throw error;
    }
    // If the claim row reached Supabase but a previous tab closed before its
    // profile save, the account flag is still false and this safely finishes
    // the receiver's one-time gift instead of losing it.
    if(!awardReferralReceiver()) return;
    clearPendingReferral(ref);
  }catch(e){ console.warn('referral claim failed',e); }
}
// WHEEL SPIN: one every 20 minutes spent anywhere on the site, claimed by hand
const WHEEL=[{t:'6 \uD83D\uDC8E', gems:3*WHEEL_GEM_SCALE, coins:0},
             {t:'30 \uD83E\uDE99', gems:0, coins:30},
             {t:'10 \uD83D\uDC8E', gems:5*WHEEL_GEM_SCALE, coins:0},
             {t:'60 \uD83E\uDE99', gems:0, coins:60}];
const WHEEL_MS=20*60*1000;
let wheelReady=0, wheelAcc=0, wheelOpen=false, wheelBtnRect=null, wheelRects=[];
function countdownText(ms){
  const sec=Math.max(0,Math.ceil(ms/1000)), m=Math.floor(sec/60), s=sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function wheelCountdown(){ return wheelReady>0 ? 'READY' : countdownText(WHEEL_MS-wheelAcc); }
function dailyCountdown(){
  const next=(Number(todayIndex())+1)*86400000+43200000;
  return countdownText(next-Date.now());
}
// ---- PROMO CODES ----
let promoOpen=false, promoBtnRect=null, promoList=[], promoAdminOpen=false, promoRects=[];
let formOpen=false, formSave=null, formCancel=null, formFields=[];
function openForm(opts){
  formOpen=true; formFields=opts.fields||[]; formSave=opts.onSave||null; formCancel=opts.onCancel||null;
  $('formtitle').textContent=opts.title||'EDIT';
  $('formhint').textContent=opts.hint||'';
  $('formstatus').textContent='';
  const grid=$('formgrid'); grid.innerHTML='';
  for(const f of formFields){
    const lab=document.createElement('label');
    const span=document.createElement('span');
    span.textContent=f.label + (f.min!==undefined? ('  ('+f.min+'-'+f.max+')') : '');
    const inp=document.createElement('input');
    inp.id='ff_'+f.id;
    inp.type=(f.type==='text')?'text':'number';
    inp.value=(f.value===null||f.value===undefined)?'':String(f.value);
    if(f.placeholder) inp.placeholder=f.placeholder;
    if(f.upper){                                     // codes are always stored upper case
      inp.style.textTransform='uppercase';
      inp.oninput=()=>{ const p=inp.selectionStart; inp.value=String(inp.value||'').toUpperCase();
                        try{ inp.setSelectionRange(p,p); }catch(e){} };
    }
    if(f.type!=='text'){ if(f.min!==undefined) inp.min=f.min; if(f.max!==undefined) inp.max=f.max; }
    lab.appendChild(span); lab.appendChild(inp);
    if(f.was!==undefined && f.was!==null){
      const w=document.createElement('span'); w.className='was'; w.textContent='currently '+f.was;
      lab.appendChild(w);
    }
    grid.appendChild(lab);
  }
  const extra=$('formextra'); extra.innerHTML='';
  if(opts.extraButton){
    const b=document.createElement('button');
    b.className='btn'; b.textContent=opts.extraButton.label;
    b.onclick=()=>{ opts.extraButton.onClick(); };
    extra.appendChild(b);
  }
  $('formsave').textContent=opts.saveLabel||'SAVE';
  $('formwrap').style.display='flex';
  try{ const first=$('ff_'+(formFields[0]||{}).id); if(first) first.focus(); }catch(e){}
}
function closeForm(){ formOpen=false; $('formwrap').style.display='none'; formSave=null; formCancel=null; }
function cancelForm(){ const fn=formCancel; closeForm(); if(fn) fn(); }
function formValues(){
  const out={};
  for(const f of formFields){
    const el=$('ff_'+f.id); if(!el) continue;
    const raw=String(el.value||'').trim();
    if(f.type==='text'){ out[f.id]= f.upper ? raw.toUpperCase() : raw; continue; }
    if(raw===''){ out[f.id]=null; continue; }
    let v=Math.round(+raw||0);
    if(f.min!==undefined) v=Math.max(f.min,v);
    if(f.max!==undefined) v=Math.min(f.max,v);
    out[f.id]=v;
  }
  return out;
}
function formError(msg){ $('formstatus').textContent=msg; }
function openPromo(){
  promoOpen=true; $('promowrap').style.display='flex';
  $('promostatus').textContent=''; $('promoinput').value='';
  try{ $('promoinput').focus(); }catch(e){}
}
function closePromo(){ promoOpen=false; $('promowrap').style.display='none'; }
async function redeemPromo(){
  const code=String($('promoinput').value||'').trim().toUpperCase();
  if(!code){ $('promostatus').textContent='enter a code'; return; }
  if(!sb){ $('promostatus').textContent='preview build \u2014 works on the live site'; return; }
  if(!authUser){ $('promostatus').textContent='sign in to redeem a code'; return; }
  $('promostatus').textContent='checking...';
  try{
    const { data, error } = await sb.rpc('redeem_promo', {p_code:code});
    if(error) throw error;
    const d = Array.isArray(data) ? data[0] : data;
    if(!d || !d.ok){
      $('promostatus').textContent = (d && d.reason) ? d.reason : 'that code is not valid';
      sfx('dry'); return;
    }
    if(d.gems)  gems  += d.gems;
    if(d.coins) coins += d.coins;
    saveMeta();
    $('promostatus').textContent='redeemed! +'+(d.gems?d.gems+' \uD83D\uDC8E ':'')+(d.coins?d.coins+' \uD83E\uDE99':'');
    sfx('pickup');
    setTimeout(closePromo, 1500);
  }catch(err){ $('promostatus').textContent='could not redeem \u2014 try again'; sfx('dry'); }
}
// ---- admin side ----
async function fetchPromos(){
  if(!sb || !isMainAdmin()) return;
  try{
    const { data } = await sb.from('promo_codes')
      .select('code,gems,coins,uses_max,uses_count,expires_at,active,created_by')
      .order('code',{ascending:true}).limit(40);
    promoList=data||[];
  }catch(e){ promoList=[]; }
}
function promoAsk(label, def){
  let v; try{ v=window.prompt(label, def===undefined?'':String(def)); }catch(e){ v=null; }
  return v;
}
const PROMO_FIELDS=(pc)=>[
  {id:'code',  label:'CODE',       type:'text', upper:true, value:pc?pc.code:'', placeholder:'LAUNCH25'},
  {id:'gems',  label:'GEMS',       min:0, max:99999,  value:pc?pc.gems:0},
  {id:'coins', label:'COINS',      min:0, max:999999, value:pc?pc.coins:0},
  {id:'uses',  label:'MAX USES (0 = unlimited)', min:0, max:999999, value:pc?pc.uses_max:1},
  {id:'days',  label:'DAYS VALID (0 = never expires)', min:0, max:3650,
   value:pc? (pc.expires_at? Math.max(0,Math.ceil((Date.parse(pc.expires_at)-Date.now())/86400000)) : 0) : 0},
];
function createPromo(){
  if(!isMainAdmin()) return;
  openForm({
    title:'\uD83C\uDF81 NEW PROMO CODE',
    hint:'letters, numbers, - and _ \u00b7 3 to 24 characters \u00b7 codes default to a single use',
    fields:PROMO_FIELDS(null),
    saveLabel:'CREATE',
    onSave:(v)=>savePromoForm(v, null)
  });
}
function editPromo(pc){
  if(!isMainAdmin()) return;
  openForm({
    title:'\u270E '+pc.code,
    hint:'change anything here \u00b7 the code itself stays the same',
    fields:PROMO_FIELDS(pc).map(f=> f.id==='code' ? Object.assign({},f,{readonly:true}) : f),
    saveLabel:'SAVE',
    onSave:(v)=>savePromoForm(v, pc)
  });
}
async function savePromoForm(v, pc){
  const code=String(v.code||'').trim().toUpperCase();
  if(!/^[A-Z0-9_-]{3,24}$/.test(code)){ formError('code must be 3-24 letters, numbers, - or _'); return; }
  const g=v.gems||0, c=v.coins||0;
  if(!g && !c){ formError('give at least some gems or coins'); return; }
  const u=(v.uses===null||v.uses===undefined)?1:v.uses;
  const d=v.days||0;
  const exp = d>0 ? new Date(Date.now()+d*86400000).toISOString() : null;
  if(!sb){ formError('preview build \u2014 works on the live site'); return; }
  formError('saving...');
  try{
    if(pc){
      const { error } = await sb.from('promo_codes')
        .update({gems:g, coins:c, uses_max:u, expires_at:exp}).eq('code', pc.code);
      if(error) throw error;
    } else {
      const { error } = await sb.from('promo_codes').insert(
        {code, gems:g, coins:c, uses_max:u, uses_count:0, expires_at:exp, active:true, created_by:adminEmail()});
      if(error) throw error;                        // surfaced, not swallowed
    }
    closeForm(); fetchPromos(); sfx('pickup');
  }catch(err){
    const m=String((err&&err.message)||err||'');
    formError(/duplicate|unique/i.test(m) ? 'that code already exists'
            : /permission|policy|row-level/i.test(m) ? 'not allowed \u2014 check your admin rank'
            : /relation|does not exist|could not find the table|schema cache|PGRST205/i.test(m)
                ? 'the promo_codes table has not been created yet \u2014 run the promo SQL in Supabase'
            : ('could not save \u2014 '+m.slice(0,60)));
  }
}
async function expirePromo(pc){
  if(!isMainAdmin() || !sb) return;
  try{ await sb.from('promo_codes').update({active:false, expires_at:new Date().toISOString()}).eq('code',pc.code); }catch(e){}
  fetchPromos();
}
async function revivePromo(pc){
  if(!isMainAdmin() || !sb) return;
  try{ await sb.from('promo_codes').update({active:true, expires_at:null}).eq('code',pc.code); }catch(e){}
  fetchPromos();
}
async function removePromo(pc){
  if(!isMainAdmin() || !sb) return;
  try{ await sb.from('promo_codes').delete().eq('code',pc.code); }catch(e){}
  fetchPromos();
}
function promoExpired(pc){
  return !pc.active || (pc.expires_at && Date.parse(pc.expires_at)<Date.now())
      || (pc.uses_max>0 && pc.uses_count>=pc.uses_max);
}
let wheelSpinning=false, wheelStart=0, wheelDur=0, wheelTarget=0, wheelAngle=0, wheelResult=-1;
function wheelTick(dtms){
  if(sb && !authUser) return;                      // rewards are sign-in only, like everything else
  if(wheelReady>0){ wheelReady=1; wheelAcc=0; return; } // only one spin may be held at a time
  wheelAcc+=Math.max(0,dtms);                      // menus, armory, play, and open modals all count
  if(wheelAcc>=WHEEL_MS){ wheelAcc=0; wheelReady=1; }
}
function openWheel(){
  if(wheelReady<1||testMode){ sfx('dry'); return; }
  wheelOpen=true; wheelSpinning=false; wheelResult=-1; wheelAngle=0;
}
function closeWheel(){ if(wheelSpinning) return; wheelOpen=false; }
function spinWheel(){
  if(wheelSpinning || wheelResult>=0 || wheelReady<1 || testMode) return;
  wheelReady--;
  wheelTarget=Math.floor(Math.random()*WHEEL.length);
  wheelSpinning=true; wheelStart=now; wheelDur=2600;
  sfx('swap');
}
function wheelSettle(){
  const r=WHEEL[wheelTarget];
  if(r.coins) addCoins(r.coins);
  if(r.gems) addGems(r.gems);
  wheelResult=wheelTarget; wheelSpinning=false;
  saveMeta(); sfx('pickup');
}
function wheelUpdate(){
  if(!wheelSpinning) return;
  const t=clamp((now-wheelStart)/wheelDur,0,1);
  const ease=1-Math.pow(1-t,3);                    // slows into its stop
  const seg=TAU/WHEEL.length;
  const finalA=-(wheelTarget*seg)-seg/2;           // land the pointer on the winning slice
  wheelAngle=ease*(TAU*5+finalA);
  if(t>=1) wheelSettle();
}
function todayIndex(){ return String(Math.floor((Date.now()-43200000)/86400000)); }
function streakClaimable(){
  const accountReady=!sb||!!(authUser&&profileLoaded&&profileOwnerUserId===String(authUser.id||''));
  return accountReady&&streakLastDay!==todayIndex();
}
// what the NEXT collect would put the streak at
function streakNext(){
  const t=+todayIndex();
  return (streakLastDay!=='' && +streakLastDay===t-1) ? streakDays+1 : 1;
}
function streakReward(day){                          // coins keep climbing; gems repeat on a clear seven-day cycle
  day=Math.max(1,Math.floor(+day||1));
  const coinsR=Math.min(300,25+(day-1)*25);
  const gemsR=STREAK_GEM_REWARDS[(day-1)%STREAK_GEM_REWARDS.length];
  return {coins:coinsR, gems:gemsR};
}
function collectStreak(){
  if(streakClaimBusy||!streakClaimable()){sfx('dry');return false;}
  if(testMode){streakMsg='TEST MODE DOES NOT CONSUME DAILY REWARDS';streakMsgT=now+1800;sfx('dry');return false;}
  if(sb&&!authUser){streakMsg='sign in to start a streak';streakMsgT=now+1800;sfx('dry');return false;}
  const claimOwner=authUser?String(authUser.id||''):'',claimEpoch=streakClaimAccountEpoch,claimDay=todayIndex();
  streakClaimBusy=true;
  try{
    // The day marker, both balances, and streak count enter one local/profile
    // snapshot. Re-entry and a stale account callback cannot award it twice.
    if((authUser?String(authUser.id||''):'')!==claimOwner||claimEpoch!==streakClaimAccountEpoch||streakLastDay===claimDay)return false;
    const day=streakNext(),r=streakReward(day),broke=day===1&&streakDays>0;
    streakDays=day;streakLastDay=claimDay;streakLongest=Math.max(streakLongest,streakDays);
    coins+=r.coins;gems+=r.gems;
    saveMeta();                                      // marker + both balances share one account snapshot
    if(sb&&authUser)void saveProfile(true);           // narrow claim -> close loss; queued save remains the retry
    streakMsg=(broke?'streak reset \u2014 ':'')+'+'+r.gems+' \uD83D\uDC8E  +'+r.coins+' \uD83E\uDE99';
    streakMsgT=now+2400;sfx('pickup');return true;
  }finally{streakClaimBusy=false;}
}
function resetDailyStreakUiForAccountChange(){
  streakClaimAccountEpoch++;streakClaimBusy=false;streakMsg='';streakMsgT=0;streakBtnRect=null;
  if(typeof dailyGateOpen!=='undefined')dailyGateOpen=false;
  if(typeof dailyGateReward!=='undefined')dailyGateReward=null;
  if(typeof dailyGateRects!=='undefined')dailyGateRects=[];
}
let coins=0, cosmeticOwned={}, cosmeticEquipped={};   // per-weapon color unlocks
// color cosmetics anyone can unlock with coins, per weapon
const COSMIC_COLORS=[
  {id:'crimson', name:'Crimson',  col:'#ff4a4a'},
  {id:'azure',   name:'Azure',    col:'#4fa8ff'},
  {id:'violet',  name:'Violet',   col:'#b45af0'},
  {id:'emerald', name:'Emerald',  col:'#3fd07a'},
  {id:'gold',    name:'Gold',     col:'#ffcf3b'},
  {id:'cyan',    name:'Cyan',     col:'#3fe0d0'},
];
const COSMETIC_COST=100;   // coins per cosmetic
// equip animations: how the weapon flourishes as it lands in your hand (coins, shop-bought)
// How long you must wait after drawing a weapon before it can fire. Most gear
// uses the shared duration; genuine handling gimmicks can shorten their own draw.
const EQUIP_WAIT=380;
function weaponEquipMs(k){
  const w=WEAPONS[k],ms=w&&Number.isFinite(+w.quickdrawMs)?+w.quickdrawMs:EQUIP_WAIT;
  return Math.max(80,Math.min(EQUIP_WAIT,ms));
}
const EQUIP_ANIMS=[
  {id:'none',  name:'Standard',   cost:0,   dur:EQUIP_WAIT, d:'a clean draw'},
  {id:'spin',  name:'Spin',       cost:120, dur:EQUIP_WAIT, d:'full 360 twirl'},
  {id:'flip',  name:'Flip',       cost:150, dur:EQUIP_WAIT, d:'end-over-end toss'},
  {id:'twirl', name:'Double Spin',cost:200, dur:EQUIP_WAIT, d:'two fast rotations'},
  {id:'toss',  name:'Juggle',     cost:220, dur:EQUIP_WAIT, d:'hop, spin, catch'},
];
let animOwned={}, animEquipped={};                  // per weapon: owned keys 'smg|spin', equipped {smg:'spin'}
let shopAnimWeapon=null, animPrevRect=null, animNextRect=null;
function animDef(id){ return EQUIP_ANIMS.find(a=>a.id===id) || EQUIP_ANIMS[0]; }
function animKey(wk,id){ return wk+'|'+id; }
function animOf(wk){ const id=animEquipped[wk]; return (id && (id==='none' || animOwned[animKey(wk,id)])) ? id : 'none'; }
function buyAnim(a, wk){
  wk=wk||shopAnimWeapon;
  if(!wk) return;
  if(a.id==='none' || animOwned[animKey(wk,a.id)]){ animEquipped[wk]=a.id; saveMeta(); sfx('swap'); return; }
  if(coins<a.cost){ sfx('dry'); return; }
  coins-=a.cost; animOwned[animKey(wk,a.id)]=true; animEquipped[wk]=a.id; saveMeta(); sfx('pickup');
}
// returns {rot, lift, scale} for the weapon in hand while the equip flourish plays
// where the melee is through its swing right now, 0..1, or null when not swinging.
// runs for exactly player.swingDur so the visual never outlasts the attack itself.
function meleeSwingPhase(){
  if(!player.swingT) return null;
  const dur=player.swingDur||130;
  const t=(now-player.swingT)/dur;
  return (t>=0 && t<1) ? t : null;
}
function equipFlourish(){
  const a=animDef(animOf(player.cur));                // each weapon has its own flourish
  if(a.id==='none' || !player.animT) return null;
  // Match the visual to the real firing lock. A quick-draw weapon must not keep
  // spinning for 380ms after it is already allowed to shoot.
  const t=(now-player.animT)/Math.min(a.dur,weaponEquipMs(player.cur));
  if(t<0 || t>=1) return null;
  const ease=1-Math.pow(1-t,2);                      // fast out, soft landing
  if(a.id==='spin')  return {rot:ease*TAU, lift:0, scale:1};
  if(a.id==='twirl') return {rot:ease*TAU*2, lift:0, scale:1};
  if(a.id==='flip')  return {rot:ease*TAU, lift:-Math.sin(t*Math.PI)*10, scale:1};
  if(a.id==='toss')  return {rot:ease*TAU, lift:-Math.sin(t*Math.PI)*16, scale:1+0.18*Math.sin(t*Math.PI)};
  return null;
}
// coin-bought consumables (NON-permanent effects). owned = a stock you carry into runs.
const POWERUPS=[
  {id:'respawn',  name:'RESPAWN',       cost:100, max:1,  emoji:'\uD83D\uDD01', d:'revive on death, full HP'},
  {id:'quickmed', name:'QUICK MED',     cost:20,  max:3,  emoji:'\u2764\uFE0F', d:'heal +33% max HP'},
  {id:'invinc',   name:'INVINCIBILITY', cost:60,  max:5,  emoji:'\u2728', d:'15s of no damage'},
  {id:'waveskip', name:'WAVE SKIPPER',  cost:120, max:1,  emoji:'\u23ED\uFE0F', d:'skip 3 waves, keep the upgrades'},
  {id:'airdrop',  name:'AIRDROP',       cost:15,  max:10, emoji:'\uD83D\uDCE6', d:'drop a crate (ammo / gems)'},
];
let powerStock={};                 // persistent: how many of each you own
let powerUsed={};                  // per-run: how many used this game (capped by max)
let invincUntil=0, waveSkipPending=0, coinTimeAcc=0, killCoinAcc=0, waveCoinBank=0, coinTrickles=[], coinTricklePopT=0,
    chestRewardOpen=null, chestRewardBtn=null, powerMenuOpen=false, respawnPromptT=0, powerMenuRects=[], respawnRects=[];
const COIN_TRICKLE_MS=3000;
function startCoinTrickle(amount,label){
  amount=Math.max(0,Math.round(amount)); if(!amount) return;
  const wall=performance.now(), last=coinTrickles[coinTrickles.length-1];
  const start=last?Math.max(wall,last.start+last.dur):wall;
  const q={total:amount,credited:0,start,dur:COIN_TRICKLE_MS,label:label||'REWARD'};
  coinTrickles.push(q); return q;
}
function tickCoinTrickles(wall){
  if(!coinTrickles.length) return;
  const q=coinTrickles[0]; if(wall<q.start) return;
  const target=Math.min(q.total,Math.floor(q.total*Math.min(1,(wall-q.start)/q.dur)));
  const delta=target-q.credited;
  if(delta>0){ q.credited=target; addCoins(delta); coinTricklePopT=wall+650; }
  if(wall>=q.start+q.dur){
    if(q.credited<q.total) addCoins(q.total-q.credited);
    coinTrickles.shift(); coinTricklePopT=wall+650;
  }
}
function coinTrickleRemaining(){ return coinTrickles.reduce((n,q)=>n+q.total-q.credited,0); }
function recordWaveCoinReward(){
  waveCoinBank+=5;
  if(wave>0 && wave%5===0){
    startCoinTrickle(waveCoinBank,'5-WAVE PAYOUT');
    waveCoinBank=0;
  }
}
let upgradePowerRect=null, upgradeAdRect=null, upgradeDonateRect=null;
// external promo links (open in a new tab) — swap these for the real URLs
// accounts with admin powers (lowercase emails). preview builds (!sb) always have admin for testing.
