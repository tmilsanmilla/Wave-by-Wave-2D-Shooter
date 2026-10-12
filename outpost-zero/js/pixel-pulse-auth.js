"use strict";

function installPixelPulseTransport(client){
  const auth=client.auth,nativeSession=auth.getSession.bind(auth),nativeToken=auth.getJWTToken.bind(auth),
    subscribe=auth.onAuthStateChange.bind(auth);
  let cachedSession=null,checkedAt=0,pendingSession=null,token=null,pendingToken=null,epoch=0,
    retiredNative=false,retirement=null,pixelOwned=false,signingOut=null;
  const fail=message=>Object.assign(new Error(message),{code:'PIXEL_SESSION_FAILED',outpostAuthPhase:'database'});
  const identity=live=>live?String(live.user.id)+'/'+String(live.user.game_user_id):'';
  function notify(event,live){
    if(typeof client.syncAuthState==='function')void Promise.resolve().then(()=>client.syncAuthState(event,live)).catch(()=>{});
  }
  async function request(action,method='GET',body){
    if(typeof location!=='undefined'&&location.protocol==='file:')return null;
    const response=await fetch('/api/pixel-pulse/'+action,{method,credentials:'same-origin',cache:'no-store',
      ...(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(10000)}:{}),
      ...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}:{})})
      .catch(()=>{throw fail('Pixel Pulse could not be reached. Check your connection and try again.');});
    // Local HTML/GitHub Pages has no server route; keep existing Neon login.
    if(response.status===404)return null;
    const result=await response.json().catch(()=>null);
    if(!response.ok)throw Object.assign(fail(result&&result.error||'Pixel Pulse could not confirm your game session. Try again.'),{status:response.status});
    if(!result||typeof result!=='object'||Array.isArray(result))throw fail('Pixel Pulse returned an incomplete response. Try again.');
    return result;
  }
  async function current(force=false){
    if(signingOut)await signingOut;
    if(!force&&checkedAt&&Date.now()-checkedAt<5000)return cachedSession;
    if(pendingSession)return pendingSession;
    const generation=epoch;
    const task=request('session').then(result=>{
      if(generation!==epoch)throw fail('The account changed. Try again.');
      const previous=cachedSession,known=!!checkedAt,next=result&&result.session||null;
      if(next&&(!next.user||!next.user.pixel_pulse||!next.user.id||!next.user.game_user_id))throw fail('Pixel Pulse returned an incomplete account. Try again.');
      const changed=known&&identity(previous)!==identity(next);
      cachedSession=next;checkedAt=Date.now();
      if(next)pixelOwned=true;
      if(changed){epoch++;token=null;pendingToken=null;notify(next?'SIGNED_IN':'SIGNED_OUT',next);}
      if(previous&&!cachedSession){
        throw fail('Your Pixel Pulse game session expired. Sign in again.');
      }
      return cachedSession;
    }).finally(()=>{if(pendingSession===task)pendingSession=null;});
    pendingSession=task;return task;
  }
  async function retireNative(){
    if(retiredNative)return;
    if(retirement)return retirement;
    const generation=epoch,api=typeof auth.getBetterAuthInstance==='function'?auth.getBetterAuthInstance():null;
    const task=(async()=>{
      if(api&&typeof api.signOut==='function'){
        const result=await api.signOut();
        if(result&&result.error)throw fail('Could not finish switching accounts. Try again.');
      }
      if(generation!==epoch)throw fail('The account changed. Try again.');
      retiredNative=true;
    })().finally(()=>{if(retirement===task)retirement=null;});
    retirement=task;return task;
  }
  auth.getSession=async options=>{
    const live=await current(!!options&&options.forceFetch===true);
    // Retire a previous local login only AFTER the central session is proved.
    // An expired Pixel session must not silently reopen another account.
    const generation=epoch;
    if(live)await retireNative();
    if(generation!==epoch)throw fail('The account changed. Try again.');
    if(live||pixelOwned)return {data:{session:live},error:null};
    const native=await nativeSession(options);
    if(generation!==epoch)throw fail('The account changed. Try again.');
    return native;
  };
  auth.getJWTToken=async allowAnonymous=>{
    const live=await current(),generation=epoch;
    if(!live){
      if(pixelOwned)throw fail('Your Pixel Pulse game session expired. Sign in again.');
      const native=await nativeToken(allowAnonymous);
      if(generation!==epoch)throw fail('The account changed. Try again.');
      return native;
    }
    if(token&&token.subject===live.user.id&&token.until>Date.now())return token.value;
    if(pendingToken)return pendingToken;
    const task=(async()=>{
      const result=await request('token','POST'),value=String(result&&result.token||'');
      let claims;
      try{claims=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(error){throw fail('Pixel Pulse did not issue a database token.');}
      if(value.split('.').length!==3||claims.sub!==live.user.id||claims.iss!=='https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse'||
         !Array.isArray(claims.aud)||!claims.aud.includes('https://ep-fragrant-salad-a577vui2.neonauth.us-east-2.aws.neon.tech')||
         !claims.aud.includes('outpost-zero-pixel-pulse')||claims.role!=='authenticated'||!Number.isFinite(+claims.exp)||+claims.exp*1000<=Date.now())
        throw fail('Pixel Pulse did not issue a valid database token.');
      if(generation!==epoch)throw fail('The account changed. Try again.');
      token={value,subject:live.user.id,until:Math.min(+claims.exp*1000-30000,Date.now()+60000)};return value;
    })().finally(()=>{if(pendingToken===task)pendingToken=null;});
    pendingToken=task;return task;
  };
  auth.onAuthStateChange=callback=>subscribe(async(event,live)=>{
    // Managed Neon emits INITIAL_SESSION even when a Pixel session owns this
    // page. Select that cookie-backed account before the game's state changes.
    const pixel=event==='INITIAL_SESSION'?await current():cachedSession;
    return callback(pixel?'SIGNED_IN':pixelOwned?'SIGNED_OUT':event,pixel||(pixelOwned?null:live));
  });
  client.pixelPulse={current,request,async waitForNativeRetirement(){if(retirement)await retirement;},async signOut(){
    if(signingOut)return signingOut;
    epoch++;token=null;pendingToken=null;
    const task=request('signout','POST').then(()=>{
      cachedSession=null;checkedAt=Date.now();pendingSession=null;retiredNative=false;pixelOwned=false;
    }).finally(()=>{if(signingOut===task)signingOut=null;});
    signingOut=task;return task;
  }};
  return client;
}

