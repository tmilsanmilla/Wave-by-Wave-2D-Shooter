// LOCAL / DORMANT: explicit first connections only. The ordinary bound-only
// return never calls this binder. Requires reviewed005/006; no flags set here.
import {randomUUID} from 'node:crypto';
import * as oidc from 'openid-client';
import {GAME_ORIGIN,CALLBACK,COOKIE,ATTEMPT_COOKIE,hash,random,cookie,cookieValue,failure} from './pixel-pulse.js';
import {firstBindingsEnabled,captureNativeProof,recheckNativeProof,callbackState,observedIdentity,
  observeCredentialEpoch,validatedProfile,firstBinding,sealAccess,v2UpstreamDeadline,v2CompletionFence} from './pixel-pulse-v2.js';
import {outpostEnrollmentSeed,outpostEnrollmentState,checkOutpostFirstEnrollment} from './pixel-pulse-enrollment.js';
import {confirmationFlow,redeemFirstBindingProof} from './pixel-pulse-link-proof.js';
import {boundRuntimeEnabled,boundAccount,cancelOwned,transaction,pendingStatus,consumeStatus,
  finalDecision,finishBoundReturn} from './pixel-pulse-bound-return.js';
import {requestOutpostStatus} from './pixel-pulse-runtime-status.js';

const now=()=>Date.now();
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const changed=()=>failure('PIXEL_FIRST_TARGET','This connection changed or expired. No game accounts were merged.',409);
const pending=()=>failure('LINK_CONFIRMATION_PENDING','New Pixel Pulse connections are not enabled. Existing game sign-in is unchanged.',503);
const retired=()=>failure('PIXEL_RETURN_REQUIRED','Continue with Pixel Pulse again from the account menu.',401);
export const pairedFirstEnabled=()=>boundRuntimeEnabled()&&firstBindingsEnabled()&&outpostEnrollmentState()?.enabled===true;
function check(attempt,profile=null){
  if(!pairedFirstEnabled()||!attempt.firstEnrollment)throw pending();
  return checkOutpostFirstEnrollment(attempt,profile);
}
function contextOf(value){
  const keys=['entry','phase','mode','state','nonce','verifier','nativeProof','targetAccount','firstEnrollment',
    'firstAdmission','expectedSubject','expectedEpoch','expectedProfile','parentUntil'];
  if(!value||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||value.entry!=='first-paired'||
    !['discover','confirm'].includes(value.phase)||!['native','create'].includes(value.mode)||!uuid(value.targetAccount)||
    !/^[A-Za-z0-9_-]{22,256}$/.test(value.state||'')||!/^[A-Za-z0-9_-]{22,256}$/.test(value.nonce||'')||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(value.verifier||'')||!Number.isSafeInteger(value.parentUntil)||
    (value.mode==='native')!==!!value.nativeProof||
    (value.nativeProof&&value.nativeProof.accountId!==value.targetAccount))throw changed();
  if(value.phase==='confirm'&&(!uuid(value.expectedSubject)||!value.firstAdmission||
    !Number.isSafeInteger(value.expectedEpoch)||value.expectedEpoch<0||
    !Number.isSafeInteger(value.expectedProfile)||value.expectedProfile<0))throw changed();
  if(value.phase==='discover'&&['firstAdmission','expectedSubject','expectedEpoch','expectedProfile'].some(k=>k in value))throw changed();
  return value;
}
async function prepared(configuration,context,browser){
  const attempt=contextOf({...context,state:oidc.randomState(),nonce:oidc.randomNonce(),verifier:oidc.randomPKCECodeVerifier()});
  check(attempt);
  const until=Math.min(attempt.parentUntil,attempt.firstEnrollment.expiresAt*1000,attempt.nativeProof?.until??Infinity);
  if(!Number.isSafeInteger(until)||until<=now())throw changed();
  const params=attempt.phase==='confirm'?confirmationFlow(attempt):{redirect_uri:CALLBACK,response_type:'code',
    scope:'openid profile email',state:attempt.state,nonce:attempt.nonce,
    code_challenge:await oidc.calculatePKCECodeChallenge(attempt.verifier),code_challenge_method:'S256'};
  check(attempt);
  return {attempt,until,browser,stateHash:hash(attempt.state),url:oidc.buildAuthorizationUrl(configuration,params).href};
}
async function insertAttempt(db,next){
  const result=await db.query(`insert into oz_identity.pixel_link_attempts(state_hash,browser_hash,context,expires_at)
    select $1,$2,$3,$4 where $4::timestamptz>clock_timestamp() returning state_hash`,
  [next.stateHash,hash(next.browser),JSON.stringify(next.attempt),new Date(next.until)]);
  if(result.rowCount!==1)throw changed();
}
async function ownedAttempt(db,stateHash,browserHash,claim,attempt){
  const row=(await db.query(`select context from oz_identity.pixel_link_attempts
    where state_hash=$1 and browser_hash=$2 and claimed_by=$3 and completed_at is null
      and cancelled_at is null and expires_at>clock_timestamp() for update`,[stateHash,browserHash,claim])).rows[0];
  if(!row||JSON.stringify(contextOf(row.context))!==JSON.stringify(attempt))throw changed();
}
async function completeAttempt(db,stateHash,browserHash,claim){
  const result=await db.query(`update oz_identity.pixel_link_attempts set completed_at=clock_timestamp()
    where state_hash=$1 and browser_hash=$2 and claimed_by=$3 and cancelled_at is null
      and completed_at is null and expires_at>clock_timestamp() returning state_hash`,[stateHash,browserHash,claim]);
  if(result.rowCount!==1)throw changed();
}
export async function startFirstPaired(body,req,database,configuration,{ownership=captureNativeProof}={}){
  if(!pairedFirstEnabled())throw pending();
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['intent','link_token','native_session_token'].includes(k))||
    !['link','create'].includes(body.intent))throw changed();
  const startedAt=now(),firstEnrollment=outpostEnrollmentSeed(startedAt);
  if(body.intent==='create'&&(body.link_token||body.native_session_token))throw changed();
  const nativeProof=body.intent==='link'?await ownership(body.link_token,body.native_session_token,database):null;
  if(body.intent==='link'&&!nativeProof)throw changed();
  const targetAccount=nativeProof?.accountId||randomUUID();
  const context={entry:'first-paired',phase:'discover',mode:nativeProof?'native':'create',nativeProof,targetAccount,
    firstEnrollment,parentUntil:Math.min(startedAt+300000,nativeProof?.until??Infinity,firstEnrollment.expiresAt*1000)};
  check(context);
  const next=await prepared(configuration,context,random()),old=cookieValue(req,ATTEMPT_COOKIE);
  await transaction(database,async db=>{
    if(old)await cancelOwned(db,hash(old));
    check(next.attempt);await insertAttempt(db,next);
    await v2CompletionFence(db,[next.until]);check(next.attempt);
  });
  return {url:next.url,cookie:cookie(ATTEMPT_COOKIE,next.browser,Math.max(0,Math.floor((next.until-now())/1000)))};
}

