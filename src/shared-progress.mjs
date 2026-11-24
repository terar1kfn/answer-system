import {SERVICES} from './service-taxonomy.mjs';
const eligible=new Set(['mail','portal','attendance','collaboration','storage','identity','network']);
const academicLabels={moodle:['Moodle','مودل'],banner:['Banner','بانر'],ors:['ORS','نظام الطلبات']};
const MAX_FOCUS=2,MAX_RECHECK=3;
const read=(s,k)=>s.evidence[k]?.value;
function clear(s,keys){for(const k of keys)delete s.evidence[k];s.askedQuestionIds=s.askedQuestionIds.filter(k=>!keys.includes(k));}
export function initializeSharedProgress(s,academicSystems=[]){
 if(!['shared','identity','network'].includes(s.domain)||s.services.some(x=>!eligible.has(x)))return;
 const systems=s.services.includes('portal')?[...new Set(academicSystems.filter(x=>Object.hasOwn(academicLabels,x)))]:[];
 if(s.services.length<2&&systems.length<2)return;
 s.sharedProgress={originalServices:[...new Set(s.services)],originalAcademicSystems:systems,
  phase:'initial',focusCount:0,recheckCount:0,checks:[]};
}
function chooseFocus(s){
 const p=s.sharedProgress;
 if(p.focusCount>=MAX_FOCUS){p.phase='budget_exhausted';return;}
 p.focusCount++;
 p.phase=p.originalServices.length>1?'select_service':'select_portal';
 s.askedQuestionIds=s.askedQuestionIds.filter(k=>!['service','portal_system'].includes(k));
 clear(s,['outcome','post_signin_stage']);
}
function enterFocused(s,service,portal=null){
 const p=s.sharedProgress;
 if(!p.originalServices.includes(service)){p.phase='unconfirmed';return;}
 p.phase='focused';
 p.focus={service,...(portal?{portal}:{})};
 s.services=[service];
 // Do not transplant an earlier service's credentials, error, device/client
 // or feature observations to a different service. Keep attempt history.
 const recovery=s.evidence.mfa_recovery?.origin==='staff_verified'?s.evidence.mfa_recovery:null;
 s.evidence=portal?{portal_system:{value:portal,origin:'student_report'}}:{service:{value:service,origin:'student_report'}};
 if(recovery)s.evidence.mfa_recovery=recovery; // history, never proof of a working method
 s.askedQuestionIds=[];s.conflictingObservations=[];
 delete s.activeAlternative;delete s.lastGuidePurpose;delete s.errorHint;
 delete s.knowledgeChoices;delete s.reviewedFactId;delete s.reviewedFactIds;
 delete s.reviewedFactConflict;delete s.compositeAnswerGap;
 if(portal)s.reportedAcademicSystems=[portal];
 else if(service==='portal')s.reportedAcademicSystems=[...p.originalAcademicSystems];
 else delete s.reportedAcademicSystems;
 s.domain=service==='identity'||service==='network'?service:'task';
 s.requestKind='fault';
}
export function applySharedProgressAnswer(s,questionId,optionId){
 const p=s.sharedProgress;if(!p)return;
 // The student has clarified that only one originally mentioned service
 // was affected. Do not treat the other mentioned services as failed tasks.
 if(p.phase==='initial'&&['shared_operation','academic_failure_scope'].includes(questionId)&&optionId==='one'){
  delete s.sharedProgress;return;
 }
 if(questionId==='shared_task_recheck'&&p.phase==='recheck'){
  p.recheckCount++;
  p.checks=[...p.checks,{result:optionId,turn:s.turn,...(p.focus?{focus:{...p.focus}}:{})}].slice(-MAX_RECHECK);
  clear(s,['outcome','post_signin_stage','shared_access_pattern']);
  if(optionId==='all_work'){p.phase='resolved';return;}
  if(optionId==='some_work'){chooseFocus(s);return;}
  if(optionId==='none_work'){p.phase='compare';return;}
  p.phase='unconfirmed';return;
 }
 if(questionId==='shared_access_pattern'&&p.phase==='compare'){
  if(['different','some_recovered'].includes(optionId)){chooseFocus(s);return;}
  p.phase=optionId==='same'?'common_failure':'unconfirmed';return;
 }
 if(questionId==='service'&&p.phase==='select_service'){
  if(optionId==='portal'&&p.originalAcademicSystems.length>1){
   p.phase='select_portal';s.services=['portal'];s.reportedAcademicSystems=[...p.originalAcademicSystems];
   s.askedQuestionIds=s.askedQuestionIds.filter(k=>k!=='portal_system');return;
  }
  if(optionId==='other'||!p.originalServices.includes(optionId)){p.phase='unconfirmed';return;}
  enterFocused(s,optionId,optionId==='portal'&&p.originalAcademicSystems.length===1?p.originalAcademicSystems[0]:null);
  // Retain the actual selected service answer for journey reporting.
  s.evidence.service={value:optionId,origin:'student_report'};return;
 }
 if(questionId==='portal_system'&&p.phase==='select_portal'){
  if(!p.originalAcademicSystems.includes(optionId)){p.phase='unconfirmed';return;}
  enterFocused(s,'portal',optionId);
 }
}
export function sharedProgressDecision(s,{ask,support}){
 const p=s.sharedProgress;if(!p)return null;
 switch(p.phase){
  case 'recheck':return ask('shared_task_recheck');
  case 'compare':return ask('shared_access_pattern');
  case 'select_service':return ask('service');
  case 'select_portal':return ask('portal_system');
  case 'resolved':return {kind:'resolved_reported',reasonCode:'ALL_ORIGINAL_TASKS_CONFIRMED'};
  case 'common_failure':return support('CROSS_SERVICE_COMMON_ACCESS_REVIEW');
  case 'budget_exhausted':return support('SHARED_FOCUS_BUDGET_EXHAUSTED');
  case 'unconfirmed':return support('SHARED_TASKS_UNCONFIRMED');
  default:return null;
 }
}
export function applySharedProgressDecision(s,decision,{ask,support}){
 const p=s.sharedProgress;if(!p)return decision;
 if(decision.kind==='resolved_reported'&&p.phase!=='resolved'||
    decision.kind==='ask'&&decision.questionId==='shared_task_recheck'){
  if(p.recheckCount>=MAX_RECHECK)return support('SHARED_FOCUS_BUDGET_EXHAUSTED');
  if(p.phase!=='recheck'){
   p.phase='recheck';
   clear(s,['shared_task_recheck']);
  }
  return {...ask('shared_task_recheck'),reasonCode:'VERIFY_ALL_ORIGINAL_TASKS'};
 }
 // If distinct original failures must be separated before any guide, use
 // the same bounded focus selection and preserve the full reported scope.
 if(p.phase==='initial'&&s.domain==='shared'&&decision.kind==='ask'&&
    ['service','portal_system'].includes(decision.questionId)){
  chooseFocus(s);
  return sharedProgressDecision(s,{ask,support});
 }
 return decision;
}
export function sharedProgressQuestion(s,questionId,question){
 const p=s.sharedProgress;if(!p||!question)return question;
 if(questionId==='service'&&p.phase==='select_service')return {
  text:{en:'Which of the original services still needs attention first?',ar:'أي خدمة من الخدمات الأصلية ما زالت تحتاج إلى المعالجة أولاً؟'},
  options:question.options.filter(o=>p.originalServices.includes(o.id)||o.id==='other')
 };
 if(questionId==='portal_system'&&p.phase==='select_portal')return {
  text:{en:'Which of the originally reported academic systems still needs attention first?',ar:'أي نظام من الأنظمة الأكاديمية المذكورة أصلاً ما زال يحتاج إلى المعالجة أولاً؟'},
  options:question.options.filter(o=>p.originalAcademicSystems.includes(o.id)||o.id==='unknown')
 };
 if(questionId!=='shared_task_recheck')return question;
 const labels=[[],[]];
 for(const service of p.originalServices){
  if(service==='portal'&&p.originalAcademicSystems.length){
   for(const system of p.originalAcademicSystems){labels[0].push(academicLabels[system][0]);labels[1].push(academicLabels[system][1]);}
  }else{
   const name=SERVICES.find(x=>x.id===service);
   if(name){labels[0].push(name.en);labels[1].push(name.ar);}
  }
 }
 return {...question,text:{
  en:'Check the original affected tasks: '+labels[0].join(', ')+'. Which work now?',
  ar:'تحقق من المهام الأصلية المتأثرة: '+labels[1].join('، ')+'. أيها يعمل الآن؟'
 }};
}
/** A confirmed new current error supersedes an unfinished aggregate check,
 * but it cannot erase the original reported scope or a prior focus history. */
export function restartSharedProgressDiagnosis(s){
 const p=s.sharedProgress;if(!p)return;
 p.phase=p.focus?'focused':'initial';
}
