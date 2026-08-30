import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const adminUi=read('js/admin-ui.js'),admin=read('js/administration.js'),ui=read('js/ui.js'),input=read('js/input.js');
let failed=0,total=0;
function check(name,ok){total++;if(ok)console.log('PASS',name);else{failed++;console.error('FAIL',name);}}

const hubInbox=ui.indexOf("defs.push({id:'msgs'"),hubSuggestions=ui.indexOf("defs.push({id:'suggestions'");
check('Main Suggestions hub card sits immediately after Admin Inbox',hubInbox>=0&&hubSuggestions>hubInbox&&/if\(isMainAdmin\(\)\)\s*defs\.push\(\{id:'suggestions'/.test(ui));
check('Admin Inbox navigation contains only Messages and Archive',/function drawInboxTabs[\s\S]*TABS\.push\(\['msgs'/.test(adminUi)&&/function drawInboxTabs[\s\S]*TABS\.push\(\['archive'/.test(adminUi)&&!/function drawInboxTabs[\s\S]{0,500}TABS\.push\(\['updates'/.test(adminUi)&&!/function drawInboxTabs[\s\S]{0,500}TABS\.push\(\['log'/.test(adminUi));
check('Suggestions workspace owns Reports, Admin Suggestions, and Log tabs',/function drawSuggestionsTabs[\s\S]*REPORTS[\s\S]*ADMIN SUGGESTIONS[\s\S]*LOG/.test(adminUi));
check('Resolved reports moved out of Inbox and into Suggestions Reports filter',/report_view:'\+id/.test(adminUi)&&/RESOLVED \\u00b7/.test(adminUi)&&/function drawArchive\(\)[\s\S]*ARCHIVED ADMIN MESSAGES/.test(adminUi)&&!/'RESOLVED REPORTS'/.test(adminUi));
check('Reports use one unified collection and export type',/updatesFeed=\{reports:open\}/.test(admin)&&/'TYPE: REPORT'/.test(admin)&&!/updatesFeed\.(staff|player)/.test(adminUi+admin)&&!/'STAFF REPORT'|'PLAYER REPORT'/.test(admin));
check('Report canvas virtualizes the maximum visible rows',/firstVisible=Math\.max/.test(adminUi)&&/lastVisible=Math\.min/.test(adminUi)&&/for\(let index=firstVisible;index<lastVisible;index\+\+\)/.test(adminUi)&&!/rows\.forEach\(\(r,index\)=>/.test(adminUi));
check('Report list supports wheel and touch scrolling',/modal\.k==='updates'&&reportScrollContains/.test(input)&&/scrollReportsBy\(amount\)/.test(input)&&/peScrollTouchKind==='audit'.*scrollAdminAuditBy.*else scrollReportsBy/.test(input));
check('Report Action and Amount dropdowns expose Copy, Resolve, All, and Custom',/report_action_menu/.test(adminUi)&&/report_action_copy/.test(adminUi)&&/report_action_resolve/.test(adminUi)&&/report_amount_menu/.test(adminUi)&&/report_amount_all/.test(adminUi)&&/report_amount_custom/.test(adminUi)&&/runReportBulkAction/.test(adminUi+admin));
check('Bulk resolve uses one atomic server call',/rpc\('resolve_outpost_zero_reports',\{p_limit:requested\}\)/.test(admin)&&!/for\(const row of rows\)[\s\S]{0,180}resolveReport/.test(admin));
check('Bulk and row report resolves cannot race',/if\(reportCopyBusy\|\|!canAccessReports\(\)/.test(admin)&&
  (admin.match(/if\(reportCopyBusy\|\|reportResolveBusy\.size\|\|!canAccessReports\(\)\)return false/g)||[]).length>=2&&
  /working=reportCopyBusy\|\|reportResolveBusy\.size>0/.test(adminUi)&&/!resolved&&!reportCopyBusy&&!reportResolveBusy/.test(adminUi));
check('Dropdown hit testing prioritizes topmost options',/for\(let i=updatesRects\.length-1;i>=0;i--\)/.test(adminUi)&&/reportActionMenuOpen\|\|reportAmountMenuOpen/.test(adminUi));
check('Admin Tools no longer exposes weapon suggestion submission',!/suggest_weapon/.test(adminUi)&&!/openWeaponSuggestionForm|SUGGEST WEAPON EDIT/.test(admin)&&!/kind:'weapon'/.test(admin));
check('Requests keeps edits, updates, and appeals only',/PLAYER EDITS · UPDATE APPROVALS · BAN APPEALS/.test(adminUi)&&!/PLAYER EDITS · UPDATE APPROVALS · WEAPON/.test(adminUi));
check('Admin Suggestions uses every visible row and exposes older pages',/Math\.floor\(room\/rowH\)/.test(adminUi)&&/weaponSuggestionPage\*maxRows/.test(adminUi)&&/ws_newer/.test(adminUi)&&/ws_older/.test(adminUi)&&/p_limit:100/.test(admin));
check('Suggestion load errors offer an in-game retry instead of SQL instructions',/COULD NOT LOAD ADMIN SUGGESTIONS \\u00b7 TRY REFRESH/.test(admin)&&!/RUN ADMIN 02 ADMINS TO LOAD SUGGESTIONS/.test(admin));
check('Inbox and Suggestions button rows have desktop width caps',/adminControlStrip\(px,pw,520\)/.test(adminUi)&&/adminControlStrip\(px,pw,720\)/.test(adminUi)&&/adminControlStrip\(px,pw,620/.test(adminUi)&&/adminControlStrip\(px,pw,680/.test(adminUi));
check('Cancelling an Admin Suggestion decision makes no change',/if\(rawNote===null\)return false/.test(admin)&&/catch\(error\)\{return false;\}/.test(admin));
check('Account changes invalidate report and suggestion work in flight',/reportCopyBusy=false;reportCopyStatus='';reportCopyMode='all';reportBulkAction='copy'/.test(admin)&&
  /weaponSuggestionRequestSeq\+\+;weaponSuggestionBusy=false/.test(admin)&&/request===weaponSuggestionRequestSeq&&adminPrivacyRequestCurrent/.test(admin));
check('Main weapon saves use the protected Admin 02 RPC only',/rpc\('save_outpost_zero_weapon_definition'/.test(adminUi)&&/raw\.weapon_key\|\|raw\.key/.test(adminUi)&&!/from\('weapon_defs'\)\.upsert/.test(adminUi)&&!/from\('weapon_prices'\)\.upsert/.test(adminUi+admin)&&/RUN ADMIN 02 ADMINS/.test(adminUi));
check('Weapon saves produce a plain-language Log entry',/'weapon\.definition\.edit':'Weapon settings changed'/.test(admin)&&/action==='weapon\.definition\.edit'/.test(admin)&&/Gem price:/.test(admin)&&/Published:/.test(admin));

console.log(`SUMMARY ${total-failed}/${total} passed`);
if(failed)process.exit(1);