let pixelPulseEnabled=false,pixelPulseLinkPending=false,pixelPulseStarting=false,pixelPulseLaunchEpoch=0;
function pixelPulseLinkUi(){
  const note=$('apixelintent'),create=$('aup'),gate=$('usernameclaimpixel'),hint=$('usernameclaimpixelhint');
  if(note){note.hidden=!pixelPulseLinkPending;note.textContent='LINK EXISTING ACCOUNT · HIGHLY RECOMMENDED. Sign in below once, using the same email as Pixel Pulse. Your progress is kept.';}
  if(create)create.hidden=pixelPulseLinkPending;
  const suggest=!!(pixelPulseEnabled&&authUser&&!pixelPulseIsLinked());
  if(gate)gate.hidden=!suggest;if(hint)hint.hidden=!suggest;
}
function pixelPulseCancelLink(){
  pixelPulseLaunchEpoch++;pixelPulseStarting=false;pixelPulseLinkPending=false;pixelPulseLinkUi();
  for(const id of ['apixel','apixellink','settingspixel'])if($(id))$(id).disabled=false;
}
async function pixelPulseBeginLink(){
  if(authUser)return pixelPulseStart('link');
  pixelPulseLinkPending=true;pixelPulseLinkUi();
  $('authwrap').style.display='flex';$('authmsg').textContent='Sign in to the game account you want to keep. Use the same email as Pixel Pulse.';
  try{$('aidentifier').focus();}catch(error){}
  return false;
}
function pixelPulseAuthChanged(){
  pixelPulseLinkUi();
  if(pixelPulseEnabled&&pixelPulseLinkPending&&authUser&&!recovering){
    pixelPulseLinkPending=false;pixelPulseLinkUi();
    // Run after the native event finishes; do not block its token/session work.
    void Promise.resolve().then(()=>pixelPulseStart('link'));
  }
}
async function pixelPulseStart(intent='continue'){
  if(!sb||!sb.pixelPulse)return false;
  if(!['continue','link','create'].includes(intent))intent='continue';
  if((intent==='link'||pixelPulseLinkPending)&&!authUser)return pixelPulseBeginLink();
  if(pixelPulseStarting)return false;pixelPulseStarting=true;
  const generation=++pixelPulseLaunchEpoch;
  const button=$('apixel'),connect=$('settingspixel'),link=$('apixellink'),
    message=typeof usernameClaimOpen!=='undefined'&&usernameClaimOpen?$('usernameclaimstatus'):
      typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen?$('settingspixelstatus'):$('authmsg'),
    owner=authUser&&String(authUser.id||'');
  if(button)button.disabled=true;if(connect)connect.disabled=true;
  if(link)link.disabled=true;
  if(message)message.textContent='Connecting to Pixel Pulse…';
  try{
    const linking=!!(authUser&&!authUser.pixel_pulse),linkToken=linking?await sb.auth.getJWTToken(false):'';
    if(generation!==pixelPulseLaunchEpoch)return false;
    if(linking&&!linkToken)throw new Error('Sign in to your existing game account first.');
    if((authUser&&String(authUser.id||''))!==owner)throw new Error('The game account changed. Start again.');
    const result=await sb.pixelPulse.request('start','POST',{link_token:linkToken||'',intent:linking?'link':intent});
    if(generation!==pixelPulseLaunchEpoch)return false;
    if((authUser&&String(authUser.id||''))!==owner)throw new Error('The game account changed. Start again.');
    const url=new URL(result&&result.url||'');
    if(url.origin!=='https://pixel-pulse-websites.vercel.app'||url.pathname!=='/api/sso/oauth2/authorize')throw new Error('Pixel Pulse connection is not ready.');
    location.assign(url.href);return true;
  }catch(error){
    if(generation!==pixelPulseLaunchEpoch)return false;
    if(message)message.textContent=error.message||'Could not start shared sign-in.';
    if(message===$('authmsg'))$('authwrap').style.display='flex';
    if(button)button.disabled=false;if(connect)connect.disabled=false;if(link)link.disabled=false;
    pixelPulseStarting=false;return false;
  }
}
function pixelPulseIsLinked(){return !!(authUser&&(authUser.pixel_pulse||authUser.pixel_pulse_linked));}
async function pixelPulseSyncNativeIdentity(user){
  const result=await sb.rpc('get_my_outpost_zero_pixel_identity'),row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data;
  if(!result.error&&row&&/^[a-z0-9_]{3,24}$/.test(row.username||''))return Object.assign({},user,{pixel_pulse_linked:true,
    user_metadata:Object.assign({},user.user_metadata,{username:row.username,preferred_username:row.username})});
  return user;
}
async function setupPixelPulseUi(){
  const button=$('apixel'),link=$('apixellink'),gate=$('usernameclaimpixel'),connect=$('settingspixel'),manage=$('settingspixelmanage');
  if(button)button.onclick=()=>pixelPulseStart('continue');if(connect)connect.onclick=()=>pixelPulseStart('link');
  if(link)link.onclick=pixelPulseBeginLink;if(gate)gate.onclick=pixelPulseBeginLink;
  if(manage)manage.onclick=()=>window.open('https://pixel-pulse-websites.vercel.app/?account=1','_blank','noopener,noreferrer');
  if(sb&&sb.pixelPulse)try{
    const status=await sb.pixelPulse.request('status');
    pixelPulseEnabled=!!(status&&status.enabled);
    if(button)button.hidden=!pixelPulseEnabled;if(link)link.hidden=!pixelPulseEnabled;if(connect)connect.hidden=!pixelPulseEnabled;
  }catch(error){} // Ordinary Neon login remains available while provider deploys.
  const url=new URL(location.href),error=url.searchParams.get('pixel_error'),intent=url.searchParams.get('pixel');
  if(error){$('authwrap').style.display='flex';$('authmsg').textContent=error.slice(0,700);}
  if(error||url.searchParams.has('pixel_connected')||intent){
    url.searchParams.delete('pixel_error');url.searchParams.delete('pixel_connected');url.searchParams.delete('pixel');history.replaceState({},'',url.href);
  }
  pixelPulseAuthChanged();
  if(pixelPulseEnabled&&intent==='link')await pixelPulseBeginLink();
  else if(pixelPulseEnabled&&intent==='create'){pixelPulseCancelLink();await pixelPulseStart('create');}
}
