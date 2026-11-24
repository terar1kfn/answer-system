import {projectNativeCatalog} from './native-catalog.mjs';
import {nativeRecordFingerprint as digest} from './native-fingerprint.mjs';
import {inspectNativeGuideRoute} from './native-route-review.mjs';
import {buildKnowledgeBacklog} from './knowledge-backlog.mjs';
import {GUIDE_PURPOSES,knownGuidePurpose} from '../guide-purposes.mjs';
import {normalizeGuidePrerequisites,confirmedOptionIds,isAutomaticPrerequisiteQuestion} from '../diagnostic-evidence.mjs';
import {isPermittedNativeRisk,isNativeStudentSelfService,isUnreviewedNativeSource} from './native-guide-policy.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
import {compareGuideApplicability,confirmedPrerequisitesMatch,MAX_GUIDE_CANDIDATES} from '../guide-selection.mjs';

const fail=code=>{throw Error(code);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(Date.parse(x+'T00:00:00Z')).toISOString().slice(0,10)===x;
const list=(x,n)=>Array.isArray(x)&&x.length<=n;
const unique=xs=>new Set(xs).size===xs.length;
const bounded=(x,n=10000)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const clean=x=>x.trim().replace(/\s+/g,' ');
const byId=(a,b)=>a.localeCompare(b);
const sorted=xs=>[...xs].sort(byId);
const groupKey=(s,p)=>JSON.stringify([s,p]);
const nativeOnly=new Set(['exam','directory']);
const maxGuides=250,maxFindings=3000,maxAssignments=512,maxContexts=1000;
const statusSet=new Set(['verified_current','changed','unavailable','unverified']);
const actionFor=Object.freeze({
 MAPPED_GUIDE_WITHHELD:'review_mapping_and_native_eligibility',
 MAPPING_FINGERPRINT_MISSING:'review_exact_mapping_pin',
 MAPPED_GUIDE_MISSING:'reconcile_missing_native_guide',
 UNMAPPED_GUIDE_REVIEW:'review_native_route_or_mapping',
 SOURCE_REVIEW_REQUIRED:'obtain_independent_source_review',
 SOURCE_REVIEW_RECORD_MISSING:'record_current_source_review',
 SOURCE_REVIEW_VERSION_CHANGED:'review_current_guide_version',
 SOURCE_REVIEW_OVERDUE:'recheck_source_and_applicability',
 SOURCE_CHANGED:'verify_changed_source_claims',
 SOURCE_UNAVAILABLE:'verify_alternate_authoritative_source',
 SOURCE_UNVERIFIED:'verify_authoritative_source_claims',
 BILINGUAL_TITLE_INCOMPLETE:'complete_and_review_bilingual_title',
 BILINGUAL_STEPS_INCOMPLETE:'complete_and_review_bilingual_steps',
 REPEATED_STEP_TEXT:'check_intentional_or_duplicate_steps',
 QUESTION_STRUCTURE_INCOMPLETE:'review_question_schema',
 OPTION_LABEL_DUPLICATE:'clarify_distinct_diagnostic_choices',
 NATIVE_ROUTE_BLOCKER:'review_current_native_route',
 NATIVE_ROUTE_NOTE:'review_intentional_native_route_behavior',
 ROUTE_SCOPE_INCOMPLETE:'request_authorized_dependency_review',
 ROUTE_INSPECTION_UNAVAILABLE:'review_invalid_route_metadata',
 UNREACHABLE_QUESTION:'review_unused_or_unreachable_question',
 DUPLICATE_TITLE:'review_guide_disambiguation',
 DUPLICATE_PROCEDURE_TEXT:'compare_procedures_and_applicability',
 POTENTIAL_GUIDE_CONFLICT:'review_overlapping_guide_conditions',
 CANDIDATE_LIMIT:'review_excess_guide_candidates',
 PURPOSE_COVERAGE_GAP:'review_approved_guide_coverage',
 CONDITIONAL_COVERAGE_GAP:'review_theoretical_uncovered_conditions',
 CONDITIONAL_COVERAGE_LIMIT:'review_conditional_coverage_manually',
 PREREQUISITE_QUESTION_REVIEW:'verify_diagnostic_question_reachability',
 REVIEWED_CONTEXT_STALE:'reconcile_reviewed_context_version',
 REVIEWED_CONTEXT_OVERLAP:'review_conflicting_case_patterns',
 OBSERVED_KNOWLEDGE_GAP:'review_observed_gap_events',
 VERIFIED_UNRESOLVED_OUTCOMES:'review_verified_failed_attempts'
});
function validateScope(scope,input){
 if(!scope||!list(scope.allowedGuideIds,5000)||!scope.allowedGuideIds.every(id)||!unique(scope.allowedGuideIds)||
 !list(scope.completeServiceIds,13)||!scope.completeServiceIds.every(s=>isServiceId(s)&&input.diagnosticServices.includes(s)&&!nativeOnly.has(s))||
 !unique(scope.completeServiceIds))fail('INVALID_KNOWLEDGE_QUALITY_SCOPE');
 return {allowedGuideIds:sorted(scope.allowedGuideIds),completeServiceIds:sorted(scope.completeServiceIds)};
}
function validateFreshness(rows,asOf){
 if(!list(rows,5000))fail('INVALID_SOURCE_REVIEW_RECORDS');
 const result=new Map();
 for(const r of rows){
  if(!r||Object.keys(r).length!==5||!['guideId','guideFingerprint','checkedOn','reviewDueOn','sourceStatus'].every(k=>Object.hasOwn(r,k))||
   !id(r.guideId)||!hash(r.guideFingerprint)||!day(r.checkedOn)||!day(r.reviewDueOn)||r.checkedOn>asOf||
   r.reviewDueOn<r.checkedOn||!statusSet.has(r.sourceStatus)||result.has(r.guideId))fail('INVALID_SOURCE_REVIEW_RECORD');
  result.set(r.guideId,r);
 }
 return result;
}
function validSteps(g){
 const en=g.resolutionSteps,ar=g.resolutionStepsAr;
 return list(en,200)&&list(ar,200)&&en.length>0&&en.length===ar.length&&[...en,...ar].every(s=>bounded(s));
}
function combinations(guides){
 const keys=sorted(new Set(guides.flatMap(g=>Object.keys(g.requires))));
 if(!keys.length||guides.some(g=>!Object.keys(g.requires).length))return {kind:'unconditional'};
 const domains=keys.map(k=>confirmedOptionIds(k));
 let total=1;
 for(const domain of domains){
  if(!domain.length||total>Math.floor(maxAssignments/domain.length))return {kind:'limit'};
  total*=domain.length;
 }
 let uncovered=0,first=null;
 for(let i=0;i<total;i++){
  let n=i;const assignment={};
  for(let k=keys.length-1;k>=0;k--){const values=domains[k];assignment[keys[k]]=values[n%values.length];n=Math.floor(n/values.length);}
  if(!guides.some(g=>confirmedPrerequisitesMatch(g,assignment))){uncovered++;if(!first)first=assignment;}
 }
 return {kind:'checked',total,uncovered,first};
}
const noText=(r)=>({guideId:r.guideId,guideFingerprint:r.guideFingerprint,nativeServiceId:r.nativeServiceId,serviceId:r.serviceId,purpose:r.purpose});
function actorScopePin(input,scope){
 return digest({allowedNativeServiceIds:sorted(new Set(input.allowedNativeServiceIds)),diagnosticServices:sorted(new Set(input.diagnosticServices)),scope});
}
/**
 * Private, deterministic, read-only quality report for an authorized native
 * knowledge reviewer. Inputs are trusted server snapshots, never student input.
 * No external calls, model, publishing, editing, diagnosis or ranking effects.
 */
export function auditNativeKnowledgeQuality({input,reviewScope,sourceReviews=[],metricRows=[],effectivenessRows=[],asOf,days=30,minimumGroup=5}={}){
 if(!input||!list(input.diagnosticServices,13)||!day(asOf)||!list(metricRows,10000)||!list(effectivenessRows,5000)||
 !Number.isSafeInteger(days)||days<1||days>90||!Number.isSafeInteger(minimumGroup)||minimumGroup<5||minimumGroup>100)fail('INVALID_QUALITY_REVIEW_INPUT');
 const projection=projectNativeCatalog(input),catalog=projection.catalog;
 const scope=validateScope(reviewScope,input),allowed=new Set(scope.allowedGuideIds),complete=new Set(scope.completeServiceIds);
 const {configuration,mapping,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu}=input;
 const owners=new Map(mapping.services.filter(m=>input.allowedNativeServiceIds.includes(m.nativeId)&&catalog.diagnosticServices.includes(m.serviceId)&&!nativeOnly.has(m.serviceId)).map(m=>[m.nativeId,m.serviceId]));
 const nativeOwners=new Map(configuration.services.filter(s=>owners.has(s.id)).map(s=>[s.id,s]));
 const available=new Set(projection.availableNativeServices.filter(s=>owners.has(s.nativeId)).map(s=>s.nativeId));
 const raw=new Map(configuration.guides.map(g=>[g.id,g]));
 const mapped=new Map(mapping.guides.map(m=>[m.guideId,m]));
 const admitted=new Map(catalog.guides.filter(g=>allowed.has(g.id)&&owners.has(g.nativeServiceId)).map(g=>[g.id,g]));
 const withheld=new Map(projection.withheld.map(r=>[r.guideId,r.reason]));
 // A service-level completeness claim must include all its scoped mapping
 // references, including withheld/missing guides, and all scoped owned
 // self-service guides. The host separately verifies complete native scope.
 for(const m of mapping.guides)if(complete.has(owners.get(m.nativeServiceId))&&!allowed.has(m.guideId))fail('QUALITY_INCOMPLETE_REVIEW_SCOPE');
 const freshness=validateFreshness(sourceReviews,asOf);
 const findings=[],seen=new Set(),records=new Map(),titleGroups=new Map(),procedureGroups=new Map();
 let truncated=false;
 function add(code,level,subject,details={}){
  const body={code,level,...subject,details,reviewAction:actionFor[code],requiresHumanReview:true};
  const findingId=digest(body);
  if(seen.has(findingId))return;
  if(findings.length>=maxFindings){truncated=true;return;}
  seen.add(findingId);findings.push({...body,findingId});
 }
 function owned(g,owner){
  return owner&&(!g.serviceId||g.serviceId===owner.id)&&ownsGuide(g,owner,configuration)===true;
 }
 function ordinaryGuide(g){
  return isNativeStudentSelfService(g)&&isPermittedNativeRisk(g)&&isEntryMenu(g,configuration)===false;
 }
 function register(g,m,ownerId){
  const serviceId=owners.get(ownerId),purpose=m&&knownGuidePurpose(serviceId,m.purpose)?m.purpose:null;
  const guideId=m?.guideId??g?.id;
  const info={guideId,guideFingerprint:null,nativeServiceId:ownerId,serviceId,purpose};
  // Do not even return a fingerprint for a guide outside exact owner scope.
  if(g&&owned(g,nativeOwners.get(ownerId)))info.guideFingerprint=digest(g);
  records.set(guideId,info);
  if(records.size>maxGuides)fail('QUALITY_GUIDE_SCOPE_LIMIT');
  const subject=noText(info);
  if(!g){add('MAPPED_GUIDE_MISSING','blocker',subject);return;}
  if(m&&withheld.has(guideId))add('MAPPED_GUIDE_WITHHELD','review',subject,{reasonCode:withheld.get(guideId)});
  if(!info.guideFingerprint||!available.has(ownerId)||!ordinaryGuide(g)||g.isEnabled!==true||isGuideAvailable(g,configuration)!==true)return;
  if(m&&!hash(m.expectedFingerprint))add('MAPPING_FINGERPRINT_MISSING','review',subject);
  if(!m)add('UNMAPPED_GUIDE_REVIEW','info',subject);
  if(isReviewedGuide(g,configuration)!==true||isUnreviewedNativeSource(g))add('SOURCE_REVIEW_REQUIRED','review',subject);
  const f=freshness.get(guideId);
  if(!f)add('SOURCE_REVIEW_RECORD_MISSING','info',subject);
  else if(f.guideFingerprint!==info.guideFingerprint)add('SOURCE_REVIEW_VERSION_CHANGED','review',subject);
  else{
   if(f.reviewDueOn<=asOf)add('SOURCE_REVIEW_OVERDUE','review',subject,{reviewDueOn:f.reviewDueOn});
   const code={changed:'SOURCE_CHANGED',unavailable:'SOURCE_UNAVAILABLE',unverified:'SOURCE_UNVERIFIED'}[f.sourceStatus];
   if(code)add(code,'review',subject,{checkedOn:f.checkedOn});
  }
  if(!bounded(g.title,500)||!bounded(g.titleAr,500))add('BILINGUAL_TITLE_INCOMPLETE','blocker',subject);
  else index(titleGroups,[ownerId,clean(g.title).toLowerCase(),clean(g.titleAr).toLowerCase()],info);
  if(!validSteps(g))add('BILINGUAL_STEPS_INCOMPLETE','blocker',subject);
  else{
   for(const [language,steps] of [['en',g.resolutionSteps],['ar',g.resolutionStepsAr]]){
    const seenSteps=new Map();
    steps.forEach((step,i)=>{const s=clean(step);if(seenSteps.has(s))add('REPEATED_STEP_TEXT','review',subject,{language,firstStep:seenSteps.get(s),repeatedStep:i+1});else seenSteps.set(s,i+1);});
   }
   index(procedureGroups,[ownerId,g.resolutionSteps.map(clean),g.resolutionStepsAr.map(clean)],info);
  }
  const qs=g.diagnosticQuestions;
  if(!list(qs,200)||!qs.every(q=>q&&id(q.id))||!unique(qs.map(q=>q.id)))add('QUESTION_STRUCTURE_INCOMPLETE','blocker',subject);
  else for(const q of qs){
   if(!bounded(q.text)||!bounded(q.textAr)||!list(q.options,100)||!q.options.length||!q.options.every(o=>o&&id(o.id))||!unique(q.options.map(o=>o.id))){
    add('QUESTION_STRUCTURE_INCOMPLETE','blocker',subject,{questionId:q.id});continue;
   }
   for(const [language,field] of [['en','label'],['ar','labelAr']]){
    const labels=new Map();
    for(const o of q.options){
     if(!bounded(o[field])){add('QUESTION_STRUCTURE_INCOMPLETE','blocker',subject,{questionId:q.id,optionId:o.id,language});continue;}
     const value=clean(o[field]).toLowerCase();
     if(labels.has(value))add('OPTION_LABEL_DUPLICATE','review',subject,{questionId:q.id,language,optionIds:[labels.get(value),o.id]});
     else labels.set(value,o.id);
    }
   }
  }
  let route;
  try{
   // Structural inspection of the CURRENT bytes, not release approval.
   // The original mapping pin is independently checked by projection above.
   route=inspectNativeGuideRoute({...input,mappingRow:{...m,guideId,nativeServiceId:ownerId,expectedFingerprint:info.guideFingerprint,entryMode:Array.isArray(qs)&&qs.length?'diagnostic':'resolution'}});
  }catch{add('ROUTE_INSPECTION_UNAVAILABLE','review',subject);return;}
  const depsAllowed=route.dependencies.every(d=>{
   const target=raw.get(d.guideId);
   return allowed.has(d.guideId)&&target&&owned(target,nativeOwners.get(ownerId))&&ordinaryGuide(target);
  });
  if(!depsAllowed)add('ROUTE_SCOPE_INCOMPLETE','review',subject);
  // Never export IDs, counts or contents of unauthorized dependency guides.
  // Summarize root findings; dependencies may be audited in their own scope.
  for(const [items,code,level] of [[route.blockers,'NATIVE_ROUTE_BLOCKER','blocker'],[route.reviewNotes,'NATIVE_ROUTE_NOTE','review']]){
   const grouped=new Map();
   for(const r of items)if(r.guideId===guideId){
    const prior=grouped.get(r.code);
    if(prior)prior.occurrences++;
    else grouped.set(r.code,{routeCode:r.code,occurrences:1,questionId:id(r.questionId)?r.questionId:null,optionId:id(r.optionId)?r.optionId:null});
   }
   for(const d of grouped.values())add(code,level,subject,d);
   if(depsAllowed&&items.some(r=>r.guideId!==guideId))add(code,level,subject,{routeCode:'AUTHORIZED_DEPENDENCY_REQUIRES_REVIEW'});
  }
  if(depsAllowed&&!route.truncated&&!route.blockers.length&&Array.isArray(qs)){
   const reached=new Set(route.nodes.filter(n=>n.guideId===guideId).map(n=>n.questionId));
   for(const q of qs)if(!reached.has(q.id))add('UNREACHABLE_QUESTION','review',subject,{questionId:q.id});
  }
 }
 function index(groups,parts,info){
  // Hash private text for comparisons in memory only. No text or comparison
  // hash is exposed in findings, and identical text is not equivalent meaning.
  const k=digest(parts);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(info);
 }
 for(const m of mapping.guides)if(allowed.has(m.guideId)&&owners.has(m.nativeServiceId))register(raw.get(m.guideId),m,m.nativeServiceId);
 for(const g of configuration.guides){
  if(mapped.has(g.id)||!ordinaryGuide(g))continue;
  const matches=[...nativeOwners.values()].filter(o=>available.has(o.id)&&owned(g,o));
  if(matches.length!==1)continue;
  const ownerId=matches[0].id;
  if(complete.has(owners.get(ownerId))&&!allowed.has(g.id))fail('QUALITY_INCOMPLETE_REVIEW_SCOPE');
  if(allowed.has(g.id))register(g,null,ownerId);
 }
 for(const [groups,code] of [[titleGroups,'DUPLICATE_TITLE'],[procedureGroups,'DUPLICATE_PROCEDURE_TEXT']]){
  for(const group of groups.values())if(group.length>1){
   const ordered=[...group].sort((a,b)=>byId(a.guideId,b.guideId));
   add(code,'review',{nativeServiceId:ordered[0].nativeServiceId,serviceId:ordered[0].serviceId,purpose:null},
    {guides:ordered.map(noText)});
  }
 }
 const groups=new Map();
 for(const g of admitted.values()){
  const k=groupKey(g.serviceId,g.purpose);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push({...g,requires:normalizeGuidePrerequisites(g.requires)});
 }
 for(const [k,gs] of groups){
  const [serviceId,purpose]=JSON.parse(k),subject={serviceId,purpose};
  if(gs.length>MAX_GUIDE_CANDIDATES)add('CANDIDATE_LIMIT','blocker',subject,{candidateCount:gs.length});
  for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){
   const a=gs[i],b=gs[j];
   const relation=compareGuideApplicability(a,b);
   if(!['equivalent','overlapping'].includes(relation))continue;
   add('POTENTIAL_GUIDE_CONFLICT','review',subject,{guides:sorted([a.id,b.id]).map(x=>noText(records.get(x))),relation:relation==='equivalent'?'equivalent_conditions':'incomparable_overlapping_conditions'});
  }
  for(const g of gs){
   const keys=Object.keys(g.requires).filter(q=>!isAutomaticPrerequisiteQuestion(q));
   if(keys.length)add('PREREQUISITE_QUESTION_REVIEW','review',noText(records.get(g.id)),{questionIds:sorted(keys)});
  }
  if(complete.has(serviceId)){
   const result=combinations(gs);
   if(result.kind==='limit')add('CONDITIONAL_COVERAGE_LIMIT','info',subject);
   else if(result.kind==='checked'&&result.uncovered)add('CONDITIONAL_COVERAGE_GAP','review',subject,{testedCombinations:result.total,uncoveredCombinations:result.uncovered,example:result.first});
  }
 }
 for(const p of GUIDE_PURPOSES)if(complete.has(p.serviceId)&&!groups.has(groupKey(p.serviceId,p.purpose))){
  const reason=!Array.from(owners.values()).includes(p.serviceId)?'NO_EXACT_NATIVE_OWNER':catalog.serviceAvailability[p.serviceId]!==true?'NATIVE_SERVICE_UNAVAILABLE':'NO_ADMITTED_GUIDE';
  add('PURPOSE_COVERAGE_GAP',p.priority==='core'?'review':'info',{serviceId:p.serviceId,purpose:p.purpose},{reason,priority:p.priority});
 }
 const contexts=catalog.reviewedContexts.filter(c=>c.enabled===true&&admitted.has(c.guideId));
 const originalContexts=mapping.reviewedContexts||[];
 for(const r of projection.withheldContexts){
  const p=originalContexts.find(x=>x.id===r.patternRef);
  if(p&&records.has(p.guideId)&&records.get(p.guideId).guideFingerprint)add('REVIEWED_CONTEXT_STALE','review',noText(records.get(p.guideId)),{reasonCode:r.reason});
 }
 if(contexts.length>maxContexts)fail('QUALITY_CONTEXT_SCOPE_LIMIT');
 // Compare only current authorized patterns. No case IDs, author/reviewer
 // identities, observation bodies or patterns leave the private report.
 const contextGroups=new Map();
 for(const p of contexts){
  const k=groupKey(p.serviceId,p.purpose);
  if(!contextGroups.has(k))contextGroups.set(k,[]);
  contextGroups.get(k).push(p);
 }
 for(const [k,ps] of contextGroups){
  const [serviceId,purpose]=JSON.parse(k),pairs=new Set();
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
   const a=ps[i],b=ps[j];if(a.guideId===b.guideId)continue;
   if(Object.entries(a.match).some(([q,v])=>Object.hasOwn(b.match,q)&&b.match[q]!==v))continue;
   const ids=sorted([a.guideId,b.guideId]),pair=JSON.stringify(ids);if(pairs.has(pair))continue;pairs.add(pair);
   add('REVIEWED_CONTEXT_OVERLAP','review',{serviceId,purpose},{guides:ids.map(x=>noText(records.get(x)))});
  }
 }
 // Reuse exact current-guide/route pin and minimum group checks from the
 // existing backlog. Do not expose candidate suggestions, titles or
 // withheld out-of-scope IDs from its internal metadata report.
 if(metricRows.length||effectivenessRows.length){
  const backlog=buildKnowledgeBacklog({input,metricRows:metricRows.filter(m=>complete.has(m?.serviceId)),effectivenessRows:effectivenessRows.filter(e=>admitted.has(e?.guideId)),minimumGroup,days,includeSuggestions:false});
  for(const r of backlog.work){
   if(complete.has(r.serviceId))for(const m of r.observedGapCounts)add('OBSERVED_KNOWLEDGE_GAP','review',{serviceId:r.serviceId,purpose:r.purpose},{kind:m.kind,count:m.count,days});
   for(const e of r.effectivenessReview)if(admitted.has(e.guideId))add('VERIFIED_UNRESOLVED_OUTCOMES','review',noText(records.get(e.guideId)),
    {sourceRevision:e.sourceRevision,routeFingerprint:e.routeFingerprint,ruleVersion:e.ruleVersion,verifiedKnownOutcomes:e.verifiedKnownOutcomes,verifiedUnresolved:e.verifiedUnresolved,days});
  }
 }
 const order={blocker:0,review:1,info:2};
 findings.sort((a,b)=>order[a.level]-order[b.level]||byId(a.code,b.code)||byId(a.findingId,b.findingId));
 const body={kind:'private_knowledge_quality_report',schemaVersion:1,asOf,days,minimumGroup,
  sourceRevision:catalog.sourceRevision,sourceCatalogFingerprint:digest(configuration),catalogRevision:catalog.revision,mappingRevision:catalog.mappingRevision,mappingFingerprint:digest(mapping),
  reviewScopeFingerprint:actorScopePin(input,scope),completeServiceIds:scope.completeServiceIds,
  reviewedGuideCount:records.size,admittedGuideCount:admitted.size,
  counts:{blocker:findings.filter(f=>f.level==='blocker').length,review:findings.filter(f=>f.level==='review').length,info:findings.filter(f=>f.level==='info').length},
  truncated,findings,requiresHumanReview:true,published:false,automaticRoutingChanges:false,sourceTruthVerified:false,executionValidated:false};
 return {...body,reportFingerprint:digest(body)};
}
/** Authorized staff-only wrapper. The host must independently authorize all
 * exact guide IDs and any claimed complete service coverage/aggregate scope.
 * Each callback returns a fresh trusted scoped snapshot. A changed report,
 * source, permission or actor must be reviewed again, not silently reused. */
