# Outpost Zero moderation update — local only

This update builds on the game's existing Admin, Suggestions, Players, and
Audit Log screens. Review and test `migrations/007-moderation-cases.sql` against
the exact Outpost database schema and effective Data API roles before release.
Do not rerun the older admin sections after 007: they can restore older RPC
definitions. No account, role, ban, report, or appeal rows are changed by
installing 007. Release the matching browser source after the migration has
been verified. Old tabs still use the existing report RPC with the new input
ceilings and may need to refresh before submitting a long report.

- Player reports accept 500 characters and resolve the named player to a game
  UUID at submission. Bugs and suggestions accept a 300-character problem and
  a separate optional 300-character suggested fix. Existing reviewed reports
  retain their content and can still be read and exported under Admin RLS.
- The existing Resolve and bulk Resolve commands set a server resolution
  timestamp and audit the report ID, not its sensitive text.
- A new appeal pins the active ban ID and immutable requester UUID when that
  ban has an authoritative account association. Accept removes just that
  exact ban; Reject leaves it in place. Historical, device-only, and replaced
  bans are not guessed from an email; an admin reviews the ban separately.
  Existing private admin role checks and browser table revocations remain.
- My Appeals is available after a ban is lifted. Reviewer views separate
  pending and resolved cases; they show a maximum of 100 per group.

## Retention — not scheduled by this change

After separate approval of the data-retention rollout, register a single
Outpost-owned weekly job for `0 0 * * 1` (Monday 00:00 **UTC**) to call
`select public._oz_prune_closed_moderation();` as the database owner. Verify
the scheduler time zone and effective role first. The function refuses calls
outside Monday's first UTC hour and uses the start of that UTC week as its
cutoff. It deletes only Outpost reports resolved more than 7 days before that
cutoff and accepted/rejected appeals decided more than 14 days before it.
It never touches pending cases, other games' reports, users, or audit history.
Legacy cases without a trustworthy close date are retained, not backfilled
with their submission date. Before enabling the job, inspect aggregate
eligible counts and confirm the backup/restore policy.

## Protected founder — verify privately before changing any role

Production already keys creator checks on its protected game UUID. Confirm
that the existing singleton actually belongs to the designated founder; do
not assume that from a display name or replace the singleton on a mismatch.
On the exact Outpost Neon branch, use a read-only owner-side parameterized
check with the privately provided normalized address (`$1`):

```sql
with candidates as (
  select n.id, n."emailVerified"
  from neon_auth."user" n where lower(btrim(n.email)) = lower(btrim($1))
), binding as (
  select l.account_id
  from candidates n
  join oz_identity.account_links l on l.provider = 'neon' and l.subject = n.id::text
  join oz_identity.accounts a on a.id = l.account_id and a.deleted_at is null
  where n."emailVerified" is true
)
select (select count(*) from candidates) = 1
   and (select count(*) from binding) = 1
   and exists (
     select 1 from binding b
     join public.outpost_zero_admin_config c on c.singleton and c.creator_user_id = b.account_id
   ) as verified_existing_founder;
```

Return only this boolean. A mismatch needs owner review and a separately
authorized immutable-ID repair, not a public email constant, email-based
runtime privilege, or a username-only seed. No founder lookup or role change
was made in production.

## Enforcement boundary still to finish

The existing gameplay scopes remain unchanged. Do not represent a client
toggle as server enforcement for the requested independent online/ranked
scopes. Those require an explicit admission check in every relevant queue,
party invite, and match-start path, including the existing casual presence
transport and ranked service, plus mixed-client and recognized-device review.
Browser installation IDs are not tamper-proof hardware identities.
