import {createSolutionEffectiveness,initialEffectiveness,validateEffectiveness} from '../solution-effectiveness.mjs';
import {openAtomicStore} from '../atomic-store.mjs';
import {isAbsolute} from 'node:path';
import {nativeRecordFingerprint} from './native-catalog.mjs';
import {eligible} from '../knowledge.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
/**
 * Host-only learning integration. The browser must never submit an outcome
 * record or call this API as a student. The native host independently retrieves
 * a finalized attempt record, verifies observation provenance, and loads the
 * exact historical published guide used in that attempt.
 */
export function createNativeLearningService({ledger,authenticate,mayReviewKnowledge,mayManageOutcome,getFinalizedOutcome,
 verifyFinalizedOutcome,loadHistoricalGuide,mayReadHistoricalGuide,getReportingScope,getCurrentCatalog}={}){
 if(!ledger||typeof ledger.record!=='function'||typeof ledger.summary!=='function'||
 ![authenticate,mayReviewKnowledge,mayManageOutcome,getFinalizedOutcome,verifyFinalizedOutcome,loadHistoricalGuide,mayReadHistoricalGuide,getReportingScope,getCurrentCatalog].every(f=>typeof f==='function'))fail('NATIVE_LEARNING_HOOKS_REQUIRED');
 async function actor(credential){
  const a=await authenticate(credential);
  if(!a||a.active!==true||!['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)||!id(a.actorRef)||await mayReviewKnowledge(a)!==true)fail('FORBIDDEN');
  return a;
 }
 async function recheck(credential,before){
  const a=await actor(credential);if(a.role!==before.role||a.actorRef!==before.actorRef)fail('FORBIDDEN');return a;
 }
 async function importFinalized(credential,receiptRef){
  if(!id(receiptRef))fail('INVALID_OUTCOME_RECEIPT');
  const a=await actor(credential);
  if(await mayManageOutcome(a,receiptRef)!==true)fail('FORBIDDEN');
  const record=await getFinalizedOutcome({actor:a,receiptRef});
  if(!record||record.status!=='finalized'||record.receiptRef!==receiptRef||
   !id(record.guideId)||!id(record.sourceRevision)||await verifyFinalizedOutcome({actor:a,record})!==true)fail('OUTCOME_NOT_VERIFIED_BY_HOST');
  const source=await loadHistoricalGuide({actor:a,guideId:record.guideId,sourceRevision:record.sourceRevision});
  if(!source||source.guide?.id!==record.guideId||source.sourceRevision!==record.sourceRevision||
   source.serviceId!==record.serviceId||source.purpose!==record.purpose||
   nativeRecordFingerprint(source.guide)!==record.guideFingerprint||
   await mayReadHistoricalGuide(a,source)!==true)fail('HISTORICAL_GUIDE_UNVERIFIED');
  const latest=await recheck(credential,a);
  if(await mayManageOutcome(latest,receiptRef)!==true||await mayReadHistoricalGuide(latest,source)!==true)fail('FORBIDDEN');
  const fresh=await getFinalizedOutcome({actor:latest,receiptRef});
  // Re-read after authorization/verification: a corrected finalized record
  // cannot silently be imported with an earlier revision or changed content.
  const fields=['receiptRef','occurredAt','guideId','guideFingerprint','serviceId','purpose','ruleVersion','revision','completion','outcome','provenance','attribution','sourceRevision','status'];
  if(!fresh||fields.some(k=>fresh[k]!==record[k]))fail('OUTCOME_CHANGED_REVIEW_AGAIN');
  return ledger.record(Object.fromEntries(fields.filter(k=>!['sourceRevision','status'].includes(k)).map(k=>[k,record[k]])));
 }
 async function report(credential,{days=30}={}){
  const a=await actor(credential),scope=await getReportingScope(a);
  if(!scope||!Array.isArray(scope.serviceIds)||!Array.isArray(scope.allowedGuideIds))fail('FORBIDDEN');
  const current=await getCurrentCatalog(a);
  const results=ledger.summary({days,serviceIds:scope.serviceIds,allowedGuideIds:scope.allowedGuideIds});
  const latest=await recheck(credential,a),next=await getReportingScope(latest),catalog=await getCurrentCatalog(latest);
  if(!next||!Array.isArray(next.serviceIds)||!Array.isArray(next.allowedGuideIds)||catalog.revision!==current.revision)fail('LEARNING_SCOPE_CHANGED');
  return {kind:'private_effectiveness_report',days,rows:results.filter(r=>next.serviceIds.includes(r.serviceId)&&next.allowedGuideIds.includes(r.guideId)).map(r=>({...r,
   currentGuideVersion:catalog.guides.some(g=>g.id===r.guideId&&g.serviceId===r.serviceId&&g.purpose===r.purpose&&g.nativeGuideFingerprint===r.guideFingerprint&&eligible(g,{catalog})),
   recommendation:r.reviewSignal?'Prepare an independent knowledge review; do not automatically alter guide selection.':null})),automaticRoutingChanges:false};
 }
 return Object.freeze({importFinalized,report});
}
export function openNativeLearningStore({privateDataDirectory,receiptKey,retentionDays,minimumGroup,now}={}){
 if(typeof privateDataDirectory!=='string'||!isAbsolute(privateDataDirectory))fail('PRIVATE_DATA_DIRECTORY_REQUIRED');
 const store=openAtomicStore({directory:privateDataDirectory,name:'guide-effectiveness',initial:initialEffectiveness(),validate:validateEffectiveness,maxBytes:32*1024*1024});
 try{
  const ledger=createSolutionEffectiveness({store,receiptKey,retentionDays,minimumGroup,now});
  return Object.freeze({ledger,close:()=>store.close()});
 }catch(e){store.close();throw e;}
}
