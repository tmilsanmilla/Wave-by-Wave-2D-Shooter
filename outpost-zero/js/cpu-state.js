"use strict";

function freshPartyCpuMatch(){
  return {phase:'idle',epoch:0,hostEpoch:0,hostId:'',humanIds:[],humanNames:{},loadouts:{},ready:{},humans:{},bots:[],shots:[],
    round:0,scores:{allies:0,cpus:0},roundStartAt:0,roundEndAt:0,nextRoundAt:0,roundResolved:false,
    syncAt:0,snapshotAt:0,simAt:0,simAcc:0,hitSeq:0,shotSeq:0,seenHits:new Set(),seenShots:new Set(),status:'',local:false,localLoadout:null,savedLoadout:null};
}
let partyCpuMatch=freshPartyCpuMatch();
function partyCpuSessionOpen(){ return !!(partyCpuMatch&&partyCpuMatch.phase!=='idle'); }
function isPartyCpuMatch(){ return !!(partyCpuSessionOpen()&&arena&&arena.mode==='partycpu'); }
function isLocalCpu2v2(){ return !!(partyCpuSessionOpen()&&partyCpuMatch.local&&arena&&arena.mode==='ai2v2'); }
function isCpuTeamArena(){ return isPartyCpuMatch()||isLocalCpu2v2(); }
function cpuTeamLocalId(){ return isLocalCpu2v2()?LOCAL_CPU2V2_PLAYER:(party.self&&party.self.id); }
function cpuTeamClock(){ return isLocalCpu2v2()?now:Date.now(); }
function partyCpuIsHost(){ return !!(partyCpuSessionOpen()&&party.self&&partyCpuMatch.hostId===party.self.id); }
function cpuTeamIsAuthority(){ return isLocalCpu2v2()||partyCpuIsHost(); }
const DIFFS={easy:{hp:0.75,dmg:0.7,label:'EASY'}, normal:{hp:1,dmg:1,label:'NORMAL'}, hard:{hp:1.35,dmg:1.3,label:'HARD'}};
let spawnQueue=[], spawnTimer=0, betweenTimer=1500;
let loadout={primary:null,secondary:null,melee:null,utility:null}, cardRects=[], deployRect=null;
let selPage='hub', pendingGameMode=null, modeBoardMode=null, modeBoardOrigin='hub', loadoutBackPage='modeboard', modeBoardActionRects=[], offlineCpuRects=[], rankedRects=[], catBtns=[], modeRects=[], homePlayRects=[], partyRects=[], partyModeRects=[], backRect=null, tempBtnRect=null, tutBtnRect=null, diffRects=[], shopBtnRect=null, shopRects=[], shopTab='weapons', shopTabRects=[], shopCosWeapon=null, cosPrevRect=null, cosNextRect=null, pendingCancelRect=null;   // + modeboard | offlinecpu | ranked | loadout | social | party | partymodes | tutorial | shop
let modeBoardNotice='', modeBoardNoticeT=0;
let detailKey=null, detailBtns=[], detailRects={};
const CATS=[['PRIMARY','primary',()=>PRIMARIES,()=>TEMP_PRIMARY],
            ['SIDEARM','secondary',()=>SECONDARIES,()=>TEMP_SECONDARY],
            ['MELEE','melee',()=>MELEES,()=>TEMP_MELEE],
            ['UTILITY','utility',()=>UTILKEYS,()=>TEMP_UTILITY]];
