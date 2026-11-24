import {createApprovedMappingProvider} from './mapping-release.mjs';
import {projectNativeCatalog} from './native-catalog.mjs';
import {nativeRecordFingerprint as digest} from './native-fingerprint.mjs';
import {inspectNativeGuideRoute} from './native-route-review.mjs';
import {prepareReviewedContextDraft,approveReviewedContextDraft,validateReviewedContexts} from '../reviewed-context.mjs';
import {planApplicableGuides} from '../guide-selection.mjs';
import {RULE_VERSION} from '../engine.mjs';
import {isUnconfirmedLearningValue} from '../diagnostic-evidence.mjs';

const fail=x=>{throw Error(x);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const list=(x,n)=>Array.isArray(x)&&x.length<=n;
const unique=x=>new Set(x).size===x.length;
const maxPatterns=100;
const order=(a,b)=>a.id.localeCompare(b.id);
const nextSequence=n=>{if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)fail('CONTEXT_SEQUENCE_EXHAUSTED');return n+1;};
const noContexts=m=>m&&(!Object.hasOwn(m,'reviewedContexts')||Array.isArray(m.reviewedContexts)&&m.reviewedContexts.length===0);
const overlaps=(a,b)=>!Object.entries(a).some(([k,v])=>Object.hasOwn(b,k)&&b[k]!==v);
const pinned=(m,c)=>noContexts(m)&&m.sourceRevision===String(c.gatewayRevision??c.revision)&&m.sourceCatalogFingerprint===digest(c);
function checkSelections(rows){
 if(!list(rows,maxPatterns)||!rows.length||!rows.every(r=>exact(r,['patternId','caseRef','purpose','match'])&&id(r.patternId)&&id(r.caseRef)&&id(r.purpose)&&r.match&&typeof r.match==='object'&&!Array.isArray(r.match)&&Object.keys(r.match).length>=2&&Object.keys(r.match).length<=6&&Object.entries(r.match).every(([k,v])=>id(k)&&id(v)&&!isUnconfirmedLearningValue(v)))||!unique(rows.map(r=>r.patternId)))fail('INVALID_CONTEXT_SELECTIONS');
}
function validateEntries(entries,authorRef,reviewerRef){
 if(!list(entries,maxPatterns)||!entries.length||!entries.every(e=>exact(e,['pattern','evidenceFingerprint','routeFingerprint'])&&hash(e.evidenceFingerprint)&&hash(e.routeFingerprint)))fail('INVALID_CONTEXT_RELEASE_ENTRIES');
 validateReviewedContexts(entries.map(e=>e.pattern));
 if(entries.some(e=>e.pattern.enabled!==true||e.pattern.authorRef!==authorRef||e.pattern.reviewerRef!==reviewerRef||!hash(e.pattern.guideFingerprint)))fail('INVALID_CONTEXT_RELEASE_PATTERN');
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i].pattern,b=entries[j].pattern;
  if(a.serviceId===b.serviceId&&a.purpose===b.purpose&&a.guideId!==b.guideId&&overlaps(a.match,b.match))fail('CONFLICTING_CONTEXT_RELEASE_PATTERNS');
 }
}
const payloadKeys=['releaseId','authorRef','reviewerRef','baseMappingFingerprint','sourceRevision','sourceCatalogFingerprint','ruleVersion','expectedHeadFingerprint','expectedSequence','restoredFrom','entries'];
function validatePayload(p){
 if(!exact(p,payloadKeys)||!id(p.releaseId)||!id(p.authorRef)||!id(p.reviewerRef)||p.authorRef===p.reviewerRef||
 !hash(p.baseMappingFingerprint)||!id(p.sourceRevision)||!hash(p.sourceCatalogFingerprint)||!id(p.ruleVersion)||!hash(p.expectedHeadFingerprint)||
 !Number.isSafeInteger(p.expectedSequence)||p.expectedSequence<0||!(p.restoredFrom===null||hash(p.restoredFrom)))fail('INVALID_CONTEXT_RELEASE_PAYLOAD');
 validateEntries(p.entries,p.authorRef,p.reviewerRef);
 if(p.entries.some(e=>e.pattern.sourceRevision!==p.sourceRevision))fail('INVALID_CONTEXT_RELEASE_SOURCE');
}
function validateActive(r){
 if(!exact(r,['kind','status','activationRef','payload','releaseFingerprint'])||r.kind!=='native_context_release'||r.status!=='active'||!id(r.activationRef)||!hash(r.releaseFingerprint))fail('INVALID_ACTIVE_CONTEXT_RELEASE');
 validatePayload(r.payload);
 if(digest(r.payload)!==r.releaseFingerprint)fail('CONTEXT_RELEASE_FINGERPRINT_MISMATCH');
}
function validateHead(head){
 if(!exact(head,['sequence','release','revokedPatternIds'])||!Number.isSafeInteger(head.sequence)||head.sequence<0||!list(head.revokedPatternIds,maxPatterns)||
 !head.revokedPatternIds.every(id)||!unique(head.revokedPatternIds))fail('INVALID_CONTEXT_HEAD');
 if(head.release===null){
  if(head.revokedPatternIds.length)fail('INVALID_CONTEXT_HEAD');
 }else{
  validateActive(head.release);
  if(head.sequence<=head.release.payload.expectedSequence||head.revokedPatternIds.some(x=>!head.release.payload.entries.some(e=>e.pattern.id===x)))fail('INVALID_CONTEXT_HEAD');
 }
 return head;
}
const currentEntries=head=>head.release?head.release.payload.entries.filter(e=>!head.revokedPatternIds.includes(e.pattern.id)):[];
/** Only a new view of an already approved mapping. The approved base,
 * original native guide rows and their release fingerprints are unchanged. */
