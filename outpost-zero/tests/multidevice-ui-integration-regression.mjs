import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('js/ui.js'),rendering=read('js/rendering.js'),input=read('js/input.js'),service=read('js/duels-service.js'),engine=read('js/multidevice.js'),admin=read('js/admin-ui.js');
assert.match(ui,/selPage==='multidevice'\) drawMultideviceMenu\(\)/);
assert.match(input,/selPage==='multidevice'[\s\S]*duelServiceCancel/);
assert.match(ui,/partyduel_[\s\S]*duelServicePartyReady/,'party launch routes to the explicit server-ready workflow');
assert.match(rendering,/isMultideviceArena\(\)\)\{drawMultideviceActors\(\);return;/,'render every human, not arena.opponent');
assert.match(rendering,/b\.hostile!==false/,'friendly visual shots are excluded from the hostile pass');
assert.match(admin,/isMultideviceArena\(\)\)return multideviceTargets\(\)\.filter/);
assert.match(admin,/isMultideviceArena\(\)\)return multideviceHit\(target,dmg,kind\)/,'all melee ability helpers hit the addressed actor');
assert.match(service,/if\(!\['1v1','2v2'\]\.includes\(mode\)\)return duelServiceNotice\('1v1v1 IS PARTY ONLY'\)/);
assert.match(service,/p_loadout:\{\.\.\.loadout,utility:null\}/,'server allocations do not silently re-enable hidden utility slots');
assert.match(engine,/await duelServiceAcknowledgeStart\(next\.matchId\)/,'secure start must be acknowledged before Realtime ready');
assert.ok(engine.indexOf('await duelServiceAcknowledgeStart(next.matchId)')<engine.lastIndexOf('next.connected=true'));
assert.match(engine,/gameClockAnchor[\s\S]*gameWallAnchor/,'a background menu cannot extend parry duration');
assert.match(engine,/A player did not reconnect\. Match cancelled; no ranked change\./);
assert.match(engine,/source!=='party'\|\|config\.ranked/,'the engine rejects queue/ranked FFA independently of UI');
assert.match(read('js/upgrades.js'),/isMultideviceArena\(\)\)\{[^\n]*duelServiceCancel\(\)/,'in-game exit must release backend membership, not only local visuals');
assert.match(read('js/online.js'),/Promise\.race\(\[duelServiceCancel\(\),new Promise\(resolve=>setTimeout\(\(\)=>resolve\(false\),2500\)\)\]\)/,
  'sign-out cleanup gives the authenticated release a bounded chance to complete');
console.log('PASS multi-device UI/service/combat integration: separate lobby, explicit party-onlyFFA, secure start and team-safe rendering');
