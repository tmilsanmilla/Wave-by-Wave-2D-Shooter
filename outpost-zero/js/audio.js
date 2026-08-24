"use strict";

/* ---------------- audio (tiny synth) ---------------- */
let AC = null, sfxGain = null, musicGain = null;
let musicVol = 0.6, sfxVol = 0.8;
function initAudio(){
  if(!AC){
    try{
      AC = new (window.AudioContext||window.webkitAudioContext)();
      sfxGain = AC.createGain();   sfxGain.gain.value = sfxVol;        sfxGain.connect(AC.destination);
      musicGain = AC.createGain(); musicGain.gain.value = musicVol*0.7; musicGain.connect(AC.destination);
      buildMusicGraph();
      startMusic();
    }catch(e){}
  }
  if(AC && AC.state === 'suspended') AC.resume();
}
function tone(f,d,type,v,slide){
  if(!AC) return;
  const t=AC.currentTime, o=AC.createOscillator(), g=AC.createGain();
  o.type=type||'square';
  o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide), t+d);
  g.gain.setValueAtTime(v||0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t+d);
  o.connect(g).connect(sfxGain);
  o.start(t); o.stop(t+d+0.02);
}
function noiseBurst(d,v,f){
  if(!AC) return;
  const len = Math.max(1, (AC.sampleRate*d)|0);
  const buf = AC.createBuffer(1,len,AC.sampleRate), ch = buf.getChannelData(0);
  for(let i=0;i<len;i++) ch[i]=(Math.random()*2-1)*(1-i/len);
  const src=AC.createBufferSource(); src.buffer=buf;
  const bp=AC.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f; bp.Q.value=0.8;
  const g=AC.createGain(); g.gain.value=v;
  src.connect(bp).connect(g).connect(sfxGain); src.start();
}
/* ---------------- music: original ambient-electronic loop ---------------- */
let arpBus=null, padBus=null, percBus=null, musicTimer=null, mStep=0, mNextT=0;
const M_TEMPO=112, SPB16=60/M_TEMPO/4;
const mf = m => 440*Math.pow(2,(m-69)/12);
const M_CHORDS=[
  {bass:45, pool:[57,60,64,69]},   // Am
  {bass:41, pool:[57,60,65,69]},   // F
  {bass:36, pool:[55,60,64,67]},   // C
  {bass:43, pool:[55,59,62,67]},   // G
];
function buildMusicGraph(){
  padBus=AC.createBiquadFilter(); padBus.type='lowpass'; padBus.frequency.value=1000; padBus.connect(musicGain);
  arpBus=AC.createGain(); arpBus.connect(musicGain);
  const dly=AC.createDelay(1.0); dly.delayTime.value=SPB16*3;   // dotted-8th echo
  const fb=AC.createGain(); fb.gain.value=0.34;
  const wet=AC.createGain(); wet.gain.value=0.5;
  arpBus.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(musicGain);
  percBus=AC.createGain(); percBus.connect(musicGain);
}
function mOsc(freq,t,dur,type,vol,dest,atk){
  const o=AC.createOscillator(), g=AC.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(vol,t+(atk||0.01));
  g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t+dur+0.05);
}
function mNoise(t,dur,vol,freq){
  const len=Math.max(1,(AC.sampleRate*dur)|0), buf=AC.createBuffer(1,len,AC.sampleRate), ch=buf.getChannelData(0);
  for(let i=0;i<len;i++) ch[i]=(Math.random()*2-1)*(1-i/len);
  const src=AC.createBufferSource(); src.buffer=buf;
  const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=freq;
  const g=AC.createGain(); g.gain.value=vol;
  src.connect(f); f.connect(g); g.connect(percBus);
  src.start(t);
}
const ARP_PAT=[0,2,1,3,2,0,3,1,0,2,1,3,2,3,1,2];
function playStep(st,t){
  const chord=M_CHORDS[Math.floor(st/32)%4];
  if(st%32===0) for(const m of chord.pool){        // washy pad on each chord change
    mOsc(mf(m),       t, 32*SPB16*1.05, 'sawtooth', 0.028, padBus, 1.2);
    mOsc(mf(m)*1.004, t, 32*SPB16*1.05, 'triangle', 0.030, padBus, 1.2);
  }
  if(st%8===0) mOsc(mf(chord.bass), t, 8*SPB16*0.9, 'sine', 0.16, percBus, 0.02);
  const lift=(st%32)>=24 ? 12 : 0;                 // shimmer octave in the back half
  const note=chord.pool[ARP_PAT[st%16]]+lift;
  mOsc(mf(note), t, SPB16*2.6, 'triangle', st%4===0?0.075:0.05, arpBus, 0.005);
  if(st%8===0){                                    // soft kick pulse
    const o=AC.createOscillator(), g=AC.createGain();
    o.type='sine'; o.frequency.setValueAtTime(120,t);
    o.frequency.exponentialRampToValueAtTime(42,t+0.11);
    g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.13);
    o.connect(g).connect(percBus); o.start(t); o.stop(t+0.15);
  }
  if(st%16===8) mNoise(t,0.10,0.10,1800);
  if(st%2===1)  mNoise(t,0.03,0.045,6000);
}
function startMusic(){
  if(!AC || musicTimer) return;
  mNextT=AC.currentTime+0.1;
  musicTimer=setInterval(()=>{
    if(!AC) return;
    while(mNextT < AC.currentTime+0.3){
      playStep(mStep, mNextT);
      mNextT += SPB16;
      mStep = (mStep+1)%128;
    }
  }, 90);
}

function sfx(k,w){
  if(!AC) return;
  try{
    switch(k){
      case 'shoot':  noiseBurst(w.sndD, 0.26, w.sndF); tone(w.sndF*0.45, w.sndD*0.9, 'square', 0.07, -w.sndF*0.3); break;
      case 'reload': tone(520,0.05,'square',0.1); setTimeout(()=>AC&&tone(760,0.06,'square',0.1),130); break;
      case 'loaded': tone(880,0.07,'square',0.1); break;
      case 'dry':    tone(950,0.04,'square',0.07); break;
      case 'hit':    tone(230,0.06,'sawtooth',0.09,-90); break;
      case 'die':    noiseBurst(0.14,0.18,320); tone(130,0.2,'sawtooth',0.11,-70); break;
      case 'hurt':   tone(150,0.16,'sawtooth',0.16,-70); break;
      case 'pickup': tone(660,0.07,'sine',0.12); setTimeout(()=>AC&&tone(990,0.09,'sine',0.12),80); break;
      case 'wave':   tone(440,0.11,'square',0.1); setTimeout(()=>AC&&tone(660,0.14,'square',0.1),140); break;
      case 'aim':    tone(1250,0.05,'sine',0.05); break;
      case 'swap':   tone(800,0.05,'square',0.08); break;
      case 'slash':  noiseBurst(0.07,0.22,900); tone(520,0.08,'sawtooth',0.06,-260); break;
      case 'ammo':   tone(420,0.06,'square',0.1); setTimeout(()=>AC&&tone(560,0.07,'square',0.1),90); break;
      case 'crit':   noiseBurst(0.08,0.3,1200); tone(1500,0.1,'square',0.12,-500); break;
    }
  }catch(e){}
}
