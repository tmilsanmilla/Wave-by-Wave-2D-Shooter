# Outpost Zero database setup

Database setup is organized by feature so there is no single giant SQL file.
Each feature has its own numbered scripts and may be installed independently.

## Social

The Social feature provides unique public usernames, friendships, private messages, row
level security, API privileges, Realtime refresh hints, account-setting rules,
server-authorized Party invitations, public Parties, and threaded private-conversation state. Profiles, friendships, and messages
share one core data script because they form the same Social model. All Social
RLS, browser privileges, RPC permissions, and Realtime publication membership
are centralized in one final security script.

In the Supabase Dashboard, open **SQL Editor**, paste each file below, and run
them one at a time in this exact order:

1. `social/Social-01-social-menu.sql` — profiles, friendships, private messages, threaded Inbox state, Archive/Delete, and username messaging
2. `social/Social-02-usernames.sql` — username-setting RPC and the server-enforced 21-day change clock
3. `social/Social-03-parties.sql` — Realtime online discovery, invitations, public Parties, host approval, unique names, and search
4. `social/Social-04-security.sql` — every Social RLS policy, browser/table privilege, RPC permission, and Realtime publication rule

All four scripts are rerunnable. Run the complete sequence again after changing
the Social schema so tables are preserved while functions, triggers, policies,
privileges, and realtime membership are refreshed.

What each Social file does, concretely:

- Run Social `01` once on a project that has never installed Social. It creates
  profiles, friendships, private messages, and per-player conversation state;
  gives every existing Auth account a collision-safe temporary username; and
  provisions future accounts automatically. It also groups replies into one
  conversation per player, keeps at most 25 conversations active, provides
  per-player Archive/Delete state, and installs username-addressed messaging
  with block and abuse-limit checks. Deleting hides existing history only for
  that player; the other participant keeps their copy. Rerunning preserves all
  rows.
- Run Social `02` after `01`. It adds `username_changed_at`, moves every username
  write behind `outpost_zero_set_username`, and enforces one change per 21 days
  with a database trigger and row lock. Replacing a generated `op_<uuid>` name
  for the first time never has a wait. Because old databases did not record
  historical username-change dates, each already-chosen account receives one
  immediate migration-grace change; the 21-day clock starts when that change is
  saved. It does not read, store, or publish account emails.
- Run Social `03` after `02`. It uses Supabase Realtime Presence for the visible
  online-player list, so it creates no database heartbeat row or heartbeat RPC.
  The database safely resolves Realtime usernames into viewer-bound opaque
  picker tokens and short-lived Party invitations. A normal Party invite may
  go to an accepted friend or a player visible through Realtime; CPU 2v2
  invites remain accepted-friend-only. The database checks identity, blocks,
  ticket ownership, and the CPU friendship rule when sending, gives
  normal Party invites a five-minute lifetime and CPU invites two minutes,
  makes retries exact-once, and applies per-sender/per-recipient abuse limits.
  Incoming lists expose only the sender username and invite metadata; only the
  intended recipient can claim the hidden party code/join token. Claims are
  safely repeatable by that recipient until expiry so reloads and failed
  connections can retry. The same file adds the public Party directory, unique
  case-insensitive Party names, host/name search, and pending join-request queue.
  The directory returns only the Party name, host username, and Party size; it
  never returns a code or join token. The host must accept or decline each
  request. Only an accepted requester receives the short-lived code and token.
  No email or Auth account UUID is returned. The public Party
  directory still has a short expiring lease so abandoned listings disappear;
  that Party-record lease is not player online presence.
- Run Social `04` last. It is the one Social security file: profile, friendship,
  message, Party, and Inbox RLS; narrow table/sequence privileges; RPC execution
  permissions and `SECURITY DEFINER` elevation; and Realtime publication membership. Raw Party capability rows
  remain unreadable, friendships/messages remain participant-only, and username
  writes remain limited to the cooldown RPC. Action-specific authentication,
  block, and rate-limit checks stay inside their RPCs because those checks must
  execute atomically with the action they protect.

If the legacy Social `05` is the last Social file you already ran, that same
username code is now named Social `02`; do not rerun it. Run the updated
`social/Social-01-social-menu.sql` first to add the merged Private Inbox features,
then run `social/Social-03-parties.sql`, then run `social/Social-04-security.sql`, each
in its own query. Do not rerun Leaderboards `01`. If a former Social `06`, `07`,
or `09` was already installed, the consolidated Social `03` safely upgrades
those tables and removes the old database online-heartbeat table and functions.
Deploy the matching game JavaScript at
the same time, then hard-refresh or sign out/in. Missing the updated `01` keeps
basic message delivery but disables saved Archive/Delete state and non-friend
messages. Missing `03` hides online-player invite discovery and disables the public directory.
Missing the final Social `04` means the consolidated security installation is
incomplete; do not use the Social features until it succeeds.

