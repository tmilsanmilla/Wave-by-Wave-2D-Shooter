"use strict";

const PARTY_MIN_PLAYERS=2, PARTY_MAX=4, PARTY_JOIN_MS=6500, PARTY_MISSING_MS=4500;
const PARTY_CHAT_MAX=120, PARTY_CHAT_KEEP=24, PARTY_CHAT_RATE_MS=800;
const PARTY_CPU_MODE='partycpu2v2', PARTY_CPU_TARGET=5, PARTY_CPU_HP=250;
const PARTY_CPU_ROUND_MS=90000, PARTY_CPU_SYNC_MS=50, PARTY_CPU_STEP=1000/60;
const PARTY_QUEUE_CAPS=Object.freeze({
  arena:1, arena1v1:1, ai1v1:1, ai2v2:1, ranked1v1:1, ranked_1v1:1,
  arena2v2:2, ranked2v2:2, ranked_2v2:2,
  endless:3
});
function freshParty(status){
  return {phase:'entry',code:'',channel:null,self:null,hostId:null,hostEpoch:0,revision:0,accepted:false,creating:false,
    members:[],mode:'endless',locked:false,cpuIntent:false,plan:[],status:status||'',liveIds:new Set(),missingSince:{},
    joinDeadline:0,nextJoinRequest:0,nextStateSend:0,chatEnabled:true,chatOpen:false,chatComposing:false,
    chat:[],chatScroll:0,chatPageSize:1,chatSeen:new Set(),chatSeenOrder:[],chatRate:{},lastChatSend:0,chatSeq:0,
    kickedIds:new Set()};
}
let party=freshParty('Create a party or join with a 6-character code.');
let partyAuthOwnerId='',partyInviteSendBusy=false;
