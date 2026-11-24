import {createRuntime} from './runtime.mjs';
import {createIncidentRegistry} from './incidents.mjs';
import {createReviewQueue} from './review-queue.mjs';
import {createEngine} from './engine.mjs';
import {metricForDecision} from './analytics.mjs';
const error=code=>{throw Error(code);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const roles=new Set(['student','intern','manager']);
const staff=a=>a.role==='intern'||a.role==='manager';
const commandFields={
 open:[],read:[],begin:['expectedVersion','text','language'],respond:['expectedVersion','issueId','questionId','optionId','text'],
 search:['text','services','limit'],suggest_reply:['expectedVersion','issueId','text'],load_guide:['expectedVersion','issueId','guideId'],finish:[],keep_alive:[],
 prepare_handoff:['expectedVersion','issueId','requestKey','confirmed'],
 retry_handoff:['expectedVersion','issueId','requestKey'],
 report_incident:['expectedVersion','issueId'],
 terminate:['targetVisitRef'],recover:['targetVisitRef','expectedVersion','issueId','hostRef'],active_visits:[],read_visit:['targetVisitRef'],case_matches:['targetVisitRef'],
 incident_candidates:[],incident_list:[],monitoring:[],analytics:['days'],incident_create:['serviceId','scope','expiresInMs'],
 incident_transition:['incidentId','expectedRevision','status','expiresInMs'],
 propose:['caseCode','causeCode','solutionRef','catalogRevision','proposalKind'],
 review:['proposalId','expectedRevision','decision','currentCatalogRevision'],review_list:[],
 publication_candidate:['proposalId','currentCatalogRevision']
};
const STUDENT=new Set(['open','read','begin','respond','search','finish','keep_alive','prepare_handoff','retry_handoff','report_incident','suggest_reply','load_guide']);
const STAFF=new Set(['terminate','recover','propose','review','review_list','publication_candidate','active_visits','read_visit','case_matches']);
const MANAGER=new Set(['incident_candidates','incident_list','incident_create','incident_transition','monitoring','analytics']);
const optional=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;
/**
 * Application-facing authorization façade. A trusted host supplies authenticate(),
 * authorization callbacks, and verified integration callbacks. No network routes,
 * real student credentials, database, or institutional side effects are bundled.
 * This is single-process reference code, not a replacement for the host's auth.
 */
export function createAnswerService({
 authenticate,getCatalog,now=()=>Date.now(),newId=()=>globalThis.crypto.randomUUID(),
 mayManageVisit=async()=>false,mayManageScope=async()=>false,
 mayReviewKnowledge=async()=>false,revokeHostVisit=async()=>false,
 verifyRecovery=async()=>false,runtimeOptions={},advisor=null,hybridRetriever=null,resolveGuide=null,metrics=null,monitoring=null,caseIndex=null
}={}){
 if(![authenticate,getCatalog,now,newId,mayManageVisit,mayManageScope,mayReviewKnowledge,revokeHostVisit,verifyRecovery].every(f=>typeof f==='function'))error('INVALID_SERVICE_CONFIG');
 const registry=createIncidentRegistry({now,newId}),reviewQueue=createReviewQueue({now,newId});
 const runtime=createRuntime({...runtimeOptions,getCatalog,getIncidents:scope=>registry.snapshot(scope),now,newId});
 // In-process revocation defense. Production authenticate() must durably reject
 // ended visit tokens; the host must issue a new opaque visit ID for a new visit.
 const ended=new Set(),initialized=new Set();
 const LIMIT=10000;
 const assertCapacity=()=>{if(initialized.size>=LIMIT)error('HOST_RESTART_OR_DURABLE_STORE_REQUIRED');};
 async function actor(credential){
  let a;
  try{a=await authenticate(credential);}catch{error('UNAUTHENTICATED');}
  if(!a||!roles.has(a.role)||!id(a.actorRef))error('UNAUTHENTICATED');
  if(a.role==='student'){
   if(!id(a.visitRef)||!(a.scope==null||id(a.scope))||typeof a.persistent!=='boolean'||ended.has(a.visitRef))error('UNAUTHENTICATED');
  }
  return {role:a.role,actorRef:a.actorRef,visitRef:a.visitRef,scope:a.scope??null,persistent:a.persistent===true};
 }
 function validate(command){
  if(!obj(command)||typeof command.action!=='string'||!Object.hasOwn(commandFields,command.action))error('INVALID_COMMAND');
  const allowed=new Set(['action',...commandFields[command.action]]);
  if(Object.keys(command).some(k=>!allowed.has(k)))error('UNEXPECTED_COMMAND_FIELD');
  return command;
 }
 function studentView(v){
  // The visit reference and host-only operation reference never need to be
  // echoed to a browser. Issue ID + version are concurrency tokens, not identity.
  const {visitRef,...safe}=v;
  if(safe.issue){const {handoffRef,...i}=safe.issue;safe.issue=i;}
  return safe;
 }
 const operationView=o=>({operationId:o.operationId,status:o.status,kind:o.kind,attempt:o.attempt});
 function metric(event,v,reasonCode){
  if(!metrics||!event||!v?.issue?.state)return;
  const s=v.issue.state;
  try{metrics.record({event,serviceId:s.services.length===1?s.services[0]:'other',...(reasonCode?{reasonCode}:{}),eventKey:v.issue.issueId+':'+v.version+':'+event});}catch{}
 }
 function decisionMetric(v){const d=v.issue?.state?.decision;metric(metricForDecision(d),v,d?.reasonCode||d?.policyCode);if(d?.reasonCode==='NO_APPROVED_GUIDE')metric('knowledge_gap',v,d.reasonCode);}
 function sameIssue(ref,expectedVersion,issueId){
  const v=runtime.read(ref);
  if(v.version!==expectedVersion||v.issue?.issueId!==issueId||!v.issue?.state)error('STALE_ISSUE');
  return v;
 }
 async function permitted(fn,a,target){if(await fn(a,target)!==true)error('FORBIDDEN');}
 async function dispatch(credential,input){
  const c=validate(input),a=await actor(credential),action=c.action;
  if(a.role==='student'){
   if(!STUDENT.has(action))error('FORBIDDEN');
   const ref=a.visitRef;
   if(action==='open'){
    if(initialized.has(ref))return studentView(runtime.read(ref)); // never reopen an expired visit
    assertCapacity();const v=runtime.openVisit({visitRef:ref,scope:a.scope,persistent:a.persistent});initialized.add(ref);return studentView(v);
   }
   // All student operations require an active host-bound visit.
   const v=runtime.read(ref);
   if(action==='read')return studentView(v);
   if(action==='keep_alive')return runtime.keepAlive(ref);
   if(action==='begin'){const next=runtime.begin(ref,c);metric('issue_started',next);decisionMetric(next);return studentView(next);}
   if(action==='respond'){
    const x=runtime.respond(ref,c);
    if(x.kind==='advanced')decisionMetric(x.visit);else metric('clarification',x.visit);
    return {...x,visit:studentView(x.visit)};
   }
   if(action==='search'){
    if(!hybridRetriever)return createEngine({catalog:getCatalog(),now}).search(c);
    const result=await hybridRetriever.search(c);runtime.read(ref);return result.results||[];
   }
   if(action==='suggest_reply'){
    const current=sameIssue(ref,c.expectedVersion,c.issueId),d=current.issue.state.decision;
    if(!advisor||d.kind!=='ask'||current.issue.handoffRef)return {status:'disabled'};
    const suggestion=await advisor.suggest({questionId:d.questionId,options:d.question.options,text:c.text,language:current.issue.state.language});
    sameIssue(ref,c.expectedVersion,c.issueId);return suggestion;
   }
   if(action==='load_guide'){
    const current=sameIssue(ref,c.expectedVersion,c.issueId),d=current.issue.state.decision;
    if(!resolveGuide||d.kind!=='open_guide'||d.guideId!==c.guideId)error('GUIDE_UNAVAILABLE');
    const content=await resolveGuide({guideId:d.guideId,catalogRevision:d.catalogRevision,audience:'student'});
    sameIssue(ref,c.expectedVersion,c.issueId);return content;
   }
   if(action==='finish'){
    if(v.persistent)error('STAFF_TERMINATION_REQUIRED');
    // Confirm host sign-out first; do not claim termination if auth revocation fails.
    if(await revokeHostVisit({actor:a,targetVisitRef:ref,reason:'student_finish'})!==true)error('HOST_TERMINATION_UNCONFIRMED');
    ended.add(ref);
    try{runtime.finishVisit(ref);}catch(e){if(e.message!=='VISIT_NOT_ACTIVE')throw e;}
    return {closed:true};
   }
   if(action==='prepare_handoff'||action==='retry_handoff'){
    const r=action==='prepare_handoff'?runtime.prepareHandoff(ref,c):runtime.retryHandoff(ref,c);
    metric('handoff_prepared',r.visit);return {operation:operationView(r.operation),visit:studentView(r.visit)};
   }
   if(action==='report_incident'){
    const i=v.issue;
    if(!i||v.version!==c.expectedVersion||i.issueId!==c.issueId)error('STALE_ISSUE');
    if(i.state?.decision.reasonCode!=='POSSIBLE_SHARED_NETWORK_INCIDENT')error('INCIDENT_SIGNAL_NOT_SUPPORTED');
    return registry.report({visitRef:ref,serviceId:'network',scope:a.scope});
   }
  }
  if(!staff(a)||(!STAFF.has(action)&&!(a.role==='manager'&&MANAGER.has(action))))error('FORBIDDEN');
  if(action==='active_visits'){
   const rows=runtime.listActive(),allowed=[];
   for(const row of rows)if(await mayManageVisit(a,row.visitRef)===true)allowed.push(row);
   return allowed;
  }
  if(action==='read_visit'||action==='case_matches'){
   if(!id(c.targetVisitRef))error('INVALID_TARGET');await permitted(mayManageVisit,a,c.targetVisitRef);
   const v=runtime.read(c.targetVisitRef);
   if(action==='case_matches')return caseIndex&&v.issue?.state?caseIndex.find(v.issue.state):[];
   return v;
  }
  if(action==='analytics'){
   await permitted(mayReviewKnowledge,a,'analytics');return metrics?metrics.summary({days:c.days??7}):[];
  }
  if(action==='monitoring'){
   if(!monitoring)return [];
   const allowed=[];for(const row of monitoring.snapshot())if(await mayManageScope(a,row.scope)===true)allowed.push(row);return allowed;
  }
  if(action==='terminate'||action==='recover'){
   if(!id(c.targetVisitRef))error('INVALID_TARGET');
   await permitted(mayManageVisit,a,c.targetVisitRef);
   if(action==='terminate'){
    runtime.read(c.targetVisitRef);
    if(await revokeHostVisit({actor:a,targetVisitRef:c.targetVisitRef,reason:'staff_termination'})!==true)error('HOST_TERMINATION_UNCONFIRMED');
    ended.add(c.targetVisitRef);
    try{runtime.terminateVisit(c.targetVisitRef);}catch(e){if(e.message!=='VISIT_NOT_ACTIVE')throw e;}
    return {closed:true};
   }
   const before=runtime.read(c.targetVisitRef);
   if(before.version!==c.expectedVersion||before.issue?.issueId!==c.issueId||before.issue?.status!=='awaiting_it'||!id(c.hostRef))error('RECOVERY_NOT_READY');
   if(await verifyRecovery({actor:a,targetVisitRef:c.targetVisitRef,issueId:c.issueId,hostRef:c.hostRef})!==true)error('RECOVERY_NOT_CONFIRMED');
   const next=runtime.resumeRecovery(c.targetVisitRef,c);decisionMetric(next);return studentView(next);
  }
  if(action==='incident_create'){
   await permitted(mayManageScope,a,c.scope??null);
   return registry.create({serviceId:c.serviceId,scope:c.scope??null,expiresInMs:optional(c,'expiresInMs'),actorRef:a.actorRef});
  }
  if(action==='incident_transition'){
   const record=registry.list().find(x=>x.id===c.incidentId);if(!record)error('INCIDENT_NOT_FOUND');
   await permitted(mayManageScope,a,record.scope);
   return registry.transition(record.id,{expectedRevision:c.expectedRevision,status:c.status,expiresInMs:optional(c,'expiresInMs'),actorRef:a.actorRef});
  }
  if(action==='incident_list'||action==='incident_candidates'){
   const rows=action==='incident_list'?registry.list():registry.candidates(),allowed=[];
   for(const row of rows)if(await mayManageScope(a,row.scope)===true)allowed.push(row);
   return allowed;
  }
  await permitted(mayReviewKnowledge,a,action);
  if(action==='propose'){
   if(c.catalogRevision!==getCatalog().revision)error('CATALOG_CHANGED');
   return reviewQueue.propose({...c,actorRef:a.actorRef});
  }
  if(action==='review'){
   const revision=getCatalog().revision;
   if(c.currentCatalogRevision!==revision)error('CATALOG_CHANGED');
   return reviewQueue.review(c.proposalId,{expectedRevision:c.expectedRevision,reviewerRef:a.actorRef,decision:c.decision,currentCatalogRevision:revision});
  }
  if(action==='publication_candidate'){
   if(c.currentCatalogRevision!==getCatalog().revision)error('CATALOG_CHANGED');
   return reviewQueue.publicationCandidate(c.proposalId,{currentCatalogRevision:getCatalog().revision});
  }
  if(action==='review_list')return reviewQueue.list();
  error('INVALID_COMMAND');
 }
 // These trusted hooks are NOT exposed through dispatch. The private gateway
 // obtains the operation payload before executing its own idempotent workflow.
 // No public student can claim successful delivery or supply staff evidence.
 function prepareForHost(visitRef,input){
  return runtime.prepareHandoff(visitRef,input);
 }
 function recordHostDelivery(operationId,result){const o=runtime.recordHandoffResult(operationId,result);if(metrics&&['recorded','unknown'].includes(o.status))try{const v=runtime.read(o.visitRef);metric(o.status==='recorded'?'handoff_recorded':'handoff_unknown',v);}catch{}return o;}
 function hostRetry(visitRef,input){return runtime.retryHandoff(visitRef,input);}
 return Object.freeze({dispatch,prepareForHost,recordHostDelivery,hostRetry,sweep:runtime.sweep});
}
