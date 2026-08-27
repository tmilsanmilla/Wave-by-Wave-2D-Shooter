# Secure username sign-in

Outpost Zero signs email addresses in through Supabase Auth directly. A public
username cannot be resolved to its private email in browser code, so username
sign-in goes through the `outpost-zero-sign-in` Edge Function in this folder.
The function returns only session tokens after Supabase Auth accepts the
password. It never returns or logs the resolved email, account UUID, password,
or raw Auth error.

## Deploy once

1. In the Supabase dashboard, open **Settings > API Keys**. Confirm the existing
   browser publishable key is present, and create a `default` secret key if the
   project does not already have one. Never copy that secret into this repo.
2. Open **Authentication > Rate Limits > IP Address Forwarding** and enable it.
   The function forwards the gateway-provided client address as
   `Sb-Forwarded-For` with the server-only secret key, so Auth rate limits each
   player instead of treating the Edge Function as one shared IP.
3. From this repository, authenticate the Supabase CLI and deploy the function:

   ```sh
   npx supabase login
   npx supabase functions deploy outpost-zero-sign-in --project-ref edvurrilylypgfyvjyas
   ```

Hosted Edge Functions automatically receive `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS`. No SQL script and no
manually committed `.env` file are required. The checked-in `config.toml` sets
`verify_jwt = false` because signed-out players have no user JWT; the handler
still rejects calls whose `apikey` is not one of the project's hosted
publishable keys. A project that has no new publishable-key dictionary yet may
use its hosted legacy anon key as a documented migration fallback; as soon as
new publishable keys exist, the function stops accepting the legacy key.
