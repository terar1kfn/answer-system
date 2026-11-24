import {isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAnswerService} from './host-service.mjs';
import {createGuideResolver} from './catalog-adapter.mjs';
import {createModelAdvisor} from './model-advisor.mjs';
import {createOllamaOptionProvider,createOllamaEmbedder} from './providers/ollama.mjs';
import {createHybridRetriever} from './hybrid-retrieval.mjs';
import {openAtomicStore} from './atomic-store.mjs';
import {createDeliveryLedger,createHandoffDispatcher,initialDeliveryLedger,validateDeliveryLedger} from './delivery-ledger.mjs';
import {createMetrics,initialMetrics,validateMetrics} from './analytics.mjs';
import {createMonitorSignals} from './monitor-signals.mjs';
import {createCaseIndex} from './case-retrieval.mjs';
import {createErrorEvidenceIntake} from './error-intake.mjs';
const fail=x=>{throw Error(x);};
/**
 * Server-side composition factory for a future authorized private host.
 * Authentication, guide mapping, scope checks, approved deployment config and
 * all real effects MUST be supplied by that host. No real defaults exist.
 * This is not a deployed AU integration or a multi-process production store.
 */
export function createHostAssembly({
 privateDataDirectory,authenticate,getCatalog,loadReviewedGuide,mayManageVisit,
 mayManageScope,mayReviewKnowledge,revokeHostVisit,verifyRecovery,
 deliverHandoff,lookupHandoff,model={},probes=[],reviewedCases=[],runtimeOptions={},
 ocr={},now=()=>Date.now(),deliveryTimeoutMs=8000
}={}){
 const required=[authenticate,getCatalog,loadReviewedGuide,mayManageVisit,mayManageScope,mayReviewKnowledge,revokeHostVisit,verifyRecovery,deliverHandoff,lookupHandoff,now];
 if(!required.every(f=>typeof f==='function')||typeof privateDataDirectory!=='string'||!isAbsolute(privateDataDirectory)||!Number.isSafeInteger(deliveryTimeoutMs)||deliveryTimeoutMs<1000||deliveryTimeoutMs>60000)fail('HOST_CONFIGURATION_REQUIRED');
 const stores=[];
 function store(name,initial,validate){
  const s=openAtomicStore({directory:privateDataDirectory,name,initial,validate});stores.push(s);return s;
 }
 try{
  const ledger=createDeliveryLedger({store:store('handoff-metadata',initialDeliveryLedger(),validateDeliveryLedger),now});
  const metrics=createMetrics({store:store('aggregate-metrics',initialMetrics(),validateMetrics),now});
  const monitoring=createMonitorSignals({probes,now});
  const caseIndex=createCaseIndex({cases:reviewedCases,getCatalog});
  const resolveGuide=createGuideResolver({getCatalog,loadReviewedGuide});
  const advisor=model.chatEnabled===true?createModelAdvisor({enabled:true,timeoutMs:model.advisorTimeoutMs??1800,provider:createOllamaOptionProvider({enabled:true,model:model.chatModel,port:model.port??11434})}):null;
  const hybridRetriever=model.embeddingEnabled===true?createHybridRetriever({enabled:true,getCatalog,embed:createOllamaEmbedder({enabled:true,model:model.embeddingModel,port:model.port??11434}),timeoutMs:model.embeddingTimeoutMs??4000}):null;
  const intake=createErrorEvidenceIntake(ocr);
  const service=createAnswerService({
   authenticate,getCatalog,now,newId:randomUUID,mayManageVisit,mayManageScope,mayReviewKnowledge,revokeHostVisit,verifyRecovery,
   runtimeOptions,resolveGuide,advisor,hybridRetriever,metrics,monitoring,caseIndex
  });
  function bounded(fn){
   return async input=>{
    const controller=new AbortController();let timer;
    const task=Promise.resolve().then(()=>fn({...input,signal:controller.signal}));
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({status:'unknown'});},deliveryTimeoutMs);});
    try{return await Promise.race([task,timeout]);}catch{return {status:'unknown'};}finally{clearTimeout(timer);}
   };
  }
  // The destination must deduplicate operationId/idempotencyKey durably,
  // including timeouts and late callbacks. No automatic retry on unknown.
  const dispatcher=createHandoffDispatcher({ledger,deliver:bounded(deliverHandoff),lookup:bounded(lookupHandoff)});
  let closed=false;
  function open(){if(closed)fail('HOST_ASSEMBLY_CLOSED');}
  async function dispatch(credential,command){
   open();
   const delivery=['prepare_handoff','retry_handoff'].includes(command?.action);
   if(!delivery)return service.dispatch(credential,command);
   const before=await authenticate(credential);
   if(!before||before.role!=='student'||!before.visitRef)fail('UNAUTHENTICATED');
   const result=await service.dispatch(credential,command);
   const after=await authenticate(credential);
   if(!after||after.role!=='student'||before.visitRef!==after.visitRef||before.actorRef!==after.actorRef)fail('UNAUTHENTICATED');
   const operation=service.prepareForHost(after.visitRef,{expectedVersion:command.expectedVersion,issueId:command.issueId,requestKey:command.requestKey,confirmed:true}).operation;
   let row=ledger.get(operation.operationId);
   if(!(row?.status==='failed'&&row.attempt===operation.attempt)){
    try{row=await dispatcher.send(operation);}catch{row=ledger.get(operation.operationId)||{status:'unknown',attempt:operation.attempt};}
   }
   const status=row.status==='recorded'?'recorded':row.status==='failed'?'failed':'unknown';
   const outcome={attempt:operation.attempt,status,...(status==='recorded'?{hostRef:row.hostRef}:{})};
   try{service.recordHostDelivery(operation.operationId,outcome);}catch(e){if(e.message!=='OPERATION_NOT_FOUND')throw e;}
   // A closed visit must not regain access through an outstanding delivery.
   let visit=null;
   try{visit=await service.dispatch(credential,{action:'read'});}catch(e){if(!['UNAUTHENTICATED','VISIT_NOT_ACTIVE'].includes(e.message))throw e;}
   return {operation:{...result.operation,status},visit,delivery:{status,attempt:operation.attempt}};
  }
  // Trusted operator hooks, not publicly routed student/staff commands.
  async function reconcile(operationId){
   open();const row=await dispatcher.reconcile(operationId);
   let activeVisitUpdated=true;
   try{service.recordHostDelivery(row.operationId,{attempt:row.attempt,status:row.status,...(row.status==='recorded'?{hostRef:row.hostRef}:{})});}
   catch(e){if(e.message==='OPERATION_NOT_FOUND')activeVisitUpdated=false;else throw e;}
   return {operationId:row.operationId,status:row.status,activeVisitUpdated};
  }
  const observeProbe=input=>{open();return monitoring.observe(input);};
  const rebuildKnowledgeIndex=async()=>{open();return hybridRetriever?hybridRetriever.rebuild():{status:'disabled'};};
  const inspectApprovedImage=input=>{open();return intake.inspectImage(input);};
  function status(){open();return {catalogRevision:getCatalog().revision,advisorEnabled:Boolean(advisor),semanticIndex:hybridRetriever?.status()||{enabled:false,ready:false},unresolvedDeliveries:ledger.unresolved().length,persistence:'single_writer_metadata',visits:'transient'};}
  const unresolvedDeliveryRefs=()=>{open();return ledger.unresolved().map(o=>({operationId:o.operationId,attempt:o.attempt,status:o.status}));};
  const sweep=()=>{open();return service.sweep();};
  function close(){if(!closed){closed=true;for(const s of [...stores].reverse())s.close();}}
  return Object.freeze({dispatch,reconcile,observeProbe,rebuildKnowledgeIndex,inspectApprovedImage,status,unresolvedDeliveryRefs,sweep,close});
 }catch(e){for(const s of [...stores].reverse())try{s.close();}catch{}throw e;}
}
