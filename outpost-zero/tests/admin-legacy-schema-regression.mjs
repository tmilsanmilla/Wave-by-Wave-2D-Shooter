import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'sql/administration/Admin-01-admin-menu.sql'),'utf8');
const failures=[];
let passed=0;
function check(name,condition){
  if(condition){passed++;console.log('PASS',name);}
  else{failures.push(name);console.error('FAIL',name);}
}

const addStableKey=sql.indexOf('add column if not exists user_id uuid references auth.users(id) on delete cascade');
const firstStableKeyRead=sql.indexOf('where b.user_id=u.id');
const scopeUpgrade=sql.indexOf('do $legacy_bans_shape$');
const firstJsonScopeRead=sql.indexOf('jsonb_array_elements_text(b.scopes)');

check('Creator seed uses a private session setting without storing an identity',
  /current_setting\('outpost_zero\.creator_username',true\)/.test(sql)&&
  /where sp\.handle_key=v_creator_username/.test(sql)&&
  !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
    sql.slice(0,sql.indexOf('create table if not exists public.bans'))
  ));
check('Legacy email-keyed bans gain the UUID key before it is read',
  addStableKey>=0&&firstStableKeyRead>addStableKey);
check('Legacy UUID key is backfilled without deleting moderation history',
  /update public\.bans b set user_id=u\.id[\s\S]+lower\(btrim\(b\.user_email\)\)=lower\(btrim\(u\.email\)\)/.test(sql)&&
  /not \(b\.scopes \? 'device' and not \(b\.scopes \? 'account'\) and not \(b\.scopes \? 'leaderboard'\)\)/.test(sql)&&
  !/drop table(?: if exists)? public\.bans|truncate(?: table)? public\.bans/i.test(sql));
check('Legacy text-array and JSON scopes convert to JSONB with their rows preserved',
  /v_scopes_type='text\[\]'[\s\S]+to_jsonb\(scopes\)/.test(sql)&&
  /v_scopes_type='json'[\s\S]+scopes::jsonb/.test(sql)&&
  /v_scopes_type is distinct from 'jsonb'/.test(sql));
check('Unknown or malformed scope shapes fail closed',
  /scopes must be text\[\], json, or jsonb/.test(sql)&&
  /jsonb_typeof\(scopes\) is distinct from 'array'/.test(sql)&&
  /no rows were changed/.test(sql));
check('Scope normalization precedes every downstream JSONB scope reader',
  scopeUpgrade>=0&&firstJsonScopeRead>scopeUpgrade&&
  /alter table public\.bans alter column scopes set default '\["account"\]'::jsonb/.test(sql)&&
  /validate constraint outpost_zero_bans_scopes_array/.test(sql));
check('Admin and ban rows are never replaced during the upgrade',
  !/delete from public\.admins|truncate(?: table)? public\.admins|drop table(?: if exists)? public\.admins/i.test(sql)&&
  /create table if not exists public\.admins/.test(sql));
check('Legacy request rows gain the consolidated decision timestamp in place',
  /alter table public\.player_requests add column if not exists decided_at timestamptz/.test(sql));

if(failures.length){
  console.error(`SUMMARY FAIL ${failures.length}/${passed+failures.length}`);
  process.exit(1);
}
console.log(`SUMMARY PASS ${passed}`);