function overlay(base,head){
 const p=head.release?.payload;
 const current=p&&p.ruleVersion===RULE_VERSION&&p.baseMappingFingerprint===digest(base)&&p.sourceRevision===base.sourceRevision&&p.sourceCatalogFingerprint===base.sourceCatalogFingerprint;
 return {...clone(base),revision:'context-'+digest({baseMappingFingerprint:digest(base),headFingerprint:digest(head)}),
  reviewedContexts:current?currentEntries(head).map(e=>clone(e.pattern)).sort(order):[]};
}
function readSetup({getConfiguration,getActiveRelease,verifyActiveRelease,getContextHead,verifyContextHead}){
 if(![getContextHead,verifyContextHead].every(f=>typeof f==='function'))fail('CONTEXT_HEAD_HOOKS_REQUIRED');
 const getBase=createApprovedMappingProvider({getConfiguration,getActiveRelease,verifyActiveRelease});
 async function head(actor){
  const h=clone(await getContextHead(actor));
  validateHead(h);
  // This must verify the real current durable head, including an empty
  // head, authority, monotonic sequence, active release and revocations.
  if(await verifyContextHead({actor,head:clone(h),headFingerprint:digest(h)})!==true)fail('CONTEXT_HEAD_UNVERIFIED');
  return h;
 }
 async function pair(actor){
  const [base,h]=await Promise.all([getBase(actor),head(actor)]);
  if(!noContexts(base))fail('CONTEXT_BASE_MAPPING_REQUIRED');
  return {base,head:h,baseFingerprint:digest(base),headFingerprint:digest(h)};
 }
 const same=(a,b)=>a.baseFingerprint===b.baseFingerprint&&a.headFingerprint===b.headFingerprint;
 return {getBase,head,pair,same};
}
/** Supply as getMapping to the existing embedded bridge. All context
 * releases must be consumed through this opt-in provider; no student
 * credential can prepare, review or activate a release. */
