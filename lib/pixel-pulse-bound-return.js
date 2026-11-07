// LOCAL / DORMANT. Only existing immutable bindings. 005 AND 006 remain pending.
import {randomUUID} from 'node:crypto';
import * as oidc from 'openid-client';
import {GAME_ORIGIN,CALLBACK,COOKIE,ATTEMPT_COOKIE,PIXEL_ISSUER,random,hash,cookie,cookieValue,
  failure} from './pixel-pulse.js';
import {protocolV2,readyV2,callbackState,observedIdentity,validatedProfile,observeCredentialEpoch,
  sealAccess,openAccess,captureNativeProof,recheckNativeProof} from './pixel-pulse-v2.js';
import {requestOutpostStatus,prepareOutpostStatus} from './pixel-pulse-runtime-status.js';
import {reapBoundReturnState} from './pixel-pulse-housekeeping.js';

export const boundRuntimeEnabled=()=>protocolV2()&&process.env.PIXEL_PULSE_BOUND_RUNTIME_ENABLED==='true';
const now=()=>Date.now();
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const changed=()=>failure('PIXEL_RETURN_TARGET','This sign-in target changed or is unavailable. No account was connected.',409);
const retired=()=>failure('PIXEL_RETURN_REQUIRED','Continue with Pixel Pulse from the account menu to verify this game session again.',401);
const pending=()=>failure('LINK_CONFIRMATION_PENDING','New Link/Create is not enabled. Existing game sign-in is unchanged.',503);

export async function readyBoundRuntime(database){
  if(!boundRuntimeEnabled()||process.env.PIXEL_PULSE_RENEWAL_ENABLED==='true')throw pending();
  await readyV2(database);
  const row=(await database.query(`select current_database()='neondb'
    and current_user='neondb_owner'
    and current_setting('neon.project_id',true)='plain-bar-15608612'
    and current_setting('neon.branch_id',true)='br-dawn-butterfly-a573hk7g'
    and exists(select 1 from pg_attribute where attrelid=to_regclass('oz_identity.pixel_link_attempts')
      and attname='claimed_by' and not attisdropped)
    and exists(select 1 from pg_attribute where attrelid=to_regclass('oz_identity.pixel_sessions')
      and attname='login_attempt_state_hash' and atttypid='text'::regtype and not attisdropped)
    and not exists(select 1 from (values('claimed_by','uuid'),('claimed_at','timestamptz'),
      ('completed_at','timestamptz'),('cancelled_at','timestamptz')) v(name,type)
      where not exists(select 1 from pg_attribute where attrelid=to_regclass('oz_identity.pixel_link_attempts')
        and attname=v.name and atttypid=v.type::regtype and not attisdropped))
    and exists(select 1 from pg_constraint c where c.contype='f'
      and c.conrelid=to_regclass('oz_identity.pixel_sessions') and c.confrelid=to_regclass('oz_identity.pixel_link_attempts')
      and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='login_attempt_state_hash' and not attisdropped)]::smallint[]
      and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='state_hash' and not attisdropped)]::smallint[])
    and not exists(select 1 from pg_class where oid in(to_regclass('oz_identity.pixel_link_attempts'),
      to_regclass('oz_identity.pixel_sessions'),to_regclass('oz_identity.pixel_runtime_authorities'),
      to_regclass('oz_identity.pixel_profiles'),to_regclass('oz_identity.pixel_status_requests')) and(not relrowsecurity or not relforcerowsecurity))
    and to_regclass('oz_identity.pixel_status_requests') is not null
    and not exists(select 1 from (values('request_jti','uuid'),('nonce','text'),('subject','text'),
      ('account_id','uuid'),('token_hash','text'),('expected_epoch','int8'),('attempt_state_hash','text'),
      ('mode','text'),('claim','uuid'),('request_expires','timestamptz'),('upstream_until','timestamptz'),
      ('response_jti','uuid'),('proof_expires','timestamptz'),('consumed_at','timestamptz'))v(name,type)
      where not exists(select 1 from pg_attribute where attrelid=to_regclass('oz_identity.pixel_status_requests')
        and attname=v.name and atttypid=v.type::regtype and not attisdropped))
    and not exists(select 1 from (values('request_jti','p'),('nonce','u'),('response_jti','u'))v(name,kind)
      where not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('oz_identity.pixel_status_requests')
        and c.contype::text=v.kind and c.conkey=array[(select attnum from pg_attribute
          where attrelid=c.conrelid and attname=v.name and not attisdropped)]::smallint[]))
    and not exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
      where c.oid=to_regclass('oz_identity.pixel_status_requests') and
      (acl.grantee=0 or acl.grantee in(select oid from pg_roles where rolname in('anonymous','authenticated')))) as ready`)).rows[0];
  if(row?.ready!==true)throw failure('PIXEL_BOUND_SCHEMA','The reviewed bound-return cutover is not installed. Existing game sign-in is unchanged.',503);
}

