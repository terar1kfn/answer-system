import {afterSuccessfulVerification} from './shared-access.mjs';
import {decideNetwork} from './network-flow.mjs';
import {decidePostSignIn} from './operation-context.mjs';
// Pure adaptive sign-in policy. It requests approved guide purposes or staff
// support; it never sends a reset, changes a credential, or issues a login code.
const get=(s,k)=>s.evidence[k]?.value;
const has=(s,k)=>Object.hasOwn(s.evidence,k);
export const SETUP_PURPOSES=Object.freeze(['setup_ios','setup_android']);
const STALE_SIGN_IN=['mfa_prompt','mfa_access','recovery_context','credentials','connection','peers','service_access','verification_context','error_signature','login_screen','shared_access_pattern','security_info_access','password_intent','password_knowledge','post_signin_stage'];
function forget(s,keys){for(const k of keys)delete s.evidence[k];s.askedQuestionIds=s.askedQuestionIds.filter(k=>!keys.includes(k));}
function reported(s,key,value,origin='student_report'){s.evidence[key]={value,origin};}
export function isFailedSetup(s){
 return get(s,'outcome')==='no'&&SETUP_PURPOSES.includes(s.lastGuidePurpose);
}
export function applyIdentityAnswer(s,questionId,optionId){
 if(questionId==='setup_blocker'&&optionId==='setup_done_service_fails'){
  // Setup completion and successful sign-in are different reported outcomes.
  // Prior failure signals refer to the earlier attempt, not the new one.
  forget(s,[...STALE_SIGN_IN,'setup_requested','outcome']);
  reported(s,'mfa_setup','yes');reported(s,'setup_completed','yes');
  s.domain='identity';
 }
}
export function prepareVerifiedRecovery(s,catalog){
 if(get(s,'mfa_recovery')==='completed')throw Error('RECOVERY_ALREADY_COMPLETED');
 forget(s,[...STALE_SIGN_IN,'mfa_setup','setup_completed','setup_blocker','outcome','phone','setup_requested']);
 const setupIds=new Set(catalog.guides.filter(g=>g.serviceId==='identity'&&SETUP_PURPOSES.includes(g.purpose)).map(g=>g.id));
 s.offeredGuideIds=s.offeredGuideIds.filter(id=>!setupIds.has(id));
 delete s.lastGuidePurpose;
 reported(s,'mfa_recovery','completed','staff_verified');
 reported(s,'setup_requested','yes','staff_verified');
 return s;
}
export function decideIdentity(s,{ask,guide,support,safety,errorHint}){
 const v=k=>get(s,k),k=x=>has(s,x);
 const setup=()=>!k('phone')?ask('phone'):['ios','android'].includes(v('phone'))?guide('identity','setup_'+v('phone')):support('PHONE_PLATFORM_UNCLEAR');
 const recovery=()=>{
  if(!k('mfa_access'))return ask('mfa_access');
  if(v('mfa_access')==='unknown')return support('MFA_ACCESS_UNCONFIRMED');
  if(v('mfa_access')==='no')return v('mfa_recovery')==='completed'?support('RECOVERY_STILL_BLOCKED'):{kind:'offer_mfa_recovery',reasonCode:'REGISTERED_METHOD_UNAVAILABLE'};
  if(v('recovery_context')!=='phone_change')return support('MFA_VERIFICATION_FAILED');
  if(!k('security_info_access'))return ask('security_info_access');
  return v('security_info_access')==='yes'?guide('identity','manage_existing_method'):support('SECURITY_INFO_ACCESS_REVIEW');
 };
 if(v('mfa_prompt')==='unexpected')return safety('UNEXPECTED_VERIFICATION_REQUEST');
 if(v('credentials')==='locked')return support('ACCOUNT_LOCKED');
 if(isFailedSetup(s)){
  if(!k('setup_blocker'))return ask('setup_blocker');
  if(v('setup_blocker')==='verification')return recovery();
  if(v('setup_blocker')==='installation')return support('AUTHENTICATOR_APP_UNAVAILABLE');
  if(v('setup_blocker')==='registration')return support('AUTHENTICATOR_REGISTRATION_FAILED');
  return support('AUTHENTICATOR_SETUP_UNRESOLVED');
 }
 if(v('recovery_context')==='phone_change'||v('mfa_prompt')==='blocked')return recovery();
 if(!k('error_signature')&&!k('mfa_prompt')&&!k('verification_context')){
  if(v('password_intent')==='forgot')return support('STUDENT_PASSWORD_RESET_REVIEW');
  if(v('password_intent')==='change'){
   if(!k('password_knowledge'))return ask('password_knowledge');
   if(v('password_knowledge')==='no')return support('STUDENT_PASSWORD_RESET_REVIEW');
   return v('password_knowledge')==='yes'?guide('identity','password_change_known'):support('PASSWORD_STATUS_UNCONFIRMED');
  }
 }
 if(v('credentials')==='rejected')return guide('identity','credential_check');
 if(errorHint?.stage==='credential_validation'&&!k('credentials'))return ask('credentials');
 // A directly requested how-to or verified reset may open the approved setup
 // path. "I haven't set it up" alone is not proof that the current prompt is setup.
 if(v('mfa_prompt')==='setup_required'){
  if(v('setup_completed')==='yes')return support('REGISTRATION_STILL_REQUIRED_AFTER_SETUP');
  return setup();
 }
 if(v('setup_requested')==='yes'&&!k('mfa_prompt'))return setup();
 if(!k('mfa_setup')&&!k('mfa_prompt')&&!k('verification_context'))return ask('mfa_setup');
 if(!k('mfa_prompt'))return ask('mfa_prompt');
 if(v('mfa_prompt')==='not_tried')return support('SIGN_IN_NOT_ATTEMPTED');
 if(!k('credentials'))return ask('credentials');
 if(v('credentials')==='locked')return support('ACCOUNT_LOCKED');
 if(v('credentials')==='rejected')return guide('identity','credential_check');
 if(!k('connection'))return ask('connection');
 if(v('connection')==='no'){
  if(!k('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  return v('peers')==='no'?decideNetwork(s,{ask,guide,support,fromIdentity:true}):support('NETWORK_SCOPE_UNCLEAR');
 }
 if(v('mfa_prompt')==='missing')return v('credentials')==='accepted'&&v('connection')==='yes'?guide('identity','mfa_notification_check'):support('MFA_PROMPT_MISSING');
 if(v('mfa_prompt')==='approved'&&v('credentials')==='accepted'&&v('connection')==='yes'&&s.services.length>1)return afterSuccessfulVerification(s,{ask,support});
 if(v('mfa_prompt')==='approved'&&v('credentials')==='accepted'&&v('connection')==='yes'&&s.services.length===1&&s.services[0]!=='identity'){
  if(!k('service_access'))return ask('service_access');
  if(v('service_access')==='one_service')return decidePostSignIn(s,{ask,support});
  if(v('service_access')==='multiple')return support('CROSS_SERVICE_ACCESS_REVIEW');
 }
 return support('SIGN_IN_CAUSE_UNCONFIRMED');
}
