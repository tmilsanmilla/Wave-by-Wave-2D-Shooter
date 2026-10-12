"use strict";

function installPixelPulseTransport(client){
  const auth=client.auth,nativeSession=auth.getSession.bind(auth),nativeToken=auth.getJWTToken.bind(auth),
    subscribe=auth.onAuthStateChange.bind(auth);
  let cachedSession=null,checkedAt=0,pendingSession=null,token=null,pendingToken=null,epoch=0,retiredNative=false;
  const fail=message=>Object.assign(new Error(message),{code:'PIXEL_SESSION_FAILED',outpostAuthPhase:'database'});
  async function request(action,method='GET',body){
    if(typeof location!=='undefined'&&location.protocol==='file:')return null;
    const response=await fetch('/api/pixel-pulse/'+action,{method,credentials:'same-origin',cache:'no-store',
      ...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}:{})});
    // Local HTML/GitHub Pages has no server route; keep existing Neon login.
    if(response.status===404)return null;
    const result=await response.json();
    if(!response.ok)throw fail(result.error||'Pixel Pulse could not confirm your game session. Try again.');
    return result;
  }
  async function current(force=false){
    if(!force&&checkedAt&&Date.now()-checkedAt<5000)return cachedSession;
    if(pendingSession)return pendingSession;
    const generation=epoch;
    const task=request('session').then(result=>{
      if(generation!==epoch)throw fail('The account changed. Try again.');
      const previous=cachedSession;
      cachedSession=result&&result.session||null;checkedAt=Date.now();
      if(previous&&!cachedSession){
        epoch++;token=null;
        void client.syncAuthState('SIGNED_OUT',null);
        throw fail('Your Pixel Pulse game session expired. Sign in again.');
      }
      return cachedSession;
    }).finally(()=>{if(pendingSession===task)pendingSession=null;});
    pendingSession=task;return task;
  }
  auth.getSession=async options=>{
    const live=await current(!!options&&options.forceFetch===true);
    // Retire a previous local login only AFTER the central session is proved.
    // An expired Pixel session must not silently reopen another account.
    if(live&&!retiredNative){
      const api=typeof auth.getBetterAuthInstance==='function'?auth.getBetterAuthInstance():null;
      if(api&&typeof api.signOut==='function'){
        const result=await api.signOut();
        if(result&&result.error)throw fail('Could not finish switching accounts. Try again.');
      }
      retiredNative=true;
    }
    return live?{data:{session:live},error:null}:nativeSession(options);
  };
  auth.getJWTToken=async allowAnonymous=>{
    const generation=epoch,live=await current();
    if(generation!==epoch)throw fail('The account changed. Try again.');
    if(!live)return nativeToken(allowAnonymous);
    if(token&&token.subject===live.user.id&&token.until>Date.now())return token.value;
    if(pendingToken)return pendingToken;
    const task=(async()=>{
      const result=await request('token','POST'),value=String(result&&result.token||'');
      let claims;
      try{claims=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(error){throw fail('Pixel Pulse did not issue a database token.');}
      if(value.split('.').length!==3||claims.sub!==live.user.id||claims.iss!=='https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse'||
         claims.aud!=='https://ep-fragrant-salad-a577vui2.neonauth.us-east-2.aws.neon.tech'||claims.role!=='authenticated'||!Number.isFinite(+claims.exp)||+claims.exp*1000<=Date.now())
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
    return callback(pixel?'SIGNED_IN':event,pixel||live);
  });
  client.pixelPulse={current,request,async signOut(){
    await request('signout','POST');epoch++;cachedSession=null;checkedAt=Date.now();token=null;pendingSession=null;pendingToken=null;
  }};
  return client;
}

async function pixelPulseStart(){
  if(!sb||!sb.pixelPulse)return false;
  const button=$('apixel'),connect=$('settingspixel'),message=authUser?$('settingspixelstatus'):$('authmsg');
  if(button)button.disabled=true;if(connect)connect.disabled=true;
  if(message)message.textContent='Connecting to Pixel Pulse…';
  try{
    const linking=!!(authUser&&!authUser.pixel_pulse),linkToken=linking?await sb.auth.getJWTToken(false):'';
    if(linking&&!linkToken)throw new Error('Sign in to your existing game account first.');
    const result=await sb.pixelPulse.request('start','POST',{link_token:linkToken||''});
    const url=new URL(result&&result.url||'');
    if(url.origin!=='https://pixel-pulse-websites.vercel.app'||url.pathname!=='/api/sso/oauth2/authorize')throw new Error('Pixel Pulse connection is not ready.');
    location.assign(url.href);return true;
  }catch(error){
    if(message)message.textContent=error.message||'Could not start shared sign-in.';
    if(button)button.disabled=false;if(connect)connect.disabled=false;return false;
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
  const button=$('apixel'),connect=$('settingspixel'),manage=$('settingspixelmanage');
  if(button)button.onclick=pixelPulseStart;if(connect)connect.onclick=pixelPulseStart;
  if(manage)manage.onclick=()=>window.open('https://pixel-pulse-websites.vercel.app/','_blank','noopener,noreferrer');
  if(sb&&sb.pixelPulse)try{
    const status=await sb.pixelPulse.request('status');
    if(button)button.hidden=!(status&&status.enabled);if(connect)connect.hidden=!(status&&status.enabled);
  }catch(error){} // Ordinary Neon login remains available while provider deploys.
  const url=new URL(location.href),error=url.searchParams.get('pixel_error');
  if(error){$('authwrap').style.display='flex';$('authmsg').textContent=error.slice(0,700);}
  if(error||url.searchParams.has('pixel_connected')){
    url.searchParams.delete('pixel_error');url.searchParams.delete('pixel_connected');history.replaceState({},'',url.href);
  }
}