// Dispatch by the receiver-owned stored entry, never callback query/body intent.
// Both destinations independently claim/recheck the same exact browser/state.
export async function finishPairedCallback(url,req,database,configuration,dependencies={}){
  const browser=cookieValue(req,ATTEMPT_COOKIE),state=callbackState(url,browser);
  const row=(await database.query(`select context from oz_identity.pixel_link_attempts
    where state_hash=$1 and browser_hash=$2 and claimed_by is null and completed_at is null
      and cancelled_at is null and expires_at>clock_timestamp()`,[hash(state),hash(browser)])).rows[0];
  if(!row)throw changed();
  return row.context?.entry==='first-paired'
    ?finishFirstPaired(url,req,database,configuration,dependencies)
    :finishBoundReturn(url,req,database,configuration,dependencies);
}
export async function finishFirstPaired(url,req,database,configuration,
  {redeem=redeemFirstBindingProof,status=requestOutpostStatus}={}){
  if(!pairedFirstEnabled())throw pending();
  const browser=cookieValue(req,ATTEMPT_COOKIE),state=callbackState(url,browser),stateHash=hash(state),browserHash=hash(browser),claim=randomUUID();
  const row=(await database.query(`update oz_identity.pixel_link_attempts
    set claimed_by=$3,claimed_at=clock_timestamp()
    where state_hash=$1 and browser_hash=$2 and expires_at>clock_timestamp()
      and claimed_by is null and cancelled_at is null and completed_at is null returning context,expires_at`,
  [stateHash,browserHash,claim])).rows[0];
  const attempt=contextOf(row?.context),attemptUntil=new Date(row?.expires_at).getTime();
  if(attempt.state!==state||!Number.isSafeInteger(attemptUntil)||attemptUntil>attempt.parentUntil||
    attemptUntil<=now()||(attempt.phase==='discover'&&url.searchParams.has('pixel_link_ticket')))throw changed();
  check(attempt);
  if(attempt.nativeProof)await recheckNativeProof(attempt.nativeProof,database);
  check(attempt);
  const grantStartedAt=now(),tokens=await oidc.authorizationCodeGrant(configuration,url,{pkceCodeVerifier:attempt.verifier,
    expectedState:state,expectedNonce:attempt.nonce,idTokenExpected:true});
  const claims=tokens.claims(),upstream=v2UpstreamDeadline(tokens,claims,grantStartedAt),observedAt=now();
  check(attempt);
  const info=await oidc.fetchUserInfo(configuration,tokens.access_token,claims.sub);
  if(upstream<=now()+1000||attemptUntil<=now())throw retired();
  await observeCredentialEpoch(database,observedIdentity(claims,info));
  const profile=validatedProfile(claims,info),firstAdmission=check(attempt,profile);
  if(await boundAccount(database,profile.subject))throw changed(); // never rebind or turn first into return
  if(attempt.phase==='discover'){
    const next=await prepared(configuration,{...attempt,phase:'confirm',firstAdmission,expectedSubject:profile.subject,
      expectedEpoch:profile.credentialVersion,expectedProfile:profile.profileVersion},browser);
    await transaction(database,async db=>{
      await ownedAttempt(db,stateHash,browserHash,claim,attempt);check(attempt,profile);
      if(attempt.nativeProof)await recheckNativeProof(attempt.nativeProof,db,{lock:true});
      await insertAttempt(db,next);await completeAttempt(db,stateHash,browserHash,claim);
      await v2CompletionFence(db,[attemptUntil,upstream,next.until,...(attempt.nativeProof?[attempt.nativeProof.until]:[])]);
      check(attempt,profile);
    });
    return {url:next.url,cookies:[cookie(ATTEMPT_COOKIE,browser,Math.max(0,Math.floor((next.until-now())/1000)))]};
  }
  if(attempt.expectedSubject!==profile.subject||attempt.expectedEpoch!==profile.credentialVersion||
    attempt.expectedProfile!==profile.profileVersion)throw changed();
  const password=await redeem(url.searchParams.get('pixel_link_ticket'),attempt,{profile,idToken:tokens.id_token,code:url.searchParams.get('code')});
  check(attempt,profile);
  const raw=random(),sessionHash=hash(raw),cipher=await sealAccess(tokens.access_token);
  let newerEpoch=null;
  try{
    await transaction(database,async db=>{
      await ownedAttempt(db,stateHash,browserHash,claim,attempt);check(attempt,profile);
      // First binding and provisional status FK are visible ONLY inside this
      // transaction. Never commit a binding early to satisfy the pending FK.
      const target=await firstBinding(db,attempt,profile,password,{createAccountId:attempt.mode==='create'?attempt.targetAccount:undefined});
      if(target!==attempt.targetAccount||await boundAccount(db,profile.subject,true)!==target)throw changed();
      const authority=(await db.query('select * from oz_identity.pixel_runtime_authorities where subject=$1 for update',[profile.subject])).rows[0];
      if(authority&&(authority.account_id!==target||Number(authority.credential_version)>profile.credentialVersion||
        Number(authority.profile_version)>profile.profileVersion))throw changed();
      const proof=await pendingStatus(db,{subject:profile.subject,accountId:target,sessionHash,
        expectedEpoch:profile.credentialVersion,upstream},stateHash,claim,status);
      check(attempt,profile);
      if(proof.credentialVersion!==profile.credentialVersion){
        if(Number.isSafeInteger(proof.credentialVersion)&&proof.credentialVersion>profile.credentialVersion)newerEpoch=proof.credentialVersion;
        throw retired();
      }
      await consumeStatus(db,proof,{stateHash,upstream,claim});
      await db.query(`insert into oz_identity.pixel_runtime_authorities
        (subject,account_id,credential_version,profile_version,checked_until,disabled)
        values($1,$2,$3,$4,least(clock_timestamp()+interval '20 seconds',$5,$6,$7),false)
        on conflict(subject) do update set credential_version=excluded.credential_version,
          profile_version=excluded.profile_version,checked_until=excluded.checked_until,disabled=false`,
      [profile.subject,target,profile.credentialVersion,profile.profileVersion,new Date(upstream),new Date(proof.expires*1000),new Date(observedAt+20000)]);
      await db.query(`insert into oz_identity.pixel_sessions
        (token_hash,subject,credential_version,access_cipher,upstream_until,expires_at,login_attempt_state_hash)
        values($1,$2,$3,$4,$5,$5,$6)`,[sessionHash,profile.subject,profile.credentialVersion,cipher,new Date(upstream),stateHash]);
      await completeAttempt(db,stateHash,browserHash,claim);
      await finalDecision(db,{stateHash,sessionHash,subject:profile.subject,accountId:target,
        epoch:profile.credentialVersion,profileVersion:profile.profileVersion,upstream,proof,mint:{attempt,browserHash,claim}});
      // Fresh clock AFTER all possibly-blocking writes, retaining target/native/
      // receipt locks. No DB work after this fence except COMMIT.
      await v2CompletionFence(db,[attemptUntil,upstream,observedAt+20000,password.expires*1000,
        proof.expires*1000,attempt.firstEnrollment.expiresAt*1000,...(attempt.nativeProof?[attempt.nativeProof.until]:[])]);
      check(attempt,profile);
    });
  }catch(error){
    if(newerEpoch!==null)await observeCredentialEpoch(database,{subject:profile.subject,credentialVersion:newerEpoch,
      profileVersion:profile.profileVersion,emailVerified:true});
    throw error;
  }
  return {url:GAME_ORIGIN+'/?pixel_connected=1',cookies:[cookie(COOKIE,raw,Math.max(0,Math.floor((upstream-now())/1000))),cookie(ATTEMPT_COOKIE,'',0)]};
}
