import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'sql/profiles');
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.sql')).sort();
assert.deepEqual(files,['Profiles-01-profiles.sql'],'Profiles must have one deployment query');
const sql=fs.readFileSync(path.join(dir,files[0]),'utf8');
const persistence=fs.readFileSync(path.join(root,'js/persistence.js'),'utf8');
const networking=fs.readFileSync(path.join(root,'js/networking.js'),'utf8');

assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
assert.match(sql,/create table if not exists public\.profiles/);
assert.match(sql,/public\.profiles has an incompatible legacy shape; no data was changed/);
assert.match(sql,/primary key\(user_id\)/);
assert.match(sql,/outpost_zero_profiles_user_auth_fkey/);
assert.match(sql,/c\.confkey=array\[\(select a\.attnum[^;]+auth\.users[^;]+a\.attname='id'/);
assert.match(sql,/c\.confdeltype='c'/);
assert.match(sql,/foreign key\(user_id\) references auth\.users\(id\) on delete cascade not valid/);
assert.match(sql,/outpost_zero_profiles_data_object_check/);
assert.match(sql,/check \(jsonb_typeof\(data\)='object'\) not valid/);
assert.match(sql,/alter table public\.profiles force row level security/);
assert.match(sql,/select policyname from pg_catalog\.pg_policies[^;]+tablename='profiles'/);
for(const policy of ['own_read','own_insert','own_update'])
  assert.match(sql,new RegExp(`create policy outpost_zero_profiles_${policy}`));
assert.match(sql,/revoke all on table public\.profiles from public, anon, authenticated/);
assert.match(sql,/from information_schema\.column_privileges/,'legacy column grants must also be removed');
assert.match(sql,/alter publication supabase_realtime drop table public\.profiles/,
  'Profiles must explicitly retire obsolete publication membership');
assert.doesNotMatch(sql,/^\s*(?:delete from|drop table|truncate table)\b/gmi,'Profiles consolidation must preserve account progress');
assert.doesNotMatch(sql,/social_profiles|ui_layout/,'Profiles must not absorb public Social identity or removed UI storage');
assert.match(persistence,/from\('profiles'\)\.select\('data'\)/);
assert.match(persistence,/from\('profiles'\)\.upsert\(\{user_id:userId,data:payload,updated_at:/);
assert.doesNotMatch(networking,/table:\s*['"]profiles['"]/,'Profiles has no Postgres Realtime consumer');

console.log('profiles consolidation regression: PASS');
