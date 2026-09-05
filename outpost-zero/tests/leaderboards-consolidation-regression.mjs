import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFeatureSql } from './sql-feature-security.mjs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const sql=readFeatureSql(root,'sql/player/Player-01-stats.sql');

assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
assert.ok(sql.indexOf('create table if not exists public.scores')<sql.indexOf('on public.scores;'),
  'score storage must exist before triggers or policies reference it');
assert.match(sql,/incompatible legacy shape; no data was changed/);
assert.match(sql,/requires one unique row per \(user_id, game\)/);
assert.match(sql,/not c\.condeferrable/,'ON CONFLICT arbiters must be non-deferrable');
assert.match(sql,/Arena win receipts require one unique row per \(user_id, match_id\)/);
assert.match(sql,/Arena win receipts require user_id -> auth\.users\(id\) ON DELETE CASCADE/);
for(const signature of [
  /function public\.get_outpost_zero_leaderboard\(/,
  /function public\.get_outpost_zero_public_player\(/,
  /function public\.record_outpost_zero_arena_win\(/,
])assert.match(sql,signature);

assert.match(sql,/alter table public\.scores force row level security/);
assert.match(sql,/alter table public\.outpost_zero_arena_win_receipts force row level security/);
assert.equal((sql.match(/game <> 'outpost-zero-arena-wins'/g)||[]).length,3);
assert.match(sql,/auth\.uid\(\)=user_id[\s\S]+game in \('outpost-zero','outpost-zero-arena-wins'\)[\s\S]+game='outpost-zero-referral:'\|\|auth\.uid\(\)::text/,
  'authenticated score reads must remain inside the Outpost Zero interface');
assert.doesNotMatch(sql,/outpost_zero_scores_authenticated_read[\s\S]{0,120}using \(true\)/,
  'authenticated users must not inherit a raw all-games read policy');
assert.match(sql,/revoke all on table public\.outpost_zero_arena_win_receipts from public, anon, authenticated/);
assert.doesNotMatch(sql,/grant [^;]+outpost_zero_arena_win_receipts/i,'private receipts must never be browser-readable');
assert.match(sql,/revoke all on function public\.outpost_zero_reject_legacy_profile_score\(\)\s+from public, anon, authenticated/,
  'the internal legacy-row trigger helper must clear direct browser EXECUTE grants');

const published=[...sql.matchAll(/alter publication supabase_realtime add table public\.([a-z0-9_]+)/gi)].map(match=>match[1]);
assert.deepEqual(published,['scores'],'Leaderboards Realtime owns only score refreshes');
assert.match(sql,/alter publication supabase_realtime drop table public\.outpost_zero_arena_win_receipts/,
  'private receipts must be removed from legacy Realtime membership');
assert.doesNotMatch(sql,/^\s*(?:drop|truncate) table\b/gmi,
  'consolidation must preserve live score and receipt tables');
assert.match(sql,/delete from public\.scores\s+where game = 'outpost-zero-profile'/,
  'only the explicitly obsolete privacy snapshot rows are removed');
assert.match(sql,/notify pgrst, 'reload schema';[\s\S]*select public\._outpost_zero_apply_player_security\('Player 01'\);\s*commit;/);

console.log('Player 01 leaderboard consolidation regression: PASS');
