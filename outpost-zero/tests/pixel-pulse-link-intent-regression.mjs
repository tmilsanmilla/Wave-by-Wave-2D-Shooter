import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/pixel-pulse-auth.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../../api/pixel-pulse.js',import.meta.url),'utf8');
assert.ok(!/prompt\s*:\s*['"]login['"]/.test(server),'returning central cookies must not force password re-entry');
assert.match(server,/assertNativeLinkTarget\(intent,linkAccountId\)/,'Link cannot silently become Create without native target ownership');
assert.match(server,/error\.code==='LINK_REQUIRED'\?'&pixel=link'/);
const authorize='https://pixel-pulse-websites.vercel.app/api/sso/oauth2/authorize?state=fixture';
function fixture(intent=''){
  const elements=new Map(),posts=[],redirects=[];
  const $=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,disabled:false,textContent:'',style:{},focus(){this.focused=true;}});return elements.get(id);};
  let tokenResolve;
  const context=vm.createContext({URL,Promise,Date,String,Object,Error,$,recovering:false,authUser:null,
    usernameClaimOpen:false,accountSettingsOpen:false,window:{open(){}},
    location:{href:'https://wave-by-wave-2-d-shooter.vercel.app/'+(intent?'?pixel='+intent:''),assign(url){redirects.push(url);}},
    history:{replaceState(a,b,url){context.location.href=url;}},
    sb:{auth:{async getJWTToken(){return 'native-owned-proof';}},pixelPulse:{async request(action,method,body){
      if(action==='status')return {enabled:true};if(action==='start'){posts.push(body);return {url:authorize};}throw new Error('Unexpected route');
    }}}
  });
  vm.runInContext(source,context);
  return {context,$,posts,redirects,run:code=>vm.runInContext(code,context),delayToken(){context.sb.auth.getJWTToken=()=>new Promise(resolve=>{tokenResolve=resolve;});},resolveToken(){tokenResolve('native-owned-proof');}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
{
  const f=fixture('link');await f.context.setupPixelPulseUi();
  assert.equal(f.posts.length,0,'guest Link waits for native proof');
  assert.equal(f.$('authwrap').style.display,'flex');assert.equal(f.$('aup').hidden,true);
  assert.match(f.$('apixelintent').textContent,/HIGHLY RECOMMENDED/);
  assert.ok(!f.context.location.href.includes('pixel='),'non-secret launch intent is consumed');
  f.context.authUser={id:'owned-game',pixel_pulse:false};f.context.pixelPulseAuthChanged();await flush();
  assert.equal(f.posts.length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.posts[0])),{link_token:'native-owned-proof',intent:'link'});
  assert.equal(f.redirects[0],authorize);assert.equal(f.$('usernameclaimpixel').hidden,false);
}
{
  const f=fixture('link');await f.context.setupPixelPulseUi();f.context.pixelPulseCancelLink();
  f.context.authUser={id:'unrelated-login'};f.context.pixelPulseAuthChanged();await flush();
  assert.equal(f.posts.length,0,'Cancel must not link a subsequent login');assert.equal(f.$('aup').hidden,false);
}
{
  const f=fixture('create');await f.context.setupPixelPulseUi();
  assert.equal(f.posts[0].intent,'create');assert.equal(f.posts[0].link_token,'');assert.equal(f.redirects.length,1);
}
{
  const f=fixture('create');f.context.authUser={id:'owned-game'};await f.context.setupPixelPulseUi();
  assert.equal(f.posts[0].intent,'link','Create from an existing native game session preserves that account');
  assert.equal(f.posts[0].link_token,'native-owned-proof');
}
{
  const f=fixture();await f.context.setupPixelPulseUi();await f.$('apixellink').onclick();await f.$('apixel').onclick();
  assert.equal(f.posts.length,0,'Continue during pending Link must not bypass proof');
}
{
  const f=fixture();f.context.authUser={id:'old-game'};f.delayToken();
  const task=f.context.pixelPulseStart('link');await flush();f.context.authUser={id:'new-game'};f.resolveToken();
  assert.equal(await task,false);assert.equal(f.posts.length,0);assert.match(f.$('authmsg').textContent,/account changed/);
}
{
  const f=fixture();f.context.authUser={id:'owned-game'};f.delayToken();
  const task=f.context.pixelPulseStart('link');await flush();f.context.pixelPulseCancelLink();f.resolveToken();
  assert.equal(await task,false);assert.equal(f.posts.length,0,'Cancel while proof is pending prevents redirect');
}
{
  const f=fixture();f.context.authUser={id:'old-game'};let response;
  f.context.sb.pixelPulse.request=()=>new Promise(resolve=>{response=resolve;});
  const task=f.context.pixelPulseStart('link');await flush();f.context.authUser={id:'new-game'};response({url:authorize});
  assert.equal(await task,false);assert.equal(f.redirects.length,0,'account switch during start must not navigate');
}
{
  const f=fixture();f.context.authUser={id:'owned-game'};f.delayToken();
  const task=f.context.pixelPulseStart('link');assert.equal(await f.context.pixelPulseStart('link'),false);
  f.resolveToken();await task;assert.equal(f.posts.length,1,'rapid repeated clicks create one attempt');
}
console.log('PASS cookie reuse, hub Link/Create intents, recommendation, native proof gating, cancel, account-change rejection and duplicate-click guard');
{
  const f=fixture();f.run('pixelPulseProtocol=2');
  f.context.authUser={id:'preserved-original-game-uuid',neon_auth_id:'actual-managed-native-uuid'};
  f.context.sb.auth.getBetterAuthInstance=()=>({getSession:async options=>{
    assert.equal(options.query.disableCookieCache,true);
    return {data:{user:{id:'actual-managed-native-uuid'},session:{token:'offline-opaque-native-session'}}};
  }});
  assert.equal(await f.context.pixelPulseStart('link'),true);
  assert.equal(f.posts.length,1);assert.equal(f.posts[0].native_session_token,'offline-opaque-native-session');
  assert.equal(f.posts[0].intent,'link');assert.equal(f.redirects.length,1);
}
{
  const f=fixture();f.run('pixelPulseProtocol=2');f.context.authUser={id:'preserved-game',neon_auth_id:'managed-native'};
  f.context.sb.auth.getBetterAuthInstance=()=>({getSession:async()=>({data:{user:{id:'preserved-game'},session:{token:'wrong-actor'}}})});
  assert.equal(await f.context.pixelPulseStart('link'),false);assert.equal(f.posts.length,0);
  assert.match(f.$('authmsg').textContent,/Sign in/);
}
{
  const f=fixture();f.run('pixelPulseProtocol=2');f.context.authUser={id:'same-game',neon_auth_id:'old-native'};
  let session;
  f.context.sb.auth.getBetterAuthInstance=()=>({getSession:()=>new Promise(resolve=>{session=resolve;})});
  const task=f.context.pixelPulseStart('link');await flush();
  f.context.authUser={id:'same-game',neon_auth_id:'different-native'};
  session({data:{user:{id:'old-native'},session:{token:'offline-opaque-native-session'}}});
  assert.equal(await task,false);assert.equal(f.posts.length,0);assert.equal(f.redirects.length,0);
  assert.equal(f.$('apixel').disabled,false);assert.match(f.$('authmsg').textContent,/account changed/);
}
console.log('PASS v2 migrated original-game/native UUID mapping, current uncached native proof and account-switch race');
