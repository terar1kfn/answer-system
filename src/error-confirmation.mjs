import {getErrorSignature,recognizeErrors} from './error-intelligence.mjs';
import {sanitizeText} from './privacy.mjs';
import {classify,normalize} from './classify.mjs';
import {matchServices} from './service-taxonomy.mjs';
import {restartSharedProgressDiagnosis} from './shared-progress.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const SIGN_IN_SERVICES=new Set(['identity','mail','portal','attendance','collaboration','storage']);
const MAX_CONFIRMATIONS=3;
/** Pasted codes are proposals, not verified root causes. No raw text retained. */
export function proposeCurrentError(state,text){
 if(!state||['safety','exam'].includes(state.domain)||state.pendingError||state.pendingContext||state.reviewedFactId||state.reviewedFactIds?.length||
  !['ask','open_guide'].includes(state.decision?.kind))return {kind:'none'};
 let clean;try{clean=sanitizeText(text);}catch{return {kind:'none'};}
 if(clean.categories.length||!clean.text)return {kind:'none'};
 const intent=classify(clean.text);
 if(['safety','exam'].includes(intent.domain)||intent.facts.mfa_prompt==='unexpected')return {kind:'none'};
 const hints=recognizeErrors(clean.text);
 if(!hints.length)return {kind:'none'};
 if(hints.length>1)return {kind:'clarify',reasonCode:'MULTIPLE_CURRENT_ERRORS'};
 const hint=hints[0];
 if(state.evidence.error_signature?.value===hint.id)return {kind:'clarify',reasonCode:'ERROR_ALREADY_RECORDED'};
 const named=matchServices(normalize(clean.text),normalize).filter(id=>!['identity','network','device','other'].includes(id));
 const compatible=hint.serviceId==='identity'?state.services.length>0&&state.services.every(s=>SIGN_IN_SERVICES.has(s)):
  hint.serviceId==='mail'&&state.services.length===1&&state.services[0]==='mail';
 if(!compatible||named.some(id=>!state.services.includes(id)))return {kind:'clarify',reasonCode:'ERROR_SCOPE_UNCONFIRMED'};
 if((state.errorConfirmationCount||0)>=MAX_CONFIRMATIONS||state.turn>=23)return {kind:'clarify',reasonCode:'ERROR_CONFIRMATION_LIMIT'};
 if((state.dismissedErrorSignatures||[]).includes(hint.id))return {kind:'clarify',reasonCode:'ERROR_ALREADY_DISMISSED'};
 return {kind:'propose',signatureId:hint.id};
}
export function currentErrorQuestion(signatureId){
 const hint=getErrorSignature(signatureId);if(!hint)throw Error('UNKNOWN_ERROR_SIGNATURE');
 const signIn=hint.serviceId==='identity';
 return {text:{
  en:'Is '+hint.code+' shown now when '+(signIn?'signing in to the original affected service':'sending an email for the original problem')+' on your affected device? Do not share a verification code or password.',
  ar:'هل يظهر '+hint.code+' الآن عند '+(signIn?'تسجيل الدخول إلى الخدمة الأصلية المتأثرة':'إرسال البريد المرتبط بالمشكلة الأصلية')+' على جهازك المتأثر؟ لا تشارك رمز التحقق أو كلمة المرور.'
 },options:[
  {id:'yes',label:{en:'Yes, this is the current error for that task',ar:'نعم، هذا هو الخطأ الحالي لهذه المهمة'}},
  {id:'no',label:{en:'No, it was from an earlier or different task',ar:'لا، كان من مهمة سابقة أو مختلفة'}},
  {id:'unknown',label:{en:'I am not sure',ar:'لست متأكداً'}}
 ]};
}
export function stageCurrentError(state,signatureId){
 const s=clone(state);s.pendingError={signatureId,priorDecision:clone(state.decision)};
 s.errorConfirmationCount=(s.errorConfirmationCount||0)+1;s.turn++;return s;
}
export function completeCurrentError(state,optionId){
 const pending=state.pendingError;
 if(!pending||!['yes','no','unknown'].includes(optionId))throw Error('INVALID_ERROR_CONFIRMATION');
 const hint=getErrorSignature(pending.signatureId);if(!hint)throw Error('UNKNOWN_ERROR_SIGNATURE');
 const s=clone(state);s.turn++;delete s.pendingError;
 s.lastErrorConfirmation={signatureId:hint.id,choice:optionId,turn:s.turn};
 if(optionId!=='yes'){
  s.dismissedErrorSignatures=[...new Set([...(s.dismissedErrorSignatures||[]),hint.id])].slice(-MAX_CONFIRMATIONS);
  if(pending.priorDecision.kind==='ask')s.askedQuestionIds=s.askedQuestionIds.filter(id=>id!==pending.priorDecision.questionId);
  if(pending.priorDecision.kind==='open_guide')s.offeredGuideIds=s.offeredGuideIds.filter(id=>id!==pending.priorDecision.guideId);
  return s;
 }
 // A confirmed code is a new observation about the affected operation.
 // Earlier credentials/MFA/client observations may be stale. Preserve only
 // verified recovery provenance, previous offers and actual attempt history.
 const verifiedRecovery=s.evidence.mfa_recovery?.origin==='staff_verified'?s.evidence.mfa_recovery:null;
 s.errorEvidenceHistory=[...(s.errorEvidenceHistory||[]),...(s.evidence.error_signature?[{signatureId:s.evidence.error_signature.value,turn:state.turn}]:[])].slice(-3);
 s.evidence={task:{value:hint.serviceId==='identity'?'login':'send',origin:'student_report'},error_signature:{value:hint.id,origin:'student_confirmed_error'}};
 if(verifiedRecovery)s.evidence.mfa_recovery=verifiedRecovery;
 s.domain=hint.serviceId==='identity'?'identity':'mail';
 if(hint.serviceId==='mail'){
  const error={recipient_address:'address',sender_restricted:'restricted',message_size:'size'}[hint.stage];
  if(error)s.evidence.send_error={value:error,origin:'student_confirmed_error'};
 }
 s.askedQuestionIds=[];s.conflictingObservations=[];
 delete s.activeAlternative;delete s.lastGuidePurpose;delete s.reviewedFactId;delete s.reviewedFactIds;delete s.reviewedFactConflict;delete s.compositeAnswerGap;delete s.knowledgeChoices;
 restartSharedProgressDiagnosis(s);s.requestKind='fault';return s;
}
