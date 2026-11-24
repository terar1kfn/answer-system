import {auditNativeCoverage} from './catalog-coverage.mjs';
import {nativeRecordFingerprint,projectNativeCatalog} from './native-catalog.mjs';
import {inspectSourceKnowledgePack} from './source-knowledge-drafts.mjs';
import {inspectNativeGuideRoute} from './native-route-review.mjs';
import {knownGuidePurpose} from '../guide-purposes.mjs';
import {KNOWLEDGE_GAP_KINDS} from '../analytics.mjs';
const fail=x=>{throw Error(x);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const count=n=>Number.isSafeInteger(n)&&n>=0;
const bounded=(a,n)=>Array.isArray(a)&&a.length<=n;
const key=(s,p)=>s+':'+p;
const clone=x=>JSON.parse(JSON.stringify(x));
const kinds=new Set(KNOWLEDGE_GAP_KINDS);
const staleActions=new Set(['service_mapping_needed','service_unavailable','withheld','mapping_needed','potential_ambiguity']);
function gapAction(kind){
 return {SERVICE_UNAVAILABLE:'review_service_availability',NO_MAPPED_GUIDE:'find_or_author_reviewed_guide',NO_ELIGIBLE_GUIDE:'review_guide_permissions_and_eligibility',
 PREREQUISITE_MISMATCH:'review_applicability_and_question_coverage',REVIEWED_CONTEXT_CONFLICT:'review_conflicting_case_patterns',AMBIGUOUS_MAPPING:'review_overlapping_mappings'}[kind];
}
/** Read-only, scope-constrained staff review agenda. Observed counts are
 * separate from static gaps and successful/unsuccessful outcome statistics.
 * Never rank a student-facing guide based on these counts. */
export function buildKnowledgeBacklog({input,metricRows=[],effectivenessRows=[],proposalPack=null,minimumGroup=5,days=30,includeSuggestions=true}={}){
 if(typeof includeSuggestions!=='boolean'||!bounded(metricRows,10000)||!bounded(effectivenessRows,5000)||!Number.isSafeInteger(minimumGroup)||minimumGroup<5||minimumGroup>100||
 !Number.isSafeInteger(days)||days<1||days>90)fail('INVALID_KNOWLEDGE_BACKLOG_INPUT');
 const projection=projectNativeCatalog(input),coverage=auditNativeCoverage(input,{includeSuggestions}),scope=new Set(projection.catalog.diagnosticServices);
 const rows=coverage.rows.filter(r=>scope.has(r.serviceId)&&!['native_route','out_of_scope'].includes(r.status));
 const indexed=new Map(rows.map(r=>[key(r.serviceId,r.purpose),{serviceId:r.serviceId,purpose:r.purpose,title:r.title,
  coverageStatus:r.status,registryPriority:r.priority,actions:[],observedGapCounts:[],effectivenessReview:[],proposalIds:[],
  currentGuideIds:r.guideIds||[],candidateGuideIds:(r.candidates||[]).map(g=>g.guideId),withheldGuideIds:(r.withheld||[]).map(g=>g.guideId)}]));
 const actions={service_mapping_needed:'confirm_exact_native_owner',service_unavailable:'review_service_availability',withheld:'review_guide_permissions_and_eligibility',mapping_needed:'find_or_author_reviewed_guide',potential_ambiguity:'review_overlapping_mappings'};
 const add=(r,a)=>{if(a&&!r.actions.includes(a))r.actions.push(a);};
 for(const r of indexed.values())if(staleActions.has(r.coverageStatus))add(r,actions[r.coverageStatus]);
 const seenMetrics=new Set();
 for(const m of metricRows){
  if(m?.event!=='knowledge_gap'||!m.purpose)continue;
  if(!knownGuidePurpose(m.serviceId,m.purpose)||!kinds.has(m.reasonCode)||!count(m.count))fail('INVALID_GAP_METRIC');
  const mk=[m.serviceId,m.purpose,m.reasonCode].join(':');
  if(seenMetrics.has(mk))fail('DUPLICATE_GAP_METRIC');seenMetrics.add(mk);
  const r=indexed.get(key(m.serviceId,m.purpose));
  if(!r||m.count<minimumGroup)continue;
  r.observedGapCounts.push({kind:m.reasonCode,count:m.count});add(r,gapAction(m.reasonCode));
 }
 const current=new Map(projection.catalog.guides.map(g=>[g.id,g])),seenOutcomes=new Set(),routePins=new Map();
 for(const e of effectivenessRows){
  if(!e||!id(e.guideId)||!hash(e.guideFingerprint)||!id(e.ruleVersion)||!knownGuidePurpose(e.serviceId,e.purpose))fail('INVALID_EFFECTIVENESS_SUMMARY');
  const ek=JSON.stringify([e.guideId,e.guideFingerprint,e.ruleVersion,e.sourceRevision??null,e.routeFingerprint??null,e.routeAttribution??'legacy_unverified']);
  if(seenOutcomes.has(ek))fail('DUPLICATE_EFFECTIVENESS_SUMMARY');seenOutcomes.add(ek);
  const r=indexed.get(key(e.serviceId,e.purpose)),g=current.get(e.guideId);
  // Do not mix older procedures or scopes into today's knowledge ranking.
  if(!r||!g||g.nativeGuideFingerprint!==e.guideFingerprint||g.serviceId!==e.serviceId||g.purpose!==e.purpose||
   e.sourceRevision!==projection.catalog.sourceRevision||e.routeAttribution!=='single_native_guide'||!hash(e.routeFingerprint))continue;
  if(!routePins.has(g.id)){
   const mappingRow=input.mapping.guides.find(m=>m.guideId===g.id);
   const review=mappingRow?inspectNativeGuideRoute({...input,mappingRow}):null;
   routePins.set(g.id,review&&!review.blockers.length&&!review.truncated?review.routeFingerprint:null);
  }
  if(routePins.get(g.id)!==e.routeFingerprint)continue;
  const c=e.counts?.singleGuideVerified;
  if(!c||!count(c.resolved)||!count(c.unresolved))fail('INVALID_EFFECTIVENESS_SUMMARY');
  const n=c.resolved+c.unresolved;
  if(n>=Math.max(10,minimumGroup)&&c.unresolved>=3&&c.unresolved/n>=0.35){
   r.effectivenessReview.push({guideId:e.guideId,guideFingerprint:e.guideFingerprint,sourceRevision:e.sourceRevision,routeFingerprint:e.routeFingerprint,ruleVersion:e.ruleVersion,verifiedKnownOutcomes:n,verifiedUnresolved:c.unresolved});
   add(r,'review_repeated_verified_unresolved_outcomes');
  }
 }
 let proposalsState='not_supplied';
 if(proposalPack){
  inspectSourceKnowledgePack(proposalPack);
  const pinned=proposalPack.sourceRevision===projection.catalog.sourceRevision&&proposalPack.sourceCatalogFingerprint===nativeRecordFingerprint(input.configuration);
  proposalsState=pinned?'current_private_draft':'stale_private_draft_requires_rebase';
  if(pinned)for(const p of proposalPack.proposals){
   const r=indexed.get(key(p.serviceId,p.purpose));
   if(r)r.proposalIds.push(p.id);
  }
 }
 const work=[...indexed.values()].filter(r=>r.actions.length).map(r=>{
  const observed=r.observedGapCounts.reduce((n,x)=>n+x.count,0);
  return {...r,observedGapEvents:observed,reviewPriority:r.effectivenessReview.length?'review_verified_failures':observed>=minimumGroup?'review_observed_gap':r.registryPriority==='core'?'core_coverage_review':'coverage_review',
   requiresHumanReview:true};
 }).sort((a,b)=>Number(Boolean(b.effectivenessReview.length))-Number(Boolean(a.effectivenessReview.length))||
 b.observedGapEvents-a.observedGapEvents||Number(b.registryPriority==='core')-Number(a.registryPriority==='core')||
 a.serviceId.localeCompare(b.serviceId)||a.purpose.localeCompare(b.purpose));
 return {kind:'private_knowledge_improvement_backlog',catalogRevision:projection.catalog.revision,sourceRevision:projection.catalog.sourceRevision,
 mappingRevision:projection.catalog.mappingRevision,days,proposalsState,work,counts:{reviewItems:work.length,withObservedGaps:work.filter(r=>r.observedGapEvents>0).length,withVerifiedFailures:work.filter(r=>r.effectivenessReview.length).length},
 note:'Observed gap events are not unique students; current guide outcome fractions are not causal estimates. A static mapping gap may already have a native solution.',
 published:false,automaticRoutingChanges:false};
}
export function createNativeKnowledgeBacklogReviewer({authenticate,mayReviewKnowledge,getInput,getMetricRows,getEffectivenessRows,getPrivateProposals=async()=>null}={}){
 if(![authenticate,mayReviewKnowledge,getInput,getMetricRows,getEffectivenessRows,getPrivateProposals].every(f=>typeof f==='function'))fail('BACKLOG_REVIEW_HOOKS_REQUIRED');
 const allowed=async a=>a&&a.active===true&&id(a.actorRef)&&['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)&&await mayReviewKnowledge(a)===true;
 return async function review(credential,{days=30}={}){
  const actor=await authenticate(credential);if(!await allowed(actor))fail('FORBIDDEN');
  // Each data callback must enforce actor scope. The report also filters to
  // the admitted native projection and exact current guide fingerprints.
  const input=await getInput(actor);
  const [metricRows,effectivenessRows,proposalPack]=await Promise.all([getMetricRows(actor,{days}),getEffectivenessRows(actor,{days}),getPrivateProposals(actor)]);
  const report=buildKnowledgeBacklog({input,metricRows,effectivenessRows,proposalPack,days});
  const latest=await authenticate(credential);
  if(!await allowed(latest)||latest.actorRef!==actor.actorRef||latest.role!==actor.role)fail('FORBIDDEN');
  if(projectNativeCatalog(await getInput(latest)).catalog.revision!==report.catalogRevision)fail('KNOWLEDGE_BACKLOG_SCOPE_CHANGED');
  return clone(report);
 };
}