function contextOf(context){
  if(!context||Array.isArray(context)||Object.keys(context).some(k=>![
    'phase','entry','state','nonce','verifier','targetAccount','targetSubject','previousSession','nativeProof'
  ].includes(k))||context.phase!=='discover'||context.entry!=='bound-return'||
    !/^[A-Za-z0-9_-]{22,256}$/.test(context.state||'')||
    !/^[A-Za-z0-9_-]{22,256}$/.test(context.nonce||'')||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(context.verifier||'')||
    (context.targetAccount!==null&&!uuid(context.targetAccount))||
    (context.targetSubject!==null&&!uuid(context.targetSubject))||
    (context.previousSession!==null&&!/^[0-9a-f]{64}$/.test(context.previousSession)))throw changed();
  if((context.targetSubject||context.previousSession)&&!context.targetAccount)throw changed();
  if(context.nativeProof&&(context.nativeProof.accountId!==context.targetAccount||!context.targetSubject))throw changed();
  return context;
}

export async function boundAccount(db,subject,lock=false){
  return (await db.query(`select p.account_id from oz_identity.pixel_profiles p
    join oz_identity.account_links l on l.provider='pixelpulse' and l.subject=p.subject and l.account_id=p.account_id
    join oz_identity.accounts a on a.id=p.account_id and a.deleted_at is null
    where p.subject=$1 ${lock?'for update of p,l,a':''}`,[subject])).rows[0]?.account_id||null;
}

// Existing-pair projection ONLY, after boundAccount has locked p/l/a. Never
// call a Link/Create binder, insert a missing profile/link, or select by email.
async function projectBoundProfile(db,profile,target){
  const {subject,username,email}=profile;
  const account=(await db.query('select email from oz_identity.accounts where id=$1 and deleted_at is null',[target])).rows[0];
  if(!account||String(account.email||'').trim().toLowerCase()!==email)
    throw failure('EMAIL_MISMATCH','The verified profile does not match this existing game account. No accounts were merged.',409);
  const owner=(await db.query('select user_id from public.social_profiles where handle_key=$1',[username])).rows[0];
  if(owner&&owner.user_id!==target)
    throw failure('USERNAME_COLLISION','Your Pixel Pulse username belongs to another game account. No accounts were merged.',409);
  const updated=await db.query(`update oz_identity.pixel_profiles set username=$3,email=$4,updated_at=clock_timestamp()
    where subject=$1 and account_id=$2 returning subject`,[subject,target,username,email]);
  if(updated.rowCount!==1)throw changed();
  const social=await db.query(`update public.social_profiles set handle=$2,handle_key=$2,display_name=$2
    where user_id=$1 returning user_id`,[target,username]);
  if(social.rowCount!==1)throw failure('PIXEL_PROFILE_UNAVAILABLE','The existing game profile is unavailable. No new profile was created.',409);
  const link=await db.query(`update oz_identity.account_links set last_seen_at=clock_timestamp()
    where provider='pixelpulse' and subject=$1 and account_id=$2 returning account_id`,[subject,target]);
  if(link.rowCount!==1)throw changed();
}

