# Outpost Zero database setup

Database setup is organized by feature so there is no single giant SQL file.
Each feature has its own numbered scripts and may be installed independently.

## Social

The Social feature provides unique public usernames, friendships, private messages, row
level security, API privileges, Realtime refresh hints, account-setting rules,
and server-authorized Party invitations. Profiles, friendships, and messages
share one core data script because they form the same Social model. Security,
privileges, Realtime, and the optional online-invite upgrade remain separate.

In the Supabase Dashboard, open **SQL Editor**, paste each file below, and run
them one at a time in this exact order:

1. `social/01-social-core.sql` — profiles, friendships, and private messages
2. `social/02-rls-policies.sql` — row-level security policies
3. `social/03-privileges.sql` — narrow API permissions, including signup username availability
4. `social/04-realtime.sql` — friendship and message refresh events
5. `social/05-account-settings.sql` — authenticated username-setting RPC and the server-enforced 21-day change clock
6. `social/06-party-online-invites.sql` — private-safe online presence and Party invites to accepted friends or currently-online players

All six scripts are rerunnable. Run the complete sequence again after changing
the Social schema so tables are preserved while functions, triggers, policies,
privileges, and realtime membership are refreshed.

What each Social file does, concretely:

- Run Social `01` once on a project that has never installed Social. It creates
  the three Social tables, gives every existing Auth account a collision-safe
  temporary username, and provisions future accounts automatically. Rerunning
  it preserves rows.
- Run Social `02` immediately after `01`. It turns on row-level security so a
  signed-in player can see public usernames but only participants can see a
  friendship or private message.
- Run Social `03` immediately after `02`. It removes broad browser table access,
  grants only the columns each feature needs, and exposes the boolean username
  availability check used during signup.
- Run Social `04` immediately after `03`. It adds only friendships and private
  messages to Supabase Realtime so screens refresh after a change; RLS still
  filters every delivered row.
- Run Social `05` after `04`. It adds `username_changed_at`, moves every username
  write behind `outpost_zero_set_username`, and enforces one change per 21 days
  with a database trigger and row lock. Replacing a generated `op_<uuid>` name
  for the first time never has a wait. Because old databases did not record
  historical username-change dates, each already-chosen account receives one
  immediate migration-grace change; the 21-day clock starts when that change is
  saved. It does not read, store, or publish account emails.
- Run Social `06` after `05`. It adds a 90-second server-time online heartbeat,
  viewer-bound opaque picker tokens, and short-lived Party invitations. A
  normal Party invite may go to an accepted friend (online or offline) or a
  player whose heartbeat is currently fresh. CPU 2v2 invites remain
  accepted-friend-only. The database rechecks that rule when sending, gives
  normal Party invites a five-minute lifetime and CPU invites two minutes,
  makes retries exact-once, and applies per-sender/per-recipient abuse limits.
  Incoming lists expose only the sender username and invite metadata; only the
  intended recipient can claim the hidden party code/join token. Claims are
  safely repeatable by that recipient until expiry so reloads and failed
  connections can retry. Raw presence, target, and invite tables use forced
  RLS with no browser grants. No email or Auth account UUID is returned.

If Social `05` is the last Social file you already ran, your only new SQL paste
is the entire `social/06-party-online-invites.sql` file. Add and run it. Do not
rerun Social `01` through `05`, do not replace `05`, do not paste `06` onto the
end of an older SQL file, and do not rerun Leaderboards `01`. Deploy the
matching game JavaScript at the same time,
then hard-refresh or sign out/in. If `06` has not been installed yet, the game
keeps the existing accepted-friend invite flow and simply hides online-player
discovery; it never weakens private-message permissions as a fallback.

Future database features should get a sibling folder under `sql/` with their
own numbered scripts and a dependency order documented here.

## Leaderboards

The public leaderboard reads live Social usernames through a narrow RPC instead
of exposing account emails or trusting the name stored with a score. Run this
after Social core has created and backfilled player usernames:

1. `leaderboards/01-public-board.sql`

If you already finished Social `01` through `04`, run only this one Leaderboards
script next. If `leaderboards/01-public-board.sql` is the last database script
you already ran, your only new paste is `social/05-account-settings.sql`; do not
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

Administration has two independent migrations. Run the file for the feature
you are deploying; Administration `02` does **not** require Administration `01`.

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

### Secure Home + Inbox updates

For creator/main updates to appear on both Home and in every player's Inbox,
paste and run this entire file in the Supabase SQL Editor:

1. `administration/02-secure-updates.sql`

For this update, add/run Administration `02`; do not replace a previous SQL
file and do not rerun Social `01` through `05`. Administration `02` needs only
the already-live `banners` and `admins` tables plus Supabase Auth. It is safe to
run even if Administration `01` has never been run. If Supabase reports that
`banners` or `admins` is missing, install the game's original administration
schema first, then rerun this whole file.

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
  main admin. The current UI intentionally has no Demote button; the
  creator-only demotion RPC keeps that future action inside the same boundary.
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

Deploy the matching JavaScript and run Administration `02` together because the
migration intentionally closes the old direct `admins` and `banners` write
paths. Then hard-refresh the game. Test once as a normal player (no admin roster
and only approved updates), once as a co-admin (only their own role row and a
new post says it is awaiting approval), and once as creator/main (the permitted
roster actions work; approve the draft and confirm the same update appears on
Home and in Inbox).

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
3. `ai/03-game-training.sql` — privacy-limited completed-match training
   summaries, exact-once offline retries, and creator/main-admin aggregates

If Social was the last feature you installed, do not rerun its four files for
this change; paste and run the AI scripts instead. If you already ran AI 01 and
AI 02, paste and run only AI 03 next.

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
