import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PIXEL_ISSUER, CALLBACK, failure } from './pixel-pulse.js';

const CLIENT='outpost-zero',keys=createRemoteJWKSet(new URL(PIXEL_ISSUER+'/jwks'));
const verified=new WeakSet(),digest=value=>createHash('sha256').update(String(value)).digest('hex');
export const linkFailure=()=>failure('LINK_PROOF','Confirm your current Pixel Pulse password in a new connection attempt.',403);
export function confirmationFlow(attempt){
  // Order is part of Root's frozen v1 digest. All values come from our private
  // one-use transaction, never callback-supplied context or a browser boolean.
  return {client_id:CLIENT,redirect_uri:CALLBACK,response_type:'code',scope:'openid profile email',
    state:attempt.state,nonce:attempt.nonce,
    code_challenge:createHash('sha256').update(attempt.verifier).digest('base64url'),
    code_challenge_method:'S256',pixel_intent:'link'};
}
export function assertFirstBindingProof(proof,attempt,profile){
  if(!proof||!verified.has(proof)||attempt.phase!=='confirm'||
    !['native','create'].includes(attempt.mode)||proof.subject!==profile.subject||
    proof.subject!==attempt.expectedSubject||proof.mode!==attempt.mode||
    proof.accountId!==(attempt.nativeProof?.accountId||null)||
    proof.profileVersion!==profile.profileVersion||attempt.expectedProfile!==profile.profileVersion||
    proof.credentialVersion!==profile.credentialVersion||proof.expires<=Math.floor(Date.now()/1000))throw linkFailure();
}
export async function verifyFirstBindingProof(token,attempt,profile,code,resolver=keys){
  const now=Math.floor(Date.now()/1000);
  if(attempt.phase!=='confirm'||!['native','create'].includes(attempt.mode)||
    attempt.expectedSubject!==profile.subject||attempt.expectedEpoch!==profile.credentialVersion||
    attempt.expectedProfile!==profile.profileVersion||
    profile.emailVerified!==true||!Number.isSafeInteger(profile.credentialVersion)||profile.credentialVersion<0||
    (attempt.mode==='native')!==!!attempt.nativeProof||!code||typeof token!=='string'||token.length>8192)throw linkFailure();
  const {payload:p}=await jwtVerify(token,resolver,{issuer:PIXEL_ISSUER,audience:CLIENT,algorithms:['EdDSA'],
    requiredClaims:['sub','aud','iat','exp','jti','auth_time','credential_version','purpose','link_proof_version',
      'intent','amr','flow_hash','oauth_state_hash','oauth_nonce_hash','pkce_challenge','redirect_uri','authorization_code_hash'],maxTokenAge:'30s'});
  const flow=confirmationFlow(attempt);
  if(p.iss!==PIXEL_ISSUER||p.aud!==CLIENT||p.sub!==profile.subject||p.purpose!=='pixel-pulse-fresh-link'||
    p.link_proof_version!==1||p.intent!=='link'||!Array.isArray(p.amr)||p.amr.length!==1||p.amr[0]!=='pwd'||
    typeof p.jti!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.jti)||
    !Number.isSafeInteger(p.auth_time)||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||
    p.auth_time>now||now-p.auth_time>90||p.iat>now||p.iat<p.auth_time||p.exp<=p.iat||
    p.exp-p.iat>30||p.exp>p.auth_time+90||p.credential_version!==profile.credentialVersion||
    p.flow_hash!==digest(JSON.stringify(flow))||p.oauth_state_hash!==digest(attempt.state)||
    p.oauth_nonce_hash!==digest(attempt.nonce)||p.pkce_challenge!==flow.code_challenge||
    p.redirect_uri!==CALLBACK||p.authorization_code_hash!==digest(code))throw linkFailure();
  const proof=Object.freeze({subject:profile.subject,mode:attempt.mode,accountId:attempt.nativeProof?.accountId||null,
    credentialVersion:profile.credentialVersion,profileVersion:profile.profileVersion,jti:p.jti,expires:p.exp});
  verified.add(proof);return proof;
}
export async function redeemFirstBindingProof(ticket,attempt,exchange,request=fetch,resolver=keys){
  if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket)||attempt.phase!=='confirm')throw linkFailure();
  const response=await request(PIXEL_ISSUER+'/pixel-pulse/redeem-link',{method:'POST',redirect:'error',cache:'no-store',
    headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),
    body:JSON.stringify({ticket,idToken:exchange.idToken,code:exchange.code,codeVerifier:attempt.verifier,flow:confirmationFlow(attempt)})});
  if(!response.ok)throw linkFailure();
  const text=await response.text();if(text.length>16384)throw linkFailure();
  const result=JSON.parse(text);
  return verifyFirstBindingProof(result.proof,attempt,exchange.profile,exchange.code,resolver);
}