// A cancellation and a mint lock the SAME attempt. A signout arriving after
// commit deletes the paired session; one arriving before mint prevents mint.
export async function cancelOwned(db,browserHash){
  if(!browserHash)return;
  await db.query(`update oz_identity.pixel_link_attempts set cancelled_at=clock_timestamp()
    where browser_hash=$1 and cancelled_at is null`,[browserHash]);
  await db.query(`delete from oz_identity.pixel_sessions s using oz_identity.pixel_link_attempts a
    where s.login_attempt_state_hash=a.state_hash and a.browser_hash=$1 and a.cancelled_at is not null`,[browserHash]);
}
export async function transaction(database,work){
  const db=await database.connect();
  try{
    await db.query('begin');
    await db.query("set local lock_timeout='2s'");
    await db.query("set local statement_timeout='5s'");
    const result=await work(db);await db.query('commit');return result;
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}

// Persist BEFORE HTTP. The request can name only an existing immutable pair
// and its exact owned attempt (mint) or still-live paired session (refresh).
export async function pendingStatus(database,binding,stateHash,claim,status){
  const request=prepareOutpostStatus(binding),mode=claim?'mint':'refresh';
  const stored=await database.query(`insert into oz_identity.pixel_status_requests
    (request_jti,nonce,subject,account_id,token_hash,expected_epoch,attempt_state_hash,mode,claim,request_expires,upstream_until)
    select $1,$2,$3,$4,$5,$6,a.state_hash,$8,$9,$10,$11
    from oz_identity.pixel_link_attempts a
    join oz_identity.pixel_profiles p on p.subject=$3 and p.account_id=$4
    join oz_identity.account_links l on l.provider='pixelpulse' and l.subject=p.subject and l.account_id=p.account_id
    join oz_identity.accounts g on g.id=p.account_id and g.deleted_at is null
    where a.state_hash=$7 and a.cancelled_at is null and $10::timestamptz>clock_timestamp()
      and $10::timestamptz<=least(clock_timestamp()+interval '30 seconds',$11::timestamptz)
      and (($8='mint' and a.claimed_by=$9 and a.completed_at is null and a.expires_at>clock_timestamp())
        or ($8='refresh' and a.completed_at is not null and exists(select 1 from oz_identity.pixel_sessions s
          where s.token_hash=$5 and s.subject=$3 and s.credential_version=$6 and s.login_attempt_state_hash=a.state_hash
            and s.upstream_until=$11 and s.expires_at=$11 and s.expires_at>clock_timestamp()))) returning request_jti`,
  [request.requestJti,request.nonce,binding.subject,binding.accountId,binding.sessionHash,binding.expectedEpoch,
    stateHash,mode,claim,new Date(request.requestExpires*1000),new Date(binding.upstream)]);
  if(stored.rowCount!==1)throw retired();
  const proof=await status(request);
  if(proof.requestJti!==request.requestJti||proof.nonce!==request.nonce||!uuid(proof.responseJti)||
    proof.subject!==request.subject||proof.accountId!==request.accountId||proof.sessionHash!==request.sessionHash||
    proof.expectedEpoch!==request.expectedEpoch||!Number.isSafeInteger(proof.expires)||
    proof.expires>request.requestExpires)throw retired();
  return proof;
}

export async function consumeStatus(db,proof,{stateHash,upstream,claim=null}){
  const consumed=await db.query(`update oz_identity.pixel_status_requests set
    response_jti=$10,proof_expires=$11,consumed_at=clock_timestamp()
    where request_jti=$1 and nonce=$2 and subject=$3 and account_id=$4 and token_hash=$5
      and expected_epoch=$6 and attempt_state_hash=$7 and upstream_until=$8
      and claim is not distinct from $9::uuid and mode=case when $9::uuid is null then 'refresh' else 'mint' end
      and consumed_at is null and response_jti is null and request_expires>clock_timestamp()
      and $11::timestamptz>clock_timestamp() and $11::timestamptz<=request_expires
      and upstream_until>clock_timestamp() returning request_jti`,
    [proof.requestJti,proof.nonce,proof.subject,proof.accountId,proof.sessionHash,proof.expectedEpoch,stateHash,
      new Date(upstream),claim,proof.responseJti,new Date(proof.expires*1000)]);
  if(consumed.rowCount!==1)throw retired();
}

// LAST database decision, after every potentially blocking write. These rows
// are already owned/locked (or inserted by this transaction); no new row locks
// or native recheck may follow. Only COMMIT follows this fresh clock read.
// COMMIT/network completion before a deadline is deliberately not promised.
export async function finalDecision(db,{stateHash,sessionHash,subject,accountId,epoch,profileVersion,
  upstream,proof,mint=null}){
  const native=mint?.attempt.nativeProof;
  const row=(await db.query(`select clock_timestamp() as decision_at,a.expires_at as attempt_until,
    a.browser_hash,a.claimed_by,s.expires_at as session_until,s.upstream_until as stored_upstream,
    r.checked_until,n."expiresAt" as native_until
    from oz_identity.pixel_link_attempts a
    join oz_identity.pixel_sessions s on s.login_attempt_state_hash=a.state_hash and s.token_hash=$2 and s.subject=$3
    join oz_identity.pixel_profiles p on p.subject=s.subject and p.account_id=$4
    join oz_identity.account_links l on l.provider='pixelpulse' and l.subject=p.subject and l.account_id=p.account_id
    join oz_identity.accounts g on g.id=p.account_id and g.deleted_at is null
    join oz_identity.pixel_runtime_authorities r on r.subject=p.subject and r.account_id=p.account_id
    join oz_identity.pixel_status_requests q on q.request_jti=$9 and q.nonce=$10 and q.response_jti=$11
      and q.subject=p.subject and q.account_id=p.account_id and q.token_hash=s.token_hash and q.expected_epoch=$5
      and q.attempt_state_hash=a.state_hash and q.consumed_at is not null
      and q.proof_expires=$12 and q.request_expires>clock_timestamp() and q.upstream_until=s.upstream_until
    left join neon_auth.session n on n.id::text=$7 and n."userId"::text=$8
    where a.state_hash=$1 and a.completed_at is not null and a.cancelled_at is null
      and not r.disabled and r.credential_version=$5 and s.credential_version=$5 and r.profile_version=$6`,
  [stateHash,sessionHash,subject,accountId,epoch,profileVersion,native?.sessionId||null,native?.subject||null,
    proof.requestJti,proof.nonce,proof.responseJti,new Date(proof.expires*1000)])).rows[0];
  const time=value=>value==null?NaN:new Date(value).getTime(),decision=time(row?.decision_at);
  if(!row||!Number.isFinite(decision))throw retired();
  if(mint&&(row.browser_hash!==mint.browserHash||row.claimed_by!==mint.claim||
    !(time(row.attempt_until)>decision)))throw changed();
  const admission=time(row.checked_until),ceiling=time(upstream),proofUntil=proof.expires*1000;
  if(!Number.isSafeInteger(proof.expires)||!(ceiling>decision)||!(proofUntil>decision)||
    time(row.session_until)!==ceiling||time(row.stored_upstream)!==ceiling||
    !(admission>decision)||admission>Math.min(ceiling,proofUntil,decision+20000))throw retired();
  if(native&&(!Number.isSafeInteger(native.until)||native.until<=decision||
    !(time(row.native_until)>decision)))throw retired();
  return {checked_until:row.checked_until};
}

export async function startBoundReturn(body,req,database,configuration,{ownership=captureNativeProof}={}){
  if(!boundRuntimeEnabled())throw pending();
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['intent','link_token','native_session_token'].includes(k))||
    (body.intent!==undefined&&body.intent!=='continue'))throw pending();
  if(body.link_token!==undefined&&(typeof body.link_token!=='string'||body.link_token.length>16384))throw changed();
  if(body.native_session_token&&!body.link_token)throw pending();
  let targetAccount=null,targetSubject=null,previousSession=null,nativeProof=null;
  const raw=cookieValue(req,COOKIE);
  if(raw){
    const previous=(await database.query(`select s.subject,p.account_id from oz_identity.pixel_sessions s
      join oz_identity.pixel_profiles p using(subject) join oz_identity.accounts a on a.id=p.account_id
      where s.token_hash=$1 and s.expires_at>now() and a.deleted_at is null`,[hash(raw)])).rows[0];
    if(previous){targetAccount=previous.account_id;targetSubject=previous.subject;previousSession=hash(raw);}
  }
  if(body.link_token){
    // This proof CONFINES a return target, never authorizes a new binding.
    nativeProof=await ownership(body.link_token,body.native_session_token,database);
    const native=nativeProof?.accountId;
    if(!native||(targetAccount&&targetAccount!==native))throw changed();
    const linked=(await database.query('select subject from oz_identity.pixel_profiles where account_id=$1',[native])).rows[0];
    if(!linked)throw pending();
    targetAccount=native;targetSubject=linked.subject;
  }
  const context={phase:'discover',entry:'bound-return',state:oidc.randomState(),nonce:oidc.randomNonce(),
    verifier:oidc.randomPKCECodeVerifier(),targetAccount,targetSubject,previousSession,nativeProof};
  contextOf(context);
  // Runs separately BEFORE the owned start transaction, never after a final
  // admission fence. Expired receipt cleanup cannot cascade into live pairs.
  await reapBoundReturnState(database);
  const browser=random(),old=cookieValue(req,ATTEMPT_COOKIE);
  await transaction(database,async db=>{
    if(old)await cancelOwned(db,hash(old));
    await db.query(`insert into oz_identity.pixel_link_attempts(state_hash,browser_hash,context,expires_at)
      values($1,$2,$3,now()+interval '5 minutes')`,[hash(context.state),hash(browser),JSON.stringify(context)]);
  });
  const url=oidc.buildAuthorizationUrl(configuration,{redirect_uri:CALLBACK,response_type:'code',
    scope:'openid profile email',state:context.state,nonce:context.nonce,
    code_challenge:await oidc.calculatePKCECodeChallenge(context.verifier),code_challenge_method:'S256'});
  return {url:url.href,cookie:cookie(ATTEMPT_COOKIE,browser,300)};
}

