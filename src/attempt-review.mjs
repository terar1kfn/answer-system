// Fixed student reports and exact host-verified navigation are different
// evidence classes. Viewing a step never establishes execution or success.
const q=(en,ar,rows)=>({text:{en,ar},options:[...rows,['unknown','Not sure','غير متأكد']].map(([id,en,ar])=>({id,label:{en,ar}}))});
export const ATTEMPT_QUESTIONS={
 guide_partial_state:q('Which description fits the previous guidance now?','أي وصف يطابق الإرشادات السابقة الآن؟',[
  ['remaining','I completed the instructions but part of the original task still fails','أكملت الإرشادات لكن جزءاً من المهمة الأصلية لا يزال لا يعمل'],
  ['blocked','I could not complete the instructions','لم أتمكن من إكمال الإرشادات']]),
 guide_changed_scope:q('Is the changed symptom still part of the original task?','هل العارض الجديد ما زال جزءاً من المهمة الأصلية؟',[
  ['same_task','The original task still fails, but its current symptom changed','المهمة الأصلية لا تزال لا تعمل لكن العارض الحالي تغير'],
  ['different_task','This is a different task or a different affected device','هذه مهمة مختلفة أو جهاز متأثر مختلف'],
  ['original_works','I checked the original task and it works now','تحققت من المهمة الأصلية وهي تعمل الآن']]),
 guide_not_tried_reason:q('Why were the instructions not attempted?','لماذا لم تجرب الإرشادات؟',[
  ['no_opportunity','I have not had the opportunity yet','لم تتح لي الفرصة بعد'],
  ['unavailable','I cannot access the required app, device or option','لا أستطيع الوصول إلى التطبيق أو الجهاز أو الخيار المطلوب'],
  ['unclear','I need help understanding the instructions','أحتاج إلى مساعدة في فهم الإرشادات'],
  ['safety_concern','I am concerned about a warning, permission or possible harm','لدي قلق بشأن تحذير أو إذن أو ضرر محتمل']]),
 guide_blocker:q('What prevented you from completing the previous instructions?','ما الذي منعك من إكمال الإرشادات السابقة؟',[
  ['missing_option','The described screen or option is missing or different','الشاشة أو الخيار المذكور مفقود أو مختلف'],
  ['permission','A required permission, authorization or administrator approval is missing','إذن أو صلاحية أو موافقة مسؤول مطلوبة غير متاحة'],
  ['error','An error or warning prevented the step','خطأ أو تحذير منع إكمال الخطوة'],
  ['unclear','I could not understand or carry out the instruction','لم أستطع فهم التعليمات أو تنفيذها'],
  ['unsafe','The step appears unsafe or asks for a protected action','تبدو الخطوة غير آمنة أو تتطلب إجراءً محمياً'],
  ['now_completed','I have since completed the instructions, but the original task still fails','أكملت الإرشادات منذ ذلك الحين لكن المهمة الأصلية لا تزال لا تعمل']]),
 guide_failure_point:q('Where did the observed blocker occur?','أين ظهر العائق الذي لاحظته؟',[
  ['before_steps','Before the resolution instructions opened','قبل فتح تعليمات الحل'],
  ['diagnostic_questions','While answering the native troubleshooting questions','أثناء الإجابة عن أسئلة التشخيص الأصلية'],
  ['resolution_step','While following a numbered resolution step','أثناء اتباع خطوة حل مرقمة'],
  ['after_steps','After completing the instructions, when checking the original task','بعد إكمال الإرشادات عند التحقق من المهمة الأصلية']])
};
const v=(s,k)=>s.evidence[k]?.value;
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const clone=x=>JSON.parse(JSON.stringify(x));
export function currentAttempt(state){return state.guideAttempts?.at(-1)??null;}
/** Accept only minimal, turn-bound metadata supplied by the trusted native
 * adapter. The caller also verifies the native receipt against its launch. */
