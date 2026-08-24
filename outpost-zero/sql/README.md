# Outpost Zero database setup

Database setup is organized by feature so there is no single giant SQL file.
Each feature has its own numbered scripts and may be installed independently.

## Social

The Social feature provides player handles, friendships, private messages, row
level security, API privileges, and realtime refresh hints.

In the Supabase Dashboard, open **SQL Editor**, paste each file below, and run
them one at a time in this exact order:

1. `social/01-profiles.sql`
2. `social/02-friendships.sql`
3. `social/03-private-messages.sql`
4. `social/04-rls-policies.sql`
5. `social/05-privileges.sql`
6. `social/06-realtime.sql`

All six scripts are rerunnable. Run the complete sequence again after changing
the Social schema so tables are preserved while functions, triggers, policies,
privileges, and realtime membership are refreshed.

Future database features should get a sibling folder under `sql/` with their
own numbered scripts and a dependency order documented here.
