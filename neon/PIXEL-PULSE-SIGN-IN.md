# Pixel Pulse shared sign-in

Outpost Zero is an OIDC consumer of `https://pixel-pulse-websites.vercel.app/api/sso`, client `outpost-zero`. The exact callback is `https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse/callback`. Passwords are entered only on Pixel Pulse, never exchanged or duplicated. No central admin roles are imported.

Existing players first sign into the game normally, then choose **Account Settings → Connect Pixel Pulse**. The server validates their current signed Neon token before recording the link attempt. The callback requires both this ownership proof and the verified central identity; matching email/username alone never grants existing game data. The game UUID, inventory, ranks, friends, messages, bans, and permissions stay in place. Both accounts must have the same email. The central username must be available locally; the existing 21-day rename period is respected. Shared usernames cannot be changed independently by game clients.

New players choose **Sign in with Pixel Pulse**. Their central email must be verified. A duplicate local email or username is an explicit conflict, not an automatic merge. Username/email are refreshed on subsequent shared sign-ins. A changed central email requires an explicit account-ownership update rather than silently moving email-based permissions.

The maintained `openid-client` checks issuer, exact redirect, state, PKCE S256, nonce, audience, expiry, signatures and matching UserInfo subject. Attempt records are cookie-bound, expire after five minutes and are deleted atomically before exchange. Cookies are host-only, Secure, HttpOnly and SameSite=Lax. Only SHA-256 session-token hashes are stored in private, forced-RLS tables; no passwords or OAuth tokens are persisted.

Local game sessions last seven days. The game issues 120-second database tokens from a server-only RSA key. Neon verifies those through a **separate, additive** game JWKS registration, scoped to the production branch and `outpost-zero-pixel-pulse` audience. Existing managed-Neon login and trust settings stay intact. Database access remains the existing `authenticated` role with the existing game RLS and ban checks. Signing out removes the server session; already issued tokens expire within two minutes. Signing out of Pixel Pulse alone does not sign out every connected site's local session.

Apply `neon/migrations/002-pixel-pulse-sign-in.sql` directly to the correct Neon game branch. It only adds three private tables, a username guard, and a self-only username lookup; `oz_identity.game_user_id()` also resolves the explicitly namespaced `pixelpulse:<subject>` identity. Never expose `oz_identity` in the Data API.

Server environment: existing `DATABASE_URL`; `PIXEL_PULSE_GAME_SIGNING_KEY` (private RSA JWK JSON, unique `kid`, never public); and `PIXEL_PULSE_GAME_ENABLED=true` **only after** provider discovery/client registration and game JWKS trust are verified. Publish only the public key at `/api/pixel-pulse/jwks`. Disabling the flag hides new connections but preserves existing sessions and native game login. Do not delete or replace existing Neon/Supabase JWKS registrations.

No changes to the Supabase rollback copy are required.
