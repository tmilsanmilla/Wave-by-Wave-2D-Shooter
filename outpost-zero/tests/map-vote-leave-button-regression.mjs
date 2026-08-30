import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');

assert.doesNotMatch(ui,/LEAVE MAP VOTE|['"]map_leave['"]|Left the map vote/i,
  'Local map voting must not render or handle the removed Leave Map Vote control');
assert.match(ui,/if\(!localMapVote\)button\(['"]map_leave_match['"],['"]LEAVE MATCH['"]/, 'Online map voting must retain its separate Leave Match control');
assert.match(ui,/r\.id===['"]map_leave_match['"]\) leaveArena\(['"]Left the match\./,
  'The retained online control must still leave the match');

console.log('PASS Local map voting no longer exposes Leave Map Vote');
