// Offline, synthetic cryptographic fixtures only. No provider, real user,
// credentials, verification emails, network calls or database connections.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {PIXEL_ISSUER,CALLBACK,NEON_ISSUER,providerConfiguration} from '../../lib/pixel-pulse.js';
import {confirmationFlow,verifyFirstBindingProof,assertFirstBindingProof,redeemFirstBindingProof} from '../../lib/pixel-pulse-link-proof.js';
import {versionedIdentity,observedIdentity,validatedProfile,captureNativeProof,recheckNativeProof,startV2,callbackState,observeCredentialEpoch} from '../../lib/pixel-pulse-v2.js';

const subject='10000000-0000-4000-8000-000000000001',account='20000000-0000-4000-8000-000000000001';
const profile={subject,username:'offline_player',email:'offline@example.invalid',emailVerified:true,credentialVersion:0,profileVersion:2};
const attempt={state:'s'.repeat(43),nonce:'n'.repeat(43),verifier:'v'.repeat(43),phase:'confirm',mode:'create',
  nativeProof:null,expectedSubject:subject,expectedEpoch:0,expectedProfile:2};
const code='offline-authorization-code',hash=value=>createHash('sha256').update(value).digest('hex');
const pair=await generateKeyPair('EdDSA'),resolve=()=>pair.publicKey;
const claims={iss:PIXEL_ISSUER,aud:'outpost-zero',sub:subject,preferred_username:profile.username,email:profile.email,
  email_verified:true,credential_version:0,profile_version:2};
function proofClaims(){
  const time=Math.floor(Date.now()/1000),flow=confirmationFlow(attempt);
  return {iss:PIXEL_ISSUER,aud:'outpost-zero',sub:subject,iat:time,exp:time+25,auth_time:time,jti:randomUUID(),
    purpose:'pixel-pulse-fresh-link',link_proof_version:1,intent:'link',amr:['pwd'],credential_version:0,
    flow_hash:hash(JSON.stringify(flow)),oauth_state_hash:hash(attempt.state),oauth_nonce_hash:hash(attempt.nonce),
    pkce_challenge:flow.code_challenge,redirect_uri:CALLBACK,authorization_code_hash:hash(code)};
}
const sign=(changes={})=>new SignJWT({...proofClaims(),...changes}).setProtectedHeader({alg:'EdDSA',kid:'offline-only'}).sign(pair.privateKey);

