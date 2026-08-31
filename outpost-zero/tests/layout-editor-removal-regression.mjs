import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const index=read('../index.html'),ui=read('js/ui.js'),adminUi=read('js/admin-ui.js'),
  administration=read('js/administration.js'),input=read('js/input.js'),loop=read('js/loop.js'),
  networking=read('js/networking.js'),bootstrap=read('js/bootstrap.js'),party=read('js/party.js');
const runtime=[index,ui,adminUi,administration,input,loop,networking,bootstrap,party].join('\n');

assert.equal(fs.existsSync(path.join(root,'js/layout.js')),false,'the Layout Editor module must be removed');
assert.doesNotMatch(index,/js\/layout\.js/,'the deleted module must not be loaded');
assert.doesNotMatch(runtime,/ui_layout|oz_ui_layout|LAYOUT_DRAFT_KEY|layoutMode|layoutMouse(?:Down|Move|Up)|fetchLayout|saveLayout|flushLayoutDraftOnExit/,
  'no runtime storage, input, rendering, or exit hook may keep the Layout Editor alive');
assert.doesNotMatch(adminUi,/LAYOUT EDITOR|actionBtn\('layout'|id==='layout'/,
  'Admin Tools must not offer the removed editor');
assert.doesNotMatch(ui+adminUi,/\boff[XYCol]+\(|withBlockColour\(|layoutBlock\(/,
  'normal Home rendering must not depend on editor offsets or color overrides');
for(const script of ['networking','weapons','administration','admin-ui','input','ai','party','ui','loop','bootstrap'])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=20260831-bots-volt-layout-v1`),
    `${script}.js must not be served from a cache that still expects Layout Editor globals`);

assert.match(ui,/boardPanelRect=\{x:homeBoardsX,y:homeBoardsY,w:homeBoardsW,h:homeBoardsH\}/);
assert.match(ui,/drawHomeLeaderboards\(homeBoardsX,homeBoardsY,homeBoardsW,homeBoardsH\)/);
assert.match(ui,/const stW=Math\.min\(340,W-24\),stX=W\/2-stW\/2,/);
assert.match(ui,/const tpX=W\/2-tpW\/2;/);
assert.match(ui,/const lx2=clamp\(edge,edge,centreLeft-gap-aw\)/);
assert.match(ui,/bx=52, by=Math\.max\(104,leftColTop\)/);
assert.match(ui,/const gear=gearMetrics\(\),x=clamp\(10,8,/);

console.log('layout editor removal regression: PASS');
