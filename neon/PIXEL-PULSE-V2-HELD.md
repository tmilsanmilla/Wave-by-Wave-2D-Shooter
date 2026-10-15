# Pixel Pulse v2 — local candidate, NOT activated

This source is groundwork, not a claim that first connections work in production.
No cloud migration, account edit, provider key, flag change or deployment is part
of this checkpoint. The existing native recovery and legacy known-bound paths
remain selected unless `PIXEL_PULSE_GAME_PROTOCOL` is exactly `v2`.
`PIXEL_PULSE_FRESH_LINK_ENABLED` must separately be exactly `true` to admit a
new connection. Root's Outpost first-connection gate must also be ready. Do not
turn these on just because source or the dormant Root producer is published.

## Implemented locally

- Independent native ownership requires both the verified Neon Data API JWT
  and its live opaque Managed session. The private flow stores a session hash,
  original account UUID, subject, expiry and credential-update clock; it
  rechecks the session/mapping/clock at both callbacks and inside the binding
  transaction. Final native user/session/credential/mapping rows stay locked
  through binding commit; bounded lock/statement timeouts fail closed on a race.
  A final wall-clock/session recheck precedes commit. The existing Managed FK /
  SELECT-and-UPDATE locking contract must pass a read-only preflight; the code
  never adds provider grants or modifies Managed helpers. The browser compares
  the Managed subject with `neon_auth_id`, not the preserved game UUID, while
  keeping both account-switch checks. No native passwords/hashes are copied.
- Read-only OIDC discovery seals the expected Pixel subject, credential/profile
  epochs and explicit native-Link/Create target. Confirmation is a NEW one-use
  state/nonce/PKCE transaction using Root's frozen v1 `pixel_intent=link`.
- Both first native adoption and first Create redeem the central ticket
  server-to-server and verify the exact signed current-password/actor/flow/code
  proof. Cookie-only confirmation, audience arrays, changed actors/epochs,
  implicit adoption, replay, ambiguous targets and account/name collisions fail
  closed. Proof consumption and original-UUID binding share one SQL transaction.
- Revocation epochs are recorded in an independent transaction before profile
  projection, so an invalid/unverified email or name collision cannot roll back
  retirement. No central administrator role or game reward is imported.
- Pending005 uses Neon's validated `auth.session()` and a private session/epoch
  registry. Native JWTs cannot regain a bound account, even at epoch zero.
  Data API admission requires the particular live BFF session and current epoch.
  A short token alone, a cookie name or client sign-out is not the guard.
- Error and pending callbacks end on the game's message UI. Only the initial
  unbound discovery step redirects once to password confirmation; failures do
  not retry, silently create or bounce indefinitely between websites.

## Pending005 must NOT be applied ahead of the compatible server

`migrations/005-pixel-pulse-admission-v2.sql` changes only application-owned
objects. It adds private forced-RLS flow/proof/authority storage and v2 session
columns; it neither edits managed `neon_auth`/`auth` schemas nor grants clients
access to private tables. It closes native bootstrap's account-link write path.

The old BFF's tokens do not include a v2 session identifier or epoch. Applying
005 while the legacy protocol is serving would therefore interrupt existing
Pixel-bound access. Existing native accounts that are NOT Pixel-bound keep
their original UUID/access. Existing bound users need one normal Continue to
obtain the new session, not a new binding/password-confirmation or new account.
Plan and verify that transition before applying anything live.

## Concrete remaining dependencies — activation still held

1. Verify the actual Managed session contract and database columns/permissions
   used by `captureNativeProof`/`recheckNativeProof`, including the uncached SDK
   response's session token, user FK and existing row-lock privileges. The local
   concurrent-writer test proves SQL ordering only in its explicitly synthetic
   schema. It is NOT proof of the live Managed contract. No missing provider
   grant/helper may be added or overwritten to manufacture a pass.
2. Verify the real Data API's validated claim context and all application RLS /
   privileged identity paths against the pending guard, including direct native
   tokens, bootstrap and known-bound access. Local SQL uses an explicitly
   synthetic `auth.session()` and cannot establish that external boundary.
3. Root currently issues five-minute access tokens with authorization-code-only
   grants. V2 rechecks current UserInfo and limits Data API authority to a
   20-second database lease. It therefore conservatively ends the game session
   at the upstream token/ID-token expiry (at most five minutes). It does NOT
   extend an unverifiable seven-day session. Sustained gameplay/login parity
   needs an approved upstream refresh/current-authority mechanism, or explicit
   acceptance of this shorter, user-initiated Continue flow. Root independently
   confirmed there is no existing approved renewal/epoch mechanism to reuse.
   Active-game state preservation through a revalidation navigation also remains
   to be verified; a redirect must not discard a running match. No new protocol
   or grant is assumed. There is no automatic refresh redirect loop.
4. Genuinely verified, actual managed first-Create / original-native receiving
   positives and external runtime retirement remain unestablished. The cancelled
   shared Root fixture/email/connection batch remains cancelled. Synthetic
   local success must never be relabelled as a real managed positive.
5. Recheck the exact deployment environment, single-repository project fanout,
   canonical source and coordinator's release slot before any eventual push.
   No slot, build or activation is requested by this checkpoint.

## Reproducible offline checks

Use Node24 with `--experimental-vm-modules --test outpost-zero/tests/*.mjs`.
The v1 callback tests explicitly fail if a dormant v2 path executes.

`pixel-pulse-v2-proof-regression.mjs` uses local keys/signatures and mocked
transport, with no accounts or network calls. `pixel-pulse-v2-sql-regression.mjs`
requires a deliberately created private `/private/tmp/outpost-pixel-sql.*`
PostgreSQL17 cluster/socket on port55487; it never reads a connection URL or env
file. Without that socket it skips and contacts no database. Its optional reset
replaces ONLY the synthetic `neondb` inside that exact checked temporary cluster.
The full local handler/SQL tests cover both confirmation stages, native/Create,
expected-actor changes, credential-clock changes, replay, rollback, original
progress/roles, short runtime leases and epoch retirement before failed profile
projection. They do not contact Neon or Root or send verification emails.
