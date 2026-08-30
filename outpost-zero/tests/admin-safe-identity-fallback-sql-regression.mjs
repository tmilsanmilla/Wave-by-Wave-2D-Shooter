import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin01=read('sql/administration/Admin-01-admin-menu.sql');
const admin02=read('sql/administration/Admin-02-admins.sql');
const admin03=read('sql/administration/Admin-03-inbox.sql');

function functionSource(source,name,nextToken='create or replace function public.'){
  const start=source.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start,-1,`missing ${name}`);
  const next=source.indexOf(nextToken,start+40);
  return source.slice(start,next<0?source.length:next);
}

const identityLabel=functionSource(admin01,'_outpost_zero_admin_identity_label');
const identityList=functionSource(admin01,'list_outpost_zero_admin_identity_labels');
const admin01Resolver=functionSource(admin01,'_outpost_zero_target_email_for_username');
const admin02Resolver=functionSource(admin02,'_outpost_zero_staff_target_email_for_username');
const roster=functionSource(admin02,'list_outpost_zero_admin_roster_by_username');
const suggestions=functionSource(admin02,'list_outpost_zero_weapon_suggestions_by_username');
const targetResolver=functionSource(admin03,'_outpost_zero_admin_target_user_id');
const viewerLabel=functionSource(admin03,'_outpost_zero_admin_message_identity_label');
const messageList=functionSource(admin03,'list_my_outpost_zero_admin_messages');
const messageSend=functionSource(admin03,'send_outpost_zero_admin_message');
const reportLabel=functionSource(admin03,'_outpost_zero_report_public_name');

assert.match(identityList,
  /returns table\(user_id uuid,identity_label text,identity_kind text\)/,
  'admin identity RPC must expose only the bounded identity tuple');
assert.match(identityList,/not public\._outpost_zero_is_admin_main\(\)/,
  'admin identity RPC must enforce Creator/Main authority server-side');
assert.match(identityList,/v_count not between 1 and 100/,
  'admin identity RPC must reject empty and oversized UUID batches');
assert.match(identityList,/exists\([\s\S]*from unnest\([\s\S]*where supplied\.user_id is null/,
  'admin identity RPC must reject null UUID entries');
assert.match(identityList,/with requested as \([\s\S]*group by value[\s\S]*order by r\.first_position/,
  'admin identity RPC must deduplicate IDs without losing request order');
assert.match(admin01,
  /revoke all on function public\.list_outpost_zero_admin_identity_labels\(uuid\[\]\) from public,anon,authenticated;[\s\S]*grant execute on function public\.list_outpost_zero_admin_identity_labels\(uuid\[\]\) to authenticated;/,
  'the browser identity RPC must be authenticated-only');
assert.match(admin01,
  /revoke all on function public\._outpost_zero_admin_identity_label\(uuid\) from public,anon,authenticated;/,
  'the raw Auth identity helper must remain private');

const usernameLookup=identityLabel.indexOf('select sp.handle::text into v_label');
const emailLookup=identityLabel.indexOf('select lower(btrim(u.email))::text into v_label');
assert.ok(usernameLookup>=0&&emailLookup>usernameLookup,
  'a chosen username must be resolved before any Auth email fallback');
assert.match(identityLabel,/handle_key not in \('username_not_set','usernamenotset'\)/,
  'sentinel usernames must not suppress the fallback');
assert.match(identityLabel,/from auth\.users u/,
  'the exact fallback must come from the authoritative Auth account');

for(const [label,resolver] of [
  ['Admin 01 management resolver',admin01Resolver],
  ['Admin 02 staff resolver',admin02Resolver],
  ['Admin 03 target resolver',targetResolver]
]){
  assert.match(resolver,/left join public\.social_profiles chosen/,
    `${label} must test whether an account already chose a username`);
  assert.match(resolver,/and chosen\.user_id is null/,
    `${label} must accept exact email only for a username-less account`);
  assert.match(resolver,/char_length\([\s\S]*between 3 and 320/,
    `${label} must bound supplied identity text`);
}
assert.match(targetResolver,/not in \('creator','main'\)/,
  'Admin 03 private identity resolution must be Creator/Main-only');
assert.match(targetResolver,/p_staff_only[\s\S]*in \('main','co','tester'\)/,
  'Admin Inbox recipient resolution must optionally require a staff account');

for(const rpc of [
  'list_outpost_zero_player_requests_by_username',
  'list_outpost_zero_bans_by_username',
  'list_outpost_zero_ban_appeals_by_username',
  'list_outpost_zero_admin_audit_by_username'
]){
  assert.match(functionSource(admin01,rpc),/_outpost_zero_admin_identity_label/,
    `${rpc} must use the role-gated fallback label`);
}
assert.match(roster,
  /v_actor_role in \('creator','main'\)[\s\S]*_outpost_zero_admin_identity_label\(u\.id\)[\s\S]*else coalesce\(sp\.handle,lower\(btrim\(u\.email\)\),'UNKNOWN STAFF'\)/,
  'Admin roster must expose other fallbacks only to Creator/Main and own fallback to non-main staff');
assert.match(roster,/v_actor_role in \('creator','main'\) or u\.id=auth\.uid\(\)/,
  'non-main roster access must remain self-only');
assert.match(suggestions,/_outpost_zero_admin_identity_label\(s\.author_user_id\)/,
  'Creator/Main suggestion feed must use the safe fallback label');

assert.match(admin03,
  /recipient_username_at_send is null[\s\S]*kind='admin_message'[\s\S]*between 3 and 320/,
  'only manual admin-message labels may contain the bounded email fallback');
assert.match(viewerLabel,/v_role not in \('creator','main'\) and p_user_id<>v_actor then return null/,
  'Co/Tester must receive no fallback for another staff account');
assert.match(viewerLabel,/from auth\.users u[\s\S]*where u\.id=p_user_id/,
  'viewer-aware labels may resolve the authorized account from Auth');
assert.match(messageList,/_outpost_zero_admin_message_identity_label/g,
  'the staff Inbox must use viewer-aware labels rather than the main-only helper');
assert.doesNotMatch(messageList,/_outpost_zero_admin_identity_label/,
  'the co/tester-accessible Inbox list must never invoke the main-only helper');
assert.match(messageSend,/_outpost_zero_admin_target_user_id\(v_identity,true\)/,
  'Admin Inbox sends must use staff-scoped safe identity resolution');
assert.match(messageSend,/_outpost_zero_admin_identity_label\(v_target\)/,
  'Creator/Main sends must return the chosen username or authorized email fallback');
assert.match(reportLabel,/_outpost_zero_admin_identity_label\(p_reporter_user_id\)/,
  'Creator/Main report labels must use the safe fallback helper');

for(const helper of [
  '_outpost_zero_admin_target_user_id\\(text,boolean\\)',
  '_outpost_zero_admin_message_username\\(uuid\\)',
  '_outpost_zero_admin_message_identity_label\\(uuid\\)',
  '_outpost_zero_report_public_name\\(text,uuid\\)'
]){
  assert.match(admin03,new RegExp(`revoke all on function public\\.${helper} from public,anon,authenticated;`),
    `${helper} must not be browser-callable`);
}
for(const [name,sql] of [['Admin 02',admin02],['Admin 03',admin03]]){
  assert.match(sql,/notify pgrst, 'reload schema';[\s\S]*commit;/,
    `${name} must reload PostgREST only inside the successful transaction`);
}

console.log('PASS admin identity email fallbacks are role-gated, bounded, and username-first');