async function verifyEffective(hooks,actor,s){
 const effective=overlay(s.base,s.head);
 if(effective.reviewedContexts.length){
  const r=s.head.release;
  if(await hooks.verifyActiveContextRelease({actor,releaseFingerprint:r.releaseFingerprint,activationRef:r.activationRef,headFingerprint:s.headFingerprint,patternIds:effective.reviewedContexts.map(p=>p.id)})!==true)fail('CONTEXT_RELEASE_UNVERIFIED');
 }
 return effective;
}
export function createContextualMappingProvider(hooks={}){
 const read=readSetup(hooks);
 if(typeof hooks.verifyActiveContextRelease!=='function')fail('CONTEXT_RELEASE_VERIFIER_REQUIRED');
 return async function getMapping(actor){
  try{
   const first=await read.pair(actor);
   await verifyEffective(hooks,actor,first);
   const second=await read.pair(actor);
   if(!read.same(first,second))fail('CONTEXT_RELEASE_CHANGED');
   // The host independently verifies live activation and evidence corrections.
   // A missing or inconsistent head never silently reactivates old patterns.
   return await verifyEffective(hooks,actor,second);
  }catch{fail('CONTEXT_RELEASE_UNAVAILABLE');}
 };
}
function reviewProjection(input,base){
 if(!input||!input.configuration||!pinned(base,input.configuration))fail('CONTEXT_BASE_CHANGED');
 const projection=projectNativeCatalog({...input,mapping:base});
 // A release author/reviewer must have the independently authorized full
 // base mapping scope; no tie may be justified by hiding competing guides.
 if(projection.withheld.length||projection.catalog.guides.length!==base.guides.length)fail('CONTEXT_FULL_REVIEW_SCOPE_REQUIRED');
 return projection.catalog;
}
function exactTie(catalog,pattern){
 const g=catalog.guides.find(g=>g.id===pattern.guideId&&g.serviceId===pattern.serviceId&&g.purpose===pattern.purpose&&g.nativeGuideFingerprint===pattern.guideFingerprint);
 if(!g||!id(g.nativeServiceId))fail('CONTEXT_GUIDE_NOT_CURRENT');
 const evidence=Object.fromEntries(Object.entries(pattern.match).map(([k,value])=>[k,{value}]));
 const plan=planApplicableGuides({guides:catalog.guides.filter(x=>x.serviceId===g.serviceId&&x.purpose===g.purpose),state:{evidence,askedQuestionIds:[]},serviceId:g.serviceId,purpose:g.purpose});
 if(plan.kind!=='matched'||plan.guides.length<2||!plan.guides.some(x=>x.id===g.id)||plan.guides.some(x=>x.nativeServiceId!==g.nativeServiceId))fail('CONTEXT_NOT_EXACT_OWNER_TIE');
 return plan.guides;
}
function routePin(input,base,catalog,pattern){
 const tied=exactTie(catalog,pattern);
 let pin=null;
 for(const g of tied){
  const m=base.guides.find(m=>m.guideId===g.id);
  if(!m||m.expectedFingerprint!==g.nativeGuideFingerprint)fail('CONTEXT_GUIDE_NOT_CURRENT');
  const route=inspectNativeGuideRoute({...input,mappingRow:m});
  if(route.truncated||route.blockers.length)fail('CONTEXT_ROUTE_NOT_APPROVED');
  if(g.id===pattern.guideId)pin=route.routeFingerprint;
 }
 return pin;
}
const draftKeys=['kind','status','releaseId','authorRef','baseMappingFingerprint','sourceRevision','sourceCatalogFingerprint','ruleVersion','expectedHeadFingerprint','expectedSequence','restoredFrom','selections','entries','draftFingerprint'];
function validateDraft(d){
 if(!exact(d,draftKeys)||d.kind!=='private_context_release_draft'||d.status!=='needs_independent_review'||!id(d.releaseId)||!id(d.authorRef)||
 !hash(d.baseMappingFingerprint)||!hash(d.sourceCatalogFingerprint)||!id(d.sourceRevision)||d.ruleVersion!==RULE_VERSION||!hash(d.expectedHeadFingerprint)||
 !Number.isSafeInteger(d.expectedSequence)||d.expectedSequence<0||!(d.restoredFrom===null||hash(d.restoredFrom))||!hash(d.draftFingerprint))fail('INVALID_CONTEXT_RELEASE_DRAFT');
 checkSelections(d.selections);
 if(!list(d.entries,maxPatterns)||d.entries.length!==d.selections.length)fail('INVALID_CONTEXT_RELEASE_DRAFT');
 const {draftFingerprint,...body}=d;
 if(digest(body)!==draftFingerprint)fail('CONTEXT_DRAFT_FINGERPRINT_MISMATCH');
}
const currentPin=(d,s)=>d.baseMappingFingerprint===s.baseFingerprint&&d.expectedHeadFingerprint===s.headFingerprint&&d.expectedSequence===s.head.sequence&&d.sourceRevision===s.base.sourceRevision&&d.sourceCatalogFingerprint===s.base.sourceCatalogFingerprint&&d.ruleVersion===RULE_VERSION;
/**
 * Trusted native host coordinator. Draft/review functions are read-only.
 * Mutation is a compare-and-swap request to the authoritative native host;
 * the host must reauthorize inside its durable transaction, verify the
 * exact approved candidate and persist an audit event atomically.
 */
