import {QUESTIONS} from './questions.mjs';
import {ORDINARY_ADVISOR_DOMAINS,ORDINARY_ADVISOR_SERVICES,hasProtectedAdvisorEvidence,fixedOption} from './diagnostic-evidence.mjs';
import {classify,normalize} from './classify.mjs';
import {sanitizeText} from './privacy.mjs';
import {recognizeErrors} from './error-intelligence.mjs';
import {isServiceId,matchServices} from './service-taxonomy.mjs';
const maxQuestions=3;
const ordinary=new Set(ORDINARY_ADVISOR_DOMAINS);
const safeServices=new Set(ORDINARY_ADVISOR_SERVICES);
const allowed={
 service:[...safeServices],task:['app','send','receive'],
 network_issue:['setup','ssid_missing','auth','no_internet','slow','only_service'],
 portal_issue:['loading','assignment','mobile_setup','request_create','request_status'],
 attendance_issue:['scan','app','permission'],
 meeting_issue:['join','audio','video','share'],
 printing_issue:['setup','offline','queued','scan'],
 software_issue:['install','update','launch'],
 device_issue:['slow','storage','display','audio','update'],
 storage_issue:['sync','space'],mail_feature:['attachment','sync','calendar'],
 portal_system:['moodle','banner','ors'],meeting_product:['zoom','teams'],
 meeting_client:['desktop','mobile','web'],mail_client:['new_windows','classic_windows','mac','ios','android','web'],
 device_os:['windows','macos','ios','android'],phone:['ios','android'],
 network_scope:['campus_student','other_network'],
 mail_client_scope:['app_only','both'],send_scope:['one','many','all'],receive_scope:['some','all'],
 browser_scope:['works','fails','other_device']
};
const related={
 network:['network_issue','network_scope','device_os'],
 portal:['portal_issue','portal_system','device_os','browser_scope'],
 attendance:['attendance_issue','phone','device_os'],
 collaboration:['meeting_issue','meeting_product','meeting_client','device_os'],
 mail:['task','mail_feature','mail_client','mail_client_scope','device_os'],
 printing:['printing_issue','device_os'],software:['software_issue','device_os'],
 device:['device_issue','device_os'],storage:['storage_issue','device_os'],directory:[]
};
const blocked=/\b(?:ignore (?:all |previous |the )?instructions|system prompt|developer message|jailbreak|reveal (?:the )?prompt|password|passcode|otp|secret|api key|access token|verification code|authenticator|mfa|exam|lockdown|administrator|account locked)\b|كلمه المرور|رمز التحقق|المصادقه|اختبار|تجاهل التعليمات|تعليمات النظام/i;
const shape=(o,ks)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k));
const bounded=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
function ordinaryState(state){
 return state&&ordinary.has(state.domain)&&['en','ar'].includes(state.language)&&Array.isArray(state.services)&&state.services.every(isServiceId)&&
  !state.pendingError&&!state.pendingContext&&!state.conflictingObservations?.length&&!state.sharedProgress&&
  !state.reviewedFactId&&!state.reviewedFactIds?.length&&!state.knowledgeChoices?.length&&!state.reviewedFactConflict&&!state.compositeAnswerGap&&
  !hasProtectedAdvisorEvidence(state.evidence);
}
function row(state,key,question){
 const permitted=allowed[key];
 if(!permitted||!question||!bounded(question.text?.[state.language],500))return null;
 const options=(question.options||[]).filter(o=>permitted.includes(o.id)&&fixedOption(key,o.id))
  .map(o=>({id:o.id,label:fixedOption(key,o.id).label[state.language]}));
 if(options.length<2||options.length>20)return null;
 return {questionId:key,question:question.text[state.language],options};
}
/** Only explicit native opt-in. Initial input is transient and never enters
 * retained state. The model sees the active question and at most two ordinary
 * possible later questions, with only fixed allowed options. */
