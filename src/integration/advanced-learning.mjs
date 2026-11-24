import {projectNativeCatalog} from './native-catalog.mjs';
import {nativeRecordFingerprint as digest} from './native-fingerprint.mjs';
import {inspectNativeGuideRoute} from './native-route-review.mjs';
import {validateContextMatch} from '../reviewed-context.mjs';
import {planApplicableGuides} from '../guide-selection.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
import {knownGuidePurpose} from '../guide-purposes.mjs';

const fail=x=>{throw Error(x);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const opaque=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{24,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const list=(x,n)=>Array.isArray(x)&&x.length<=n;
const exact=(x,ks)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(Date.parse(x+'T00:00:00Z')).toISOString().slice(0,10)===x;
const sorted=xs=>[...xs].sort((a,b)=>a<b?-1:a>b?1:0);
const unique=xs=>new Set(xs).size===xs.length;
const clone=x=>JSON.parse(JSON.stringify(x));
const ordinary=new Set(['mail','network','portal','attendance','collaboration','printing','software','device','storage']);
const uncertain=new Set(['unknown','not_tried','other','different','not_checked','unclear']);
const completion=new Set(['attempted','viewed_only','not_viewed','unknown']);
const outcomes=new Set(['resolved','unresolved','unknown','not_attempted']);
const provenance=new Set(['staff_verified','student_reported','unverified']);
const attribution=new Set(['guide_only','multiple_interventions','not_established']);
const routeKinds=new Set(['single_native_guide','branched_native_route','native_escalation','unverified_route']);
export const LEARNING_FEEDBACK_CODES=Object.freeze([
 'instruction_missing','instruction_unclear','screen_mismatch','applicability_mismatch','branch_missing','source_review_needed','repeat_attempt','needs_staff_review'
]);
const feedbackCodes=new Set(LEARNING_FEEDBACK_CODES);
const feedbackActions=Object.freeze({
 instruction_missing:'review_missing_instruction',instruction_unclear:'review_instruction_clarity',screen_mismatch:'compare_current_ui_with_approved_guide',
 applicability_mismatch:'review_prerequisites_and_scope',branch_missing:'review_diagnostic_branch_coverage',source_review_needed:'verify_authoritative_sources',
 repeat_attempt:'review_repeated_procedure_attempts',needs_staff_review:'review_with_authorized_it'
});
const fields=['caseKey','receiptKey','revision','day','serviceId','purpose','guideId','guideFingerprint','sourceRevision','routeFingerprint',
 'routeAttribution','ruleVersion','completion','outcome','provenance','attribution','context','feedback'];
const maxRows=5000,maxGuideScope=200,maxProposals=1000;
const batchFields=['revision','asOf','days','complete','rows'];
function scopeOf(scope){
 if(!exact(scope,['allowedGuideIds','serviceIds'])||!list(scope.allowedGuideIds,maxGuideScope)||!scope.allowedGuideIds.every(id)||
 !unique(scope.allowedGuideIds)||!list(scope.serviceIds,13)||!scope.serviceIds.every(s=>isServiceId(s)&&ordinary.has(s))||!unique(scope.serviceIds))fail('INVALID_LEARNING_SCOPE');
 return {allowedGuideIds:sorted(scope.allowedGuideIds),serviceIds:sorted(scope.serviceIds)};
}
function validContext(serviceId,context){
 if(context===null)return true;
 try{return validateContextMatch(serviceId,context)===true&&!Object.values(context).some(v=>uncertain.has(v));}catch{return false;}
}
function validRow(r,asOf){
 return exact(r,fields)&&opaque(r.caseKey)&&opaque(r.receiptKey)&&int(r.revision,1,Number.MAX_SAFE_INTEGER)&&day(r.day)&&r.day<=asOf&&
 ordinary.has(r.serviceId)&&knownGuidePurpose(r.serviceId,r.purpose)&&id(r.guideId)&&hash(r.guideFingerprint)&&id(r.sourceRevision)&&
 routeKinds.has(r.routeAttribution)&&(r.routeAttribution==='unverified_route'?r.routeFingerprint===null:hash(r.routeFingerprint))&&id(r.ruleVersion)&&
 completion.has(r.completion)&&outcomes.has(r.outcome)&&provenance.has(r.provenance)&&attribution.has(r.attribution)&&
 !(r.completion==='attempted'&&r.outcome==='not_attempted')&&
 !(r.provenance==='unverified'&&['resolved','unresolved'].includes(r.outcome))&&
 (r.attribution!=='guide_only'||r.completion==='attempted'&&['resolved','unresolved'].includes(r.outcome)&&r.routeAttribution==='single_native_guide'&&r.provenance!=='unverified')&&
 validContext(r.serviceId,r.context)&&(r.feedback===null||feedbackCodes.has(r.feedback));
}
function validateBatch(batch,scope,asOf,days){
 if(!exact(batch,batchFields)||!opaque(batch.revision)||batch.asOf!==asOf||batch.days!==days||batch.complete!==true||!list(batch.rows,maxRows))fail('INCOMPLETE_LEARNING_COHORT');
 const start=new Date(Date.parse(asOf+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
 const receipts=new Set();
 for(const r of batch.rows){
  if(!validRow(r,asOf)||r.day<start||!scope.allowedGuideIds.includes(r.guideId)||!scope.serviceIds.includes(r.serviceId))fail('INVALID_SCOPED_LEARNING_ROW');
  if(receipts.has(r.receiptKey))fail('DUPLICATE_LEARNING_RECEIPT');
  receipts.add(r.receiptKey);
 }
}
const qualified=r=>r.provenance==='staff_verified'&&r.completion==='attempted'&&r.attribution==='guide_only'&&r.routeAttribution==='single_native_guide'&&['resolved','unresolved'].includes(r.outcome);
function pins(g,r,route){
 return g&&g.nativeGuideFingerprint===r.guideFingerprint&&g.serviceId===r.serviceId&&g.purpose===r.purpose&&route===r.routeFingerprint;
}
const counts=()=>({known:0,resolved:0,unresolved:0});
function addCount(c,r){c.known++;c[r.outcome]++;}
function group(map,key,create){if(!map.has(key))map.set(key,create());return map.get(key);}
const cohortKey=r=>JSON.stringify([r.guideId,r.guideFingerprint,r.sourceRevision,r.routeFingerprint,r.ruleVersion,r.serviceId,r.purpose]);
function subject(g,r){return {serviceId:g.serviceId,purpose:g.purpose,nativeServiceId:g.nativeServiceId,guideId:g.id,guideFingerprint:g.nativeGuideFingerprint,sourceRevision:r.sourceRevision,routeFingerprint:r.routeFingerprint,ruleVersion:r.ruleVersion};}
// Descriptive conservative binomial bound, NOT a causal estimate or model
// confidence. Repeated observations are not assumed independent people.
function lowerBound(c){
 const z=1.96,n=c.known,p=c.resolved/n;
 return (p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n);
}
const matched=(g,context)=>Object.entries(g.requires||{}).every(([k,vs])=>Object.hasOwn(context,k)&&!uncertain.has(context[k])&&vs.includes(context[k]));
const compatible=(a,b)=>!Object.entries(a).some(([k,v])=>Object.hasOwn(b,k)&&b[k]!==v);

/** Read-only learning from a COMPLETE, host-verified private cohort.
 * Raw case/receipt keys are used only for transient deduplication.
 * Never accept this input from a student/client or raw model output. */
export function buildAdvancedLearningReport({input,reportingScope,batch,asOf,days=30,minimumGroup=10}={}){
 if(!day(asOf)||!int(days,1,90)||!int(minimumGroup,10,100))fail('INVALID_ADVANCED_LEARNING_INPUT');
 const scope=scopeOf(reportingScope);
 validateBatch(batch,scope,asOf,days);
 const projection=projectNativeCatalog(input),catalog=projection.catalog;
 if(scope.serviceIds.some(s=>!catalog.diagnosticServices.includes(s)))fail('INVALID_LEARNING_SCOPE');
 const allowed=new Set(scope.allowedGuideIds),services=new Set(scope.serviceIds);
 const admitted=new Map(catalog.guides.filter(g=>allowed.has(g.id)&&services.has(g.serviceId)).map(g=>[g.id,g]));
 const mappings=new Map(input.mapping.guides.map(m=>[m.guideId,m]));
 const routePins=new Map();
 function currentRoute(g){
  if(routePins.has(g.id))return routePins.get(g.id);
  const m=mappings.get(g.id);let pin=null;
  if(m&&m.expectedFingerprint===g.nativeGuideFingerprint&&['diagnostic','resolution'].includes(m.entryMode)){
   const route=inspectNativeGuideRoute({...input,mappingRow:m});
   if(!route.truncated&&!route.blockers.length&&route.dependencies.every(d=>allowed.has(d.guideId)))pin=route.routeFingerprint;
  }
  routePins.set(g.id,pin);return pin;
 }
 // A case with multiple scoped finalized attempts is not an isolated
 // intervention, even if each receipt individually claims guide-only.
 // Host verification must additionally exclude out-of-scope interventions.
 const caseCounts=new Map();
 for(const r of batch.rows)caseCounts.set(r.caseKey,(caseCounts.get(r.caseKey)||0)+1);
 const guideGroups=new Map(),patternGroups=new Map();
 for(const r of batch.rows){
  if(caseCounts.get(r.caseKey)!==1||!qualified(r)||r.sourceRevision!==catalog.sourceRevision)continue;
  const g=admitted.get(r.guideId);
  if(!g||!pins(g,r,currentRoute(g)))continue;
  const k=cohortKey(r),s=subject(g,r);
  const guide=group(guideGroups,k,()=>({subject:s,counts:counts(),feedback:new Map()}));
  addCount(guide.counts,r);
  // One fixed staff-verified feedback category per finalized case. Raw
  // notes, names, reviewer identities and generated instructions are excluded.
  if(r.feedback!==null)guide.feedback.set(r.feedback,(guide.feedback.get(r.feedback)||0)+1);
  if(r.context===null)continue;
  const pattern=Object.fromEntries(sorted(Object.keys(r.context)).map(k=>[k,r.context[k]]));
  const pk=digest([g.nativeServiceId,r.serviceId,r.purpose,r.sourceRevision,r.ruleVersion,pattern]);
  const bucket=group(patternGroups,pk,()=>({pattern,serviceId:r.serviceId,purpose:r.purpose,nativeServiceId:g.nativeServiceId,ruleVersion:r.ruleVersion,guides:new Map()}));
  const row=group(bucket.guides,k,()=>({subject:s,counts:counts()}));
  addCount(row.counts,r);
 }
 const proposals=[],observedGroups=[];
 let truncated=false;
 function propose(kind,s,details){
  const body={kind,...s,details,status:'needs_independent_review',requiresHumanReview:true,automaticRoutingChanges:false,published:false};
  if(proposals.length>=maxProposals){truncated=true;return;}
  proposals.push({...body,proposalId:digest(body)});
 }
 for(const g of [...guideGroups.values()].sort((a,b)=>digest(a.subject).localeCompare(digest(b.subject)))){
  const c=g.counts;
  if(c.known<minimumGroup)continue;
  const outcomes={...c,observedResolutionFraction:c.resolved/c.known};
  observedGroups.push({...g.subject,outcomes,verifiedRootCause:false});
  if(c.unresolved>=Math.max(3,minimumGroup)&&c.unresolved/c.known>=0.35)propose('review_repeated_unresolved_outcomes',g.subject,{outcomes,action:'review_approved_procedure_and_applicability'});
  for(const code of sorted(g.feedback.keys())){
   const n=g.feedback.get(code);
   if(n>=minimumGroup)propose('review_recurring_staff_feedback',g.subject,{feedbackCode:code,verifiedFeedbackCases:n,knownOutcomes:c.known,action:feedbackActions[code]});
  }
 }
 for(const b of [...patternGroups.values()].sort((a,b)=>digest([a.nativeServiceId,a.serviceId,a.purpose,a.ruleVersion,a.pattern]).localeCompare(digest([b.nativeServiceId,b.serviceId,b.purpose,b.ruleVersion,b.pattern])))){
  const groupRows=[...b.guides.values()].sort((a,b)=>a.subject.guideId.localeCompare(b.subject.guideId));
  const visible=groupRows.filter(r=>r.counts.known>=minimumGroup);
  // Suppress a pattern if a competing exact-pattern group is too small to
  // report; do not selectively expose only the favorable guide's results.
  if(!visible.length||visible.length!==groupRows.length)continue;
  for(const r of visible){
   const c=r.counts;
   if(c.unresolved>=minimumGroup&&c.unresolved/c.known>=0.35)propose('review_recurring_failure_context',r.subject,{context:b.pattern,outcomes:{...c},action:'review_context_specific_failure'});
   if(c.resolved<minimumGroup||c.resolved/c.known<0.9||lowerBound(c)<0.65)continue;
   if(c.unresolved>0&&c.unresolved>=minimumGroup)continue;
   // Do not publish a favorable routing lead if another guide has an observed
   // group for this context. Comparative outcomes are not controlled trials.
   if(groupRows.length!==1)continue;
   const g=admitted.get(r.subject.guideId);
   if(!matched(g,b.pattern))continue;
   // Only a real ambiguity between current permitted same-owner guides could
   // be eligible for the existing reviewed-context workflow. Scope must
   // include every applicable candidate; no inference from omitted guides.
   const competitors=catalog.guides.filter(x=>x.serviceId===g.serviceId&&x.purpose===g.purpose);
   // Use the actual selector so an unresolved narrower or incomparable
   // prerequisite is not mistaken for a confirmed tie.
   const plan=planApplicableGuides({guides:competitors,state:{evidence:Object.fromEntries(Object.entries(b.pattern).map(([k,value])=>[k,{value}])),askedQuestionIds:[]},serviceId:g.serviceId,purpose:g.purpose});
   const maxima=plan.kind==='matched'?plan.guides:[];
   const tied=maxima.length>=2&&maxima.some(x=>x.id===g.id)&&maxima.every(x=>admitted.has(x.id)&&x.nativeServiceId===g.nativeServiceId&&currentRoute(x));
   const existing=(catalog.reviewedContexts||[]).filter(x=>x.enabled&&x.serviceId===g.serviceId&&x.purpose===g.purpose&&compatible(x.match,b.pattern));
   if(existing.some(x=>x.guideId!==g.id))continue;
   const alreadyCovered=existing.some(x=>x.guideId===g.id&&Object.entries(x.match).every(([k,v])=>b.pattern[k]===v));
   if(alreadyCovered)continue;
   propose('review_recurring_success_context',r.subject,{context:b.pattern,outcomes:{...c},
    action:tied?'independently_review_context_disambiguation':'review_observed_context_applicability',
    possibleDisambiguation:tied,requiresIndividualCaseReview:true});
  }
  if(visible.length>=2){
   propose('review_competing_context_outcomes',{serviceId:b.serviceId,purpose:b.purpose,nativeServiceId:b.nativeServiceId,ruleVersion:b.ruleVersion,sourceRevision:catalog.sourceRevision},
    {context:b.pattern,guides:visible.map(r=>({...r.subject,outcomes:{...r.counts}})),action:'review_case_mix_and_guide_applicability',comparativeCausationEstablished:false});
  }
 }
 const order=['review_repeated_unresolved_outcomes','review_recurring_failure_context','review_recurring_staff_feedback','review_competing_context_outcomes','review_recurring_success_context'];
 proposals.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)||a.proposalId.localeCompare(b.proposalId));
 const body={kind:'private_advanced_learning_report',schemaVersion:1,asOf,days,minimumGroup,cohortRevision:batch.revision,
  catalogRevision:catalog.revision,sourceRevision:catalog.sourceRevision,sourceCatalogFingerprint:digest(input.configuration),mappingFingerprint:digest(input.mapping),
  scopeFingerprint:digest({scope,allowedNativeServiceIds:sorted(new Set(input.allowedNativeServiceIds)),diagnosticServices:sorted(new Set(input.diagnosticServices))}),
  observedGroups,proposals,truncated,requiresHumanReview:true,verifiedRootCause:false,causalEffectivenessEstablished:false,automaticRoutingChanges:false,published:false};
 return {...body,reportFingerprint:digest(body)};
}

const decisionCodes=new Set(['request_source_review','request_procedure_review','request_individual_case_review','defer','dismiss']);
const decisionAllowed=(proposal,decision)=>decisionCodes.has(decision)&&
 (decision!=='request_individual_case_review'||proposal.kind==='review_recurring_success_context'||proposal.kind==='review_competing_context_outcomes');
/** The wrapper requires independently verified, complete cohorts and a fresh
 * native actor. There is deliberately no student API, ingestion from AI,
 * automatic context approval, publication hook, or mutable learning state. */
export function createAdvancedLearningReviewer({authenticate,mayReviewKnowledge,getInput,getReportingScope,getLearningBatch,verifyLearningBatch,
 mayPrepareLearningProposal,mayDecideLearningProposal,getPreparedDraft,verifyPreparedDraft,now=()=>Date.now()}={}){
 if(![authenticate,mayReviewKnowledge,getInput,getReportingScope,getLearningBatch,verifyLearningBatch,mayPrepareLearningProposal,mayDecideLearningProposal,getPreparedDraft,verifyPreparedDraft,now].every(f=>typeof f==='function'))fail('ADVANCED_LEARNING_HOOKS_REQUIRED');
 async function actor(credential){
  const a=await authenticate(credential);
  if(!a||a.active!==true||!id(a.actorRef)||!['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)||await mayReviewKnowledge(a)!==true)fail('FORBIDDEN');
  return a;
 }
 async function recheck(credential,a){
  const next=await actor(credential);
  if(next.actorRef!==a.actorRef||next.role!==a.role)fail('FORBIDDEN');return next;
 }
 async function snapshot(a,asOf,days,minimumGroup){
  const input=await getInput(a),reportingScope=scopeOf(await getReportingScope(a));
  const raw=await getLearningBatch({actor:a,scope:clone(reportingScope),asOf,days});
  const batch=clone(raw);
  validateBatch(batch,reportingScope,asOf,days);
  // Verification is authoritative host work: reconcile complete finalized
  // records with the existing native outcome ledger and historical route
  // attestations, verify pre-attempt fixed observations and feedback, exclude
  // out-of-scope/multiple interventions, corrections and protected cases.
  if(await verifyLearningBatch({actor:a,scope:clone(reportingScope),batch:clone(batch),asOf,days})!==true)fail('LEARNING_COHORT_NOT_VERIFIED');
  const report=buildAdvancedLearningReport({input,reportingScope,batch,asOf,days,minimumGroup});
  // Internal digest includes the exact sorted private receipts for race
  // detection; never expose that digest or raw case/receipt keys.
  const privatePin=digest({...batch,rows:[...batch.rows].sort((a,b)=>a.receiptKey.localeCompare(b.receiptKey))});
  return {report,privatePin};
 }
 let busy=false;
 async function exclusive(fn){if(busy)fail('LEARNING_REVIEW_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
 async function fresh(credential,a,params){
  const {days=30,minimumGroup=10}=params||{};
  if(!int(days,1,90)||!int(minimumGroup,10,100))fail('INVALID_ADVANCED_LEARNING_INPUT');
  const asOf=new Date(now()).toISOString().slice(0,10);
  const first=await snapshot(a,asOf,days,minimumGroup);
  const latest=await recheck(credential,a),second=await snapshot(latest,asOf,days,minimumGroup);
  await recheck(credential,a);
  if(first.privatePin!==second.privatePin||first.report.reportFingerprint!==second.report.reportFingerprint)fail('LEARNING_SNAPSHOT_CHANGED');
  return second;
 }
 function find(report,proposalId,expectedReportFingerprint){
  if(!hash(proposalId)||!hash(expectedReportFingerprint)||report.reportFingerprint!==expectedReportFingerprint||report.truncated)fail('LEARNING_REPORT_STALE_OR_INCOMPLETE');
  const p=report.proposals.find(x=>x.proposalId===proposalId);
  if(!p)fail('LEARNING_PROPOSAL_UNAVAILABLE');return p;
 }
 function report(credential,params={}){
  return exclusive(async()=>{const a=await actor(credential);return (await fresh(credential,a,params)).report;});
 }
 function prepare(credential,{proposalId,expectedReportFingerprint,days=30,minimumGroup=10}={}){
  return exclusive(async()=>{
   const a=await actor(credential),params={days,minimumGroup};
   const {report}=await fresh(credential,a,params),proposal=find(report,proposalId,expectedReportFingerprint);
   const latest=await recheck(credential,a);
   if(await mayPrepareLearningProposal(latest,clone(proposal))!==true)fail('FORBIDDEN');
   const final=await fresh(credential,a,params);
   find(final.report,proposalId,expectedReportFingerprint);
   if(await mayPrepareLearningProposal(await recheck(credential,a),clone(proposal))!==true)fail('FORBIDDEN');
   const body={kind:'private_learning_review_draft',schemaVersion:1,status:'needs_independent_review',authorRef:a.actorRef,proposalId,
    reportFingerprint:report.reportFingerprint,days,minimumGroup,proposal:clone(proposal),published:false,activated:false};
   return {...body,draftFingerprint:digest(body)};
  });
 }
 function decide(credential,{draftRef,decision}={}){
  return exclusive(async()=>{
   if(!opaque(draftRef)||!decisionCodes.has(decision))fail('INVALID_LEARNING_REVIEW_DECISION');
   const a=await actor(credential);
   const readDraft=async actor=>{
    const d=await getPreparedDraft({actor,draftRef});
    if(!exact(d,['kind','schemaVersion','status','authorRef','proposalId','reportFingerprint','days','minimumGroup','proposal','published','activated','draftFingerprint'])||
     d.kind!=='private_learning_review_draft'||d.schemaVersion!==1||d.status!=='needs_independent_review'||!id(d.authorRef)||d.authorRef===actor.actorRef||
     d.published!==false||d.activated!==false||!hash(d.draftFingerprint)||!hash(d.proposalId)||!hash(d.reportFingerprint)||!int(d.days,1,90)||!int(d.minimumGroup,10,100))fail('INDEPENDENT_LEARNING_REVIEW_REQUIRED');
    const {draftFingerprint,...body}=d;
    if(digest(body)!==draftFingerprint||await verifyPreparedDraft({actor,draftRef,draft:clone(d)})!==true)fail('LEARNING_DRAFT_NOT_VERIFIED');
    return clone(d);
   };
   const draft=await readDraft(a),params={days:draft.days,minimumGroup:draft.minimumGroup};
   const {report}=await fresh(credential,a,params),proposal=find(report,draft.proposalId,draft.reportFingerprint);
   if(digest(proposal)!==digest(draft.proposal)||!decisionAllowed(proposal,decision))fail('INVALID_LEARNING_REVIEW_DECISION');
   const latest=await recheck(credential,a);
   if(await mayDecideLearningProposal(latest,clone(proposal),decision)!==true)fail('FORBIDDEN');
   const checked=await readDraft(latest);
   if(checked.draftFingerprint!==draft.draftFingerprint)fail('LEARNING_DRAFT_CHANGED');
   const final=await fresh(credential,a,params);find(final.report,draft.proposalId,draft.reportFingerprint);
   const reviewer=await recheck(credential,a);
   if(await mayDecideLearningProposal(reviewer,clone(proposal),decision)!==true||
    (await readDraft(reviewer)).draftFingerprint!==draft.draftFingerprint)fail('LEARNING_REVIEW_CHANGED');
   const body={kind:'private_learning_review_decision',schemaVersion:1,draftFingerprint:draft.draftFingerprint,proposalId:draft.proposalId,
    reportFingerprint:report.reportFingerprint,reviewerRef:reviewer.actorRef,decision,status:'review_disposition_only',published:false,activated:false,
    approvedForRouting:false,requiresNativeWorkflow:true};
   return {...body,decisionFingerprint:digest(body)};
  });
 }
 return Object.freeze({report,prepare,decide});
}
