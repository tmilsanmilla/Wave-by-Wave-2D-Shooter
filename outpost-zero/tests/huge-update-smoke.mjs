import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {readFeatureSql} from './sql-feature-security.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('js/administration.js'),adminUi=read('js/admin-ui.js'),ui=read('js/ui.js'),input=read('js/input.js'),party=read('js/party.js'),social=read('js/social.js'),styles=read('styles.css'),audio=read('js/audio.js'),persistence=read('js/persistence.js');
const admin01Sql=readFeatureSql(root,'sql/administration/Admin-01-admin-menu.sql');
const admin02Sql=readFeatureSql(root,'sql/administration/Admin-02-admins.sql');
const admin03Sql=readFeatureSql(root,'sql/administration/Admin-03-inbox.sql');
const adminSql=[admin01Sql,admin02Sql,admin03Sql].join('\n');
const player01Sql=readFeatureSql(root,'sql/player/Player-01-stats.sql');
const player02Sql=readFeatureSql(root,'sql/player/Player-02-weapons-and-cosmetics.sql');
const player03Sql=readFeatureSql(root,'sql/player/Player-03-social-menu.sql');
const leaderboardSecuritySql=player01Sql,weaponsSql=player02Sql,
  socialCoreSql=player03Sql,socialSettingsSql=player03Sql,partySql=player03Sql,socialSecuritySql=player03Sql;
const failures=[];let passes=0;
function check(name,condition){if(condition){passes++;console.log('PASS',name);}else{console.error('FAIL',name);failures.push(name);}}

const auditStart=admin.indexOf('const ADMIN_AUDIT_ACTION_TITLES='),auditEnd=admin.indexOf('async function fetchAdminAuditLog',auditStart),auditContext={};
vm.runInNewContext(admin.slice(auditStart,auditEnd)+'\nthis.auditFormat={summary:adminAuditHumanSummary,details:adminAuditDetailsText};',auditContext);
const auditFormat=auditContext.auditFormat,
  grantSummary=auditFormat.summary({action:'permanent_weapon.grant',result:'applied',details:{weapon_keys:['ar','twinsai'],accepted:true}}),
  editSummary=auditFormat.summary({action:'player.edit',result:'rejected',details:{fields:['grant','score'],accepted:false,reason:'target_not_found'}}),
  fallbackDetails=auditFormat.details({action:'future.toggle',result:'ok',actor:'creator',target:'operator',createdAt:'2026-08-29T12:00:00Z',details:{field:'grant',enabled:true,settings:{auto_fire:false}}});
const reportExportSection=admin.slice(admin.indexOf('function reportExportText'),admin.indexOf('async function writeReportExport'));

