import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const weaponsSource=read('js/weapons.js');
const upgrades=read('js/upgrades.js');
const adminUi=read('js/admin-ui.js');
const combat=read('js/combat.js');
const ui=read('js/ui.js');
const admin02=read('sql/administration/Admin-02-admins.sql');
const index=read('../index.html');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`missing ${name}`);
  const params=source.indexOf('(',start);let paren=0,brace=-1,paramQuote='',paramEscaped=false;
  for(let i=params;i<source.length;i++){
    const c=source[i];
    if(paramQuote){if(paramEscaped)paramEscaped=false;else if(c==='\\')paramEscaped=true;else if(c===paramQuote)paramQuote='';continue;}
    if(c==='"'||c==="'"||c==='`'){paramQuote=c;continue;}
    if(c==='(')paren++;else if(c===')'&&--paren===0){brace=source.indexOf('{',i+1);break;}
  }
  assert.ok(brace>=0,`missing ${name} body`);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

function sourceRange(source,startText,endText){
  const start=source.indexOf(startText),end=source.indexOf(endText,start+startText.length);
  assert.ok(start>=0&&end>start,`missing source range ${startText} ... ${endText}`);
  return source.slice(start,end);
}

const weaponContext=vm.createContext({console,Math,Number,Object,Array,Set,Map,Infinity});
vm.runInContext(`${weaponsSource}\nglobalThis.__equipment={
  WEAPONS,VAULT_WEAPONS,UTILITIES,VAULT_UTILITIES,PRIMARIES,SECONDARIES,MELEES,UTILKEYS,
  TEMP_PRIMARY,TEMP_SECONDARY,TEMP_MELEE,TEMP_UTILITY,VAULT_SLOTS,VAULT_ACTIVE,FALL_KEYS,WKEYS
};`,weaponContext,{filename:'weapons.js'});
const equipment=JSON.parse(vm.runInContext('JSON.stringify(__equipment)',weaponContext));

assert.deepEqual(
  {dmg:equipment.UTILITIES.grenade.dmg,range:equipment.UTILITIES.grenade.range,cd:equipment.UTILITIES.grenade.cd},
  {dmg:300,range:85,cd:20000},
  'Frag must keep 300 center damage while cutting its old 170 blast radius exactly in half',
);

const expectedUtilityFields={
  medkit:['rechargeKills'],
  grenade:['cd','dmg','range'],
  freezer:['cd','speed','fuseMs','radius','freezeMs'],
  redball:['cd'],
  beachball:['cd'],
  turret:['cd'],
  portal:['cd'],
  timecapsule:['cd'],
};
for(const [key,fields] of Object.entries(expectedUtilityFields)){
  const definition=equipment.UTILITIES[key]||equipment.VAULT_UTILITIES[key];
  assert.ok(definition,`missing utility definition for ${key}`);
  for(const field of fields)assert.equal(typeof definition[field],'number',`${key}.${field} must be a real editable gameplay number`);
}

const fragRadiusSource=functionSource(combat,'fragBlastRadius');
const fragDamageSource=functionSource(combat,'fragDamageAtDistance');
const fragContext=vm.createContext({
  console,Math,Number,Object,Array,Set,Map,Infinity,
  UTILITIES:{grenade:{dmg:300,range:85,cd:20000}},
});
vm.runInContext(`${fragRadiusSource}\n${fragDamageSource}`,fragContext,{filename:'frag-helpers.js'});
const frag=(distance,boss=false)=>fragContext.fragDamageAtDistance(distance,boss);
assert.equal(fragContext.fragBlastRadius(),85,'Frag runtime radius must come from its editable range');
assert.equal(frag(0),300,'Frag must retain full damage at the epicenter');
assert.equal(frag(42.5),150,'Frag must fall to half damage halfway through its smaller radius');
assert.equal(frag(85),0,'Frag damage must reach zero at the edge');
assert.equal(frag(500),0,'Frag damage must remain zero outside the blast');
assert.equal(frag(0,true),180,'Frag must retain 180 boss damage at the epicenter');

fragContext.UTILITIES.grenade.dmg=240;
fragContext.UTILITIES.grenade.range=60;
assert.equal(fragContext.fragBlastRadius(),60,'an admin range override must change the runtime blast radius');
assert.equal(frag(0),240,'an admin damage override must change runtime center damage');
assert.equal(frag(30),120,'the edited profile must still fall linearly from center to edge');
assert.equal(frag(60),0,'the edited profile must reach zero at its edited edge');

