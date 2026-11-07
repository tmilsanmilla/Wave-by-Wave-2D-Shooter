// Dormant matched central7fc counterpart. No Skyway identity/key reuse.
import {randomUUID} from 'node:crypto';
import {createRemoteJWKSet, jwtVerify, SignJWT} from 'jose';
import {PIXEL_ISSUER, GAME_ISSUER, random, signingKey, failure} from './pixel-pulse.js';

export const OUTPOST_CLIENT='outpost-zero';
export const STATUS_ENDPOINT=PIXEL_ISSUER+'/pixel-pulse/outpost-credential-status';
const centralKeys=createRemoteJWKSet(new URL(PIXEL_ISSUER+'/jwks'));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const denied=()=>failure('PIXEL_RUNTIME_STATUS','Pixel Pulse could not verify this game session. Continue again from the account menu.',401);
const responseFields=['iss','aud','sub','account_id','outpost_session','expected_credential_version',
  'credential_version','nonce','request_jti','jti','iat','exp','purpose','credential_check_version'].sort().join(',');

export async function verifyOutpostStatus(token,expected,resolver=centralKeys,now=Math.floor(Date.now()/1000)){
  // Echoed tuple proves request correlation ONLY, never ownership or binding.
  expected={...expected};
  if(typeof token!=='string'||token.length>16384||!uuid(expected.subject)||!uuid(expected.accountId)||
    !/^[0-9a-f]{64}$/.test(expected.sessionHash)||!Number.isSafeInteger(expected.expectedEpoch)||expected.expectedEpoch<0||
    !uuid(expected.requestJti)||!/^[A-Za-z0-9_-]{43}$/.test(expected.nonce)||
    !Number.isSafeInteger(expected.requestExpires))throw denied();
  const {payload:p,protectedHeader:header}=await jwtVerify(token,resolver,{issuer:PIXEL_ISSUER,audience:OUTPOST_CLIENT,
    algorithms:['EdDSA'],currentDate:new Date(now*1000),requiredClaims:['sub','iss','aud','iat','exp','jti']});
  if(['jku','jwk','x5u'].some(k=>k in header)||Object.keys(p).sort().join(',')!==responseFields||
    p.iss!==PIXEL_ISSUER||p.aud!==OUTPOST_CLIENT||p.sub!==expected.subject||
    p.purpose!=='pixel-pulse-credential-status'||p.credential_check_version!==1||
    p.nonce!==expected.nonce||p.request_jti!==expected.requestJti||!uuid(p.jti)||
    p.account_id!==expected.accountId||p.outpost_session!==expected.sessionHash||
    p.expected_credential_version!==expected.expectedEpoch||
    !Number.isSafeInteger(p.credential_version)||p.credential_version<0||
    !Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now||
    now-p.iat>30||p.exp<=now||p.exp>p.iat+30||
    p.exp>expected.requestExpires)throw denied();
  return Object.freeze({subject:p.sub,accountId:expected.accountId,sessionHash:expected.sessionHash,
    expectedEpoch:expected.expectedEpoch,credentialVersion:p.credential_version,expires:p.exp,
    nonce:expected.nonce,requestJti:expected.requestJti,responseJti:p.jti});
}

export function prepareOutpostStatus(binding){
  const issued=Math.floor(Date.now()/1000);
  return Object.freeze({...binding,requestJti:randomUUID(),nonce:random(),requestIssued:issued,
    requestExpires:Math.min(issued+30,Math.floor(Number(binding.upstream)/1000))});
}

export async function requestOutpostStatus(binding,{request=fetch,signer=signingKey,resolver=centralKeys}={}){
  // Caller MUST persist this exact prepared context before sending anything.
  const {subject,accountId,sessionHash,expectedEpoch,requestJti,nonce,requestIssued,requestExpires}=binding||{};
  const now=Math.floor(Date.now()/1000);
  if(!uuid(subject)||!uuid(accountId)||!/^[0-9a-f]{64}$/.test(sessionHash)||
    !Number.isSafeInteger(expectedEpoch)||expectedEpoch<0||!uuid(requestJti)||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce)||!Number.isSafeInteger(requestIssued)||requestIssued>now||
    now-requestIssued>30||!Number.isSafeInteger(requestExpires)||requestExpires<=now||requestExpires>requestIssued+30)throw denied();
  const {privateKey,publicKey}=await signer();
  const signed=await new SignJWT({client_id:OUTPOST_CLIENT,purpose:'pixel-pulse-credential-check',
    credential_check_version:1,nonce,account_id:accountId,outpost_session:sessionHash,
    expected_credential_version:expectedEpoch}).setProtectedHeader({alg:'RS256',kid:publicKey.kid,typ:'JWT'})
    .setIssuer(GAME_ISSUER).setAudience(PIXEL_ISSUER).setSubject(subject).setJti(requestJti)
    .setIssuedAt(requestIssued).setExpirationTime(requestExpires).sign(privateKey);
  const response=await request(STATUS_ENDPOINT,{method:'POST',redirect:'error',cache:'no-store',
    headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},
    body:'{}',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw denied();
  const text=await response.text();if(text.length>20000)throw denied();
  const body=JSON.parse(text);
  return verifyOutpostStatus(body.proof,{subject,accountId,sessionHash,expectedEpoch,nonce,requestJti,requestExpires},resolver);
}
