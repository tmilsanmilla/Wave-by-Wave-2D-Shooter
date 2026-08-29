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
referrals retain their existing authenticated access and RLS checks.

This script is rerunnable. It exposes only user ID, username, and score, and it
hard-limits requests to the two public Outpost Zero boards and five rows.
Accounts created before usernames were required use `USERNAME_NOT_SET` as an
internal RPC marker instead of publishing an email or UUID-like temporary
label. This covers both the current 20-character generated handle and the
legacy 8-character version. The signed-in owner may see their own email from
their private Auth session until they choose a username; everyone else sees a
non-identifying placeholder. The leaderboard RPC never selects from
`auth.users` and never returns an email. Cleanup is restricted to score games
beginning with `outpost-zero`, so it does not rename rows belonging to another
game that shares the table.

## Account password changes

There is no password SQL file. Passwords belong to Supabase Auth, not a public
game table. The signed-in Settings action calls `supabase.auth.updateUser` with
the new password; Supabase hashes and stores it in Auth. Do not create a
password column, function, or trigger in `public`, and never paste a password
into the SQL Editor.

## Administration

Administration now has one clean sequence: `01`, `02`, `03`, and `04`.
There is no `02B` or `05`. Administration `02` owns secure updates and admin
role controls. Administration `03` keeps its notification-Inbox number.
Administration `04` merges username-based admin actions with Testers, weapon
suggestions, demotion, and report copy.

For the current project state, Administration `01`, `02`, and `03` have already
been run. Run `04` if its merged features are not installed yet. Every active
file is rerunnable and preserves existing data.
AI `02` and AI `03` are the migrations that were intentionally skipped; they
are unrelated to this Administration sequence.

Quick purpose guide:

| File | What it adds | What it does not do |
| --- | --- | --- |
| Administration `01` | Audited player edits, temporary weapon gifts, permanent gift/request approvals, ban/appeal handling, and the private creator/main LOG. | It does not publish Home updates or create the player notification Inbox. |
| Administration `02` | Secure Home/global Inbox update publishing and server-authorized admin-role controls. | It does not enforce weapon publication or add Tester accounts. |
| Administration `03` | The private player notification Inbox for updates, bans, gifts, and friend events, plus targeted creator/main messages. | It does not expose the private admin LOG or change staff ranks. |
| Administration `04` | Username-based admin wrappers, Tester rank, Tester/Co-admin weapon suggestions, creator/main review, Promote/Demote, staff Inbox restrictions, and `COPY ALL`/`COPY X` reports. | It does not expose private Auth emails, change Social usernames, or automatically apply an approved weapon suggestion. |

### Temporary gifts and the private LOG

Run this after the project's existing administration tables/RPCs are installed:

1. `administration/01-temporary-grants-and-audit.sql`

This is the only new SQL paste needed for temporary weapon gifts and the
creator/main LOG. It requires the already-live `admins`, `profiles`, `scores`,
`bans`, `ban_appeals`, and `player_requests` tables plus the existing
`admin_edit_player(target_email, patch)` RPC. It does not replace those tables,
does not alter permanent ownership, and is safe to run again. A rerun preserves
all temporary grants, request/appeal rows, and append-only audit history.

What Administration `01` does, concretely:

- Creates a server-owned temporary-grant table for the nine `GEM_SHOP` weapon
  keys. Creator/main admins choose 5 minutes through 365 days. Expiry is based
  on the database clock and an expired row stops granting access even if no
  cleanup job runs. Permanent `profiles.data.owned` values remain separate.
- Makes grant/revoke/edit operations exact-once with caller-supplied operation
  UUIDs. The UUID identifies a retry, never an account. Per-player/per-weapon
  transaction locks prevent two requests from classifying or extending the
  same missing grant concurrently.
- Wraps the existing player editor, compares actual before/after profile,
  leaderboard, and ban rows, and atomically records permanent gifts/revokes,
  score, gems, coins, upgrades, bans, unbans, rejected edits, and no-change
  retries. Actor identity and role are reread from Auth and `admins`; the
  browser cannot supply them. Only the creator can apply permanent score,
  currency, upgrade, or ownership edits. Main admins submit those through the
  locked approval queue; they may directly apply only ban/unban patches.
- Moves player-request submission/approval/rejection and ban-appeal
  submission/lift/deny behind locked RPC transactions. An approved request or
  lifted ban and its decision log either both commit or both roll back. Appeal
  submission is limited to one open row and three submissions per account per
  rolling day so changing operation UUIDs cannot flood the private LOG.
