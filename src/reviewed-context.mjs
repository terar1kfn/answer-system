import {REVIEWED_CONTEXT_DEFINITIONS as definitions,REVIEWED_CONTEXT_QUESTIONS as askable,fixedOption,isUnconfirmedContextValue} from './diagnostic-evidence.mjs';
import {eligible} from './knowledge.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const revision=x=>typeof x==='string'&&x.length>0&&x.length<=200;
const fingerprint=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const fields=new Set(['id','serviceId','purpose','guideId','match','sourceRevision','guideFingerprint','caseRef','authorRef','reviewerRef','reviewed','enabled','outcomeEvidence']);
const fail=x=>{throw Error(x);};
function validateShape(p,{draft=false}={}){
 const d=p&&Object.hasOwn(definitions,p.serviceId)?definitions[p.serviceId]:null;
 if(!p||!d||!id(p.id)||!id(p.purpose)||!id(p.guideId)||!revision(p.sourceRevision)||!id(p.caseRef)||!id(p.authorRef)||
  Object.keys(p).some(k=>!fields.has(k))||typeof p.enabled!=='boolean'||
  (p.guideFingerprint!==undefined&&!fingerprint(p.guideFingerprint))||
  p.outcomeEvidence!=='staff_verified'||!p.match||typeof p.match!=='object'||Array.isArray(p.match))fail('INVALID_REVIEWED_CONTEXT');
 if(draft){if(p.reviewed!==false||p.reviewerRef!==undefined)fail('INVALID_CONTEXT_DRAFT');}
 else if(p.reviewed!==true||!id(p.reviewerRef)||p.reviewerRef===p.authorRef)fail('INDEPENDENT_CONTEXT_REVIEW_REQUIRED');
 validateContextMatch(p.serviceId,p.match);
 return p;
}
/** Share the exact existing protected-operation boundary with staff-only
 * aggregate learning. Validation is not proof of a real observation. */
export function validateContextMatch(serviceId,match){
 const d=Object.hasOwn(definitions,serviceId)?definitions[serviceId]:null;
 if(!d||!match||typeof match!=='object'||Array.isArray(match))fail('INVALID_CONTEXT_SIGNAL');
 const keys=Object.keys(match);
 if(keys.length<2||keys.length>6||!keys.some(k=>d.anchors.includes(k))||!keys.some(k=>d.context.includes(k)))fail('CONTEXT_EVIDENCE_TOO_WEAK');
 for(const [key,value] of Object.entries(match)){
  if(![...d.anchors,...d.context].includes(key)||!id(value)||isUnconfirmedContextValue(value)||!fixedOption(key,value))fail('INVALID_CONTEXT_SIGNAL');
  // Context records must never encode protected/administrative paths as an
  // ordinary alternative. The deterministic router still takes precedence.
  if(key==='task'&&!['send','receive','app'].includes(value))fail('CONTEXT_OPERATION_NOT_ALLOWED');
  if((key==='send_error'&&['restricted','recipients'].includes(value))||
   (key==='portal_issue'&&['registration','access','content'].includes(value))||
   (key==='attendance_issue'&&value==='record')||
   (key==='printing_issue'&&value==='access')||
   (key==='software_issue'&&['license','permission'].includes(value))||
   (key==='storage_issue'&&['access','missing'].includes(value))||
   (key==='meeting_issue'&&value==='recording')||
   (key==='device_issue'&&value==='hardware'))fail('CONTEXT_OPERATION_NOT_ALLOWED');
 }
 return true;
}
export function validateReviewedContexts(rows=[]){
 if(!Array.isArray(rows)||rows.length>1000)fail('INVALID_REVIEWED_CONTEXTS');
 const seen=new Set();
 for(const p of rows){
  validateShape(p);
  if(seen.has(p.id))fail('DUPLICATE_CONTEXT_ID');seen.add(p.id);
 }
 return true;
}
function currentGuide(c,p){
 if(p.sourceRevision!==(c.sourceRevision??c.revision))return null;
 const g=c.guides.find(x=>x.id===p.guideId&&x.serviceId===p.serviceId&&x.purpose===p.purpose&&eligible(x,{catalog:c}));
 if(!g)return null;
 if(g.nativeGuideFingerprint!==undefined&&g.nativeGuideFingerprint!==p.guideFingerprint)return null;
 if(g.nativeGuideFingerprint===undefined&&p.guideFingerprint!==undefined)return null;
 return g;
}
/**
 * This is deliberately only a disambiguator among equally-specific,
 * currently eligible guides already selected by the deterministic route.
 * It never selects a different service, operation, purpose or unsafe guide.
 */
