const SERVICES=new Set(['mail','portal','attendance','collaboration','storage','identity','network']);
const get=(s,k)=>s.evidence[k]?.value;
const has=(s,k)=>Object.hasOwn(s.evidence,k);
export function isSharedServiceSet(services){
 return Array.isArray(services)&&services.length>1&&services.length<=SERVICES.size&&services.every(id=>SERVICES.has(id));
}
export function decideSharedAccess(s,{ask,support}){
 if(s.services.length===1&&s.services[0]==='portal'&&s.reportedAcademicSystems?.length>1){
  if(!has(s,'academic_failure_scope'))return ask('academic_failure_scope');
  if(['one','different'].includes(get(s,'academic_failure_scope')))return !has(s,'portal_system')?ask('portal_system'):support('ACADEMIC_SYSTEM_UNCONFIRMED');
  return support('SHARED_FAILURE_UNCLEAR');
 }
 if(!has(s,'shared_operation'))return ask('shared_operation');
 const operation=get(s,'shared_operation');
 if(operation==='one'||operation==='different')return !has(s,'service')?ask('service'):support('SEPARATE_SERVICE_REVIEW');
 if(operation==='unknown')return support('SHARED_FAILURE_UNCLEAR');
 return support('SHARED_FAILURE_REVIEW');
}
export function applySharedAnswer(s,questionId,optionId){
 if(questionId==='academic_failure_scope'&&optionId==='login'){
  s.domain='identity';s.evidence.task={value:'login',origin:'student_report'};return;
 }
 if(questionId==='portal_system'&&s.domain==='shared'&&s.services.length===1&&s.services[0]==='portal'&&optionId!=='unknown'){
  s.domain='task';delete s.evidence.task;return;
 }
 if(questionId!=='shared_operation')return;
 if(optionId==='login'){
  s.domain='identity';s.evidence.task={value:'login',origin:'student_report'};
 }else if(optionId==='network'){
  s.domain='network';
 }
}
export function afterSuccessfulVerification(s,{ask,support}){
 if(s.sharedProgress&&s.sharedProgress.phase==='initial')return ask('shared_task_recheck');
 if(!has(s,'shared_access_pattern'))return ask('shared_access_pattern');
 switch(get(s,'shared_access_pattern')){
  case 'same':return support('CROSS_SERVICE_COMMON_ACCESS_REVIEW');
  case 'different':return support('CROSS_SERVICE_DIFFERENT_FAILURES');
  case 'some_recovered':return !has(s,'service')?ask('service'):support('SERVICE_SPECIFIC_REVIEW');
  default:return support('CROSS_SERVICE_SCOPE_UNCLEAR');
 }
}