export function createContextReleaseCoordinator(hooks={}){
 const read=readSetup(hooks);
 const {authenticate,mayManageContext,getReviewInput,getCaseEvidence,verifyCaseEvidence,getDraft,verifyDraft,getApprovedCandidate,verifyApprovedCandidate,getHistoricalRelease,verifyHistoricalRelease,commitContextHead}=hooks;
 if(![authenticate,mayManageContext,getReviewInput,getCaseEvidence,verifyCaseEvidence,getDraft,verifyDraft,getApprovedCandidate,verifyApprovedCandidate,getHistoricalRelease,verifyHistoricalRelease,commitContextHead,hooks.verifyActiveContextRelease].every(f=>typeof f==='function'))fail('CONTEXT_PUBLICATION_HOOKS_REQUIRED');
 async function actor(credential,action){
  const a=await authenticate(credential);
  if(!a||a.active!==true||!id(a.actorRef)||!['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)||
   (['activate','revoke'].includes(action)&&!['MANAGER','SUPER_MANAGER'].includes(a.role))||await mayManageContext(a,action)!==true)fail('FORBIDDEN');
  return a;
 }
 async function recheck(credential,prior,action){
  const a=await actor(credential,action);
  if(a.actorRef!==prior.actorRef||a.role!==prior.role)fail('FORBIDDEN');
  return a;
 }
 async function snapshot(a){
  const s=await read.pair(a),input=await getReviewInput(a),catalog=reviewProjection(input,s.base);
  return {...s,input,catalog};
 }
 async function evidence(a,s,selection,authorRef){
  const result=clone(await getCaseEvidence({actor:a,caseRef:selection.caseRef}));
  if(!exact(result,['caseRecord','evidenceFingerprint'])||!hash(result.evidenceFingerprint)||result.caseRecord?.id!==selection.caseRef)fail('CONTEXT_CASE_EVIDENCE_REQUIRED');
  const draft=prepareReviewedContextDraft({catalog:s.catalog,caseRecord:result.caseRecord,patternId:selection.patternId,authorRef,purpose:selection.purpose,match:selection.match});
  const routeFingerprint=routePin(s.input,s.base,s.catalog,draft.candidate);
  // Independently verify actual finalized, isolated, staff-verified resolved
  // attempt; pre-attempt fixed signals, historical exact guide/route, scope,
  // correction/revocation state and current relevance. No raw case survives.
  if(await verifyCaseEvidence({actor:a,caseRecord:clone(result.caseRecord),evidenceFingerprint:result.evidenceFingerprint,pattern:clone(draft.candidate),sourceRevision:s.base.sourceRevision,routeFingerprint,ruleVersion:RULE_VERSION})!==true)fail('CONTEXT_CASE_EVIDENCE_UNVERIFIED');
  return {draft,evidenceFingerprint:result.evidenceFingerprint,routeFingerprint};
 }
 async function draftBody(a,s,selections,releaseId,restoredFrom){
  checkSelections(selections);const entries=[];
  for(const selection of selections)entries.push(await evidence(a,s,selection,a.actorRef));
  return {kind:'private_context_release_draft',status:'needs_independent_review',releaseId,authorRef:a.actorRef,
   baseMappingFingerprint:s.baseFingerprint,sourceRevision:s.base.sourceRevision,sourceCatalogFingerprint:s.base.sourceCatalogFingerprint,ruleVersion:RULE_VERSION,
   expectedHeadFingerprint:s.headFingerprint,expectedSequence:s.head.sequence,restoredFrom,selections:clone(selections),entries};
 }
 async function prepareInternal(credential,{releaseId,expectedHeadFingerprint,selections,historicalReleaseRef}={}){
  const action=historicalReleaseRef===undefined?'prepare':'rollback';
  if(!id(releaseId)||!hash(expectedHeadFingerprint))fail('INVALID_CONTEXT_RELEASE_REQUEST');
  const a=await actor(credential,action),s=await snapshot(a);
  if(s.headFingerprint!==expectedHeadFingerprint)fail('CONTEXT_HEAD_CHANGED');
  let restoredFrom=null;
  if(action==='rollback'){
   if(!id(historicalReleaseRef)||selections!==undefined)fail('INVALID_CONTEXT_ROLLBACK');
   const old=clone(await getHistoricalRelease({actor:a,releaseRef:historicalReleaseRef}));
   validateActive(old);
   if(old.payload.baseMappingFingerprint!==s.baseFingerprint||old.payload.sourceCatalogFingerprint!==s.base.sourceCatalogFingerprint||
    await verifyHistoricalRelease({actor:a,releaseRef:historicalReleaseRef,release:clone(old)})!==true)fail('CONTEXT_ROLLBACK_SOURCE_CHANGED');
   restoredFrom=old.releaseFingerprint;
   selections=old.payload.entries.map(({pattern:p})=>({patternId:p.id,caseRef:p.caseRef,purpose:p.purpose,match:clone(p.match)}));
  }
  checkSelections(selections);selections=clone(selections);
  const first=await draftBody(a,s,selections,releaseId,restoredFrom);
  const latest=await recheck(credential,a,action),fresh=await snapshot(latest);
  if(!read.same(s,fresh))fail('CONTEXT_HEAD_CHANGED');
  const second=await draftBody(latest,fresh,selections,releaseId,restoredFrom);
  await recheck(credential,a,action);
  if(digest(first)!==digest(second))fail('CONTEXT_EVIDENCE_CHANGED');
  return {...second,draftFingerprint:digest(second)};
 }
 async function loadDraft(a,ref){
  const d=clone(await getDraft({actor:a,draftRef:ref}));validateDraft(d);
  if(d.authorRef===a.actorRef||await verifyDraft({actor:a,draftRef:ref,draft:clone(d)})!==true)fail('INDEPENDENT_CONTEXT_REVIEW_REQUIRED');
  return d;
 }
 async function reviewEntries(a,s,d){
  if(!currentPin(d,s))fail('CONTEXT_DRAFT_STALE');
  const entries=[];
  for(let i=0;i<d.selections.length;i++){
   const checked=await evidence(a,s,d.selections[i],d.authorRef);
   if(digest(checked)!==digest(d.entries[i]))fail('CONTEXT_EVIDENCE_CHANGED');
   const approved=approveReviewedContextDraft({catalog:s.catalog,draft:checked.draft,reviewerRef:a.actorRef});
   entries.push({pattern:approved.candidate,evidenceFingerprint:checked.evidenceFingerprint,routeFingerprint:checked.routeFingerprint});
  }
  entries.sort((a,b)=>order(a.pattern,b.pattern));
  const p={releaseId:d.releaseId,authorRef:d.authorRef,reviewerRef:a.actorRef,baseMappingFingerprint:d.baseMappingFingerprint,sourceRevision:d.sourceRevision,
   sourceCatalogFingerprint:d.sourceCatalogFingerprint,ruleVersion:d.ruleVersion,expectedHeadFingerprint:d.expectedHeadFingerprint,expectedSequence:d.expectedSequence,restoredFrom:d.restoredFrom,entries};
  validatePayload(p);return p;
 }
 async function review(credential,{draftRef}={}){
  if(!id(draftRef))fail('INVALID_CONTEXT_DRAFT_REFERENCE');
  const a=await actor(credential,'review'),d=await loadDraft(a,draftRef),s=await snapshot(a),p=await reviewEntries(a,s,d);
  const latest=await recheck(credential,a,'review'),fresh=await snapshot(latest),d2=await loadDraft(latest,draftRef);
  if(!read.same(s,fresh)||d2.draftFingerprint!==d.draftFingerprint||digest(await reviewEntries(latest,fresh,d2))!==digest(p))fail('CONTEXT_REVIEW_CHANGED');
  await recheck(credential,a,'review');
  return {kind:'native_context_release_candidate',status:'needs_native_activation',published:false,activated:false,payload:p,releaseFingerprint:digest(p)};
 }
 async function loadCandidate(a,ref){
  const c=clone(await getApprovedCandidate({actor:a,candidateRef:ref}));
  if(!exact(c,['kind','status','published','activated','payload','releaseFingerprint'])||c.kind!=='native_context_release_candidate'||c.status!=='needs_native_activation'||c.published!==false||c.activated!==false||!hash(c.releaseFingerprint))fail('CONTEXT_APPROVAL_REQUIRED');
  validatePayload(c.payload);
  if(digest(c.payload)!==c.releaseFingerprint||await verifyApprovedCandidate({actor:a,candidateRef:ref,candidate:clone(c)})!==true)fail('CONTEXT_APPROVAL_UNVERIFIED');
  return c;
 }
 async function checkCandidate(a,s,c){
  const p=c.payload;
  if(!currentPin(p,s)||p.authorRef===a.actorRef)fail('CONTEXT_ACTIVATION_STALE_OR_NOT_INDEPENDENT');
  for(const e of p.entries){
   const q=e.pattern,selection={patternId:q.id,caseRef:q.caseRef,purpose:q.purpose,match:q.match};
   const checked=await evidence(a,s,selection,p.authorRef);
   const approved=approveReviewedContextDraft({catalog:s.catalog,draft:checked.draft,reviewerRef:p.reviewerRef});
   if(digest(approved.candidate)!==digest(q)||checked.evidenceFingerprint!==e.evidenceFingerprint||checked.routeFingerprint!==e.routeFingerprint)fail('CONTEXT_EVIDENCE_CHANGED');
  }
 }
 async function commit(a,s,change){
  // The host owns the durable transaction and must reauthorize the actor,
  // verify current base/head/candidate/evidence and deduplicate operationRef
  // in the same transaction. Do not manufacture an active envelope here.
  const result=await commitContextHead({actor:a,expectedHeadFingerprint:s.headFingerprint,expectedSequence:s.head.sequence,baseMappingFingerprint:s.baseFingerprint,nextSequence:nextSequence(s.head.sequence),change:clone(change)});
  if(!exact(result,['status','headFingerprint','sequence'])||result.status!=='committed'||result.sequence!==s.head.sequence+1||!hash(result.headFingerprint))fail('CONTEXT_COMMIT_UNCONFIRMED');
  const current=await read.pair(a);
  if(current.headFingerprint!==result.headFingerprint||current.head.sequence!==result.sequence||current.baseFingerprint!==s.baseFingerprint)fail('CONTEXT_COMMIT_UNCONFIRMED');
  const h=current.head;
  if(change.kind==='activate'){
   if(h.release?.releaseFingerprint!==change.releaseFingerprint||h.revokedPatternIds.length)fail('CONTEXT_COMMIT_UNCONFIRMED');
   try{await verifyEffective(hooks,a,current);}catch{fail('CONTEXT_COMMIT_UNCONFIRMED');}
  }else{
   if(change.kind==='revoke_all'?h.release!==null:(!h.release||h.release.releaseFingerprint!==s.head.release?.releaseFingerprint||digest(h.revokedPatternIds.slice().sort())!==digest([...new Set([...s.head.revokedPatternIds,change.patternId])].sort())))fail('CONTEXT_COMMIT_UNCONFIRMED');
  }
  return {status:'committed',sequence:h.sequence,headFingerprint:current.headFingerprint,storedPatternCount:currentEntries(h).length};
 }
 async function activate(credential,{candidateRef,operationRef,expectedHeadFingerprint}={}){
  if(!id(candidateRef)||!id(operationRef)||!hash(expectedHeadFingerprint))fail('INVALID_CONTEXT_ACTIVATION');
  const a=await actor(credential,'activate'),s=await snapshot(a),c=await loadCandidate(a,candidateRef);
  if(s.headFingerprint!==expectedHeadFingerprint)fail('CONTEXT_HEAD_CHANGED');
  await checkCandidate(a,s,c);
  const latest=await recheck(credential,a,'activate'),fresh=await snapshot(latest),c2=await loadCandidate(latest,candidateRef);
  if(!read.same(s,fresh)||c2.releaseFingerprint!==c.releaseFingerprint)fail('CONTEXT_ACTIVATION_CHANGED');
  await checkCandidate(latest,fresh,c2);
  const final=await recheck(credential,a,'activate');
  return commit(final,fresh,{kind:'activate',operationRef,candidateRef,releaseFingerprint:c2.releaseFingerprint});
 }
 async function revoke(credential,{patternId=null,operationRef,expectedHeadFingerprint,reasonCode}={}){
  if(!(patternId===null||id(patternId))||!id(operationRef)||!hash(expectedHeadFingerprint)||
   !['evidence_corrected','scope_changed','conflict','source_changed','safety_review','administrative_review'].includes(reasonCode))fail('INVALID_CONTEXT_REVOCATION');
  const a=await actor(credential,'revoke'),s=await read.pair(a);
  if(s.headFingerprint!==expectedHeadFingerprint||!s.head.release||patternId!==null&&!currentEntries(s.head).some(e=>e.pattern.id===patternId))fail('CONTEXT_REVOCATION_STALE');
  const latest=await recheck(credential,a,'revoke'),fresh=await read.pair(latest);
  if(!read.same(s,fresh))fail('CONTEXT_HEAD_CHANGED');
  return commit(latest,fresh,{kind:patternId===null?'revoke_all':'revoke_pattern',patternId,operationRef,reasonCode});
 }
 async function status(credential){
  const a=await actor(credential,'read'),s=await read.pair(a);
  const latest=await recheck(credential,a,'read'),fresh=await read.pair(latest);
  if(!read.same(s,fresh))fail('CONTEXT_HEAD_CHANGED');
  return {sequence:s.head.sequence,headFingerprint:s.headFingerprint,baseMappingFingerprint:s.baseFingerprint,
   releaseFingerprint:s.head.release?.releaseFingerprint??null,storedPatternCount:currentEntries(s.head).length,currentlyPinnedPatternCount:overlay(s.base,s.head).reviewedContexts.length,
   revokedPatternIds:clone(s.head.revokedPatternIds)};
 }
 return Object.freeze({status,prepare:(credential,params)=>prepareInternal(credential,params),prepareRollback:(credential,params)=>{
  if(!id(params?.historicalReleaseRef))fail('INVALID_CONTEXT_ROLLBACK');
  return prepareInternal(credential,params);
 },review,activate,revoke});
}
