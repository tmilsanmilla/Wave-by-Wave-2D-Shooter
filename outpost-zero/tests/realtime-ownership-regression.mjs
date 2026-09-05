import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readFeatureSql} from './sql-feature-security.mjs';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin01=readFeatureSql(root,'sql/administration/Admin-01-admin-menu.sql');
const admin02=readFeatureSql(root,'sql/administration/Admin-02-admins.sql');
const admin03=readFeatureSql(root,'sql/administration/Admin-03-inbox.sql');
const player01=readFeatureSql(root,'sql/player/Player-01-stats.sql');
const player02=readFeatureSql(root,'sql/player/Player-02-weapons-and-cosmetics.sql');
const player03=readFeatureSql(root,'sql/player/Player-03-social-menu.sql');
const multi03=read('sql/multi-device/Multi-device-03-security.sql');
const networking=read('js/networking.js');
const social=read('js/social.js');
const readme=read('sql/README.md');

function sqlFiles(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const target=path.join(dir,entry.name);
    return entry.isDirectory()?sqlFiles(target):entry.name.endsWith('.sql')?[target]:[];
  });
}
function between(source,start,end){
  const from=source.indexOf(start);assert.ok(from>=0,`missing section: ${start}`);
  const to=source.indexOf(end,from);assert.ok(to>from,`missing section end: ${end}`);
  return source.slice(from,to);
}
function literalAdds(source){
  return [...source.matchAll(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.([a-z0-9_]+)/gi)]
    .map(match=>match[1].toLowerCase()).sort();
}
function assertNames(section,names,label){
  for(const name of names)assert.match(section,new RegExp(`(?:'|public\\.)${name}(?:'|\\b)`,'i'),`${label} must own ${name}`);
}

const files=sqlFiles(path.join(root,'sql'));
assert.deepEqual(files.filter(file=>/realtime/i.test(path.basename(file))),[],
  'Realtime configuration must live in feature SQL, not a standalone Realtime file');

const admin01Rt=between(admin01,'-- REALTIME OWNERSHIP','-- PostgREST normally');
const admin02Rt=between(admin02,'-- Existing projects already publish banners','-- Tester/Co-admin suggestion workflow');
const admin03Rt=between(admin03,'alter table public.outpost_zero_admin_msg_wakeups replica identity full;','-- Admin Inbox owns its own yearly retention');
const player01Rt=player01;
const player02Rt=player02;
const player03Rt=player03;

assert.deepEqual(literalAdds(admin01Rt),[],'Admin 01 must publish no raw Admin Menu table');
assertNames(admin01Rt,[
  'admins','outpost_zero_admin_config','bans','player_requests','ban_appeals',
  'outpost_zero_weapon_grants','outpost_zero_admin_audit'
],'Admin 01 private removal');
assert.match(admin01Rt,/alter publication supabase_realtime drop table public\.%I/i);

assert.deepEqual(literalAdds(admin02Rt),['banners'],'Admin 02 may publish only banners');
assertNames(admin02Rt,[
  'admins','outpost_zero_weapon_suggestions','promo_codes','promo_redemptions',
  'outpost_zero_promo_attempts'
],'Admin 02 private removal');

assert.deepEqual(literalAdds(admin03Rt),[
  'outpost_zero_admin_msg_wakeups','outpost_zero_report_wakeups'
].sort(),'Admin 03 may publish only sanitized wakeups');
assertNames(admin03Rt,[
  'admin_msgs','reports','outpost_zero_notifications','outpost_zero_notification_reads'
],'Admin 03 private removal');
for(const table of ['outpost_zero_admin_msg_wakeups','outpost_zero_report_wakeups']){
  assert.match(admin03,new RegExp(`alter table public\\.${table} force row level security`,'i'));
  assert.match(admin03,new RegExp(`auth\\.uid\\(\\)=recipient_id`,'i'));
  assert.match(admin03,new RegExp(`grant select\\(recipient_id,revision,updated_at\\) on public\\.${table}`,'i'));
}

assert.deepEqual(literalAdds(player03Rt),[
  'friendships','private_conversation_states','private_messages'
].sort(),'Player 03 may publish only its three participant/owner-filtered refresh feeds');
assertNames(player03Rt,[
  'social_profiles','outpost_zero_party_invite_targets','outpost_zero_party_invites',
  'outpost_zero_public_parties','outpost_zero_public_party_requests','profiles'
],'Player 03 private/non-subscribed removal');

assert.deepEqual(literalAdds(player01Rt),['scores'],'Player 01 may publish only scores');
assert.match(player01Rt,/drop table public\.outpost_zero_arena_win_receipts/i);
assertNames(player01Rt,[
  'outpost_zero_bot_ladder','outpost_zero_bot_ladder_matches',
  'outpost_zero_bot_models','outpost_zero_bot_model_state',
  'outpost_zero_bot_model_audit','outpost_zero_ai_training_matches',
  'global_bot_training','global_bot_training_contributions'
],'Player 01 private/retired removal');

assert.deepEqual(literalAdds(player02Rt),[],'Player 02 uses one reviewed dynamic allowlist');
assert.match(player02Rt,/array\['weapon_prices', 'weapon_defs'\]/i);
assert.equal((player02Rt.match(/add table public\.%I/gi)||[]).length,1,
  'Player 02 must add only the two names from its fixed allowlist');
