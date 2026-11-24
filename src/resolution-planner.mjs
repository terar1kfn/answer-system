/**
 * Bounded second-line diagnosis. Every alternative is a named, reviewed guide
 * purpose tied to an explicit new observation, never a fuzzy search result.
 * A failed/partial attempt is not proof that its hypothesized cause was false.
 */
const val=(s,key)=>s.evidence[key]?.value;
const has=(s,key)=>Object.hasOwn(s.evidence,key);
const copy=x=>JSON.parse(JSON.stringify(x));
const QUESTIONS=new Set(['guide_result','retry_mail_scope','retry_mail_detail','retry_network_scope','retry_attendance_detail','retry_meeting_scope','retry_software_detail','retry_storage_detail','retry_printer_detail','retry_portal_scope','retry_network_peers']);
const MAX_FAILED_ATTEMPTS=3;
const SETUP=new Set(['setup_ios','setup_android']);
export function recordGuideOutcome(s,previous,optionId){
 if(previous?.kind!=='open_guide')return;
 // These observations pertain to the preceding attempt, not to this one.
 for(const k of QUESTIONS)delete s.evidence[k];
 s.askedQuestionIds=s.askedQuestionIds.filter(k=>!QUESTIONS.has(k));
 const purpose=s.lastGuidePurpose;
 const record={guideId:previous.guideId,serviceId:previous.serviceId,purpose,outcome:optionId,reportedAtTurn:s.turn,followUp:{}};
 s.guideAttempts=[...(s.guideAttempts||[]),record].slice(-12);
 delete s.activeAlternative;
}
export function recordResolutionAnswer(s,key,value){
 if(!QUESTIONS.has(key)||!s.guideAttempts?.length)return;
 const prior=s.guideAttempts[s.guideAttempts.length-1];
 prior.followUp={...prior.followUp,[key]:value};
 if(key==='retry_attendance_detail'&&['location','camera','bluetooth'].includes(value)){
  // Bind the next applicability check to the newly reported permission,
  // not a contradictory field left over from the failed guide.
  s.evidence.attendance_permission_kind={value,origin:'student_report'};
  s.evidence.attendance_issue={value:'permission',origin:'student_report'};
 }
}
function lastFailure(s){
 const x=s.guideAttempts?.at(-1);
 return x?.outcome==='no'&&!SETUP.has(x.purpose)?x:null;
}
function alreadyOffered(s,c,serviceId,purpose){
 const prior=new Set(s.offeredGuideIds||[]);
 return (s.guideAttempts||[]).some(x=>x.serviceId===serviceId&&x.purpose===purpose)||
  c.guides.some(g=>g.serviceId===serviceId&&g.purpose===purpose&&prior.has(g.id));
}
export function decideAfterFailedGuide(s,c,{ask,guide,support}){
 const attempt=lastFailure(s);
 if(!attempt)return support('GUIDE_DID_NOT_WORK');
 if((s.guideAttempts||[]).filter(x=>x.outcome==='no'&&!SETUP.has(x.purpose)).length>=MAX_FAILED_ATTEMPTS)return support('ALTERNATIVE_BUDGET_EXHAUSTED');
 const service=attempt.serviceId,purpose=attempt.purpose;
 if(!has(s,'guide_result'))return ask('guide_result');
 const result=val(s,'guide_result');
 if(result==='not_tried')return support('GUIDE_NOT_ATTEMPTED');
 if(result==='different')return support('SYMPTOMS_CHANGED_REVIEW');
 if(result==='blocked')return support('GUIDE_STEP_BLOCKED');
 if(!['completed_same','partial'].includes(result))return support('GUIDE_OUTCOME_UNCLEAR');
 const alt=(serviceId,nextPurpose,signalKey)=>{
  if(alreadyOffered(s,c,serviceId,nextPurpose))return support('NO_DISTINCT_APPROVED_ALTERNATIVE');
  const d=guide(serviceId,nextPurpose);
  return d.kind==='open_guide'?{...d,reasonCode:'EVIDENCE_SUPPORTED_ALTERNATIVE',alternative:{previousGuideId:attempt.guideId,purpose:nextPurpose,signalKey}}:d;
 };
 // Never reinterpret an explicit delivery/policy restriction as a client fault.
 if(service==='mail'&&['send','receive'].includes(val(s,'task'))&&!has(s,'error_signature')&&
  !['recipients','restricted','size','address'].includes(val(s,'send_error'))){
  if(purpose==='mail_sync'&&val(s,'task')==='send'){
   if(!has(s,'retry_mail_detail'))return ask('retry_mail_detail');
   const detail=val(s,'retry_mail_detail');
   if(detail==='restricted')return support('MAIL_SENDER_RESTRICTED');
   const target={address:'recipient_address_check',size:'mail_attachment',recipients:'recipient_limit_check'}[detail];
   return target?alt('mail',target,'retry_mail_detail'):support('MAIL_DELIVERY_REVIEW');
  }
  if(purpose!=='mail_sync'){
   if(!has(s,'retry_mail_scope'))return ask('retry_mail_scope');
   if(val(s,'retry_mail_scope')==='app_only')return alt('mail','mail_sync','retry_mail_scope');
   return support('MAIL_DELIVERY_REVIEW');
  }
 }
 if(service==='network'&&['individual_connectivity','network_setup','network_auth','network_ssid','network_slow','network_connected_no_internet'].includes(purpose)){
  if(!has(s,'retry_network_scope'))return ask('retry_network_scope');
  const detail=val(s,'retry_network_scope');
  const target={ssid_missing:'network_ssid',auth:'network_auth',slow:'network_slow',no_internet:'network_connected_no_internet'}[detail];
  if(!target)return support('NETWORK_FAILURE_PERSISTS');
  if(!has(s,'retry_network_peers'))return ask('retry_network_peers');
  if(val(s,'retry_network_peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  if(val(s,'retry_network_peers')!=='no')return support('NETWORK_SCOPE_UNCLEAR');
  // Keep the prior attempt as history; this is a fresh, explicit observation
  // of the same device and intended network, not proof of a root cause.
  s.evidence.network_issue={value:detail,origin:'student_report'};
  s.evidence.peers={value:'no',origin:'student_report'};
  if(detail==='no_internet')s.evidence.connection={value:'no',origin:'student_report'};
  else if(detail==='slow')s.evidence.connection={value:'yes',origin:'student_report'};
  else delete s.evidence.connection;
  return alt('network',target,'retry_network_scope');
 }
 if(service==='attendance'&&['attendance_scan','attendance_app'].includes(purpose)){
  if(!has(s,'retry_attendance_detail'))return ask('retry_attendance_detail');
  if(val(s,'retry_attendance_detail')!=='location')return support('ATTENDANCE_PERMISSION_SPECIFIC_REVIEW');
  if(has(s,'attendance_permission_kind')&&val(s,'attendance_permission_kind')!=='location')return support('ATTENDANCE_PERMISSION_SPECIFIC_REVIEW');
  return alt('attendance','attendance_permissions','retry_attendance_detail');
 }
 if(service==='collaboration'&&['meeting_audio','meeting_video'].includes(purpose)){
  if(!has(s,'retry_meeting_scope'))return ask('retry_meeting_scope');
  if(val(s,'retry_meeting_scope')==='other_apps'&&purpose==='meeting_audio')return alt('device','device_audio','retry_meeting_scope');
  return support('MEETING_MEDIA_REVIEW');
 }
 if(service==='portal'&&['portal_browser','portal_mobile_setup','portal_submission_standard','portal_submission_turnitin','portal_submission_link'].includes(purpose)){
  if(!has(s,'retry_portal_scope'))return ask('retry_portal_scope');
  const stage=val(s,'retry_portal_scope');
  if(stage==='works')return {kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'};
  if(stage==='blocked')return support('SERVICE_SIGNIN_STILL_BLOCKED');
  return support('ACADEMIC_FEATURE_REVIEW');
 }
 if(service==='software'&&purpose==='software_launch'){
  if(!has(s,'retry_software_detail'))return ask('retry_software_detail');
  return val(s,'retry_software_detail')==='update_required'?alt('software','software_update','retry_software_detail'):support('SOFTWARE_LAUNCH_REVIEW');
 }
 if(service==='storage'&&purpose==='storage_sync'){
  if(!has(s,'retry_storage_detail'))return ask('retry_storage_detail');
  return val(s,'retry_storage_detail')==='quota'?alt('storage','storage_space','retry_storage_detail'):support('STORAGE_SYNC_REVIEW');
 }
 if(service==='printing'&&purpose==='printer_offline'){
  if(!has(s,'retry_printer_detail'))return ask('retry_printer_detail');
  return val(s,'retry_printer_detail')==='queue'?alt('printing','printer_queue','retry_printer_detail'):support('PRINTING_REVIEW');
 }
 // For identity, safety, permission-sensitive or unmapped branches, staff review
 // is safer than recommending an unrelated procedure.
 return support('NO_DISTINCT_APPROVED_ALTERNATIVE');
}
export function activateAlternative(s,d){
 if(!d.alternative)return;
 s.activeAlternative={serviceId:d.serviceId,purpose:d.alternative.purpose,previousGuideId:d.alternative.previousGuideId,signalKey:d.alternative.signalKey};
 delete s.evidence.outcome;
}
export function repeatAlternative(s,{guide}){
 const a=s.activeAlternative;if(!a)return null;
 const d=guide(a.serviceId,a.purpose);
 return d.kind==='open_guide'?{...d,reasonCode:'EVIDENCE_SUPPORTED_ALTERNATIVE',alternative:{previousGuideId:a.previousGuideId,purpose:a.purpose,signalKey:a.signalKey}}:d;
}
export function reportedGuideOutcome(state){
 const row=state?.guideAttempts?.at(-1);
 return row?copy(row):null;
}
