/**
 * Bounded second-line diagnosis. Every alternative is a named, reviewed guide
 * purpose tied to an explicit new observation, never a fuzzy search result.
 * A failed/partial attempt is not proof that its hypothesized cause was false.
 */
const val=(s,key)=>s.evidence[key]?.value;
const has=(s,key)=>Object.hasOwn(s.evidence,key);
const copy=x=>JSON.parse(JSON.stringify(x));
const QUESTIONS=new Set(['guide_result','retry_mail_scope','retry_mail_detail','retry_network_scope','retry_attendance_detail','retry_meeting_scope','retry_software_detail','retry_storage_detail','retry_printer_detail']);
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
 if(service==='network'&&['individual_connectivity','network_connected_no_internet'].includes(purpose)){
  if(!has(s,'retry_network_scope'))return ask('retry_network_scope');
  const detail=val(s,'retry_network_scope');
  const target={ssid_missing:'network_ssid',auth:'network_auth',slow:'network_slow'}[detail];
  return target?alt('network',target,'retry_network_scope'):support('NETWORK_FAILURE_PERSISTS');
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
