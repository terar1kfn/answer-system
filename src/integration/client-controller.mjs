import {getErrorSignature} from '../error-intelligence.mjs';
import {isNativeGuideReference,publicNativeGuideReference} from './guide-continuation.mjs';
// Browser-side native assistant lifecycle. Transport and native navigation
// are injected by the host. No new endpoint, auth store, timer or framework.
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const lang=x=>['en','ar'].includes(x);
const opaque=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const bounded=(x,n)=>typeof x==='string'&&x.length<=n;
const version=x=>Number.isSafeInteger(x)&&x>=0;
const decisionKinds=new Set(['ask','open_guide','offer_support','offer_mfa_recovery','incident_notice','safety_referral','resolved_reported','answer']);
const resultKinds=new Set(['state','clarify','delegate','open_native_guide','open_native_draft','existing_native_request','native_request_unconfirmed','recovery_pending','native_guide_pending','native_guide_returned']);
const BILINGUAL=x=>x&&bounded(x.en,2000)&&bounded(x.ar,2000);
const QUESTION=q=>q&&BILINGUAL(q.text)&&Array.isArray(q.options)&&q.options.length>0&&q.options.length<=32&&q.options.every(o=>opaque(o.id)&&BILINGUAL(o.label))&&new Set(q.options.map(o=>o.id)).size===q.options.length;
const effectByAction=Object.freeze({
 read:['state','delegate'],begin:['state','clarify','delegate'],respond:['state','clarify','delegate'],
 undo:['state','delegate'],clear:['state','delegate'],set_language:['state','delegate'],
 open_guide:['open_native_guide','delegate'],
 refresh_native_guide:['native_guide_pending','native_guide_returned','delegate'],
 prepare_native_draft:['open_native_draft','existing_native_request','native_request_unconfirmed','delegate'],
 refresh_recovery:['state','recovery_pending','delegate'],screenshot_advice:['clarify','delegate']
});
const bilingual=x=>({en:x.en,ar:x.ar});
const question=q=>({text:bilingual(q.text),options:q.options.map(o=>({id:o.id,label:bilingual(o.label)}))});
const code=x=>typeof x==='string'&&/^[A-Z0-9_]{1,100}$/.test(x);
const steps=(reached,total)=>Number.isSafeInteger(total)&&total>=1&&total<=200&&Number.isSafeInteger(reached)&&reached>=0&&reached<=total;
/** Explicit public projection: unknown response fields do not become retained
 * browser state or native-navigation arguments. Only the trusted transport
 * may supply this view; validation is not a substitute for host authority. */