test('frozen v1 order, signed current-password proof and sealed target branding',async()=>{
  assert.deepEqual(Object.keys(confirmationFlow(attempt)),['client_id','redirect_uri','response_type','scope','state','nonce','code_challenge','code_challenge_method','pixel_intent']);
  const proof=await verifyFirstBindingProof(await sign(),attempt,profile,code,resolve);
  assertFirstBindingProof(proof,attempt,profile);
  assert.throws(()=>assertFirstBindingProof({...proof},attempt,profile));
  assert.throws(()=>assertFirstBindingProof(proof,{...attempt,mode:'native',nativeProof:{accountId:account}},profile));
  assert.throws(()=>assertFirstBindingProof(proof,attempt,{...profile,credentialVersion:1}));
});
for(const [name,changes] of Object.entries({
  issuer:{iss:'https://wrong.invalid'},arrayAudience:{aud:['outpost-zero']},audience:{aud:'another-game'},
  actor:{sub:account},purpose:{purpose:'management'},version:{link_proof_version:2},intent:{intent:'create'},
  cookieOnly:{amr:['cookie']},mixedMethods:{amr:['pwd','cookie']},epoch:{credential_version:1},
  missingEpoch:{credential_version:undefined},state:{oauth_state_hash:'0'.repeat(64)},nonce:{oauth_nonce_hash:'0'.repeat(64)},
  code:{authorization_code_hash:'0'.repeat(64)},flow:{flow_hash:'0'.repeat(64)},pkce:{pkce_challenge:'wrong'},
  redirect:{redirect_uri:'https://wrong.invalid/callback'},jti:{jti:subject.replace('-4000-','-1000-')},
  oldPassword:{auth_time:Math.floor(Date.now()/1000)-91},futurePassword:{auth_time:Math.floor(Date.now()/1000)+60},
  futureIssue:{iat:Math.floor(Date.now()/1000)+60},longProof:{exp:Math.floor(Date.now()/1000)+60},
  fractionalClock:{auth_time:Math.floor(Date.now()/1000)-0.5},expired:{exp:1}
}))test('proof rejects '+name,async()=>assert.rejects(verifyFirstBindingProof(await sign(changes),attempt,profile,code,resolve)));
test('Create and native Link both require the intended actor and genuinely verified email',async()=>{
  const token=await sign();
  for(const changed of [{expectedSubject:account},{expectedEpoch:1},{phase:'discover'},{mode:'continue'},
    {mode:'native',nativeProof:null}])await assert.rejects(verifyFirstBindingProof(token,{...attempt,...changed},profile,code,resolve));
  await assert.rejects(verifyFirstBindingProof(token,attempt,{...profile,emailVerified:false},code,resolve));
  await assert.rejects(verifyFirstBindingProof(token,attempt,profile,'different-code',resolve));
});
test('redemption is server-only and uses the actual code, PKCE and original flow',async()=>{
  let calls=0;
  const proof=await redeemFirstBindingProof('t'.repeat(43),attempt,{profile,idToken:'offline-id-token',code},async(url,options)=>{
    calls++;assert.equal(url,PIXEL_ISSUER+'/pixel-pulse/redeem-link');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Origin,undefined);
    const body=JSON.parse(options.body);assert.equal(body.codeVerifier,attempt.verifier);assert.equal(body.code,code);
    assert.deepEqual(body.flow,confirmationFlow(attempt));return Response.json({proof:await sign()});
  },resolve);
  assertFirstBindingProof(proof,attempt,profile);assert.equal(calls,1);
  await assert.rejects(redeemFirstBindingProof(null,attempt,{profile,idToken:'offline',code},()=>{throw Error('Must not call');},resolve));
});
test('current UserInfo epoch is observed before rejecting stale or invalid profile projection',()=>{
  assert.equal(versionedIdentity(claims,claims).credentialVersion,0);
  assert.equal(validatedProfile(claims,claims).username,profile.username);
  const info={...claims,credential_version:1,profile_version:3,email_verified:false,preferred_username:'invalid name'};
  const observed=observedIdentity(claims,info);assert.equal(observed.credentialVersion,1);assert.equal(observed.emailVerified,false);
  assert.throws(()=>versionedIdentity(claims,info));assert.throws(()=>validatedProfile(claims,info));
  assert.throws(()=>observedIdentity({...claims,aud:['outpost-zero']},info));
  assert.throws(()=>observedIdentity(claims,{...info,sub:account}));
});
test('epoch retirement has an independent transaction, before later profile work',async()=>{
  const statements=[];let released=false;
  const db={async query(sql,args){statements.push({sql,args});return {rows:[]};},release(){released=true;}};
  await observeCredentialEpoch({connect:async()=>db},{subject,credentialVersion:3,profileVersion:9,emailVerified:false});
  assert.equal(statements[0].sql,'begin');assert.equal(statements.at(-1).sql,'commit');assert.ok(released);
  assert.match(statements[1].sql,/greatest\(credential_version,\$2\)/);assert.match(statements[1].sql,/disabled=true/);
  assert.match(statements[2].sql,/delete from oz_identity.pixel_sessions/);
  assert.ok(statements.every(s=>!s.sql.includes('social_profiles')));
});
test('native ownership requires a real signed subject AND independent live opaque session',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256'),origin=new URL(NEON_ISSUER).origin;
  const token=await new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'RS256'}).setIssuer(origin).setAudience(origin)
    .setSubject(account).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const secret='offline-native-session-only',calls=[];
  const db={async query(sql,args){calls.push({sql,args});return {rows:[{account_id:account,session_id:'offline-session-id',credential_clock:'2026-01-01 00:00:00+00'}]};}};
  const proof=await captureNativeProof(token,secret,db,()=>publicKey);
  assert.equal(proof.accountId,account);assert.equal(proof.sessionHash,hash(secret));assert.ok(!JSON.stringify(proof).includes(secret));
  assert.match(calls[0].sql,/s\.token=\$2/);assert.match(calls[0].sql,/emailVerified/);assert.equal(calls[0].args[1],secret);
  await assert.rejects(captureNativeProof(token,'',db,()=>publicKey));
  await assert.rejects(captureNativeProof(token,secret,{query:async()=>({rows:[]})},()=>publicKey));
  await recheckNativeProof(proof,db);assert.match(calls[1].sql,/sha256\(convert_to\(s\.token/);
  await assert.rejects(recheckNativeProof({...proof,until:1},db));
  await assert.rejects(recheckNativeProof(proof,{query:async()=>({rows:[]})}));
});
test('new protocol and first bindings default off; discovery cannot silently create',async()=>{
  delete process.env.PIXEL_PULSE_GAME_PROTOCOL;delete process.env.PIXEL_PULSE_FRESH_LINK_ENABLED;
  const configuration=providerConfiguration({issuer:PIXEL_ISSUER,authorization_endpoint:PIXEL_ISSUER+'/oauth2/authorize',
    token_endpoint:PIXEL_ISSUER+'/oauth2/token',userinfo_endpoint:PIXEL_ISSUER+'/oauth2/userinfo',jwks_uri:PIXEL_ISSUER+'/jwks',
    authorization_response_iss_parameter_supported:true,id_token_signing_alg_values_supported:['EdDSA']});
  const calls=[],db={async query(sql,args){calls.push({sql,args});return {rows:[]};}};
  await assert.rejects(startV2({intent:'create'},db,configuration),{code:'LINK_CONFIRMATION_PENDING'});
  await assert.rejects(startV2({intent:'link'},db,configuration),{code:'LINK_CONFIRMATION_PENDING'});
  assert.equal(calls.length,0);
  const result=await startV2({intent:'continue'},db,configuration),url=new URL(result.url);
  assert.equal(url.origin,new URL(PIXEL_ISSUER).origin);assert.equal(url.searchParams.has('pixel_intent'),false);
  const stored=JSON.parse(calls[1].args[2]);assert.equal(stored.phase,'discover');assert.equal(stored.mode,'continue');
  assert.ok(calls.every(c=>!c.sql.includes('oz_identity.accounts')));
});
test('callbacks reject duplicates, wrong issuer, errors and missing browser binding',()=>{
  const good=new URL(CALLBACK+'?'+new URLSearchParams({iss:PIXEL_ISSUER,state:attempt.state,code}));
  assert.equal(callbackState(good,'b'.repeat(43)),attempt.state);
  for(const field of ['iss','state','code','pixel_link_ticket']){
    const bad=new URL(good);bad.searchParams.append(field,'extra');if(field==='pixel_link_ticket')bad.searchParams.append(field,'again');
    assert.throws(()=>callbackState(bad,'b'.repeat(43)));
  }
  const bad=new URL(good);bad.searchParams.set('error','access_denied');assert.throws(()=>callbackState(bad,'b'.repeat(43)));
  assert.throws(()=>callbackState(good,null));
});
test('pending SQL reads validated claims and binds native retirement to real mappings even at epoch zero',()=>{
  const sql=fs.readFileSync(new URL('../../neon/migrations/005-pixel-pulse-admission-v2.sql',import.meta.url),'utf8');
  assert.match(sql,/execute 'select auth\.session\(\)' into claims/);
  assert.doesNotMatch(sql,/current_setting\('request\.jwt/);
  assert.match(sql,/not exists\(select 1 from oz_identity\.pixel_profiles p where p\.account_id=l\.account_id\)/);
  assert.match(sql,/s\.token_hash=claims->>'outpost_session'/);
  assert.match(sql,/s\.credential_version=r\.credential_version/);assert.match(sql,/r\.checked_until>statement_timestamp\(\)/);
  assert.match(sql,/create trigger pixel_native_mapping_guard before insert or update/);
  assert.doesNotMatch(sql,/alter (table|function|schema) (neon_auth|auth)\./i);
});
