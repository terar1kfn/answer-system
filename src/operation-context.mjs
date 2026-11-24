import {normalize} from './classify.mjs';
import {resumeServiceStageAfterSignIn} from './service-stage.mjs';
const v=(s,k)=>s.evidence[k]?.value;
const portalNames={moodle:['moodle','مودل','موديل'],banner:['banner','بانر'],ors:['ors','online request system','نظام الطلبات الإلكترونية']};
export function reportedAcademicSystems(text){
 const t=' '+normalize(text)+' ';
 return Object.entries(portalNames).filter(([,forms])=>forms.some(f=>t.includes(' '+normalize(f)+' '))).map(([k])=>k);
}
/** Only independently phrased device/context observations are accepted. */
export function collectOperationContext(text,r){
 if(!r||['safety','exam','unknown'].includes(r.domain)||r.facts.error_conflict||r.facts.error_signature||r.facts.mfa_prompt==='unexpected')return {};
 const clauses=text.split(/[,;!?]+|\.(?!\d)(?=\s|$)/).map(normalize).filter(Boolean);
 if(clauses.length>8)return {};
 const forms={
 device_os:{windows:['i am using windows','my affected device runs windows','على جهازي ويندوز'],macos:['i am using macos','my affected device is a mac','جهازي ماك'],ios:['my affected device is an iphone','جهازي آيفون'],android:['my affected device is android','جهازي أندرويد']},
 phone:{ios:['my phone is an iphone','i have an iphone','هاتفي آيفون'],android:['my phone is android','i have an android phone','هاتفي أندرويد']},
 network_scope:{campus_student:['i am on the university student wifi','i am using the campus student wifi','أنا متصل بشبكة الطلاب في الحرم'],other_network:['i am using my home wifi','i am using mobile data','أنا أستخدم بيانات الهاتف','أنا على شبكة المنزل']},
 mail_client:{new_windows:['i use new outlook for windows'],classic_windows:['i use classic outlook for windows'],mac:['i use outlook for mac'],ios:['i use outlook for iphone'],android:['i use outlook for android'],web:['i use outlook on the web','i use webmail']},
 meeting_client:{desktop:['i use the desktop meeting app'],mobile:['i use the mobile meeting app'],web:['i join meetings in my browser']}
 };
 const permitted=['device_os','phone'];
 if(r.services.includes('network')||r.domain==='identity')permitted.push('network_scope');
 if(r.services.includes('mail'))permitted.push('mail_client');
 if(r.services.includes('collaboration'))permitted.push('meeting_client');
 const found={};
 for(const key of permitted){
  const matches=Object.entries(forms[key]).filter(([,ps])=>clauses.some(c=>ps.some(p=>c===normalize(p)))).map(([value])=>value);
  if(matches.length===1&&!Object.hasOwn(r.facts,key))found[key]=matches[0];
 }
 return found;
}
/** Approval and service entry are distinct from successful original task. */
export function decidePostSignIn(state,{ask,support}){
 if(!v(state,'post_signin_stage'))return ask('post_signin_stage');
 const stage=v(state,'post_signin_stage');
 if(stage==='original_works')return {kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'};
 if(stage==='still_blocked'){
  if(v(state,'mfa_prompt')==='signed_in_no_prompt')return support('SIGN_IN_STAGE_UNCLEAR');
  if(!v(state,'service_access'))return ask('service_access');
  return support(v(state,'service_access')==='multiple'?'CROSS_SERVICE_ACCESS_REVIEW':'SERVICE_SIGNIN_STILL_BLOCKED');
 }
 if(stage!=='feature_fails')return support('POST_SIGNIN_STAGE_UNCLEAR');
 return null;
}
export function applyPostSignInAnswer(s,questionId,optionId){
 if(questionId==='post_signin_stage'&&optionId==='feature_fails'){
  // Mail still needs to distinguish delivery from an app feature.
  s.domain='task';
  if(s.services.includes('mail'))delete s.evidence.task;
  else s.evidence.task={value:'app',origin:'student_report'};
  s.askedQuestionIds=s.askedQuestionIds.filter(k=>k!=='task');
  delete s.evidence.outcome;
  resumeServiceStageAfterSignIn(s);
 }
}
