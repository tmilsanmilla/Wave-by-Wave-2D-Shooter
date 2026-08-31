import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('js/ui.js'),input=read('js/input.js'),upgrades=read('js/upgrades.js');
const networking=read('js/networking.js'),audio=read('js/audio.js'),index=read('../index.html');

function between(source,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`missing source section: ${start}`);
  return source.slice(from,to);
}
const hub=between(ui,'function drawHub(){','function drawCategory(');
const dailyAt=hub.lastIndexOf('DAILY TASKS'),settingsAt=hub.indexOf('settingsBtnRect=',dailyAt);
const shopAt=hub.indexOf('shopBtnRect=',settingsAt),toolsAt=hub.indexOf('toolsBtnRect=',settingsAt);
assert.ok(dailyAt>=0&&settingsAt>dailyAt,
  'the full-width Settings control must be rendered below the Daily Tasks panel');
assert.ok(shopAt>settingsAt&&toolsAt>settingsAt,
  'Shop and Tools must be rendered beneath Settings');
assert.match(hub,/settingsBtnRect\s*=\s*hubBtn\(/,'the hub needs one Settings action');
assert.match(hub,/shopBtnRect\s*=\s*hubBtn\(/,'the hub needs one Shop action');
assert.match(hub,/toolsBtnRect\s*=\s*hubBtn\(/,'the hub needs one Tools action');
assert.equal((hub.match(/(?:settings|shop|tools)BtnRect\s*=\s*hubBtn\(/g)||[]).length,3,
  'the organized hub control area must contain exactly Settings, Shop, and Tools');
for(const oldAssignment of ['tutBtnRect','promoBtnRect','shareBtnRect','wheelBtnRect','lookupBtnRect'])
  assert.doesNotMatch(hub,new RegExp(`${oldAssignment}\\s*=\\s*hubBtn\\(`),
    `${oldAssignment} must live inside Tools instead of the hub control area`);

// Exercise the pure geometry helper instead of coupling this regression to
// its local variable names inside drawHub.
const utilityLayoutSource=between(ui,'function hubUtilityLayout(','function drawHub(){');
const utilityContext=vm.createContext({});
vm.runInContext(`${utilityLayoutSource};this.layout=hubUtilityLayout;`,utilityContext,
  {filename:'hub-utility-layout.js'});
const task={x:80,y:220,w:390,h:142},buttonH=48,gap=10;
const layout=JSON.parse(JSON.stringify(utilityContext.layout(task,700,buttonH,gap)));
assert.deepEqual(layout.settings,{x:80,y:368,w:390,h:48},
  'Settings must be full-width and immediately below Daily Tasks');
assert.equal(layout.shop.y,layout.tools.y,'Shop and Tools must share one row');
assert.equal(layout.shop.y,layout.settings.y+layout.settings.h+gap,
  'Shop and Tools must sit beneath Settings');
assert.equal(layout.shop.w,layout.tools.w,'Shop and Tools must have equal lengths');
assert.equal(layout.shop.w*2+gap,layout.settings.w,
  'the Shop/Tools pair must exactly fill the Settings width');
assert.equal(layout.tools.x,layout.shop.x+layout.shop.w+gap,
  'Shop and Tools must be separated by exactly one layout gap');

const toolsRoute=ui.match(/selPage==='tools'\)\s*([A-Za-z_$][\w$]*)\(\)/);
assert.ok(toolsRoute,'the page router must render a dedicated Tools page');
const toolsStart=`function ${toolsRoute[1]}(`,toolsFrom=ui.indexOf(toolsStart);
assert.ok(toolsFrom>=0,'the routed Tools renderer must exist');
const toolsEnd=ui.indexOf('\nfunction ',toolsFrom+toolsStart.length);
const toolsPage=ui.slice(toolsFrom,toolsEnd<0?ui.length:toolsEnd);
for(const label of ['HOW TO PLAY','REDEEM CODE','SHARE INVITE','SPIN','PLAYER LOOKUP','BACK'])
  assert.match(toolsPage,new RegExp(label.replaceAll(' ','\\s+')),
    `Tools must visibly contain ${label}`);
assert.match(input,/inR\(toolsBtnRect\)[\s\S]{0,180}selPage='tools'/,
  'the hub Tools control must open the dedicated Tools page');
assert.match(input,/selPage==='tools'/,
  'Tools page actions must have their own click-routing boundary');

for(const id of ['settingssoundtrackopen','settingssoundtracksummary','settingssoundtrackpanel',
  'settingssoundtrackstatus','settingssoundtrackback','settingstrackcalm','settingstrackenergetic','settingstrackpiano'])
  assert.doesNotMatch(index,new RegExp(`id=["']${id}["']`),
    `${id} must not remain in Account Settings`);
assert.doesNotMatch(networking,/settingssoundtrack|settingstrack|accountSettingsSelectSoundtrack/,
  'Account Settings must not retain soundtrack controls or routes');

const menu=between(ui,'function drawMenu(){','let signBtnRect=');
const musicSliderAt=menu.indexOf("drawSlider('music','MUSIC'");
assert.ok(musicSliderAt>=0,'GAME MENU must retain the MUSIC volume slider');
const trackControlAt=[menu.indexOf('CALM'),menu.indexOf('MUSIC_TRACKS'),menu.indexOf('musicTrack')]
  .filter(at=>at>=0).sort((a,b)=>a-b)[0];
assert.ok(Number.isInteger(trackControlAt)&&trackControlAt<musicSliderAt,
  'soundtrack customization must appear immediately before the MUSIC slider');
for(const [key,label] of [['calm','CALM'],['energetic','ENERGETIC'],['piano','PIANO']]){
  const inline=menu.includes(label);
  const dataDriven=/MUSIC_TRACKS/.test(menu)&&new RegExp(`${key}:Object\\.freeze\\(\\{[^}]*name:'${label}'`).test(audio);
  assert.ok(inline||dataDriven,`GAME MENU must offer the ${label} soundtrack`);
}
const menuClick=between(upgrades,'function menuClick(){','function setSliderFromMouse(){');
assert.match(menuClick,/setMusicTrack\(key,true\)/,
  'clicking a GAME MENU soundtrack control must select and persist that track');
assert.match(menuClick,/menuRects\[[^\]]*track[^\]]*\]/i,
  'soundtrack clicks must use the visible GAME MENU track rectangles');

const gear=between(ui,'function gearMetrics(){','function accountTriggerMetrics(){');
const gearSize=gear.match(/const\s+sz\s*=\s*(\d+)/);
assert.ok(gearSize,'the top-right Settings gear needs an explicit square size');
assert.ok(Number(gearSize[1])>=48,'the top-right Settings gear must be at least 48 by 48 pixels');

assert.match(index,/outpost-zero\/styles\.css\?v=20260831-hub-tools-settings-v1/,
  'the reorganized Settings CSS needs the current cache tag');
for(const [script,version] of [['networking','20260831-bots-volt-layout-v1'],['upgrades','20260831-hub-tools-settings-v1']])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=${version}`),
    `${script}.js needs the current hub/tools/settings cache tag`);
for(const [script,version] of [['cpu-state','20260831-shop-weapon-picker-v1'],['input','20260831-bots-volt-layout-v1'],['ui','20260831-bots-volt-layout-v1']])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=${version}`),
    `${script}.js needs the current Shop picker cache tag`);

console.log('PASS organized hub controls and GAME MENU soundtrack settings');