function publicIssue(issue){
 const d=issue.decision,decision={kind:d.kind};
 for(const k of ['questionId','guideId','factId','sourceRef','serviceId','incidentRef','status']){
  if(bounded(d[k],200))decision[k]=d[k];
 }
 for(const k of ['reasonCode','policyCode'])if(code(d[k]))decision[k]=d[k];
 for(const k of ['title','answer'])if(BILINGUAL(d[k]))decision[k]=bilingual(d[k]);
 if(d.kind==='ask')decision.question=question(d.question);
 if(['open_guide','answer'].includes(d.kind))decision.followUp={questionId:'outcome',question:question(d.followUp.question)};
 let guideContinuation=null;
 const g=issue.guideContinuation;
 if(d.kind==='open_guide'&&g&&g.guideId===d.guideId&&['offered','awaiting_native_return','returned'].includes(g.status)){
  if(g.status==='returned'){
   if(!steps(g.reachedStep,g.totalSteps))fail('INVALID_NATIVE_REFERENCE');
   guideContinuation={status:g.status,guideId:g.guideId,progressScope:g.progressScope==='root_resolution'?'root_resolution':'unconfirmed',reachedStep:g.reachedStep,totalSteps:g.totalSteps};
  }else guideContinuation={status:g.status,guideId:g.guideId};
 }
 return {issueId:issue.issueId,language:issue.language,status:issue.status,decision,guideContinuation,canUndo:issue.canUndo===true};
}
function publicJourney(j){
 if(!j||typeof j!=='object'||Array.isArray(j))return {};
 const out={};
 for(const k of ['service','app','device','os','errorMessage'])if(bounded(j[k],200))out[k]=j[k];
 if(lang(j.language))out.language=j.language;
 if(['started','not-started','unknown'].includes(j.examStatus))out.examStatus=j.examStatus;
 if(Array.isArray(j.answers))out.answers=j.answers.slice(-25).filter(a=>bounded(a?.question,200)&&bounded(a?.answer,200)).map(a=>({question:a.question,answer:a.answer}));
 if(Array.isArray(j.guides))out.guides=j.guides.slice(-10).filter(g=>opaque(g?.guideId)&&bounded(g.title,200)&&steps(g.reachedStep,g.totalSteps)).map(g=>({guideId:g.guideId,title:g.title,reachedStep:g.reachedStep,totalSteps:g.totalSteps}));
 return out;
}
function readView(result){
 if(!result||!resultKinds.has(result.kind)||!version(result.version)||!(result.issue===null||result.issue&&opaque(result.issue.issueId)&&lang(result.issue.language)&&bounded(result.issue.status,100)))fail('INVALID_BRIDGE_RESPONSE');
 const issue=result.issue;
 if(issue){
  const d=issue.decision;
  if(!d||!decisionKinds.has(d.kind))fail('INVALID_BRIDGE_DECISION');
  if(d.kind==='ask'&&(!opaque(d.questionId)||!QUESTION(d.question)))fail('INVALID_BRIDGE_QUESTION');
  if(d.kind==='open_guide'&&(!opaque(d.guideId)||!BILINGUAL(d.title)||d.followUp?.questionId!=='outcome'||!QUESTION(d.followUp.question)))fail('INVALID_BRIDGE_GUIDE');
  if(d.kind==='answer'&&(!BILINGUAL(d.title)||!BILINGUAL(d.answer)||d.followUp?.questionId!=='outcome'||!QUESTION(d.followUp.question)))fail('INVALID_BRIDGE_ANSWER');
 }
 return {version:result.version,issue:issue?publicIssue(issue):null};
}
function currentQuestion(issue){
 const d=issue?.decision;
 if(d?.kind==='ask')return {id:d.questionId,question:d.question};
 if(['open_guide','answer'].includes(d?.kind))return {id:d.followUp.questionId,question:d.followUp.question};
 return null;
}
function readEffect(result){
 if(result.kind==='delegate')return {kind:'delegate',reason:bounded(result.reason,100)?result.reason:'NATIVE_FALLBACK'};
 if(result.kind==='clarify'){
  const effect={kind:'clarify',reasonCode:bounded(result.reasonCode,100)?result.reasonCode:'FREE_TEXT_NOT_UNAMBIGUOUS'};
  const q=currentQuestion(result.issue),s=result.suggestion;
  if(s&&s.requiresConfirmation===true&&s.questionId===q?.id&&q.question.options.some(o=>o.id===s.optionId))effect.suggestion={questionId:s.questionId,optionId:s.optionId,requiresConfirmation:true};
  else if(effect.reasonCode==='CONFIRM_INTERPRETED_REPLY')effect.reasonCode='FREE_TEXT_NOT_UNAMBIGUOUS';
  if(effect.reasonCode==='CONFIRM_SCREENSHOT_ERROR'){
   const hint=result.errorSuggestion,error=getErrorSignature(hint?.signatureId);
   if(q&&hint?.requiresConfirmation===true&&error?.serviceId==='mail'&&error.code===hint.code)effect.errorSuggestion={signatureId:error.id,code:error.code,requiresConfirmation:true};
   else effect.reasonCode='SCREENSHOT_NO_SUGGESTION';
  }
  if(effect.reasonCode==='CONFIRM_SCREENSHOT_OBSERVATION'&&!effect.suggestion)effect.reasonCode='SCREENSHOT_NO_SUGGESTION';
  return effect;
 }
 if(result.kind==='open_native_guide'){
  const ref=result.reference;
  if(!opaque(result.launchRef)||!isNativeGuideReference(ref)||result.issue?.decision?.kind!=='open_guide'||ref.guideId!==result.issue.decision.guideId)fail('INVALID_NATIVE_REFERENCE');
  return {kind:result.kind,reference:publicNativeGuideReference(ref),launchRef:result.launchRef,issueId:result.issue.issueId};
 }
 if(['open_native_draft','existing_native_request','native_request_unconfirmed'].includes(result.kind)){
  const d=result.issue?.decision;
  if(!['offer_support','offer_mfa_recovery'].includes(d?.kind)||result.channel!==(d.kind==='offer_mfa_recovery'?'mfa_recovery':'support'))fail('INVALID_NATIVE_CHANNEL');
  if(result.kind==='existing_native_request'&&!opaque(result.reference))fail('INVALID_NATIVE_REFERENCE');
  return {kind:result.kind,channel:result.channel,...(result.kind==='open_native_draft'?{reasonCode:code(result.reasonCode)?result.reasonCode:result.issue.decision.reasonCode??'NATIVE_FALLBACK',journey:publicJourney(result.journey)}:{}),...(result.kind==='existing_native_request'?{reference:result.reference}:{})};
 }
 return {kind:result.kind};
}
/**
 * Controller is deliberately single-flight. Stopping a fetch does not prove
 * the server stopped; after an uncertain response the next operation must be a
 * read. Never retry a mutation automatically or replay a native support draft.
 * onEffect receives only a guarded native-navigation intent, not a ticket/reset
 * command. Host must check isCurrent() immediately before applying any result.
 */
