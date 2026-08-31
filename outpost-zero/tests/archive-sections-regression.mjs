import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const administration=read('js/administration.js');
const adminUi=read('js/admin-ui.js');
const social=read('js/social.js');
const ui=read('js/ui.js');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} must exist`);
  const body=source.indexOf('{',start);
  let depth=0,quote='',escape=false;
  for(let i=body;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escape)escape=false;
      else if(ch==='\\')escape=true;
      else if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw new Error(`Could not extract ${name}`);
}

// Audit rows stay in Current for one full week, then move to their own Log
// Archive at the exact boundary. Supplying the clock makes the rule directly
// testable and prevents a slow test from crossing the boundary mid-assertion.
assert.match(administration,/adminAuditView\s*=\s*['"]current['"]/,
  'the Log must default to its Current section');
const auditContext={Date,Number,ADMIN_AUDIT_ARCHIVE_MS:7*24*60*60*1000};
vm.createContext(auditContext);
vm.runInContext(`${functionSource(administration,'adminAuditArchived')}
${functionSource(administration,'adminAuditMatchesView')}
this.isArchived=adminAuditArchived;this.matches=adminAuditMatchesView;`,auditContext);
const day=24*60*60*1000,week=7*day,clock=Date.UTC(2026,7,31,12,0,0);
const auditRow=createdAt=>({createdAt:new Date(createdAt).toISOString()});
assert.equal(auditContext.isArchived(auditRow(clock-week+1),clock),false,
  'a Log row must remain Current until the complete seventh day has elapsed');
assert.equal(auditContext.isArchived(auditRow(clock-week),clock),true,
  'a Log row must enter Archive at exactly seven days');
assert.equal(auditContext.isArchived(auditRow(clock-week-1),clock),true,
  'a Log row older than seven days must remain in Archive');
assert.equal(auditContext.isArchived({createdAt:'not-a-date'},clock),false,
  'an invalid timestamp must not silently hide a Log row in Archive');
assert.equal(auditContext.isArchived(auditRow(clock+day),clock),false,
  'a future timestamp must remain visible in Current');
assert.equal(auditContext.matches(auditRow(clock-week+1),'current',clock),true,
  'Current must contain the recent side of the same seven-day rule');
assert.equal(auditContext.matches(auditRow(clock-week),'current',clock),false,
  'Current and Archive must not duplicate a row at the boundary');
assert.equal(auditContext.matches(auditRow(clock-week),'archive',clock),true,
  'Archive must contain the archived side of the same seven-day rule');

const auditUi=functionSource(adminUi,'drawAdminAuditLog');
assert.match(auditUi,/adminAuditView\s*===\s*['"]archive['"]/,
  'the Log renderer must read its own archive view');
const archiveTabsUi=functionSource(adminUi,'drawSuggestionArchiveTabs');
assert.match(archiveTabsUi,/(?:CURRENT|RECENT)[\s\S]*ARCHIVE|ARCHIVE[\s\S]*(?:CURRENT|RECENT)/,
  'the Log must expose separate Current and Archive controls');
assert.match(administration+adminUi,/adminAuditArchived/,
  'Log routing must use the tested seven-day rule');
assert.match(functionSource(administration,'fetchAdminAuditViewPage'),/adminAuditMatchesView/,
  'the paged Log loader must apply the tested Current/Archive split');

// Reviewed Admin Suggestions already exist in Admin 02 storage. The client
// should use that RPC's status filter instead of inventing another table or a
// combined archive shared with Reports or the Log.
assert.match(administration,/weaponSuggestionView\s*=\s*['"]pending['"]/,
  'Admin Suggestions must default to Pending');
const fetchSuggestions=functionSource(administration,'fetchWeaponSuggestions');
assert.match(fetchSuggestions,/list_outpost_zero_weapon_suggestions_by_username/,
  'both suggestion sections must keep using the existing privacy-safe RPC');
for(const status of ['pending','approved','rejected'])
  assert.match(fetchSuggestions,new RegExp(`['"]${status}['"]`),
    `the suggestion loader must request ${status} rows`);
assert.match(fetchSuggestions,/p_status\s*:/,
  'the existing RPC status parameter must select Pending versus Archive');
assert.match(fetchSuggestions,/weaponSuggestionView\s*===\s*['"]archive['"]/,
  'the suggestion loader must map its Archive view to reviewed statuses');
assert.doesNotMatch(fetchSuggestions,/\.from\(['"]outpost_zero_weapon_suggestions['"]\)/,
  'the browser must not bypass the suggestion RPC with a raw table read');

const suggestionUi=functionSource(adminUi,'drawWeaponSuggestions');
assert.match(suggestionUi,/weaponSuggestionView\s*===\s*['"]archive['"]/,
  'Admin Suggestions must render its own archive state');
assert.match(archiveTabsUi,/PENDING[\s\S]*ARCHIVE|ARCHIVE[\s\S]*PENDING/,
  'Admin Suggestions must expose separate Pending and Archive controls');

// Every area owns its own archive/filter. These checks prevent a future
// cleanup from putting Reports, messages, suggestions, and logs into one
// ambiguous list.
const inboxTabs=functionSource(adminUi,'drawInboxTabs');
assert.match(inboxTabs,/\['msgs',[\s\S]*\['archive',/,
  'Admin Inbox must keep its own Messages and Archive tabs');
assert.doesNotMatch(inboxTabs,/REPORTS|ADMIN SUGGESTIONS|LOG/,
  'Admin Inbox must not absorb Suggestions workspace archives');

const reportsUi=functionSource(adminUi,'drawUpdates');
assert.match(reportsUi,/report_view:'\+id/,
  'Reports must keep their independent report view controls');
assert.match(reportsUi,/['"]open['"][\s\S]*['"]resolved['"]|['"]resolved['"][\s\S]*['"]open['"]/,
  'Reports must keep Open and Resolved sections');

assert.match(social,/socialInboxSection\s*=\s*['"]inbox['"]/,
  'Social Inbox must keep independent Inbox state');
const socialInboxUi=ui.slice(ui.indexOf("if(activeSocialView==='inbox')"),ui.indexOf("if(activeSocialView==='party')"));
assert.match(socialInboxUi,/inbox_section_inbox/,
  'Social Inbox must retain its own Inbox control');
assert.match(socialInboxUi,/inbox_section_archive/,
  'Social Inbox must retain its own Archive control');

const suggestionsTabs=functionSource(adminUi,'drawSuggestionsTabs');
assert.match(suggestionsTabs,/REPORTS[\s\S]*ADMIN SUGGESTIONS[\s\S]*LOG/,
  'Reports, Admin Suggestions, and Log must remain separate Suggestions sections');

console.log('PASS Logs, Admin Suggestions, Reports, Admin Inbox, and Social Inbox keep independent archives');
