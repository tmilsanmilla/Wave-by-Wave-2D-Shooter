import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('js/ui.js'),persistence=read('js/persistence.js');

function functionSource(source,name){
  let start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
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

const shopSource=functionSource(ui,'drawShopWeapons');
assert.match(shopSource,/liveShop=GEM_SHOP\.filter\([\s\S]*?isWeaponPublished/,
  'only published offers may appear in the weapon shop');
assert.match(shopSource,/const can=published&&!owned&&gems>=it\.cost/,
  'a published unowned weapon must become an active Buy button when affordable');
assert.match(shopSource,/const label=owned\?'OWNED':published\?'[^']*'\+it\.cost\+' BUY':'UNAVAILABLE'/,
  'a revoked published weapon must say Buy instead of Locked');
assert.doesNotMatch(shopSource,/const locked\s*=|&&\s*!locked|\?\s*'LOCKED'/,
  'the Shop must not confuse the loadout entitlement lock with purchasability');

const accessContext={
  TEMP_PRIMARY:[],TEMP_SECONDARY:[],TEMP_MELEE:[],TEMP_UTILITY:[],FALL_KEYS:[],VAULT_SLOTS:{},
  GEM_SHOP:[{key:'railgun',cost:600}],gemOwned:{},testMode:false,sb:{},
  isLocked:()=>true,isWeaponPublished:()=>true,fallEligible:()=>false,
};
vm.createContext(accessContext);
vm.runInContext(functionSource(ui,'weaponBrowserAccess'),accessContext);
let access=accessContext.weaponBrowserAccess('railgun');
assert.equal(access.locked,false,'a published revoked weapon is a Shop offer, not an unavailable item');
assert.match(access.text,/BUY IN SHOP.*600/);
accessContext.isWeaponPublished=()=>false;
access=accessContext.weaponBrowserAccess('railgun');
assert.equal(access.locked,true,'an unpublished weapon must remain unavailable');
assert.match(access.text,/UNAVAILABLE.*NOT CURRENTLY LIVE/);

let unlocks=0,saves=0,sounds=[];
const buyContext={
  GEM_SHOP:[{key:'railgun',cost:600,slot:'primary'}],gemOwned:{},gems:900,
  isWeaponPublished:()=>true,gemUnlock:()=>{unlocks++;},saveMeta:()=>{saves++;},sfx:name=>sounds.push(name),
};
vm.createContext(buyContext);
vm.runInContext(functionSource(persistence,'buyGem'),buyContext);
assert.equal(buyContext.buyGem({key:'railgun'}),true,'a revoked published weapon must be buyable again');
assert.equal(buyContext.gems,300,'repurchase charges the normal listed price exactly once');
assert.equal(buyContext.gemOwned.railgun,true,'repurchase restores permanent ownership');
assert.equal(unlocks,1);assert.equal(saves,1);assert.deepEqual(sounds,['pickup']);
assert.equal(buyContext.buyGem({key:'railgun'}),false,'an owned weapon cannot be charged twice');
assert.equal(buyContext.gems,300);

const blockedContext={
  GEM_SHOP:[{key:'railgun',cost:600,slot:'primary'}],gemOwned:{},gems:900,
  isWeaponPublished:()=>false,gemUnlock:()=>{throw new Error('unpublished weapon unlocked');},
  saveMeta:()=>{throw new Error('unpublished purchase saved');},sfx:()=>{},
};
vm.createContext(blockedContext);
vm.runInContext(functionSource(persistence,'buyGem'),blockedContext);
assert.equal(blockedContext.buyGem({key:'railgun'}),false,'unpublished weapons must never be purchasable');
assert.equal(blockedContext.gems,900);

assert.match(functionSource(persistence,'isLocked'),/GEM_SHOP\.some\([\s\S]*?!gemOwned\[k\]&&!temporarilyOwnsWeapon\(k\)/,
  'unowned weapons must remain locked for equipping and combat until bought');
assert.match(functionSource(ui,'weaponDetails'),/shopPublished\?'BUY IN SHOP[\s\S]*?'[^']*NOT CURRENTLY LIVE'/,
  'weapon details must distinguish a Shop offer from an unpublished weapon');

console.log('PASS Permanently removed published weapons return to the Shop as buyable offers');
