// Conditional plan, rebuilt from current admitted evidence after every turn.
// Never queue an unapproved procedure, predict success or perform an action.
const read=(s,k)=>s.evidence[k]?.value;
const clone=x=>JSON.parse(JSON.stringify(x));
const MAX_TRANSITIONS=2;
function resetForOriginalTask(s,reason,questionId,optionId){
 const transitions=s.resolutionTransitions||[];
 if(transitions.length>=MAX_TRANSITIONS||transitions.some(x=>x.reason===reason&&x.focus.join(':')===s.services.join(':')))return false;
 const prior=s.guideAttempts?.at(-1);
 if(!prior||prior.outcome!=='no'||prior.followUp?.[questionId]!==optionId)return false;
 const saved={};
 // Keep the original operation and exact selected service identifiers; earlier
 // sign-in, permission, error, browser and client comparisons must be renewed.
 for(const k of ['service','portal_system','portal_issue','meeting_product','meeting_issue','attendance_issue','mail_feature','device_os','phone','mail_client','meeting_client']){
  if(s.evidence[k])saved[k]=clone(s.evidence[k]);
 }
 if(s.evidence.mfa_recovery?.origin==='staff_verified')saved.mfa_recovery=clone(s.evidence.mfa_recovery);
 s.evidence=saved;
 s.evidence.task={value:'login',origin:'student_report'};
 if(reason==='NETWORK_RESTORED_ORIGINAL_SIGNIN_PENDING')s.evidence.connection={value:'yes',origin:'student_report'};
 if(reason==='PORTAL_ENTRY_BLOCKED_AFTER_GUIDE')s.evidence.portal_access={value:'blocked',origin:'student_report'};
 s.askedQuestionIds=[];s.conflictingObservations=[];
 delete s.activeAlternative;delete s.lastGuidePurpose;delete s.errorHint;delete s.nativeGuideNavigation;
 s.domain='identity';s.requestKind='fault';
 s.resolutionTransitions=[...transitions,{reason,questionId,optionId,focus:[...s.services],priorGuideId:prior.guideId,turn:s.turn}];
 return true;
}
export function applyResolutionTransition(s,questionId,optionId){
 const prior=s.guideAttempts?.at(-1);
 if(s.services.length!==1||!prior||s.evidence.credentials?.value==='locked'||s.evidence.mfa_prompt?.value==='unexpected'||s.evidence.error_signature)return false;
 if(questionId==='retry_network_scope'&&optionId==='restored_original_pending'&&prior.serviceId==='network'&&s.services[0]!=='network'&&read(s,'task')==='login'){
  return resetForOriginalTask(s,'NETWORK_RESTORED_ORIGINAL_SIGNIN_PENDING',questionId,optionId);
 }
 if(questionId==='retry_portal_scope'&&optionId==='blocked'&&prior.serviceId==='portal'&&s.services[0]==='portal'){
  return resetForOriginalTask(s,'PORTAL_ENTRY_BLOCKED_AFTER_GUIDE',questionId,optionId);
 }
 return false;
}
export function buildResolutionPlan(state,catalog){
 const d=state.decision,original=state.sharedProgress?.originalServices||state.services;
 const focus=state.services;
 const stages=(state.guideAttempts||[]).slice(-12).map(a=>({kind:'attempt',guideId:a.guideId,serviceId:a.serviceId,purpose:a.purpose,
  result:a.outcome,reportedAtTurn:a.reportedAtTurn,followUp:clone(a.followUp||{}),navigation:a.navigation?clone(a.navigation):null}));
 const transitions=(state.resolutionTransitions||[]).slice(-MAX_TRANSITIONS).map(clone);
 const next=d.kind==='ask'?{kind:'collect_evidence',questionId:d.questionId}:d.kind==='open_guide'?
  {kind:'reviewed_native_guide',guideId:d.guideId,purpose:catalog.guides.find(g=>g.id===d.guideId)?.purpose,
   after:'confirm_original_task_then_investigate_if_needed'}:d.kind==='resolved_reported'?{kind:'student_reported_resolution'}:
  d.kind==='offer_mfa_recovery'?{kind:'authorized_native_recovery',after:'reconfirm_original_task_after_verified_completion'}:
  d.kind==='answer'?{kind:'reviewed_information',after:'confirm_information_helpfulness'}:
  d.kind==='incident_notice'?{kind:'confirmed_incident_notice'}:{kind:'authorized_review',reasonCode:d.reasonCode||d.policyCode};
 return {kind:'conditional_resolution_plan',ruleVersion:state.ruleVersion,catalogRevision:state.catalogRevision,turn:state.turn,
  originalServices:[...original],currentServices:[...focus],originalAcademicSystems:[...(state.sharedProgress?.originalAcademicSystems||state.reportedAcademicSystems||[])],
  sharedPhase:state.sharedProgress?.phase??null,stages,transitions,next,
  selection:d.guideSelection?clone(d.guideSelection):null,automaticActions:false,verifiedRootCause:false};
}