export async function finishBoundReturn(url,req,database,configuration,{status=requestOutpostStatus}={}){
  if(!boundRuntimeEnabled())throw pending();
  const browser=cookieValue(req,ATTEMPT_COOKIE),state=callbackState(url,browser);
  if(url.searchParams.has('pixel_link_ticket'))throw changed();
  const stateHash=hash(state),browserHash=hash(browser),claim=randomUUID();
  const row=(await database.query(`update oz_identity.pixel_link_attempts
    set claimed_by=$3,claimed_at=clock_timestamp()
    where state_hash=$1 and browser_hash=$2 and expires_at>clock_timestamp()
      and claimed_by is null and cancelled_at is null and completed_at is null returning context`,
  [stateHash,browserHash,claim])).rows[0];
  const attempt=contextOf(row?.context);if(attempt.state!==state)throw changed();
  // Conservative start BEFORE the helper: it may receive tokens and then
  // await cold JWKS/nonrepudiation checks before returning them to us.
  const grantStartedAt=now();
  const tokens=await oidc.authorizationCodeGrant(configuration,url,{pkceCodeVerifier:attempt.verifier,
    expectedState:state,expectedNonce:attempt.nonce,idTokenExpected:true});
  // No helper-internal or subsequent await can restart expires_in.
  const claims=tokens.claims(),accessSeconds=Number(tokens.expires_in);
  const upstream=Math.min(Number(claims?.exp)*1000,grantStartedAt+Math.min(300,accessSeconds)*1000);
  if(!Number.isSafeInteger(claims?.exp)||!Number.isFinite(accessSeconds)||accessSeconds<=0||
    !Number.isFinite(upstream)||upstream<=now()+1000||typeof tokens.access_token!=='string')throw retired();
  if(claims?.iss!==PIXEL_ISSUER||claims.aud!=='outpost-zero'||!uuid(claims.sub)||
    (attempt.targetSubject&&attempt.targetSubject!==claims.sub))throw changed();
  // No email/native lookup, discovery, observation write or mint for unknown
  // subjects or another account, even after a valid provider callback.
  const existing=await boundAccount(database,claims.sub);
  if(!existing||(attempt.targetAccount&&existing!==attempt.targetAccount))throw changed();
  const info=await oidc.fetchUserInfo(configuration,tokens.access_token,claims.sub);
  await observeCredentialEpoch(database,observedIdentity(claims,info));
  const profile=validatedProfile(claims,info),raw=random(),sessionHash=hash(raw);
  const proof=await pendingStatus(database,{subject:profile.subject,accountId:existing,sessionHash,
    expectedEpoch:profile.credentialVersion,upstream},stateHash,claim,status);
  if(proof.subject!==profile.subject||proof.accountId!==existing||proof.sessionHash!==sessionHash||
    proof.expectedEpoch!==profile.credentialVersion||proof.credentialVersion!==profile.credentialVersion){
    if(proof.subject===profile.subject&&proof.credentialVersion>profile.credentialVersion)
      await observeCredentialEpoch(database,{subject:profile.subject,credentialVersion:proof.credentialVersion,
        profileVersion:profile.profileVersion,emailVerified:true});
    throw retired();
  }
  if(upstream<=now()+1000||!Number.isSafeInteger(proof.expires)||proof.expires*1000<=now())throw retired();
  // No refresh/offline_access and no status proof extends the OAuth ceiling.
  const cipher=await sealAccess(tokens.access_token);
  await transaction(database,async db=>{
    const owned=(await db.query(`select context from oz_identity.pixel_link_attempts
      where state_hash=$1 and browser_hash=$2 and claimed_by=$3 and completed_at is null
      and cancelled_at is null and expires_at>clock_timestamp() for update`,[stateHash,browserHash,claim])).rows[0];
    if(!owned||JSON.stringify(contextOf(owned.context))!==JSON.stringify(attempt))throw changed();
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['outpost-pixel:'+profile.subject]);
    const target=await boundAccount(db,profile.subject,true);
    if(target!==existing||(attempt.targetAccount&&target!==attempt.targetAccount))throw changed();
    if(attempt.nativeProof)await recheckNativeProof(attempt.nativeProof,db,{lock:true});
    const authority=(await db.query('select * from oz_identity.pixel_runtime_authorities where subject=$1 for update',[profile.subject])).rows[0];
    if(authority&&authority.account_id!==target)throw changed();
    if(authority&&(Number(authority.credential_version)>profile.credentialVersion||
      Number(authority.profile_version)>profile.profileVersion))throw retired();
    await consumeStatus(db,proof,{stateHash,upstream,claim});
    await projectBoundProfile(db,profile,target);
    await db.query(`insert into oz_identity.pixel_runtime_authorities
      (subject,account_id,credential_version,profile_version,checked_until,disabled)
      values($1,$2,$3,$4,least(clock_timestamp()+interval '20 seconds',$5,$6),false)
      on conflict(subject) do update set credential_version=excluded.credential_version,
      profile_version=excluded.profile_version,checked_until=excluded.checked_until,disabled=false`,
    [profile.subject,target,profile.credentialVersion,profile.profileVersion,new Date(upstream),new Date(proof.expires*1000)]);
    await db.query(`insert into oz_identity.pixel_sessions
      (token_hash,subject,credential_version,access_cipher,upstream_until,expires_at,login_attempt_state_hash)
      values($1,$2,$3,$4,$5,$5,$6)`,
    [sessionHash,profile.subject,profile.credentialVersion,cipher,new Date(upstream),stateHash]);
    if(attempt.previousSession)await db.query('delete from oz_identity.pixel_sessions where token_hash=$1 and subject=$2',
      [attempt.previousSession,profile.subject]);
    const completed=await db.query(`update oz_identity.pixel_link_attempts set completed_at=clock_timestamp()
      where state_hash=$1 and browser_hash=$2 and claimed_by=$3 and cancelled_at is null
      and completed_at is null and expires_at>clock_timestamp() returning state_hash`,[stateHash,browserHash,claim]);
    if(completed.rowCount!==1)throw changed();
    await finalDecision(db,{stateHash,sessionHash,subject:profile.subject,accountId:target,
      epoch:profile.credentialVersion,profileVersion:profile.profileVersion,upstream,
      proof,mint:{attempt,browserHash,claim}});
  });
  return {url:GAME_ORIGIN+'/?pixel_connected=1',cookies:[cookie(COOKIE,raw,Math.max(0,Math.floor((upstream-now())/1000))),
    cookie(ATTEMPT_COOKIE,'',0)]};
}

