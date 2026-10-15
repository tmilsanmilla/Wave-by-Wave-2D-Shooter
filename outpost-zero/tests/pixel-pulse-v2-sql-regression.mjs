// Optional OFFLINE PostgreSQL 17 test. Never loads .env / DATABASE_URL or calls
// Neon/Root. Its synthetic auth.session() stands in for an ALREADY validated
// Data API context; this is NOT proof that the live Data API accepts the claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {Pool} from 'pg';
import {generateKeyPair,SignJWT,exportJWK,jwtVerify} from 'jose';
import * as oidc from 'openid-client';
import {createHash,randomUUID} from 'node:crypto';
import {PIXEL_ISSUER,CALLBACK,COOKIE,NEON_ISSUER,hash,providerConfiguration} from '../../lib/pixel-pulse.js';
import {confirmationFlow,verifyFirstBindingProof} from '../../lib/pixel-pulse-link-proof.js';
import {firstBinding,recheckNativeProof,captureNativeProof,startV2,finishV2,observeCredentialEpoch,sessionV2,sessionJwtV2,readyV2} from '../../lib/pixel-pulse-v2.js';

const socket=process.env.OUTPOST_PIXEL_TEST_SOCKET;
if(!socket){console.log('SKIP offline PostgreSQL: OUTPOST_PIXEL_TEST_SOCKET not set; no database contacted');process.exit(0);}
if(!/^\/private\/tmp\/outpost-pixel-sql\.[A-Za-z0-9]+$/.test(socket)||!fs.existsSync(socket+'/data/postmaster.pid'))throw Error('Not an owned isolated test socket');
const options={host:socket,port:55487,user:os.userInfo().username,connectionTimeoutMillis:3000};
const admin=new Pool({...options,database:'postgres'});let pool;
const P='10000000-0000-4000-8000-000000000001',A='20000000-0000-4000-8000-000000000001',
  N='30000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002';