Future database features should get a sibling folder under `sql/` with their
own numbered scripts and a dependency order documented here.

## Leaderboards

The public leaderboard reads live Social usernames through a narrow RPC instead
of exposing account emails or trusting the name stored with a score. Run this
after Social core has created and backfilled player usernames:

1. `leaderboards/01-public-board.sql`
2. `leaderboards/Leaderboards-03-security-realtime.sql`

If you already finished the legacy Social `01` through `04`, run only this one Leaderboards
script next. If `leaderboards/01-public-board.sql` is the last database script
you already ran, your only new paste is `social/Social-02-usernames.sql`; do not
replace any table and do not rerun Leaderboards `01` for the Settings update.
It uses the existing `public.scores` table that already stores game scores; it
does not create or replace the table.

This also removes obsolete `outpost-zero-profile` score rows that could contain
legacy account-email JSON, rewrites old score aliases to Social usernames, and
installs the narrow username/high-score player lookup used by public profiles.
It also blocks old browser tabs from recreating those JSON rows and removes
anonymous direct reads of the raw score table. Signed-in score saving and
referrals retain authenticated access through the forced-RLS rules in
Leaderboards 03. That file also owns the `scores` Realtime publication used to
refresh live boards and referral claims. It also owns the private, idempotent
Arena-win receipts and the atomic `record_outpost_zero_arena_win` RPC. Rerun
Leaderboards 03 when deploying the reliable Wins leaderboard update; no new
SQL category or extra numbered script is required.

This script is rerunnable. It exposes only user ID, username, and score, and it
hard-limits requests to the two public Outpost Zero boards and five rows.
Accounts created before usernames were required use `USERNAME_NOT_SET` as an
internal RPC marker instead of publishing an email or UUID-like temporary
label. This covers both the current 20-character generated handle and the
legacy 8-character version. The signed-in owner may see their own email from
their private Auth session until they choose a username. Creator/Main may also
request a separately role-checked fallback label for unfinished top-five rows;
regular and signed-out viewers see a non-identifying placeholder. The public
leaderboard RPC never selects from `auth.users` and never returns an email.
Blank, malformed, and email-shaped legacy handles are treated as unfinished.
Cleanup is restricted to score games
beginning with `outpost-zero`, so it does not rename rows belonging to another
game that shares the table.

## Weapons

Run `weapons/Weapons-01-weapons.sql` after Admin 01. It owns both
`weapon_prices` and `weapon_defs`: storage, forced RLS, narrow browser grants,
RPC-only Creator/Main writes, and Realtime publication for game subscribers.
This includes `weapon_defs`, which the old miscellaneous Realtime query omitted.
Unpublished-weapon ownership remains enforced by the shipped game code.
After Admin 02 is installed, Creator and Main save validated definitions plus
the legacy/unscaled shop cost atomically through
`save_outpost_zero_weapon_definition`. Existing Co-admin/Tester suggestions
remain reviewable, while the current game no longer shows the old Admin Tools
suggestion composer.

The saved `Realtime 01` query is now legacy only. Admin, Social, Leaderboards,
and Weapons each own their own security and Realtime rules; do not rerun the
miscellaneous query because its older Admin policies and raw `admins`
publication would weaken the current perimeter. It may be deleted separately
after the owning section queries have been verified in Supabase.

## Account password changes

There is no password SQL file. Passwords belong to Supabase Auth, not a public
game table. The signed-in Settings action calls `supabase.auth.updateUser` with
the new password; Supabase hashes and stores it in Auth. Do not create a
password column, function, or trigger in `public`, and never paste a password
into the SQL Editor.

## Administration

Administration is installed as exactly three rerunnable SQL files. Inbox and
Suggestions share Admin 03 so the new fourth UI section does not create another
database script. Run them in this order after Social 01 and the base
profiles/scores tables:

1. `administration/Admin-01-admin-menu.sql`
2. `administration/Admin-02-admins.sql`
3. `administration/Admin-03-inbox.sql`

| File | Section | Purpose |
| --- | --- | --- |
| Admin 01 | Admin Menu | Secure username-based player lookup/editing, temporary and permanent grants, bans, appeals, approval requests, and the append-only audit LOG. |
| Admin 02 | Admins | Creator/Main/Co/Tester hierarchy, Add/Promote/Demote/Remove, Tester/Co weapon suggestions, heading/details global updates, and non-enumerable promo codes. |
| Admin 03 | Inbox + Suggestions | Targeted player notifications, one-row global update notifications, staff messages, Archive/read state, Reports, report export, Realtime refresh hints, and LOG access through Admin 01. |

