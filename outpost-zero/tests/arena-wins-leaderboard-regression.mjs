import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const networking=read('js/networking.js'),online=read('js/online.js'),loop=read('js/loop.js'),ui=read('js/ui.js');
const sql=read('sql/leaderboards/Leaderboards-01-leaderboards.sql');

function functionSource(source,name){
  let start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
  if(source.slice(Math.max(0,start-6),start)==='async ')start-=6;
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

assert.match(sql,/primary key \(user_id, match_id\)/i,'Arena wins need one private receipt per account and match');
assert.match(sql,/on conflict \(user_id, game\) do update[\s\S]{0,180}current_score\.score::bigint \+ 1/i,
  'the server must increment the current row atomically');
assert.match(sql,/set search_path = pg_catalog, public/i,'the win RPC must have a fixed search path');
assert.match(sql,/grant execute on function public\.record_outpost_zero_arena_win\(text, uuid\) to authenticated/i,
  'only signed-in clients may call the win RPC');
assert.equal((sql.match(/game <> 'outpost-zero-arena-wins'/g)||[]).length,3,
  'raw browser insert/update policies must not mint Arena wins');
assert.doesNotMatch(functionSource(networking,'submitArenaWin'),/\.from\(['"]scores['"]\)|\.upsert\(/,
  'Arena wins must never use the old client read/increment/upsert path');
assert.equal((online.match(/submitArenaWin\(arenaWinResultId\(arena,authUser\)\)/g)||[]).length,2,
  'normal and forfeit wins must enqueue the same deterministic match receipt');

class MemoryStorage{
  constructor(){this.rows=new Map();}
  get length(){return this.rows.size;}
  key(i){return [...this.rows.keys()][i]??null;}
  getItem(key){return this.rows.has(key)?this.rows.get(key):null;}
  setItem(key,value){this.rows.set(String(key),String(value));}
  removeItem(key){this.rows.delete(String(key));}
}

const ownerA='11111111-1111-4111-8111-111111111111',ownerB='22222222-2222-4222-8222-222222222222';
const storage=new MemoryStorage(),serverReceipts=new Set();let serverWins=0,rpcCalls=0,loseFirstResponse=true,boardRefreshes=0,timerSeq=0;
const context={String,Number,Math,Map,JSON,Array,Object,Promise,RegExp,console:{warn:()=>{}},localStorage:storage,
  Date:{now:()=>1000},queueMicrotask:fn=>Promise.resolve().then(fn),setTimeout:()=>++timerSeq,clearTimeout:()=>{},
  ARENA_WIN_RECEIPT_PREFIX:'oz_arena_win_receipt_v1:',ARENA_WIN_RETRY_MS:Object.freeze([1500,5000,15000,60000]),
  arenaWinMemoryQueue:new Map(),arenaWinFlushPromise:null,arenaWinFlushRequested:false,arenaWinRetryTimer:null,arenaWinRetryLevel:0,
  arenaOwnWinTotal:null,authUser:{id:ownerA},fetchBoard:async()=>{boardRefreshes++;return true;},
  sb:{rpc:async(name,args)=>{
    assert.equal(name,'record_outpost_zero_arena_win');assert.equal(args.p_expected_user_id,context.authUser.id);rpcCalls++;
    const key=args.p_expected_user_id+'|'+args.p_match_id,applied=!serverReceipts.has(key);
    if(applied){serverReceipts.add(key);serverWins++;}
    if(loseFirstResponse){loseFirstResponse=false;return {data:null,error:{message:'response lost after commit'}};}
    return {data:[{applied,wins:serverWins}],error:null};
  }}
};
vm.createContext(context);
for(const name of ['arenaWinOwnerId','arenaWinMatchId','arenaWinResultId','normalizeArenaWinReceipt','arenaWinReceiptKey',
  'readArenaWinReceipts','persistArenaWinReceipt','removeArenaWinReceipt','enqueueArenaWinReceipt','scheduleArenaWinRetry','flushArenaWinReceipts'])
  vm.runInContext(functionSource(networking,name),context);

const match={room:'ABC123',matchEpoch:7,mapVoteId:'ABC123:7:QW9Z2K',opponent:{id:ownerB}};
const receipt=context.arenaWinResultId(match,{id:ownerA});
assert.ok(receipt.startsWith('arena-win-v1:ABC123:7:QW9Z2K:'),'the shared map-vote nonce must identify the match');
assert.equal(receipt,context.arenaWinResultId({...match,forfeitResultId:'different-forfeit-id'},{id:ownerA}),
  'normal and forfeit completion of one match must share one receipt');
assert.notEqual(receipt,context.arenaWinResultId({...match,mapVoteId:'ABC123:8:NEWMAP'},{id:ownerA}),
  'a rematch must receive a distinct receipt');

assert.equal(context.enqueueArenaWinReceipt(ownerA,receipt,1000),true);
assert.equal(storage.length,1,'a completed win must be durable before its first request');
assert.equal(await context.flushArenaWinReceipts(),false,'an ambiguous lost response must keep the receipt queued');
assert.equal(serverWins,1,'the server may already have committed the first attempt');
assert.equal(context.readArenaWinReceipts().length,1,'the client must retain an unconfirmed receipt');
context.arenaWinRetryTimer=null;
assert.equal(await context.flushArenaWinReceipts(),true,'retrying the same receipt must reconcile successfully');
assert.equal(serverWins,1,'the same receipt must never count twice');
assert.equal(context.readArenaWinReceipts().length,0,'only a confirmed response may clear the durable receipt');

const receipt2=context.arenaWinResultId({...match,mapVoteId:'ABC123:8:AAAAAA'},{id:ownerA});
const receipt3=context.arenaWinResultId({...match,mapVoteId:'ABC123:9:BBBBBB'},{id:ownerA});
context.enqueueArenaWinReceipt(ownerA,receipt2,1001);context.enqueueArenaWinReceipt(ownerA,receipt3,1002);
await Promise.all([context.flushArenaWinReceipts(),context.flushArenaWinReceipts()]);
assert.equal(serverWins,3,'two distinct wins must both survive overlapping flushes');
assert.equal(context.readArenaWinReceipts().length,0);

const receipt4=context.arenaWinResultId({...match,mapVoteId:'ABC123:10:CCCCCC'},{id:ownerA});
context.enqueueArenaWinReceipt(ownerA,receipt4,1003);const callsBeforeSwitch=rpcCalls;context.authUser={id:ownerB};
assert.equal(await context.flushArenaWinReceipts(),false);
assert.equal(rpcCalls,callsBeforeSwitch,'switching accounts must never retarget another account\'s queued win');
assert.equal(context.readArenaWinReceipts().length,1,'the original account receipt must remain recoverable');
context.authUser={id:ownerA};await context.flushArenaWinReceipts();assert.equal(serverWins,4);

assert.match(networking,/leaderboardFailedVersion\[key\][\s\S]{0,900}requestVersion<leaderboardAppliedVersion\[key\]/,
  'failed overlapping reads must not invalidate an older successful board response');
assert.match(networking,/if\(anySuccess\)\{boardT=Date\.now\(\)/,
  'only a confirmed board response may advance the last-success clock');
assert.doesNotMatch(loop,/boardT=Date\.now\(\);\s*fetchBoard\(\)/,
  'the polling loop must not mark a failed request as a successful refresh');
assert.match(loop,/rtStatus===['"]live['"]&&authUser \? 180000 : 30000/,
  'signed-out public boards must retain the privacy-safe short polling fallback');
assert.match(ui,/YOUR WINS ['"]?\+?arenaOwnWinTotal|\('YOUR WINS '\+arenaOwnWinTotal\)/,
  'a signed-in player must see their own saved total even when outside the top five');

console.log('PASS Arena win receipts are atomic, durable, and refresh safely');
