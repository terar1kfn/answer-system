import {createHmac} from 'node:crypto';
import {isServiceId} from './service-taxonomy.mjs';
import {knownGuidePurpose} from './guide-purposes.mjs';
const DAY=86400000,MAX_ROWS=20000;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const int=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(Date.parse(x+'T00:00:00Z')).toISOString().slice(0,10)===x;
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const completion=new Set(['attempted','viewed_only','not_viewed','unknown']);
const outcomes=new Set(['resolved','unresolved','unknown','not_attempted']);
const provenance=new Set(['student_reported','staff_verified','unverified']);
const attribution=new Set(['guide_only','multiple_interventions','not_established']);
const exactFields=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const rowFields=['guideId','guideFingerprint','serviceId','purpose','ruleVersion','day','revision','completion','outcome','provenance','attribution'];
const routeFields=['sourceRevision','routeFingerprint','routeAttribution'];
const routeKinds=new Set(['single_native_guide','branched_native_route','native_escalation','unverified_route']);
const hasRoute=r=>routeFields.some(k=>Object.hasOwn(r,k));
function validRoute(r){
 if(!hasRoute(r))return true; // Legacy records are retained, but not promoted.
 return id(r.sourceRevision)&&routeKinds.has(r.routeAttribution)&&
  (r.routeAttribution==='unverified_route'?r.routeFingerprint===null:hash(r.routeFingerprint))&&
  (r.attribution!=='guide_only'||r.routeAttribution==='single_native_guide');
}
function validRow(r){
 if(!r||!exactFields(r,hasRoute(r)?[...rowFields,...routeFields]:rowFields)||!validRoute(r)||!id(r.guideId)||!hash(r.guideFingerprint)||!isServiceId(r.serviceId)||
 !id(r.purpose)||!id(r.ruleVersion)||!day(r.day)||!int(r.revision,1,Number.MAX_SAFE_INTEGER)||
 !completion.has(r.completion)||!outcomes.has(r.outcome)||!provenance.has(r.provenance)||!attribution.has(r.attribution))return false;
 if(r.outcome==='not_attempted'&&r.completion==='attempted')return false;
 if(r.attribution==='guide_only'&&(r.completion!=='attempted'||!['resolved','unresolved'].includes(r.outcome)||r.provenance==='unverified'))return false;
 if(r.provenance==='unverified'&&['resolved','unresolved'].includes(r.outcome))return false;
 return true;
}
export const initialEffectiveness=()=>({rows:{}});
export function validateEffectiveness(data){
 return exactFields(data,['rows'])&&data.rows&&typeof data.rows==='object'&&!Array.isArray(data.rows)&&
 Object.keys(data.rows).length<=MAX_ROWS&&Object.entries(data.rows).every(([k,r])=>hash(k)&&validRow(r));
}
const immutable=['guideId','guideFingerprint','serviceId','purpose','ruleVersion','day',...routeFields];
function same(a,b){return [...rowFields,...routeFields].every(k=>a[k]===b[k]);}
function emptyCounts(){return {finalizedRecords:0,viewedOnly:0,notViewed:0,attempted:0,attemptUnknown:0,
 studentReported:{resolved:0,unresolved:0},staffVerified:{resolved:0,unresolved:0},
 singleGuideReported:{resolved:0,unresolved:0},singleGuideVerified:{resolved:0,unresolved:0},
 multipleInterventions:0,uncertainAttribution:0,unknownOutcome:0,notAttempted:0};}
function increment(c,r){
 c.finalizedRecords++;
 if(r.completion==='attempted')c.attempted++;
 else if(r.completion==='viewed_only')c.viewedOnly++;
 else if(r.completion==='not_viewed')c.notViewed++;
 else c.attemptUnknown++;
 if(r.outcome==='unknown'){c.unknownOutcome++;return;}
 if(r.outcome==='not_attempted'){c.notAttempted++;return;}
 const target=r.provenance==='staff_verified'?c.staffVerified:c.studentReported;
 target[r.outcome]++;
 if(r.attribution==='multiple_interventions')c.multipleInterventions++;
 else if(r.attribution==='not_established'||r.routeAttribution!=='single_native_guide')c.uncertainAttribution++;
 else (r.provenance==='staff_verified'?c.singleGuideVerified:c.singleGuideReported)[r.outcome]++;
}
/**
 * Private single-writer ledger of finalized, host-verified observations.
 * No student/case/visit identity, transcripts, or exact timestamps are stored.
 * The host provides a random opaque receipt reference and an approved stable
 * HMAC key; the pseudonymous digest prevents ordinary replay within retention.
 * This is sensitive operational metadata, not anonymous public statistics.
 */
