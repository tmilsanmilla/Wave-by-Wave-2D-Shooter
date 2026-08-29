import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin01=read('sql/administration/Admin-01-admin-menu.sql');
const admin02=read('sql/administration/Admin-02-admins.sql');
const admin03=read('sql/administration/Admin-03-inbox.sql');
const administration=read('js/administration.js');
const adminUi=read('js/admin-ui.js');
const ui=read('js/ui.js');
const networking=read('js/networking.js');

const checks=[];
function check(name,value){checks.push([name,!!value]);}
const grantFor=(sql,name)=>new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}[^;]*\\bto\\s+authenticated\\s*;`,'i').test(sql);

check('Admin 01 exposes username-only moderation feeds',
  /list_outpost_zero_bans_by_username/.test(admin01)&&
  /list_outpost_zero_ban_appeals_by_username/.test(admin01)&&
  /list_outpost_zero_admin_audit_by_username/.test(admin01));
check('Admin 01 recursively scrubs legacy email keys',
  /_outpost_zero_scrub_private_admin_json/.test(admin01)&&/lower\(e\.key\) not like '%email%'/.test(admin01));
check('Admin 01 legacy email list RPCs are not granted',
  !grantFor(admin01,'list_outpost_zero_bans\\(integer\\)')&&
  !grantFor(admin01,'list_outpost_zero_ban_appeals\\(integer\\)')&&
  !grantFor(admin01,'list_outpost_zero_admin_audit\\(bigint,\\s*integer\\)')&&
  !grantFor(admin01,'admin_list_outpost_zero_weapon_grants\\(text\\)'));
check('Banned-list action uses an opaque ban id',
  /unban_outpost_zero_ban\(bigint,uuid\)/.test(admin01)&&
  /rpc\('unban_outpost_zero_ban'/.test(ui)&&
  /b\.ban_id/.test(adminUi));

check('Admin 02 roster and management are username-only',
  /list_outpost_zero_admin_roster_by_username/.test(admin02)&&
  /add_outpost_zero_admin_by_username/.test(admin02)&&
  /promote_outpost_zero_admin_by_username/.test(admin02)&&
  /demote_outpost_zero_admin_by_username/.test(admin02)&&
  /remove_outpost_zero_admin_by_username/.test(admin02));
check('Admin 02 legacy email roster/management are not granted',
  !grantFor(admin02,'list_outpost_zero_admin_roster\\(\\)')&&
  !grantFor(admin02,'add_outpost_zero_admin\\(text,text\\)')&&
  !grantFor(admin02,'promote_outpost_zero_admin\\(text\\)')&&
  !grantFor(admin02,'demote_outpost_zero_admin\\(text\\)')&&
  !grantFor(admin02,'remove_outpost_zero_admin\\(text\\)'));
check('Weapon suggestion feed returns username, never author email',
  /list_outpost_zero_weapon_suggestions_by_username/.test(admin02)&&
  /author_username text/.test(admin02)&&
  /row\.author_username/.test(adminUi));

check('Admin messages are RPC-only username records',
  /list_my_outpost_zero_admin_messages/.test(admin03)&&
  /send_outpost_zero_admin_message/.test(admin03)&&
  !/grant\s+select\s*\([^;]*(?:from_email|to_email)[^;]*\)\s+on\s+public\.admin_msgs/i.test(admin03));
check('Admin message Realtime uses a sanitized wakeup table',
  /create table if not exists public\.outpost_zero_admin_msg_wakeups/.test(admin03)&&
  /auth\.uid\(\)=recipient_id/.test(admin03)&&
  /add table public\.outpost_zero_admin_msg_wakeups/.test(admin03)&&
  /drop table public\.admin_msgs/.test(admin03)&&
  /table:'outpost_zero_admin_msg_wakeups'/.test(networking)&&
  !/table:'admin_msgs'/.test(networking));
check('Admin UI no longer consumes private identity fields',
  !/(?:from_email|to_email|author_email|actor_email|target_email|player_email|user_email|granted_by_email|ROOT_ADMIN)/.test(administration+adminUi+ui)&&
  /from_username/.test(adminUi)&&/target_username/.test(adminUi));
check('Client calls only username-safe admin boundaries',
  /list_outpost_zero_admin_roster_by_username/.test(administration)&&
  /list_outpost_zero_admin_audit_by_username/.test(administration)&&
  /list_outpost_zero_weapon_suggestions_by_username/.test(administration)&&
  /list_outpost_zero_bans_by_username/.test(ui)&&
  /list_outpost_zero_ban_appeals_by_username/.test(ui));

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`SUMMARY ${checks.length-failed}/${checks.length} passed`);
if(failed)process.exit(1);
