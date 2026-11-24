/**
 * Local fictional workbench. Persona selection is intentionally NOT production
 * authentication. Only this isolated loopback demonstration uses these actors.
 */
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createAnswerService} from './host-service.mjs';
import {demoCatalog} from './demo-knowledge.mjs';
import {SERVICES} from './service-taxonomy.mjs';
import {openAtomicStore} from './atomic-store.mjs';
import {initialCatalogWorkspace,validateCatalogWorkspace,createCatalogWorkspace} from './catalog-workspace.mjs';
import {initialDeliveryLedger,validateDeliveryLedger,createDeliveryLedger,createHandoffDispatcher} from './delivery-ledger.mjs';
import {initialMetrics,validateMetrics,createMetrics} from './analytics.mjs';
import {createMonitorSignals} from './monitor-signals.mjs';
import {createCaseIndex} from './case-retrieval.mjs';
const clone=x=>JSON.parse(JSON.stringify(x)),id=()=>randomUUID();
const fail=x=>{throw Error(x);};
function memoryStore(initial,validate){
 let state={format:1,revision:0,data:clone(initial)};
 if(validate(clone(state.data))!==true)fail('INVALID_STORE_DATA');
 return {snapshot:()=>clone(state),transact(expected,fn){
  if(expected!==state.revision)fail('STORE_REVISION_CONFLICT');const next=clone(state.data),out=fn(next);
  if(out&&typeof out.then==='function')fail('ASYNC_MUTATION_NOT_ALLOWED');
  if(validate(clone(next))!==true)fail('INVALID_STORE_DATA');
  state={format:1,revision:expected+1,data:next};return {snapshot:clone(state),result:out===undefined?null:clone(out)};
 },close(){}};
}
const PERSONAS=[
 {id:'student-a',label:'Student A',role:'student',scope:'site-a',persistent:false},
 {id:'student-b',label:'Student B',role:'student',scope:'site-a',persistent:false},
 {id:'student-c',label:'Student C',role:'student',scope:'site-a',persistent:false},
 {id:'student-remote',label:'Student D — another site',role:'student',scope:'site-b',persistent:false},
 {id:'student-persistent',label:'Authorized persistent student',role:'student',scope:'site-a',persistent:true},
 {id:'intern-demo',label:'IT intern',role:'intern'},
 {id:'manager-demo',label:'IT manager',role:'manager'}
];
const MODE=new Set(['recorded','lost_reply','definitive_failure']);
const DEMO_FACT={id:'demo-fact-reviewed-workspace',serviceId:'identity',title:{en:'What is a verification method?',ar:'ما هي طريقة التحقق؟'},aliases:['what is a verification method','ما هي طريقه التحقق'],answer:{en:'A verification method is an additional way to prove that a sign-in belongs to you. Use only the method registered to your account and do not share approval codes.',ar:'طريقة التحقق وسيلة إضافية للتأكد من أن تسجيل الدخول يخصك. استخدم الطريقة المسجلة لحسابك ولا تشارك رموز الموافقة.'},sourceRef:'synthetic-workspace-fixture',reviewed:true,enabled:true,audience:'student'};
export function createDevelopmentHost({persistDirectory=null}={}){
 const stores=[];
 function store(name,initial,validate){
  const s=persistDirectory?openAtomicStore({directory:resolve(persistDirectory),name,initial,validate}):memoryStore(initial,validate);
  stores.push(s);return s;
 }
 let catalogStore,ledgerStore,metricsStore;
 try{
  catalogStore=store('synthetic-catalog',initialCatalogWorkspace(demoCatalog),validateCatalogWorkspace);
  ledgerStore=store('synthetic-delivery',initialDeliveryLedger(),validateDeliveryLedger);
  metricsStore=store('synthetic-metrics',initialMetrics(),validateMetrics);
 }catch(e){for(const s of stores.reverse())s.close();throw e;}
 const workspace=createCatalogWorkspace({store:catalogStore,newId:id}),getCatalog=workspace.current;
 const ledger=createDeliveryLedger({store:ledgerStore});
 const metrics=createMetrics({store:metricsStore,minimumGroup:1});
 const monitor=createMonitorSignals({probes:[
  {id:'site-a-network',serviceId:'network',scope:'site-a'},
  {id:'site-b-network',serviceId:'network',scope:'site-b'},
  {id:'mail-global',serviceId:'mail',scope:null},
  {id:'portal-global',serviceId:'portal',scope:null}
 ]});
 const cases=createCaseIndex({getCatalog,cases:[
  {id:'sample-recovery',serviceId:'identity',causeCode:'verification_method_unavailable',solutionRef:'demo-mfa-ios',approved:true,signals:[{key:'mfa_access',value:'no'}]},
  {id:'sample-recipients',serviceId:'mail',causeCode:'recipient_restriction',solutionRef:'demo-recipient-limit',approved:true,signals:[{key:'send_error',value:'recipients'}]},
  {id:'sample-connectivity',serviceId:'network',causeCode:'connectivity',solutionRef:'demo-connectivity',approved:true,signals:[{key:'connection',value:'no'},{key:'peers',value:'no'}]}
 ]});
 const actors=new Map(PERSONAS.map(p=>[p.id,{...p,actorRef:p.id,credential:id(),visitRef:p.role==='student'?'visit-'+id():undefined,active:true}]));
 const destination=new Map();
 let deliveryMode='recorded';
 const dispatcher=createHandoffDispatcher({ledger,
  deliver:async({operationId,attempt,kind})=>{
   if(deliveryMode==='definitive_failure'){destination.set(operationId,{status:'failed',definitiveNoEffect:true,attempt});return {status:'failed',definitiveNoEffect:true};}
   const row={status:'recorded',hostRef:'fictional-'+id(),kind,attempt,completed:false};
   destination.set(operationId,row);
   return deliveryMode==='lost_reply'?{status:'unknown'}:{status:'recorded',hostRef:row.hostRef};
  },
  lookup:async({operationId})=>destination.get(operationId)||{status:'unknown'}
 });
 const service=createAnswerService({
  authenticate:async credential=>[...actors.values()].find(a=>a.active&&a.credential===credential)||null,
  getCatalog,newId:id,metrics,monitoring:monitor,caseIndex:cases,
  runtimeOptions:{idleMs:120000,durationMs:600000,maxVisits:32},
  mayManageVisit:async(a,ref)=>['intern','manager'].includes(a.role)&&[...actors.values()].some(p=>p.visitRef===ref),
  mayManageScope:async(a,scope)=>a.role==='manager'&&[null,'site-a','site-b'].includes(scope),
  mayReviewKnowledge:async a=>['intern','manager'].includes(a.role),
  revokeHostVisit:async({targetVisitRef})=>{const p=[...actors.values()].find(x=>x.visitRef===targetVisitRef);if(!p)return false;p.active=false;return true;},
  verifyRecovery:async({hostRef,targetVisitRef,issueId})=>{
   const op=ledgerStore.snapshot().data.operations.find(o=>o.hostRef===hostRef&&o.visitRef===targetVisitRef&&o.issueId===issueId);
   return Boolean(op&&destination.get(op.operationId)?.completed===true);
  },
  resolveGuide:async({guideId,catalogRevision})=>{
   const c=getCatalog();if(c.revision!==catalogRevision)fail('CATALOG_CHANGED');
   const g=c.guides.find(x=>x.id===guideId&&x.reviewed&&x.enabled&&x.audience==='student'&&c.serviceAvailability?.[x.serviceId]!==false);
   if(!g||g.synthetic!==true||!g.steps)fail('GUIDE_UNAVAILABLE');
   return clone({id:g.id,title:g.title,steps:g.steps,sourceRef:'synthetic-guide-fixture',published:true,synthetic:true});
  }
 });
 function actor(persona){const a=actors.get(persona);if(!a)fail('INVALID_PERSONA');return a;}
 function staff(a){if(!['intern','manager'].includes(a.role))fail('FORBIDDEN');}
 function manager(a){if(a.role!=='manager')fail('FORBIDDEN');}
 async function call(a,command){return service.dispatch(a.credential,command);}
 function common(){return {personas:PERSONAS,services:SERVICES.map(s=>({id:s.id,en:s.en,ar:s.ar})),catalogRevision:getCatalog().revision,deliveryMode,persistence:persistDirectory?'synthetic_durable':'memory',model:'disabled'};}
 async function start(a){
  if(a.role!=='student')return common();
  if(a.active){
   try{return await call(a,{action:'open'});}catch(e){if(!['VISIT_NOT_ACTIVE','UNAUTHENTICATED'].includes(e.message))throw e;}
  }
  a.active=true;a.credential=id();a.visitRef='visit-'+id();
  return call(a,{action:'open'});
 }
 async function sendPrepared(a,command){
  // Workbench simulates delivery only after an explicit, authorized intent.
  const first=await call(a,command);
  const prepared=service.prepareForHost(a.visitRef,{expectedVersion:command.expectedVersion,issueId:command.issueId,requestKey:command.requestKey,confirmed:true}).operation;
  let row=ledger.get(prepared.operationId);
  if(!(row?.status==='failed'&&row.attempt===prepared.attempt)){
   try{row=await dispatcher.send(prepared);}catch{row=ledger.get(prepared.operationId)||{status:'unknown',attempt:prepared.attempt};}
  }
  const status=row.status==='recorded'?'recorded':row.status==='failed'?'failed':'unknown';
  try{service.recordHostDelivery(prepared.operationId,{attempt:prepared.attempt,status,...(status==='recorded'?{hostRef:row.hostRef}:{})});}catch(e){if(e.message!=='OPERATION_NOT_FOUND')throw e;}
  return {operation:{...first.operation,status},visit:await call(a,{action:'read'}),delivery:{status,attempt:prepared.attempt,synthetic:true}};
 }
 async function handle({persona,operation,command,data}={}){
  if(operation==='bootstrap')return common();
  const a=actor(persona);
  if(operation==='start')return start(a);
  if(operation==='dispatch'){
   if(!command||typeof command.action!=='string')fail('INVALID_COMMAND');
   if(['prepare_handoff','retry_handoff'].includes(command.action)){
    if(a.role!=='student')fail('FORBIDDEN');return sendPrepared(a,command);
   }
   return call(a,command);
  }
  staff(a);
  if(operation==='staff_snapshot'){
   const visits=await call(a,{action:'active_visits'}),proposals=await call(a,{action:'review_list'});
   return {visits,proposals,...common()};
  }
  if(operation==='complete_recovery'){
   const visits=await call(a,{action:'active_visits'}),v=visits.find(x=>x.visitRef===data?.visitRef);
   if(!v||v.status!=='awaiting_it'||v.handoff?.kind!=='offer_mfa_recovery'||!v.handoff.hostRef)fail('RECOVERY_NOT_READY');
   const d=destination.get(v.handoff.operationId);
   if(!d||d.status!=='recorded'||d.hostRef!==v.handoff.hostRef)fail('RECOVERY_NOT_CONFIRMED');
   d.completed=true;
   return call(a,{action:'recover',targetVisitRef:v.visitRef,expectedVersion:v.version,issueId:v.issueId,hostRef:v.handoff.hostRef});
  }
  if(operation==='reconcile_delivery'){
   const record=ledger.get(data?.operationId);if(!record)fail('OPERATION_NOT_FOUND');
   const row=await dispatcher.reconcile(record.operationId);
   const result={attempt:row.attempt,status:row.status,...(row.status==='recorded'?{hostRef:row.hostRef}:{})};
   let runtimeUpdated=true;
   try{service.recordHostDelivery(row.operationId,result);}catch(e){if(e.message==='OPERATION_NOT_FOUND')runtimeUpdated=false;else throw e;}
   return {status:row.status,runtimeUpdated,synthetic:true};
  }
  if(operation==='ledger_list')return ledgerStore.snapshot().data.operations.map(({operationId,kind,status,attempt,updatedAt})=>({operationId,kind,status,attempt,updatedAt}));
  if(operation==='catalog_workspace'){
   const s=workspace.snapshot();
   return {version:s.revision,currentRevision:s.data.current.revision,guideCount:s.data.current.guides.length,factCount:s.data.current.facts.length,drafts:s.data.drafts.map(d=>({id:d.id,actorRef:d.actorRef,status:d.status,revision:d.revision,baseRevision:d.baseRevision})),history:s.data.history.map(h=>({revision:h.catalog.revision,replacedAt:h.replacedAt})),audit:s.data.audit.slice(-25)};
  }
  if(operation==='stage_catalog'){
   const snap=workspace.snapshot(),candidate=clone(snap.data.current);
   if(data?.preset==='add_fact'){
    candidate.facts??=[];if(candidate.facts.some(f=>f.id===DEMO_FACT.id))fail('FACT_ALREADY_EXISTS');candidate.facts.push(clone(DEMO_FACT));
   }else if(data?.preset==='disable_sample_guide'){
    const g=candidate.guides.find(g=>g.id==='demo-recipient-limit');if(!g)fail('GUIDE_UNAVAILABLE');g.enabled=false;
   }else fail('INVALID_PRESET');
   return workspace.draft({expectedVersion:snap.revision,baseRevision:snap.data.current.revision,candidate,actorRef:a.actorRef}).result;
  }
  if(operation==='review_catalog'){
   const snap=workspace.snapshot();
   return workspace.review({expectedVersion:snap.revision,draftId:data?.draftId,expectedDraftRevision:data?.expectedDraftRevision,reviewerRef:a.actorRef,decision:data?.decision}).result;
  }
  if(operation==='publish_catalog'){
   manager(a);const snap=workspace.snapshot();
   const result=workspace.publish({expectedVersion:snap.revision,draftId:data?.draftId,expectedDraftRevision:data?.expectedDraftRevision,publisherRef:a.actorRef}).result;
   return {revision:result.revision,synthetic:true};
  }
  if(operation==='restore_catalog'){
   manager(a);const snap=workspace.snapshot();
   return workspace.restoreDraft({expectedVersion:snap.revision,revision:data?.revision,actorRef:a.actorRef}).result;
  }
  manager(a);
  if(operation==='manager_snapshot'){
   const [incidents,candidates,monitoring,analytics]=await Promise.all([call(a,{action:'incident_list'}),call(a,{action:'incident_candidates'}),call(a,{action:'monitoring'}),call(a,{action:'analytics',days:7})]);
   return {incidents,candidates,monitoring,analytics,monitorCandidates:monitor.candidates(),deliveryMode};
  }
  if(operation==='set_delivery_mode'){
   if(!MODE.has(data?.mode))fail('INVALID_DELIVERY_MODE');deliveryMode=data.mode;return {deliveryMode};
  }
  if(operation==='observe_probe'){
   return monitor.observe({probeId:data?.probeId,status:data?.status,observedAt:Date.now()});
  }
  fail('INVALID_WORKBENCH_OPERATION');
 }
 function close(){for(const s of [...stores].reverse())s.close();}
 return Object.freeze({handle,close});
}
