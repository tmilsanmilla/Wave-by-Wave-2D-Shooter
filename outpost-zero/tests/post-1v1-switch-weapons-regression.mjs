import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('js/ui.js'),online=read('js/online.js');
let passed=0,failed=0;
function check(name,condition){if(condition){passed++;console.log('PASS',name);}else{failed++;console.error('FAIL',name);}}
function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
  const brace=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

const onlineResultStart=ui.lastIndexOf("} else if(arena.phase==='match_end'){");
const onlineResultEnd=ui.indexOf('\n  } else {',onlineResultStart);
const onlineResult=ui.slice(onlineResultStart,onlineResultEnd);
const resultIds=['rematch','again','switchweapons','leave'];
const resultPositions=resultIds.map(id=>onlineResult.indexOf(`button('${id}'`));
check('Online 1v1 results include Switch Weapons with the other actions',
  resultPositions.every(i=>i>=0)&&resultPositions.every((value,i)=>i===0||value>resultPositions[i-1])&&
  /button\('switchweapons','SWITCH WEAPONS'/.test(onlineResult));
check('CPU 1v1 uses the same explicit Switch Weapons wording',/button\('botloadout','SWITCH WEAPONS'/.test(ui));
check('The result click handler routes Switch Weapons through one dedicated boundary',
  /r\.id==='switchweapons'\) arenaSwitchWeapons\(\)/.test(functionSource(ui,'arenaClick')));

const calls=[];
const context={arena:{phase:'match_end'},isBotArena:()=>false,pendingGameMode:null,modeBoardMode:null,loadoutBackPage:'',selPage:'arena',modeBoardNotice:'',modeBoardNoticeT:0,
  performance:{now:()=>4000},leaveArena:(status,toHub)=>{calls.push(['leave',status,toHub]);context.selPage='arena';},
  restoreLastLoadoutForMode:mode=>{calls.push(['restore',mode]);},arenaQuickMatch:()=>{calls.push(['quick']);}};
vm.createContext(context);vm.runInContext(functionSource(online,'arenaSwitchWeapons'),context);
check('Switch Weapons leaves the finished room and opens the Casual loadout',
  context.arenaSwitchWeapons()===true&&calls.length===2&&calls[0][0]==='leave'&&calls[0][2]===false&&calls[1][0]==='restore'&&calls[1][1]==='arena'&&
  context.pendingGameMode==='arena'&&context.modeBoardMode==='arena'&&context.loadoutBackPage==='modeboard'&&context.selPage==='loadout');
check('Switch Weapons never queues a rematch and explains the destination',
  !calls.some(call=>call[0]==='quick')&&context.modeBoardNotice==='SWITCH WEAPONS BEFORE YOUR NEXT 1v1'&&context.modeBoardNoticeT===7200);
calls.length=0;context.arena.phase='map_vote';
check('A stale result button cannot leave a rematch that already started',context.arenaSwitchWeapons()===false&&calls.length===0);

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
