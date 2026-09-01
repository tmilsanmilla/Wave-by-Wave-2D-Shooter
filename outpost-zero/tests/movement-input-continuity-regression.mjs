import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const input=read('js/input.js'),online=read('js/online.js'),ai=read('js/ai.js'),party=read('js/party.js'),
  gameplay=read('js/gameplay.js'),index=read('../index.html');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
  const brace=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

const deferred=[];
const context={
  Math,Object,Array,Number,W:800,H:600,STICK_R:60,touchUI:true,
  keys:{w:true,a:false,s:true,d:false,arrowup:true,arrowdown:false,arrowleft:true,arrowright:false,e:true,r:true,' ':true},
  mouse:{down:true},dragSlider:{},pressedBtn:{},pressedBtnTouchId:12,menuTouchId:13,aimStickId:14,
  touchUtilityUsed:true,tapShootUntil:2000,touchFireCadence:true,peScrollTouchId:15,
  peScrollTouchMoved:true,peScrollTouchKind:'reports',
  sticks:{move:{id:41,cx:110,cy:480,dx:36,dy:-18},aim:{id:14,cx:700,cy:480,dx:-20,dy:4}},
  touchButtons:[{id:'fire'}],touchWeaponSelectorBounds:{x:1},aiming:true,rmbAim:true,
  fireSuppressT:0,now:1000,mouseFireCadence:true,
  setTimeout:fn=>{deferred.push(fn);return deferred.length;},
  resetFireCadence:()=>{context.mouseFireCadence=false;context.touchFireCadence=false;},
  cancelFanTheHammer:()=>{},cancelSniperTriggerBuffer:()=>{}
};
vm.createContext(context);
for(const name of ['touchMoveStickCenter','resetHeldTouchContacts','resetHeldGameplayInput','resetRoundTransitionInput','preserveTouchMovementOnResize'])
  vm.runInContext(functionSource(input,name),context);

const expectedMovement=Object.fromEntries(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].map(k=>[k,context.keys[k]]));
context.resetRoundTransitionInput();
for(const [key,value] of Object.entries(expectedMovement))assert.equal(context.keys[key],value,key+' must survive a round transition');
for(const key of ['e','r',' '])assert.equal(context.keys[key],false,key+' must not survive a round transition');
assert.deepEqual({id:context.sticks.move.id,dx:context.sticks.move.dx,dy:context.sticks.move.dy},{id:41,dx:36,dy:-18});
assert.equal(context.mouse.down,false);assert.equal(context.aiming,false);assert.equal(context.rmbAim,false);
assert.equal(context.aimStickId,null);assert.equal(context.sticks.aim.id,null);assert.equal(context.pressedBtnTouchId,null);
assert.equal(context.tapShootUntil,0);assert.equal(context.touchFireCadence,false);

context.sticks.move={id:null,cx:110,cy:480,dx:0,dy:0};
context.resetRoundTransitionInput();
assert.deepEqual({...context.sticks.move},{id:null,cx:110,cy:480,dx:0,dy:0},
  'round reset must never invent a movement contact');

context.sticks.move={id:77,cx:110,cy:480,dx:-30,dy:22};context.sticks.aim={id:18,cx:700,cy:480,dx:10,dy:2};
context.aimStickId=18;context.touchButtons=[{id:'fire'}];context.touchWeaponSelectorBounds={x:1};
context.preserveTouchMovementOnResize();
assert.equal(context.touchButtons.length,0);assert.equal(context.touchWeaponSelectorBounds,null);
assert.deepEqual({id:context.sticks.move.id,dx:context.sticks.move.dx,dy:context.sticks.move.dy},{id:77,dx:-30,dy:22});
assert.equal(deferred.length,1,'resize recentering must wait for the canvas dimensions to update');
context.H=520;deferred.shift()();
assert.deepEqual({id:context.sticks.move.id,cx:context.sticks.move.cx,cy:context.sticks.move.cy,dx:context.sticks.move.dx,dy:context.sticks.move.dy},
  {id:77,cx:110,cy:400,dx:-30,dy:22},'resize must preserve direction while adopting the new fixed center');

context.sticks.move={id:88,cx:110,cy:400,dx:20,dy:10};
context.preserveTouchMovementOnResize();
context.sticks.move.id=null;context.sticks.move.dx=0;context.sticks.move.dy=0;
deferred.shift()();
assert.deepEqual({id:context.sticks.move.id,dx:context.sticks.move.dx,dy:context.sticks.move.dy},{id:null,dx:0,dy:0},
  'a deferred resize callback must not resurrect a touch that already ended');

assert.match(input,/addEventListener\('resize',preserveTouchMovementOnResize\)/,
  'ordinary resize must preserve active movement');
assert.doesNotMatch(input,/addEventListener\('resize',resetTouchInputForViewportChange\)/,
  'ordinary mobile browser resize must not use the destructive reset');
assert.match(input,/addEventListener\('orientationchange',resetTouchInputForViewportChange\)/,
  'orientation changes still require a full geometry reset');
assert.match(input,/document\.hidden&&touchInputHasOwner\(\)\)resetHeldGameplayInput\(\)/,
  'a genuinely hidden page must retire stale input contacts');
for(const [source,name] of [[online,'arenaApplyRoundStart'],[ai,'arenaBotStartRound'],[party,'cpuTeamBeginRound']]){
  const body=functionSource(source,name);
  assert.match(body,/resetRoundTransitionInput\(/,name+' must preserve held movement between rounds');
  assert.doesNotMatch(body,/resetHeldGameplayInput\(/,name+' must not directly destroy movement between rounds');
}
for(const name of ['offlineCpu2v2Resolve','partyCpuApplyRoundResult']){
  const body=functionSource(party,name);
  assert.match(body,/resetRoundTransitionInput\(![^)]+\)/,name+' must preserve movement only when another round follows');
  assert.doesNotMatch(body,/resetHeldGameplayInput\(/,name+' must not erase a held direction between rounds');
}
const startBody=functionSource(gameplay,'startGame');
assert.match(startBody,/resetHeldGameplayInput\(\)/,'a normal first launch still needs the full stale-input reset');
assert.match(startBody,/preserveMovement===true[\s\S]{0,80}resetRoundTransitionInput/,
  'continuing CPU-team rounds must be able to preserve movement through shared setup');
for(const script of ['state','input','gameplay','ai','online','party'])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=20260831-duel-stability-v1`),script+' must load the duel-stability cache version');

console.log('PASS movement survives ordinary resize and continuing-round setup without preserving fire input');
