import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const online=read('js/online.js'),ui=read('js/ui.js'),index=read('../index.html');
function functionSource(source,name){
  const start=source.search(new RegExp(`function\\s+${name}\\s*\\(`));assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

let copied='',resolveCopy=()=>{};
const context=vm.createContext({
  String,Promise,
  arena:{room:'ABC123',mode:'private',phase:'room',wantsHost:true,opponent:null,status:''},
  navigator:{clipboard:{writeText(code){copied=code;return new Promise(resolve=>{resolveCopy=resolve;});}}},
  sfx(){},
});
vm.runInContext(functionSource(online,'arenaInviteCodeVisible'),context);
vm.runInContext(functionSource(online,'arenaCopyCode'),context);

assert.equal(context.arenaInviteCodeVisible(),true,'only the waiting private host needs the invite code');
assert.equal(context.arenaCopyCode(),true);assert.equal(copied,'ABC123');
context.arena.phase='lobby';context.arena.opponent={id:'confirmed'};context.arena.status='Opponent confirmed.';
resolveCopy();await Promise.resolve();await Promise.resolve();
assert.equal(context.arena.status,'Opponent confirmed.',
  'a late clipboard completion must not put the room code back after confirmation');
assert.equal(context.arenaInviteCodeVisible(),false);
assert.equal(context.arenaCopyCode(),false,'a stale Copy button must not copy after confirmation');
assert.equal(copied,'ABC123');
assert.equal(context.arena.room,'ABC123','networking must retain its internal room identifier');

context.arena={room:'PAIR99',mode:'queue',phase:'room',wantsHost:true,opponent:null,status:''};
assert.equal(context.arenaInviteCodeVisible(),false,'Quick Match must never expose its internal pair code');
context.arena={room:'ABC123',mode:'private',phase:'room',wantsHost:false,opponent:null,status:''};
assert.equal(context.arenaInviteCodeVisible(),false,'a joining guest does not need the host invite code repeated');

assert.match(ui,/const showInviteCode=typeof arenaInviteCodeVisible==='function'&&arenaInviteCodeVisible\(\)/);
assert.match(ui,/if\(showInviteCode\)\{[^}]*ctx\.fillText\(arena\.room/,
  'the large code must render only through the waiting-host predicate');
assert.match(ui,/if\(showInviteCode\) y=button\('copy','COPY ROOM CODE'/,
  'the Copy button must use the same waiting-host predicate');
assert.doesNotMatch(online,/joined room ['"]?\+?arena\.room|joined room ['"]?\+?code/,
  'confirmed status text must not include the internal code');
assert.match(online,/JOIN PRIVATE ARENA[\s\S]{0,180}ROOM CODE/,
  'the code input must remain available where a guest actually needs it');
assert.match(index,/js\/online\.js\?v=20260902-ai-cleanup-v1/);
assert.match(index,/js\/ui\.js\?v=20260902-ai-cleanup-v1/);

console.log('PASS confirmed 1v1 hides room codes while preserving invite flow');