export function createNativeKnowledgeQualityReviewer({authenticate,mayReviewKnowledge,getInput,getReviewScope,
 getSourceReviews=async()=>[],getMetricRows=async()=>[],getEffectivenessRows=async()=>[],now=()=>Date.now()}={}){
 if(![authenticate,mayReviewKnowledge,getInput,getReviewScope,getSourceReviews,getMetricRows,getEffectivenessRows,now].every(f=>typeof f==='function'))fail('QUALITY_REVIEW_HOOKS_REQUIRED');
 async function actor(credential){
  const a=await authenticate(credential);
  if(!a||a.active!==true||!id(a.actorRef)||!['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)||await mayReviewKnowledge(a)!==true)fail('FORBIDDEN');
  return a;
 }
 const sameActor=(a,b)=>a.actorRef===b.actorRef&&a.role===b.role;
 async function snapshot(a,asOf,days,minimumGroup){
  const input=await getInput(a),reviewScope=await getReviewScope(a);
  const [sourceReviews,metricRows,effectivenessRows]=await Promise.all([getSourceReviews(a,{asOf}),getMetricRows(a,{days}),getEffectivenessRows(a,{days})]);
  return auditNativeKnowledgeQuality({input,reviewScope,sourceReviews,metricRows,effectivenessRows,asOf,days,minimumGroup});
 }
 let busy=false;
 return async function review(credential,{days=30,minimumGroup=5}={}){
  const a=await actor(credential);
  if(!Number.isSafeInteger(days)||days<1||days>90||!Number.isSafeInteger(minimumGroup)||minimumGroup<5||minimumGroup>100)fail('INVALID_QUALITY_REVIEW_INPUT');
  if(busy)fail('QUALITY_REVIEW_BUSY');busy=true;
  try{
   const asOf=new Date(now()).toISOString().slice(0,10);
   const first=await snapshot(a,asOf,days,minimumGroup);
   const latest=await actor(credential);if(!sameActor(a,latest))fail('FORBIDDEN');
   const next=await snapshot(latest,asOf,days,minimumGroup);
   const final=await actor(credential);if(!sameActor(a,final))fail('FORBIDDEN');
   if(first.reportFingerprint!==next.reportFingerprint)fail('KNOWLEDGE_QUALITY_SNAPSHOT_CHANGED');
   return next;
  }finally{busy=false;}
 };
}