All three files preserve existing rows and can be rerun. Each transaction
creates its own required Admin tables before installing functions and security.
Actor identity and roles are resolved from `auth.uid()` plus server-owned rows;
the browser cannot claim an actor, role, account ID, private target email, or
timestamp. Private tables use forced RLS and narrow column/RPC privileges.

Admin 01 includes the former Appeals setup and the safe internal compatibility
functions required by its audited wrapper. Private Auth email resolution occurs
inside Postgres. Creator/Main may use or see the exact account email only when
that account has no chosen username; Co-admins remain username-only except for
their own fallback identity. Public and non-admin APIs remain email-free. On its first run,
Admin 01 reads the creator username from the private, transaction-local
`outpost_zero.creator_username` setting and pins that account's Auth UUID in a
forced-RLS config row. The public file contains no creator identity. Existing
installations already have the UUID and need no setting. Later username or
login-email changes do not change the creator role, and clients cannot read the
UUID. Creator and Main admins may apply permanent currency/score/ownership
edits directly. Testers remain unable to call these legacy Admin Menu APIs.

Admin 02 owns the staff roster and update lifecycle. The fixed creator may
manage every tier. Main admins may manage Co-admins and Testers but cannot
alter the creator or another Main. Co-admin updates remain drafts until a
creator/Main approves them. Approved updates are canonical `banners` rows;
Admin 03 turns each into one shared Inbox notification instead of copying a
row per player. Home/Inbox lists show the short heading and the full reader
shows details. Creator/Main can read and review the Suggestions queue and save
strictly validated weapon edits directly; the save function gives a clear
call-time setup error when Weapons 01 has not been installed yet. Every
signed-in account may redeem each promo code once; their code catalog has no
player-readable table policy.

Admin 03 owns the private Admin Inbox plus the report data shown in Suggestions.
Player notifications use recipient-private/global rows and per-account read
receipts. The staff Inbox uses `admin_msgs`; Testers may read/archive only their
own messages, while only creator/Main may send. Signed-in reports use a
server-attributed submission RPC; ordinary accounts have a transactional
30-second limit while staff do not. Raw report rows have no browser access.
Creator/Main list, resolve, and export only sanitized rows through bounded
RPCs. New Outpost Zero reports neither store nor return a staff/player tier;
any legacy column used by another game is left intact. Bulk Resolve All/Custom
is an atomic newest-open operation scoped to Outpost Zero. A recipient-private
Realtime wakeup replaces publication of report contents. The LOG remains the
append-only Admin 01 audit table and is exposed only through its bounded RPC.
Realtime subscriptions are refresh
hints; RLS and RPC checks remain authority.

For the Suggestions/direct-weapon-edit update, rerun only these files in order:

1. `administration/Admin-02-admins.sql` — installs the Creator/Main Suggestions
   review boundary and validated atomic weapon-save RPC. If the weapon tables
   already exist, it also removes their legacy direct browser write policies
   and grants.
2. `administration/Admin-03-inbox.sql` — unifies reports, installs bulk
   Resolve All/Custom, and keeps list/export/Realtime private.

Both preserve report, suggestion, and weapon-definition rows when rerun. The
checked-in `Weapons-01-weapons.sql` also contains the RPC-only perimeter for
future fresh installs, but it does not need to be rerun for this update because
Admin 02 tightens already-existing weapon tables conditionally.

The old Admin 04–08 and Appeals 01 snippets are superseded by these three files
and must not be rerun after consolidation.

## AI bot ladder

Current installation status: AI `01` is the live CPU ladder migration. AI `02`
and AI `03` were intentionally skipped. They store model-release history and
privacy-limited match evidence; neither one trains a bot or is required for CPU
opponents, difficulty tiers, Score progress, promotion, or demotion. Do not run
AI `02` or `03` unless those optional history/evidence features are deliberately
restored later.

The tactical bot brain is shared by every player, while signed-in players have
private cloud ladder progress through five execution tiers: Beginner, Easy,
Medium, Hard, and Impossible. Guests play Beginner without creating database
state. Normal completed AI matches update only the signed-in account; creator
and main-admin comparison tests never update the ladder.

The files remain documented for reference. For the current deployment, run
only `01`. If the optional history/evidence features are restored later, their
dependency order is:

