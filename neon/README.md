# Neon production setup

Outpost Zero uses Neon Managed Better Auth and the Neon Data API. The browser
SDK is bundled locally at `outpost-zero/vendor/neon-client.js` so production
does not depend on a third-party CDN for authentication.

## Account migration

The imported Supabase account UUID remains the permanent game user ID. On an
existing player's first successful Neon login,
`public.bootstrap_outpost_zero_account()` links the verified Neon auth subject
to that UUID by the email stored inside Neon Managed Better Auth. The browser
cannot submit an email or target UUID to the linker.

Supabase and Neon use incompatible password hashes, so existing passwords are
not copied. During the transition, the game verifies an existing Supabase
credential once, creates the matching Neon Managed Better Auth login, and then
uses Neon for later sessions. New accounts are created directly in Neon.

Apply `migrations/001-managed-better-auth-cutover.sql` after importing the base
schema and data. Run it with the database owner role; it is transactional and
keeps normal constraints and triggers enabled.

## Rollback

The Supabase project is intentionally retained. Its database is the rollback
source, and its public broadcast/presence transport plus legacy username
credential resolver remain temporarily enabled while gameplay networking is
migrated separately. Application database reads and writes use Neon.