assert.match(player01Rt,/to_regclass\(format\('public\.%I', relation_name\)\) is not null/i,
  'retired optional CPU tables must be guarded when absent');

assert.deepEqual(literalAdds(multi03),['outpost_zero_duel_wakeups'],
  'multiplayer publishes only its account-filtered wakeup, not matches/reports/ratings');
assert.match(multi03,/for select to authenticated using\(user_id=\(select auth.uid\(\)\)\)/);
assert.match(read('js/duels-service.js'),/table:'outpost_zero_duel_wakeups',filter:'user_id=eq\.'/);
assert.match(read('js/multidevice.js'),/sb\.channel\('oz-duel:'[\s\S]*?private:true/);

const allSql=[admin01,admin02,admin03,player01,player02,player03,multi03].join('\n');
const directAdds=literalAdds(allSql);
assert.deepEqual(directAdds,[
  'banners','friendships','outpost_zero_admin_msg_wakeups',
  'outpost_zero_report_wakeups','private_conversation_states',
  'private_messages','scores','outpost_zero_duel_wakeups'
].sort(),'No feature may directly publish an unreviewed table');
assert.equal((allSql.match(/add table public\.%I/gi)||[]).length,1,
  'only Player 02 may use a dynamic publication ADD, backed by its fixed two-table allowlist');

for(const table of [
  'admins','admin_msgs','reports','outpost_zero_admin_config',
  'outpost_zero_admin_audit','outpost_zero_notifications',
  'outpost_zero_notification_reads','outpost_zero_weapon_suggestions',
  'promo_codes','promo_redemptions','outpost_zero_promo_attempts',
  'profiles','outpost_zero_arena_win_receipts','social_profiles',
  'outpost_zero_party_invite_targets','outpost_zero_party_invites',
  'outpost_zero_public_parties','outpost_zero_public_party_requests',
  'outpost_zero_bot_ladder','outpost_zero_bot_ladder_matches',
  'outpost_zero_bot_models','outpost_zero_bot_model_state',
  'outpost_zero_bot_model_audit','outpost_zero_ai_training_matches',
  'outpost_zero_duel_matches','outpost_zero_duel_members','outpost_zero_duel_queue',
  'outpost_zero_ranked_ratings','outpost_zero_ranked_reports','outpost_zero_ranked_rating_changes'
])assert.doesNotMatch(allSql,new RegExp(`add\\s+table\\s+public\\.${table}\\b`,'i'),`${table} must never be published`);

for(const table of ['banners','scores','weapon_prices','weapon_defs'])
  assert.match(networking,new RegExp(`table:\\s*['"]${table}['"]`),`${table} needs a matching client refresh subscriber`);
for(const table of ['outpost_zero_admin_msg_wakeups','outpost_zero_report_wakeups'])
  assert.match(networking,new RegExp(`addPrivateWakeupHandlers\\(channel,['"]${table}['"]`),`${table} needs a matching private refresh subscriber`);
assert.match(social,/SOCIAL_FRIEND_TABLE='friendships'/);
assert.match(social,/SOCIAL_MESSAGE_TABLE='private_messages'/);
assert.match(social,/SOCIAL_CONVERSATION_TABLE='private_conversation_states'/);
for(const table of ['admins','admin_msgs','reports','outpost_zero_notifications','outpost_zero_notification_reads'])
  assert.doesNotMatch(networking+social,new RegExp(`(?:table:\\s*['"]${table}['"]|addPrivateWakeupHandlers\\([^\\n]*['"]${table}['"])`),`client must not subscribe to raw ${table} rows`);

const sectionChannels=[...networking.matchAll(/startRealtimeSection\('([^']+)','([^']+)'/g)]
  .map(match=>[match[1],match[2]]).sort((a,b)=>a[0].localeCompare(b[0]));
assert.deepEqual(sectionChannels,[
  ['adminInbox','oz-admin-inbox-live'],
  ['adminReports','oz-admin-reports-live'],
  ['adminUpdates','oz-admin-updates-live'],
  ['leaderboards','oz-leaderboards-live'],
  ['weapons','oz-weapons-live']
],'Admin and Player features need independent client channels');
assert.equal(new Set(sectionChannels.map(([,channel])=>channel)).size,sectionChannels.length,
  'each owning section needs its own channel name');
assert.match(social,/sb\.channel\('oz-social-'/,'Social must retain its independent account channel');

const privateHandlers=between(networking,'function addPrivateWakeupHandlers','function setupAdminInboxRealtime');
assert.match(privateHandlers,/\['INSERT','UPDATE'\]/,
  'private wakeups need only insert/update events');
assert.doesNotMatch(privateHandlers,/event:\s*['"]\*['"]|['"]DELETE['"]/,
  'private wakeups must never subscribe to unfilterable delete events');
const retryTick=between(networking,'function realtimeRetryTick','function realtimeFallbackTick');
assert.match(retryTick,/setupRealtimeSection\(name\)/,
  'a failed section must retry only itself');
assert.doesNotMatch(retryTick,/setupRealtime\(\)/,
  'a failed section must not restart healthy channels');

assert.match(readme,/one managed publication named\s+`supabase_realtime`/i);
assert.match(readme,/delete the old saved query named \*\*Realtime 01\*\*/i);
assert.match(readme,/never delete\s+the managed `supabase_realtime` publication/i);

console.log('realtime ownership regression: PASS');
