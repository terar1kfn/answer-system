import {createRuntime} from '../src/runtime.mjs';
import {createIncidentRegistry} from '../src/incidents.mjs';
import {createReviewQueue} from '../src/review-queue.mjs';
import {demoCatalog} from '../src/demo-knowledge.mjs';
export function runtimeCases(a){
 function lab(){
  let time=1000000,n=0,catalog=JSON.parse(JSON.stringify(demoCatalog));
  const now=()=>time,newId=()=> 'id-'+(++n);
  const inc=createIncidentRegistry({now,newId}),r=createRuntime({getCatalog:()=>catalog,getIncidents:scope=>inc.snapshot(scope),now,newId,idleMs:100,durationMs:500,maxVisits:3,maxRecords:4}),q=createReviewQueue({now,newId});
  const open=(ref='v1',opts={})=>r.openVisit({visitRef:ref,...opts});
  const begin=(text,ref='v1',expectedVersion=0)=>r.begin(ref,{expectedVersion,text});
  const answer=(v,optionId,ref=v.visitRef)=>r.respond(ref,{expectedVersion:v.version,issueId:v.issue.issueId,questionId:v.issue.state.decision.questionId||'outcome',optionId}).visit;
  const recovery=()=>{open();return answer(begin('I lost my old phone'),'no');};
  const prep=(v,requestKey='req-a',extra={})=>r.prepareHandoff(v.visitRef,{expectedVersion:v.version,issueId:v.issue.issueId,requestKey,confirmed:true,...extra});
  const record=(o,status,hostRef)=>r.recordHandoffResult(o.operationId,{attempt:o.attempt,status,...(hostRef?{hostRef}:{})});
  const retry=v=>r.retryHandoff(v.visitRef,{expectedVersion:v.version,issueId:v.issue.issueId,requestKey:'req-a'});
  const resume=(v,hostRef)=>r.resumeRecovery(v.visitRef,{expectedVersion:v.version,issueId:v.issue.issueId,hostRef});
  const incident=(scope=null,expiresInMs)=>{const i=inc.create({serviceId:'network',scope,actorRef:'staff-a'});return inc.transition(i.id,{expectedRevision:1,status:'confirmed',actorRef:'staff-b',...(expiresInMs?{expiresInMs}:{})});};
  return {r,inc,q,open,begin,answer,recovery,prep,record,retry,resume,incident,advance:n=>time+=n,change:()=>{catalog={...catalog,revision:'changed'};}};
 }
 const proposal={actorRef:'staff-a',caseCode:'case-demo',causeCode:'mfa-setup',solutionRef:'guide-demo',catalogRevision:'rev-1',proposalKind:'new_alias'};
 return [
 ['trusted visit starts isolated issue',()=>{const l=lab();l.open();const v=l.begin('Wi-Fi not working');a.equal(v.version,1);a.equal(v.issue.state.decision.questionId,'connection');}],
 ['cross-visit issue denied',()=>{const l=lab();l.open();l.open('v2');const v=l.begin('Wi-Fi not working'),w=l.begin('Email not working','v2');a.throws(()=>l.r.respond('v2',{expectedVersion:w.version,issueId:v.issue.issueId,questionId:'connection',optionId:'yes'}),/ISSUE_NOT_ACTIVE/);}],
 ['replayed version denied',()=>{const l=lab();l.open();const v=l.begin('Wi-Fi not working');l.answer(v,'no');a.throws(()=>l.answer(v,'no'),/STALE_VISIT_VERSION/);}],
 ['new issue invalidates old response',()=>{const l=lab();l.open();const v=l.begin('Wi-Fi not working'),w=l.begin('Email not working','v1',v.version);a.throws(()=>l.r.respond('v1',{expectedVersion:w.version,issueId:v.issue.issueId,questionId:'connection',optionId:'no'}),/ISSUE_NOT_ACTIVE/);}],
 ['ambiguous free text does not advance',()=>{const l=lab();l.open();const v=l.begin('Wi-Fi not working'),x=l.r.respond('v1',{expectedVersion:v.version,issueId:v.issue.issueId,text:'yes and no'});a.equal(x.kind,'clarify');a.equal(x.visit.version,v.version);}],
 ['mixed answer input denied',()=>{const l=lab();l.open();const v=l.begin('Wi-Fi not working');a.throws(()=>l.r.respond('v1',{expectedVersion:v.version,issueId:v.issue.issueId,text:'no',optionId:'yes'}),/AMBIGUOUS_INPUT/);}],
 ['idle expiry',()=>{const l=lab();l.open();l.advance(101);a.throws(()=>l.r.read('v1'),/VISIT_NOT_ACTIVE/);}],
 ['absolute expiry despite activity',()=>{const l=lab();l.open();for(let i=0;i<5;i++){l.advance(90);l.r.keepAlive('v1');}l.advance(51);a.throws(()=>l.r.read('v1'),/VISIT_NOT_ACTIVE/);}],
 ['host-authorized persistent survives expiry',()=>{const l=lab();l.open('v1',{persistent:true});l.advance(1000);a.equal(l.r.read('v1').persistent,true);}],
 ['persistent student finish denied',()=>{const l=lab();l.open('v1',{persistent:true});a.throws(()=>l.r.finishVisit('v1'),/STAFF_TERMINATION_REQUIRED/);}],
 ['staff termination clears persistent visit',()=>{const l=lab();l.open('v1',{persistent:true});l.r.terminateVisit('v1');a.throws(()=>l.r.read('v1'),/VISIT_NOT_ACTIVE/);}],
 ['normal finish clears state',()=>{const l=lab();l.open();l.r.finishVisit('v1');a.throws(()=>l.r.read('v1'),/VISIT_NOT_ACTIVE/);}],
 ['visit capacity bounded',()=>{const l=lab();l.open();l.open('v2');l.open('v3');a.throws(()=>l.open('v4'),/VISIT_CAPACITY/);}],
 ['catalog change hides obsolete guidance',()=>{const l=lab();l.open();l.begin('Recipient address not found');l.change();const v=l.r.read('v1');a.equal(v.issue.status,'refresh_required');a.ok(!v.issue.state);}],
 ['catalog change blocks old transition',()=>{const l=lab();l.open();const v=l.begin('Wi-Fi not working');l.change();a.throws(()=>l.answer(v,'no'),/CATALOG_CHANGED/);}],
 ['explicit confirmation required',()=>{const l=lab(),v=l.recovery();a.throws(()=>l.prep(v,'req-a',{confirmed:false}),/CONFIRMATION_REQUIRED/);}],
 ['handoff not allowed before offer',()=>{const l=lab();l.open();a.throws(()=>l.prep(l.begin('Wi-Fi not working')),/HANDOFF_NOT_OFFERED/);}],
 ['intent is not ticket delivery',()=>{const l=lab(),x=l.prep(l.recovery());a.equal(x.operation.status,'prepared');a.ok(!x.operation.hostRef);}],
 ['same key idempotent',()=>{const l=lab(),v=l.recovery(),x=l.prep(v);a.equal(l.prep(v).operation.operationId,x.operation.operationId);}],
 ['different key cannot duplicate action',()=>{const l=lab(),v=l.recovery();l.prep(v);a.throws(()=>l.prep(v,'req-b'),/HANDOFF_ALREADY_EXISTS/);}],
 ['unknown delivery cannot retry',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.record(o,'unknown');a.throws(()=>l.retry(l.r.read('v1')),/RETRY_NOT_SAFE/);}],
 ['uncertain delivery prevents replacement',()=>{const l=lab(),o=l.prep(l.recovery()).operation;const v=l.r.read('v1');a.throws(()=>l.begin('Wi-Fi not working','v1',v.version),/HANDOFF_UNCERTAIN/);}],
 ['definitive failure enables same-key retry',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.record(o,'failed');const x=l.retry(l.r.read('v1')).operation;a.equal(x.operationId,o.operationId);a.equal(x.attempt,2);}],
 ['obsolete attempt cannot record delivery',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.record(o,'failed');l.retry(l.r.read('v1'));a.throws(()=>l.record(o,'recorded','ticket-a'),/STALE_ATTEMPT/);}],
 ['delivery requires host reference',()=>{const l=lab(),o=l.prep(l.recovery()).operation;a.throws(()=>l.record(o,'recorded'),/INVALID_DELIVERY_RESULT/);}],
 ['recorded recovery waits for IT',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.record(o,'recorded','recovery-a');a.equal(l.r.read('v1').issue.status,'awaiting_it');}],
 ['verified recovery resumes same issue',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.record(o,'recorded','recovery-a');const v=l.r.read('v1'),w=l.resume(v,'recovery-a');a.equal(w.issue.issueId,v.issue.issueId);a.equal(w.issue.state.decision.questionId,'phone');a.equal(l.answer(w,'ios').issue.state.decision.guideId,'demo-mfa-ios');}],
 ['wrong recovery reference rejected',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.record(o,'recorded','recovery-a');a.throws(()=>l.resume(l.r.read('v1'),'wrong'),/RECOVERY_NOT_CONFIRMED/);}],
 ['closing visit scrubs uncertain payload',()=>{const l=lab(),o=l.prep(l.recovery()).operation;l.r.terminateVisit('v1');const x=l.record(o,'unknown');a.equal(x.payload,null);a.equal(x.visitClosed,true);}],
 ['incident signal deduplication',()=>{const l=lab(),x={visitRef:'v1',serviceId:'network',scope:'site-a'};a.equal(l.inc.report(x).accepted,true);a.equal(l.inc.report(x).accepted,false);}],
 ['multiple reports suspected only',()=>{const l=lab();for(const visitRef of ['v1','v2','v3'])l.inc.report({visitRef,serviceId:'network',scope:'site-a'});a.equal(l.inc.candidates()[0].status,'suspected');a.equal(l.inc.snapshot('site-a').length,0);}],
 ['different locations not merged',()=>{const l=lab();for(const [visitRef,scope] of [['v1','a'],['v2','a'],['v3','b']])l.inc.report({visitRef,serviceId:'network',scope});a.equal(l.inc.candidates().length,0);}],
 ['investigating not outage',()=>{const l=lab();l.inc.create({serviceId:'network',actorRef:'staff-a',scope:'site-a'});l.open('v1',{scope:'site-a'});a.equal(l.begin('Wi-Fi not working').issue.state.decision.kind,'ask');}],
 ['staff-confirmed scope match',()=>{const l=lab();l.incident('site-a');l.open('v1',{scope:'site-a'});a.equal(l.begin('Wi-Fi not working').issue.state.decision.kind,'incident_notice');}],
 ['incident isolated by location',()=>{const l=lab();l.incident('site-a');l.open('v1',{scope:'site-b'});a.equal(l.begin('Wi-Fi not working').issue.state.decision.kind,'ask');}],
 ['expired incident absent',()=>{const l=lab();l.incident(null,50);l.advance(51);a.equal(l.inc.snapshot().length,0);}],
 ['resolved incident absent',()=>{const l=lab(),i=l.incident();l.inc.transition(i.id,{expectedRevision:i.revision,status:'resolved',actorRef:'staff-b'});a.equal(l.inc.snapshot().length,0);}],
 ['stale incident transition denied',()=>{const l=lab(),i=l.incident();a.throws(()=>l.inc.transition(i.id,{expectedRevision:1,status:'resolved',actorRef:'staff-b'}),/STALE_INCIDENT_REVISION/);}],
 ['stale incident notice hidden on read',()=>{const l=lab(),i=l.incident(null,50);l.open();l.begin('Wi-Fi not working');l.advance(51);a.equal(l.r.read('v1').issue.status,'refresh_required');}],
 ['draft not approved to publish',()=>{const l=lab(),p=l.q.propose(proposal);a.throws(()=>l.q.publicationCandidate(p.id,{currentCatalogRevision:'rev-1'}),/PROPOSAL_NOT_APPROVED/);}],
 ['self review denied',()=>{const l=lab(),p=l.q.propose(proposal);a.throws(()=>l.q.review(p.id,{expectedRevision:1,reviewerRef:'staff-a',decision:'approve',currentCatalogRevision:'rev-1'}),/INVALID_REVIEW/);}],
 ['revision conflict in review',()=>{const l=lab(),p=l.q.propose(proposal);a.throws(()=>l.q.review(p.id,{expectedRevision:1,reviewerRef:'staff-b',decision:'approve',currentCatalogRevision:'rev-2'}),/CATALOG_CHANGED/);}],
 ['approved proposal returns candidate only',()=>{const l=lab(),p=l.q.propose(proposal);l.q.review(p.id,{expectedRevision:1,reviewerRef:'staff-b',decision:'approve',currentCatalogRevision:'rev-1'});a.equal(l.q.publicationCandidate(p.id,{currentCatalogRevision:'rev-1'}).solutionRef,'guide-demo');}],
 ['raw prose excluded from structured code',()=>{const l=lab();a.throws(()=>l.q.propose({...proposal,caseCode:'student private words'}),/INVALID_PROPOSAL/);}]
 ];
}