1. `ai/01-global-training.sql` — private per-account ladder, exact-once match
   receipts, RLS, narrow read/submit RPCs, and API grants
2. `ai/02-model-history.sql` — immutable tactical model releases, the global
   active-model pointer, creator/main-admin activation, and an append-only audit
3. `ai/03-game-training.sql` — privacy-limited completed-match training
   summaries, exact-once offline retries, and creator/main-admin aggregates

If Social was the last feature you installed, do not rerun or replace any
Social file for this change; use separate SQL Editor queries for the AI files.
If AI 01 and AI 02 were already installed but AI 03 was not, AI 03 remains the
next script for match-evidence summaries. The ladder correction immediately
below is separate and still requires the updated AI 01 rerun.

For the August 27 CPU-ladder correctness update, paste and run the **entire
updated `ai/01-global-training.sql` file again**, even if AI 01 was installed
before. Open a new SQL Editor query, paste that whole file by itself, and press
Run. This is an in-place rerun: do not replace a table, do not erase ladder
rows, and do not append the SQL to another file. AI 01 is independent of every
Social and Administration migration, so none of those files should be rerun
for this correction. The AI 01 rerun preserves every account and receipt,
updates the result RPC, and repairs the old Impossible win-streak value `3` to
the completed/reset value `0` with a newer revision. It also enforces that both
stored streak counters are always `0`, `1`, or `2`. AI 02 and AI 03 do not need
to be rerun for this ladder-only correction.

The historical AI 01 filename is retained for ladder compatibility. All three
AI scripts are rerunnable and do not delete profile data.
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
revision inside the transaction. The server remains canonical. The browser
keeps only owner-scoped unsynced match receipts plus an advisory ladder cache
so a reload or temporary outage cannot erase a result; neither is copied into
the general profile JSON.

The player-facing `SCORE` is the SQL `progress` field: each win adds one score,
score 10 or a third consecutive win promotes to the next tier, and promotion
resets score plus both streak counters. Every third consecutive loss removes
one score; at score zero it demotes one tier and resumes at score nine, while
Beginner zero is the floor. Impossible is the ceiling at score 10, but its win
streak still cycles `0, 1, 2, 0` on every third win instead of getting stuck.
Only CPU 1v1 and the fully local one-player-plus-ally-CPU 2v2 update this
ladder. Invite-a-friend and Party CPU 2v2 matches are deliberately unranked.

AI 02 is separate because model history is global while ladder progress is
private per account. Every release maps to an allowlisted behavior snapshot
embedded in the game; Supabase stores no executable code. `TEST MODEL` runs an
isolated admin comparison and never writes ladder or live-model state. `BRING
BACK MODEL` atomically changes the global model pointer for future matches,
keeps newer releases in history, and records who made the change. It does not
alter any player's difficulty or an already-running match. Direct table access
is denied, and the activation RPC verifies the creator/main-admin role from the
signed Supabase JWT and server-side admins table rather than trusting the UI.

AI 03 connects finished normal local AI 1v1, local AI 2v2, and Party CPU 2v2
games to the shared model-history system. A Party game produces one receipt
from its authority host only; the other client never submits a duplicate. Party
CPU uses the fixed full Apex V5 tactical feature set at difficulty 2, so its
receipt is explicitly tagged `party2v2`, `apex-v5`, and difficulty 2 even when
an archived global model is active. This keeps Party samples distinguishable
from local model/difficulty samples during trusted aggregate analysis.

The browser sends one bounded summary with a stable UUID; if the network or RPC
is unavailable, the same summary remains in an owner-isolated device queue for
up to 30 days and is retried after reconnect. Guests contribute separately from
signed-in accounts. Admin comparison tests, unfinished or disconnected Party
games, non-host Party clients, and player-versus-player matches are not
submitted. The database stores no email, username, teammate ID, loadout, chat,
input log, or exact position, and creator/main admins see aggregates rather
than player rows.

Training summaries do not contain executable code and can never activate a
model or alter ladder progress. They measure how each frozen model performs and
where its movement, navigation, TNT, and portal behavior needs work. Turning
that evidence into a new tactical release still requires a reviewed game-code
change (or a future trusted training worker); untrusted browser reports are not
allowed to rewrite the globally active bot automatically.

Because matches run locally, the database cannot independently prove a reported
win. UUID receipts plus the 30-second, 20-per-hour, and 100-per-day server-time
limits prevent accidental duplicates and simple request spam on the player
ladder. Training delivery permits an offline backlog but caps each account or
installation at 120 per hour and 500 per day. Fully cheat-proof results would
require a future authoritative match server or server-issued begin-match ticket.
