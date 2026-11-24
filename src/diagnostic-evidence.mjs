import {QUESTIONS} from './questions.mjs';

const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const freezeList=xs=>Object.freeze(xs);
export const GUIDE_PREREQUISITE_QUESTIONS=freezeList(['password_change_environment','network_scope','attendance_permission_kind','portal_system','assignment_kind','attendance_qr_task','mail_client','meeting_product','meeting_client','device_os','phone','browser_scope']);
const autoAsk=new Set(GUIDE_PREREQUISITE_QUESTIONS);
export const isAutomaticPrerequisiteQuestion=key=>autoAsk.has(key);
// These two responses do not establish applicability. Other fixed options
// retain their question-specific meaning.
export const isUnconfirmedPrerequisite=value=>value==='unknown'||value==='not_tried';
export function fixedOption(questionId,optionId){
 return typeof questionId==='string'&&Object.hasOwn(QUESTIONS,questionId)?QUESTIONS[questionId].options.find(o=>o.id===optionId):undefined;
}
export function confirmedOptionIds(questionId){
 return typeof questionId==='string'&&Object.hasOwn(QUESTIONS,questionId)?QUESTIONS[questionId].options.map(o=>o.id).filter(v=>!isUnconfirmedPrerequisite(v)):[];
}
/** Accept duplicate legacy options as a set, but require at least one
 * confirmable known option per condition. Draft writers may require unique
 * options. Never turn malformed or unconfirmable conditions into no condition. */
export function validGuidePrerequisites(value,{requireUnique=false}={}){
 return record(value)&&Object.entries(value).every(([key,vs])=>{
  if(!Array.isArray(vs)||!vs.length||vs.length>200||requireUnique&&new Set(vs).size!==vs.length)return false;
  for(const v of vs)if(!fixedOption(key,v))return false;
  return vs.some(v=>!isUnconfirmedPrerequisite(v));
 });
}
/** Effective conjunctive conditions. Raw mapping and release fingerprints
 * must be computed from their original bytes, not from this derived view. */
export function normalizeGuidePrerequisites(value){
 if(value===undefined)return {};
 if(!validGuidePrerequisites(value))throw Error('INVALID_GUIDE_PREREQUISITES');
 return Object.fromEntries(Object.keys(value).sort().map(key=>[key,[...new Set(value[key].filter(v=>!isUnconfirmedPrerequisite(v)))].sort()]));
}
export const isUnconfirmedContextValue=v=>isUnconfirmedPrerequisite(v)||v==='other'||v==='different';
export const isUnconfirmedLearningValue=v=>isUnconfirmedContextValue(v)||v==='not_checked'||v==='unclear';

const contexts={
 mail:{domains:['mail','specific'],anchors:['task','mail_feature'],context:['send_error','send_scope','receive_scope','mail_client_scope','device_os','mail_client']},
 network:{domains:['network'],anchors:['network_issue'],context:['connection','peers','device_os']},
 portal:{domains:['specific','task'],anchors:['portal_issue'],context:['browser_scope','device_os','service_access','portal_system']},
 attendance:{domains:['specific','task'],anchors:['attendance_issue'],context:['device_os','phone']},
 collaboration:{domains:['specific','task'],anchors:['meeting_issue'],context:['device_os','phone','meeting_product','meeting_client']},
 printing:{domains:['specific','task'],anchors:['printing_issue'],context:['device_os']},
 software:{domains:['specific','task'],anchors:['software_issue'],context:['device_os']},
 device:{domains:['specific','task'],anchors:['device_issue'],context:['device_os']},
 storage:{domains:['specific','task'],anchors:['storage_issue'],context:['device_os','phone']}
};
export const REVIEWED_CONTEXT_DEFINITIONS=Object.freeze(Object.fromEntries(Object.entries(contexts).map(([service,d])=>[service,Object.freeze({domains:freezeList(d.domains),anchors:freezeList(d.anchors),context:freezeList(d.context)})])));
export const REVIEWED_CONTEXT_QUESTIONS=freezeList(['device_os','phone','browser_scope','mail_client_scope']);
export const LEARNING_SERVICES=freezeList(Object.keys(REVIEWED_CONTEXT_DEFINITIONS));
// Common boundary for ordinary intake and visual advisors only. Contextual
// reply has a separate scope; these lists do not authorize model requests.
export const ORDINARY_ADVISOR_DOMAINS=freezeList(['unknown','specific','task','network','mail']);
export const ORDINARY_ADVISOR_SERVICES=freezeList(['mail','portal','attendance','network','collaboration','storage','printing','software','device','directory']);
export const PROTECTED_ADVISOR_EVIDENCE_KEYS=freezeList(['error_signature','error_conflict','mfa_prompt','mfa_access','mfa_recovery','recovery_context','verification_context','credentials','password_intent','setup_requested']);
export const hasProtectedAdvisorEvidence=evidence=>PROTECTED_ADVISOR_EVIDENCE_KEYS.some(k=>Object.hasOwn(evidence||{},k));
