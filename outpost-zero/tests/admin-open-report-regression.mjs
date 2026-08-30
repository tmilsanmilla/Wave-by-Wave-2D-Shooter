import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('outpost-zero/js/administration.js');
const adminUi=read('outpost-zero/js/admin-ui.js');
const progress=read('outpost-zero/js/progression.js');
const input=read('outpost-zero/js/input.js');
const ui=read('outpost-zero/js/ui.js');
const html=read('index.html');
const admin01=read('outpost-zero/sql/administration/Admin-01-admin-menu.sql');
const admin02=read('outpost-zero/sql/administration/Admin-02-admins.sql');
const admin03=read('outpost-zero/sql/administration/Admin-03-inbox.sql');
const storageBlock=adminUi.slice(adminUi.indexOf('function drawStorage()'),adminUi.indexOf('function storageClick()'));
let failed=0,passed=0;
function check(name,condition){if(condition){passed++;console.log('PASS',name);}else{failed++;console.error('FAIL',name);}}

check('Weapon Editor pages every registry row instead of clipping at the panel edge',
  /storagePage=0/.test(adminUi)&&/list\.slice\(storagePage\*pageSize,\(storagePage\+1\)\*pageSize\)/.test(storageBlock)&&
  /\['prev','‹ PREV'/.test(storageBlock)&&/\['next','NEXT ›'/.test(storageBlock)&&!/if\(y\+h>py\+ph-52\) break;/.test(storageBlock));
check('Weapon registry is built from all primary, secondary, melee, utility, seasonal, and vault lists',
  /for\(const k of MELEES\) WEAPON_EDITOR_SLOTS\[k\]='melee'/.test(adminUi)&&
  /for\(const k of TEMP_PRIMARY\) WEAPON_EDITOR_SLOTS\[k\]='primary'/.test(adminUi)&&
  /for\(const k in VAULT_SLOTS\) WEAPON_EDITOR_SLOTS\[k\]=VAULT_SLOTS\[k\]/.test(adminUi));

check('Every account can redeem each promo once without a shared global cap',
  !/LEGACY GLOBAL CAP/.test(progress)&&!/reached its global redemption cap/.test(admin02)&&
  /update public\.promo_codes set uses_max=0 where uses_max<>0/.test(admin02)&&
  /primary key\(code,user_id\)/.test(admin02)&&/EACH ONCE/.test(adminUi));
check('Promo catalog is RPC-only and cannot be enumerated with a browser table query',
  /list_outpost_zero_promo_codes/.test(progress)&&!/from\('promo_codes'\)/.test(progress)&&
  /force row level security/.test(admin02)&&/revoke all on table public\.promo_codes,public\.promo_redemptions/.test(admin02)&&
  !/create policy[^;]+promo_codes[^;]+using\s*\(true\)/is.test(admin02));
check('Promo redemption is one row per account and serializes each code before rewarding',
  /primary key\(code,user_id\)/.test(admin02)&&/pg_advisory_xact_lock\(hashtextextended\('outpost-zero-promo:'/.test(admin02)&&
  /insert into public\.promo_redemptions\(code,user_id\).*on conflict do nothing/s.test(admin02));

check('Official updates store heading and details without deleting the legacy message API',
  /add column if not exists heading text/.test(admin02)&&/add column if not exists details text/.test(admin02)&&
  /post_outpost_zero_update_v2\(p_heading text,p_details text\)/.test(admin02)&&
  /post_outpost_zero_update\(p_message text\)/.test(admin02)&&/list_outpost_zero_updates_v2/.test(admin02));
check('Official update composer and readers use heading for lists and details for full text',
  /id="postheading"/.test(html)&&/maxlength="4000"/.test(html)&&/post_outpost_zero_update_v2/.test(admin)&&
  /String\(b\.heading\|\|b\.message/.test(adminUi)&&/String\(row\.details\|\|row\.message/.test(ui)&&
  /new\.heading, new\.details/.test(admin03)&&/char_length\(message\) between 1 and 4000/.test(admin03));

check('Requests aggregates edits, updates, and appeals while suggestions stay separate',
  /kind:'player'/.test(admin)&&/kind:'update'/.test(admin)&&!/kind:'weapon'/.test(admin)&&/kind:'appeal'/.test(admin)&&
  /PLAYER EDITS .* UPDATE APPROVALS .* BAN APPEALS/.test(adminUi)&&/ADMIN SUGGESTIONS/.test(adminUi)&&
  /k:'requests'.*drawAdminRequests\(\).*adminRequestsClick\(\)/.test(input));
check('Requests retain type-correct approval and rejection actions',
  /approveScoreReq\(row\).*rejectScoreReq\(row\)/s.test(adminUi)&&/approveBanner\(row\.id\).*rejectBanner\(row\.id\)/s.test(adminUi)&&
  !/reviewWeaponSuggestion\(row\.id/.test(adminUi)&&/resolveAppeal\(row\.id/.test(adminUi)&&
  /reviewWeaponSuggestion\(r\.suggestionId/.test(adminUi));

check('Main admins apply permanent player edits directly in client and server',
  /if\(hasPermanent&&isMainAdmin\(\)\)\{await applyPlayerEdit/.test(admin)&&
  /if\(isMainAdmin\(\)\)\{\s*await applyPlayerEdit/.test(admin)&&
  !/if v_actor_role = 'main' and \(/.test(admin01)&&
  /_outpost_zero_admin_role\(\) not in \('creator','main'\)/.test(admin01));

check('Only Creator can mint or remove Main admins and every staff change is audited',
  /if next_role='main' and actor_role<>'creator'/.test(admin02)&&
  /_outpost_zero_write_admin_audit\(target_user_id,'admin\.promote'/.test(admin02)&&
  /_outpost_zero_write_admin_audit\(v_target_user_id,'admin\.remove'/.test(admin02)&&
  /row\.rank==='co'&&isCreator\(\)/.test(adminUi));

check('Appeals are Main-only and failed player requests retain a valid terminal state',
  /list_outpost_zero_ban_appeals_by_username[\s\S]+_outpost_zero_admin_role\(\) not in \('creator','main'\)/.test(admin01)&&
  /player_requests_status_check[\s\S]+pending','approved','rejected','failed/.test(admin01));

check('Promo guesses and weapon suggestions are rate-limited under per-actor locks',
  /outpost_zero_promo_attempts/.test(admin02)&&/attempt_row\.attempts>=12/.test(admin02)&&
  admin02.indexOf("pg_advisory_xact_lock(hashtextextended('outpost-zero-weapon-suggestion:")<
    admin02.indexOf("select count(*) from public.outpost_zero_weapon_suggestions"));

const activeAdminText=[admin,adminUi,input,ui,progress,admin01,admin02,admin03].join('\n');
check('Active Admin code contains no creator private-email literal',!/tmilsanmilla@gmail\.com/i.test(activeAdminText));
check('Creator authority is pinned once from public username to a private UUID config',
  /create table if not exists public\.outpost_zero_admin_config/.test(admin01)&&
  /where sp\.handle_key='tedmils'/.test(admin01)&&/on conflict\(singleton\) do nothing/.test(admin01)&&
  /_outpost_zero_creator_user_id\(\)/.test(admin01)&&
  /revoke all on table public\.outpost_zero_admin_config from public,anon,authenticated/.test(admin01)&&
  /v_user_id = public\._outpost_zero_creator_user_id\(\)/.test(admin01));

check('Active-ban RPC converts JSON scopes safely instead of failing open',
  /get_my_outpost_zero_ban\(p_device text\)[\s\S]+array\(select jsonb_array_elements_text\(b\.scopes\)\)/.test(admin01)&&
  !/b\.scopes::text\[\]/.test(admin01));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
