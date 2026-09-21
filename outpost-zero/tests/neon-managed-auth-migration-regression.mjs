import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const networking = readFileSync(resolve(root, 'outpost-zero/js/networking.js'), 'utf8');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const migration = readFileSync(resolve(root, 'neon/migrations/001-managed-better-auth-cutover.sql'), 'utf8');
const bundle = resolve(root, 'outpost-zero/vendor/neon-client.js');

assert.match(networking, /const NEON_AUTH_URL=/);
assert.match(networking, /const NEON_DATA_API_URL=/);
assert.match(networking, /window\.outpostZeroNeon\.createClient/);
assert.match(networking, /bootstrap_outpost_zero_account_with_proof/);
assert.match(networking, /pendingNeonMigrationProof/);
assert.match(networking, /neon_auth_id:authId/);
assert.match(networking, /authMigrateLegacyEmailAccount/);
assert.match(networking, /authMigrateLegacyTokenSession/);
assert.match(networking, /api\.changePassword\(\{currentPassword:current,newPassword:first/);
assert.match(networking, /api\.resetPassword\(\{newPassword:a,token:neonRecoveryToken\}/);
assert.doesNotMatch(networking, /sb\s*=\s*window\.supabase\.createClient/);

assert.ok(statSync(bundle).size > 100_000, 'the official Neon browser SDK bundle must be present');
assert.ok(index.indexOf('outpost-zero/vendor/neon-client.js') < index.indexOf('outpost-zero/js/networking.js'));
assert.match(index, /id="settingscurrentpass"/);

assert.match(migration, /from neon_auth\."user" u/);
assert.match(migration, /where lower\(btrim\(a\.email\)\) = v_email/);
assert.match(migration, /l\.provider = 'neon'/);
assert.match(migration, /EMAIL_ACCOUNT_ALREADY_LINKED_TO_ANOTHER_NEON_USER/);
assert.match(migration, /VERIFIED_MIGRATION_PROOF_REQUIRED/);
assert.match(migration, /extensions\.hmac/);
assert.match(migration, /used_migration_proofs/);
assert.match(migration, /grant execute on function public\.bootstrap_outpost_zero_account\(\) to authenticated/);
assert.match(migration, /bootstrap_outpost_zero_account_with_proof[\s\S]*p_migration_proof text/);
assert.doesNotMatch(migration, /bootstrap_outpost_zero_account_with_proof[\s\S]*p_(?:email|account_id)/,
  'the browser may submit only a signed proof, never an email or target account id');

console.log('Neon Managed Better Auth migration regression passed.');
