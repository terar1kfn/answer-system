import {createEngine} from './engine.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const fail=x=>{throw Error(x);};
// Trusted in-process coordinator, NOT an authentication boundary or HTTP API.
// The host authenticates every caller, chooses policy, and supplies the visit ID.
export function createRuntime({getCatalog,getIncidents=()=>[],now=()=>Date.now(),newId=()=>globalThis.crypto.randomUUID(),idleMs=120000,durationMs=600000,maxVisits=128,maxRecords=1000}={}){
 if(![getCatalog,getIncidents,now,newId].every(x=>typeof x==='function')||![idleMs,durationMs,maxVisits,maxRecords].every(x=>Number.isSafeInteger(x)&&x>0)||durationMs<idleMs)fail('INVALID_RUNTIME_CONFIG');
 const visits=new Map(),operations=new Map();
 function id(){const x=newId();if(!idOk(x))fail('INVALID_GENERATED_ID');return x;}
 function erase(v){
  visits.delete(v.visitRef);
  for(const [k,o] of operations)if(o.visitRef===v.visitRef){
   if(['prepared','unknown'].includes(o.status)){o.visitClosed=true;o.payload=null;}
   else operations.delete(k);
  }
 }
 function sweep(){const t=now();for(const v of visits.values())if(!v.persistent&&(t-v.touchedAt>=idleMs||t-v.startedAt>=durationMs))erase(v);}
 function active(ref){sweep();const v=visits.get(ref);if(!v)fail('VISIT_NOT_ACTIVE');return v;}
 function version(v,n){if(n!==v.version||!Number.isSafeInteger(n))fail('STALE_VISIT_VERSION');}
 function issue(v,issueId){if(!v.issue||v.issue.issueId!==issueId)fail('ISSUE_NOT_ACTIVE');return v.issue;}
 function e(v,check=true){
  const c=getCatalog();
  if(check&&v.issue&&v.issue.state.catalogRevision!==c.revision)fail('CATALOG_CHANGED');
  return createEngine({catalog:c,incidents:getIncidents(v.scope),now});
 }
 function snap(v){return copy({visitRef:v.visitRef,scope:v.scope,persistent:v.persistent,version:v.version,issue:v.issue});}
 function update(v){v.version++;v.touchedAt=now();return snap(v);}
 function openVisit({visitRef,scope=null,persistent=false}={}){
  sweep();
  if(!idOk(visitRef)||!(scope===null||idOk(scope))||typeof persistent!=='boolean')fail('INVALID_VISIT');
  if(visits.has(visitRef)||[...operations.values()].some(o=>o.visitRef===visitRef))fail('VISIT_ALREADY_EXISTS');
  if(visits.size>=maxVisits)fail('VISIT_CAPACITY');
  const t=now(),v={visitRef,scope,persistent,version:0,issue:null,history:[],startedAt:t,touchedAt:t};visits.set(visitRef,v);return snap(v);
 }
 function read(ref){
  const v=active(ref),i=v.issue;
  const changed=i&&i.state.catalogRevision!==getCatalog().revision;
  const staleNotice=i?.state.decision.kind==='incident_notice'&&!getIncidents(v.scope).some(r=>r.id===i.state.decision.incidentRef&&r.status==='confirmed'&&r.authority==='authorized_staff'&&r.updatedAt<=now()&&now()-r.updatedAt<=900000&&r.expiresAt>now());
  if(changed||staleNotice)return copy({...snap(v),issue:{issueId:i.issueId,status:'refresh_required'}});
  return snap(v);
 }
 function begin(ref,{expectedVersion,text,language='en'}={}){
  const v=active(ref);version(v,expectedVersion);
  const pending=operations.get(v.issue?.handoffRef);
  if(pending&&['prepared','unknown'].includes(pending.status))fail('HANDOFF_UNCERTAIN');
  const state=e(v,false).begin({text,language}),issueId=id();
  if([...visits.values()].some(x=>x.issue?.issueId===issueId))fail('ISSUE_ID_COLLISION');
  for(const [k,o] of operations)if(o.visitRef===ref&&!['prepared','unknown'].includes(o.status))operations.delete(k);
  v.history=[];v.issue={issueId,state,status:state.status,handoffRef:null,guideProgress:[]};return update(v);
 }
 function respond(ref,{expectedVersion,issueId,questionId,optionId,text}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId);
  if(i.handoffRef)fail('HANDOFF_IN_PROGRESS');
  const engine=e(v),s=i.state;let next;
  if(text!==undefined){
   if(questionId!==undefined||optionId!==undefined)fail('AMBIGUOUS_INPUT');
   const r=engine.respond(s,{expectedTurn:s.turn,text});
   if(r.kind==='clarify'){v.touchedAt=now();return {kind:'clarify',reasonCode:r.reasonCode,visit:snap(v)};}
   next=r.state;
  }else next=engine.advance(s,{expectedTurn:s.turn,questionId,optionId});
  v.history=[...v.history,copy(s)].slice(-12);i.state=next;i.status=next.status;return {kind:'advanced',visit:update(v)};
 }
 function undo(ref,{expectedVersion,issueId}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId);
  if(i.handoffRef||i.state.decision.kind==='safety_referral'||!v.history.length)fail('UNDO_NOT_AVAILABLE');
  const prior=copy(v.history[v.history.length-1]);prior.language=i.state.language;
  const next=e(v).reconsider(prior,{nextTurn:i.state.turn+1});v.history.pop();i.state=next;i.status=next.status;return update(v);
 }
 function cancelIssue(ref,{expectedVersion,issueId}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId);
  if(i.handoffRef)fail('HANDOFF_IN_PROGRESS');v.issue=null;v.history=[];return update(v);
 }
 function setLanguage(ref,{expectedVersion,issueId,language}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId);e(v);
  if(!['en','ar'].includes(language))fail('INVALID_LANGUAGE');i.state={...i.state,language};return update(v);
 }
 function recordGuideProgress(ref,{expectedVersion,issueId,guideId,step,total}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId);e(v);
  if(i.handoffRef||i.state.decision.kind!=='open_guide'||i.state.decision.guideId!==guideId||!Number.isSafeInteger(step)||!Number.isSafeInteger(total)||total<1||total>200||step<1||step>total)fail('INVALID_GUIDE_PROGRESS');
  const prior=i.guideProgress.find(g=>g.guideId===guideId);const row={guideId,totalSteps:total,lastViewedStep:step,furthestStep:Math.min(total,Math.max(prior?.furthestStep||0,step))};
  i.guideProgress=[...i.guideProgress.filter(g=>g.guideId!==guideId),row].slice(-30);return update(v);
 }
 function keepAlive(ref){const v=active(ref);v.touchedAt=now();return {version:v.version};}
 function finishVisit(ref){const v=active(ref);if(v.persistent)fail('STAFF_TERMINATION_REQUIRED');erase(v);return {closed:true};}
 function terminateVisit(ref){erase(active(ref));return {closed:true};}
 function prepareHandoff(ref,{expectedVersion,issueId,requestKey,confirmed}={}){
  const v=active(ref),i=issue(v,issueId);
  if(confirmed!==true||!idOk(requestKey))fail('CONFIRMATION_REQUIRED');
  if(i.handoffRef){
   const o=operations.get(i.handoffRef);if(!o||o.requestKey!==requestKey)fail('HANDOFF_ALREADY_EXISTS');
   return copy({operation:o,visit:snap(v)});
  }
  version(v,expectedVersion);e(v);
  const s=i.state,kind=s.decision.kind;
  if(!['offer_support','offer_mfa_recovery'].includes(kind))fail('HANDOFF_NOT_OFFERED');
  if(operations.size>=maxRecords)fail('HANDOFF_CAPACITY');
  const operationId=id();if(operations.has(operationId))fail('OPERATION_ID_COLLISION');
  const payload=copy({issueId,kind,services:s.services,domain:s.domain,reasonCode:s.decision.reasonCode,evidence:s.evidence,candidates:s.candidates,offeredGuideIds:s.offeredGuideIds,guideProgress:i.guideProgress,askedQuestionIds:s.askedQuestionIds,catalogRevision:s.catalogRevision,ruleVersion:s.ruleVersion});
  const o={operationId,visitRef:ref,issueId,requestKey,kind,status:'prepared',payload,visitClosed:false,createdAt:now(),attempt:1};
  operations.set(operationId,o);i.handoffRef=operationId;i.status='handoff_prepared';
  return copy({operation:o,visit:update(v)});
 }
 // Trusted delivery callback. Timeout = unknown, NOT failed.
 function recordHandoffResult(operationId,{attempt,status,hostRef}={}){
  sweep();const o=operations.get(operationId);if(!o)fail('OPERATION_NOT_FOUND');
  if(o.attempt!==attempt)fail('STALE_ATTEMPT');
  if(!['recorded','failed','unknown'].includes(status)||(status==='recorded'&&!idOk(hostRef))||(status!=='recorded'&&hostRef!==undefined))fail('INVALID_DELIVERY_RESULT');
  if(o.status==='recorded'){if(status==='recorded'&&o.hostRef===hostRef)return copy(o);fail('DELIVERY_ALREADY_RECORDED');}
  if(o.status==='failed'){if(status==='failed')return copy(o);fail('ATTEMPT_ALREADY_FAILED');}
  if(o.status==='unknown'&&status==='unknown')return copy(o);
  o.status=status;if(status==='recorded')o.hostRef=hostRef;
  const v=visits.get(o.visitRef);
  if(v?.issue?.handoffRef===operationId){
   v.issue.status=status==='recorded'?(o.kind==='offer_mfa_recovery'?'awaiting_it':'escalated'):status==='failed'?'handoff_failed':'handoff_unknown';v.version++;
  }
  const out=copy(o);if(o.visitClosed&&status!=='unknown')operations.delete(operationId);return out;
 }
 function retryHandoff(ref,{issueId,expectedVersion,requestKey}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId),o=operations.get(i.handoffRef);
  if(!o||o.requestKey!==requestKey)fail('OPERATION_NOT_FOUND');
  if(o.status!=='failed')fail('RETRY_NOT_SAFE');if(o.attempt>=3)fail('RETRY_LIMIT');
  e(v);o.status='prepared';o.attempt++;i.status='handoff_prepared';return copy({operation:o,visit:update(v)});
 }
 // Call only after independently verifying the host's real recovery completion.
 function resumeRecovery(ref,{issueId,expectedVersion,hostRef}={}){
  const v=active(ref);version(v,expectedVersion);const i=issue(v,issueId),o=operations.get(i.handoffRef);
  if(!o||o.status!=='recorded'||o.kind!=='offer_mfa_recovery'||o.hostRef!==hostRef)fail('RECOVERY_NOT_CONFIRMED');
  const next=e(v).resumeRecovery(i.state,{expectedTurn:i.state.turn});
  operations.delete(o.operationId);i.handoffRef=null;i.state=next;i.status=next.status;v.history=[];return update(v);
 }
 function listActive(){
  sweep();return [...visits.values()].map(v=>({
   visitRef:v.visitRef,scope:v.scope,persistent:v.persistent,version:v.version,startedAt:v.startedAt,touchedAt:v.touchedAt,
   issueId:v.issue?.issueId??null,status:v.issue?.status??'ready',services:v.issue?.state.services||[],decision:v.issue?.state.decision.kind??null,canUndo:Boolean(v.history.length&&!v.issue?.handoffRef&&v.issue?.state.decision.kind!=='safety_referral'),
   handoff:v.issue?.handoffRef?(()=>{const o=operations.get(v.issue.handoffRef);return o?{operationId:o.operationId,status:o.status,kind:o.kind,hostRef:o.hostRef??null,attempt:o.attempt}:null;})():null
  })).map(copy);
 }
 return Object.freeze({openVisit,read,begin,respond,undo,cancelIssue,setLanguage,recordGuideProgress,keepAlive,finishVisit,terminateVisit,prepareHandoff,recordHandoffResult,retryHandoff,resumeRecovery,sweep,listActive});
}
