import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const administration=read('js/administration.js'),sql=read('sql/administration/Admin-03-inbox.sql'),
  index=read('../index.html');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
  const brace=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

const exportSource=functionSource(administration,'reportExportText'),
  copySource=functionSource(administration,'copyOutpostZeroReports');
const context={};vm.createContext(context);vm.runInContext(exportSource,context);
const mixed=[
  {id:11,resolved:false,message:'still open',meta:{state:'play'}},
  {id:10,resolved:true,message:'already fixed',meta:{state:'select'}},
];
const allText=context.reportExportText(mixed,null);
assert.match(allText,/SELECTION: ALL UNRESOLVED REPORTS/);
assert.match(allText,/COPIED: 1/);
assert.match(allText,/ID: 11/);
assert.doesNotMatch(allText,/ID: 10|already fixed|STATUS: RESOLVED/,
  'resolved reports must never enter clipboard text');
assert.match(context.reportExportText(mixed,25),/SELECTION: NEWEST 25 UNRESOLVED REPORTS/);

assert.match(copySource,/if\(!sb\)rows=\[\.\.\.\(updatesFeed\.reports\|\|\[\]\)\]/,
  'offline Copy All must use only the unresolved feed');
assert.doesNotMatch(copySource,/updatesResolved/,
  'resolved/archive rows must not be merged into Copy All');
assert.match(copySource,/export_outpost_zero_reports',\{p_limit:null\}/,
  'the client must remain safe while older Admin 03 SQL is still deployed');
assert.match(copySource,/rows=rows\.filter\(row=>row&&row\.resolved!==true\);[\s\S]*?rows=rows\.slice/,
  'open-state filtering must happen before a custom count is applied');

const sqlExport=sql.slice(sql.indexOf('create or replace function public.export_outpost_zero_reports'),
  sql.indexOf('revoke all on function public._outpost_zero_redact_report_text'));
assert.match(sqlExport,/where r\.game='outpost-zero' and not r\.resolved/,
  'the Supabase export RPC itself must return unresolved reports only');
assert.match(index,/outpost-zero\/js\/administration\.js\?v=20260902-ai-cleanup-v1/);

console.log('PASS Copy All exports every unresolved report and no resolved reports');
