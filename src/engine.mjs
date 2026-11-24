import {QUESTIONS} from './questions.mjs';
import {classify,normalize} from './classify.mjs';
import {eligible,exactReviewedFact,searchKnowledge} from './knowledge.mjs';
import {interpretFollowup} from './followup.mjs';
import {summarizeEvidence} from './evidence.mjs';
import {isServiceId} from './service-taxonomy.mjs';
import {hasServicePlaybook,nextServiceDecision} from './service-playbooks.mjs';
import {getErrorSignature} from './error-intelligence.mjs';
import {sanitizeText} from './privacy.mjs';
import {isInformationalQuery,reviewedTopicChoices,reviewedTopicQuestion} from './answer-planner.mjs';
export const RULE_VERSION='0.9.0';
export const MAX_TURNS=7;
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
 return copy(input);
}
function guide(s,c,service,purpose){
 const eligibleGuides=c.guides.filter(g=>g.serviceId===service&&g.purpose===purpose&&eligible(g,{catalog:c}));
 const matches=eligibleGuides.filter(g=>Object.entries(g.requires||{}).every(([k,values])=>values.includes(value(s,k)))).sort((a,b)=>Object.keys(b.requires||{}).length-Object.keys(a.requires||{}).length);
 // Only safe platform/context fields may be requested as missing prerequisites.
 // Do not ask a sensitive question merely because a guide references it.
 const viable=eligibleGuides.filter(g=>Object.entries(g.requires||{}).every(([k,values])=>!known(s,k)||values.includes(value(s,k))));
 const specificity=Object.keys(matches[0]?.requires||{}).length;
 const nextKey=['device_os','phone','browser_scope'].find(key=>!known(s,key)&&viable.some(g=>Object.keys(g.requires||{}).length>specificity&&Object.hasOwn(g.requires||{},key)));
 if(nextKey)return ask(nextKey);
 if(!matches.length){
  const needed=['device_os','phone','browser_scope'].find(key=>!known(s,key)&&viable.some(g=>Object.hasOwn(g.requires||{},key)));
  return needed?ask(needed):support('NO_APPROVED_GUIDE');
 }
 if(matches.length>1&&Object.keys(matches[0].requires||{}).length===Object.keys(matches[1].requires||{}).length)return support('MULTIPLE_APPROVED_GUIDES');
 const g=matches[0];
 if(s.offeredGuideIds.includes(g.id))return support('GUIDE_ALREADY_OFFERED');
 return {kind:'open_guide',guideId:g.id,serviceId:service,catalogRevision:c.revision,title:g.title,reasonCode:'REVIEWED_GUIDE'};
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
 if(v('outcome')==='yes')return {kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'};
 if(k('outcome'))return support(v('outcome')==='no'?'GUIDE_DID_NOT_WORK':'OUTCOME_UNCONFIRMED');
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
 const incident=confirmedIncident(s,records,now);
 if(incident&&['network','identity','task','specific'].includes(s.domain)&&!k('error_signature')&&!k('credentials')&&!k('mfa_access')&&!k('mfa_prompt')&&!k('recovery_context')&&!k('mfa_recovery')&&!k('setup_requested'))return incident;
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
   return support(v('send_error')==='restricted'?'MAIL_SENDER_RESTRICTED':'MAIL_ERROR_UNCLEAR');
  }
  if(v('task')==='receive')return !k('receive_scope')?ask('receive_scope'):v('receive_scope')==='some'?g('mail','missing_messages_check'):support('MAIL_RECEIVE_REQUIRES_REVIEW');
  return support('MAIL_TASK_UNCLEAR');
 }
 if(s.domain==='network'){
  if(!k('connection'))return ask('connection');
  if(v('connection')==='yes')return v('network_issue')==='slow'?g('network','network_slow'):support('SPECIFIC_SERVICE_FAILURE');
  if(!k('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  if(v('peers')==='unknown')return support('NETWORK_SCOPE_UNCLEAR');
  if(v('connection')!=='no')return support('NETWORK_EVIDENCE_INCOMPLETE');
  const purpose={ssid_missing:'network_ssid',auth:'network_auth',slow:'network_slow'}[v('network_issue')];
  return g('network',purpose||'individual_connectivity');
 }
 if(s.domain==='identity'){
  if(v('mfa_prompt')==='unexpected')return safety('UNEXPECTED_VERIFICATION_REQUEST');
  if(v('credentials')==='locked')return support('ACCOUNT_LOCKED');
  if(v('recovery_context')==='phone_change'||v('mfa_prompt')==='blocked'){
   if(!k('mfa_access'))return ask('mfa_access');
   if(v('mfa_access')==='no')return {kind:'offer_mfa_recovery',reasonCode:'REGISTERED_METHOD_UNAVAILABLE'};
   if(v('mfa_access')==='unknown')return support('MFA_ACCESS_UNCONFIRMED');
   return v('recovery_context')==='phone_change'?g('identity','manage_existing_method'):support('MFA_VERIFICATION_FAILED');
  }
  if(v('setup_requested')==='yes'||v('mfa_setup')==='no'||v('mfa_prompt')==='setup_required'){
   if(!k('phone'))return ask('phone');
   return v('phone')==='unknown'?support('PHONE_PLATFORM_UNCLEAR'):g('identity','setup_'+v('phone'));
  }
  if(errorHint?.stage==='credential_validation'&&!k('credentials'))return ask('credentials');
  if(errorHint?.stage==='credential_validation'&&v('credentials')==='rejected')return g('identity','credential_check');
  if(!k('mfa_setup'))return ask('mfa_setup');
  if(!k('mfa_prompt'))return ask('mfa_prompt');
  if(!k('credentials'))return ask('credentials');
  if(v('credentials')==='locked')return support('ACCOUNT_LOCKED');
  if(v('credentials')==='rejected')return g('identity','credential_check');
  if(!k('connection'))return ask('connection');
  if(v('connection')==='no'){
   if(!k('peers'))return ask('peers');
   if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
   return v('peers')==='no'?g('network','individual_connectivity'):support('NETWORK_SCOPE_UNCLEAR');
  }
  if(v('mfa_prompt')==='missing')return support('MFA_PROMPT_MISSING');
  if(v('mfa_prompt')==='approved'&&v('credentials')==='accepted'&&v('connection')==='yes'&&s.services.length===1&&s.services[0]!=='identity'){
   if(!k('service_access'))return ask('service_access');
   if(v('service_access')==='one_service'&&hasServicePlaybook(s.services[0]))return nextServiceDecision(s,{ask,guide:g,support});
  }
  return support('SIGN_IN_CAUSE_UNCONFIRMED');
 }
 return support('NO_MATCH');
}
function finish(s,c,records,now){
 let d=decide(s,c,records,now);
 if(d.kind==='ask'&&(s.askedQuestionIds.length>=MAX_TURNS||s.askedQuestionIds.includes(d.questionId)))d=support('QUESTION_BUDGET_OR_REPEAT');
 if(d.kind==='ask'){
  s.askedQuestionIds.push(d.questionId);
  let question=d.questionId==='reviewed_topic'?reviewedTopicQuestion(s.knowledgeChoices||[]):QUESTIONS[d.questionId];
  if(d.questionId==='task'&&!s.services.includes('mail'))question={...question,options:question.options.filter(o=>!['send','receive'].includes(o.id))};
  if(d.questionId==='service'&&s.services.length>1)question={...question,options:question.options.filter(o=>s.services.includes(o.id)||o.id==='other')};
  if(d.questionId==='service'&&c.diagnosticServices)question={...question,options:question.options.filter(o=>c.diagnosticServices.includes(o.id))};
  if(!question.options.length)d=support('DIAGNOSTIC_SCOPE_NOT_ALLOWED');else d={...d,question};
 }
 if(d.kind==='open_guide')s.offeredGuideIds.push(d.guideId);
 if(d.kind==='open_guide'||d.kind==='answer')d={...d,followUp:{questionId:'outcome',question:QUESTIONS.outcome}};
 s.candidates=summarizeEvidence(s);
 const hint=getErrorSignature(value(s,'error_signature'));if(hint)s.errorHint=hint;else delete s.errorHint;
 s.decision=d;s.status=d.kind==='ask'?'diagnosing':['open_guide','answer'].includes(d.kind)?'guidance':d.kind==='resolved_reported'?'resolved_reported':'handoff_offered';
 return copy(s);
}
// Pure library: host must keep authoritative state, authorize visits and actions,
// enforce atomic version checks, and revalidate live guide availability.
export function createEngine({catalog,incidents=[],now=()=>Date.now()}={}){
 const c=checkedCatalog(catalog);
 if(!Array.isArray(incidents)||typeof now!=='function')throw new TypeError('Invalid engine configuration');
 const records=copy(incidents);
 function begin({text,language='en'}={}){
  if(!['en','ar'].includes(language))throw new TypeError('Invalid language');
  const clean=sanitizeText(text);
  const r=classify(clean.text||'redacted');
  text=clean.text;
  const isHowTo=/^(?:how (?:do|can|to)|what is|where (?:is|can)|كيف|ما هو|ما هي|اين)\b/i.test(normalize(text))||/^(?:كيف|ما هو|ما هي|اين)(?: |$)/.test(normalize(text));
  const factMatch=!['safety','exam'].includes(r.domain)&&isHowTo?exactReviewedFact(c,text,r.services):null;
  const s={ruleVersion:RULE_VERSION,catalogRevision:c.revision,turn:0,language,domain:r.domain,services:r.services,evidence:{},askedQuestionIds:[],offeredGuideIds:[],status:'new'};
  for(const [key,v] of Object.entries(r.facts))fact(s,key,v,'student_text_signal');
  s.requestKind=['safety','exam'].includes(r.domain)?'protected':isHowTo?'how_to':r.domain==='unknown'?'unclear':'fault';
  if(factMatch){s.reviewedFactId=factMatch.id;s.domain='task';s.services=[factMatch.serviceId];}
  else if(!clean.categories.length&&!['safety','exam'].includes(r.domain)&&r.facts.mfa_prompt!=='unexpected'&&!r.facts.error_signature&&isInformationalQuery(text)){
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
  const s=copy(state);s.turn++;fact(s,questionId,optionId);
  if(questionId==='reviewed_topic'&&optionId!=='none'){
   const choice=s.knowledgeChoices?.find(x=>x.optionId===optionId);
   const f=(c.facts||[]).find(x=>x.id===choice?.factId&&eligible(x,{catalog:c,services:s.services}));
   if(!f)throw Error('FACT_UNAVAILABLE');
   s.reviewedFactId=f.id;s.domain='task';s.services=[f.serviceId];s.requestKind='information';
   s.evidence={reviewed_topic:{value:optionId,origin:'student_report'}};
  }
  if(questionId==='service'){
   s.services=[optionId];
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
  const result=interpretFollowup(id,text,q.options);
  if(result.kind==='invalid')throw Error('INVALID_ANSWER');
  if(result.kind==='safety'){
   const s=copy(state);s.turn++;s.domain='safety';s.safetyPolicy=result.policy;
   return {kind:'advanced',state:finish(s,c,records,now())};
  }
  if(result.kind==='clarify')return {kind:'clarify',reasonCode:result.reasonCode,state:copy(state)};
  return {kind:'advanced',state:advance(state,{expectedTurn,questionId:id,optionId:result.optionId})};
 }
 function search({text,services=[],limit=5}={}){try{return searchKnowledge(c,{text:sanitizeText(text).text,services,limit});}catch{return [];}}
 // Trusted host only, after independently verifying its recovery workflow.
 function resumeRecovery(state,{expectedTurn}={}){
  if(!state||state.ruleVersion!==RULE_VERSION||state.catalogRevision!==c.revision||state.turn!==expectedTurn)throw Error('STALE_STATE');
  if(state.decision?.kind!=='offer_mfa_recovery')throw Error('RECOVERY_NOT_OFFERED');
  const s=copy(state);s.turn++;
  for(const k of ['recovery_context','mfa_access','mfa_prompt','mfa_setup'])delete s.evidence[k];
  s.askedQuestionIds=s.askedQuestionIds.filter(k=>!['phone','mfa_setup','mfa_access','mfa_prompt'].includes(k));
  fact(s,'mfa_recovery','completed','staff_verified');fact(s,'setup_requested','yes','staff_verified');
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