export function createSolutionEffectiveness({store,receiptKey,now=()=>Date.now(),retentionDays=60,minimumGroup=5}={}){
 if(!store||typeof store.snapshot!=='function'||typeof store.transact!=='function'||
 !hash(receiptKey)||typeof now!=='function'||!int(retentionDays,7,90)||!int(minimumGroup,5,100))fail('EFFECTIVENESS_STORE_REQUIRED');
 const key=Buffer.from(receiptKey,'hex');
 const cutoff=()=>new Date(now()-(retentionDays-1)*DAY).toISOString().slice(0,10);
 function record(observation){
  const fields=observation&&hasRoute(observation)?[...rowFields,...routeFields]:rowFields;
  if(!exactFields(observation,['receiptRef','occurredAt',...fields.filter(k=>k!=='day')])||
   !id(observation.receiptRef)||!int(observation.occurredAt,0,Number.MAX_SAFE_INTEGER)||observation.occurredAt>now())fail('INVALID_EFFECTIVENESS_OBSERVATION');
  const row=Object.fromEntries(fields.map(k=>[k,k==='day'?new Date(observation.occurredAt).toISOString().slice(0,10):observation[k]]));
  if(!validRow(row)||!knownGuidePurpose(row.serviceId,row.purpose))fail('INVALID_EFFECTIVENESS_OBSERVATION');
  if(row.day<cutoff())return {status:'outside_retention'};
  const digest=createHmac('sha256',key).update('guide-outcome-v1:'+observation.receiptRef).digest('hex');
  const snapshot=store.snapshot();
  if(!validateEffectiveness(snapshot.data))fail('INVALID_EFFECTIVENESS_STORE');
  const previous=snapshot.data.rows[digest];
  if(previous){
   if(immutable.some(k=>previous[k]!==row[k]))fail('OUTCOME_RECEIPT_IDENTITY_CHANGED');
   if(row.revision<previous.revision)return {status:'stale'};
   if(row.revision===previous.revision){
    if(!same(previous,row))fail('OUTCOME_REVISION_CONFLICT');
    return {status:'already_recorded'};
   }
  }
  return store.transact(snapshot.revision,draft=>{
   for(const [k,r] of Object.entries(draft.rows))if(r.day<cutoff())delete draft.rows[k];
   if(!Object.hasOwn(draft.rows,digest)&&Object.keys(draft.rows).length>=MAX_ROWS)fail('EFFECTIVENESS_CAPACITY');
   draft.rows[digest]=row;
   return {status:previous?'corrected':'recorded'};
  }).result;
 }
 function prune(){
  const s=store.snapshot();
  return store.transact(s.revision,d=>{
   let removed=0;for(const [k,r] of Object.entries(d.rows))if(r.day<cutoff()){delete d.rows[k];removed++;}
   return {removed};
  }).result;
 }
 function summary({days=30,serviceIds,allowedGuideIds}={}){
  if(!int(days,1,retentionDays)||!Array.isArray(serviceIds)||!serviceIds.every(isServiceId)||
   !Array.isArray(allowedGuideIds)||!allowedGuideIds.every(id)||allowedGuideIds.length>5000)fail('EFFECTIVENESS_SCOPE_REQUIRED');
  const allowed=new Set(allowedGuideIds),services=new Set(serviceIds);
  const since=new Date(now()-(days-1)*DAY).toISOString().slice(0,10),groups=new Map();
  for(const r of Object.values(store.snapshot().data.rows)){
   if(r.day<since||r.day<cutoff()||!allowed.has(r.guideId)||!services.has(r.serviceId))continue;
   const routeAttribution=r.routeAttribution??'legacy_unverified';
   const groupKey=JSON.stringify([r.guideId,r.guideFingerprint,r.serviceId,r.purpose,r.ruleVersion,r.sourceRevision??null,r.routeFingerprint??null,routeAttribution]);
   if(!groups.has(groupKey))groups.set(groupKey,{guideId:r.guideId,guideFingerprint:r.guideFingerprint,serviceId:r.serviceId,purpose:r.purpose,ruleVersion:r.ruleVersion,sourceRevision:r.sourceRevision??null,routeFingerprint:r.routeFingerprint??null,routeAttribution,counts:emptyCounts()});
   increment(groups.get(groupKey).counts,r);
  }
  return [...groups.values()].filter(g=>g.counts.finalizedRecords>=minimumGroup).map(g=>{
   const c=g.counts,verified=c.singleGuideVerified.resolved+c.singleGuideVerified.unresolved;
   // Do not pool staff verification with student reports or multiple changes.
   // An observed proportion is not causal effectiveness or predictive accuracy.
   return {...g,verifiedSingleGuideKnownOutcomes:verified,
    observedVerifiedResolutionFraction:verified>=minimumGroup?c.singleGuideVerified.resolved/verified:null,
    reviewSignal:verified>=10&&c.singleGuideVerified.unresolved>=3&&c.singleGuideVerified.unresolved/verified>=0.35?'REVIEW_REPEATED_UNRESOLVED_OUTCOMES':null,
    verifiedRootCause:false};
  }).sort((a,b)=>Number(Boolean(b.reviewSignal))-Number(Boolean(a.reviewSignal))||b.counts.finalizedRecords-a.counts.finalizedRecords||a.guideId.localeCompare(b.guideId));
 }
 return Object.freeze({record,prune,summary});
}
