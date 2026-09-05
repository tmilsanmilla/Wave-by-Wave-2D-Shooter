import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readFeatureSql} from './sql-feature-security.mjs';

const root=path.resolve(import.meta.dirname,'..');
const sqlRoot=path.join(root,'sql');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
function sqlFiles(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const target=path.join(dir,entry.name);
    return entry.isDirectory()?sqlFiles(target):entry.name.endsWith('.sql')?[path.relative(sqlRoot,target)]:[];
  });
}

const expected=[
  'administration/Admin-01-admin-menu.sql',
  'administration/Admin-02-admins.sql',
  'administration/Admin-03-inbox.sql',
  'administration/Admin-04-security.sql',
  'leaderboards/Leaderboard-01.sql',
  'multi-device/Multi-device-01-duels.sql',
  'multi-device/Multi-device-02-ranked.sql',
  'multi-device/Multi-device-03-security.sql',
  'player/Player-01-stats.sql',
  'player/Player-02-weapons-and-cosmetics.sql',
  'player/Player-03-social-menu.sql',
  'player/Player-04-security.sql',
].sort();
assert.deepEqual(sqlFiles(sqlRoot).sort(),expected,
  'saved queries must contain Player 01–04, Admin 01–04, Multi device 01–03, and display-only Leaderboard 01');

const files={
  player01:readFeatureSql(root,'sql/player/Player-01-stats.sql'),
  player02:readFeatureSql(root,'sql/player/Player-02-weapons-and-cosmetics.sql'),
  player03:readFeatureSql(root,'sql/player/Player-03-social-menu.sql'),
};
const ownership={
  player01:['scores','outpost_zero_arena_win_receipts','outpost_zero_bot_ladder','outpost_zero_bot_ladder_matches'],
  player02:['weapon_prices','weapon_defs'],
  player03:['profiles','social_profiles','friendships','private_messages','private_conversation_states',
    'outpost_zero_party_invite_targets','outpost_zero_party_invites','outpost_zero_public_parties','outpost_zero_public_party_requests'],
};

for(const [owner,tables] of Object.entries(ownership)){
  const source=files[owner];
  assert.equal((source.match(/^begin;$/gmi)||[]).length,1,`${owner} must use one transaction`);
  assert.equal((source.match(/^commit;$/gmi)||[]).length,1,`${owner} must use one transaction`);
  assert.match(source,/alter publication supabase_realtime/i,`${owner} must own its Realtime decision`);
  for(const table of tables){
    assert.match(source,new RegExp(`create table if not exists public\\.${table}\\b`,'i'),`${owner} must create ${table}`);
    assert.match(source,new RegExp(`alter table public\\.${table} enable row level security`,'i'),`${table} must enable RLS`);
    assert.match(source,new RegExp(`alter table public\\.${table} force row level security`,'i'),`${table} must force RLS`);
    for(const [other,otherSource] of Object.entries(files))if(other!==owner){
      assert.doesNotMatch(otherSource,new RegExp(`alter table public\\.${table} (?:enable|force) row level security`,'i'),
        `${table} RLS must be owned only by ${owner}`);
      assert.doesNotMatch(otherSource,new RegExp(`alter publication supabase_realtime (?:add|drop) table public\\.${table}\\b`,'i'),
        `${table} Realtime must be owned only by ${owner}`);
    }
  }
}

const player01Adds=[...files.player01.matchAll(/alter publication supabase_realtime add table public\.([a-z0-9_]+)/gi)].map(x=>x[1]);
const player03Adds=[...files.player03.matchAll(/alter publication supabase_realtime add table public\.([a-z0-9_]+)/gi)].map(x=>x[1]).sort();
assert.deepEqual(player01Adds,['scores'],'Player 01 publishes only scores');
assert.deepEqual(player03Adds,['friendships','private_conversation_states','private_messages'].sort(),
  'Player 03 publishes only participant/owner-filtered Social feeds');
assert.match(files.player02,/array\['weapon_prices', 'weapon_defs'\]/i,
  'Player 02 publishes only its fixed public equipment allowlist');

const readme=read('sql/README.md');
assert.match(readme,/1\. `player\/Player-04-security\.sql`[\s\S]*2\. `administration\/Admin-04-security\.sql`[\s\S]*3\. `player\/Player-03-social-menu\.sql`[\s\S]*4\. `player\/Player-01-stats\.sql`[\s\S]*5\. `player\/Player-02-weapons-and-cosmetics\.sql`/,
  'fresh setup must install section security before dependency-safe feature setup');
for(const label of ['Player 01 Stats','Player 02 Weapons and Cosmetics','Player 03 Social Menu'])
  assert.match(readme,new RegExp(`\\*\\*${label}\\*\\*`),`README must preserve saved-query name ${label}`);
assert.match(readme,/Cosmetics have no standalone SQL table[\s\S]*profiles\.data/i,
  'README must explain why cosmetic ownership remains in the private profile');
assert.match(readme,/press \*\*Save\*\*, and then press \*\*Run\*\*/i,
  'updating Supabase must mean editing, saving, and running the saved query');
const displaySql=read('sql/leaderboards/Leaderboard-01.sql').replace(/^--.*$/gm,'');
assert.match(displaySql,/^\s*with entries as/i);
assert.doesNotMatch(displaySql,/\b(?:insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i,
  'Leaderboard 01 must remain a read-only display, never a second stats installer');
assert.match(displaySql,/get_outpost_zero_public_player/,'display identities must use the privacy-safe public helper');
for(const section of ['player','administration']){
  const label=section==='player'?'Player':'Admin';
  const security=read(`sql/${section}/${label}-04-security.sql`);
  assert.match(security,/security invoker/i);
  assert.match(security,/from public,anon,authenticated,service_role/);
  for(const file of expected.filter(file=>file.startsWith(section+'/')&&!file.endsWith('-04-security.sql'))){
    const feature=read('sql/'+file),number=path.basename(file).slice(label.length+1,label.length+3);
    assert.match(feature,new RegExp(`_outpost_zero_apply_${label.toLowerCase()}_security\\('${label} ${number}'\\)`),
      `${file} must apply its security before committing`);
  }
}

const setupText=['js/social.js','js/party.js','js/ui.js','js/ai.js'].map(read).join('\n');
assert.doesNotMatch(setupText,/(?:run|rerun|install|need(?:s)?)\s+(?:the\s+)?(?:Social|Profiles|Leaderboards|Weapons|AI)\s+0[1-9]/i,
  'player-facing setup errors must name the consolidated Player query');

console.log('PASS twelve SQL sections preserve stats ownership, private security installers, and read-only leaderboards');
