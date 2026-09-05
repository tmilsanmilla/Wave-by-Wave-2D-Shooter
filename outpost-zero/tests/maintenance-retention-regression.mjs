import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../sql/administration/Admin-03-inbox.sql',import.meta.url),'utf8');
const social=fs.readFileSync(new URL('../sql/player/Player-03-social-menu.sql',import.meta.url),'utf8');
const standalone=new URL('../sql/maintenance/Maintenance-01-retention.sql',import.meta.url);

assert.equal(fs.existsSync(standalone),false,
  'there is no standalone Maintenance SQL');
assert.match(admin,/cron\.schedule\(\s*'purge-old-admin-msgs'/s,
  'Admin 03 owns Admin Inbox retention');
assert.match(admin,/created_at < clock_timestamp\(\) - interval '1 year'[\s\S]*archived[\s\S]*read_at <= clock_timestamp\(\) - interval '7 days'/,
  'Admin 03 purges only one-year-old archived or auto-archived read messages');
assert.match(social,/cron\.schedule\(\s*'purge-old-social-inbox-messages'/s,
  'Player 03 owns Social Inbox retention');
assert.match(social,/m\.created_at < clock_timestamp\(\) - interval '1 year'[\s\S]*m\.read_at is not null/,
  'Social retention requires an old read message');
assert.match(social,/s\.owner_id=m\.sender_id and s\.peer_id=m\.recipient_id/,
  'Social retention requires sender-side Archive or Delete state');
assert.match(social,/s\.owner_id=m\.recipient_id and s\.peer_id=m\.sender_id/,
  'Social retention requires recipient-side Archive or Delete state');
assert.match(social,/newer\.created_at > s\.archived_at/g,
  'a newer message prevents either archived conversation from being purged');
assert.doesNotMatch(admin+social,/interval '3 years'/,
  'the obsolete three-year retention is gone');
assert.match(admin+social,/cron\.alter_job\(v_job_id, active => true\)/,
  'both owning sections re-enable their stable jobs');

console.log('PASS section-owned one-year Inbox maintenance retention');