export async function revokeBoundRuntime(req,database){
  const raw=cookieValue(req,COOKIE),browser=cookieValue(req,ATTEMPT_COOKIE);
  await transaction(database,async db=>{
    if(browser)await cancelOwned(db,hash(browser));
    if(raw)await db.query('delete from oz_identity.pixel_sessions where token_hash=$1',[hash(raw)]);
  });
}

export async function sessionBoundRuntime(req,database,configuration,{status=requestOutpostStatus,
  userInfo=async(row)=>oidc.fetchUserInfo(configuration,await openAccess(row.access_cipher),row.subject)}={}){
  const raw=cookieValue(req,COOKIE);if(!raw)return null;
  const row=(await database.query(`select p.*,s.token_hash,s.login_attempt_state_hash,s.credential_version as session_epoch,
    s.expires_at,s.access_cipher,s.upstream_until,r.credential_version,r.profile_version,r.checked_until,r.disabled
    from oz_identity.pixel_sessions s join oz_identity.pixel_profiles p using(subject)
    join oz_identity.account_links l on l.provider='pixelpulse' and l.subject=p.subject and l.account_id=p.account_id
    join oz_identity.accounts g on g.id=p.account_id and g.deleted_at is null
    join oz_identity.pixel_runtime_authorities r on r.subject=p.subject and r.account_id=p.account_id
    join oz_identity.pixel_link_attempts a on a.state_hash=s.login_attempt_state_hash
    where s.token_hash=$1 and s.expires_at>now() and a.completed_at is not null and a.cancelled_at is null`,[hash(raw)])).rows[0];
  // Legacy cookies cannot silently turn into v2 admission. Manual bound-only
  // Continue is the re-entry path. Native/old readers remain unchanged OFF.
  if(!row||row.disabled||Number(row.session_epoch)!==Number(row.credential_version)||
    new Date(row.upstream_until).getTime()<=now()||new Date(row.expires_at).getTime()<=now())throw retired();
  if(new Date(row.checked_until).getTime()<=now()){
    const proof=await pendingStatus(database,{subject:row.subject,accountId:row.account_id,sessionHash:row.token_hash,
      expectedEpoch:Number(row.credential_version),upstream:new Date(row.upstream_until).getTime()},row.login_attempt_state_hash,null,status);
    if(proof.subject!==row.subject||proof.accountId!==row.account_id||proof.sessionHash!==row.token_hash||
      proof.expectedEpoch!==Number(row.credential_version)||proof.credentialVersion!==Number(row.credential_version)){
      if(proof.subject===row.subject&&proof.credentialVersion>Number(row.credential_version))
        await observeCredentialEpoch(database,{subject:row.subject,credentialVersion:proof.credentialVersion,
          profileVersion:Number(row.profile_version),emailVerified:true});
      throw retired();
    }
    const info=await userInfo(row);
    if(info.sub!==row.subject||!Number.isSafeInteger(info.credential_version)||info.credential_version<0||
      !Number.isSafeInteger(info.profile_version)||info.profile_version<0)throw retired();
    await observeCredentialEpoch(database,{subject:row.subject,credentialVersion:info.credential_version,
      profileVersion:info.profile_version,emailVerified:info.email_verified===true});
    if(info.email_verified!==true||info.credential_version!==Number(row.credential_version)||
      info.profile_version!==Number(row.profile_version)||info.preferred_username!==row.username||
      String(info.email).trim().toLowerCase()!==row.email)throw retired();
    const refreshed=await transaction(database,async db=>{
      // Same lock order as callback/signout: receipt, pair, authority, session.
      // No late response may reanimate a cancelled/deleted/retargeted session.
      const receipt=await db.query(`select state_hash from oz_identity.pixel_link_attempts
        where state_hash=$1 and completed_at is not null and cancelled_at is null for update`,[row.login_attempt_state_hash]);
      if(receipt.rowCount!==1)throw retired();
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['outpost-pixel:'+row.subject]);
      if(await boundAccount(db,row.subject,true)!==row.account_id)throw retired();
      const authority=(await db.query('select * from oz_identity.pixel_runtime_authorities where subject=$1 for update',[row.subject])).rows[0];
      if(!authority||authority.account_id!==row.account_id||authority.disabled||
        Number(authority.credential_version)!==Number(row.credential_version)||
        Number(authority.profile_version)!==Number(row.profile_version))throw retired();
      const active=await db.query(`select token_hash from oz_identity.pixel_sessions where token_hash=$1 and subject=$2
        and login_attempt_state_hash=$3 and credential_version=$4 and expires_at>clock_timestamp()
        and upstream_until>clock_timestamp() for update`,[row.token_hash,row.subject,row.login_attempt_state_hash,Number(row.credential_version)]);
      if(active.rowCount!==1||!Number.isSafeInteger(proof.expires)||proof.expires*1000<=now()||
        new Date(row.upstream_until).getTime()<=now())throw retired();
      await consumeStatus(db,proof,{stateHash:row.login_attempt_state_hash,upstream:row.upstream_until});
      const renewed=(await db.query(`update oz_identity.pixel_runtime_authorities set
        checked_until=least(clock_timestamp()+interval '20 seconds',$2,$3)
        where subject=$1 returning checked_until`,[row.subject,row.upstream_until,new Date(proof.expires*1000)])).rows[0];
      if(!renewed)throw retired();
      // Completed attempt expiry/native confinement are initial-mint checks,
      // not renewable native delegation. Refresh still owns the same uncancelled
      // receipt/pair/session; no native recheck or further write follows its fence.
      return finalDecision(db,{stateHash:row.login_attempt_state_hash,sessionHash:row.token_hash,
        subject:row.subject,accountId:row.account_id,epoch:Number(row.credential_version),
        profileVersion:Number(row.profile_version),upstream:row.upstream_until,proof});
    });
    if(!refreshed||new Date(refreshed.checked_until).getTime()<=now())throw retired();
    row.checked_until=refreshed.checked_until;
  }
  const live={provider:'pixel-pulse',expires_at:Math.floor(new Date(row.expires_at).getTime()/1000),
    user:{id:'pixelpulse:'+row.subject,game_user_id:row.account_id,email:row.email,email_confirmed_at:true,pixel_pulse:true,
      user_metadata:{username:row.username,preferred_username:row.username}}};
  Object.defineProperty(live,'admission',{value:{session:row.token_hash,epoch:Number(row.credential_version),
    until:Math.floor(Math.min(new Date(row.checked_until).getTime(),new Date(row.upstream_until).getTime())/1000)}});
  return live;
}
