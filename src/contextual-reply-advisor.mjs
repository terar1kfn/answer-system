import {QUESTIONS} from './questions.mjs';
import {createAdviceCoordinator} from './advice-coordinator.mjs';
import {fixedOption as knownOption,isUnconfirmedPrerequisite} from './diagnostic-evidence.mjs';
import {classify,normalize} from './classify.mjs';
import {sanitizeText} from './privacy.mjs';
import {readInitialObservations} from './observation-intake.mjs';
import {recognizeErrors} from './error-intelligence.mjs';
import {isServiceId,matchServices} from './service-taxonomy.mjs';
const ADVISABLE=new Set([
 'task','shared_operation','shared_access_pattern','connection','peers','service_access','device_os','phone','browser_scope','portal_system','meeting_product','meeting_client','mail_client',
 'network_issue','portal_issue','attendance_issue','meeting_issue','printing_issue','software_issue','device_issue','storage_issue','mail_feature',
 'send_scope','receive_scope','mail_client_scope','retry_mail_scope','retry_network_scope','retry_attendance_detail','retry_meeting_scope',
 'retry_software_detail','retry_storage_detail','retry_printer_detail'
]);
const CONTEXT_KEYS=['task','shared_operation','network_issue','portal_issue','attendance_issue','meeting_issue','printing_issue','software_issue','device_issue','storage_issue','mail_feature','device_os','phone','connection','service_access','browser_scope','send_scope','receive_scope','mail_client_scope'];
const block=/\b(?:ignore (?:all |previous |the )?instructions|system prompt|developer message|assistant role|jailbreak|reveal (?:the )?prompt|password|passcode|otp|secret|api key|access token|verification code)\b|كلمه المرور|رمز التحقق|تجاهل التعليمات|تعليمات النظام/i;
const textOk=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
/** Only the authoritative current question and fixed existing observations
 * enter the model context. No previous raw text, guide content or identity. */
export function prepareReplyAdvice(state,text){
 if(!state||!['en','ar'].includes(state.language)||!Array.isArray(state.services)||!state.services.length||
 !state.services.every(isServiceId)||['safety','exam','unknown'].includes(state.domain)||!state.evidence||
 state.pendingError||state.pendingContext||state.conflictingObservations?.length||state.evidence.error_conflict||state.evidence.error_signature||
 state.evidence.mfa_prompt?.value==='unexpected'||state.evidence.credentials?.value==='locked'||
 state.evidence.send_error?.value==='restricted')return {status:'protected_or_uncertain'};
 const d=state.decision,qid=d?.questionId;
 if(d?.kind!=='ask'||!ADVISABLE.has(qid)||!Object.hasOwn(QUESTIONS,qid)||d.reasonCode==='CONFLICTING_OBSERVATIONS')return {status:'not_applicable'};
 if(!textOk(text,320))return {status:'invalid'};
 const clean=sanitizeText(text,{max:320}),normalized=normalize(clean.text);
 if(!clean.text||clean.categories.length||block.test(clean.text)||block.test(normalized)||recognizeErrors(clean.text).length)return {status:'blocked'};
 const signal=classify(clean.text);
 if(['safety','exam'].includes(signal.domain)||signal.facts.mfa_prompt==='unexpected'||signal.facts.error_conflict)return {status:'blocked'};
 const named=matchServices(normalized,normalize).filter(id=>!['identity','network','device','other'].includes(id));
 if(named.some(id=>!state.services.includes(id)))return {status:'different_issue'};
 const observations=readInitialObservations(clean.text).observations;
 const observed=new Map();
 for(const {key,value} of observations){
  if(observed.has(key)&&observed.get(key)!==value)return {status:'conflicting'};
  if(key!==qid&&state.evidence[key]&&state.evidence[key].value!=='unknown'&&state.evidence[key].value!==value)return {status:'conflicting'};
  observed.set(key,value);
 }
 const allowed=(d.question?.options||[]).flatMap(o=>{
  const canonical=knownOption(qid,o.id);
  return canonical&&safeId(o.id)?[{id:o.id,label:canonical.label[state.language]}]:[];
 });
 if(allowed.length<2||allowed.length>20||new Set(allowed.map(o=>o.id)).size!==allowed.length)return {status:'invalid'};
 const context=[];
 for(const key of CONTEXT_KEYS){
  if(key===qid)continue;
  const value=state.evidence[key]?.value,option=knownOption(key,value);
  if(!option||isUnconfirmedPrerequisite(value))continue;
  context.push({questionId:key,optionId:value,label:option.label[state.language]});
  if(context.length===8)break;
 }
 return {status:'ready',request:{questionId:qid,question:QUESTIONS[qid].text[state.language],language:state.language,services:[...state.services],context,options:allowed,text:clean.text}};
}
export function validateReplyAdvice(request,output){
 if(!request||!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).length!==2||
 !Object.hasOwn(output,'optionId')||!Object.hasOwn(output,'quote'))return {status:'rejected'};
 if(output.optionId==='abstain')return output.quote===''?{status:'abstained'}:{status:'rejected'};
 if(!request.options.some(o=>o.id===output.optionId)||!textOk(output.quote,200))return {status:'rejected'};
 const quote=normalize(output.quote),text=normalize(request.text);
 // A quote is evidence that words were present, not proof that they entail
 // the suggested option. The student must still explicitly select that option.
 if(quote.length<3||!(' '+text+' ').includes(' '+quote+' '))return {status:'ungrounded'};
 return {status:'suggestion',questionId:request.questionId,optionId:output.optionId,requiresConfirmation:true};
}
/** Disabled by default; one inference at a time, no automatic decision. */
export function createContextualReplyAdvisor({enabled=false,provider,timeoutMs=2500,coordinator=createAdviceCoordinator()}={}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000||
 enabled&&typeof provider!=='function'||typeof coordinator?.run!=='function')throw Error('INVALID_CONTEXTUAL_ADVISOR');
 let busy=false;
 async function suggest({state,text,signal}={}){
  if(!enabled)return {status:'disabled'};
  if(busy)return {status:'busy'};
  const prepared=prepareReplyAdvice(state,text);
  if(prepared.status!=='ready')return {status:prepared.status};
  try{
   const result=await coordinator.run(async({signal:providerSignal})=>{
    if(busy)throw Error('ADVISOR_BUSY');
    busy=true;
    try{return await provider(prepared.request,{signal:providerSignal});}
    finally{busy=false;}
   },{signal,timeoutMs});
   return result.status==='completed'&&result.value!==null?validateReplyAdvice(prepared.request,result.value):{status:['completed','timeout'].includes(result.status)?'unavailable_or_timeout':result.status};
  }catch{return {status:'unavailable'};}
 }
 return Object.freeze({suggest});
}
