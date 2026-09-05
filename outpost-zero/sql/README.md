# Outpost Zero database setup

Outpost Zero uses twelve saved SQL queries: Player 01–04, Admin 01–04,
Multi device 01–03, and the read-only Leaderboard 01. Player and Admin 04 own
their section's policies and permissions. Feature installers call the matching
security installer before their transaction commits. Multiplayer 01/02 remain
closed to browsers until Multi device 03 grants the reviewed RPC access.

## Fresh installation order

Run the complete files in this exact order:

1. `player/Player-04-security.sql`
2. `administration/Admin-04-security.sql`
3. `player/Player-03-social-menu.sql`
4. `player/Player-01-stats.sql`
5. `player/Player-02-weapons-and-cosmetics.sql`
6. `administration/Admin-01-admin-menu.sql`
7. `administration/Admin-02-admins.sql`
8. `administration/Admin-03-inbox.sql`
9. `multi-device/Multi-device-01-duels.sql`
10. `multi-device/Multi-device-02-ranked.sql`
11. `multi-device/Multi-device-03-security.sql`
12. `leaderboards/Leaderboard-01.sql` (read-only display)

Player 03 is the first feature because it creates the private account profile
and public usernames used by Player 01 and the Admin queries. Security 04 can
be installed first on either a fresh or existing project; it applies only to
complete feature APIs. Every installer is rerunnable and transactional.
Leaderboard 01 only reads existing data and needs no setup transaction.

In the Supabase SQL Editor, use these exact saved-query names without dashes or
`.sql`:

- **Player 01 Stats**
- **Player 02 Weapons and Cosmetics**
- **Player 03 Social Menu**
- **Player 04 Security**
- **Admin 01 Admin Menu**
- **Admin 02 Admins**
- **Admin 03 Inbox**
- **Admin 04 Security**
- **Multi device 01 Duels**
- **Multi device 02 Ranked**
- **Multi device 03 Security**
- **Leaderboard 01**

When this project says to **update Supabase**, edit the matching saved query,
paste the complete current file, press **Save**, and then press **Run**. Merely
changing the repository or running an unnamed temporary query does not update
the saved SQL Editor query.

## Player 01 Stats

`player/Player-01-stats.sql` owns leaderboard and CPU-ranking state:

- `scores` stores Endless scores, Arena wins, and referral claims. It has
  forced RLS, narrow authenticated writes, public reads through bounded RPCs,
  and the only Player 01 Postgres Realtime feed.
- `outpost_zero_arena_win_receipts` makes Arena wins exact-once. It has forced
  RLS, no browser table access, and no Realtime publication.
- `outpost_zero_bot_ladder` stores each signed-in player's Beginner through
  Impossible rank.
- `outpost_zero_bot_ladder_matches` makes CPU results exact-once. Both ladder
  tables have forced RLS, RPC-only access, and no Realtime publication.

The tactical CPU brain remains in game code. Player 01 stores ranking only; it
does not train, select, or download bot code. Guests use Beginner without a
database row, and Test Mode never changes rank.

The public leaderboard RPC exposes only an account ID, safe username label,
and score. It never exposes Auth email or the private account profile. CPU 1v1
and fully local CPU 2v2 update the ladder; friend and Party CPU games do not.

## Player 02 Weapons and Cosmetics

`player/Player-02-weapons-and-cosmetics.sql` owns shared equipment data:

- `weapon_prices` stores current shop prices.
- `weapon_defs` stores live stats, price metadata, and publication state.

Both tables have forced RLS, public read-only browser access, Creator/Main
writes through the validated Admin 02 RPC, and Postgres Realtime refresh feeds.
Unpublished-weapon ownership remains enforced by the shipped game code.

Cosmetics have no standalone SQL table to migrate. Cosmetic colors and equip
animations are fixed catalogs in game code; each player's owned and equipped
cosmetics remain inside that player's private `profiles.data` save under
Player 03. This is intentional: Player 02 is the Weapons and Cosmetics section,
while Player 03 remains the single owner of the account save blob. Do not add a
second cosmetic ownership table or duplicate those profile fields.

## Player 03 Social Menu

`player/Player-03-social-menu.sql` owns account saves, usernames, Friends,
Private Inbox conversations, blocks, Party invitations, and public Parties:

- `profiles` is the signed-in player's private game-save blob. It has forced
  owner-only RLS and no Postgres Realtime feed.
- `social_profiles` stores public usernames. It has forced RLS; signed-in
  players may read usernames, while username changes use the cooldown RPC. It
  is not published through Postgres Changes.
- `friendships` has forced participant-only RLS and a Realtime refresh feed.
- `private_messages` has forced participant-only RLS and a Realtime refresh
  feed.
- `private_conversation_states` has forced owner-only RLS and a Realtime
  refresh feed for Inbox, Archive, unread, and delete state.
- `outpost_zero_party_invite_targets`, `outpost_zero_party_invites`,
  `outpost_zero_public_parties`, and
  `outpost_zero_public_party_requests` have forced RLS, RPC-only access, and no
  Postgres Changes publication because they contain private capability state.

Online-player discovery and immediate public-Party decisions use Supabase
Realtime Presence/Broadcast. That does not require a database heartbeat table
or publication of raw Party rows.

Player 03 also owns Social Inbox maintenance. Once per year, it may remove a
message older than one year only when it has been read, both participants have
archived or deleted past it, and no newer message reopened either conversation.
Unread or one-sided history is preserved.

## Administration

The Admin area has three features and one shared security installer:

