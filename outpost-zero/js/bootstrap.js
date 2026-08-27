"use strict";

// The component files intentionally use classic scripts so the downloaded
// game still opens directly through file://. Start side effects only after
// every shared declaration and function has loaded.
setupRibbons();
capturePendingReferral();
loadMeta();
bindDomEvents();
bindCoreEvents();
bindSocialDomControls();
if(typeof bindAiTrainingSyncEvents==='function')bindAiTrainingSyncEvents();

initAuth().finally(()=>{
  // The local file must still restore layout work when Supabase is unavailable.
  if(!sb) fetchLayout();
  if(typeof flushAiTrainingQueue==='function')void flushAiTrainingQueue();
});

// A referral survives while the visitor signs in. Give that visitor a clear,
// dismissible explanation first; LATER keeps the pending id for a future login.
setTimeout(()=>{ try{
  if(state==='select'&&selPage==='hub'&&sb&&!authUser&&pendingReferralId()&&!myBan&&!dailyGateOpen&&!signUpPromptOpen)
    openSignUpPrompt('your friend sent you 5 gems \u2014 sign in to claim them');
}catch(e){} }, 350);

// Downloaded/offline builds have no cloud account to identify. Keep their
// one-time local How To prompt, but never let an online guest consume the
// profile-backed onboarding belonging to a future signed-in account.
setTimeout(()=>{ try{
  if(!sb && state==='select' && !dailyGateOpen && !signUpPromptOpen) maybeFirstRunTutorial();
}catch(e){} }, 500);

requestAnimationFrame(frame);
