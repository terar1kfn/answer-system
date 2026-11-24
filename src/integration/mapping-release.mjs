import {nativeRecordFingerprint,projectNativeCatalog} from './native-catalog.mjs';
import {inspectSourceKnowledgePack} from './source-knowledge-drafts.mjs';
import {knownGuidePurpose} from '../guide-purposes.mjs';
import {inspectNativeGuideRoute,routeReviewMatches} from './native-route-review.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const revision=c=>String(c.gatewayRevision??c.revision);
const unique=(xs,k)=>new Set(xs.map(x=>x[k])).size===xs.length;
const same=(a,b)=>nativeRecordFingerprint(a)===nativeRecordFingerprint(b);
function pinned(mapping,configuration){
 return mapping&&configuration&&mapping.sourceRevision===revision(configuration)&&
 hash(mapping.sourceCatalogFingerprint)&&mapping.sourceCatalogFingerprint===nativeRecordFingerprint(configuration)&&
 Array.isArray(mapping.guides)&&mapping.guides.length<=5000&&mapping.guides.every(g=>id(g.guideId)&&hash(g.expectedFingerprint)&&['diagnostic','resolution'].includes(g.entryMode));
}
function currentGuide(c,g){return c.guides.find(x=>x.id===g.guideId&&nativeRecordFingerprint(x)===g.expectedFingerprint);}
/**
 * Convert reviewed, actually published native procedures into additional
 * mapping candidates. This never generates a native guide, alters the
 * publication, enables a service or copies a proposal into the student catalog.
 * The host supplies independently verified per-proposal decisions referring
 * to the exact proposal and exact new native guide. All output remains draft.
 */