export function disambiguateReviewedContext({catalog,state,tiedGuides}={}){
 if(!state?.evidence||!Array.isArray(tiedGuides)||tiedGuides.length<2||state.conflictingObservations?.length||
  state.evidence.mfa_prompt?.value==='unexpected'||state.evidence.credentials?.value==='locked'||
  state.evidence.error_signature||state.evidence.send_error?.value==='restricted')return {kind:'none'};
 const first=tiedGuides[0],d=Object.hasOwn(definitions,first.serviceId)?definitions[first.serviceId]:null;
 if(!d||!d.domains.includes(state.domain)||state.services.length!==1||state.services[0]!==first.serviceId||
 tiedGuides.some(g=>g.serviceId!==first.serviceId||g.purpose!==first.purpose))return {kind:'none'};
 // Native product/card ownership is not interchangeable across generic
 // service categories. Keep synthetic standalone guides without native IDs.
 if(tiedGuides.some(g=>g.nativeServiceId!==undefined)&&(!id(first.nativeServiceId)||tiedGuides.some(g=>g.nativeServiceId!==first.nativeServiceId)))return {kind:'none'};
 const candidateIds=new Set(tiedGuides.map(g=>g.id)),usable=[];
 for(const p of catalog.reviewedContexts||[]){
  if(!p.enabled||p.serviceId!==first.serviceId||p.purpose!==first.purpose||!candidateIds.has(p.guideId)||!currentGuide(catalog,p))continue;
  const vals=Object.entries(p.match);
  // Require the actual operation anchor to have been reported. Do not ask a
  // platform question solely because a loosely related case exists.
  if(!vals.some(([k,v])=>d.anchors.includes(k)&&state.evidence[k]?.value===v))continue;
  const conflicts=vals.some(([k,v])=>state.evidence[k]&& !isUnconfirmedContextValue(state.evidence[k].value)&&state.evidence[k].value!==v);
  if(conflicts)continue;
  const missing=vals.filter(([k,v])=>state.evidence[k]?.value!==v).map(([k])=>k);
  usable.push({pattern:p,missing});
 }
 const full=usable.filter(x=>!x.missing.length),fullGuides=new Set(full.map(x=>x.pattern.guideId));
 if(fullGuides.size>1)return {kind:'conflict'};
 if(fullGuides.size===1){
  const guideId=[...fullGuides][0];
  if(!usable.some(x=>x.pattern.guideId!==guideId)){
   const selected=full.sort((a,b)=>Object.keys(b.pattern.match).length-Object.keys(a.pattern.match).length||a.pattern.id.localeCompare(b.pattern.id))[0];
   return {kind:'guide',guideId,patternRef:selected.pattern.id};
  }
 }
 // Only ask a missing, safe question that has distinct reported-value
 // requirements across different eligible guide candidates. Unknown answers
 // never trigger an automatic selection, and do not lead to repeated prompts.
 const ranked=[];
 for(const q of askable){
  if(Object.hasOwn(state.evidence,q)||state.askedQuestionIds.includes(q))continue;
  let separates=0;
  for(let i=0;i<usable.length;i++)for(let j=i+1;j<usable.length;j++){
   const a=usable[i].pattern,b=usable[j].pattern;
   if(a.guideId!==b.guideId&&a.match[q]!==undefined&&b.match[q]!==undefined&&a.match[q]!==b.match[q])separates++;
  }
  if(separates)ranked.push({q,separates});
 }
 ranked.sort((a,b)=>b.separates-a.separates||askable.indexOf(a.q)-askable.indexOf(b.q));
 return ranked.length?{kind:'ask',questionId:ranked[0].q}:{kind:'none'};
}
/**
 * Case-to-context draft, for private staff tooling only. A host must verify
 * the case outcome, author, reviewer, source revision and authorization.
 * No raw case content, credential, transcript or auto-publication.
 */
export function prepareReviewedContextDraft({catalog,caseRecord,patternId,authorRef,purpose,match}={}){
 if(!catalog||!caseRecord||caseRecord.approved!==true||caseRecord.outcomeEvidence!=='staff_verified'||caseRecord.outcome!=='resolved'||!id(caseRecord.id)||
 !id(patternId)||!id(authorRef)||!id(purpose)||!Array.isArray(caseRecord.signals)||!match||typeof match!=='object')fail('VERIFIED_CASE_REQUIRED');
 const g=catalog.guides.find(x=>x.id===caseRecord.solutionRef&&x.serviceId===caseRecord.serviceId&&x.purpose===purpose&&eligible(x,{catalog}));
 if(!g||g.nativeGuideFingerprint&&caseRecord.guideFingerprint!==g.nativeGuideFingerprint)fail('CASE_GUIDE_UNAVAILABLE');
 if(Object.entries(match).some(([key,value])=>!caseRecord.signals.some(s=>s.key===key&&s.value===value)))fail('CONTEXT_SIGNAL_NOT_IN_CASE');
 const p={id:patternId,serviceId:g.serviceId,purpose:g.purpose,guideId:g.id,match:clone(match),sourceRevision:catalog.sourceRevision??catalog.revision,
  ...(g.nativeGuideFingerprint?{guideFingerprint:g.nativeGuideFingerprint}:{}),caseRef:caseRecord.id,authorRef,reviewed:false,enabled:false,outcomeEvidence:'staff_verified'};
 validateShape(p,{draft:true});
 return {kind:'reviewed_context_draft',status:'needs_independent_review',baseCatalogRevision:catalog.revision,candidate:p,published:false};
}
export function approveReviewedContextDraft({catalog,draft,reviewerRef}={}){
 if(!catalog||draft?.kind!=='reviewed_context_draft'||draft.status!=='needs_independent_review'||draft.baseCatalogRevision!==catalog.revision||!id(reviewerRef))fail('CONTEXT_DRAFT_STALE');
 const p=validateShape(draft.candidate,{draft:true});
 if(p.authorRef===reviewerRef||!currentGuide(catalog,p))fail('INDEPENDENT_CONTEXT_REVIEW_REQUIRED');
 const candidate={...clone(p),reviewerRef,reviewed:true,enabled:true};validateShape(candidate);
 // This is an approval candidate only. The real host must enforce permission,
 // fresh revision and explicit activation through its publication workflow.
 return {kind:'approved_context_candidate',baseCatalogRevision:catalog.revision,candidate,published:false};
}
