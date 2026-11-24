import {nativeRecordFingerprint,projectNativeCatalog} from './native-catalog.mjs';
import {knownGuidePurpose} from '../guide-purposes.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
import {validGuidePrerequisites} from '../diagnostic-evidence.mjs';
import {inspectNativeGuideRoute} from './native-route-review.mjs';
const fail=code=>{throw Error(code);};
const clone=x=>JSON.parse(JSON.stringify(x));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const unique=(xs,key)=>new Set(xs.map(x=>x[key])).size===xs.length;
const boundedRows=(xs,key)=>Array.isArray(xs)&&xs.length<=5000&&xs.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&id(x[key]))&&unique(xs,key);
function revision(c){
 if(!c||!Number.isSafeInteger(c.revision)||c.revision<0||
  c.gatewayRevision!==undefined&&(!Number.isSafeInteger(c.gatewayRevision)||c.gatewayRevision<0)||
  !boundedRows(c.services,'id')||!boundedRows(c.guides,'id'))fail('INVALID_RECONCILIATION_SNAPSHOT');
 return String(c.gatewayRevision??c.revision);
}
function validateMapping(m){
 if(!m||!id(m.revision)||!(/^(0|[1-9]\d{0,15})$/.test(m.sourceRevision))||
 !Number.isSafeInteger(Number(m.sourceRevision))||!hash(m.sourceCatalogFingerprint)||
 !boundedRows(m.services,'nativeId')||!boundedRows(m.guides,'guideId')||
 !m.services.every(s=>isServiceId(s.serviceId)))fail('PINNED_MAPPING_REQUIRED');
 const owners=new Map(m.services.map(s=>[s.nativeId,s.serviceId]));
 for(const g of m.guides){
  if(!id(g.nativeServiceId)||!owners.has(g.nativeServiceId)||!id(g.purpose)||
  !hash(g.expectedFingerprint)||!['diagnostic','resolution'].includes(g.entryMode)||
  !validGuidePrerequisites(g.requires,{requireUnique:true}))fail('PINNED_GUIDE_MAPPING_REQUIRED');
 }
}
function inventory(before,current){
 const a=new Map((before||[]).map(x=>[x.id,x])),b=new Map(current.map(x=>[x.id,x]));
 const present=[...b.keys()].sort();
 if(!before)return {comparisonAvailable:false,currentIds:present};
 return {comparisonAvailable:true,added:present.filter(x=>!a.has(x)),removed:[...a.keys()].filter(x=>!b.has(x)).sort(),
  changed:present.filter(x=>a.has(x)&&nativeRecordFingerprint(a.get(x))!==nativeRecordFingerprint(b.get(x))),
  unchanged:present.filter(x=>a.has(x)&&nativeRecordFingerprint(a.get(x))===nativeRecordFingerprint(b.get(x)))};
}
/** Distinguish changed presentation metadata from changed routing or policy.
 * This is review information only: every changed owner remains held by the
 * default reconciliation rule until independently reviewed and re-pinned. */
export function describeNativeServiceChanges(before,current){
 if(!Array.isArray(before)||!Array.isArray(current))fail('SERVICE_BASELINE_REQUIRED');
 const previous=new Map(before.map(s=>[s.id,s]));
 return current.filter(s=>previous.has(s.id)).map(s=>{
  const a=previous.get(s.id),keys=[...new Set([...Object.keys(a),...Object.keys(s)])].sort();
  const changedFields=keys.filter(k=>Object.hasOwn(a,k)!==Object.hasOwn(s,k)||Object.hasOwn(a,k)&&Object.hasOwn(s,k)&&nativeRecordFingerprint(a[k])!==nativeRecordFingerprint(s[k]));
  return {nativeServiceId:s.id,previousFingerprint:nativeRecordFingerprint(a),currentFingerprint:nativeRecordFingerprint(s),changedFields,
   changeClass:!changedFields.length?'unchanged':changedFields.every(k=>['order','descriptionEn','descriptionAr','icon'].includes(k))?'presentation_metadata_changed':'routing_or_other_metadata_changed',
   requiresReview:changedFields.length>0};
 });
}
/**
 * Private operator/reviewer computation, not student routing or publishing.
 * The host supplies its current authoritative configuration and exact policy
 * callbacks. This function never reads a URL, enables a service, rewrites a
 * changed fingerprint as reviewed, or publishes a mapping.
 *
 * baselineConfiguration is optional only for row-level pin comparison. Without
 * it, added/removed/changed catalog inventory is explicitly unknown. A prior
 * mapping's row fingerprint is still mandatory.
 */