- Exposes keyset-paginated audit rows only to the creator/main admins. Co-admins
  retain view-only ban/appeal lists through narrow RPCs but cannot see the LOG
  or mutate grants. Players can read only their own active grant keys/expiry;
  ban enforcement uses an account-derived/bounded-device RPC instead of raw
  reads of the bans table.
- Forces RLS on the new tables, removes all direct browser table privileges,
  retires direct access to legacy `player_log` and `admin_edit_player`, and
  exposes only the documented RPCs. The old `player_log` table/rows are left in
  place rather than deleted.

Deploy the matching game JavaScript at the same time as this SQL. The migration
intentionally revokes the old direct edit/request/appeal paths so an old tab
cannot bypass the audit. After running it, sign out/in or hard-refresh before
testing creator/main controls.

### Administration 02 — secure updates and admin roles

For creator/main updates to appear on both Home and in every player's Inbox,
paste and run this entire file in the Supabase SQL Editor:

1. `administration/02-secure-updates.sql`

Administration `02` needs Administration `01` plus the already-live `banners`
and `admins` tables and Supabase Auth. It replaces update/admin-role functions
and policies in place while preserving existing updates and admin rows.

What Administration `02` does, concretely:

- Keeps one approved `banners` row as the canonical update. The same row is
  shown on Home and in Inbox, so it does not copy one message into every user
  account and cannot partially fan out.
- Makes creator/main posts live immediately. Co-admin posts remain pending and
  invisible to players until a creator or main admin approves them.
- Derives the actor and role on the database server from the signed-in Auth
  account and `admins`; the browser cannot claim a role, author email, approval
  state, or timestamp. Stored authors are non-email labels such as `CREATOR` or
  `MAIN ADMIN`, and legacy email authors are replaced with safe labels.
- Hardens the existing `admins` table that supplies those roles: it removes old
  policies and direct writes, hides the roster from ordinary players, lets a
  co-admin see only their own row, and exposes server-authorized list/add,
  promote, demote, and remove RPCs. The fixed creator can manage main/co admins;
  a main admin can add/manage co-admins but cannot alter the creator or another
  main admin. Administration `04` extends this safely with Tester and visible
  Promote/Demote controls.
  Raw admin rows are not published through Realtime; the client refreshes the
  narrow roster RPC after authentication, when opening Admin tools, and on a
  three-minute safety poll. A stale tab may briefly show an obsolete button,
  but every action rereads the server role and fails immediately after removal.
- Removes old banner policies and direct browser writes, then exposes narrow
  post, approve, reject, delete, and bounded-list RPCs. Approved rows remain
  RLS-readable for the public Home feed and Realtime; pending rows are visible
  only to creator/main reviewers.
- Lists approved and pending updates independently. Even if there are ten or
  more newer drafts, they cannot consume the public feed limit and hide a live
  update.

Unpublished-weapon ownership and shop availability are enforced by the shipped
game code, not by an Administration SQL migration. Administration `02` does not
create weapon policies, strip ownership, or publish `weapon_defs` to Realtime.

Deploy the matching JavaScript and run Administration `02` together because the
migration intentionally closes the old direct `admins` and `banners` write
paths. Then hard-refresh the game. Test once as a normal player (no admin roster
and only approved updates), once as a co-admin (only their own role row and a
new post says it is awaiting approval), and once as creator/main (the permitted
roster actions work; approve the draft and confirm the same update appears on
Home and in Inbox).

### Unified private notification Inbox

After Social `01` and Administration `01` + `02` are installed, paste and run
this entire file in the Supabase SQL Editor:

1. `administration/03-notification-inbox.sql`

If you already ran Administration `01` and `02`, this is the **only** new SQL
paste. Add/run `03`; do not replace or append to `01` or `02`, and do not rerun
the installed Social files. If either Administration prerequisite was never run,
run the missing prerequisite first and then run `03`. A clear prerequisite
error means the earlier file is missing; it does not mean to paste the files
together. Administration `03` is safe to rerun and preserves every existing
notification and read receipt.

If the last SQL you actually applied was legacy Social `05` and you have not installed
these later features yet, run these six whole files **one at a time**, in this
order: the updated Social `01`, Social `03`, Social `04`, Administration `01`,
Administration `02`, Administration `03`. For each step, create a new SQL Editor query, paste the entire file, and
press Run; add/run each file rather than replacing or appending to an older
file. Do not rerun the username code now named Social `02` or Leaderboards `01`.
Administration `01` first needs the game's original `admins`, `profiles`,
`scores`, `bans`, `ban_appeals`, and `player_requests` tables plus its original
`admin_edit_player(target_email, patch)` RPC; if Supabase reports one missing,
install that original administration schema before continuing. If you already
ran any file in the six-step list successfully, do not repeat it—continue with
the next missing file.

