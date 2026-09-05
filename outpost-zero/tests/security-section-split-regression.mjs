import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','sql');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const contract=JSON.parse(fs.readFileSync(new URL('./security-section-split-contract.json',import.meta.url),'utf8'));

// Understand comments, quoted strings, and dollar-quoted RPC bodies; a regex
// split on semicolons would mistake authorization inside RPCs for top-level ACLs.
function statements(sql){
  const result=[];let start=0,i=0,quote=null,block=0,line=false,dollar=null;
  while(i<sql.length){
    if(line){if(sql[i]==='\n')line=false;i++;continue;}
    if(block){if(sql.slice(i,i+2)==='/*'){block++;i+=2;}else if(sql.slice(i,i+2)==='*/'){block--;i+=2;}else i++;continue;}
    if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length;dollar=null;}else i++;continue;}
    if(quote){if(sql[i]===quote){if(sql[i+1]===quote)i+=2;else{quote=null;i++;}}else i++;continue;}
    if(sql.slice(i,i+2)==='--'){line=true;i+=2;continue;}
    if(sql.slice(i,i+2)==='/*'){block=1;i+=2;continue;}
    if(sql[i]==="'"||sql[i]==='"'){quote=sql[i++];continue;}
    if(sql[i]==='$'){const m=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);if(m){dollar=m[0];i+=dollar.length;continue;}}
    if(sql[i]===';'){result.push(sql.slice(start,++i));start=i;}else i++;
  }
  assert.ok(!quote&&!block&&!dollar,'SQL contains no unterminated quoted bodies');
  return result.map(s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,'')).filter(Boolean);
}

let movedTotal=0;
for(const [file,expected] of Object.entries(contract)){
  const [section,name]=file.split('/'),label=section==='player'?'Player':'Admin';
  const feature=fs.readFileSync(path.join(root,file),'utf8');
  const security=fs.readFileSync(path.join(root,section,`${label}-04-security.sql`),'utf8');
  const moved=security.split(`-- BEGIN MOVED ${name}\n`)[1]?.split(`\n-- END MOVED ${name}`)[0];
  assert.ok(moved,`${file}: exists in the correct section security owner`);
  const securityStatements=statements(moved);
  assert.equal(securityStatements.length,expected.statements,`${file}: no missing policies/grants`);
  assert.equal(hash(securityStatements.join('\n')),expected.securitySha256,`${file}: exact original ordered RLS/grants/RPC elevation preserved`);
  movedTotal+=securityStatements.length;
  const parsed=statements(feature);
  const applicator=`public._outpost_zero_apply_${section==='player'?'player':'admin'}_security`;
  assert.equal(parsed[0],'begin;',`${file}: transactional boundary`);
  assert.match(parsed[1],/^do \$section_security_required\$/i,`${file}: checks security owner before creating anything`);
  assert.match(parsed[1],/raise exception/,`${file}: missing security fails closed`);
  const id=name.replaceAll('-',' ').slice(0,label.length+3);
  assert.equal(parsed.at(-2),`select ${applicator}('${id}');`,`${file}: required complete boundary before commit`);
  assert.equal(parsed.at(-1),'commit;',`${file}: last statement commits only after ACL success`);
  const remaining=parsed.filter(s=>! /^(?:begin|commit)\s*;|^do \$section_security_required\$|^select public\._outpost_zero_apply_(?:player|admin)_security\(/i.test(s));
  assert.equal(hash(remaining.join('\n')),expected.featureSha256,`${file}: every original feature statement and in-RPC authorization unchanged`);
  assert.ok(!remaining.some(s=>/^(?:grant|revoke|create policy|drop policy)\b/i.test(s)),`${file}: ACL ownership is centralized`);
  assert.match(security,/returns void language plpgsql security invoker set search_path=pg_catalog,public/);
  assert.ok(security.includes(`revoke all on function ${applicator}(text) from public,anon,authenticated,service_role;`),'security installer is never a browser/backend RPC');
  assert.match(security,/if p_required is not null and not p_required=any\(v_applied\) then\s+raise exception/,'incomplete feature cannot commit with missing ACLs');
  assert.ok(!securityStatements.some(s=>/^(?:delete|update|insert|truncate|drop table)\b/i.test(s)),'security file does not mutate player data');
  assert.ok(feature.includes('$realtime$')||feature.includes('supabase_realtime'),'feature retains its own Realtime setup');
}
console.log(`Security section split: ${movedTotal} exact policy/grant statements preserved; six feature bodies unchanged; fail-closed installation guards verified.`);