export function reconcileNativeMapping({configuration,baselineConfiguration=null,previousMapping,allowedNativeServiceIds,diagnosticServices,
 isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu}={},
 {nextMappingRevision,holds=[]}={}){
 const sourceRevision=revision(configuration);
 validateMapping(previousMapping);
 if(!id(nextMappingRevision)||nextMappingRevision===previousMapping.revision||
 !Array.isArray(holds)||holds.length>5000||!holds.every(h=>h&&id(h.guideId)&&id(h.reasonCode))||
 !unique(holds,'guideId'))fail('INVALID_RECONCILIATION_OPTIONS');
 const sourceCatalogFingerprint=nativeRecordFingerprint(configuration);
 if(baselineConfiguration!==null&&
  (revision(baselineConfiguration)!==previousMapping.sourceRevision||
   nativeRecordFingerprint(baselineConfiguration)!==previousMapping.sourceCatalogFingerprint))fail('BASELINE_SNAPSHOT_MISMATCH');
 const relation=Number(sourceRevision)<Number(previousMapping.sourceRevision)?'revision_rollback':
  sourceRevision===previousMapping.sourceRevision?sourceCatalogFingerprint===previousMapping.sourceCatalogFingerprint?'identical':'same_revision_content_changed':'newer_revision';
 const beforeServices=baselineConfiguration?.services??null,beforeGuides=baselineConfiguration?.guides??null;
 const guideChanges=inventory(beforeGuides,configuration.guides),serviceChanges=inventory(beforeServices,configuration.services);
 const guides=new Map(configuration.guides.map(x=>[x.id,x])),services=new Map(configuration.services.map(x=>[x.id,x]));
 const oldOwners=new Map(previousMapping.services.map(s=>[s.nativeId,s.serviceId]));
 const held=new Map(holds.map(h=>[h.guideId,h.reasonCode]));
 const mappedIds=new Set(previousMapping.guides.map(g=>g.guideId));
 if([...held.keys()].some(x=>!mappedIds.has(x)))fail('UNKNOWN_REVIEW_HOLD');
 const rows=[],proposed=[];
 for(const m of previousMapping.guides){
  const g=guides.get(m.guideId),s=services.get(m.nativeServiceId),currentFingerprint=g?nativeRecordFingerprint(g):null;
  const entryMode=g?(Array.isArray(g.diagnosticQuestions)&&g.diagnosticQuestions.length?'diagnostic':'resolution'):null;
  const base={guideId:m.guideId,nativeServiceId:m.nativeServiceId,serviceId:oldOwners.get(m.nativeServiceId),
   purpose:m.purpose,previousFingerprint:m.expectedFingerprint,currentFingerprint,previousEntryMode:m.entryMode,currentEntryMode:entryMode};
  let reason=null;
  if(!g)reason='GUIDE_MISSING';
  else if(!s)reason='SERVICE_MISSING';
  else if(held.has(m.guideId))reason=held.get(m.guideId);
  else if(currentFingerprint!==m.expectedFingerprint)reason='MAPPED_GUIDE_CHANGED';
  else if(entryMode!==m.entryMode)reason='NATIVE_QUESTION_FLOW_CHANGED';
  else if(!knownGuidePurpose(base.serviceId,m.purpose))reason='UNKNOWN_GUIDE_PURPOSE';
  else if(serviceChanges.comparisonAvailable&&serviceChanges.changed.includes(m.nativeServiceId))reason='MAPPED_SERVICE_CHANGED';
  else if(relation==='revision_rollback'||relation==='same_revision_content_changed')reason='CATALOG_INTEGRITY_REVIEW_REQUIRED';
  rows.push({...base,status:reason?'withheld':'candidate',...(reason?{reasonCode:reason}:{})});
  if(!reason)proposed.push(clone(m));
 }
 const input={configuration,allowedNativeServiceIds,diagnosticServices,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu};
 let candidateMapping=null,projectionRevision=null;
 if(!['revision_rollback','same_revision_content_changed'].includes(relation)){
  // Never carry a stale reviewed case pattern into a new snapshot. Its
  // provenance requires a separate review even if a guide was unchanged.
  const mapping={revision:nextMappingRevision,sourceRevision,sourceCatalogFingerprint,
   services:clone(previousMapping.services.filter(s=>services.has(s.nativeId))),guides:proposed,reviewedContexts:[]};
  const projection=projectNativeCatalog({...input,mapping});
  const accepted=new Set(projection.catalog.guides.map(g=>g.id)),reasons=new Map(projection.withheld.map(g=>[g.guideId,g.reason]));
  for(const row of rows)if(row.status==='candidate'&&!accepted.has(row.guideId)){
   row.status='withheld';row.reasonCode=reasons.get(row.guideId)||'NOT_APPROVED_FOR_SUPPLEMENTAL_ROUTING';
  }
  const filtered={...mapping,guides:mapping.guides.filter(g=>accepted.has(g.guideId))};
  // Recompute the projection for exactly the candidate set. This does not
  // prove that any route works; review and eventual validation are mandatory.
  projectionRevision=projectNativeCatalog({...input,mapping:filtered}).catalog.revision;
  candidateMapping=filtered;
 }
 const count=rows.filter(r=>r.status==='candidate').length;
 return {kind:'private_native_reconciliation_draft',status:!candidateMapping?'catalog_integrity_review_required':'needs_independent_review',
  published:false,activated:false,liveCatalogVerified:false,
  previous:{mappingRevision:previousMapping.revision,sourceRevision:previousMapping.sourceRevision,sourceCatalogFingerprint:previousMapping.sourceCatalogFingerprint},
  current:{sourceRevision,sourceCatalogFingerprint,guideCount:configuration.guides.length,serviceCount:configuration.services.length},
  relation,baselineAvailable:baselineConfiguration!==null,guideChanges,serviceChanges,
  serviceFieldChanges:baselineConfiguration?describeNativeServiceChanges(beforeServices,configuration.services):null,
  retainedReviewCandidates:count,withheldCount:rows.length-count,rows,
  unmappedCurrentGuideIds:configuration.guides.filter(g=>!mappedIds.has(g.id)).map(g=>g.id).sort(),
  unmappedCurrentServiceIds:configuration.services.filter(s=>!oldOwners.has(s.id)).map(s=>s.id).sort(),
  routeReviews:candidateMapping?candidateMapping.guides.map(mappingRow=>inspectNativeGuideRoute({configuration,mappingRow,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu})):[],
  reviewedContextsRequireRebase:(previousMapping.reviewedContexts||[]).map(x=>x.id),
  projectionRevision,candidateMapping};
}
/** Authorization wrapper. An authenticated private reviewer may inspect a
 * report, not approve or publish it. No data is sent to a student or model. */
export function createNativeReconciliationReviewer({authenticate,mayReviewKnowledge,getInput}={}){
 if(![authenticate,mayReviewKnowledge,getInput].every(f=>typeof f==='function'))fail('RECONCILIATION_REVIEW_HOOKS_REQUIRED');
 const allowed=async a=>a&&a.active===true&&['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)&&id(a.actorRef)&&await mayReviewKnowledge(a)===true;
 return async function review(credential,options){
  const actor=await authenticate(credential);if(!await allowed(actor))fail('FORBIDDEN');
  const input=await getInput(actor),report=reconcileNativeMapping(input,options);
  const latest=await authenticate(credential);
  if(!await allowed(latest)||latest.actorRef!==actor.actorRef||latest.role!==actor.role)fail('FORBIDDEN');
  return report;
 };
}
