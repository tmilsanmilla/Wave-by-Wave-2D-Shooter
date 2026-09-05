import fs from 'node:fs';
import { readFeatureSql } from './sql-feature-security.mjs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>file.endsWith('.sql')?readFeatureSql(root,file):fs.readFileSync(path.join(root,file),'utf8');
const admin02=read('sql/administration/Admin-02-admins.sql');
const admin03=read('sql/administration/Admin-03-inbox.sql');
const weapons=read('sql/player/Player-02-weapons-and-cosmetics.sql');
const readme=read('sql/README.md');
let passed=0,failed=0;
function check(name,condition){
  if(condition){passed++;console.log('PASS',name);}
  else{failed++;console.error('FAIL',name);}
}

check('Creator and Main own suggestion listing and review authority',
  /list_outpost_zero_weapon_suggestions_by_username[\s\S]+_outpost_zero_admin_role\(\) not in \('creator','main'\)/.test(admin02)&&
  /review_outpost_zero_weapon_suggestion[\s\S]+_outpost_zero_admin_role\(\) not in \('creator','main'\)/.test(admin02));
check('Weapon save is a Creator/Main-only SECURITY DEFINER RPC',
  /save_outpost_zero_weapon_definition\([\s\S]+security definer/.test(admin02)&&
  /v_role not in \('creator','main'\)/.test(admin02)&&
  /grant execute on function public\.save_outpost_zero_weapon_definition\(text,jsonb,integer,boolean\) to authenticated/.test(admin02));
check('Weapon save has a call-time setup error, not an install-time table dependency',
  /to_regclass\('public\.weapon_defs'\) is null/.test(admin02)&&
  /RUN_PLAYER_02_BEFORE_SAVING_WEAPONS/.test(admin02)&&
  /execute \$sql\$[\s\S]+insert into public\.weapon_defs/.test(admin02));
check('Weapon key, fields, values, price, and next-season publication are strict',
  /VALID_WEAPON_KEY_REQUIRED/.test(admin02)&&/UNKNOWN_WEAPON_STAT/.test(admin02)&&
  /WEAPON_STATS_MUST_BE_INTEGERS/.test(admin02)&&/WEAPON_STAT_OUT_OF_RANGE/.test(admin02)&&
  /WEAPON_PRICE_MUST_BE_0_TO_9999/.test(admin02)&&/NEXT_SEASON_WEAPONS_CANNOT_BE_PUBLISHED/.test(admin02));
check('Definition and legacy unscaled price save atomically with server attribution',
  /insert into public\.weapon_defs/.test(admin02)&&/insert into public\.weapon_prices/.test(admin02)&&
  /select p\.handle into v_actor_label/.test(admin02)&&
  /_outpost_zero_write_admin_audit\(null,'weapon\.definition\.edit','applied'/.test(admin02));
check('Admin 02 conditionally removes existing raw weapon writes',
  /do \$weapon_write_boundary\$/.test(admin02)&&/p\.cmd<>'SELECT'/.test(admin02)&&
  /revoke insert,update,delete,truncate,references,trigger/.test(admin02)&&
  /information_schema\.column_privileges/.test(admin02)&&
  /revoke %s \(%I\) on table public\.%I from %s/.test(admin02));
check('Player 02 is future-safe and grants only reads',
  !/weapon_(?:prices|defs)_manage/.test(weapons)&&
  !/grant (?:insert|update|delete)/i.test(weapons)&&
  /grant select on table public\.weapon_prices, public\.weapon_defs/.test(weapons));
check('New Outpost Zero reports and reads have no staff/player tier',
  !/drop column if exists reporter_role/.test(admin03)&&/r\.meta-'staff'/.test(admin03)&&
  !/'staff',case when/.test(admin03)&&!/reporter_user_id,reporter_role,created_at/.test(admin03));
check('Bulk report resolution is bounded, newest-first, scoped, and count-only',
  /resolve_outpost_zero_reports\(p_limit integer default null\)/.test(admin03)&&
  /order by r\.id desc limit v_limit for update/.test(admin03)&&
  /r\.game='outpost-zero' and not r\.resolved/.test(admin03)&&
  /REPORT_LIMIT_MUST_BE_1_TO_10000/.test(admin03)&&
  /jsonb_build_object\('resolved_count',v_changed\)/.test(admin03)&&!/resolved_ids/.test(admin03));
const adminDeploymentOrder=[
  'administration/Admin-04-security.sql',
  'player/Player-02-weapons-and-cosmetics.sql',
  'administration/Admin-01-admin-menu.sql',
  'administration/Admin-02-admins.sql',
  'administration/Admin-03-inbox.sql'
].map(file=>readme.indexOf('`'+file+'`'));
check('Deployment guide installs Admin security first and Player 02 before the three Admin features',
  adminDeploymentOrder.every((position,index)=>position>=0&&
    (index===0||position>adminDeploymentOrder[index-1])));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
