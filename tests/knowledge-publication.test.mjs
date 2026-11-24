import test from 'node:test';
import assert from 'node:assert/strict';
import {RULE_VERSION} from '../src/engine.mjs';
import {auditNativeKnowledgeQuality} from '../src/integration/knowledge-quality.mjs';
import {buildAdvancedLearningReport} from '../src/integration/advanced-learning.mjs';
import {createApprovedMappingProvider} from '../src/integration/mapping-release.mjs';
import {createContextReleaseCoordinator,createContextualMappingProvider} from '../src/integration/context-release.mjs';
import {nativeRecordFingerprint as digest} from '../src/integration/native-fingerprint.mjs';
import {disambiguateReviewedContext} from '../src/reviewed-context.mjs';
import {syntheticNative,clone} from './fixtures/native-synthetic.mjs';

const asOf='2026-01-15';
const context={task:'send',send_error:'address',device_os:'windows'};
const scope=n=>({allowedGuideIds:n.mapping.guides.map(g=>g.guideId),completeServiceIds:['mail']});
test('quality audit detects duplicate procedures, outdated reviews and equivalent conditions',()=>{
 const n=syntheticNative({two:true,conditional:true});
 n.configuration.guides[1].resolutionSteps=clone(n.configuration.guides[0].resolutionSteps);
 n.configuration.guides[1].resolutionStepsAr=clone(n.configuration.guides[0].resolutionStepsAr);n.refreshPins();
 const a=auditNativeKnowledgeQuality({input:n.input,reviewScope:scope(n),asOf,sourceReviews:[{guideId:n.mapping.guides[0].guideId,guideFingerprint:n.mapping.guides[0].expectedFingerprint,checkedOn:'2025-12-01',reviewDueOn:'2026-01-01',sourceStatus:'changed'}]});
 for(const code of ['DUPLICATE_PROCEDURE_TEXT','SOURCE_REVIEW_OVERDUE','SOURCE_CHANGED','POTENTIAL_GUIDE_CONFLICT'])assert.ok(a.findings.some(f=>f.code===code),code);
 assert.equal(a.automaticRoutingChanges,false);assert.equal(a.published,false);
 assert.ok(!JSON.stringify(a).includes('Synthetic check'));
 assert.throws(()=>auditNativeKnowledgeQuality({input:n.input,reviewScope:{allowedGuideIds:[n.mapping.guides[0].guideId],completeServiceIds:['mail']},asOf}),/QUALITY_INCOMPLETE_REVIEW_SCOPE/);
});
test('native route blockers reject cycles and missing destinations',()=>{
 const n=syntheticNative();const g=n.configuration.guides[0],r=n.mapping.guides[0];
 g.diagnosticQuestions=[{id:'q1',text:'Synthetic?',textAr:'تجريبي؟',options:[{id:'a',label:'Next',labelAr:'التالي',nextStepId:'q1'},{id:'b',label:'Missing',labelAr:'مفقود',nextStepId:'CASE:absent'}]}];
 r.entryMode='diagnostic';n.refreshPins();
 const review=n.route();
 assert.ok(review.blockers.some(b=>b.code==='ROUTE_FORWARD_CYCLE_NATIVE_ONLY'));
 assert.ok(review.blockers.some(b=>b.code==='ROUTE_TARGET_MISSING'));
});
function cohort(n,count=10){
 const g=n.mapping.guides[0],route=n.route();
 const rows=Array.from({length:count},(_,i)=>({caseKey:'synthetic_case_key_'+String(i).padStart(8,'0'),receiptKey:'synthetic_receipt_key_'+String(i).padStart(8,'0'),revision:1,day:asOf,
  serviceId:'mail',purpose:g.purpose,guideId:g.guideId,guideFingerprint:g.expectedFingerprint,sourceRevision:'21',routeFingerprint:route.routeFingerprint,
  routeAttribution:'single_native_guide',ruleVersion:RULE_VERSION,completion:'attempted',outcome:'resolved',provenance:'staff_verified',attribution:'guide_only',context:clone(context),feedback:null}));
 return {revision:'synthetic_cohort_revision_0001',asOf,days:30,complete:true,rows};
}
function report(n,batch){return buildAdvancedLearningReport({input:n.input,reportingScope:{allowedGuideIds:n.mapping.guides.map(g=>g.guideId),serviceIds:['mail']},batch,asOf,days:30,minimumGroup:10});}
test('verified complete cohort can suggest review of an exact applicability tie',()=>{
 const n=syntheticNative({two:true,conditional:true}),b=cohort(n),r=report(n,b);
 const p=r.proposals.find(p=>p.kind==='review_recurring_success_context');
 assert.ok(p);assert.equal(p.details.possibleDisambiguation,true);assert.equal(p.published,false);
 assert.equal(r.automaticRoutingChanges,false);assert.ok(!JSON.stringify(r).includes(b.rows[0].caseKey));assert.ok(!JSON.stringify(r).includes(b.rows[0].receiptKey));
 assert.deepEqual(r,report(n,b));
});
test('learning suppresses small, unverified, repeated and stale groups',()=>{
 const n=syntheticNative({two:true,conditional:true});
 assert.equal(report(n,cohort(n,9)).proposals.length,0);
 for(const update of [{provenance:'student_reported'},{sourceRevision:'20'},{attribution:'multiple_interventions'}]){
  const b=cohort(n);b.rows.forEach(r=>Object.assign(r,update));assert.equal(report(n,b).proposals.length,0);
 }
 const repeated=cohort(n);repeated.rows[1].caseKey=repeated.rows[0].caseKey;assert.equal(report(n,repeated).proposals.length,0);
 const duplicate=cohort(n);duplicate.rows[1].receiptKey=duplicate.rows[0].receiptKey;assert.throws(()=>report(n,duplicate),/DUPLICATE_LEARNING_RECEIPT/);
 assert.throws(()=>report(n,{...cohort(n),complete:false}),/INCOMPLETE_LEARNING_COHORT/);
});
test('recurring verified feedback and unresolved outcomes are leads, not routing changes',()=>{
 const n=syntheticNative({two:true,conditional:true}),b=cohort(n,20);
 b.rows.slice(0,10).forEach(r=>{r.outcome='unresolved';r.feedback='instruction_unclear';});
 const r=report(n,b);
 assert.ok(r.proposals.some(p=>p.kind==='review_repeated_unresolved_outcomes'));
 assert.ok(r.proposals.some(p=>p.kind==='review_recurring_staff_feedback'));
 assert.ok(!r.proposals.some(p=>p.kind==='review_recurring_success_context'));
 assert.equal(r.automaticRoutingChanges,false);
});
async function publicationLab(){
 const n=syntheticNative({two:true,conditional:true}),base=await n.approvedBase(),g=n.mapping.guides[0];
 const people={author:{actorRef:'synthetic-author',role:'INTERN',active:true},reviewer:{actorRef:'synthetic-reviewer',role:'INTERN',active:true},manager:{actorRef:'synthetic-manager',role:'MANAGER',active:true},student:{actorRef:'synthetic-student',role:'STUDENT',active:true}};
 let head={sequence:0,release:null,revokedPatternIds:[]},draft=null,candidate=null,historical=null,evidenceCurrent=true,activeVerified=true;
 const caseRecord={id:'synthetic-case',approved:true,outcomeEvidence:'staff_verified',outcome:'resolved',serviceId:'mail',solutionRef:g.guideId,guideFingerprint:g.expectedFingerprint,signals:Object.entries(context).map(([key,value])=>({key,value}))};
 const hooks={getConfiguration:async()=>clone(n.configuration),getActiveRelease:async()=>clone(base),verifyActiveRelease:async({releaseFingerprint})=>releaseFingerprint===base.releaseFingerprint,
  getContextHead:async()=>clone(head),verifyContextHead:async({headFingerprint})=>headFingerprint===digest(head),
  verifyActiveContextRelease:async({releaseFingerprint,headFingerprint})=>activeVerified&&releaseFingerprint===head.release?.releaseFingerprint&&headFingerprint===digest(head),
  authenticate:async credential=>people[credential]??null,mayManageContext:async()=>true,getReviewInput:async()=>n.input,
  getCaseEvidence:async()=>({caseRecord:clone(caseRecord),evidenceFingerprint:digest(caseRecord)}),verifyCaseEvidence:async()=>evidenceCurrent,
  getDraft:async()=>clone(draft),verifyDraft:async({draft:d})=>digest(d)===digest(draft),
  getApprovedCandidate:async()=>clone(candidate),verifyApprovedCandidate:async({candidate:c})=>digest(c)===digest(candidate),
  getHistoricalRelease:async()=>clone(historical),verifyHistoricalRelease:async({release})=>digest(release)===digest(historical),
  commitContextHead:async({expectedHeadFingerprint,expectedSequence,nextSequence,baseMappingFingerprint,change})=>{
   // Synthetic CAS transaction. Never use this mock as native production authority.
   assert.equal(expectedHeadFingerprint,digest(head));assert.equal(expectedSequence,head.sequence);assert.equal(nextSequence,head.sequence+1);assert.equal(baseMappingFingerprint,digest(base.payload.mapping));
   if(change.kind==='activate'){
    assert.equal(change.releaseFingerprint,candidate.releaseFingerprint);
    const release={kind:'native_context_release',status:'active',activationRef:'synthetic-context-activation-'+nextSequence,payload:clone(candidate.payload),releaseFingerprint:candidate.releaseFingerprint};
    head={sequence:nextSequence,release,revokedPatternIds:[]};historical=clone(release);
   }else if(change.kind==='revoke_all')head={sequence:nextSequence,release:null,revokedPatternIds:[]};
   else head={...head,sequence:nextSequence,revokedPatternIds:[...head.revokedPatternIds,change.patternId]};
   return {status:'committed',headFingerprint:digest(head),sequence:head.sequence};
  }};
 const coordinator=createContextReleaseCoordinator(hooks),provider=createContextualMappingProvider(hooks);
 const selection={patternId:'synthetic-pattern',caseRef:caseRecord.id,purpose:g.purpose,match:clone(context)};
 const prepare=async(credential='author')=>{draft=await coordinator.prepare(credential,{releaseId:'synthetic-release-1',expectedHeadFingerprint:digest(head),selections:[selection]});return draft;};
 const review=async(credential='reviewer')=>{candidate=await coordinator.review(credential,{draftRef:'synthetic-draft'});return candidate;};
 const activate=(credential='manager')=>coordinator.activate(credential,{candidateRef:'synthetic-candidate',operationRef:'synthetic-operation-1',expectedHeadFingerprint:digest(head)});
 return {n,base,people,hooks,coordinator,provider,selection,prepare,review,activate,head:()=>clone(head),setEvidence:v=>evidenceCurrent=v,setActiveVerified:v=>activeVerified=v,
  restore:async()=>{draft=await coordinator.prepareRollback('author',{releaseId:'synthetic-release-restored',expectedHeadFingerprint:digest(head),historicalReleaseRef:'synthetic-old-release'});return draft;}};
}
test('context release requires independent review and manager activation',async()=>{
 const l=await publicationLab(),base=clone(l.base.payload.mapping);
 assert.equal((await l.provider(l.people.student)).reviewedContexts.length,0);
 await assert.rejects(()=>l.prepare('student'),/FORBIDDEN/);
 const d=await l.prepare();assert.equal(d.status,'needs_independent_review');
 await assert.rejects(()=>l.review('author'),/INDEPENDENT_CONTEXT_REVIEW_REQUIRED/);
 const c=await l.review();assert.equal(c.activated,false);
 await assert.rejects(()=>l.activate('reviewer'),/FORBIDDEN/);
 assert.equal((await l.activate()).status,'committed');
 const m=await l.provider(l.people.student);assert.equal(m.reviewedContexts.length,1);
 assert.deepEqual(m.guides,base.guides);assert.deepEqual(l.base.payload.mapping,base);
 const catalog=l.n.projection().catalog;catalog.reviewedContexts=clone(m.reviewedContexts);
 const result=disambiguateReviewedContext({catalog,state:{domain:'mail',services:['mail'],evidence:Object.fromEntries(Object.entries(context).map(([k,value])=>[k,{value}])),askedQuestionIds:[]},tiedGuides:catalog.guides});
 assert.equal(result.kind,'guide');
});
test('corrected evidence blocks activation; revoked release cannot silently return',async()=>{
 const l=await publicationLab();await l.prepare();await l.review();
 l.setEvidence(false);await assert.rejects(()=>l.activate(),/CONTEXT_CASE_EVIDENCE_UNVERIFIED/);
 l.setEvidence(true);await l.activate();const before=await l.provider(l.people.student);
 l.setActiveVerified(false);await assert.rejects(()=>l.provider(l.people.student),/CONTEXT_RELEASE_UNAVAILABLE/);l.setActiveVerified(true);
 const revoked=await l.coordinator.revoke('manager',{patternId:'synthetic-pattern',operationRef:'synthetic-revoke-1',expectedHeadFingerprint:digest(l.head()),reasonCode:'evidence_corrected'});
 assert.equal(revoked.sequence,2);
 const after=await l.provider(l.people.student);assert.equal(after.reviewedContexts.length,0);assert.notEqual(after.revision,before.revision);
 l.setEvidence(false);await assert.rejects(()=>l.restore(),/CONTEXT_CASE_EVIDENCE_UNVERIFIED/);
 l.setEvidence(true);const d=await l.restore();assert.equal(d.expectedSequence,2);assert.ok(d.restoredFrom);
 assert.equal((await l.provider(l.people.student)).reviewedContexts.length,0);
});
test('plain approved mapping cannot consume contextual patterns',async()=>{
 const l=await publicationLab();await l.prepare();await l.review();await l.activate();
 const bad=clone(l.base);bad.payload.mapping.reviewedContexts=(await l.provider(l.people.student)).reviewedContexts;bad.releaseFingerprint=digest(bad.payload);
 const provider=createApprovedMappingProvider({getConfiguration:l.hooks.getConfiguration,getActiveRelease:async()=>bad,verifyActiveRelease:async()=>true});
 await assert.rejects(()=>provider(l.people.student),/APPROVED_MAPPING_UNAVAILABLE/);
});