export async function preparePublishedKnowledgeMappings({
 pack,sourceReview,configuration,mapping,decisions,nextMappingRevision,
 allowedNativeServiceIds,diagnosticServices,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu,
 verifyPublicationDecision
}={}){
 inspectSourceKnowledgePack(pack);
 if(!pinned(mapping,configuration)||!id(nextMappingRevision)||nextMappingRevision===mapping.revision||
 !sourceReview||sourceReview.kind!=='private_source_review_draft'||sourceReview.published!==false||
 sourceReview.sourceRevision!==pack.sourceRevision||sourceReview.sourceCatalogFingerprint!==pack.sourceCatalogFingerprint||
 !id(sourceReview.actorRef)||!Array.isArray(sourceReview.proposals)||!unique(sourceReview.proposals.map(x=>x.proposal||{}),'id')||
 !Array.isArray(decisions)||!decisions.length||decisions.length>100||!unique(decisions,'proposalId')||
 typeof verifyPublicationDecision!=='function')fail('KNOWLEDGE_MAPPING_REVIEW_REQUIRED');
 const proposals=new Map(pack.proposals.map(x=>[x.id,x]));
 const checked=new Map(sourceReview.proposals.map(x=>[x.proposal?.id,x]));
 const owners=new Map(mapping.services.map(x=>[x.nativeId,x.serviceId]));
 const existing=new Set(mapping.guides.map(x=>x.guideId));
 const additions=[],withheld=[];
 for(const decision of decisions){
  if(!decision||!id(decision.proposalId)||!id(decision.nativeGuideId)||!id(decision.nativeServiceId)||
   !id(decision.reviewerRef)||decision.reviewerRef===sourceReview.actorRef||
   !id(decision.approvalRef)||!hash(decision.proposalFingerprint)||!hash(decision.nativeGuideFingerprint)||
   decision.sourceRevision!==revision(configuration)||decision.applicabilityConfirmed!==true||decision.sourceConfirmed!==true||
   decision.nativePublicationConfirmed!==true)fail('INDEPENDENT_PUBLICATION_DECISION_REQUIRED');
  const p=proposals.get(decision.proposalId),review=checked.get(decision.proposalId);
  let reason=null;
  if(!p||!review||!same(p,review.proposal)||nativeRecordFingerprint(p)!==decision.proposalFingerprint||
   review.status!=='needs_independent_applicability_review'||review.missingGuideIds?.length||
   !Array.isArray(review.findings))reason='SOURCE_REVIEW_INCOMPLETE';
  else{
   const required=new Set(p.steps.flatMap(s=>s.sourceIds));
   const confirmed=new Set(review.findings.filter(f=>f.status==='reviewed_by_host').map(f=>f.sourceId));
   if([...required].some(s=>!confirmed.has(s)))reason='SOURCE_REVIEW_INCOMPLETE';
  }
  if(!reason&&(!['new_guide','revise_guide'].includes(p.kind)||!p.purpose||!knownGuidePurpose(p.serviceId,p.purpose)))reason='NATIVE_REFERRAL_OR_POLICY_ONLY';
  if(!reason&&owners.get(decision.nativeServiceId)!==p.serviceId)reason='NATIVE_OWNER_NOT_MAPPED';
  const g=configuration.guides.find(x=>x.id===decision.nativeGuideId);
  if(!reason&&(!g||nativeRecordFingerprint(g)!==decision.nativeGuideFingerprint))reason='PUBLISHED_GUIDE_CHANGED_OR_MISSING';
  if(!reason&&existing.has(decision.nativeGuideId))reason='EXISTING_MAPPING_REQUIRES_EXPLICIT_REVIEW';
  if(!reason&&p.kind==='revise_guide'&&!p.existingGuideIds.includes(decision.nativeGuideId))reason='REVISED_GUIDE_ID_UNCONFIRMED';
  if(!reason&&await verifyPublicationDecision({decision:clone(decision),proposal:clone(p),publishedGuide:clone(g)})!==true)reason='PUBLICATION_DECISION_NOT_VERIFIED';
  if(reason){withheld.push({proposalId:decision.proposalId,reasonCode:reason});continue;}
  const entryMode=g.diagnosticQuestions?.length?'diagnostic':'resolution';
  additions.push({guideId:g.id,nativeServiceId:decision.nativeServiceId,purpose:p.purpose,requires:clone(p.requires),entryMode,expectedFingerprint:decision.nativeGuideFingerprint});
  existing.add(g.id);
 }
 const input={configuration,allowedNativeServiceIds,diagnosticServices,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu};
 const candidate={...clone(mapping),revision:nextMappingRevision,guides:[...clone(mapping.guides),...additions],reviewedContexts:[]};
 const projection=projectNativeCatalog({...input,mapping:candidate});
 const accepted=new Set(projection.catalog.guides.map(g=>g.id));
 const prior=new Set(mapping.guides.map(g=>g.guideId));
 if([...prior].some(g=>!accepted.has(g)))fail('EXISTING_MAPPING_RECONCILIATION_REQUIRED');
 const retained=additions.filter(g=>accepted.has(g.guideId));
 const rejected=new Map(projection.withheld.map(g=>[g.guideId,g.reason]));
 for(const g of additions)if(!accepted.has(g.guideId))withheld.push({guideId:g.guideId,reasonCode:rejected.get(g.guideId)||'NATIVE_GUIDE_NOT_ELIGIBLE'});
 const candidateMapping={...candidate,guides:[...clone(mapping.guides),...retained]};
 return {kind:'private_published_knowledge_mapping_draft',status:'needs_independent_review',published:false,activated:false,
  sourceRevision:revision(configuration),sourceCatalogFingerprint:nativeRecordFingerprint(configuration),
  retainedAdditions:retained.length,withheld,candidateMapping};
}
/**
 * Prepare an independently reviewed release candidate against the exact
 * published native catalog. Every included mapping must have its own review
 * decision, current fingerprint, owner and applicability review reference.
 * The authoritative host is still responsible for final activation.
 */
