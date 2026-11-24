import {nativeRecordFingerprint,projectNativeCatalog} from './native-catalog.mjs';
import {inspectSourceKnowledgePack} from './source-knowledge-drafts.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const revision=c=>String(c.gatewayRevision??c.revision);
const exact=(xs,key)=>Array.isArray(xs)&&xs.length<=5000&&xs.every(x=>x&&id(x[key]))&&new Set(xs.map(x=>x[key])).size===xs.length;
function checkSnapshot(c){
 if(!c||!Number.isSafeInteger(c.gatewayRevision??c.revision)||(c.gatewayRevision??c.revision)<0||
 !exact(c.services,'id')||!exact(c.guides,'id'))fail('INVALID_PROPOSAL_REBASE_SNAPSHOT');
}
function referenceChanges(ids,before,current){
 return ids.map(guideId=>{
  const a=before.get(guideId),b=current.get(guideId);
  const previousFingerprint=a?nativeRecordFingerprint(a):null,currentFingerprint=b?nativeRecordFingerprint(b):null;
  return {guideId,previousFingerprint,currentFingerprint,status:!a?'missing_baseline':!b?'removed':previousFingerprint===currentFingerprint?'unchanged':'changed'};
 });
}
/** Source proposal inventory for private review. Compare exact historical and
 * current snapshots rather than rewriting the previous draft's source pin.
 * Potential owner and overlapping purpose are review leads, not approvals. */
export function planSourceProposalReconciliation({pack,baselineConfiguration,projectionInput,ownerSelections=[]}={}){
 inspectSourceKnowledgePack(pack);
 checkSnapshot(baselineConfiguration);checkSnapshot(projectionInput?.configuration);
 const c=projectionInput.configuration,old=baselineConfiguration;
 if(pack.sourceRevision!==revision(old)||pack.sourceCatalogFingerprint!==nativeRecordFingerprint(old))fail('PROPOSAL_BASELINE_MISMATCH');
 const sourceCatalogFingerprint=nativeRecordFingerprint(c),sourceRevision=revision(c);
 const relation=Number(sourceRevision)<Number(pack.sourceRevision)?'revision_rollback':sourceRevision===pack.sourceRevision?
 sourceCatalogFingerprint===pack.sourceCatalogFingerprint?'identical':'same_revision_content_changed':'newer_revision';
 if(!Array.isArray(ownerSelections)||ownerSelections.length>100||!ownerSelections.every(s=>s&&id(s.proposalId)&&id(s.nativeServiceId))||
 new Set(ownerSelections.map(s=>s.proposalId)).size!==ownerSelections.length||
 ownerSelections.some(s=>!pack.proposals.some(p=>p.id===s.proposalId)))fail('INVALID_PROPOSAL_OWNER_SELECTION');
 const mapping=projectionInput.mapping;
 if(mapping?.sourceRevision!==sourceRevision||mapping?.sourceCatalogFingerprint!==sourceCatalogFingerprint)fail('RECONCILED_MAPPING_REQUIRED');
 const projection=projectNativeCatalog(projectionInput);
 const before=new Map(old.guides.map(g=>[g.id,g])),current=new Map(c.guides.map(g=>[g.id,g]));
 const oldServices=new Map(old.services.map(s=>[s.id,s])),currentServices=new Map(c.services.map(s=>[s.id,s]));
 const selections=new Map(ownerSelections.map(s=>[s.proposalId,s.nativeServiceId]));
 const rows=pack.proposals.map(p=>{
  const owners=mapping.services.filter(s=>s.serviceId===p.serviceId&&currentServices.has(s.nativeId)&&projectionInput.allowedNativeServiceIds.includes(s.nativeId)).map(s=>s.nativeId).sort();
  const nativeServiceId=selections.get(p.id)??null,owner=nativeServiceId?currentServices.get(nativeServiceId):null,previousOwner=nativeServiceId?oldServices.get(nativeServiceId):null;
  const selected=Boolean(owner&&owners.includes(nativeServiceId));
  const available=selected&&projection.availableNativeServices.some(s=>s.nativeId===nativeServiceId&&s.serviceId===p.serviceId);
  const references=referenceChanges(p.existingGuideIds,before,current);
  const overlappingGuideIds=projection.catalog.guides.filter(g=>g.serviceId===p.serviceId&&g.purpose===p.purpose).map(g=>g.id);
  const holds=[];
  if(['revision_rollback','same_revision_content_changed'].includes(relation))holds.push('CATALOG_INTEGRITY_REVIEW_REQUIRED');
  if(!projection.catalog.diagnosticServices.includes(p.serviceId))holds.push('PROPOSAL_OUT_OF_SCOPE');
  if(!owners.length)holds.push('NATIVE_OWNER_MAPPING_REQUIRED');
  else if(!selected)holds.push('EXACT_NATIVE_OWNER_REVIEW_REQUIRED');
  else if(!available)holds.push('NATIVE_SERVICE_UNAVAILABLE');
  if(owner&&(!previousOwner||nativeRecordFingerprint(previousOwner)!==nativeRecordFingerprint(owner)))holds.push('NATIVE_OWNER_CHANGED_REVIEW');
  if(references.some(r=>['removed','missing_baseline'].includes(r.status)))holds.push('EXISTING_GUIDE_REFERENCE_REVIEW_REQUIRED');
  if(references.some(r=>r.status==='changed'))holds.push('EXISTING_GUIDE_CONTENT_CHANGED');
  if(overlappingGuideIds.length)holds.push('EXISTING_PURPOSE_OVERLAP_REVIEW');
  if(!['new_guide','revise_guide'].includes(p.kind)||!p.purpose)holds.push('NATIVE_REFERRAL_OR_POLICY_REVIEW');
  return {proposalId:p.id,proposalFingerprint:nativeRecordFingerprint(p),kind:p.kind,serviceId:p.serviceId,purpose:p.purpose,
   ownerCandidates:owners,nativeServiceId:selected?nativeServiceId:null,ownerFingerprint:selected?nativeRecordFingerprint(owner):null,
   referenceChanges:references,overlappingGuideIds,holds,disposition:holds.length?'needs_specific_review':'candidate_for_rebase_review'};
 });
 return {kind:'private_proposal_reconciliation_plan',status:'needs_independent_review',sourceRevision,sourceCatalogFingerprint,
  previousSourceRevision:pack.sourceRevision,previousSourceCatalogFingerprint:pack.sourceCatalogFingerprint,relation,
  mappingRevision:projection.catalog.mappingRevision,catalogRevision:projection.catalog.revision,rows,published:false,activated:false};
}
/**
 * Rebase selected unchanged-content proposals only after independent private
 * review of the current owner and every reference. A removed guide, wrong
 * owner, unavailable service, protected/referral/policy row or overlapping
 * current guide must be resolved in a separate review, not force-enabled.
 * A rebased draft requires source verification again at the new pin.
 */
