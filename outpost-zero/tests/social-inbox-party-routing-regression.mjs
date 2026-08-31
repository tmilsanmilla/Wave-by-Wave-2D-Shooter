import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const social=read('js/social.js'),ui=read('js/ui.js'),input=read('js/input.js'),index=read('../index.html');
const adminInbox=read('sql/administration/Admin-03-inbox.sql');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} must exist`);
  const body=source.indexOf('{',start);let depth=0,quote='',escape=false;
  for(let i=body;i<source.length;i++){
    const ch=source[i];
    if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;else if(ch==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw new Error(`Could not extract ${name}`);
}

const archiveContext={Number,Date:{now:()=>100_000_000},socialNotificationServerOffsetMs:5_000};
vm.createContext(archiveContext);
vm.runInContext(`const SOCIAL_OFFICIAL_UPDATE_ARCHIVE_MS=24*60*60*1000;
${functionSource(social,'socialNotificationServerNow')}
${functionSource(social,'socialOfficialUpdateAutoArchived')}
this.isArchived=socialOfficialUpdateAutoArchived;`,archiveContext);
const day=24*60*60*1000,clock=2*day;
assert.equal(archiveContext.isArchived({kind:'official_update',readAt:0},clock),false,'unread updates must never auto-archive');
assert.equal(archiveContext.isArchived({kind:'official_update',readAt:clock-day+1},clock),false,'an update must remain in Inbox until the full day passes');
assert.equal(archiveContext.isArchived({kind:'official_update',readAt:clock-day},clock),true,'a read update must archive at exactly 24 hours');
assert.equal(archiveContext.isArchived({kind:'admin_message',readAt:clock-day-1},clock),false,'ordinary notices must never enter the automatic update archive');
assert.equal(archiveContext.isArchived({kind:'official_update',readAt:100_005_000-day}),true,'the default clock must use the synchronized server offset');

const inviteClock=10_000,inviteContext={Array,Number,String,Date,authUser:{id:'me'},
  socialPartyInvites:[
    {kind:'party',senderUsername:'CloudNew',createdAt:9_900,expiresAt:11_000,uiKey:'cloud-new'},
    {kind:'party',senderUsername:'CloudOld',createdAt:7_000,expiresAt:11_000,uiKey:'cloud-old'},
    {kind:'party',senderUsername:'ExpiredCloud',createdAt:9_999,expiresAt:9_999,uiKey:'cloud-expired'}
  ],
  socialMessages:[
    {id:1,sender_id:'friend',recipient_id:'me',body:'cpu-live',created_at:new Date(9_500).toISOString()},
    {id:2,sender_id:'friend',recipient_id:'me',body:'party-live',created_at:new Date(8_000).toISOString()},
    {id:3,sender_id:'me',recipient_id:'friend',body:'party-live',created_at:new Date(9_800).toISOString()},
    {id:4,sender_id:'stranger',recipient_id:'me',body:'party-live',created_at:new Date(9_700).toISOString()},
    {id:5,sender_id:'friend',recipient_id:'me',body:'party-live',created_at:new Date(9_600).toISOString(),handled:true},
    {id:6,sender_id:'friend',recipient_id:'me',body:'party-live',created_at:new Date(9_550).toISOString(),hidden:true},
    {id:7,sender_id:'friend',recipient_id:'me',body:'expired',created_at:new Date(9_400).toISOString()}
  ],
  socialPrivateMessageVisible:row=>!row.hidden,socialLegacyInviteHandled:row=>!!row.handled,
  socialAcceptedFriend:id=>id==='friend',socialPerson:id=>({handle:id==='friend'?'LegacyFriend':'Other'}),
  socialPrivateMessageUiKey:row=>'message-'+row.id,
  socialCpuGameInvite:value=>value==='cpu-live'?{code:'CPU123',token:'x'.repeat(20),expiresAt:11_000}:null,
  socialPartyInvite:value=>value==='party-live'?{code:'PTY123',token:'y'.repeat(20),expiresAt:11_000}:null
};
vm.createContext(inviteContext);
vm.runInContext(`${functionSource(social,'socialIncomingPartyInvites')}\nthis.list=socialIncomingPartyInvites;`,inviteContext);
const incoming=JSON.parse(JSON.stringify(inviteContext.list(inviteClock)));
assert.deepEqual(incoming.map(row=>row.senderUsername),['CloudNew','LegacyFriend','LegacyFriend','CloudOld'],
  'incoming invites must combine secure and legacy rows in newest-first order');
assert.deepEqual(incoming.map(row=>row.kind),['party','cpu2v2','party','party'],'CPU and Party invitation kinds must remain distinct');
assert.deepEqual(incoming.map(row=>row.source),['cloud','legacy','legacy','cloud'],'both storage paths must remain actionable under Party');
assert.equal(incoming.some(row=>/Expired|stranger/i.test(row.senderUsername)),false,'expired and non-friend legacy invitations must be excluded');

const dismissContext={String,Promise,authUser:{id:'me'},socialStatus:'',sounds:[],callCount:0,
  invite:{inviteId:'invite-1',uiKey:'cloud-1',kind:'cpu2v2'}
};
dismissContext.socialPartyInviteByUiKey=()=>dismissContext.invite;
dismissContext.socialDismissPartyInvite=()=>{dismissContext.callCount++;return new Promise(resolve=>{dismissContext.releaseDismiss=resolve;});};
dismissContext.sfx=value=>dismissContext.sounds.push(value);
vm.createContext(dismissContext);
vm.runInContext(`let socialPartyInviteDismissBusy=false,socialPartyInviteDismissOp=null;
${functionSource(social,'socialDismissPartyInviteByUiKey').replace(/^function /,'async function ')}
this.dismiss=socialDismissPartyInviteByUiKey;this.busy=()=>socialPartyInviteDismissBusy;`,dismissContext);
const firstDismiss=dismissContext.dismiss('cloud-1'),duplicateDismiss=dismissContext.dismiss('cloud-1');
assert.equal(dismissContext.busy(),true,'cloud decline must disable invite actions while its RPC is running');
assert.equal(await duplicateDismiss,false,'a double tap must not start a second cloud decline');
assert.equal(dismissContext.callCount,1,'cloud decline must be single-flight');
dismissContext.authUser={id:'other'};dismissContext.releaseDismiss(true);
assert.equal(await firstDismiss,false,'an account switch must invalidate the old decline result');
assert.equal(dismissContext.socialStatus,'','an old account must not write status into the new account');
assert.deepEqual(dismissContext.sounds,[],'an old account must not play result feedback in the new account');
dismissContext.authUser={id:'me'};const cpuDismiss=dismissContext.dismiss('cloud-1');dismissContext.releaseDismiss(true);
assert.equal(await cpuDismiss,true);assert.equal(dismissContext.socialStatus,'CPU 2v2 INVITE DECLINED','CPU declines need CPU-specific wording');

const inboxUi=ui.slice(ui.indexOf("if(activeSocialView==='inbox')"),ui.indexOf("if(activeSocialView==='party')"));
const partyUi=ui.slice(ui.indexOf("if(activeSocialView==='party')"),ui.indexOf("backRect=drawSocialButton('back'"));
assert.doesNotMatch(inboxUi,/socialPartyInvites|socialCpuGameInviteEnvelope|socialPartyInviteEnvelope|cloud_party_invite_accept|party_invite_join|cpu_invite_play/,
  'received Party and CPU invitations must not be rendered in Inbox');
assert.match(partyUi,/socialIncomingPartyInvites\(\)/,'Party must own the combined incoming-invitation list');
assert.match(partyUi,/if\(incomingInvites\.length\)\{/,'at least one incoming invite row must take priority over the public directory');
assert.match(partyUi,/socialPartyInvitePage=clamp\([^\n]+invitePages-1\)/,'invite paging must clamp after an invite is accepted or declined');
for(const action of ['cloud_party_invite_accept','party_invite_join','cpu_invite_play','cloud_party_invite_dismiss','legacy_party_invite_dismiss'])
  assert.match(partyUi,new RegExp(action),`Party must expose ${action}`);
assert.match(social,/function socialHasUnreadInboxActivity\(\)\{const s=socialUnreadSummary\(\);return s\.privateMessages\+s\.notifications>0;\}/,
  'the Inbox badge must exclude Party invitations');
assert.match(social,/function socialHasUnreadPartyActivity\(\)\{const s=socialUnreadSummary\(\);return s\.partyInvites\+s\.partyRequests>0;\}/,
  'the Party badge must include incoming invites and host requests');

const partyNav=input.slice(input.indexOf("r.id==='social_view_party'"),input.indexOf("r.id==='player_profile'"));
assert.match(partyNav,/socialPollPartyInvites/,'opening Party must refresh secure invitations');
assert.match(partyNav,/socialPollCpuGameInvites/,'opening Party must refresh legacy invitations');
assert.match(partyNav,/partyPublicRefresh/,'opening Party must still refresh the public directory');
const inboxRefresh=input.slice(input.indexOf("r.id==='inbox_refresh'"),input.indexOf("r.id==='inbox_load_older'"));
assert.doesNotMatch(inboxRefresh,/socialPollPartyInvites|socialPollCpuGameInvites/,'Inbox refresh must not own Party invitation polling');

assert.match(inboxUi,/archivedUpdateNotices=notificationRows\.filter\([^\n]+socialOfficialUpdateAutoArchived/,
  'Archive must contain read official updates after the one-day boundary');
assert.match(inboxUi,/activeNotices=notificationRows\.filter\([^\n]+!\([^\n]+socialOfficialUpdateAutoArchived/,
  'Inbox and Archive must use opposite sides of the same update rule');
assert.match(inboxUi,/section==='archive'\?archivedUpdateNotices:activeNotices/,'the selected Inbox tab must choose the correct notification set');
assert.match(inboxUi,/fallbackOfficial=\(!authUser\|\|socialNotificationSqlReady!==true\?/,
  'a ready notification feed must suppress legacy banner rows even when their notification is on an older page');
assert.match(inboxUi,/canLoadOlder[^\n]+socialNotificationHasMore[\s\S]{0,260}inbox_load_older[\s\S]{0,100}LOAD OLDER/,
  'Archive must provide access to older notification pages');
assert.match(social,/function socialOfficialBannerAlreadyNotified[\s\S]{0,260}socialNotifications\.some/,
  'an archived notification must continue suppressing its legacy banner duplicate');
assert.match(adminInbox,/read_at\s+timestamptz/i,'the existing Inbox SQL must persist each account read time');
assert.match(adminInbox,/server_now/i,'the existing Inbox RPC must provide trusted server time');

for(const [script,version] of [['social','20260831-username-validation-v1'],['input','20260831-shop-weapon-picker-v1'],
  ['ui','20260831-melee-polish-v1']])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=${version}`),`${script}.js needs its current cache tag`);

console.log('PASS Party owns invitations and read official updates auto-archive after one server-timed day');
