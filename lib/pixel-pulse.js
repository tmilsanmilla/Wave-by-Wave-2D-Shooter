import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createRemoteJWKSet, importJWK, SignJWT, jwtVerify } from 'jose';
import * as oidc from 'openid-client';

export const PIXEL_ISSUER='https://pixel-pulse-websites.vercel.app/api/sso';
export const GAME_ORIGIN='https://wave-by-wave-2-d-shooter.vercel.app';
export const GAME_ISSUER=GAME_ORIGIN+'/api/pixel-pulse';
export const GAME_AUDIENCE='https://ep-fragrant-salad-a577vui2.neonauth.us-east-2.aws.neon.tech';
export const GAME_RESOURCE_AUDIENCE='outpost-zero-pixel-pulse';
export const NEON_ISSUER='https://ep-fragrant-salad-a577vui2.neonauth.us-east-2.aws.neon.tech/neondb/auth';
export const NEON_JWKS=NEON_ISSUER+'/.well-known/jwks.json';
export const CALLBACK=GAME_ISSUER+'/callback';
export const COOKIE='__Host-oz_pixel_session',ATTEMPT_COOKIE='__Host-oz_pixel_attempt';
const SESSION_SECONDS=7*24*60*60;
let database,configuration,key,verifiedDatabase;
let nativePublicKeys=null,nativePublicKeysUntil=0;
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export const random=()=>randomBytes(32).toString('base64url');
export const failure=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
export function cookieValue(req,name){
  const entries=String(req.headers.cookie||'').split(';').map(s=>s.trim().split('='));
  const found=entries.filter(([k])=>k===name);
  return found.length===1&&/^[A-Za-z0-9_-]{43}$/.test(found[0][1]||'')?found[0][1]:null;
}
export function cookie(name,value,maxAge){
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function pool(){
  if(!database){
    if(!process.env.DATABASE_URL)throw failure('SETUP','Shared sign-in is not configured.',503);
    database=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:20000});
  }
  return database;
}
export async function databaseReady(){
  if(!verifiedDatabase)verifiedDatabase=pool().query("select current_setting('neon.branch_id',true) as branch")
    .then(result=>{
      if(result.rows[0]?.branch!=='br-dawn-butterfly-a573hk7g')throw failure('DATABASE_BRANCH','Shared sign-in is not configured for the game database.',503);
      return pool();
    }).catch(error=>{verifiedDatabase=null;throw error;});
  return verifiedDatabase;
}
export async function config(){
  if(!configuration)configuration=oidc.discovery(new URL(PIXEL_ISSUER),'outpost-zero',
    {token_endpoint_auth_method:'none'},oidc.None(),{timeout:10,execute:[oidc.enableNonRepudiationChecks]})
    .then(c=>providerConfiguration(c.serverMetadata())).catch(e=>{configuration=null;throw e;});
  return configuration;
}
export function providerConfiguration(m){
  if(m.issuer!==PIXEL_ISSUER)throw failure('PROVIDER','Pixel Pulse connection is not ready.',503);
  for(const field of ['authorization_endpoint','token_endpoint','userinfo_endpoint','jwks_uri'])
    if(!String(m[field]||'').startsWith(PIXEL_ISSUER+'/'))throw failure('PROVIDER','Pixel Pulse connection is not ready.',503);
  const algorithm=['EdDSA','ES256','RS256'].find(alg=>m.id_token_signing_alg_values_supported?.includes(alg));
  if(m.authorization_response_iss_parameter_supported!==true||!algorithm)throw failure('PROVIDER','Pixel Pulse connection is not ready.',503);
  const result=new oidc.Configuration(m,'outpost-zero',{token_endpoint_auth_method:'none',id_token_signed_response_alg:algorithm},oidc.None());
  result.timeout=10;oidc.enableNonRepudiationChecks(result);return result;
}
export async function signingKey(){
  if(!key){
    const jwk=JSON.parse(process.env.PIXEL_PULSE_GAME_SIGNING_KEY||'null');
    if(!jwk?.d||jwk.kty!=='RSA'||!jwk.kid)throw failure('SETUP','Shared sign-in is not configured.',503);
    key={privateKey:await importJWK(jwk,'RS256'),publicKey:{kty:jwk.kty,n:jwk.n,e:jwk.e,kid:jwk.kid,alg:'RS256',use:'sig'}};
  }
  return key;
}
export async function trustedDatabaseKeys(){
  if(!nativePublicKeys||nativePublicKeysUntil<Date.now()){
    const response=await fetch(NEON_JWKS,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{Accept:'application/json',Origin:GAME_ORIGIN}});
    if(!response.ok)throw failure('KEYS_'+response.status,'Database sign-in keys are temporarily unavailable ('+response.status+').',503);
    const result=await response.json();
    if(!Array.isArray(result.keys)||!result.keys.length||result.keys.some(k=>k.d||!k.kid||!['RSA','EC','OKP'].includes(k.kty)))
      throw failure('KEYS','Database sign-in keys are invalid.',503);
    nativePublicKeys=result.keys;nativePublicKeysUntil=Date.now()+60000;
  }
  const keys=[...nativePublicKeys,(await signingKey()).publicKey];
  if(new Set(keys.map(k=>k.kid)).size!==keys.length)throw failure('KEYS','Database key identifiers conflict.',503);
  return {keys};
}
const nativeKeys=createRemoteJWKSet(new URL(NEON_JWKS));
export async function nativeOwnership(token,db=pool()){
  if(!token)return null;
  const {payload}=await jwtVerify(token,nativeKeys,{issuer:NEON_ISSUER,audience:new URL(NEON_ISSUER).origin,requiredClaims:['exp','sub'],algorithms:['RS256','ES256','EdDSA']});
  if(payload.role!=='authenticated'||!/^[0-9a-f-]{36}$/.test(payload.sub))throw failure('LINK_PROOF','Sign in to your existing game account before connecting Pixel Pulse.',401);
  const {rows}=await db.query("select a.id from oz_identity.account_links l join oz_identity.accounts a on a.id=l.account_id where l.provider='neon' and l.subject=$1 and a.deleted_at is null",[payload.sub]);
  if(!rows[0])throw failure('LINK_PROOF','Sign in to your existing game account before connecting Pixel Pulse.',401);
  return rows[0].id;
}
export function centralProfile(claims,userInfo){
  if(!claims?.sub||claims.sub!==userInfo?.sub||!/^[0-9a-f-]{36}$/.test(claims.sub))throw failure('IDENTITY','Pixel Pulse returned an invalid account.');
  if(!/^[a-z0-9_]{3,24}$/.test(userInfo.preferred_username||'')||['username_not_set','usernamenotset'].includes(userInfo.preferred_username)||claims.preferred_username!==userInfo.preferred_username)throw failure('IDENTITY','Choose a valid shared username on Pixel Pulse first.');
  if(userInfo.email_verified!==true||claims.email_verified!==true)throw failure('VERIFY_EMAIL','Verify your Pixel Pulse email before connecting your game account.');
  const email=String(userInfo.email||'').trim().toLowerCase();
  if(email!==String(claims.email||'').trim().toLowerCase()||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw failure('IDENTITY','Pixel Pulse returned an invalid email.');
  return {subject:claims.sub,username:userInfo.preferred_username,email};
}
export async function bindAccount(db,profile,linkAccountId){
  const {subject,username,email}=profile;
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['outpost-pixel:'+subject]);
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['outpost-zero:email:'+email]);
  const existing=(await db.query('select * from oz_identity.pixel_profiles where subject=$1 for update',[subject])).rows[0];
  if(existing&&linkAccountId&&existing.account_id!==linkAccountId)throw failure('ALREADY_LINKED','This Pixel Pulse account is already connected to a different game account.');
  let accountId=existing?.account_id||linkAccountId;
  if(accountId){
    const account=(await db.query('select * from oz_identity.accounts where id=$1 for update',[accountId])).rows[0];
    if(!account||account.deleted_at)throw failure('ACCOUNT','The connected game account is unavailable.');
    if(String(account.email||'').trim().toLowerCase()!==email)throw failure('EMAIL_MISMATCH','Use the same email on Pixel Pulse and your existing game account before connecting them.');
    const other=(await db.query('select subject from oz_identity.pixel_profiles where account_id=$1',[accountId])).rows[0];
    if(other&&other.subject!==subject)throw failure('ALREADY_LINKED','This game account is already connected to another Pixel Pulse account.');
  }else{
    // A verified email is NOT sufficient proof of ownership of game progress.
    if((await db.query('select 1 from oz_identity.accounts where lower(btrim(email))=$1',[email])).rowCount)
      throw failure('LINK_REQUIRED','An existing game account uses this email. Sign in to it first, then choose CONNECT PIXEL PULSE in Account Settings to keep your progress.');
    accountId=randomUUID();
    await db.query('insert into oz_identity.accounts(id,email,created_at,email_confirmed_at) values($1,$2,now(),now())',[accountId,email]);
  }
  const nameOwner=(await db.query('select user_id from public.social_profiles where handle_key=$1',[username])).rows[0];
  if(nameOwner&&nameOwner.user_id!==accountId)throw failure('USERNAME_COLLISION','Your Pixel Pulse username belongs to another game account. No accounts were merged. Contact support to resolve the name conflict.');
  const current=(await db.query('select handle,username_changed_at from public.social_profiles where user_id=$1',[accountId])).rows[0];
  if(current&&current.handle!==username&&current.username_changed_at&&new Date(current.username_changed_at).getTime()+21*86400000>Date.now())
    throw failure('USERNAME_COOLDOWN','Your game username is still in its 21-day change period. Use that same username on Pixel Pulse, or connect after the period ends.');
  await db.query(`insert into oz_identity.pixel_profiles(subject,account_id,username,email) values($1,$2,$3,$4)
    on conflict(subject) do update set username=excluded.username,email=excluded.email,updated_at=now()`,[subject,accountId,username,email]);
  await db.query(`insert into oz_identity.account_links(provider,subject,account_id,linked_existing) values('pixelpulse',$1,$2,$3)
    on conflict(provider,subject) do update set last_seen_at=now()`,[subject,accountId,!!linkAccountId]);
  await db.query(`insert into public.social_profiles(user_id,handle,handle_key,display_name) values($1,$2,$2,$2)
    on conflict(user_id) do update set handle=excluded.handle,handle_key=excluded.handle_key,display_name=excluded.display_name`,[accountId,username]);
  return accountId;
}
export async function session(req,db){
  const raw=cookieValue(req,COOKIE);if(!raw)return null;
  db=db||await databaseReady();
  const {rows}=await db.query(`select p.*,s.expires_at from oz_identity.pixel_sessions s join oz_identity.pixel_profiles p using(subject)
    join oz_identity.accounts a on a.id=p.account_id where s.token_hash=$1 and s.expires_at>now() and a.deleted_at is null`,[hash(raw)]);
  const row=rows[0];if(!row)return null;
  return {provider:'pixel-pulse',expires_at:Math.floor(new Date(row.expires_at).getTime()/1000),
    user:{id:'pixelpulse:'+row.subject,game_user_id:row.account_id,email:row.email,email_confirmed_at:true,
      pixel_pulse:true,user_metadata:{username:row.username,preferred_username:row.username}}};
}
export async function sessionJwt(live){
  const {privateKey,publicKey}=await signingKey();
  return new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'RS256',kid:publicKey.kid,typ:'JWT'})
    .setIssuer(GAME_ISSUER).setAudience([GAME_AUDIENCE,GAME_RESOURCE_AUDIENCE]).setSubject(live.user.id).setIssuedAt()
    .setExpirationTime(Math.min(live.expires_at,Math.floor(Date.now()/1000)+120)).sign(privateKey);
}
export const sessionLifetime=SESSION_SECONDS;
