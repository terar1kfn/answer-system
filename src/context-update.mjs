import {QUESTIONS} from './questions.mjs';
import {sanitizeText} from './privacy.mjs';
import {classify} from './classify.mjs';
import {readInitialObservations} from './observation-intake.mjs';
import {collectOperationContext} from './operation-context.mjs';
import {recognizeErrors} from './error-intelligence.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const contextKeys={
 network:new Set(['connection','peers','network_scope','device_os']),
 mail:new Set(['mail_client_scope','mail_client','device_os']),
 specific:new Set(['connection','service_access','browser_scope','mail_client_scope','mail_client','meeting_client','device_os','phone']),
 identity:new Set(['connection','peers','service_access','network_scope','device_os','phone'])
};
const dependents={
 connection:['peers','service_access','browser_scope','mail_client_scope','post_signin_stage'],
 network_scope:['connection','peers','network_issue','browser_scope','service_access','mail_client_scope','post_signin_stage'],
 device_os:['connection','peers','network_issue','browser_scope','service_access','mail_client_scope','mail_client','meeting_client','post_signin_stage'],
 phone:['device_os','attendance_permission_kind','attendance_issue'],
 mail_client:['mail_client_scope'],
 mail_client_scope:[],meeting_client:[],peers:[],browser_scope:[],service_access:['post_signin_stage']
};
const option=(key,value)=>QUESTIONS[key]?.options.find(o=>o.id===value);
const safeOrigin=e=>!e||['student_report','student_text_signal','student_confirmed_context'].includes(e.origin);
/** Exact observations only; no raw reply, no automatic change of account,
 * credentials, MFA state, service ownership or a previous guide outcome. */
export function proposeContextUpdate(state,text){
 const allowed=contextKeys[state?.domain],d=state?.decision;
 if(!allowed||d?.kind!=='ask'||state.pendingError||state.pendingContext||
 (state.sharedProgress&&!['initial','focused'].includes(state.sharedProgress.phase))||
 state.reviewedFactId||state.reviewedFactIds?.length||state.knowledgeChoices?.length||
 state.evidence?.error_signature||state.evidence?.error_conflict||
 state.evidence?.outcome||state.activeAlternative||state.guideAttempts?.length||
 state.offeredGuideIds?.length||state.evidence?.credentials?.value==='locked'||
 state.evidence?.mfa_prompt?.value==='unexpected'||state.evidence?.mfa_recovery||
 state.evidence?.recovery_context)return {kind:'none'};
 let clean;try{clean=sanitizeText(text);}catch{return {kind:'none'};}
 if(!clean.text||clean.categories.length||recognizeErrors(clean.text).length)return {kind:'none'};
 const intent=classify(clean.text);
 if(['safety','exam'].includes(intent.domain)||intent.facts.error_conflict||
 intent.services.some(s=>!state.services.includes(s)&&!['other','device','network'].includes(s)))return {kind:'none'};
 const initial=readInitialObservations(clean.text);
 const matches=initial.remaining?[]:initial.observations;
 const explicit=collectOperationContext(clean.text,{domain:state.domain,services:state.services,facts:{}});
 // The platform collector can match a clause in a longer reply; require a
 // single clause here so an unrelated symptom cannot disappear.
 const platform=/[,;\n!?]/.test(clean.text.replace(/[.!?]$/,''))?[]:Object.entries(explicit).map(([key,value])=>({key,value}));
 const distinct=[...new Map([...matches,...platform].map(x=>[x.key+':'+x.value,x])).values()];
 if(distinct.length!==1)return {kind:'none'};
 const {key,value}=distinct[0],previous=state.evidence[key];
 if(!allowed.has(key)||key===d.questionId||!option(key,value)||['unknown','not_tried'].includes(value)||!safeOrigin(previous))return {kind:'none'};
 if(previous?.value===value)return {kind:'clarify',reasonCode:'CONTEXT_ALREADY_RECORDED'};
 if((state.contextConfirmationCount||0)>=2||state.turn>=23)return {kind:'clarify',reasonCode:'CONTEXT_CONFIRMATION_LIMIT'};
 if((dependents[key]||[]).some(k=>!safeOrigin(state.evidence[k])))return {kind:'none'};
 return {kind:'propose',key,value};
}
export function contextUpdateQuestion(pending){
 const q=QUESTIONS[pending?.key],o=option(pending?.key,pending?.value);
 if(!q||!o)throw Error('INVALID_CONTEXT_UPDATE');
 return {text:{
 en:'Is this your current situation for the original problem? '+q.text.en+' — '+o.label.en,
 ar:'هل هذه حالتك الحالية للمشكلة الأصلية؟ '+q.text.ar+' — '+o.label.ar
 },options:[
 {id:'yes',label:{en:'Yes, use this current observation',ar:'نعم، استخدم هذه المعلومة الحالية'}},
 {id:'no',label:{en:'No, keep the previous information',ar:'لا، احتفظ بالمعلومات السابقة'}},
 {id:'unknown',label:{en:'Not sure',ar:'غير متأكد'}}
 ]};
}
export function stageContextUpdate(state,proposal){
 const s=copy(state);s.pendingContext={key:proposal.key,value:proposal.value,priorQuestionId:state.decision.questionId};
 s.contextConfirmationCount=(s.contextConfirmationCount||0)+1;s.turn++;return s;
}
export function completeContextUpdate(state,choice){
 const p=state.pendingContext;
 if(!p||!['yes','no','unknown'].includes(choice)||!option(p.key,p.value))throw Error('INVALID_CONTEXT_UPDATE');
 const s=copy(state);s.turn++;delete s.pendingContext;
 s.lastContextConfirmation={key:p.key,value:p.value,choice,turn:s.turn};
 // The interrupted question was not answered. It may be asked again.
 s.askedQuestionIds=s.askedQuestionIds.filter(k=>k!==p.priorQuestionId);
 if(choice!=='yes')return s;
 const stale=(dependents[p.key]||[]).filter(k=>Object.hasOwn(s.evidence,k));
 const prior=s.evidence[p.key]?.value;
 s.contextUpdateHistory=[...(s.contextUpdateHistory||[]),{key:p.key,...(prior!==undefined?{previous:prior}:{}),current:p.value,invalidatedKeys:stale,turn:s.turn}].slice(-2);
 for(const k of stale)delete s.evidence[k];
 s.askedQuestionIds=s.askedQuestionIds.filter(k=>k!==p.key&&!stale.includes(k));
 s.conflictingObservations=(s.conflictingObservations||[]).filter(k=>k!==p.key&&!stale.includes(k));
 s.evidence[p.key]={value:p.value,origin:'student_confirmed_context'};
 return s;
}