export function createEmbeddedAssistantController({request,onChange=()=>{},onEffect=async()=>{},recordActivity=()=>{}}={}){
 if(![request,onChange,onEffect,recordActivity].every(f=>typeof f==='function'))fail('EMBEDDED_CLIENT_HOOKS_REQUIRED');
 let visitKey=null,language='en',generation=0,flight=null,view={version:0,issue:null},needsRefresh=true,disposed=false,hasView=false;
 const snapshot=()=>({bound:visitKey!==null,language,pending:Boolean(flight),needsRefresh,version:view.version,issue:copy(view.issue)});
 const emit=()=>onChange(snapshot());
 function invalidate({clear=false}={}){
  generation++;flight?.abort();flight=null;needsRefresh=true;
  if(clear){view={version:0,issue:null};hasView=false;}
 }
 function bindVisit(key,langCode='en'){
  if(disposed)fail('CLIENT_DISPOSED');
  if(!(key===null||opaque(key))||!lang(langCode))fail('INVALID_CLIENT_CONTEXT');
  if(key!==visitKey){invalidate({clear:true});visitKey=key;}
  if(language!==langCode){invalidate();language=langCode;}
  emit();
 }
 function assertBound(){
  if(disposed||visitKey===null)fail('VISIT_NOT_ACTIVE');
  if(flight)fail('CLIENT_BUSY');
 }
 async function execute(command,{userAction=true}={}){
  assertBound();
  if(needsRefresh&&command.action!=='read')return {kind:'refresh_required'};
  const g=++generation,key=visitKey,controller=new AbortController();flight=controller;
  const isCurrent=()=>!disposed&&generation===g&&visitKey===key&&!controller.signal.aborted;
  try{
   // Trusted UI callbacks can synchronously rebind/stop the controller or
   // fail. Never start transport after such a cancellation.
   emit();if(!isCurrent())return {kind:'stale'};
   if(userAction)recordActivity();
   if(!isCurrent())return {kind:'stale'};
   // request() uses the existing native authenticated transport. A UI visit
   // key is only a local cancellation boundary, not a credential or role.
   const result=await request(copy(command),{signal:controller.signal});
   if(!isCurrent())return {kind:'stale'};
   if(!effectByAction[command.action]?.includes(result?.kind))fail('INVALID_BRIDGE_RESPONSE');
   const next=readView(result);
   if(hasView&&(next.version<view.version||next.version===view.version&&next.issue?.issueId!==view.issue?.issueId))fail('STALE_BRIDGE_RESPONSE');
   if(command.issueId&&next.issue&&next.issue.issueId!==command.issueId)fail('STALE_BRIDGE_RESPONSE');
   if(command.issueId&&!next.issue&&command.action!=='clear'&&result.kind!=='delegate')fail('INVALID_BRIDGE_RESPONSE');
   if(result.kind==='delegate'&&next.issue!==null)fail('INVALID_BRIDGE_RESPONSE');
   const effect=readEffect({...result,issue:next.issue});
   view=next;hasView=true;needsRefresh=false;
   // A host language switch uses this same controller rather than mutating
   // global app direction or retaining language between kiosk visits.
   if(view.issue)language=view.issue.language;
   emit();if(!isCurrent())return {kind:'stale'};
   if(effect.kind!=='state'){
    await onEffect(copy(effect),{signal:controller.signal,isCurrent,issueId:view.issue?.issueId??null,version:view.version});
    if(!isCurrent())return {kind:'stale'};
   }
   return effect;
  }catch(e){
   if(!isCurrent())return {kind:'stale'};
   // Even a timeout can follow a completed server mutation. Read state before
   // allowing another action, not a speculative fallback or resubmission.
   needsRefresh=true;return {kind:'unavailable',reasonCode:bounded(e?.message,100)&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'BRIDGE_UNAVAILABLE'};
  }finally{if(isCurrent()){flight=null;try{emit();}catch{/* rendering failure must not strand the transport lock */}}}
 }
 const mutation=(action,fields={})=>{
  assertBound();if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  if(!view.issue)fail('ISSUE_NOT_ACTIVE');
  return execute({action,expectedVersion:view.version,issueId:view.issue.issueId,...fields});
 };
 function refresh(){return execute({action:'read'},{userAction:false});}
 function begin(text){
  if(!bounded(text,500)||!text.trim())fail('INVALID_QUERY');
  return execute({action:'begin',expectedVersion:view.version,text:text.trim(),language});
 }
 function choose(questionId,optionId){
  if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  const q=currentQuestion(view.issue);
  if(q?.id!==questionId||!q.question.options.some(o=>o.id===optionId))fail('STALE_CLIENT_CHOICE');
  return mutation('respond',{questionId,optionId});
 }
 function reply(text){
  if(!bounded(text,500)||!text.trim())fail('INVALID_QUERY');
  if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  if(!currentQuestion(view.issue))fail('QUESTION_NOT_ACTIVE');
  return mutation('respond',{text:text.trim()});
 }
 function requestScreenshotAdvice(screenshotRef){
  if(typeof screenshotRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(screenshotRef))fail('INVALID_SCREENSHOT_REFERENCE');
  if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  if(view.issue?.decision?.kind!=='ask')fail('QUESTION_NOT_ACTIVE');
  return mutation('screenshot_advice',{screenshotRef});
 }
 function openGuide(){
  if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  const d=view.issue?.decision;
  if(d?.kind!=='open_guide')fail('NATIVE_GUIDE_NOT_OFFERED');
  return mutation('open_guide',{guideId:d.guideId});
 }
 function refreshGuide(){return mutation('refresh_native_guide');}
 function requestDraft(){
  if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  if(!['offer_support','offer_mfa_recovery'].includes(view.issue?.decision?.kind))fail('NATIVE_DRAFT_NOT_OFFERED');
  return mutation('prepare_native_draft');
 }
 function refreshRecovery(){return mutation('refresh_recovery');}
 function changeLanguage(value){
  if(!lang(value))fail('INVALID_LANGUAGE');
  assertBound();
  if(needsRefresh)return Promise.resolve({kind:'refresh_required'});
  if(!view.issue){language=value;emit();return Promise.resolve({kind:'state'});}
  return mutation('set_language',{language:value});
 }
 function stop(){invalidate();emit();}
 function dispose(){invalidate({clear:true});disposed=true;visitKey=null;emit();}
 return Object.freeze({bindVisit,refresh,begin,choose,reply,requestScreenshotAdvice,openGuide,refreshGuide,requestDraft,refreshRecovery,changeLanguage,
  undo:()=>mutation('undo'),clear:()=>mutation('clear'),stop,dispose,snapshot});
}
