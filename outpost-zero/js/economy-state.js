"use strict";

/* ---------------- DAILY TASKS + GEMS + GEM SHOP ---------------- */
let gems=0, dailyTasks=[], tasksDate='', gemOwned={}, gemResetVersion=0;
const GEM_ECONOMY_VERSION=2;
const GEM_RESET_VERSION=1;                           // v1: every pre-reset wallet starts again at zero
const GEM_REWARD_SCALE=10, WHEEL_GEM_SCALE=2;
function savedGemBalance(m){
  if(!m || (+m.gre||0)<GEM_RESET_VERSION) return 0;
  const n=(+m.gems||0)*(m.gv===GEM_ECONOMY_VERSION?1:10);
  return Math.max(0,Math.round(n));
}
