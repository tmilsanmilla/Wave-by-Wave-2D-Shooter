import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const rendering=fs.readFileSync(path.join(root,'js/rendering.js'),'utf8');
const input=fs.readFileSync(path.join(root,'js/input.js'),'utf8');
const index=fs.readFileSync(path.join(root,'../index.html'),'utf8');

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

const context={Math,Array,H:390,W:844,tutorialOn:false,now:0,timeStopUntil:0,isArenaMapBattlefield:()=>true};
vm.createContext(context);
vm.runInContext(functionSource(rendering,'touchCombatSelectorEntries'),context);
vm.runInContext(functionSource(rendering,'touchWeaponSelectorLayout'),context);

const slots=[
  {key:'ar',number:1},{key:'m9',number:2},{key:'knife',number:3},{key:'grenade',number:4,utility:true}
];
context.slots=slots;
const entries=vm.runInContext('touchCombatSelectorEntries(slots)',context);
assert.deepEqual(Array.from(entries,entry=>entry.kind==='slot'?entry.slot.number:entry.key),[1,2,3,'f',4],
  'Quick Melee must be the touch row immediately beside melee and before utility');
const layout=vm.runInContext('touchWeaponSelectorLayout(5)',context);
assert.equal(layout.rows,5,'the mobile selector must reserve a real fifth row for Quick Melee');
assert.equal(layout.height,5*28+4*4,'the hit-test bounds must include the moved Quick Melee row');

const touchBlock=rendering.slice(rendering.indexOf('// touch controls'),rendering.indexOf('// minimap'));
assert.match(rendering,/touchButtons\.push\(\{key:'f',x,y,w:slotW,h:slotH\}\)/,
  'Quick Melee must use the same exact rectangular hit geometry as the neighboring selector rows');
assert.doesNotMatch(touchBlock,/iconBtn\('f'/,
  'the old detached top-right Quick Melee button must be removed');
assert.match(input,/else if\(k==='f'\) quickMelee\(\);/,
  'the moved mobile control must keep the original Quick Melee action');
assert.match(index,/js\/rendering\.js\?v=20260831-mobile-quick-melee-v1/,
  'the page must load the mobile Quick Melee layout without a stale render cache');

console.log('PASS mobile Quick Melee sits directly beside the melee selector');
