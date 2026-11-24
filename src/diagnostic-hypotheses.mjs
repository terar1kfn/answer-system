import {getErrorSignature} from './error-intelligence.mjs';
// Explicit relative diagnostic evidence weights. These are not probability,
// clinical confidence, an independent account check, or an outage detector.
const row=(causeId,domains,positive,negative=[])=>({causeId,domains,positive,negative});
const e=(key,values,weight)=>({key,values:Array.isArray(values)?values:[values],weight});
const rules=[
 row('mfa_setup_required',['identity'],[e('mfa_prompt','setup_required',5),e('setup_requested','yes',2)],[e('mfa_prompt','approved',4),e('setup_completed','yes',3)]),
 row('verification_method_unavailable',['identity'],[e('mfa_access','no',5),e('recovery_context','phone_change',1)],[e('mfa_access','yes',5)]),
 row('verification_failure',['identity'],[e('mfa_prompt',['blocked','missing'],4),e('setup_blocker','verification',4),e('verification_context','challenge',1)],[e('mfa_prompt',['approved','signed_in_no_prompt'],4)]),
 row('credential_rejection',['identity'],[e('credentials','rejected',5)],[e('credentials','accepted',5)]),
 row('account_restriction',['identity'],[e('credentials','locked',6)],[e('credentials','accepted',2)]),
 row('connectivity',['identity','network','shared','specific'],[e('connection','no',4),e('network_issue',['ssid_missing','auth','no_internet'],2),e('shared_operation','network',2)],[e('connection','yes',3)]),
 row('shared_network_incident',['identity','network','shared'],[e('connection','no',2),e('peers','yes',4)],[e('peers','no',4)]),
 row('recipient_restriction',['mail'],[e('send_error','recipients',5),e('send_scope','many',2),e('retry_mail_detail','recipients',5)],[e('send_scope','one',2)]),
 row('recipient_address',['mail'],[e('send_error','address',5),e('send_scope','one',2),e('retry_mail_detail','address',5)],[e('send_scope','all',2)]),
 row('sender_restriction',['mail'],[e('send_error','restricted',6),e('retry_mail_detail','restricted',5)],[]),
 row('message_size',['mail'],[e('send_error','size',5),e('mail_feature','attachment',2),e('retry_mail_detail','size',5)],[]),
 row('mailbox_delivery',['mail'],[e('receive_scope',['all','some'],2),e('mail_client_scope','both',3),e('retry_mail_scope','both',3)],[e('mail_client_scope','app_only',3),e('retry_mail_scope','app_only',3)]),
 row('local_client_failure',['mail','specific','task','identity'],[e('browser_scope','works',4),e('mail_client_scope','app_only',5),e('retry_mail_scope','app_only',5)],[e('browser_scope','fails',3),e('mail_client_scope','both',4),e('retry_mail_scope','both',4)]),
 row('service_signin_block',['identity'],[e('post_signin_stage','still_blocked',5)],[e('post_signin_stage',['original_works','feature_fails'],5)]),
 row('service_specific_failure',['identity','mail','task','shared','specific'],[e('service_access','one_service',4),e('browser_scope','fails',2),e('shared_access_pattern','some_recovered',2)],[e('service_access','multiple',3),e('connection','no',3)]),
 row('identity_or_access',['task','shared','identity'],[e('shared_operation','login',3),e('shared_access_pattern','same',3),e('task','login',2)],[e('shared_operation','different',3)]),
 row('permission_or_configuration',['specific'],[e('portal_issue','access',4),e('attendance_issue','permission',4),e('retry_attendance_detail',['location','camera','bluetooth'],4),e('software_issue',['license','permission'],4),e('storage_issue','access',4)],[]),
 row('device_media_failure',['specific'],[e('retry_meeting_scope','other_apps',4),e('device_issue','audio',2)],[e('retry_meeting_scope','only_meeting',4)]),
 row('service_disruption',['specific'],[e('browser_scope','fails',2)],[e('browser_scope','works',3)]),
 row('exam_application_failure',['exam'],[],[])
];
const errorCauses={
 verification_required:'verification_failure',verification_challenge:'verification_failure',registration_or_claim_required:'mfa_setup_required',registration_required:'mfa_setup_required',
 credential_validation:'credential_rejection',policy_block:'account_restriction',sign_in_block:'account_restriction',verification_expired:'verification_failure',
 recipient_address:'recipient_address',recipient_rate_limit:'recipient_restriction',sender_restricted:'sender_restriction',message_size:'message_size',quota_or_rate_review:'mailbox_delivery'
};
function entries(s,conditions){
 return conditions.filter(x=>x.values.includes(s.evidence?.[x.key]?.value)).map(x=>({key:x.key,weight:x.weight,origin:s.evidence[x.key].origin}));
}
export function rankHypotheses(state){
 if(!state?.evidence||state.domain==='safety')return [];
 const hint=getErrorSignature(state.evidence.error_signature?.value);
 return rules.filter(r=>r.domains.includes(state.domain)).map(r=>{
  const supporting=entries(state,r.positive),contradicting=entries(state,r.negative);
  if(hint&&errorCauses[hint.stage]===r.causeId)supporting.push({key:'error_signature',weight:hint.stage==='registration_or_claim_required'?2:4,origin:state.evidence.error_signature.origin});
  const positive=supporting.reduce((n,x)=>n+x.weight,0),negative=contradicting.reduce((n,x)=>n+x.weight,0);
  const status=positive&&negative?'conflicting':positive?'supported':negative?'contradicted':'candidate';
  return {causeId:r.causeId,status,evidenceKeys:[...new Set(supporting.map(x=>x.key))],contradictingEvidenceKeys:[...new Set(contradicting.map(x=>x.key))],supporting,contradicting,relativeScore:positive-negative};
 }).sort((a,b)=>b.relativeScore-a.relativeScore||b.supporting.length-a.supporting.length||a.causeId.localeCompare(b.causeId));
}
export function summarizeDiagnosticUncertainty(state,candidates=rankHypotheses(state)){
 const supported=candidates.filter(c=>c.status==='supported');
 const conflicts=candidates.filter(c=>c.status==='conflicting');
 const leading=supported[0];
 const close=leading?supported.filter(c=>leading.relativeScore-c.relativeScore<=1).map(c=>c.causeId):[];
 const level=conflicts.length?'conflicting_evidence':!leading?'insufficient_evidence':close.length>1?'multiple_supported_causes':'one_leading_hypothesis';
 return {level,leadingCause:level==='one_leading_hypothesis'?leading.causeId:null,competingCauses:close,conflictingCauses:conflicts.map(c=>c.causeId),verifiedRootCause:false};
}