try{
  assert.equal((await admin.query('show data_directory')).rows[0].data_directory,socket+'/data');
  if(process.env.OUTPOST_PIXEL_TEST_RESET==='1')await admin.query('drop database if exists neondb');
  for(const role of ['neondb_owner','anonymous','authenticated']){
    if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)
      await admin.query('create role '+role+(role==='neondb_owner'?' login bypassrls':''));
  }
  await admin.query('create database neondb owner neondb_owner');
  pool=new Pool({...options,database:'neondb',options:'-c role=neondb_owner'});
  await pool.query(`create schema oz_identity;create schema neon_auth;create schema auth;
    create table oz_identity.accounts(id uuid primary key,email text,created_at timestamptz default now(),email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
    create table oz_identity.account_links(provider text,subject text,account_id uuid references oz_identity.accounts(id),linked_existing boolean default false,last_seen_at timestamptz default now(),primary key(provider,subject),unique(provider,account_id));
    create table public.social_profiles(user_id uuid primary key references oz_identity.accounts(id),handle text,handle_key text unique,display_name text);
    create table public.saved_progress(user_id uuid primary key references oz_identity.accounts(id),data jsonb);
    create table neon_auth."user"(id uuid primary key,email text,"emailVerified" boolean);
    create table neon_auth.session(id text primary key,token text,"userId" uuid,"expiresAt" timestamptz);
    create table neon_auth.account(id uuid primary key,"userId" uuid,"providerId" text,"updatedAt" timestamptz);
    create function auth.session() returns jsonb language sql stable as $$select nullif(current_setting('test.validated_claims',true),'')::jsonb$$;
    create function auth.user_id() returns text language sql stable as $$select auth.session()->>'sub'$$;
    create function oz_identity.request_subject() returns text language sql stable as $$select auth.user_id()$$;
    create function oz_identity.game_user_id() returns uuid language sql stable as $$select null::uuid$$;
    grant usage on schema oz_identity,auth to authenticated;
    set neon.project_id='plain-bar-15608612';set neon.branch_id='br-dawn-butterfly-a573hk7g';`);
  // All schema fixtures and synthetic provider rows exist only in this fresh,
  // private test cluster. Production schemas and provider rows are untouched.
  await pool.query(fs.readFileSync(new URL('../../neon/migrations/002-pixel-pulse-sign-in.sql',import.meta.url),'utf8'));
  await pool.query(fs.readFileSync(new URL('../../neon/migrations/005-pixel-pulse-admission-v2.sql',import.meta.url),'utf8'));
  await readyV2(pool);
  const roleFlags=(await pool.query(`select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='oz_identity'::regnamespace and relkind in ('r','p') and relname like 'pixel_%'`)).rows;
  assert.ok(roleFlags.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  for(const table of ['pixel_link_attempts','pixel_link_redemptions','pixel_runtime_authorities']){
    const grants=(await pool.query(`select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') as allowed`,['oz_identity.'+table])).rows[0];
    assert.equal(grants.allowed,false);
  }
  await pool.query(`insert into oz_identity.accounts(id,email) values($1,'native@example.invalid'),($2,'other@example.invalid');
  `,[A,B]);
  await pool.query(`insert into oz_identity.account_links(provider,subject,account_id) values('neon',$1,$2),('neon',$3::text,$3::text::uuid)`,[N,A,B]);
  await pool.query(`insert into neon_auth."user" values($1,'native@example.invalid',true),($2,'other@example.invalid',true)`,[N,B]);
  await pool.query(`insert into public.social_profiles values($1,'native_player','native_player','native_player'),($2,'other_player','other_player','other_player')`,[A,B]);
  await pool.query(`insert into public.saved_progress values($1,'{"gems":987,"wins":42,"role":"creator","weapons":["scar-h"]}')`,[A]);
  const before=(await pool.query('select row_to_json(p) as original from public.saved_progress p where user_id=$1',[A])).rows[0].original;
  const nativeToken='offline-native-session-token-only';
  await pool.query(`insert into neon_auth.session values('offline-session',$1,$2,now()+interval '5 minutes')`,[nativeToken,N]);
  await pool.query(`insert into neon_auth.account values($1,$2,'credential','2026-01-01T00:00:00Z')`,[randomUUID(),N]);
  const clock=(await pool.query('select max("updatedAt")::text as clock from neon_auth.account where "userId"=$1',[N])).rows[0].clock;
  const nativeProof={accountId:A,subject:N,sessionId:'offline-session',sessionHash:hash(nativeToken),credentialClock:clock,until:Date.now()+120000};
  await recheckNativeProof(nativeProof,pool);
  await assert.rejects(recheckNativeProof({...nativeProof,sessionHash:'0'.repeat(64)},pool));
  const pair=await generateKeyPair('EdDSA');
  async function prove(subject,mode,nativeProof,name,email,jti=randomUUID()){
    const attempt={phase:'confirm',mode,nativeProof,expectedSubject:subject,expectedEpoch:0,expectedProfile:0,state:'s'.repeat(43),nonce:'n'.repeat(43),verifier:'v'.repeat(43)};
    const profile={subject,username:name,email,emailVerified:true,credentialVersion:0,profileVersion:0},flow=confirmationFlow(attempt),time=Math.floor(Date.now()/1000),digest=s=>createHash('sha256').update(s).digest('hex');
    const token=await new SignJWT({iss:PIXEL_ISSUER,aud:'outpost-zero',sub:subject,iat:time,exp:time+29,auth_time:time,jti,
      purpose:'pixel-pulse-fresh-link',link_proof_version:1,intent:'link',amr:['pwd'],credential_version:0,flow_hash:digest(JSON.stringify(flow)),
      oauth_state_hash:digest(attempt.state),oauth_nonce_hash:digest(attempt.nonce),pkce_challenge:flow.code_challenge,redirect_uri:CALLBACK,authorization_code_hash:digest('offline-code')})
      .setProtectedHeader({alg:'EdDSA'}).sign(pair.privateKey);
    return {attempt,profile,proof:await verifyFirstBindingProof(token,attempt,profile,'offline-code',()=>pair.publicKey)};
  }
  async function bind(input){
    const db=await pool.connect();try{await db.query('begin');const id=await firstBinding(db,input.attempt,input.profile,input.proof);await db.query('commit');return id;}
    catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  process.env.PIXEL_PULSE_GAME_PROTOCOL='v2';process.env.PIXEL_PULSE_FRESH_LINK_ENABLED='true';
  const native=await prove(P,'native',nativeProof,'shared_native','native@example.invalid');
  assert.equal(await bind(native),A);
  assert.deepEqual((await pool.query('select row_to_json(p) as original from public.saved_progress p where user_id=$1',[A])).rows[0].original,before);
  await assert.rejects(bind(native));
  const create=await prove('10000000-0000-4000-8000-000000000002','create',null,'new_shared','new@example.invalid');
  const createdId=await bind(create);assert.notEqual(createdId,A);assert.notEqual(createdId,B);
  await assert.rejects(bind(await prove('10000000-0000-4000-8000-000000000003','create',null,'different_name','other@example.invalid')),{code:'LINK_REQUIRED'});
  await assert.rejects(bind(await prove('10000000-0000-4000-8000-000000000004','create',null,'other_player','different@example.invalid')),{code:'LINK_REQUIRED'});
  const count=Number((await pool.query('select count(*) as n from oz_identity.accounts')).rows[0].n);
  await pool.query(`create function public.fail_offline_projection() returns trigger language plpgsql as $$begin if new.handle='rollback_name' then raise exception 'OFFLINE_PROJECTION_FAILURE';end if;return new;end$$;
    create trigger offline_projection_failure before insert or update on public.social_profiles for each row execute function public.fail_offline_projection();`);
  const failing=await prove('10000000-0000-4000-8000-000000000005','create',null,'rollback_name','rollback@example.invalid');
  await assert.rejects(bind(failing),/OFFLINE_PROJECTION_FAILURE/);
  assert.equal(Number((await pool.query('select count(*) as n from oz_identity.accounts')).rows[0].n),count);
  assert.equal((await pool.query('select 1 from oz_identity.pixel_link_redemptions where jti=$1',[failing.proof.jti])).rowCount,0);
  await assert.rejects(pool.query('insert into oz_identity.pixel_link_redemptions(jti,subject,account_id,expires_at) values($1,$2,$3,now())',[native.proof.jti,P,A]),{code:'23505'});
  // Real guard execution under the browser database role, with only the local
  // validated-claims stand-in supplying payloads. No signed live Neon admission.
  async function admit(claims){
    const db=await pool.connect();try{await db.query('begin');await db.query('select set_config($1,$2,true)',['test.validated_claims',JSON.stringify(claims)]);
      await db.query('set local role authenticated');const row=(await db.query('select oz_identity.game_user_id() as id')).rows[0];await db.query('rollback');return row.id;
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  assert.equal(await admit({sub:N,role:'authenticated',credential_version:0}),null,'epoch zero native token cannot regain linked account');
  assert.equal(await admit({sub:B,role:'authenticated'}),B,'unlinked native account is unchanged');
  await assert.rejects(pool.query("update oz_identity.account_links set last_seen_at=now() where provider='neon' and subject=$1",[N]),/SIGN_IN_WITH_PIXEL_PULSE/);
  const raw='r'.repeat(43),sid=hash(raw),until=new Date(Date.now()+15000);
  await pool.query(`insert into oz_identity.pixel_runtime_authorities values($1,$2,0,0,$3,false)`,[P,A,until]);
  await pool.query(`insert into oz_identity.pixel_sessions(token_hash,subject,credential_version,upstream_until,expires_at) values($1,$2,0,now()+interval '4 minutes',now()+interval '4 minutes')`,[sid,P]);
  const jwtClaims={iss:'https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse',sub:'pixelpulse:'+P,
    aud:['https://ep-fragrant-salad-a577vui2.neonauth.us-east-2.aws.neon.tech','outpost-zero-pixel-pulse'],role:'authenticated',outpost_session:sid,credential_version:0};
  assert.equal(await admit(jwtClaims),A);
  for(const mutation of [{iss:undefined},{role:undefined},{outpost_session:undefined},{credential_version:'0'},
    {credential_version:1},{aud:'outpost-zero-pixel-pulse'},{outpost_session:'0'.repeat(64)}])assert.equal(await admit({...jwtClaims,...mutation}),null);
  const live=await sessionV2({headers:{cookie:COOKIE+'='+raw}},pool,null);assert.equal(live.user.game_user_id,A);
  assert.equal(JSON.stringify(live).includes(sid),false,'private session admission is not browser session JSON');
  const rsa=await generateKeyPair('RS256',{extractable:true});process.env.PIXEL_PULSE_GAME_SIGNING_KEY=JSON.stringify({...await exportJWK(rsa.privateKey),kid:'offline-bff'});
  const token=await sessionJwtV2(live),verified=await jwtVerify(token,rsa.publicKey);
  assert.equal(verified.payload.outpost_session,sid);assert.equal(verified.payload.credential_version,0);
  assert.ok(verified.payload.exp*1000<=until.getTime());
  await observeCredentialEpoch(pool,{subject:P,credentialVersion:1,profileVersion:1,emailVerified:false});
  await assert.rejects(pool.query("update public.social_profiles set handle_key='other_player' where user_id=$1",[A]),{code:'23505'});
  const authority=(await pool.query('select * from oz_identity.pixel_runtime_authorities where subject=$1',[P])).rows[0];
  assert.equal(Number(authority.credential_version),1);assert.equal(authority.disabled,true);
  assert.equal(await admit(jwtClaims),null);assert.equal(await admit({...jwtClaims,credential_version:1}),null);
  await assert.rejects(sessionV2({headers:{cookie:COOKIE+'='+raw}},pool,null),{code:'PIXEL_SESSION_EXPIRED'});
  assert.deepEqual((await pool.query('select row_to_json(p) as original from public.saved_progress p where user_id=$1',[A])).rows[0].original,before);
  // Entire discovery -> confirmation -> application SQL flow, but exclusively
  // locally signed OIDC/proof responses: NO real managed/provider connection.
  const jwk={...await exportJWK(pair.publicKey),kid:'offline-flow',alg:'EdDSA',use:'sig'};
  const config=providerConfiguration({issuer:PIXEL_ISSUER,authorization_endpoint:PIXEL_ISSUER+'/oauth2/authorize',
    token_endpoint:PIXEL_ISSUER+'/oauth2/token',userinfo_endpoint:PIXEL_ISSUER+'/oauth2/userinfo',jwks_uri:PIXEL_ISSUER+'/jwks',
    authorization_response_iss_parameter_supported:true,id_token_signing_alg_values_supported:['EdDSA']});
  let active,identity,tokenCalls=0,redemptions=0;
  config[oidc.customFetch]=async(url,options)=>{
    if(String(url).endsWith('/jwks'))return Response.json({keys:[jwk]});
    if(String(url).endsWith('/token')){
      tokenCalls++;const request=new URLSearchParams(options.body);assert.equal(request.get('code_verifier'),active.verifier);
      const id=await new SignJWT({...identity,nonce:active.nonce}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid})
        .setIssuer(PIXEL_ISSUER).setAudience('outpost-zero').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
      return Response.json({id_token:id,access_token:'offline-access-only',token_type:'Bearer',expires_in:300});
    }
    if(String(url).endsWith('/userinfo'))return Response.json(identity);
    throw Error('Unexpected external request in offline test');
  };
  const browserCookie=result=>({headers:{cookie:result.cookie.split(';')[0]}});
  const loadAttempt=async result=>(await pool.query('select context from oz_identity.pixel_link_attempts where state_hash=$1',[hash(new URL(result.url).searchParams.get('state'))])).rows[0].context;
  const callback=attempt=>new URL(CALLBACK+'?'+new URLSearchParams({state:attempt.state,iss:PIXEL_ISSUER,code:'offline-flow-code',...(attempt.phase==='confirm'?{pixel_link_ticket:'t'.repeat(43)}:{})}));
  async function redeem(ticket,attempt,exchange){
    redemptions++;assert.equal(ticket,'t'.repeat(43));assert.equal(exchange.profile.subject,attempt.expectedSubject);
    const flow=confirmationFlow(attempt),time=Math.floor(Date.now()/1000),digest=s=>createHash('sha256').update(s).digest('hex');
    const signed=await new SignJWT({iss:PIXEL_ISSUER,aud:'outpost-zero',sub:exchange.profile.subject,iat:time,exp:time+29,auth_time:time,jti:randomUUID(),
      purpose:'pixel-pulse-fresh-link',link_proof_version:1,intent:'link',amr:['pwd'],credential_version:exchange.profile.credentialVersion,
      flow_hash:digest(JSON.stringify(flow)),oauth_state_hash:digest(attempt.state),oauth_nonce_hash:digest(attempt.nonce),
      pkce_challenge:flow.code_challenge,redirect_uri:CALLBACK,authorization_code_hash:digest(exchange.code)})
      .setProtectedHeader({alg:'EdDSA'}).sign(pair.privateKey);
    return verifyFirstBindingProof(signed,attempt,exchange.profile,exchange.code,()=>pair.publicKey);
  }
  identity={sub:'10000000-0000-4000-8000-000000000010',preferred_username:'full_offline_create',email:'flow@example.invalid',email_verified:true,credential_version:0,profile_version:0};
  const first=await startV2({intent:'create'},pool,config);active=await loadAttempt(first);
  const second=await finishV2(callback(active),browserCookie(first),pool,config,{redeem});
  assert.equal(redemptions,0);assert.equal(second.redirect,true);
  const discovered=active;active=await loadAttempt(second);
  assert.equal(active.expectedSubject,identity.sub);assert.equal(active.mode,'create');assert.equal(active.phase,'confirm');
  assert.notEqual(active.state,discovered.state);assert.notEqual(active.nonce,discovered.nonce);assert.notEqual(active.verifier,discovered.verifier);
  assert.equal(new URL(second.url).searchParams.get('pixel_intent'),'link');
  assert.equal((await pool.query('select 1 from oz_identity.pixel_profiles where subject=$1',[identity.sub])).rowCount,0,'discovery is not a binding');
  const completed=await finishV2(callback(active),browserCookie(second),pool,config,{redeem});assert.equal(redemptions,1);
  assert.ok(completed.url.endsWith('/?pixel_connected=1'));
  await assert.rejects(finishV2(callback(active),browserCookie(second),pool,config,{redeem}));assert.equal(redemptions,1);
  // Known immutable binding uses ordinary Continue even with first binding OFF.
  process.env.PIXEL_PULSE_FRESH_LINK_ENABLED='false';
  const returning=await startV2({intent:'continue'},pool,config);active=await loadAttempt(returning);
  const returned=await finishV2(callback(active),browserCookie(returning),pool,config,{redeem});
  assert.equal(returned.redirect,undefined);assert.equal(redemptions,1);
  const returnedRequest={headers:{cookie:returned.cookies[0].split(';')[0]}};
  await pool.query("update oz_identity.pixel_runtime_authorities set checked_until=now()-interval '1 second' where subject=$1",[identity.sub]);
  const refreshedSession=await sessionV2(returnedRequest,pool,config);assert.equal(refreshedSession.user.id,'pixelpulse:'+identity.sub);
  const priorJwt=(await jwtVerify(await sessionJwtV2(refreshedSession),rsa.publicKey)).payload;
  assert.equal(await admit(priorJwt),refreshedSession.user.game_user_id);
  await pool.query("update oz_identity.pixel_runtime_authorities set checked_until=now()-interval '1 second' where subject=$1",[identity.sub]);
  identity={...identity,credential_version:1,profile_version:1,email_verified:false,preferred_username:'invalid profile'};
  await assert.rejects(sessionV2(returnedRequest,pool,config),{code:'PIXEL_SESSION_EXPIRED'});
  assert.equal(await admit(priorJwt),null,'current upstream epoch retires the prior Data API admission');
  const retiredAuthority=(await pool.query('select credential_version,disabled from oz_identity.pixel_runtime_authorities where subject=$1',[identity.sub])).rows[0];
  assert.equal(Number(retiredAuthority.credential_version),1);assert.equal(retiredAuthority.disabled,true);
  process.env.PIXEL_PULSE_FRESH_LINK_ENABLED='true';
  const C='20000000-0000-4000-8000-000000000020',N2='30000000-0000-4000-8000-000000000020';
  await pool.query("insert into oz_identity.accounts(id,email) values($1,'native-flow@example.invalid')",[C]);
  await pool.query("insert into oz_identity.account_links(provider,subject,account_id) values('neon',$1,$2)",[N2,C]);
  await pool.query("insert into neon_auth.\"user\" values($1,'native-flow@example.invalid',true)",[N2]);
  await pool.query("insert into neon_auth.session values('offline-native-flow',$1,$2,now()+interval '5 minutes')",[nativeToken,N2]);
  await pool.query("insert into neon_auth.account values($1,$2,'credential','2026-01-01T00:00:00Z')",[randomUUID(),N2]);
  await pool.query("insert into public.saved_progress values($1,'{\"gems\":123,\"wins\":7,\"role\":\"main\"}')",[C]);
  const beforeC=(await pool.query('select data from public.saved_progress where user_id=$1',[C])).rows[0].data;
  identity={...identity,sub:'10000000-0000-4000-8000-000000000020',preferred_username:'full_offline_native',email:'native-flow@example.invalid',email_verified:true,credential_version:0,profile_version:0};
  const nativePair=await generateKeyPair('RS256'),nativeOrigin=new URL(NEON_ISSUER).origin;
  const signedNative=await new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'RS256'}).setIssuer(nativeOrigin)
    .setAudience(nativeOrigin).setSubject(N2).setIssuedAt().setExpirationTime('5m').sign(nativePair.privateKey);
  const nativeStart=await startV2({intent:'link',link_token:signedNative,native_session_token:nativeToken},pool,config,
    {ownership:(token,opaque,db)=>captureNativeProof(token,opaque,db,()=>nativePair.publicKey)});
  active=await loadAttempt(nativeStart);assert.equal(active.mode,'native');
  const nativeSecond=await finishV2(callback(active),browserCookie(nativeStart),pool,config,{redeem});active=await loadAttempt(nativeSecond);
  assert.equal(active.expectedSubject,identity.sub);assert.equal(active.nativeProof.accountId,C);
  const tokenCallsBefore=tokenCalls;
  await pool.query("update neon_auth.account set \"updatedAt\"=now() where \"userId\"=$1",[N2]);
  await assert.rejects(finishV2(callback(active),browserCookie(nativeSecond),pool,config,{redeem}),{code:'LINK_ACCOUNT_CHANGED'});
  assert.equal(tokenCalls,tokenCallsBefore,'changed native credential is rejected before central exchange');
  assert.equal((await pool.query('select 1 from oz_identity.pixel_profiles where account_id=$1',[C])).rowCount,0);
  const restart=await startV2({intent:'link',link_token:signedNative,native_session_token:nativeToken},pool,config,
    {ownership:(token,opaque,db)=>captureNativeProof(token,opaque,db,()=>nativePair.publicKey)});
  active=await loadAttempt(restart);
  const restartConfirmed=await finishV2(callback(active),browserCookie(restart),pool,config,{redeem});active=await loadAttempt(restartConfirmed);
  await finishV2(callback(active),browserCookie(restartConfirmed),pool,config,{redeem});
  assert.equal((await pool.query('select account_id from oz_identity.pixel_profiles where subject=$1',[identity.sub])).rows[0].account_id,C);
  assert.deepEqual((await pool.query('select data from public.saved_progress where user_id=$1',[C])).rows[0].data,beforeC);
  assert.equal(redemptions,2,'both first Create and first native adoption use separate current-password proofs');
  identity={...identity,sub:'10000000-0000-4000-8000-000000000030',preferred_username:'actor_switch',email:'actor-switch@example.invalid'};
  const switchStart=await startV2({intent:'create'},pool,config);active=await loadAttempt(switchStart);
  const switchConfirm=await finishV2(callback(active),browserCookie(switchStart),pool,config,{redeem});active=await loadAttempt(switchConfirm);
  identity={...identity,sub:'10000000-0000-4000-8000-000000000031'};
  await assert.rejects(finishV2(callback(active),browserCookie(switchConfirm),pool,config,{redeem}),{code:'LINK_ACCOUNT_CHANGED'});
  assert.equal(redemptions,2);assert.equal((await pool.query('select 1 from oz_identity.pixel_profiles where subject=$1',[identity.sub])).rowCount,0);
  console.log('PASS isolated PostgreSQL: pending005 executes; forced RLS/private grants; original-UUID binding and progress preserved; replay/collision/partial-write rollback; epoch-zero native retirement; validated-claim/session/epoch guards; revocation survives projection failure. NOT a live managed/Data API positive.');
}finally{if(pool)await pool.end();await admin.end();}