check('Social has neighboring Friends, Inbox, and Party tabs',/social_view_friends','FRIENDS'/.test(ui)&&/social_view_inbox','INBOX'/.test(ui)&&/social_view_party','PARTY'/.test(ui));
check('Party create collects and validates a unique public name',/UNIQUE PUBLIC PARTY NAME/.test(party)&&/partyCleanPublicName\(values\.partyname\)/.test(party));
check('Party directory searches by name or host',/public_party_search/.test(ui)&&/partyPublicPromptSearch/.test(input)&&/p_search:publicPartySearch/.test(party));
check('Player profile offers Message and Add Friend',/label:'MESSAGE'/.test(social)&&/label:'ADD FRIEND'/.test(social));
check('Player profile offers secure Block and targeted Report actions',/set_outpost_zero_player_block/.test(social)&&/label:blockedByMe\?'UNBLOCK':'BLOCK'/.test(social)&&/label:'REPORT'/.test(social)&&/openReportForUsername\(username\)/.test(social));
check('Profile reader renders all four profile actions in a responsive grid',/slice\(0,4\)/.test(adminUi)&&/buttonRows=Math\.ceil\(actions\.length\/buttonCols\)/.test(adminUi));

check('Tester is a real client role',/function isTester\(\)/.test(admin)&&/adminSelfRole==='tester'/.test(admin));
check('Tester tools are restricted to Test Mode and Admin Inbox',/TESTER .* test mode only/.test(adminUi)&&/if\(canPostUpdates\(\)\)actionBtn\('post'/.test(adminUi)&&/if\(canUsePlayerTools\(\)\)actionBtn\('players'/.test(adminUi)&&!/suggest_weapon/.test(adminUi));
check('Mains review stored Admin Suggestions in their separate workspace',/function canReviewWeaponSuggestions\(\).*isMainAdmin\(\)/.test(admin)&&/ADMIN SUGGESTIONS/.test(adminUi)&&!/openWeaponSuggestionForm/.test(admin));
check('Admin roster exposes Promote, Demote, and Kick',/PROMOTE/.test(adminUi)&&/DEMOTE/.test(adminUi)&&/KICK/.test(adminUi)&&/demoteAdmin/.test(adminUi));
check('Client setup guidance uses the consolidated Admin modules',!/Administration 04|Administration 05/.test(admin)&&/Admin 02 Admins/.test(admin));

check('Reports screen has Action and Amount dropdowns for Copy or Resolve',/report_action_menu/.test(adminUi)&&/report_amount_menu/.test(adminUi)&&/report_action_copy/.test(adminUi)&&/report_action_resolve/.test(adminUi)&&/report_amount_all/.test(adminUi)&&/report_amount_custom/.test(adminUi));
check('Report export uses explicit labeled fields',/OUTPOST ZERO REPORT EXPORT/.test(admin)&&/TYPE: /.test(admin)&&/STATUS: /.test(admin)&&/MESSAGE: /.test(admin));
check('Copied reports omit per-report usernames and timestamps',!/'FROM: '/.test(reportExportSection)&&!/'CREATED: '/.test(reportExportSection));
check('Report identity and staff role are derived by the server',/submit_outpost_zero_report/.test(read('js/networking.js'))&&
  !/from\('reports'\)/.test(read('js/networking.js'))&&/v_role:=public\._outpost_zero_staff_role\(\)/.test(admin03Sql));
check('Fresh music and sound defaults are both 50% while saved values still override them',/let musicVol = 0\.5, sfxVol = 0\.5/.test(audio)&&/if\(typeof m\.mv==='number'\) musicVol=m\.mv/.test(persistence)&&/if\(typeof m\.sv==='number'\) sfxVol=m\.sv/.test(persistence));
check('Audit summaries explain representative weapon and player edits',grantSummary==='Granted permanent access to SCAR-H Rifle, Twin Sai.'&&/requested changes: permanent weapon access, score/i.test(editSummary)&&/that player was not found/i.test(editSummary));
check('Audit list and reader both use action-aware plain-English formatting',/adminAuditActionTitle\(row\.action\)/.test(adminUi)&&/adminAuditDetailsSummary\(row\)/.test(adminUi)&&/adminAuditActionTitle\(r\.row\.action\)/.test(adminUi));
check('Unknown audit details have a readable fallback without raw booleans or JSON',/Requested change: permanent weapon access/.test(fallbackDetails)&&/Enabled: yes/.test(fallbackDetails)&&/Auto Fire: no/.test(fallbackDetails)&&!/true|false|\{|\}|\[|\]|"/.test(fallbackDetails));
check('Report refresh separates sanitized active/archive keyset pages and rejects stale responses',/fetchReportRowsByState\(false\)/.test(admin)&&/fetchReportRowsByState\(true\)/.test(admin)&&/p_before_id:beforeId/.test(admin)&&/list_outpost_zero_reports/.test(admin)&&/request!==reportFetchSeq/.test(admin));
check('Report refresh failures preserve the last confirmed lists',/REFRESH FAILED · SHOWING LAST SAVED REPORT LIST/.test(admin)&&!/catch\(e\)\{ if\(adminPrivacyRequestCurrent\(epoch,userId\)\)\{updatesFeed=\{staff:\[\],player:\[\]\};updatesResolved=\[\];\} \}/.test(admin));
check('Resolve waits for a confirmed sanitized RPC row before archiving',/REPORT_RESOLVE_NOT_SAVED/.test(admin)&&/publishResolvedReport\(id,saved\)/.test(admin)&&/resolve_outpost_zero_report/.test(admin)&&/REPORT WAS NOT REMOVED/.test(admin));
check('Report Realtime uses a privacy-safe reviewer wakeup',/startRealtimeSection\('adminReports','oz-admin-reports-live'/.test(read('js/networking.js'))&&/addPrivateWakeupHandlers\(channel,'outpost_zero_report_wakeups','adminReports'/.test(read('js/networking.js'))&&!/table:'reports'/.test(read('js/networking.js')));
check('Report state index protects separate active and archive reads',/outpost_zero_reports_resolved_id_idx/.test(admin03Sql)&&/reports\(resolved,id desc\)/.test(admin03Sql));
check('Older active and resolved reports remain reachable with a virtual scroller',/report_view:'\+id/.test(adminUi)&&/firstVisible=Math\.max/.test(adminUi)&&/lastVisible=Math\.min/.test(adminUi)&&/scrollReportsBy/.test(input));
check('Every Admin Inbox canvas and its reader use the shared workspace frame',(adminUi.match(/adminInboxBounds\(\)/g)||[]).length>=6&&/privateInboxReader\?adminInboxBounds\(\)/.test(adminUi));
check('Admin workspaces meet actual ad-rail edges and retain the phone safe edge',/sideAdMetrics/.test(adminUi)&&/railLeft=geo\.edge\+geo\.aw/.test(adminUi)&&/railRight=W-geo\.edge-geo\.aw/.test(adminUi)&&/railLeft=adLeftRect\.x\+adLeftRect\.w/.test(adminUi)&&/railRight=adRightRect\.x/.test(adminUi)&&/return \{pw,ph:Math\.max\(1,H-edge\*2\),px,py:edge\}/.test(adminUi));
check('Admin Inbox and Suggestions controls use compact centered strips',/adminControlStrip\(px,pw,520\)/.test(adminUi)&&/adminControlStrip\(px,pw,720\)/.test(adminUi)&&/adminControlStrip\(px,pw,370\)/.test(adminUi)&&/adminControlStrip\(px,pw,620/.test(adminUi));
check('Admin Inbox rows expand while compose buttons stay compact',/maxRows=Math\.max\(1,Math\.floor\(\(py\+ph-54-y\)\/.+\)\)/.test(adminUi)&&/width:min\(100%,360px\);align-self:center/.test(styles));

check('SQL keeps legacy admin authority blind to Testers',/_outpost_zero_staff_role/.test(adminSql)&&/older Administration 01 authority helper deliberately blind/.test(adminSql)&&/when 'tester' then 'tester'/.test(adminSql)===false);
check('SQL gives Testers only their RPC-filtered Admin Inbox',/list_my_outpost_zero_admin_messages/.test(admin03Sql)&&/coalesce\(m\.from_user_id,fu\.id\)=v_actor or coalesce\(m\.to_user_id,tu\.id\)=v_actor/.test(admin03Sql)&&/revoke all on table public\.admin_msgs/.test(admin03Sql));
check('SQL stores and reviews weapon suggestions',/create table if not exists public\.outpost_zero_weapon_suggestions/.test(adminSql)&&/submit_outpost_zero_weapon_suggestion/.test(adminSql)&&/review_outpost_zero_weapon_suggestion/.test(adminSql));
check('SQL lists and exports sanitized reports only through the main-admin boundary',/export_outpost_zero_reports/.test(adminSql)&&/list_outpost_zero_reports/.test(adminSql)&&/REPORT_ACCESS_REQUIRED/.test(adminSql)&&/_outpost_zero_sanitized_report_meta/.test(adminSql));
check('Administration 02 leaves unpublished-weapon enforcement to game code',!/_outpost_zero_weapon_is_published/.test(admin02Sql)&&!/_outpost_zero_strip_unpublished_owned/.test(admin02Sql));
check('Consolidated Admin SQL does not depend on removed SQL weapon enforcement',!/_outpost_zero_weapon_is_published/.test(adminSql)&&!/PUBLISHED_WEAPON_REQUIRED/.test(adminSql));
check('Admin Menu explicitly keeps private tables out of Realtime',/alter publication supabase_realtime drop table public\.%I/.test(admin01Sql)&&/'outpost_zero_admin_audit'/.test(admin01Sql));
check('Admins publishes banners but never raw admin rows',/add table public\.banners/.test(admin02Sql)&&/drop table public\.admins/.test(admin02Sql)&&!/add table public\.admins/.test(admin02Sql));
check('Admin Inbox owns privacy-safe Realtime feeds',/outpost_zero_admin_msg_wakeups/.test(admin03Sql)&&/outpost_zero_report_wakeups/.test(admin03Sql)&&/drop table public\.admin_msgs/.test(admin03Sql)&&/drop table public\.reports/.test(admin03Sql)&&/add table public\.outpost_zero_report_wakeups/.test(admin03Sql)&&/force row level security/.test(admin03Sql));
check('Player 01 owns score security and Realtime',/alter table public\.scores force row level security/.test(leaderboardSecuritySql)&&/add table public\.scores/.test(leaderboardSecuritySql));
check('Player 02 owns price and definition security plus Realtime',/alter table public\.weapon_prices force row level security/.test(weaponsSql)&&/alter table public\.weapon_defs force row level security/.test(weaponsSql)&&/array\['weapon_prices', 'weapon_defs'\]/.test(weaponsSql));
check('SQL supports unique public names and host/name search',/unique index.*outpost_zero_public_party_name_unique_idx/s.test(partySql)&&/p\.party_name ilike/.test(partySql)&&/sp\.handle ilike/.test(partySql));
check('Player 03 uses Realtime handles without a database heartbeat table',/p_online_usernames text\[\]/.test(partySql)&&!/create table if not exists public\.outpost_zero_social_presence/.test(partySql));
check('Game tracks online Party targets through Realtime Presence',/oz-social-party-online-v1/.test(social)&&/\.on\('presence',\{event:'sync'\}/.test(social)&&!/rpc\('touch_outpost_zero_social_presence'\)/.test(social));
check('Player 03 contains the complete Social perimeter',/create policy social_profiles_authenticated_read/.test(socialSecuritySql)&&/create policy friendships_participant_read/.test(socialSecuritySql)&&/create policy private_messages_participant_read/.test(socialSecuritySql)&&/create policy private_conversation_states_owner_read/.test(socialSecuritySql));
check('Player 03 includes threaded Inbox storage and messaging',/create table if not exists public\.private_conversation_states/.test(socialCoreSql)&&/send_outpost_zero_private_message/.test(socialCoreSql)&&/position > 25/.test(socialCoreSql));
check('Social block RPC resolves only public usernames and never emits a fake friend request',/set_outpost_zero_player_block/.test(socialCoreSql)&&/where p\.handle_key = v_handle_key/.test(socialCoreSql)&&/values \(v_actor, v_target, 'blocked', v_actor\)/.test(socialCoreSql)&&/alter function public\.set_outpost_zero_player_block\(text, boolean\) security definer/.test(socialSecuritySql));
check('Player 03 elevates only its reviewed Social entry points',/alter function public\.send_outpost_zero_party_invite\([^)]+\) security definer/i.test(socialSecuritySql)&&/alter function public\.send_outpost_zero_private_message\([^)]+\) security definer/i.test(socialSecuritySql));
check('Player 03 applies its extracted Social RLS and privileges with its feature Realtime',/enable row level security/i.test(player03Sql)&&/create policy/i.test(player03Sql)&&/alter publication supabase_realtime/i.test(player03Sql)&&/grant execute/i.test(player03Sql)&&/revoke all on table/i.test(player03Sql)&&/_outpost_zero_apply_player_security\('Player 03'\)/.test(player03Sql));

if(failures.length){console.error(`SUMMARY FAIL ${failures.length}`);process.exit(1);}
console.log('SUMMARY PASS',passes);