export async function prepareMappingRelease({
 configuration,mapping,preparerRef,releaseReviewerRef,releaseId,approvals,
 allowedNativeServiceIds,diagnosticServices,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu,verifyMappingApproval
}={}){
 if(!pinned(mapping,configuration)||!id(preparerRef)||!id(releaseReviewerRef)||preparerRef===releaseReviewerRef||!id(releaseId)||
 !Array.isArray(approvals)||approvals.length!==mapping.guides.length||!unique(approvals,'guideId')||
 typeof verifyMappingApproval!=='function')fail('INDEPENDENT_MAPPING_RELEASE_REQUIRED');
 // Work against a stable private snapshot; the active provider rechecks the
 // authoritative catalog again before the mapping is consumed.
 configuration=clone(configuration);mapping=clone(mapping);approvals=clone(approvals);
 const approvalById=new Map(approvals.map(a=>[a.guideId,a]));
 const routeReviews=[];
 for(const g of mapping.guides){
  const a=approvalById.get(g.guideId);
  const route=inspectNativeGuideRoute({configuration,mappingRow:g,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu});
  if(route.blockers.length||route.truncated)fail('NATIVE_ROUTE_DEPENDENCY_BLOCKED');
  if(!a||a.routeFingerprint!==route.routeFingerprint||a.routeDependenciesConfirmed!==true)fail('NATIVE_ROUTE_REVIEW_REQUIRED');
  routeReviews.push(route);
  if(!a||!id(a.reviewerRef)||a.reviewerRef===preparerRef||!id(a.approvalRef)||
   a.rowFingerprint!==nativeRecordFingerprint(g)||a.guideFingerprint!==g.expectedFingerprint||
   a.sourceCatalogFingerprint!==mapping.sourceCatalogFingerprint||a.sourceConfirmed!==true||
   a.applicabilityConfirmed!==true||a.permissionConfirmed!==true||!currentGuide(configuration,g)||
   await verifyMappingApproval({approval:clone(a),mappingRow:clone(g),publishedGuide:clone(currentGuide(configuration,g)),routeReview:clone(route)})!==true)fail('MAPPING_ROW_APPROVAL_REQUIRED');
 }
 // Previously learned patterns have a separate outcome and review lifecycle.
 // This release gate only handles the approved original guide mappings.
 if(mapping.reviewedContexts?.length)fail('REVIEWED_CONTEXT_RELEASE_SEPARATE');
 const projection=projectNativeCatalog({configuration,mapping,allowedNativeServiceIds,diagnosticServices,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu});
 if(projection.withheld.length||projection.catalog.guides.length!==mapping.guides.length)fail('MAPPING_RELEASE_CONTAINS_INELIGIBLE_GUIDE');
 const payload={releaseId,preparerRef,releaseReviewerRef,mapping:clone(mapping),approvals:clone(approvals),routeReviews:clone(routeReviews)};
 return {kind:'native_mapping_release_candidate',status:'needs_native_activation',published:false,activated:false,
  payload,releaseFingerprint:nativeRecordFingerprint(payload)};
}
/**
 * The private host stores its independently authorized active release outside
 * this package. Verify it every time it is consumed. A candidate envelope or
 * an old revision cannot be used as a live mapping. The host callback must
 * check the real publication/activation record, not just a Boolean in JSON.
 */
export function createApprovedMappingProvider({getConfiguration,getActiveRelease,verifyActiveRelease}={}){
 if(![getConfiguration,getActiveRelease,verifyActiveRelease].every(f=>typeof f==='function'))fail('MAPPING_RELEASE_HOST_REQUIRED');
 return async function getMapping(actor){
  const [configuration,release]=await Promise.all([getConfiguration(actor),getActiveRelease(actor)]);
  if(!release||release.kind!=='native_mapping_release'||release.status!=='active'||release.activated!==true||
   release.revoked!==false||!id(release.activationRef)||!release.payload||!hash(release.releaseFingerprint)||
   release.releaseFingerprint!==nativeRecordFingerprint(release.payload)||
   !pinned(release.payload.mapping,configuration))fail('APPROVED_MAPPING_UNAVAILABLE');
  const p=release.payload,m=p.mapping;
  if(!id(p.releaseId)||!id(p.preparerRef)||!id(p.releaseReviewerRef)||p.preparerRef===p.releaseReviewerRef||
   !Array.isArray(p.approvals)||p.approvals.length!==m.guides.length||!unique(p.approvals,'guideId')||
   !Array.isArray(p.routeReviews)||p.routeReviews.length!==m.guides.length||!unique(p.routeReviews,'guideId')||
   m.guides.some(g=>{
    const route=p.routeReviews.find(r=>r.guideId===g.guideId),a=p.approvals.find(x=>x.guideId===g.guideId);
    return !currentGuide(configuration,g)||!a||!route||!routeReviewMatches({review:route,configuration,mappingRow:g})||
     a.routeDependenciesConfirmed!==true||a.routeFingerprint!==route.routeFingerprint||a.rowFingerprint!==nativeRecordFingerprint(g)||a.guideFingerprint!==g.expectedFingerprint||a.sourceCatalogFingerprint!==m.sourceCatalogFingerprint;
   })||
   await verifyActiveRelease({actor,activationRef:release.activationRef,releaseId:p.releaseId,releaseFingerprint:release.releaseFingerprint})!==true)fail('APPROVED_MAPPING_UNAVAILABLE');
  const current=await getConfiguration(actor);
  if(!pinned(m,current))fail('MAPPING_SOURCE_REVISION_CHANGED');
  return clone(m);
 };
}
