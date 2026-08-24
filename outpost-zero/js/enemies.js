"use strict";

/* ---------------- enemy types ---------------- */
const ETYPES = {
  grunt : { r:16, hp: 60, spd:1.7, dmg:12, col:'#c8504a', score:100, ranged:false },
  runner: { r:11, hp: 30, spd:3.1, dmg: 8, col:'#e08a3c', score:150, ranged:false },
  brute : { r:26, hp:230, spd:1.0, dmg:26, col:'#9a55d0', score:300, ranged:false },
  gunner: { r:14, hp: 55, spd:1.5, dmg: 9, col:'#4fa8c9', score:200, ranged:true  },
  seeker: { r:13, hp: 70, spd:1.6, dmg: 0, col:'#c9b23e', score:220, ranged:true,  seeker:true },
  arty  : { r:17, hp:130, spd:1.2, dmg: 0, col:'#d0763e', score:350, ranged:true,  arty:true },
  boss  : { r:40, hp:1000, spd:1.1, dmg:35, col:'#ff4a4a', score:2000, ranged:false, boss:true },
  bossBlue  : { r:32, hp:420,  spd:1.15, dmg:20, col:'#4fa8ff', score:2600, ranged:false, boss:true, kite:true },
  bossYellow: { r:36, hp:1400, spd:1.25, dmg:40, col:'#ffe23b', score:3200, ranged:false, boss:true },
  bossPurple: { r:46, hp:3200, spd:0.85, dmg:60, col:'#b45af0', score:8000, ranged:false, boss:true },
  dummy : { r:26, hp:1e9, spd:0, dmg:0, col:'#8d949c', score:0, ranged:false },
};
function fireHoming(e, a, spd, turn, life, dmg){
  ebullets.push({x:e.x, y:e.y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, spd, h:turn, life, dmg, hp:18, r:9});
}
// destroy any incoming homing missiles within radius r of (x,y) — used by explosions and melee swings
function destroyMissilesInRadius(x, y, r){
  for(let m=ebullets.length-1;m>=0;m--){
    const mb=ebullets[m];
    if(mb.h && dist2(mb.x,mb.y,x,y) < (r+mb.r)*(r+mb.r)){
      burst(mb.x,mb.y,'#ff9a4a',10,4);
      ebullets.splice(m,1);
    }
  }
}
