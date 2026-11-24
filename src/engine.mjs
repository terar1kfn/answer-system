import {QUESTIONS} from './questions.mjs';
import {classify,normalize} from './classify.mjs';
import {eligible,resolveReviewedFact,createKnowledgeRetriever} from './knowledge.mjs';
import {reconcileInitialContext} from './initial-context.mjs';
import {chooseGuidePrerequisite} from './question-priority.mjs';
import {proposeCurrentError,currentErrorQuestion,stageCurrentError,completeCurrentError} from './error-confirmation.mjs';
import {validateReviewedContexts,disambiguateReviewedContext} from './reviewed-context.mjs';
import {interpretFollowup} from './followup.mjs';
import {summarizeEvidence} from './evidence.mjs';
import {summarizeDiagnosticUncertainty} from './diagnostic-hypotheses.mjs';
import {isServiceId} from './service-taxonomy.mjs';
import {hasServicePlaybook,nextServiceDecision} from './service-playbooks.mjs';
import {getErrorSignature} from './error-intelligence.mjs';
import {sanitizeText} from './privacy.mjs';
import {isInformationalQuery,reviewedTopicChoices,reviewedTopicQuestion} from './answer-planner.mjs';
import {decideIdentity,isFailedSetup,applyIdentityAnswer,prepareVerifiedRecovery} from './identity-flow.mjs';
import {decideSharedAccess,applySharedAnswer} from './shared-access.mjs';
import {recordGuideOutcome,recordResolutionAnswer,decideAfterFailedGuide,activateAlternative,repeatAlternative} from './resolution-planner.mjs';
export const RULE_VERSION='0.17.0';
export const MAX_TURNS=12;
const SVC={has:isServiceId};
const copy=x=>JSON.parse(JSON.stringify(x));
const support=(reasonCode,priority='normal')=>({kind:'offer_support',reasonCode,priority});
const ask=questionId=>({kind:'ask',questionId,reasonCode:'NEED_EVIDENCE'});
const safety=policyCode=>({kind:'safety_referral',policyCode});
const value=(s,k)=>s.evidence[k]?.value;
const known=(s,k)=>Object.hasOwn(s.evidence,k);
function fact(s,key,v,origin='student_report'){s.evidence[key]={value:v,origin};}
function checkedCatalog(input){
 if(!input||typeof input.revision!=='string'||!input.revision||!Array.isArray(input.guides))throw new TypeError('Invalid catalog');
 if(input.guides.length>5000||(input.facts||[]).length>5000)throw new TypeError('Catalog too large');
 const ids=new Set();
 for(const g of input.guides){
  if(!g||typeof g.id!=='string'||!g.id||ids.has(g.id)||!SVC.has(g.serviceId)||typeof g.purpose!=='string'||typeof g.reviewed!=='boolean'||typeof g.enabled!=='boolean'||!['student','staff'].includes(g.audience)||typeof g.title?.en!=='string'||typeof g.title?.ar!=='string')throw new TypeError('Invalid guide');
  if(g.requires!==undefined&&(!g.requires||typeof g.requires!=='object'||Array.isArray(g.requires)||Object.entries(g.requires).some(([key,values])=>!Object.hasOwn(QUESTIONS,key)||!Array.isArray(values)||!values.length||values.some(v=>!QUESTIONS[key].options.some(o=>o.id===v)))))throw new TypeError('Invalid guide prerequisites');
  for(const key of ['aliases','keywords','errorSignatures'])if(g[key]!==undefined&&(!Array.isArray(g[key])||g[key].length>100||g[key].some(v=>typeof v!=='string'||v.length>500)))throw new TypeError('Invalid guide metadata');
  ids.add(g.id);
 }
 if(input.facts!==undefined&&!Array.isArray(input.facts))throw new TypeError('Invalid facts');
 for(const f of input.facts||[]){
  if(!f||typeof f.id!=='string'||!f.id||ids.has(f.id)||!SVC.has(f.serviceId)||typeof f.reviewed!=='boolean'||typeof f.enabled!=='boolean'||!['student','staff'].includes(f.audience)||typeof f.title?.en!=='string'||typeof f.title?.ar!=='string'||typeof f.answer?.en!=='string'||typeof f.answer?.ar!=='string'||!f.answer.en.trim()||!f.answer.ar.trim()||f.answer.en.length>800||f.answer.ar.length>800||typeof f.sourceRef!=='string'||!f.sourceRef||!Array.isArray(f.aliases)||!f.aliases.length||f.aliases.some(x=>typeof x!=='string'||!x.trim()||x.length>500))throw new TypeError('Invalid fact');
  ids.add(f.id);
 }
 if(input.serviceAvailability!==undefined&&(!input.serviceAvailability||typeof input.serviceAvailability!=='object'||Array.isArray(input.serviceAvailability)||Object.entries(input.serviceAvailability).some(([id,flag])=>!SVC.has(id)||typeof flag!=='boolean')))throw new TypeError('Invalid service availability');
 if(input.diagnosticServices!==undefined&&(!Array.isArray(input.diagnosticServices)||!input.diagnosticServices.length||input.diagnosticServices.some(s=>!SVC.has(s))||new Set(input.diagnosticServices).size!==input.diagnosticServices.length))throw new TypeError('Invalid diagnostic scope');
 validateReviewedContexts(input.reviewedContexts??[]);
 return copy(input);
}
function guide(s,c,service,purpose){
 if(c.diagnosticServices&&!c.diagnosticServices.includes(service))return support('DIAGNOSTIC_SCOPE_NOT_ALLOWED');
 const eligibleGuides=c.guides.filter(g=>g.serviceId===service&&g.purpose===purpose&&eligible(g,{catalog:c}));
 const matches=eligibleGuides.filter(g=>Object.entries(g.requires||{}).every(([k,values])=>values.includes(value(s,k)))).sort((a,b)=>Object.keys(b.requires||{}).length-Object.keys(a.requires||{}).length);
 // Only safe platform/context fields may be requested as missing prerequisites.
 // Do not ask a sensitive question merely because a guide references it.
 const viable=eligibleGuides.filter(g=>Object.entries(g.requires||{}).every(([k,values])=>!known(s,k)||values.includes(value(s,k))));
 const specificity=Object.keys(matches[0]?.requires||{}).length;
 const nextKey=chooseGuidePrerequisite(viable,s,{minimumSpecificity:specificity});
 if(nextKey)return ask(nextKey);
 if(!matches.length){
  const needed=chooseGuidePrerequisite(viable,s);
  return needed?ask(needed):support('NO_APPROVED_GUIDE');
 }
 const tied=matches.filter(g=>Object.keys(g.requires||{}).length===specificity);
 let g=matches[0],patternRef=null;
 if(tied.length>1){
  const choice=disambiguateReviewedContext({catalog:c,state:s,tiedGuides:tied});
  if(choice.kind==='ask')return {...ask(choice.questionId),reasonCode:'DISTINGUISH_APPROVED_GUIDES'};
  if(choice.kind==='conflict')return support('REVIEWED_CONTEXT_CONFLICT');
  if(choice.kind!=='guide')return support('MULTIPLE_APPROVED_GUIDES');
  g=tied.find(x=>x.id===choice.guideId);if(!g)return support('MULTIPLE_APPROVED_GUIDES');patternRef=choice.patternRef;
 }
 if(s.offeredGuideIds.includes(g.id))return support('GUIDE_ALREADY_OFFERED');
 return {kind:'open_guide',guideId:g.id,serviceId:service,catalogRevision:c.revision,title:g.title,reasonCode:patternRef?'REVIEWED_CONTEXT_GUIDE':'REVIEWED_GUIDE',...(patternRef?{diagnosticPatternRef:patternRef}:{})};
}
function confirmedIncident(s,records,now){
 if(s.services.length!==1)return null;
 const i=records.find(i=>i&&i.serviceId===s.services[0]&&i.status==='confirmed'&&i.authority==='authorized_staff'&&typeof i.id==='string'&&Number.isFinite(i.updatedAt)&&Number.isFinite(i.expiresAt)&&i.updatedAt<=now&&i.expiresAt>now&&now-i.updatedAt<=900000);
 return i?{kind:'incident_notice',incidentRef:i.id,status:'confirmed',serviceId:i.serviceId}:null;
}
function decide(s,c,records,now){
 const v=k=>value(s,k),k=x=>known(s,x),g=(service,purpose)=>guide(s,c,service,purpose);
 if(s.domain==='safety')return safety(s.safetyPolicy||'SENSITIVE_OR_DANGEROUS');
 if(s.domain==='exam'){
  if(v('exam_started')==='yes'||v('exam_started')==='unknown')return safety('EXAM_PROFESSOR_FIRST');
  if(!k('exam_started'))return ask('exam_started');
  if(!k('exam_app'))return ask('exam_app');
  // The active exam safeguard is evaluated before even an outcome.
  if(k('outcome'))return v('outcome')==='yes'?{kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'}:support('GUIDE_DID_NOT_WORK');
  if(v('exam_app')==='unknown')return support('EXAM_APP_UNCLEAR');
  if(k('exam_issue')&&['install','launch','camera','audio','download'].includes(v('exam_issue')))return g('exam',v('exam_app')+'_'+v('exam_issue'));
  return g('exam',v('exam_app'));
 }
 if(c.diagnosticServices&&s.services.some(id=>!c.diagnosticServices.includes(id)))return support('DIAGNOSTIC_SCOPE_NOT_ALLOWED');
 if(s.pendingError)return s.turn>=24?support('QUESTION_BUDGET_OR_REPEAT'):{kind:'ask',questionId:'confirm_current_error',reasonCode:'CONFIRM_CURRENT_ERROR'};
 if(v('outcome')==='yes')return {kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'};
 if(v('outcome')==='unknown')return support('OUTCOME_UNCONFIRMED');
 if(v('error_conflict')==='yes')return support('MULTIPLE_CURRENT_ERRORS');
 if(s.reviewedFactConflict)return support('REVIEWED_FACT_CONFLICT');
 if(s.knowledgeChoices?.length&&!k('reviewed_topic'))return ask('reviewed_topic');
 if(s.domain==='unknown')return !k('service')?ask('service'):support('SERVICE_UNCLEAR');
 if(s.reviewedFactId&&!k('outcome')){
  const f=(c.facts||[]).find(f=>f.id===s.reviewedFactId&&eligible(f,{catalog:c}));
  if(f)return {kind:'answer',factId:f.id,sourceRef:f.sourceRef,catalogRevision:c.revision,title:f.title,answer:f.answer,reasonCode:'EXACT_REVIEWED_FACT'};
 }
 const errorHint=getErrorSignature(v('error_signature'));
 if(v('mfa_prompt')==='unexpected')return safety('UNEXPECTED_VERIFICATION_REQUEST');
 if(errorHint?.stage==='policy_block')return support('ACCESS_POLICY_REVIEW_REQUIRED');
 if(errorHint?.stage==='sign_in_block')return support('ACCOUNT_BLOCK_REVIEW_REQUIRED');
 if(v('credentials')==='locked')return support('ACCOUNT_LOCKED');
 if(errorHint?.stage==='recipient_rate_limit'||errorHint?.stage==='quota_or_rate_review')return support('MAIL_QUOTA_REVIEW');
 if(s.domain==='mail'&&v('send_error')==='restricted')return support('MAIL_SENDER_RESTRICTED');
 const conflict=(s.conflictingObservations||[]).find(q=>Object.hasOwn(QUESTIONS,q)&&!k(q));
 if(conflict)return {...ask(conflict),reasonCode:'CONFLICTING_OBSERVATIONS'};
 if(v('outcome')==='no'&&!isFailedSetup(s))return decideAfterFailedGuide(s,c,{ask,guide:g,support});
 if(s.activeAlternative)return repeatAlternative(s,{guide:g});
 const incident=confirmedIncident(s,records,now);
 if(incident&&['network','identity','task','specific'].includes(s.domain)&&!k('error_signature')&&!k('credentials')&&!k('mfa_access')&&!k('mfa_prompt')&&!k('recovery_context')&&!k('mfa_recovery')&&!k('setup_requested'))return incident;
 if(s.domain==='shared')return decideSharedAccess(s,{ask,support});
 if(s.domain==='specific')return nextServiceDecision(s,{ask,guide:g,support});
 if(s.domain==='task'){
  if(!k('task'))return ask('task');
  if(v('task')==='app'&&s.services.length===1&&hasServicePlaybook(s.services[0]))return nextServiceDecision(s,{ask,guide:g,support});
  return support(v('task')==='app'?'SERVICE_SPECIFIC_FEATURE':'TASK_UNCLEAR');
 }
 if(s.domain==='mail'){
  if(!s.services.includes('mail'))return support('MAIL_SERVICE_UNCONFIRMED');
  if(v('task')==='send'){
   if(!k('send_error'))return ask('send_error');
   if(v('send_error')==='recipients')return g('mail','recipient_limit_check');
   if(v('send_error')==='address')return g('mail','recipient_address_check');
   if(v('send_error')==='size')return g('mail','mail_attachment');
   if(v('send_error')==='other'||v('send_error')==='unknown'){
    if(!k('send_scope'))return ask('send_scope');
    if(v('send_scope')==='one')return g('mail','recipient_address_check');
    if(v('send_scope')==='many')return support('MAIL_MULTI_RECIPIENT_REVIEW');
    if(!k('mail_client_scope'))return ask('mail_client_scope');
    if(v('mail_client_scope')==='app_only')return g('mail','mail_sync');
   }
   return support(v('send_error')==='restricted'?'MAIL_SENDER_RESTRICTED':'MAIL_ERROR_UNCLEAR');
  }
  if(v('task')==='receive'){
   if(!k('receive_scope'))return ask('receive_scope');
   if(v('receive_scope')==='some')return g('mail','missing_messages_check');
   if(v('receive_scope')==='all'){
    if(!k('mail_client_scope'))return ask('mail_client_scope');
    if(v('mail_client_scope')==='app_only')return g('mail','mail_sync');
   }
   return support('MAIL_RECEIVE_REQUIRES_REVIEW');
  }
  return support('MAIL_TASK_UNCLEAR');
 }
 if(s.domain==='network'){
  if(!k('connection'))return ask('connection');
  if(v('connection')==='yes'){
   if(!k('network_issue'))return ask('network_issue');
   return v('network_issue')==='slow'?g('network','network_slow'):support('SPECIFIC_SERVICE_FAILURE');
  }
  if(!k('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  if(v('peers')==='unknown')return support('NETWORK_SCOPE_UNCLEAR');
  if(v('connection')!=='no')return support('NETWORK_EVIDENCE_INCOMPLETE');
  if(!k('network_issue'))return ask('network_issue');
  if(v('network_issue')==='only_service')return support('NETWORK_OBSERVATIONS_CONFLICT');
  const purpose={ssid_missing:'network_ssid',auth:'network_auth',slow:'network_slow'}[v('network_issue')];
  return g('network',purpose||'individual_connectivity');
 }
 if(s.domain==='identity'){
  const result=decideIdentity(s,{ask,guide:g,support,safety,errorHint});
  if(result)return result;
  return hasServicePlaybook(s.services[0])?nextServiceDecision(s,{ask,guide:g,support}):support('SERVICE_SPECIFIC_REVIEW');
 }
 return support('NO_MATCH');
}
function finish(s,c,records,now){
 let d=decide(s,c,records,now);
 if(d.kind==='ask'&&d.questionId!=='confirm_current_error'&&(s.askedQuestionIds.length>=MAX_TURNS||s.turn>=24||s.askedQuestionIds.includes(d.questionId)))d=support('QUESTION_BUDGET_OR_REPEAT');
 if(d.kind==='ask'){
  if(d.questionId!=='confirm_current_error')s.askedQuestionIds.push(d.questionId);
  let question=d.questionId==='confirm_current_error'?currentErrorQuestion(s.pendingError.signatureId):d.questionId==='reviewed_topic'?reviewedTopicQuestion(s.knowledgeChoices||[]):QUESTIONS[d.questionId];
  if(d.questionId==='task'&&!s.services.includes('mail'))question={...question,options:question.options.filter(o=>!['send','receive'].includes(o.id))};
  if(d.questionId==='service'&&s.services.length>1)question={...question,options:question.options.filter(o=>s.services.includes(o.id)||o.id==='other')};
  if(d.questionId==='service'&&c.diagnosticServices)question={...question,options:question.options.filter(o=>c.diagnosticServices.includes(o.id))};
  if(!question.options.length)d=support('DIAGNOSTIC_SCOPE_NOT_ALLOWED');else d={...d,question};
 }
 if(d.kind==='open_guide'){activateAlternative(s,d);s.offeredGuideIds.push(d.guideId);s.lastGuidePurpose=c.guides.find(g=>g.id===d.guideId)?.purpose;}
 if(d.kind==='open_guide'||d.kind==='answer')d={...d,followUp:{questionId:'outcome',question:QUESTIONS.outcome}};
 s.candidates=summarizeEvidence(s);
 s.diagnosticUncertainty=summarizeDiagnosticUncertainty(s,s.candidates);
 if(s.conflictingObservations?.length)s.diagnosticUncertainty={...s.diagnosticUncertainty,level:'conflicting_observations',leadingCause:null,unresolvedObservations:[...s.conflictingObservations]};
 const hint=getErrorSignature(value(s,'error_signature'));if(hint)s.errorHint=hint;else delete s.errorHint;
 s.decision=d;s.status=d.kind==='ask'?'diagnosing':['open_guide','answer'].includes(d.kind)?'guidance':d.kind==='resolved_reported'?'resolved_reported':'handoff_offered';
 return copy(s);
}
// Pure library: host must keep authoritative state, authorize visits and actions,
// enforce atomic version checks, and revalidate live guide availability.
export function createEngine({catalog,incidents=[],now=()=>Date.now()}={}){
 const c=checkedCatalog(catalog);
 if(!Array.isArray(incidents)||typeof now!=='function')throw new TypeError('Invalid engine configuration');
 const records=copy(incidents),retriever=createKnowledgeRetriever(c);
 function begin({text,language='en'}={}){
  if(!['en','ar'].includes(language))throw new TypeError('Invalid language');
  const clean=sanitizeText(text);
  const classified=classify(clean.text||'redacted');
  const r=reconcileInitialContext({text:clean.text,classification:classified,classify});
  text=clean.text;
  const isHowTo=/^(?:how (?:do|can|to)|what is|where (?:is|can)|كيف|ما هو|ما هي|اين)\b/i.test(normalize(text))||/^(?:كيف|ما هو|ما هي|اين)(?: |$)/.test(normalize(text));
  const factResolution=!clean.categories.length&&!['safety','exam'].includes(r.domain)&&!r.facts.error_signature&&!r.facts.error_conflict&&isHowTo?resolveReviewedFact(c,text,r.services):{status:'none'};
  const factMatch=factResolution.status==='exact'?factResolution.fact:null;
  const s={ruleVersion:RULE_VERSION,catalogRevision:c.revision,turn:0,language,domain:r.domain,services:r.services,evidence:{},askedQuestionIds:[],offeredGuideIds:[],status:'new'};
  for(const [key,v] of Object.entries(r.facts))fact(s,key,v,'student_text_signal');
  s.conflictingObservations=r.conflicts||[];
  if(factResolution.status==='conflict')s.reviewedFactConflict=true;
  s.requestKind=['safety','exam'].includes(r.domain)?'protected':isHowTo?'how_to':r.domain==='unknown'?'unclear':'fault';
  if(factMatch){s.reviewedFactId=factMatch.id;s.domain='task';s.services=[factMatch.serviceId];}
  else if(factResolution.status==='none'&&!clean.categories.length&&!['safety','exam'].includes(r.domain)&&r.facts.mfa_prompt!=='unexpected'&&!r.facts.error_signature&&!r.facts.error_conflict&&isInformationalQuery(text)){
   const choices=reviewedTopicChoices(c,{text,services:r.services});if(choices.length)s.knowledgeChoices=choices;
  }
  return finish(s,c,records,now());
 }
 function advance(state,{expectedTurn,questionId,optionId}={}){
  if(!state||state.ruleVersion!==RULE_VERSION||state.catalogRevision!==c.revision||!Number.isSafeInteger(state.turn)||expectedTurn!==state.turn)throw Error('STALE_STATE');
  const d=state.decision;
  const expected=d?.kind==='ask'?d.questionId:['open_guide','answer'].includes(d?.kind)?'outcome':null;
  if(!expected)throw Error('TERMINAL_STATE');
  const options=d.kind==='ask'?d.question.options:d.followUp.question.options;
  if(expected!==questionId||!options.some(o=>o.id===optionId))throw Error('INVALID_ANSWER');
  if(questionId==='confirm_current_error')return finish(completeCurrentError(state,optionId),c,records,now());
  const s=copy(state);s.turn++;fact(s,questionId,optionId);
  s.conflictingObservations=(s.conflictingObservations||[]).filter(k=>k!==questionId);
  if(questionId==='outcome')recordGuideOutcome(s,d,optionId);
  else recordResolutionAnswer(s,questionId,optionId);
  applyIdentityAnswer(s,questionId,optionId);
  applySharedAnswer(s,questionId,optionId);
  if(questionId==='reviewed_topic'&&optionId!=='none'){
   const choice=s.knowledgeChoices?.find(x=>x.optionId===optionId);
   const f=(c.facts||[]).find(x=>x.id===choice?.factId&&eligible(x,{catalog:c,services:s.services}));
   if(!f)throw Error('FACT_UNAVAILABLE');
   s.reviewedFactId=f.id;s.domain='task';s.services=[f.serviceId];s.requestKind='information';
   s.evidence={reviewed_topic:{value:optionId,origin:'student_report'}};
  }
  if(questionId==='service'){
   s.services=[optionId];delete s.activeAlternative;delete s.lastGuidePurpose;delete s.knowledgeChoices;delete s.reviewedFactId;delete s.reviewedFactConflict;s.conflictingObservations=[];
   for(const key of Object.keys(s.evidence))if(key!=='service')delete s.evidence[key];
   s.domain=['network','identity','exam'].includes(optionId)?optionId:optionId==='other'?'unknown':['mail','portal','attendance'].includes(optionId)?'task':hasServicePlaybook(optionId)?'specific':'task';
  }
  if(questionId==='task'){
   if(optionId==='login')s.domain='identity';
   if(['send','receive'].includes(optionId)&&s.services.includes('mail'))s.domain='mail';
   if(optionId==='app'&&s.services.length===1&&hasServicePlaybook(s.services[0]))s.domain='specific';
  }
  return finish(s,c,records,now());
 }
 function respond(state,{expectedTurn,text}={}){
  if(!state||state.ruleVersion!==RULE_VERSION||state.catalogRevision!==c.revision||expectedTurn!==state.turn)throw Error('STALE_STATE');
  const d=state.decision,q=d.kind==='ask'?d.question:d.followUp?.question,id=d.kind==='ask'?d.questionId:d.followUp?.questionId;
  if(!q)throw Error('TERMINAL_STATE');
  const result=interpretFollowup(id,text,q.options,state);
  if(result.kind==='invalid')throw Error('INVALID_ANSWER');
  if(result.kind==='safety'){
   const s=copy(state);s.turn++;s.domain='safety';s.safetyPolicy=result.policy;delete s.pendingError;
   return {kind:'advanced',state:finish(s,c,records,now())};
  }
  const reportedError=proposeCurrentError(state,text);
  if(reportedError.kind==='propose')return {kind:'advanced',state:finish(stageCurrentError(state,reportedError.signatureId),c,records,now())};
  if(reportedError.kind==='clarify')return {kind:'clarify',reasonCode:reportedError.reasonCode,state:copy(state)};
  if(result.kind==='clarify')return {kind:'clarify',reasonCode:result.reasonCode,state:copy(state)};
  // Supplementary observations are accepted only from the private interpreter,
  // not from public command fields. A selected answer always remains explicit.
  const next=copy(state);
  for(const observation of result.observations||[]){
   if(observation.key===id||known(next,observation.key)||!QUESTIONS[observation.key]?.options.some(o=>o.id===observation.value))continue;
   fact(next,observation.key,observation.value,'student_text_signal');
   next.conflictingObservations=(next.conflictingObservations||[]).filter(k=>k!==observation.key);
  }
  return {kind:'advanced',state:advance(next,{expectedTurn,questionId:id,optionId:result.optionId})};
 }
 function search({text,services=[],limit=5}={}){
  try{
   const clean=sanitizeText(text);if(!clean.text||clean.categories.length)return [];
   const intent=classify(clean.text);if(intent.domain==='safety'||intent.domain==='exam'||intent.facts.mfa_prompt==='unexpected'||intent.facts.error_conflict)return [];
   return retriever.search({text:clean.text,services,limit});
  }catch{return [];}
 }
 // Trusted host only, after independently verifying its recovery workflow.
 function resumeRecovery(state,{expectedTurn}={}){
  if(!state||state.ruleVersion!==RULE_VERSION||state.catalogRevision!==c.revision||state.turn!==expectedTurn)throw Error('STALE_STATE');
  if(state.decision?.kind!=='offer_mfa_recovery')throw Error('RECOVERY_NOT_OFFERED');
  const s=copy(state);s.turn++;
  prepareVerifiedRecovery(s,c);
  return finish(s,c,records,now());
 }
 // Reevaluate a trusted earlier snapshot against current incident information.
 function reconsider(snapshot,{nextTurn}={}){
  if(!snapshot||snapshot.ruleVersion!==RULE_VERSION||snapshot.catalogRevision!==c.revision||!Number.isSafeInteger(nextTurn)||nextTurn<=snapshot.turn)throw Error('STALE_STATE');
  const s=copy(snapshot),d=s.decision;
  if(!['ask','open_guide','answer'].includes(d?.kind))throw Error('UNDO_NOT_AVAILABLE');
  if(d.kind==='ask')s.askedQuestionIds=s.askedQuestionIds.filter(q=>q!==d.questionId);
  if(d.kind==='open_guide')s.offeredGuideIds=s.offeredGuideIds.filter(id=>id!==d.guideId);
  s.turn=nextTurn;return finish(s,c,records,now());
 }
 return Object.freeze({begin,advance,respond,search,resumeRecovery,reconsider,ruleVersion:RULE_VERSION,catalogRevision:c.revision});
}
