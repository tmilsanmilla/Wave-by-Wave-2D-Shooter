// Receiving side of a NOT-YET-ACTIVATED provider contract. A refresh token by
// itself is not proof that the original central login remains authorized.
import { randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import { PIXEL_ISSUER,failure } from './pixel-pulse.js';

export const renewalEnabled=()=>process.env.PIXEL_PULSE_GAME_PROTOCOL==='v2'&&process.env.PIXEL_PULSE_RENEWAL_ENABLED==='true';
export const MAX_REMEMBERED_MS=7*24*60*60*1000;
const expired=()=>failure('PIXEL_SESSION_EXPIRED','Continue with Pixel Pulse again to confirm your current account.',401);
const busy=()=>failure('PIXEL_RENEWAL_PENDING','Your sign-in is being renewed. Please try again shortly.',503);
const opaque=value=>typeof value==='string'&&value.length>=20&&value.length<=16384;
export function assertRenewalProvider(configuration){
  const metadata=configuration.serverMetadata();
  if(metadata.issuer!==PIXEL_ISSUER||metadata.pixel_pulse_session_renewal!==1||
    !metadata.grant_types_supported?.includes('refresh_token')||!metadata.scopes_supported?.includes('offline_access'))
    throw failure('PIXEL_RENEWAL_PROVIDER','Pixel Pulse session renewal is not ready. Existing sign-in has not been changed.',503);
}
// claims() must come from openid-client's verified ID-token result, never from
// browser JSON or an unverified JWT decode. The provider must sign the original
// managed-session ceiling and keep checking that authority on refresh/UserInfo.
export function renewalWindow(tokens,subject,clock=Date.now()){
  const claims=tokens.claims();
  if(!opaque(tokens.access_token)||!opaque(tokens.refresh_token)||claims?.iss!==PIXEL_ISSUER||
    claims.aud!=='outpost-zero'||claims.sub!==subject||claims.pixel_renewal_version!==1||
    typeof claims.sid!=='string'||!claims.sid||claims.sid.length>256||
    !Number.isSafeInteger(claims.pixel_session_expires_at)||claims.pixel_session_expires_at*1000<=clock+1000||
    !Number.isSafeInteger(claims.iat)||claims.iat*1000>clock||!Number.isSafeInteger(claims.exp)||claims.exp*1000<=clock+1000||
    !Number.isFinite(tokens.expires_in)||tokens.expires_in<=0||tokens.expires_in>300)throw expired();
  const upstreamUntil=Math.min(claims.exp*1000,clock+tokens.expires_in*1000);
  const sessionUntil=Math.min(claims.pixel_session_expires_at*1000,clock+MAX_REMEMBERED_MS);
  if(upstreamUntil>sessionUntil)throw expired();
  return {upstreamUntil,sessionUntil,providerUntil:claims.pixel_session_expires_at,providerSession:claims.sid};
}
export async function exchangeRefresh(configuration,refreshToken){
  assertRenewalProvider(configuration);
  return oidc.refreshTokenGrant(configuration,refreshToken);
}

export async function renewSession(database,configuration,initial,{open,seal,observe,exchange=exchangeRefresh,
  userInfo=oidc.fetchUserInfo,clock=Date.now}={}){
  if(!renewalEnabled()||!initial.refresh_cipher)throw expired();
  assertRenewalProvider(configuration);
  const claim=randomUUID();
  // Commit ownership BEFORE contacting the rotating provider. A process crash,
  // lost reply or database failure must never lead to reuse of the old token.
  let row=(await database.query(`update oz_identity.pixel_sessions set renewal_claim=$2,renewal_started_at=clock_timestamp()
    where token_hash=$1 and renewal_claim is null and refresh_cipher is not null and expires_at>clock_timestamp()
      and upstream_until<=clock_timestamp()+interval '30 seconds'
    returning *`,[initial.token_hash,claim])).rows[0];
  if(!row){
    const current=(await database.query('select * from oz_identity.pixel_sessions where token_hash=$1',[initial.token_hash])).rows[0];
    if(!current||new Date(current.expires_at).getTime()<=clock())throw expired();
    if(current.renewal_claim){
      if(new Date(current.renewal_started_at).getTime()>clock()-30000)throw busy();
      await database.query('delete from oz_identity.pixel_sessions where token_hash=$1 and renewal_claim=$2',[current.token_hash,current.renewal_claim]);
      throw expired();
    }
    if(new Date(current.upstream_until).getTime()<=clock())throw expired();
    return {...initial,...current};
  }
  let observation;
  try{
    const refresh=await open(row.refresh_cipher,'refresh');
    const tokens=await exchange(configuration,refresh),window=renewalWindow(tokens,initial.subject,clock());
    if(tokens.refresh_token===refresh||window.providerUntil!==Number(row.renewal_until)||window.providerSession!==row.renewal_sid)throw expired();
    const claims=tokens.claims(),info=await userInfo(configuration,tokens.access_token,initial.subject);
    if(info?.sub!==initial.subject||!Number.isSafeInteger(info.credential_version)||info.credential_version<0||
      !Number.isSafeInteger(info.profile_version)||info.profile_version<0)throw expired();
    observation={subject:info.sub,credentialVersion:info.credential_version,profileVersion:info.profile_version,emailVerified:info.email_verified===true};
    if(claims.credential_version!==Number(row.credential_version)||claims.profile_version!==Number(initial.profile_version)||
      observation.credentialVersion!==Number(row.credential_version)||observation.profileVersion!==Number(initial.profile_version)||
      claims.email_verified!==true||!observation.emailVerified||info.preferred_username!==initial.username||
      String(info.email).trim().toLowerCase()!==initial.email||claims.preferred_username!==info.preferred_username||claims.email!==info.email)
      throw expired();
    const saved=(await database.query(`update oz_identity.pixel_sessions s set access_cipher=$3,refresh_cipher=$4,
      upstream_until=least($5,s.expires_at),renewal_claim=null,renewal_started_at=null
      where s.token_hash=$1 and s.renewal_claim=$2 and s.expires_at>clock_timestamp()
        and exists(select 1 from oz_identity.pixel_runtime_authorities r where r.subject=s.subject and not r.disabled
          and r.credential_version=s.credential_version and r.profile_version=$6)
      returning s.*`,[row.token_hash,claim,await seal(tokens.access_token,'access'),await seal(tokens.refresh_token,'refresh'),
      new Date(window.upstreamUntil),Number(initial.profile_version)])).rows[0];
    if(!saved)throw expired();
    return {...initial,...saved};
  }catch(error){
    // Also handles ambiguous upstream success. Never retry this refresh secret.
    await database.query('delete from oz_identity.pixel_sessions where token_hash=$1 and renewal_claim=$2',[row.token_hash,claim]);
    throw expired();
  }finally{
    // Separate committed revocation survives failed renewal/profile projection.
    if(observation)await observe(database,observation);
  }
}
