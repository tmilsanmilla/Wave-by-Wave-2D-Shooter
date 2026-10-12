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

The current remote base contains unpublished cookie/link-intent work compared
with LIVE `132bc10683701c866c88b4b29fc0c3f843cacde1`. This release explicitly
server-gates all NEW native-account links, including callbacks begun before
release, until signed flow-bound central current-password proof exists. Existing
linked subjects and their returning sessions are not removed. Cookie reuse is
not advertised as satisfying new-link confirmation. A verified email match
alone still cannot adopt another game account. No automatic legacy adoption,
account management, expanded shared names, direct-email provider or Auth-user
provisioning is implemented here. Those remain separately held.
