"use strict";

/* ---------------- audio (tiny synth) ---------------- */
let AC = null, sfxGain = null, musicGain = null;
// New players start at an even 50%. Saved local/cloud preferences still replace
// these values during profile loading.
let musicVol = 0.5, sfxVol = 0.5;
const MUSIC_TRACKS=Object.freeze({
  calm:Object.freeze({id:'calm',name:'CALM',detail:'Original ambient electronic loop'}),
  energetic:Object.freeze({id:'energetic',name:'ENERGETIC',detail:'Original high-energy combat score'}),
  piano:Object.freeze({id:'piano',name:'PIANO',detail:'Bach Prelude in C + Beethoven F\u00fcr Elise'})
});
let musicTrack='calm';
const sfxNoiseCache=new Map();
function normalizedMusicTrack(value){return MUSIC_TRACKS[String(value||'').toLowerCase()]?String(value).toLowerCase():'calm';}
function musicTrackLabel(value=musicTrack){const track=MUSIC_TRACKS[normalizedMusicTrack(value)];return track.name+' \u00b7 '+track.detail;}
function setMusicTrack(value,persist=true){
  const next=normalizedMusicTrack(value),changed=musicTrack!==next;musicTrack=next;
  if(changed){if(typeof stopMusicVoices==='function')stopMusicVoices();mStep=0;mNextT=AC?AC.currentTime+.08:0;}
  if(typeof accountSettingsSync==='function'&&typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen)accountSettingsSync();
  if(persist&&typeof saveMeta==='function')saveMeta();
  return changed;
}
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
function tone(f,d,type,v,slide,delay=0){
  if(!AC) return;
  const t=AC.currentTime+Math.max(0,+delay||0), o=AC.createOscillator(), g=AC.createGain();
  o.type=type||'square';
  o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide), t+d);
  g.gain.setValueAtTime(v||0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t+d);
  o.connect(g).connect(sfxGain);
  o.start(t); o.stop(t+d+0.02);
}
function noiseBuffer(d){
  const key=Math.max(1,(AC.sampleRate*d)|0);
  if(sfxNoiseCache.has(key)) return sfxNoiseCache.get(key);
  const buf=AC.createBuffer(1,key,AC.sampleRate), ch=buf.getChannelData(0);
  for(let i=0;i<key;i++) ch[i]=(Math.random()*2-1)*(1-i/key);
  sfxNoiseCache.set(key,buf);
  return buf;
}
function noiseBurst(d,v,f,delay=0,q=0.8,type='bandpass'){
  if(!AC) return;
  const src=AC.createBufferSource(); src.buffer=noiseBuffer(d);
  const bp=AC.createBiquadFilter(); bp.type=type; bp.frequency.value=f; bp.Q.value=q;
  const g=AC.createGain(); g.gain.value=v;
  const t=AC.currentTime+Math.max(0,+delay||0);
  src.connect(bp).connect(g).connect(sfxGain); src.start(t); src.stop(t+d+0.02);
}

