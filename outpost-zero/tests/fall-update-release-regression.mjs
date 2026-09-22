import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const weapons=read('js/weapons.js'),persistence=read('js/persistence.js');
const gameplay=read('js/gameplay.js'),ui=read('js/ui.js');
const adminSql=read('sql/administration/Admin-02-admins.sql'),index=read('../index.html');

const context=vm.createContext({console,Math,Number,Object,Array,Set,Map,Infinity});
vm.runInContext(`${weapons}\nglobalThis.__fall={live:FALL_UPDATE_LIVE,active:VAULT_ACTIVE,primaries:PRIMARIES,secondaries:SECONDARIES,melees:MELEES,utilities:UTILKEYS};`,context,{filename:'weapons.js'});
const fall=context.__fall;

assert.equal(fall.live,true,'the Fall Update must be released, not left in admin preview');
assert.equal(fall.active.warpwave,true);assert.ok(fall.primaries.includes('warpwave'),'Warpwave must be public');
assert.equal(fall.active.timeturner,true);assert.ok(fall.secondaries.includes('timeturner'),'Time Turner must be public');
assert.equal(fall.active.terafists,true);assert.ok(fall.melees.includes('terafists'),'Tera Fists must be public');
assert.equal(fall.active.portal,true);assert.ok(fall.utilities.includes('portal'),'Portal must be public');

assert.match(persistence,/return !!FALL_UPDATE_LIVE\|\|!!\(isAdmin\(\)&&testMode\)/,
  'Fall access must be available to every player');
assert.match(gameplay,/unrankedRun = !FALL_UPDATE_LIVE&&/,
  'released Fall equipment must be allowed in normal ranked and score runs');
assert.match(ui,/OUTPOST ZERO FALL UPDATE/,'the home banner must announce the Fall Update');
assert.match(ui,/FALL UPDATE \\u00b7 LIVE/,'Fall weapon cards must say they are live');
assert.doesNotMatch(ui,/SUMMER FLAMING UPDATE/,'the old Summer Update name must be removed');
assert.doesNotMatch(adminSql,/NEXT_SEASON_WEAPONS_CANNOT_BE_PUBLISHED/,
  'the server weapon editor must allow the released Fall set to remain published');

for(const script of ['weapons','persistence','upgrades','admin-ui','gameplay','ui'])
  assert.match(index,new RegExp(`js/${script}\\.js\\?[^"']*release=20260921-fall-release-v1`),
    `${script}.js must bypass the cached Summer build`);

console.log('PASS Fall banner and all four Fall weapons are released publicly');