const updateSource=functionSource(combat,'update');
assert.ok(
  /damageEnemy\(e,[^\n]*fragDamageAtDistance\(/.test(updateSource)||
  /fragDamageAtDistance\([^;]+;[\s\S]{0,180}damageEnemy\(e,blastDamage/.test(updateSource),
  'Endless enemies must use the shared Frag damage calculation',
);
assert.match(updateSource,/arenaHitOpponent\(fragDamageAtDistance\(/,
  'Casual opponents must use the same Frag damage calculation');
assert.doesNotMatch(updateSource,/const rad=fw\?85:170|300\*falloff|boss\?180:300/,
  'no old hardcoded Frag radius or parallel damage curve may survive');

// Exercise the real editor entry points without coupling the test to its private
// field-table representation. A utility field is useful only if it is shown,
// saved through the protected RPC, and applied to the correct live definition.
const editorCore=sourceRange(adminUi,'let storageTab=', 'function drawWeaponEdit()');
const rpcCalls=[];let lastForm=null;
const editorContext=vm.createContext({
  console,Math,Number,Object,Array,Set,Map,Infinity,
  ...equipment,
  GEM_PRICE_SCALE:10,
  GEM_SHOP:Object.keys(expectedUtilityFields).map((key,index)=>({key,cost:(index+1)*100})),
  adminSelfUsername:'main_admin',storageOpen:false,weaponEditOpen:false,
  openForm:opts=>{lastForm=opts;},closeForm(){},formValues:()=>({}),
  $:()=>({textContent:''}),isMainAdmin:()=>true,myRank:()=> 'main',sfx(){},
  setGemPrice(){},saveMeta(){},syncOwnedWeapons(){},canRestoreAccountLoadout:()=>false,
  purgeUnpublishedWeaponState:()=>false,fallEligible:()=>false,
  sb:{rpc:async(name,payload)=>{
    rpcCalls.push({name,payload});
    return {data:[{weapon_key:payload.p_weapon_key,stats:payload.p_stats,price:payload.p_price,
      published:payload.p_published,updated_by:'main_admin',updated_at:'2026-08-30T00:00:00Z'}],error:null};
  }},
});
vm.runInContext(`${editorCore}\nglobalThis.__editor={openWeaponEdit,saveWeaponEdit,applyWeaponDef};`,editorContext,
  {filename:'weapon-editor-core.js'});

for(const [key,expected] of Object.entries(expectedUtilityFields)){
  vm.runInContext(`__editor.openWeaponEdit(${JSON.stringify(key)})`,editorContext);
  const ids=(lastForm&&lastForm.fields||[]).map(field=>field.id).filter(id=>id!=='price');
  assert.ok(ids.length>0,`${key} must expose a meaningful editable stat in addition to Gem Price`);
  for(const field of expected)assert.ok(ids.includes(field),`${key} editor must expose ${field}`);
}
vm.runInContext(`__editor.openWeaponEdit('ar')`,editorContext);
const arFields=(lastForm&&lastForm.fields||[]).map(field=>field.id);
for(const utilityOnly of ['cd','rechargeKills','fuseMs','radius','freezeMs'])
  assert.ok(!arFields.includes(utilityOnly),`ordinary weapons must not receive utility-only ${utilityOnly}`);

vm.runInContext(`__editor.openWeaponEdit('grenade');
  weaponEditDraft.cd=15000;weaponEditDraft.dmg=240;weaponEditDraft.range=60;
  weaponEditDraft.freezeMs=9999;`,editorContext);
await vm.runInContext('__editor.saveWeaponEdit()',editorContext);
assert.equal(rpcCalls.at(-1).name,'save_outpost_zero_weapon_definition');
assert.deepEqual(
  {...rpcCalls.at(-1).payload.p_stats},
  {cd:15000,dmg:240,range:60},
  'Frag save must include its allowed stats and discard a forged Freezer-only field',
);
assert.deepEqual(
  {cd:editorContext.UTILITIES.grenade.cd,dmg:editorContext.UTILITIES.grenade.dmg,range:editorContext.UTILITIES.grenade.range},
  {cd:15000,dmg:240,range:60},
  'the confirmed save must immediately apply every edited Frag stat',
);

vm.runInContext(`__editor.applyWeaponDef({key:'grenade',stats:{dmg:210,range:55,freezeMs:9999},published:true});`,editorContext);
assert.deepEqual(
  {dmg:editorContext.UTILITIES.grenade.dmg,range:editorContext.UTILITIES.grenade.range,
    freezeMs:editorContext.UTILITIES.grenade.freezeMs},
  {dmg:210,range:55,freezeMs:undefined},
  'Realtime definitions must apply key-approved Frag fields and ignore fields belonging to another utility',
);
vm.runInContext(`__editor.applyWeaponDef({key:'freezer',stats:{radius:77,dmg:999},published:true});`,editorContext);
assert.equal(editorContext.UTILITIES.freezer.radius,77);
assert.equal(editorContext.UTILITIES.freezer.dmg,undefined,'Freezer must ignore a forged Frag damage field');

const saveRpc=sourceRange(admin02,
  'create or replace function public.save_outpost_zero_weapon_definition(',
  '-- Existing projects may still have Weapons 01');
assert.match(saveRpc,/v_key[\s\S]*v_field/,'server validation must consider the equipment key and field together');
for(const field of ['cd','dmg','range','rechargeKills','speed','fuseMs','radius','freezeMs'])
  assert.match(saveRpc,new RegExp(`v_field='${field}'[\\s\\S]{0,220}v_number not between`),
    `${field} must have an explicit server-side numeric bound`);
for(const key of Object.keys(expectedUtilityFields))assert.match(saveRpc,new RegExp(`v_key[^\\n]{0,180}'${key}'`),
  `${key} must participate in the SQL key-specific field allowlist`);
assert.match(saveRpc,/UNKNOWN_WEAPON_STAT/);
assert.match(saveRpc,/WEAPON_STAT_OUT_OF_RANGE/);

const liveUtilityCopySource=functionSource(ui,'liveUtilityCopy');
const detailsSource=functionSource(ui,'weaponDetails');
const detailsContext=vm.createContext({
  console,Math,Number,Object,Array,Set,Map,Infinity,
  UTILITIES:{
    grenade:{name:'FRAG GRENADE',cd:17000,dmg:222,range:61},
    freezer:{name:'FREEZER',cd:19000,speed:7,fuseMs:1400,radius:88,freezeMs:2100},
  },
  VAULT_UTILITIES:{},UTILKEYS:['grenade','freezer'],TEMP_UTILITY:[],FALL_KEYS:[],GEM_SHOP:[],
  isLocked:()=>false,storedLoadoutSlot:()=> 'utility',medKillsRequired:()=>10,MED_KILLS_REQUIRED:10,ABILITY_CD:{},
});
vm.runInContext(`${fragRadiusSource}\n${fragDamageSource}\n${liveUtilityCopySource}\n${detailsSource}`,
  detailsContext,{filename:'weapon-details.js'});
const fragDetails=JSON.parse(vm.runInContext(`JSON.stringify(weaponDetails('grenade'))`,detailsContext));
const freezerDetails=JSON.parse(vm.runInContext(`JSON.stringify(weaponDetails('freezer'))`,detailsContext));
const fragText=JSON.stringify(fragDetails),freezerText=JSON.stringify(freezerDetails);
for(const value of ['222','61','17'])assert.match(fragText,new RegExp(value),`Frag details must show live value ${value}`);
for(const value of ['19','7','1.4','88','2.1'])assert.match(freezerText,new RegExp(value),`Freezer details must show live value ${value}`);
assert.doesNotMatch(fragText,/\b170\b|up to 300 at center/,'Frag details must not retain old hardcoded balance text');
assert.doesNotMatch(freezerText,/\b105\b|1\.35s|2\.5s/,'Freezer details must not hide admin overrides behind defaults');

for(const [file,version] of [['weapons','20260831-bots-volt-layout-v1'],['admin-ui','20260831-bots-volt-layout-v1'],
  ['upgrades','20260831-hub-tools-settings-v1'],['combat','20260831-melee-polish-v1'],['ui','20260831-bots-volt-layout-v1']])assert.match(
  index,new RegExp(`outpost-zero/js/${file}\\.js\\?v=${version}`),
  `${file}.js must use its current cache version`,
);

console.log('utility editor and Frag regression checks passed');
