import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const publicBoardSql=read('sql/leaderboards/01-public-board.sql');
const securitySql=read('sql/leaderboards/Leaderboards-03-security-realtime.sql');

function sqlFunction(source,name){
  const start=source.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start,-1,`missing ${name}`);
  const bodyStart=source.indexOf('as $$',start);
  assert.notEqual(bodyStart,-1,`missing ${name} body`);
  const end=source.indexOf('$$;',bodyStart+5);
  assert.notEqual(end,-1,`unterminated ${name}`);
  return source.slice(start,end+3);
}

function count(source,pattern){
  return (source.match(pattern)||[]).length;
}

function escapeRegExp(value){
  return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function assertIdentityGuards(source,guardCount,userIdExpression,label){
  assert.equal(count(source,/nullif\(btrim\(sp\.handle\), ''\) is null/g),guardCount,
    `${label} must map null, empty, and whitespace-only handles to the sentinel`);
  assert.equal(count(source,/btrim\(coalesce\(sp\.handle, ''\)\) !~ '\^\[A-Za-z0-9_\]\{3,32\}\$'/g),guardCount,
    `${label} must keep malformed or email-shaped legacy handles out of public identity`);
  assert.equal(count(source,/lower\(btrim\(coalesce\(sp\.handle_key, ''\)\)\) in \(/g),guardCount,
    `${label} must validate the normalized handle key`);
  assert.equal(count(source,/lower\(btrim\(coalesce\(sp\.handle, ''\)\)\) in \(/g),guardCount,
    `${label} must also validate malformed legacy handle text`);
  assert.equal(count(source,/'username_not_set'/g),guardCount*2,
    `${label} must normalize the underscored sentinel in handle and handle_key`);
  assert.equal(count(source,/'usernamenotset'/g),guardCount*2,
    `${label} must normalize the compact sentinel in handle and handle_key`);

  const id=escapeRegExp(userIdExpression);
  for(const length of [20,8]){
    const generated=new RegExp(`'op_' \\|\\| left\\(replace\\(${id}::text, '-', ''\\), ${length}\\)`,'g');
    assert.equal(count(source,generated),guardCount*2,
      `${label} must normalize the ${length}-character generated identity in handle and handle_key`);
  }
  assert.equal(count(source,/then 'USERNAME_NOT_SET'/g),guardCount,
    `${label} must return the canonical public sentinel for every unfinished identity`);
}

const cleanupStart=publicBoardSql.indexOf('update public.scores s');
const cleanupEnd=publicBoardSql.indexOf('-- A legacy/orphaned score',cleanupStart);
assert.ok(cleanupStart>=0&&cleanupEnd>cleanupStart,'missing legacy score-name cleanup');
const cleanup=publicBoardSql.slice(cleanupStart,cleanupEnd);
const leaderboard=sqlFunction(publicBoardSql,'get_outpost_zero_leaderboard');
const publicPlayer=sqlFunction(publicBoardSql,'get_outpost_zero_public_player');
const arenaWin=sqlFunction(securitySql,'record_outpost_zero_arena_win');

assertIdentityGuards(cleanup,2,'sp.user_id','score-name cleanup');
assertIdentityGuards(leaderboard,1,'s.user_id','public leaderboard RPC');
assertIdentityGuards(publicPlayer,1,'c.user_id','public player RPC');
assertIdentityGuards(arenaWin,1,'v_uid','Arena win write');

const publicIdentityRpcs=leaderboard+'\n'+publicPlayer;
assert.doesNotMatch(publicIdentityRpcs,/\bauth\.users\b|\bemail\b/i,
  'anon/public identity RPCs must never join or return Auth email');
assert.match(publicBoardSql,
  /grant execute on function public\.get_outpost_zero_leaderboard\(text, integer\) to anon, authenticated;/,
  'the public leaderboard remains available without exposing private identity');
assert.match(publicBoardSql,
  /grant execute on function public\.get_outpost_zero_public_player\(text\) to anon, authenticated;/,
  'the public player lookup remains available without exposing private identity');
assert.match(publicBoardSql,/notify pgrst, 'reload schema';\s*commit;/,
  'the public leaderboard replacement must refresh PostgREST transactionally');

assert.match(arenaWin,
  /values \(v_uid, 'outpost-zero-arena-wins', v_name, 1, now\(\)\)/,
  'Arena wins must persist the sanitized identity');
assert.match(arenaWin,/v_name := coalesce\(v_name, 'USERNAME_NOT_SET'\);/,
  'a missing Social profile must also store the sentinel');
assert.match(securitySql,/notify pgrst, 'reload schema';\s*commit;/,
  'the Arena win replacement must refresh PostgREST transactionally');

console.log('PASS leaderboard identities use privacy-safe unfinished-name fallbacks');
