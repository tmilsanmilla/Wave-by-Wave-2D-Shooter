import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Existing behavior tests inspect a feature plus only its own extracted ACL
// block. Installation atomicity and exact extraction have a separate regression.
export function readFeatureSql(root,file){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const section=path.basename(path.dirname(file));
  const label=section==='player'?'Player':section==='administration'?'Admin':null;
  if(!label||/-04-security\.sql$/.test(file))return source;
  const owner=fs.readFileSync(path.join(root,path.dirname(file),`${label}-04-security.sql`),'utf8');
  const name=path.basename(file);
  const moved=owner.split(`-- BEGIN MOVED ${name}\n`)[1]?.split(`\n-- END MOVED ${name}`)[0];
  assert.ok(moved,`${name} must retain its exact policy/grant block in ${label} 04`);
  return source+'\n-- Section security (evaluated by the required installer before feature commit):\n'+moved+'\n';
}
