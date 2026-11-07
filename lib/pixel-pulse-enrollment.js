// Receiver-owned counterpart of Pixel's Nov6 ongoing-admission contract.
// Local policy only: these receipts are NOT signed native ownership, central
// session liveness, account binding or a substitute for the v1 password proof.
export const OUTPOST_ENROLLMENT_ENABLED='PIXEL_PULSE_OUTPOST_SSO_ENABLED';
export const OUTPOST_ENROLLMENT_GENERATION='PIXEL_PULSE_OUTPOST_SSO_GENERATION';
const clientId='outpost-zero',fields=['version','policyId','clientId','notBefore','expiresAt'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const actorUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][0-9a-f]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const denied=()=>Object.assign(new Error('This Pixel Pulse connection window changed. Start again; your game account is unchanged.'),
  {code:'PIXEL_ENROLLMENT_CHANGED',status:503});
export const outpostEnrollmentConfigured=()=>process.env[OUTPOST_ENROLLMENT_ENABLED]!==undefined||process.env[OUTPOST_ENROLLMENT_GENERATION]!==undefined;
export function outpostEnrollmentState(){
  const flag=process.env[OUTPOST_ENROLLMENT_ENABLED],generation=process.env[OUTPOST_ENROLLMENT_GENERATION];
  return ['true','false'].includes(flag)&&typeof generation==='string'&&uuid.test(generation)
    ?Object.freeze({enabled:flag==='true',generation}):null;
}
export function outpostEnrollmentSeed(time=Date.now()){
  const state=outpostEnrollmentState();
  if(!state?.enabled||!Number.isSafeInteger(time)||time<0||time>8640000000000000)throw denied();
  const notBefore=Math.floor(time/900000)*900,expiresAt=notBefore+900;
  if(expiresAt*1000>8640000000000000)throw denied();
  return Object.freeze({version:1,policyId:state.generation,clientId,notBefore,expiresAt});
}
export function checkOutpostFirstEnrollment(attempt,profile=null,time=Date.now()){
  if(!outpostEnrollmentConfigured()){
    if(attempt.firstEnrollment||attempt.firstAdmission)throw denied(); // removal never falls back to legacy
    return null;
  }
  const seed=attempt.firstEnrollment,current=outpostEnrollmentSeed(time);
  if(!seed||Array.isArray(seed)||Object.keys(seed).sort().join(',')!==[...fields].sort().join(',')||
    fields.some(k=>seed[k]!==current[k]))throw denied();
  if(!profile)return current;
  if(profile.emailVerified!==true||typeof profile.subject!=='string'||!actorUuid.test(profile.subject))throw denied();
  const admission=Object.freeze({version:1,policyId:seed.policyId,clientId,subject:profile.subject,
    notBefore:seed.notBefore,expiresAt:seed.expiresAt});
  if(attempt.phase==='confirm'&&(!attempt.firstAdmission||
    Object.keys(attempt.firstAdmission).sort().join(',')!==Object.keys(admission).sort().join(',')||
    Object.keys(admission).some(k=>attempt.firstAdmission[k]!==admission[k])))throw denied();
  return admission;
}
