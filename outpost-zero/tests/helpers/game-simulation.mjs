import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

// Actual classic-script runtime with synthetic DOM/canvas/storage only.
// No browser, accounts, network, native database or persistent user storage.
export function gameSimulation(width=1280,height=720){
  const root=new URL('../../../',import.meta.url),html=fs.readFileSync(new URL('index.html',root),'utf8');
  const timers=new Map(),elements=new Map(),storage=new Map(),draws=[];let timerId=0,networkCalls=0;
  const canvas=new Proxy({measureText:t=>({width:String(t).length*7}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
    fillText:(...args)=>draws.push(args)}, {get:(o,k)=>k in o?o[k]:()=>{}});
  function element(id){
    if(!elements.has(id))elements.set(id,{id,style:{},dataset:{},value:'',textContent:'',hidden:false,disabled:false,
      getContext:()=>canvas,getBoundingClientRect:()=>({left:0,top:0,width,height}),
      addEventListener(){},setAttribute(){},removeAttribute(){},focus(){},blur(){},requestFullscreen(){},
      querySelector:()=>element(id+':child'),querySelectorAll:()=>[],classList:{add(){},remove(){},toggle(){}}});
    return elements.get(id);
  }
  const sandbox={console,URL,URLSearchParams,TextEncoder,TextDecoder,crypto:webcrypto,
    performance:{now:()=>10000},innerWidth:width,innerHeight:height,devicePixelRatio:1,
    document:{getElementById:element,querySelector:()=>element('query'),querySelectorAll:()=>[],
      createElement:()=>element('created'),documentElement:element('root'),addEventListener(){},hidden:false},
    navigator:{onLine:false,maxTouchPoints:0,userAgent:'Outpost synthetic regression'},
    location:{href:'http://127.0.0.1:8796/',protocol:'http:',origin:'http://127.0.0.1:8796'},history:{replaceState(){}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    addEventListener(){},requestAnimationFrame(){},cancelAnimationFrame(){},
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>++timerId,clearInterval(){},
    fetch:()=>{networkCalls++;throw new Error('Network forbidden in game simulation');},
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')};
  sandbox.window=sandbox;sandbox.self=sandbox;
  const context=vm.createContext(sandbox),run=code=>vm.runInContext(code,context,{timeout:10000});
  const scripts=[...html.matchAll(/<script src="\.\/(outpost-zero\/js\/[^?]+)\?[^\"]*"><\/script>/g)].map(m=>m[1]);
  for(const file of scripts){
    if(file.endsWith('/bootstrap.js'))continue;
    vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),context,{filename:file,timeout:10000});
  }
  run(`W=${width};H=${height};now=10000;sfx=()=>{};loadMeta();`);
  return {context,run,draws,timers,storage,networkCalls:()=>networkCalls,
    settle:()=>new Promise(resolve=>setImmediate(resolve)),
    json:code=>JSON.parse(run('JSON.stringify('+code+')')),
    fireTimers:ms=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}}};
}