export function bindGuideNavigation(state,guide,observation){
 const d=state?.decision;
 if(d?.kind!=='open_guide'||!guide||guide.id!==d.guideId||!observation||
 observation.guideId!==guide.id||observation.catalogRevision!==state.catalogRevision||
 observation.nativeGuideFingerprint!==guide.nativeGuideFingerprint||
 !/^[a-f0-9]{64}$/.test(guide.nativeGuideFingerprint||'')||
 observation.status!=='returned'||!int(observation.totalSteps,1,200)||
 !int(observation.reachedStep,0,observation.totalSteps)||
 !['root_resolution','unconfirmed'].includes(observation.progressScope))throw Error('INVALID_GUIDE_NAVIGATION');
 if(observation.progressScope==='root_resolution'&&observation.totalSteps!==guide.resolutionStepCount)throw Error('GUIDE_NAVIGATION_SCOPE_MISMATCH');
 return {...state,nativeGuideNavigation:{offerTurn:state.turn,guideId:guide.id,catalogRevision:state.catalogRevision,
  nativeGuideFingerprint:guide.nativeGuideFingerprint,progressScope:observation.progressScope,
  reachedStep:observation.reachedStep,totalSteps:observation.totalSteps,provenance:'host_verified_navigation'}};
}
export function navigationForAttempt(state,decision){
 const n=state.nativeGuideNavigation;
 return n&&n.offerTurn===state.turn-1&&n.guideId===decision.guideId&&n.catalogRevision===state.catalogRevision?clone(n):null;
}
/** The native guide owner still owns question navigation and any step text.
 * A number can only be tied to the exact root procedure, not an unknown branch.
 * The student can select any step or uncertainty; reachedStep is not a claim
 * that a particular step was attempted. Long procedures use the broad stage. */
export function failedStepQuestion(state){
 const a=currentAttempt(state),n=a?.navigation;
 if(!n||n.progressScope!=='root_resolution'||!int(n.totalSteps,1,16))return null;
 return q('Which numbered step of the previous procedure was blocked?','أي خطوة مرقمة من الإجراء السابق تعذر إكمالها؟',
  Array.from({length:n.totalSteps},(_,i)=>['step_'+(i+1),'Step '+(i+1),'الخطوة '+(i+1)]));
}
/** Return a decision only if the attempt needs clarification/referral or was
 * explicitly rechecked as resolved. Otherwise the bounded alternative planner
 * may ask fresh, purpose-specific diagnostic questions. */
export function reviewFailedAttempt(state,{ask,support}){
 const result=v(state,'guide_result');
 if(!result)return ask('guide_result');
 if(result==='not_tried'){
  const reason=v(state,'guide_not_tried_reason');
  if(!reason)return ask('guide_not_tried_reason');
  return support({no_opportunity:'GUIDE_NOT_ATTEMPTED',unavailable:'GUIDE_REQUIRED_CONTEXT_UNAVAILABLE',unclear:'GUIDE_INSTRUCTION_HELP',safety_concern:'GUIDE_SAFETY_REVIEW'}[reason]||'GUIDE_NOT_ATTEMPTED');
 }
 if(result==='different'){
  const scope=v(state,'guide_changed_scope');
  if(!scope)return ask('guide_changed_scope');
  if(scope==='original_works')return {kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'};
  return scope==='same_task'?null:support(scope==='different_task'?'NEW_ISSUE_REQUIRED':'SYMPTOMS_CHANGED_REVIEW');
 }
 if(result==='partial'&&!v(state,'guide_partial_state'))return ask('guide_partial_state');
 if(result==='partial'&&v(state,'guide_partial_state')==='unknown')return support('GUIDE_OUTCOME_UNCLEAR');
 const blocked=result==='blocked'||result==='partial'&&v(state,'guide_partial_state')==='blocked';
 if(blocked){
  const blocker=v(state,'guide_blocker');
  if(!blocker)return ask('guide_blocker');
  if(blocker==='now_completed')return null;
  if(blocker==='unsafe')return support('GUIDE_SAFETY_REVIEW');
  if(!v(state,'guide_failure_point'))return ask('guide_failure_point');
  if(v(state,'guide_failure_point')==='resolution_step'&&failedStepQuestion(state)&&!v(state,'guide_failed_step'))return ask('guide_failed_step');
  return support({missing_option:'GUIDE_SCREEN_MISMATCH',permission:'GUIDE_PERMISSION_BLOCKED',error:'GUIDE_STEP_ERROR_REVIEW',unclear:'GUIDE_INSTRUCTION_HELP'}[blocker]||'GUIDE_STEP_BLOCKED');
 }
 return result==='completed_same'||result==='partial'&&v(state,'guide_partial_state')==='remaining'?null:support('GUIDE_OUTCOME_UNCLEAR');
}