| Saved query | File | Purpose |
| --- | --- | --- |
| Admin 01 Admin Menu | `administration/Admin-01-admin-menu.sql` | Secure username-or-exact-email player lookup/editing, grants, bans, appeals, requests, and the append-only audit LOG. |
| Admin 02 Admins | `administration/Admin-02-admins.sql` | Creator/Main/Co/Tester roles, promote/demote/remove, weapon suggestions, heading/details updates, and non-enumerable promo codes. |
| Admin 03 Inbox | `administration/Admin-03-inbox.sql` | Admin Inbox, global and targeted notifications, Archive/read state, Reports, report export/resolve, Suggestions views, and private Realtime wakeups. |
| Admin 04 Security | `administration/Admin-04-security.sql` | Extracted Admin RLS, table grants, RPC permissions, and approved RPC elevation. |

Every Admin feature applies its corresponding RLS from Admin 04 before commit.
Private tables are forced-RLS and RPC-only. Admin 01 publishes no raw table.
Admin 02 publishes only `banners`.
Admin 03 publishes only the recipient-filtered
`outpost_zero_admin_msg_wakeups` and `outpost_zero_report_wakeups`; raw
messages, notifications, reports, and receipts stay private.

On a completely fresh project, Admin 01 needs the creator's chosen username in
the transaction-local `outpost_zero.creator_username` setting. It converts that
username to an Auth UUID and permanently pins the creator account. Existing
projects already have the pinned UUID and must not reseed it.

Admin 03 owns Admin Inbox maintenance. Unread messages are never deleted. A
manually archived message, or a read message auto-archived for at least seven
days, becomes eligible only after it is one year old.

## Realtime ownership

Supabase Postgres Changes uses one managed publication named
`supabase_realtime`. Each owning section independently adds only its
approved refresh tables and removes its private tables. This isolates feature
setup without creating competing publications.

Published tables:

- Admin 02: `banners`
- Admin 03: `outpost_zero_admin_msg_wakeups`,
  `outpost_zero_report_wakeups`
- Player 01: `scores`
- Player 02: `weapon_prices`, `weapon_defs`
- Player 03: `friendships`, `private_messages`,
  `private_conversation_states`
- Multi device 03: `outpost_zero_duel_wakeups` (only the recipient can read it)

Every other Outpost Zero table is explicitly kept out of Postgres Changes.
Realtime events are refresh hints only; RLS and server RPC checks remain the
authority for stored records. Delete the old saved query named **Realtime 01**
only after the current section installers run successfully. Delete only its
SQL Editor query card—never delete
the managed `supabase_realtime` publication.

## Replacing the old saved queries

First Save and Run the current installers. Confirm that they finish
successfully before deleting any old SQL Editor query cards. Then remove the
superseded standalone Player-source queries, including old Profiles, the old
Leaderboard setup copies, Weapons, Social, Realtime, Maintenance, Promo, and UI
query cards. Keep the current **Leaderboard 01** read-only display and all
twelve listed queries. Deleting saved editor text does not delete game tables.

The Layout Editor is removed, so `public.ui_layout` is not recreated. Promo
codes remain in Admin 02. Password changes use Supabase Auth directly and never
belong in a public SQL table. Username-or-email sign-in uses the deployed
`outpost-zero-sign-in` Edge Function documented in `supabase/README.md`.

## Player 04 Security and Leaderboard 01

Player 04 contains the exact extracted Player RLS, browser grants, and RPC
permissions. Its private installer is not executable by browser or service
roles. Each Player feature requires it and applies its own boundary atomically.
Gameplay validation remains inside the feature RPCs.

Leaderboard 01 displays existing Endless scores, casual 1v1 wins, and CPU
rankings. It creates no tables and changes no data. Equal score values share a
rank; CPU ordering uses difficulty then progress. Player 01 remains the owner
of all saving and ranking rules. The leaderboard uses the public username
helper so private emails are not exposed.

## Multi device Duels and Ranked

Multi device 01 stores server-generated match IDs, fixed rosters, queue slots,
loadouts, readiness, and private refresh notices. Casual queues support 1v1 and
2v2. Party matches require every invited member to accept and support 1v1,
2v2, or exactly three players in free-for-all. An invitation does not enroll
the recipient until they accept. Each account has at most one active slot.
Queue/setup leases expire after 90 seconds, and all members acknowledge the
start before a game can report a ranked result.

Multi device 02 stores separate **1v1** and **2v2** Elo ratings, immutable
member reports, and the per-match rating ledger. Players begin at 1,000 Elo.
Named ranks are Bronze below 900, Silver 900–1,199, Gold 1,200–1,499,
Platinum 1,500–1,799, Diamond 1,800–2,099, and Master at 2,100 or higher.
The server uses K=32 Elo, average team ratings for 2v2, and a floor of zero.
Only queued matches can be ranked; Party matches and free-for-all are unrated.

Ranked is **consensus BETA**. All two/four registered accounts must submit the
same legal first-to-five final score before any Elo changes. Conflicting or
expired claims change no ratings. The ledger and all rating changes commit
together, so a retry cannot award a result twice. The first report opens a
maximum five-minute confirmation window. Setup failures or games abandoned
before any result report can be cancelled without trapping the queue slot.

This is not an authoritative game server or an anti-cheat system. Browsers
still simulate hits, movement, health, and the outcome. Loadout validation
bounds the submitted shape; it does not prove honest gameplay or ownership.
Players can collude to report a fabricated result, or deny confirmation of a
loss. SQL consensus prevents outsiders from submitting a result and protects
rating accounting; it cannot independently prove who actually won.

Multi device 03 owns multiplayer RLS, RPC grants, and private Realtime channel
access for `oz-duel:<match UUID>`. Room membership does not authenticate the
claimed sender inside a peer combat packet. Only each participant's refresh
notice enters Postgres Changes; raw rosters, reports, and rating ledgers remain
RPC-only. The client refetches after a wakeup, with polling as a fallback while
actively waiting for a match or result.