export function prepareIntakeAdvice(state,text){
 if(!ordinaryState(state)||state.turn!==0||state.decision?.kind!=='ask'||!bounded(text,500))return {status:'not_applicable'};
 const d=state.decision,first=row(state,d.questionId,d.question);
 if(!first||Object.hasOwn(state.evidence||{},d.questionId))return {status:'not_applicable'};
 const clean=sanitizeText(text),normalized=normalize(clean.text);
 if(!clean.text||clean.categories.length||blocked.test(clean.text)||blocked.test(normalized)||recognizeErrors(clean.text).length)return {status:'blocked'};
 const signal=classify(clean.text);
 if(['identity','exam','safety','shared'].includes(signal.domain)||signal.facts?.error_conflict||signal.facts?.mfa_prompt||signal.facts?.credentials||signal.facts?.password_intent)return {status:'blocked'};
 const named=matchServices(normalized,normalize).filter(x=>!['device','network','other'].includes(x));
 if(d.questionId!=='service'&&named.some(x=>!state.services.includes(x)))return {status:'different_issue'};
 const questions=[first];
 // When the service itself is unclear do not guess a second-stage scope.
 if(d.questionId!=='service'&&state.services.length===1&&safeServices.has(state.services[0])){
  for(const key of related[state.services[0]]||[]){
   if(key===d.questionId||Object.hasOwn(state.evidence||{},key))continue;
   const candidate=row(state,key,QUESTIONS[key]);if(candidate)questions.push(candidate);
   if(questions.length>=maxQuestions)break;
  }
 }
 return {status:'ready',request:{language:state.language,services:[...state.services],currentQuestionId:d.questionId,questions,text:clean.text}};
}
export function validateIntakeAdvice(request,output){
 if(!request||!shape(output,['observations'])||!Array.isArray(output.observations)||output.observations.length>maxQuestions)return {status:'rejected'};
 if(!output.observations.length)return {status:'abstained'};
 const seen=new Set(),suggestions=[],text=' '+normalize(request.text)+' ';
 for(const item of output.observations){
  if(!shape(item,['questionId','optionId','quote'])||seen.has(item.questionId)||!bounded(item.quote,160))return {status:'rejected'};
  const question=request.questions.find(q=>q.questionId===item.questionId);
  if(!question?.options.some(o=>o.id===item.optionId))return {status:'rejected'};
  const quote=normalize(item.quote);
  if(quote.length<3||!text.includes(' '+quote+' '))return {status:'ungrounded'};
  seen.add(item.questionId);suggestions.push({questionId:item.questionId,optionId:item.optionId});
 }
 if(suggestions[0]?.questionId!==request.currentQuestionId)return {status:'abstained'};
 // A quote is not an entailment proof. Never return the raw quote, any
 // generated procedure, or an unconfirmed observation as evidence.
 return {status:'suggestions',requiresConfirmation:true,suggestions};
}
export function createDiagnosticIntakeAdvisor({enabled=false,provider,timeoutMs=3500}={}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000||enabled&&typeof provider!=='function')throw Error('INVALID_INTAKE_ADVISOR');
 let busy=false;
 async function suggest({state,text}={}){
  if(!enabled)return {status:'disabled'};
  if(busy)return {status:'busy'};
  const p=prepareIntakeAdvice(state,text);if(p.status!=='ready')return {status:p.status};
  const controller=new AbortController();let timer;
  busy=true;
  const task=Promise.resolve().then(()=>provider(p.request,{signal:controller.signal})).finally(()=>{busy=false;});
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);});
  try{const result=await Promise.race([task,timeout]);return result===null?{status:'timeout'}:validateIntakeAdvice(p.request,result);}
  catch{return {status:'unavailable'};}finally{clearTimeout(timer);}
 }
 return Object.freeze({suggest});
}
/** Revalidate minimal suggestions at the host boundary even when a trusted
 * adapter is injected. This is not approval of the actual option meaning. */
export function acceptIntakeSuggestions(request,result){
 if(!request||result?.status!=='suggestions'||result.requiresConfirmation!==true||!Array.isArray(result.suggestions)||!result.suggestions.length||result.suggestions.length>maxQuestions)return [];
 const seen=new Set(),out=[];
 for(const item of result.suggestions){
  if(!shape(item,['questionId','optionId'])||seen.has(item.questionId)||!request.questions.find(q=>q.questionId===item.questionId)?.options.some(o=>o.id===item.optionId))return [];
  seen.add(item.questionId);out.push({questionId:item.questionId,optionId:item.optionId});
 }
 return out[0]?.questionId===request.currentQuestionId?out:[];
}
export function currentIntakeSuggestion(state,queue){
 if(!ordinaryState(state)||state.decision?.kind!=='ask'||!queue?.length)return null;
 const q=queue[0];
 if(q.questionId!==state.decision.questionId||Object.hasOwn(state.evidence||{},q.questionId)||
 !state.decision.question.options.some(o=>o.id===q.optionId)||!allowed[q.questionId]?.includes(q.optionId))return null;
 return {...q,requiresConfirmation:true};
}
/** Only an explicit current fixed choice matching the displayed suggestion
 * may carry remaining initial suggestions forward. Drop them on typed replies,
 * undo, scope/stage changes, conflicting evidence or a different choice. */
export function advanceIntakeSuggestions({before,after,queue,choice}={}){
 const first=currentIntakeSuggestion(before,queue);
 if(!first||!choice||choice.questionId!==first.questionId||choice.optionId!==first.optionId||
 after?.turn!==before.turn+1||!ordinaryState(after)||after.decision?.kind!=='ask'||
 before.domain!==after.domain||before.services.join(':')!==after.services.join(':'))return [];
 const remaining=queue.slice(1).filter(x=>!Object.hasOwn(after.evidence||{},x.questionId));
 const next=remaining.find(x=>x.questionId===after.decision.questionId);
 if(!next)return [];
 const ordered=[next,...remaining.filter(x=>x!==next)];
 return currentIntakeSuggestion(after,ordered)?ordered:[];
}
