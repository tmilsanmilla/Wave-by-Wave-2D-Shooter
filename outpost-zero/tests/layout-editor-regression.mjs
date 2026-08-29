import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const layoutSource=read('js/layout.js'),inputSource=read('js/input.js'),uiSource=read('js/ui.js');

const saved=new Map();
const context=vm.createContext({
  localStorage:{
    getItem:key=>saved.has(key)?saved.get(key):null,
    setItem:(key,value)=>saved.set(key,String(value)),
    removeItem:key=>saved.delete(key),
  },
  mouse:{x:0,y:0},
  sfx(){},
  Date,
  JSON,
});
vm.runInContext(layoutSource,context,{filename:'layout.js'});

const dragResult=vm.runInContext(`(()=>{
  layoutMode=true;
  // Both sections occupy this point. BOARD was painted last, so it is the
  // visible section and must win instead of the older hidden rectangle.
  layoutRects=[
    {id:'posts',x:40,y:30,w:160,h:90},
    {id:'board',x:40,y:30,w:160,h:90},
  ];
  mouse.x=60;mouse.y=50;
  layoutMouseDown();
  const selected=layoutDrag&&layoutDrag.id;
  mouse.x=93;mouse.y=77;
  layoutMouseMove();
  const moved={...layout.board};
  layoutMouseUp();
  return {selected,moved,released:layoutDrag===null,dirty:layoutDirty};
})()`,context);

assert.equal(dragResult.selected,'board','the visible topmost section must own an overlapping drag');
assert.deepEqual(JSON.parse(JSON.stringify(dragResult.moved)),{dx:33,dy:27,col:null});
assert.equal(dragResult.released,true);
assert.equal(dragResult.dirty,true);
const draft=JSON.parse(saved.get('oz_ui_layout_draft'));
assert.deepEqual(draft.layout.board,{dx:33,dy:27,col:null},'mouse-up must persist the completed movement immediately');
assert.deepEqual(JSON.parse(saved.get('oz_ui_layout')).board,{dx:33,dy:27,col:null});

assert.match(uiSource,/movedBoardsX=homeBoardsX\+offX\('board'\), movedBoardsY=homeBoardsY\+offY\('board'\)/,
  'the advertised BOARD section must consume its saved offsets');
assert.match(uiSource,/layoutBlock\('board',movedBoardsX,movedBoardsY,homeBoardsW,homeBoardsH\)/,
  'the leaderboard must register a real editor hit rectangle');
assert.match(uiSource,/withBlockColour\('board',\(\)=>drawHomeLeaderboards\(movedBoardsX,movedBoardsY,homeBoardsW,homeBoardsH\)\)/,
  'the board editor color option must affect the board it selects');

assert.match(inputSource,/cv\.addEventListener\('mousedown',[\s\S]*?mouse\.x=px\(e\.clientX\); mouse\.y=e\.clientY;/,
  'a press must not depend on a stale prior mousemove coordinate');
assert.match(inputSource,/state==='select'&&layoutMode&&selPage==='hub'\) layoutMouseDown\(\)/,
  'touchstart must enter the same layout drag path as a mouse press');
assert.match(inputSource,/layoutMode&&state==='select'&&selPage==='hub'\) layoutMouseMove\(\)/,
  'touchmove must update the selected layout section');
assert.match(inputSource,/t\.identifier===menuTouchId\)\{ layoutMouseUp\(\);/,
  'touchend and touchcancel must finish and persist the drag');

console.log('layout editor regression: PASS');
