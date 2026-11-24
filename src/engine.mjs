import {QUESTIONS} from './questions.mjs';
import {classify} from './classify.mjs';
export const RULE_VERSION='0.1.0';
export const MAX_TURNS=7;
const SVC=new Set(['mail','portal','attendance','identity','network','exam','other']);
const copy=x=>JSON.parse(JSON.stringify(x));
const support=(reasonCode,priority='normal')=>({kind:'offer_support',reasonCode,priority});
const ask=questionId=>({kind:'ask',questionId,reasonCode:'NEED_EVIDENCE'});
const safety=policyCode=>({kind:'safety_referral',policyCode});
const value=(s,k)=>s.evidence[k]?.value;
const known=(s,k)=>Object.hasOwn(s.evidence,k);
function fact(s,key,v,origin='student_report'){s.evidence[key]={value:v,origin};}
function checkedCatalog(input){
 if(!input||typeof input.revision!=='string'||!input.revision||!Array.isArray(input.guides))throw new TypeError('Invalid catalog');
 const ids=new Set();
 for(const g of input.guides){
  if(!g||typeof g.id!=='string'||!g.id||ids.has(g.id)||!SVC.has(g.serviceId)||typeof g.purpose!=='string'||typeof g.reviewed!=='boolean'||typeof g.enabled!=='boolean'||!['student','staff'].includes(g.audience)||typeof g.title?.en!=='string'||typeof g.title?.ar!=='string')throw new TypeError('Invalid guide');
  ids.add(g.id);
 }
 return copy(input);
}
function guide(s,c,service,purpose){
 const g=c.guides.find(g=>g.serviceId===service&&g.purpose===purpose&&g.enabled&&g.reviewed&&g.audience==='student');
 if(!g)return support('NO_APPROVED_GUIDE');
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
 if(s.domain==='safety')return safety('SENSITIVE_OR_DANGEROUS');
 if(s.domain==='exam'){
  if(v('exam_started')==='yes'||v('exam_started')==='unknown')return safety('EXAM_PROFESSOR_FIRST');
  if(!k('exam_started'))return ask('exam_started');
  if(!k('exam_app'))return ask('exam_app');
  // The active exam safeguard is evaluated before even an outcome.
  if(k('outcome'))return v('outcome')==='yes'?{kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'}:support('GUIDE_DID_NOT_WORK');
  return v('exam_app')==='unknown'?support('EXAM_APP_UNCLEAR'):g('exam',v('exam_app'));
 }
 if(v('outcome')==='yes')return {kind:'resolved_reported',reasonCode:'STUDENT_CONFIRMED_ORIGINAL_TASK'};
 if(k('outcome'))return support(v('outcome')==='no'?'GUIDE_DID_NOT_WORK':'OUTCOME_UNCONFIRMED');
 if(s.domain==='unknown')return !k('service')?ask('service'):support('SERVICE_UNCLEAR');
 const incident=confirmedIncident(s,records,now);
 if(incident&&['network','identity','task'].includes(s.domain)&&!k('mfa_access')&&!k('recovery_context'))return incident;
 if(s.domain==='task')return !k('task')?ask('task'):support(v('task')==='app'?'SERVICE_SPECIFIC_FEATURE':'TASK_UNCLEAR');
 if(s.domain==='mail'){
  if(!s.services.includes('mail'))return support('MAIL_SERVICE_UNCONFIRMED');
  if(v('task')==='send'){
   if(!k('send_error'))return ask('send_error');
   if(v('send_error')==='recipients')return g('mail','recipient_limit_check');
   if(v('send_error')==='address')return g('mail','recipient_address_check');
   return support(v('send_error')==='restricted'?'MAIL_SENDER_RESTRICTED':'MAIL_ERROR_UNCLEAR');
  }
  if(v('task')==='receive')return !k('receive_scope')?ask('receive_scope'):v('receive_scope')==='some'?g('mail','missing_messages_check'):support('MAIL_RECEIVE_REQUIRES_REVIEW');
  return support('MAIL_TASK_UNCLEAR');
 }
 if(s.domain==='network'){
  if(!k('connection'))return ask('connection');
  if(v('connection')==='yes')return support('SPECIFIC_SERVICE_FAILURE');
  if(!k('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  if(v('peers')==='unknown')return support('NETWORK_SCOPE_UNCLEAR');
  return v('connection')==='no'?g('network','individual_connectivity'):support('NETWORK_EVIDENCE_INCOMPLETE');
 }
 if(s.domain==='identity'){
  if(v('recovery_context')==='phone_change'||v('mfa_prompt')==='blocked'){
   if(!k('mfa_access'))return ask('mfa_access');
   if(v('mfa_access')==='no')return {kind:'offer_mfa_recovery',reasonCode:'REGISTERED_METHOD_UNAVAILABLE'};
   if(v('mfa_access')==='unknown')return support('MFA_ACCESS_UNCONFIRMED');
   return v('recovery_context')==='phone_change'?g('identity','manage_existing_method'):support('MFA_VERIFICATION_FAILED');
  }
  if(v('setup_requested')==='yes'||v('mfa_setup')==='no'){
   if(!k('phone'))return ask('phone');
   return v('phone')==='unknown'?support('PHONE_PLATFORM_UNCLEAR'):g('identity','setup_'+v('phone'));
  }
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
  return support(v('mfa_prompt')==='missing'?'MFA_PROMPT_MISSING':'SIGN_IN_CAUSE_UNCONFIRMED');
 }
 return support('NO_MATCH');
}
function finish(s,c,records,now){
 let d=decide(s,c,records,now);
 if(d.kind==='ask'&&(s.askedQuestionIds.length>=MAX_TURNS||s.askedQuestionIds.includes(d.questionId)))d=support('QUESTION_BUDGET_OR_REPEAT');
 if(d.kind==='ask'){s.askedQuestionIds.push(d.questionId);d={...d,question:QUESTIONS[d.questionId]};}
 if(d.kind==='open_guide'){s.offeredGuideIds.push(d.guideId);d={...d,followUp:{questionId:'outcome',question:QUESTIONS.outcome}};}
 s.decision=d;s.status=d.kind==='ask'?'diagnosing':d.kind==='open_guide'?'guidance':d.kind==='resolved_reported'?'resolved_reported':'handoff_offered';
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
  const r=classify(text);
  const s={ruleVersion:RULE_VERSION,catalogRevision:c.revision,turn:0,language,domain:r.domain,services:r.services,evidence:{},askedQuestionIds:[],offeredGuideIds:[],status:'new'};
  for(const [key,v] of Object.entries(r.facts))fact(s,key,v,'student_text_signal');
  return finish(s,c,records,now());
 }
 function advance(state,{expectedTurn,questionId,optionId}={}){
  if(!state||state.ruleVersion!==RULE_VERSION||state.catalogRevision!==c.revision||!Number.isSafeInteger(state.turn)||expectedTurn!==state.turn)throw Error('STALE_STATE');
  const d=state.decision;
  const expected=d?.kind==='ask'?d.questionId:d?.kind==='open_guide'?'outcome':null;
  if(!expected)throw Error('TERMINAL_STATE');
  if(expected!==questionId||!QUESTIONS[expected]?.options.some(o=>o.id===optionId))throw Error('INVALID_ANSWER');
  const s=copy(state);s.turn++;fact(s,questionId,optionId);
  if(questionId==='service'){
   s.services=[optionId];
   s.domain=['network','identity','exam'].includes(optionId)?optionId:optionId==='other'?'unknown':'task';
  }
  if(questionId==='task'){
   if(optionId==='login')s.domain='identity';
   if(['send','receive'].includes(optionId)&&s.services.includes('mail'))s.domain='mail';
  }
  return finish(s,c,records,now());
 }
 return Object.freeze({begin,advance,ruleVersion:RULE_VERSION,catalogRevision:c.revision});
}
