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

## Global AI training

The Offline 1v1 bot uses one shared, fairness-capped training level for every
player. Everyone can read and play the live level. Only the creator and accounts
listed as `main` in the existing `public.admins` table can contribute completed
first-to-five matches; co-admins, ordinary players, and guests never write
training progress. Match UUIDs, server-time rate limits, and an append-only
ledger make submissions idempotent.

Run this independent feature script:

1. `ai/01-global-training.sql` — global state, private contribution ledger,
   RLS, narrow read/submit RPCs, API grants, and Realtime refresh

If Social was the last feature you installed, do not rerun its four files for
this change; paste and run only this AI script next.

The script is rerunnable and does not delete profile data. Supabase may show a
general warning because it creates `security definer` RPCs; those functions
have fixed search paths, explicit role grants, authentication checks, and no
client table-write permission. Review the SQL, then run it with RLS enabled as
written. Legacy per-profile bot training is intentionally ignored rather than
being added to the shared total.
