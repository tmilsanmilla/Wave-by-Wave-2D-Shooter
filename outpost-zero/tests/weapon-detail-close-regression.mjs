import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
const input=fs.readFileSync(path.join(root,'js/input.js'),'utf8');
const index=fs.readFileSync(path.join(root,'..','index.html'),'utf8');
const start=ui.indexOf('function drawDetail(){'),end=ui.indexOf('\nconst ROLECOL=',start);
assert.ok(start>=0&&end>start,'drawDetail source must exist');
const source=ui.slice(start,end);

function render(width,height,touch,startingBaseline){
  const text=[],fills=[],strokes=[],fitWidths=[];
  const ctx={textBaseline:startingBaseline,textAlign:'right',
    fillRect(x,y,w,h){fills.push({x,y,w,h});},strokeRect(x,y,w,h){strokes.push({x,y,w,h});},
    beginPath(){},moveTo(){},lineTo(){},stroke(){},save(){},restore(){},
    fillText(value,x,y){text.push({value,x,y,baseline:this.textBaseline,align:this.textAlign});}};
  const context=vm.createContext({
    detailKey:'rifle',detailRects:{},W:width,H:height,touchUI:touch,mouse:{x:-1,y:-1},ctx,
    VAULT_SLOTS:{},UTILITIES:{},VAULT_UTILITIES:{},VAULT_WEAPONS:{},
    WEAPONS:{rifle:{name:'VERY LONG RESPONSIVE RIFLE NAME',blurb:'A clear weapon description.'}},
    ROLECOL:{PRIMARY:'#e8b658'},storedLoadoutSlot:()=> 'primary',weaponDetails:()=>[['DAMAGE','10']],
    fitLine:(value,maxWidth)=>{fitWidths.push({value,maxWidth});return value;},wrapTextClamped:()=>{}
  });
  vm.runInContext(`${source}\ndrawDetail();`,context,{filename:'weapon-detail-close.js'});
  return {rects:JSON.parse(JSON.stringify(context.detailRects)),text,fills,strokes,fitWidths};
}

for(const sample of [render(1000,800,false,'alphabetic'),render(320,390,true,'bottom')]){
  const {panel,close}=sample.rects,xCall=sample.text.find(call=>call.value==='\u2715');
  assert.ok(xCall,'the close X must be painted');
  assert.equal(xCall.baseline,'middle','the X must ignore inherited canvas baselines');
  assert.equal(xCall.align,'center','the X must be horizontally centered');
  assert.equal(xCall.x,close.x+close.w/2,'the X must use the close rectangle horizontal center');
  assert.equal(xCall.y,close.y+close.h/2,'the X must use the close rectangle vertical center');
  assert.ok(close.w>=32&&close.h>=32,'the close button must be a usable square target');
  assert.ok(close.x>=panel.x&&close.y>=panel.y&&close.x+close.w<=panel.x+panel.w&&close.y+close.h<=panel.y+panel.h,
    'the complete close button must remain inside the weapon details panel');
  assert.ok(sample.fills.some(r=>r.x===close.x&&r.y===close.y&&r.w===close.w&&r.h===close.h),
    'the painted close button must use the same rectangle as hit testing');
  const titleFit=sample.fitWidths.find(call=>call.value==='VERY LONG RESPONSIVE RIFLE NAME');
  assert.ok(titleFit&&titleFit.maxWidth<=close.x-(panel.x+20)-8,
    'the weapon title must stop before the larger close button');
}

assert.match(source,/mouse\.x>=close\.x[\s\S]{0,160}close\.w[\s\S]{0,160}close\.h/,
  'close hover geometry must not retain the old hard-coded 22 by 20 bounds');
assert.match(input,/inR\(detailRects\.close\)/,'weapon-detail clicks must use the same centered close rectangle');
assert.match(index,/outpost-zero\/js\/ui\.js\?v=20260831-shop-weapon-picker-v1/,
  'ui.js needs the current Shop picker cache tag');

console.log('PASS weapon-detail X is centered inside one responsive close button');