What Administration `03` does, concretely:

- Creates a forced-RLS notification table and per-account read-receipt table
  with no direct browser policies or table grants. Players list and mark only
  notifications addressed to their signed-in Auth account, plus shared global
  updates. The API returns opaque text keys such as `n_42`, never an Auth UUID,
  account email, internal actor/source ID, or JavaScript-unsafe bigint.
- Lets only the server-verified creator or a main admin send a message to one
  chosen public username. The browser cannot choose an author label, role,
  target account ID, email, timestamp, or read owner. Operation UUIDs make an
  exact retry return the first result; changing the payload with the same UUID
  fails. Rolling sender, per-recipient, and incoming limits prevent staff-message
  floods even when two admins send concurrently.
- Converts successful Administration `01` audit events into atomic recipient
  notices for applied bans, lifted bans, temporary/permanent weapon grants or
  removals, score changes, currency changes, and upgrade changes. The mutation,
  audit row, and notice either all commit or all roll back. Player-facing text
  never copies private audit notes, emails, or UUIDs.
- Converts each newly approved Administration `02` banner into one global Inbox
  row plus separate per-player read receipts; it does not copy the message into
  every account. Its allowlisted `banner:<id>` reference lets the signed-in UI
  suppress the duplicate legacy banner card while Home continues using the
  canonical banner. Deleting that update hides its Inbox row while retaining a
  private rate-limit tombstone, so delete/repost cannot bypass the update cap.
  The summary RPC also returns an opaque `feed_revision`; it changes when a
  visible notice is added or a banner is removed, so the client can discard
  stale cached pages and make a deleted update disappear without exposing the
  hidden tombstone.
- Adds a server-bound friend-request notice for the invited player. Acceptance
  creates one source-idempotent congratulations notice for each participant,
  using only the counterpart's chosen public username. Existing Friends lists
  remain the authority for the current relationship state.
- Uses source-unique triggers for audit, update, and friendship events, so a
  retry or repeated trigger installation cannot duplicate an event. Read marks
  are recipient-bound and idempotent. Global updates are limited to five per
  ten minutes and thirty per day; targeted messages are limited to twelve per
  ten minutes, sixty per day, four per recipient per hour, and thirty incoming
  per recipient per hour.

Deploy the matching game JavaScript at the same time, then hard-refresh or sign
out/in. Until Administration `03` is installed, the game keeps the prior safe
banner, Friends, direct-message, and Party-invite views; it hides the targeted
staff-message composer and never falls back to inserting a notification or
private message directly.

### Administration 04 — username actions, Testers, suggestions, and reports

After Administration `01` and Social `01` are installed, run:

1. `administration/04-username-actions-testers-and-reports.sql`

Administration `04` lets creator/main admin lookup, edit, grant, revoke, and
ban commands accept the player’s public username. The wrappers resolve the
corresponding Auth email only inside a `SECURITY DEFINER` function and then
call the existing audited Administration `01` RPCs. The browser never receives
or submits the target player’s private email. Pending-request screens likewise
return the target username instead of the target email. The same file adds a
lowest `tester` staff tier. Testers can use Test
Mode, read/archive only their own Admin Inbox messages, and submit a proposed
weapon change. They cannot read reports or the audit
log, look up private player data, post updates, manage staff, view unpublished
weapons, edit weapons, or call the older Administration RPCs directly. The old
admin authority helper deliberately continues to return no role for Testers;
only the new narrow staff/suggestion/Inbox functions recognize them.

Creator/main reviewers can read pending weapon suggestions and mark them
approved or rejected. Approval records the review; it never changes live weapon
stats automatically. The migration also changes Promote/Demote into the visible
hierarchy `Main → Co-admin → Tester` while the creator remains fixed and only
the creator can demote a Main. `COPY ALL`/`COPY X` uses a creator/main-only RPC
that returns explicit report fields in newest-first order. Raw reports remain
write-only to players and unreadable to Testers.

Administration `03` owns player-facing notifications; Administration `04` owns
the staff-only Admin Inbox permissions and role hierarchy. In this project,
`03` was already installed. Run `04` as one whole SQL Editor query if these
merged Administration features are not installed yet.

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
