"use strict";

// Session cookies identify the login; only /token returns a Data API JWT.
// Keep the upstream bundle intact and replace its cached-session token lookup.
function installNeonSignedTokenTransport(client){
  const auth=client&&client.auth;
  if(!auth||typeof auth.getBetterAuthInstance!=='function')throw new Error('Neon authentication client unavailable.');
  const api=auth.getBetterAuthInstance();
  let epoch=0,cached=null,pending=null;
  const listeners=new Set(),subscribe=auth.onAuthStateChange.bind(auth);
  const invalidate=()=>{epoch++;cached=null;pending=null;};
  const failure=(code,message)=>Object.assign(new Error(message),{code,outpostAuthPhase:'database'});
  const claimsOf=token=>{
    const parts=String(token||'').split('.');
    if(parts.length!==3||parts.some(part=>!part))throw failure('NEON_INVALID_DATA_TOKEN','Neon did not return a signed database token.');
    try{
      const decode=part=>JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
      const header=decode(parts[0]),claims=decode(parts[1]);
      if(!header.alg||header.alg==='none'||!Number.isFinite(+claims.exp)||+claims.exp*1000<=Date.now())throw new Error('Invalid JWT');
      return claims;
    }catch(error){throw failure('NEON_INVALID_DATA_TOKEN','Neon did not return a valid database token.');}
  };
  // A change in login retires both tokens and unfinished token requests. The
  // initial notification describes the same login and must not cancel setup.
  subscribe(event=>{
    if(event==='TOKEN_REFRESHED'){cached=null;return;}
    if(event!=='INITIAL_SESSION')invalidate();
  });
  auth.onAuthStateChange=callback=>{
    listeners.add(callback);
    const result=subscribe(callback),subscription=result.data.subscription;
    return {...result,data:{...result.data,subscription:{...subscription,unsubscribe(){
      listeners.delete(callback);subscription.unsubscribe();
    }}}};
  };
  // The compatibility adapter ignores same-client Better Auth events. The
  // game invokes this only after a real managed sign-in/up/out succeeds.
  client.syncAuthState=async(event,session)=>{
    invalidate();
    await Promise.allSettled([...listeners].map(callback=>Promise.resolve().then(()=>callback(event,session))));
  };
  auth.getJWTToken=async(allowAnonymous=false)=>{
    const generation=epoch;
    const session=await api.getSession();
    if(generation!==epoch)throw failure('NEON_AUTH_CHANGED','The login changed while account access was being checked. Try again.');
    if(session&&session.error)throw failure('NEON_SESSION_CHECK_FAILED','Neon could not confirm the current login session.');
    const subject=String(session&&session.data&&session.data.user&&session.data.user.id||'');
    if(!subject&&!allowAnonymous)return null;
    const key=subject?'user:'+subject:'anonymous';
    if(cached&&cached.key===key&&cached.until>Date.now())return cached.token;
    if(pending&&pending.key===key&&pending.epoch===generation)return pending.promise;
    const request={key,epoch:generation,promise:null};
    request.promise=(async()=>{
      // This SDK routes /token through its get-session cache. X-Force-Fetch
      // explicitly skips that cache; the SDK removes the header before send.
      const options={fetchOptions:{headers:{'X-Force-Fetch':'true'}}};
      const result=subject?await api.token(options):await api.getAnonymousToken(options);
      if(result&&result.error)throw failure('NEON_DATA_TOKEN_FAILED','Your login session exists, but Neon could not issue a database access token.');
      const token=String(result&&result.data&&result.data.token||''),claims=claimsOf(token);
      if(generation!==epoch)throw failure('NEON_AUTH_CHANGED','The login changed while account access was being checked. Try again.');
      if(subject&&String(claims.sub||'')!==subject)throw failure('NEON_TOKEN_ACCOUNT_MISMATCH','Neon returned a token for a different login. Sign in again.');
      // This is only a shape/expiry guard and a short in-memory transport cache.
      // Neon still validates the signature, permissions, RLS, and ban checks.
      cached={key,token,until:Math.min(+claims.exp*1000-30000,Date.now()+60000)};
      return token;
    })().finally(()=>{if(pending===request)pending=null;});
    pending=request;return request.promise;
  };
  return client;
}
