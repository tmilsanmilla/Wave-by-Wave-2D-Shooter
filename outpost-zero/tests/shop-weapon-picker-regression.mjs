import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('js/ui.js'),input=read('js/input.js'),cpuState=read('js/cpu-state.js'),
  progression=read('js/progression.js'),index=read('../index.html');

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

const anims=functionSource(ui,'drawShopAnims'),colors=functionSource(ui,'drawShopCosmetics'),
  picker=functionSource(ui,'drawShopWeaponPicker'),shop=functionSource(ui,'drawShop'),
  back=functionSource(ui,'navigateSelectBack');
for(const source of [anims,colors,input,cpuState,progression]){
  assert.doesNotMatch(source,/\b(?:cos|anim)(?:Prev|Next)Rect\b/,
    'the slow one-at-a-time previous/next weapon controls must be gone');
}
assert.match(anims,/drawShopWeaponButton\(cw,y,'anims',shopAnimWeapon\)/,
  'Animations must open the shared WEAPONS picker');
assert.match(colors,/drawShopWeaponButton\(cw,y,'cosmetics',shopCosWeapon\)/,
  'Colors must open the shared WEAPONS picker');
assert.match(functionSource(ui,'drawShopWeaponButton'),/fillText\('WEAPONS'/,
  'the replacement control must explicitly say WEAPONS');
for(const label of ['PRIMARY','SECONDARY','MELEE']) assert.match(ui,new RegExp(`label:'${label}'`));
assert.match(picker,/shopWeaponPickerRects\.push\(\{kind:'category'/);
assert.match(picker,/shopWeaponPickerRects\.push\(\{kind:'weapon',key:k/);
assert.match(shop,/if\(shopWeaponPickerOpen\)\s+y=drawShopWeaponPicker/);
assert.match(shop,/if\(W<520&&H>W\) y\+=50/,
  'every portrait-phone Shop section must clear the account/currency badge');
assert.match(picker,/const cols=compact\?3:2/,
  'short screens need three picker columns so cards cannot collide with Back');
assert.match(shop,/BACK TO ['+]\+?\(shopWeaponPickerTarget|BACK TO /,
  'the nested picker needs a clear route back to its Shop section');

const categoryDecl=ui.match(/const SHOP_WEAPON_PICKER_CATEGORIES=\[[\s\S]*?\n\];/);
assert.ok(categoryDecl,'missing picker category declaration');
const context={
  PRIMARIES:['p1','p2'],TEMP_PRIMARY:['pt'],SECONDARIES:['s1'],TEMP_SECONDARY:['st'],
  MELEES:['m1'],TEMP_MELEE:['mt'],WKEYS:['p1','p2','pt','s1','st','m1','mt','p1'],
  WEAPONS:{p1:{},p2:{},pt:{},s1:{},st:{},m1:{},mt:{}},
  isLocked:key=>key==='p2'||key==='st',shopAnimWeapon:'s1',shopCosWeapon:'p1',
  shopWeaponPickerOpen:false,shopWeaponPickerTarget:'cosmetics',shopWeaponPickerCat:'primary',
};
vm.createContext(context);
vm.runInContext(categoryDecl[0]+'\n'+functionSource(ui,'shopWeaponPickerCategory')+'\n'+
  functionSource(ui,'shopWeaponPickerGroups')+'\n'+functionSource(ui,'openShopWeaponPicker')+'\n'+
  functionSource(ui,'chooseShopWeapon'),context);
const groups=JSON.parse(vm.runInContext('JSON.stringify(shopWeaponPickerGroups())',context));
assert.deepEqual(groups,{primary:['p1','pt'],secondary:['s1'],melee:['m1','mt']},
  'picker must preserve roster order, remove duplicates, and hide locked/unpublished weapons');
context.openShopWeaponPicker('anims');
assert.equal(context.shopWeaponPickerOpen,true);assert.equal(context.shopWeaponPickerTarget,'anims');
assert.equal(context.shopWeaponPickerCat,'secondary','opening should focus the selected weapon category');
assert.equal(context.chooseShopWeapon('p2'),false,'hidden weapons cannot be chosen through a forged click');
assert.equal(context.shopAnimWeapon,'s1');
assert.equal(context.chooseShopWeapon('m1'),true);assert.equal(context.shopAnimWeapon,'m1');
assert.equal(context.shopWeaponPickerOpen,false,'selection returns directly to the Shop section');
context.openShopWeaponPicker('cosmetics');
assert.equal(context.chooseShopWeapon('pt'),true);assert.equal(context.shopCosWeapon,'pt');
assert.equal(context.shopAnimWeapon,'m1','a Colors choice must not change the Animations target');

assert.match(input,/for\(const r of shopWeaponPickerRects\)[\s\S]*?r\.kind==='open'[\s\S]*?r\.kind==='category'[\s\S]*?r\.kind==='weapon'/,
  'picker controls need dedicated click routing before purchases');
assert.match(input,/if\(shopWeaponPickerOpen\) return;[\s\S]*?buyCosmetic\(r\.wkey, r\.cos\)/,
  'the open picker must block underlying purchases while purchases retain their captured weapon key');
assert.match(input,/buyAnim\(r\.anim, r\.wkey\)/,
  'animation purchases must retain the weapon captured when their row was drawn');
assert.match(input,/shopWeaponPickerOpen=false; shopTab=r\.tab/,
  'switching Shop tabs must close stale picker state');
assert.match(back,/selPage==='shop'&&shopWeaponPickerOpen[\s\S]*?shopWeaponPickerOpen=false[\s\S]*?return/,
  'Back must close the picker before leaving Shop');

const backContext={detailKey:null,selPage:'shop',shopWeaponPickerOpen:true,pendingGameMode:'arena',
  CATS:[],sfx:()=>{},menuOpen:false};
vm.createContext(backContext);vm.runInContext(back,backContext);
backContext.navigateSelectBack();
assert.equal(backContext.selPage,'shop','first Back must stay inside Shop');
assert.equal(backContext.shopWeaponPickerOpen,false,'first Back closes only the nested picker');
backContext.navigateSelectBack();
assert.equal(backContext.selPage,'loadout','next Back returns a pending launch to Loadout');
backContext.selPage='shop';backContext.pendingGameMode=null;backContext.navigateSelectBack();
assert.equal(backContext.selPage,'hub','ordinary Shop Back returns Home');

for(const [source,name] of [[progression,'buyAnim'],[read('js/persistence.js'),'buyCosmetic']]){
  const purchase=functionSource(source,name);
  assert.match(purchase,/!WEAPONS\[[^\]]+\][\s\S]*?isLocked/,
    `${name} must revalidate its weapon before charging coins`);
  assert.match(purchase,/return false/);
}

for(const [script,version] of [['progression','20260831-frag-range-v2'],['persistence','20260831-shop-weapon-picker-v1'],
  ['cpu-state','20260831-shop-weapon-picker-v1'],['input','20260831-duel-stability-v1'],['ui','20260831-frag-range-v1']])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=${version}`),
    `${script}.js needs the categorized Shop picker cache tag`);

console.log('PASS Shop Colors and Animations use a fast categorized WEAPONS picker');
