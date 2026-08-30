import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin01=read('sql/administration/Admin-01-admin-menu.sql');
const admin03=read('sql/administration/Admin-03-inbox.sql');
const client=read('js/administration.js');

assert.match(admin01,
  /list_outpost_zero_admin_audit_by_username\(\s*p_before_event_id bigint default null,\s*p_limit integer default 25\s*\)/,
  'Admin 01 LOG signature should use the parameter names sent by the client');
assert.match(client,
  /rpc\('list_outpost_zero_admin_audit_by_username',\{p_before_event_id:before,p_limit:ADMIN_AUDIT_PAGE_SIZE\+1\}\)/,
  'LOG client call should match the Admin 01 signature exactly');
assert.match(admin03,
  /list_outpost_zero_reports\(\s*p_resolved boolean,\s*p_before_id bigint default null,\s*p_limit integer default 250\s*\)/,
  'Admin 03 Reports signature should use the parameter names sent by the client');
assert.match(client,
  /rpc\('list_outpost_zero_reports',\{\s*p_resolved:!!resolved,p_before_id:beforeId,p_limit:REPORT_FETCH_PAGE_SIZE\s*\}\)/,
  'Reports client call should match the Admin 03 signature exactly');

function assertTransactionalSchemaReload(sql,moduleName,requiredGrant){
  const notify=sql.lastIndexOf("notify pgrst, 'reload schema';");
  const commit=sql.lastIndexOf('commit;');
  const grant=sql.lastIndexOf(requiredGrant);
  assert.ok(notify>grant,`${moduleName} must reload PostgREST after granting its RPC`);
  assert.ok(commit>notify,`${moduleName} schema reload must be inside the installation transaction`);
}

assertTransactionalSchemaReload(
  admin01,
  'Admin 01',
  'grant execute on function public.list_outpost_zero_admin_audit_by_username(bigint,integer) to authenticated;'
);
assertTransactionalSchemaReload(
  admin03,
  'Admin 03',
  'grant execute on function public.list_outpost_zero_reports(boolean,bigint,integer) to authenticated;'
);

assert.match(client,/code==='PGRST202'\|\|code==='42883'/,
  'client should recognize missing/stale RPC signatures');
assert.match(client,/LOG NOT CONNECTED[^\n]+ADMIN 01 ADMIN MENU/,
  'LOG should identify its owning SQL module instead of showing a raw PostgREST error');
assert.match(client,/REPORTS NOT CONNECTED[^\n]+ADMIN 03 INBOX/,
  'Reports should identify its owning SQL module when its RPC is unavailable');

console.log('PASS admin PostgREST schema-cache regression');