// Every firearm uses an original synthesized signature. Profiles intentionally
// stay small (one cached noise buffer plus at most two oscillators) so the MP7
// and G18 do not create a stream of per-shot audio buffers on mobile browsers.
const SHOT_SFX_PRESETS=Object.freeze({
  ar:{noise:{d:.072,v:.18,f:1050,q:.8},tones:[{f:235,d:.085,type:'triangle',v:.055,slide:-130}]},
  solarrifle:{noise:{d:.055,v:.10,f:700,q:.65},tones:[{f:310,d:.14,type:'sine',v:.055,slide:650},{delay:.025,f:820,d:.09,type:'triangle',v:.035,slide:440}]},
  smg:{noise:{d:.032,v:.15,f:2700,q:1.2},tones:[{f:780,d:.035,type:'triangle',v:.035,slide:-260}]},
  shotgun:{noise:{d:.17,v:.22,f:420,q:.55},tones:[{f:105,d:.18,type:'sine',v:.08,slide:-60}]},
  sniper:{noise:{d:.22,v:.21,f:630,q:.7},tones:[{f:125,d:.22,type:'triangle',v:.075,slide:-75},{delay:.015,f:1500,d:.055,type:'sine',v:.025,slide:-800}]},
  m9:{noise:{d:.065,v:.16,f:1650,q:.9},tones:[{f:400,d:.06,type:'triangle',v:.04,slide:-210}]},
  revolver:{noise:{d:.125,v:.20,f:780,q:.65},tones:[{f:170,d:.14,type:'triangle',v:.07,slide:-105},{delay:.02,f:520,d:.045,type:'sine',v:.025,slide:-180}]},
  g18:{noise:{d:.026,v:.12,f:3400,q:1.3},tones:[{f:1120,d:.025,type:'triangle',v:.025,slide:-480}]},
  volt:{noise:{d:.04,v:.07,f:3200,q:.7,type:'highpass'},tones:[{f:1900,d:.075,type:'sine',v:.05,slide:-1450},{delay:.012,f:880,d:.065,type:'triangle',v:.035,slide:600}]},
  dart:{noise:{d:.046,v:.10,f:820,q:1.4},tones:[{f:155,d:.055,type:'sine',v:.035,slide:-55}]},
  fireworks:{noise:{d:.075,v:.15,f:380,q:.65,type:'lowpass'},tones:[{f:190,d:.14,type:'sine',v:.055,slide:540}]},
  railgun:{noise:{d:.085,v:.17,f:2400,q:.85,type:'highpass'},tones:[{f:2200,d:.12,type:'sine',v:.06,slide:-1800},{f:120,d:.16,type:'triangle',v:.045,slide:-65}]},
  warpwave:{tones:[{f:520,d:.085,type:'sine',v:.045,slide:250},{f:660,d:.085,type:'sine',v:.035,slide:-230}]},
  timeturner:{noise:{d:.055,v:.10,f:1800,q:1.2},tones:[{f:960,d:.12,type:'triangle',v:.045,slide:-670},{delay:.035,f:1280,d:.055,type:'sine',v:.035,slide:180}]},
});
function weaponShotPreset(w,weaponKey=''){
  return SHOT_SFX_PRESETS[String(weaponKey||'')]||SHOT_SFX_PRESETS[String(w&&w.shotSfx||'')]||null;
}
function playWeaponShot(w,weaponKey=''){
  const preset=weaponShotPreset(w,weaponKey);
  if(!preset){
    const f=Math.max(40,+w?.sndF||700),d=Math.max(.02,+w?.sndD||.08);
    noiseBurst(d,.26,f);tone(f*.45,d*.9,'square',.07,-f*.3);return;
  }
  const n=preset.noise;
  if(n) noiseBurst(n.d,n.v,n.f,n.delay||0,n.q||.8,n.type||'bandpass');
  for(const t of preset.tones||[]) tone(t.f,t.d,t.type,t.v,t.slide,t.delay||0);
}
/* ---------------- selectable music: two originals + public-domain piano ---------------- */
let arpBus=null, padBus=null, percBus=null, pianoBus=null, musicTimer=null, mStep=0, mNextT=0;
const musicVoices=new Set();
const CALM_TEMPO=112,CALM_STEP=60/CALM_TEMPO/4,ENERGETIC_TEMPO=150,ENERGETIC_STEP=60/ENERGETIC_TEMPO/4,PIANO_TEMPO=104,PIANO_STEP=60/PIANO_TEMPO/4;
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
  const dly=AC.createDelay(1.0); dly.delayTime.value=CALM_STEP*3;   // dotted-8th echo
  const fb=AC.createGain(); fb.gain.value=0.34;
  const wet=AC.createGain(); wet.gain.value=0.5;
  arpBus.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(musicGain);
  percBus=AC.createGain(); percBus.connect(musicGain);
  pianoBus=AC.createBiquadFilter();pianoBus.type='lowpass';pianoBus.frequency.value=4200;pianoBus.Q.value=.35;pianoBus.connect(musicGain);
}
function mOsc(freq,t,dur,type,vol,dest,atk){
  const o=AC.createOscillator(), g=AC.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(vol,t+(atk||0.01));
  g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  o.connect(g).connect(dest);
  musicVoices.add(o);o.addEventListener('ended',()=>musicVoices.delete(o),{once:true});
  o.start(t); o.stop(t+dur+0.05);
}
function stopMusicVoices(){for(const source of musicVoices)try{source.stop();}catch(error){}musicVoices.clear();}
function mNoise(t,dur,vol,freq){
  const len=Math.max(1,(AC.sampleRate*dur)|0), buf=AC.createBuffer(1,len,AC.sampleRate), ch=buf.getChannelData(0);
  for(let i=0;i<len;i++) ch[i]=(Math.random()*2-1)*(1-i/len);
  const src=AC.createBufferSource(); src.buffer=buf;
  const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=freq;
  const g=AC.createGain(); g.gain.value=vol;
  src.connect(f); f.connect(g); g.connect(percBus);
  musicVoices.add(src);src.addEventListener('ended',()=>musicVoices.delete(src),{once:true});
  src.start(t);
}
const ARP_PAT=[0,2,1,3,2,0,3,1,0,2,1,3,2,3,1,2];
function playCalmStep(st,t){
  const chord=M_CHORDS[Math.floor(st/32)%4];
  if(st%32===0) for(const m of chord.pool){        // washy pad on each chord change
    mOsc(mf(m),       t, 32*CALM_STEP*1.05, 'sawtooth', 0.028, padBus, 1.2);
    mOsc(mf(m)*1.004, t, 32*CALM_STEP*1.05, 'triangle', 0.030, padBus, 1.2);
  }
  if(st%8===0) mOsc(mf(chord.bass), t, 8*CALM_STEP*0.9, 'sine', 0.16, percBus, 0.02);
  const lift=(st%32)>=24 ? 12 : 0;                 // shimmer octave in the back half
  const note=chord.pool[ARP_PAT[st%16]]+lift;
  mOsc(mf(note), t, CALM_STEP*2.6, 'triangle', st%4===0?0.075:0.05, arpBus, 0.005);
  if(st%8===0){                                    // soft kick pulse
    const o=AC.createOscillator(), g=AC.createGain();
    o.type='sine'; o.frequency.setValueAtTime(120,t);
    o.frequency.exponentialRampToValueAtTime(42,t+0.11);
    g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.13);
    o.connect(g).connect(percBus);musicVoices.add(o);o.addEventListener('ended',()=>musicVoices.delete(o),{once:true});o.start(t); o.stop(t+0.15);
  }
  if(st%16===8) mNoise(t,0.10,0.10,1800);
  if(st%2===1)  mNoise(t,0.03,0.045,6000);
}
const ENERGY_CHORDS=Object.freeze([
  Object.freeze({bass:38,notes:[50,53,57,62]}),Object.freeze({bass:34,notes:[46,50,53,58]}),
  Object.freeze({bass:41,notes:[53,57,60,65]}),Object.freeze({bass:36,notes:[48,52,55,60]})
]);
const ENERGY_LEAD=Object.freeze([74,77,81,77,74,72,69,72,74,77,84,81,77,74,72,69,74,77,81,86,84,81,77,74,72,74,77,81,79,77,74,72]);
function playEnergeticStep(st,t){
  const chord=ENERGY_CHORDS[Math.floor(st/32)%ENERGY_CHORDS.length],beat=st%16;
  if(st%32===0)for(const note of chord.notes)mOsc(mf(note),t,32*ENERGETIC_STEP*.96,'sawtooth',.026,padBus,.08);
  if(st%4===0){
    const o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(45,t+.095);
    g.gain.setValueAtTime(beat===0?.52:.38,t);g.gain.exponentialRampToValueAtTime(.001,t+.115);o.connect(g).connect(percBus);musicVoices.add(o);o.addEventListener('ended',()=>musicVoices.delete(o),{once:true});o.start(t);o.stop(t+.13);
  }
  if(beat===4||beat===12)mNoise(t,.115,.15,1050);
  mNoise(t,.024,st%2?.072:.042,6200);
  if(st%8===0)mOsc(mf(chord.bass+(st%16===8?12:0)),t,7*ENERGETIC_STEP,'sawtooth',.105,percBus,.008);
  if(st%2===0){const note=ENERGY_LEAD[Math.floor(st/2)%ENERGY_LEAD.length];mOsc(mf(note),t,2.5*ENERGETIC_STEP,'square',st%8===0?.065:.045,arpBus,.004);}
  if(st%16===14)mOsc(mf(chord.notes[2]+12),t,5*ENERGETIC_STEP,'triangle',.06,arpBus,.004);
}
// The compositions are public domain. These note sequences are compact,
// original synth performances rather than copyrighted recordings.
const BACH_PRELUDE_CHORDS=Object.freeze([
  [60,64,67,72,76],[60,62,69,74,77],[59,62,67,74,77],[60,64,67,72,76],
  [60,65,69,72,77],[59,62,67,74,79],[59,64,67,71,76],[57,60,64,69,72],
  [57,62,66,69,74],[55,59,62,67,71],[55,60,64,67,72],[53,57,60,65,69],
  [54,57,60,66,69],[55,59,62,67,71],[48,55,60,64,67],[48,55,60,64,72]
]);
const BACH_PATTERN=Object.freeze([0,1,2,3,4,2,3,4]);
const FUR_ELISE_THEME=Object.freeze([76,75,76,75,76,71,74,72,69,null,60,64,69,71,null,64,68,71,72,null,64,76,75,76,75,76,71,74,72,69,null,60,64,69,71,null,64,72,71,69]);
function pianoNote(note,t,dur,volume=.11){
  if(note==null)return;
  mOsc(mf(note),t,dur,'triangle',volume,pianoBus,.004);
  mOsc(mf(note)*2,t,dur*.58,'sine',volume*.22,pianoBus,.003);
}
function playPianoStep(st,t){
  const section=Math.floor(st/128)%2,local=st%128;
  if(section===0){
    const chord=BACH_PRELUDE_CHORDS[Math.floor(local/8)%BACH_PRELUDE_CHORDS.length],note=chord[BACH_PATTERN[local%8]];
    pianoNote(note,t,PIANO_STEP*5.5,local%8===0?.12:.095);
    if(local%8===0)pianoNote(chord[0]-12,t,PIANO_STEP*7.5,.075);
  }else if(local%2===0){
    const note=FUR_ELISE_THEME[Math.floor(local/2)%FUR_ELISE_THEME.length];pianoNote(note,t,PIANO_STEP*7.2,.12);
    if(local%16===10&&note!=null)pianoNote(note-12,t,PIANO_STEP*7,.055);
  }
}
function musicStepDuration(){return musicTrack==='energetic'?ENERGETIC_STEP:musicTrack==='piano'?PIANO_STEP:CALM_STEP;}
function playMusicStep(st,t){if(musicTrack==='energetic')playEnergeticStep(st,t);else if(musicTrack==='piano')playPianoStep(st,t);else playCalmStep(st,t);}
function startMusic(){
  if(!AC || musicTimer) return;
  mNextT=AC.currentTime+0.1;
  musicTimer=setInterval(()=>{
    if(!AC) return;
    while(mNextT < AC.currentTime+0.3){
      playMusicStep(mStep, mNextT);
      mNextT += musicStepDuration();
      mStep = (mStep+1)%256;
    }
  }, 90);
}

function sfx(k,w,weaponKey){
  if(!AC) return;
  try{
    switch(k){
      case 'shoot':  playWeaponShot(w,weaponKey); break;
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
