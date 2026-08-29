import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('js/administration.js'),adminUi=read('js/admin-ui.js'),ui=read('js/ui.js'),input=read('js/input.js'),party=read('js/party.js'),social=read('js/social.js');
const adminSql=read('sql/administration/05-testers-weapon-suggestions-and-report-copy.sql');
const admin02Sql=read('sql/administration/02-secure-updates-and-weapon-enforcement.sql');
const partySql=read('sql/social/09-public-party-names-and-search.sql');
const failures=[];
function check(name,condition){if(condition)console.log('PASS',name);else{console.error('FAIL',name);failures.push(name);}}

check('Social has neighboring Friends, Inbox, and Party tabs',/social_view_friends','FRIENDS'/.test(ui)&&/social_view_inbox','INBOX'/.test(ui)&&/social_view_party','PARTY'/.test(ui));
check('Party create collects and validates a unique public name',/UNIQUE PUBLIC PARTY NAME/.test(party)&&/partyCleanPublicName\(values\.partyname\)/.test(party));
check('Party directory searches by name or host',/public_party_search/.test(ui)&&/partyPublicPromptSearch/.test(input)&&/p_search:publicPartySearch/.test(party));
check('Player profile offers Message and Add Friend',/label:'MESSAGE'/.test(social)&&/label:'ADD FRIEND'/.test(social));

check('Tester is a real client role',/function isTester\(\)/.test(admin)&&/adminRoles\[adminEmail\(\)\]==='tester'/.test(admin));
check('Tester tools are restricted to test and suggestion paths',/TESTER .* test \+ suggest only/.test(adminUi)&&/if\(canPostUpdates\(\)\)actionBtn\('post'/.test(adminUi)&&/if\(canUsePlayerTools\(\)\)actionBtn\('players'/.test(adminUi));
check('Co-admin and Tester can suggest while mains review',/function canSuggestWeaponEdits\(\).*isTester\(\).*isCoAdmin\(\)/.test(admin)&&/function canReviewWeaponSuggestions\(\).*isMainAdmin\(\)/.test(admin));
check('Admin roster exposes Promote, Demote, and Kick',/PROMOTE/.test(adminUi)&&/DEMOTE/.test(adminUi)&&/KICK/.test(adminUi)&&/demoteAdmin/.test(adminUi));

check('Reports screen has All, Custom, and Copy X controls',/report_copy_all/.test(adminUi)&&/report_copy_custom/.test(adminUi)&&/COPY '\+reportCopyCustomCount/.test(adminUi));
check('Report export uses explicit labeled fields',/OUTPOST ZERO REPORT EXPORT/.test(admin)&&/TYPE: /.test(admin)&&/STATUS: /.test(admin)&&/MESSAGE: /.test(admin));

check('SQL keeps legacy admin authority blind to Testers',/_outpost_zero_staff_role/.test(adminSql)&&/older Administration 01 authority helper deliberately blind/.test(adminSql)&&/when 'tester' then 'tester'/.test(adminSql)===false);
check('SQL gives Testers only own Admin Inbox policy',/outpost_zero_admin_msgs_own_read/.test(adminSql)&&/lower\(btrim\(to_email\)\)=public\._outpost_zero_admin_email\(\)/.test(adminSql));
check('SQL stores and reviews weapon suggestions',/create table if not exists public\.outpost_zero_weapon_suggestions/.test(adminSql)&&/submit_outpost_zero_weapon_suggestion/.test(adminSql)&&/review_outpost_zero_weapon_suggestion/.test(adminSql));
check('SQL exports reports only through the main-admin boundary',/export_outpost_zero_reports/.test(adminSql)&&/REPORT_ACCESS_REQUIRED/.test(adminSql)&&/outpost_zero_reports_main_read/.test(adminSql));
check('Administration 02 includes unpublished-weapon enforcement',/_outpost_zero_weapon_is_published/.test(admin02Sql)&&/_outpost_zero_strip_unpublished_owned/.test(admin02Sql)&&/outpost_zero_weapon_defs_cleanup_access/.test(admin02Sql));
check('SQL supports unique public names and host/name search',/unique index.*outpost_zero_public_party_name_unique_idx/s.test(partySql)&&/p\.party_name ilike/.test(partySql)&&/sp\.handle ilike/.test(partySql));

if(failures.length){console.error(`SUMMARY FAIL ${failures.length}`);process.exit(1);}
console.log('SUMMARY PASS',16);
