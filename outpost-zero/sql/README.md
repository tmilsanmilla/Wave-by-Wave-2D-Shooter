# Outpost Zero database setup

Database setup is organized by feature so there is no single giant SQL file.
Each feature has its own numbered scripts and may be installed independently.

## Social

The Social feature provides unique public usernames, friendships, private messages, row
level security, API privileges, and realtime refresh hints. Profiles,
friendships, and messages share one core data script because they form the same
Social model. Security, privileges, and Realtime remain separate.

In the Supabase Dashboard, open **SQL Editor**, paste each file below, and run
them one at a time in this exact order:

1. `social/01-social-core.sql` — profiles, friendships, and private messages
2. `social/02-rls-policies.sql` — row-level security policies
3. `social/03-privileges.sql` — narrow API permissions, including signup username availability
4. `social/04-realtime.sql` — friendship and message refresh events

All four scripts are rerunnable. Run the complete sequence again after changing
the Social schema so tables are preserved while functions, triggers, policies,
privileges, and realtime membership are refreshed.

Future database features should get a sibling folder under `sql/` with their
own numbered scripts and a dependency order documented here.

## Leaderboards

The public leaderboard reads live Social usernames through a narrow RPC instead
of exposing account emails or trusting the name stored with a score. Run this
after Social core has created and backfilled player usernames:

1. `leaderboards/01-public-board.sql`

If you already finished Social `01` through `04`,
run only this one Leaderboards script next; do not combine it with or rerun the
Social scripts for this fix.
It uses the existing `public.scores` table that already stores game scores; it
does not create or replace the table.

This also removes obsolete `outpost-zero-profile` score rows that could contain
legacy account-email JSON, rewrites old score aliases to Social usernames, and
installs the narrow username/high-score player lookup used by public profiles.
It also blocks old browser tabs from recreating those JSON rows and removes
anonymous direct reads of the raw score table. Signed-in score saving and
referrals retain their existing authenticated access and RLS checks.

This script is rerunnable. It exposes only user ID, username, and score, and it
hard-limits requests to the two public Outpost Zero boards and five rows.
Accounts created before usernames were required display `USERNAME_NOT_SET`
instead of an email or UUID-like temporary label. This covers both the current
20-character generated handle and the legacy 8-character version. The game
sends the account owner to Social to choose a username; username changes are
free. Cleanup is restricted to score games beginning with `outpost-zero`, so it
does not rename rows belonging to another game that shares the table.

## AI bot ladder

The tactical bot brain is shared by every player, while signed-in players have
private cloud ladder progress through five execution tiers: Beginner, Easy,
Medium, Hard, and Impossible. Guests play Beginner without creating database
state. Normal completed AI matches update only the signed-in account; creator
and main-admin comparison tests never update the ladder.

Run these independent feature scripts in order:

1. `ai/01-global-training.sql` — private per-account ladder, exact-once match
   receipts, RLS, narrow read/submit RPCs, and API grants
2. `ai/02-model-history.sql` — immutable tactical model releases, the global
   active-model pointer, creator/main-admin activation, and an append-only audit

If Social was the last feature you installed, do not rerun its four files for
this change; paste and run the AI scripts instead. If you already ran AI 01 for
the five-tier ladder, paste and run only AI 02 next.

The historical AI 01 filename is retained for ladder compatibility. Both AI
scripts are rerunnable and do not delete profile data.
If an older copy of AI 01 created the abandoned shared-XP tables, it revokes the
old browser API but leaves those tables intact. Supabase may show a general
warning because it creates `security definer` RPCs; those functions have fixed
search paths, explicit role grants, authentication checks, and no direct client
table permissions.

The read RPC derives the player from `auth.uid()` and returns Beginner defaults
for guests. The submit RPC accepts a match UUID, win/loss result, and difficulty
but never accepts a user ID. It validates the match difficulty against the
server-side current tier, admits each UUID once, rate-limits using server time,
and calculates wins, losses, streaks, promotions, demotions, and a monotonic
revision inside the transaction. Ladder state is not stored in browser local
storage or the general profile JSON.

AI 02 is separate because model history is global while ladder progress is
private per account. Every release maps to an allowlisted behavior snapshot
embedded in the game; Supabase stores no executable code. `TEST MODEL` runs an
isolated admin comparison and never writes ladder or live-model state. `BRING
BACK MODEL` atomically changes the global model pointer for future matches,
keeps newer releases in history, and records who made the change. It does not
alter any player's difficulty or an already-running match. Direct table access
is denied, and the activation RPC verifies the creator/main-admin role from the
signed Supabase JWT and server-side admins table rather than trusting the UI.

Because matches run locally, the database cannot independently prove a reported
win. UUID receipts plus the 30-second, 20-per-hour, and 100-per-day server-time
limits prevent accidental duplicates and simple request spam; fully cheat-proof
results would require a future authoritative match server or server-issued
begin-match ticket.