export async function prepareRebasedSourceKnowledgePack({pack,baselineConfiguration,projectionInput,ownerSelections,
 decisions,verifyRebaseDecision}={}){
 const plan=planSourceProposalReconciliation({pack,baselineConfiguration,projectionInput,ownerSelections});
 if(['revision_rollback','same_revision_content_changed'].includes(plan.relation))fail('CATALOG_INTEGRITY_REVIEW_REQUIRED');
 if(!Array.isArray(decisions)||!decisions.length||decisions.length>100||
 !decisions.every(d=>d&&id(d.proposalId)&&id(d.reviewerRef)&&id(d.reviewRef))||
 new Set(decisions.map(d=>d.proposalId)).size!==decisions.length||typeof verifyRebaseDecision!=='function')fail('PROPOSAL_REBASE_DECISION_REQUIRED');
 const recheckable=new Set(['NATIVE_OWNER_CHANGED_REVIEW','EXISTING_GUIDE_CONTENT_CHANGED']);
 const selected=[],reviewRefs=[];
 for(const d of decisions){
  const row=plan.rows.find(r=>r.proposalId===d.proposalId);
  if(!row||row.holds.some(h=>!recheckable.has(h))||
   d.sourceCatalogFingerprint!==plan.sourceCatalogFingerprint||d.rowFingerprint!==nativeRecordFingerprint(row)||
   d.proposalFingerprint!==row.proposalFingerprint||d.nativeServiceId!==row.nativeServiceId||
   d.ownerFingerprint!==row.ownerFingerprint||d.applicabilityReviewed!==true||
   await verifyRebaseDecision({decision:clone(d),row:clone(row),proposal:clone(pack.proposals.find(p=>p.id===row.proposalId))})!==true)fail('PROPOSAL_REBASE_REVIEW_INCOMPLETE');
  selected.push(clone(pack.proposals.find(p=>p.id===row.proposalId)));
  reviewRefs.push({proposalId:d.proposalId,reviewRef:d.reviewRef,reviewerRef:d.reviewerRef,nativeServiceId:row.nativeServiceId});
 }
 const used=new Set(selected.flatMap(p=>p.steps.flatMap(s=>s.sourceIds)));
 const candidatePack={kind:'private_knowledge_gap_pack',schemaVersion:1,status:'needs_independent_review',private:true,published:false,activated:false,
  sourceRevision:plan.sourceRevision,sourceCatalogFingerprint:plan.sourceCatalogFingerprint,sources:clone(pack.sources.filter(s=>used.has(s.id))),proposals:selected};
 inspectSourceKnowledgePack(candidatePack);
 return {kind:'private_rebased_knowledge_draft',status:'needs_source_and_applicability_review',candidatePack,reviewRefs,
  previousSourceRevision:plan.previousSourceRevision,previousSourceCatalogFingerprint:plan.previousSourceCatalogFingerprint,
  sourceReviewCarriedForward:false,published:false,activated:false};
}
export function createProposalReconciliationReviewer({authenticate,mayReviewKnowledge,getPrivateInput}={}){
 if(![authenticate,mayReviewKnowledge,getPrivateInput].every(f=>typeof f==='function'))fail('PROPOSAL_RECONCILIATION_HOST_REQUIRED');
 const permitted=async a=>a&&a.active===true&&['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)&&id(a.actorRef)&&await mayReviewKnowledge(a)===true;
 return async function review(credential){
  const actor=await authenticate(credential);if(!await permitted(actor))fail('FORBIDDEN');
  const input=await getPrivateInput(actor),plan=planSourceProposalReconciliation(input);
  const latest=await authenticate(credential);
  if(!await permitted(latest)||latest.actorRef!==actor.actorRef||latest.role!==actor.role)fail('FORBIDDEN');
  const fresh=planSourceProposalReconciliation(await getPrivateInput(latest));
  if(nativeRecordFingerprint(fresh)!==nativeRecordFingerprint(plan))fail('PROPOSAL_RECONCILIATION_CHANGED');
  return plan;
 };
}
