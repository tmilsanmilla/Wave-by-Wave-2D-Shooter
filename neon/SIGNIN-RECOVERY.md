# Focused sign-in recovery

This release fixes the already-saved username claim loop without deploying
pending shared-account linking/management features. The old compatibility SDK
`updateUser({data:{username}})` treats a normal Better Auth `{status:true}` as
failure and does not persist the real managed `name` field.

Apply `migrations/004-username-30-day-guard.sql` to the pinned Neon game branch
before publishing this client. The transaction preserves all game/native IDs,
passwords, emails, verification flags, permissions and progress. It updates
only the native directory name through its existing private game binding.
Retrying an already-saved name repairs that label without restarting cooldown.
The self-only `get_my_outpost_zero_username()` RPC confirms the committed name
using the signed database identity, not a caller-supplied user ID or cached
Auth-cookie label. The same read restores the name after a future sign-in.

First choice is free; real native renames require 720 hours. Linked Pixel names
stay canonical and independently uneditable. New-account first-name selection,
collision rollback, timer spoof protection, native/Pixel session switching,
and preserved credentials/progress are covered by regressions. The live Neon
SQL test used exact synthetic fixtures and unconditional rollback.

This focused checkout leaves `api/pixel-pulse.js` and `lib/pixel-pulse.js`
unchanged from the current remote base. It does not deploy the pending automatic
legacy adoption, central fresh-password link proof, account management,
expanded shared names, direct-email provider or Auth-user provisioning. Those
remain separate work and must not be advertised as implemented by this fix.
