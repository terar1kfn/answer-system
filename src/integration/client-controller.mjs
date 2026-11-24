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
 return {version:result.version,issue:copy(issue)};
}
function currentQuestion(issue){
 const d=issue?.decision;
 if(d?.kind==='ask')return {id:d.questionId,question:d.question};
 if(['open_guide','answer'].includes(d?.kind))return {id:d.followUp.questionId,question:d.followUp.question};
 return null;
}
function readEffect(result){
 if(result.kind==='delegate')return {kind:'delegate',reason:bounded(result.reason,100)?result.reason:'NATIVE_FALLBACK'};
 if(result.kind==='clarify')return {kind:'clarify',reasonCode:bounded(result.reasonCode,100)?result.reasonCode:'FREE_TEXT_NOT_UNAMBIGUOUS'};
 if(result.kind==='open_native_guide'){
  const ref=result.reference;
  if(!opaque(result.launchRef)||!opaque(ref?.guideId)||!opaque(ref.nativeServiceId)||!opaque(ref.catalogRevision)||!bounded(ref.sourceRevision,160)||!bounded(ref.nativeGuideFingerprint,64)||ref.guideId!==result.issue?.decision?.guideId)fail('INVALID_NATIVE_REFERENCE');
  return {kind:result.kind,reference:copy(ref),launchRef:result.launchRef,issueId:result.issue.issueId};
 }
 if(['open_native_draft','existing_native_request','native_request_unconfirmed'].includes(result.kind)){
  if(!['support','mfa_recovery'].includes(result.channel))fail('INVALID_NATIVE_CHANNEL');
  if(result.kind==='existing_native_request'&&!opaque(result.reference))fail('INVALID_NATIVE_REFERENCE');
  return {kind:result.kind,channel:result.channel,...(result.kind==='open_native_draft'?{reasonCode:result.reasonCode,journey:copy(result.journey??{})}:{}),...(result.kind==='existing_native_request'?{reference:result.reference}:{})};
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
 let visitKey=null,language='en',generation=0,flight=null,view={version:0,issue:null},needsRefresh=true,disposed=false;
 const snapshot=()=>({bound:visitKey!==null,language,pending:Boolean(flight),needsRefresh,version:view.version,issue:copy(view.issue)});
 const emit=()=>onChange(snapshot());
 function invalidate({clear=false}={}){
  generation++;flight?.abort();flight=null;needsRefresh=true;
  if(clear)view={version:0,issue:null};
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
  emit();
  try{
   if(userAction)recordActivity();
   // request() uses the existing native authenticated transport. A UI visit
   // key is only a local cancellation boundary, not a credential or role.
   const result=await request(copy(command),{signal:controller.signal});
   if(!isCurrent())return {kind:'stale'};
   const next=readView(result),effect=readEffect(result);
   if(command.action!=='read'&&next.version<view.version)fail('STALE_BRIDGE_RESPONSE');
   view=next;needsRefresh=false;
   // A host language switch uses this same controller rather than mutating
   // global app direction or retaining language between kiosk visits.
   if(view.issue)language=view.issue.language;
   emit();
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
  }finally{if(isCurrent()){flight=null;emit();}}
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
 return Object.freeze({bindVisit,refresh,begin,choose,reply,openGuide,refreshGuide,requestDraft,refreshRecovery,changeLanguage,
  undo:()=>mutation('undo'),clear:()=>mutation('clear'),stop,dispose,snapshot});
}
