import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sql=read('sql/administration/Admin-03-inbox.sql');
const administration=read('js/administration.js');
const networking=read('js/networking.js');
const browserCode=administration+'\n'+networking;
let passed=0,failed=0;
function check(name,condition){
  if(condition){passed++;console.log('PASS',name);}
  else{failed++;console.error('FAIL',name);}
}

check('Browser has no raw report-table read, insert, or update path',
  !/\.from\(['"]reports['"]\)/.test(browserCode));
check('Report form tells guests to sign in and submits through the RPC',
  /if\(!authUser\)\{ \$\('repstatus'\)\.textContent='sign in to send a report'/.test(networking)&&
  /rpc\('submit_outpost_zero_report'/.test(networking));
check('Database removes every raw report policy and browser table privilege',
  /drop policy %I on public\.reports/.test(sql)&&
  /revoke all on table public\.reports from public,anon,authenticated/.test(sql)&&
  /revoke all on sequence %s from public,anon,authenticated/.test(sql)&&
  !/grant\s+(?:select|insert|update|delete)[^;]*on\s+public\.reports/i.test(sql));
check('Submission derives account username and staff role server-side',
  /v_actor uuid:=auth\.uid\(\)/.test(sql)&&
  /select p\.handle into v_username from public\.social_profiles p where p\.user_id=v_actor/.test(sql)&&
  /v_role:=public\._outpost_zero_staff_role\(\)/.test(sql)&&
  /reporter_user_id,reporter_role/.test(sql));
check('Ordinary-player throttle is serialized while all staff tiers bypass it',
  /v_role not in \('creator','main','co','tester'\)/.test(sql)&&
  /pg_advisory_xact_lock\(hashtext\('outpost-zero-report:'/.test(sql)&&
  /interval '30 seconds'/.test(sql)&&/REPORT_RATE_LIMIT/.test(sql));
check('Report context is a strict allowlist with bounded values',
  /jsonb_object_keys\(v_context\)/.test(sql)&&
  /not in \('wave','score','state','mode','screen','w','h','dpr','ua','category'\)/.test(sql)&&
  /REPORT_CONTEXT_FIELD_INVALID/.test(sql)&&/between 1 and 16384/.test(sql)&&/between 0\.25 and 8/.test(sql));
check('Sanitized list uses stable keyset pagination and main-only authority',
  /list_outpost_zero_reports/.test(sql)&&/r\.id<p_before_id/.test(sql)&&
  /order by r\.id desc limit v_limit/.test(sql)&&
  /_outpost_zero_admin_role\(\) not in \('creator','main'\)/.test(sql));
check('Legacy name, message, and meta data are sanitized before listing',
  /_outpost_zero_redact_report_text/.test(sql)&&/_outpost_zero_report_public_name/.test(sql)&&
  /_outpost_zero_sanitized_report_meta/.test(sql)&&/\[private email removed\]/.test(sql)&&
  /return 'LEGACY REPORTER'/.test(sql));
check('Resolve and export both return only sanitized RPC rows',
  /resolve_outpost_zero_report/.test(sql)&&
  /public\._outpost_zero_redact_report_text\(v_row\.message\)/.test(sql)&&
  /export_outpost_zero_reports[\s\S]+public\._outpost_zero_sanitized_report_meta\(r\.meta\)/.test(sql)&&
  /rpc\('resolve_outpost_zero_report'/.test(administration)&&
  /rpc\('export_outpost_zero_reports'/.test(administration));
check('Client has no insecure rollout fallback for list, resolve, or export',
  !/Existing report RLS remains authority/.test(administration)&&
  !/\.update\(\{resolved:true\}\)/.test(administration));
check('Realtime publishes an own-row wakeup instead of report contents',
  /create table if not exists public\.outpost_zero_report_wakeups/.test(sql)&&
  /auth\.uid\(\)=recipient_id/.test(sql)&&
  /drop table public\.reports/.test(sql)&&
  /add table public\.outpost_zero_report_wakeups/.test(sql)&&
  /table:'outpost_zero_report_wakeups'/.test(networking)&&
  !/table:'reports'/.test(networking));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
