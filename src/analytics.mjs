import {isServiceId} from './service-taxonomy.mjs';
import {knownGuidePurpose} from './guide-purposes.mjs';
export const KNOWLEDGE_GAP_KINDS=Object.freeze(['SERVICE_UNAVAILABLE','NO_MAPPED_GUIDE','NO_ELIGIBLE_GUIDE','PREREQUISITE_MISMATCH','REVIEWED_CONTEXT_CONFLICT','AMBIGUOUS_MAPPING']);
const gapKinds=new Set(KNOWLEDGE_GAP_KINDS);
const EVENTS=new Set(['issue_started','question_asked','guide_offered','answer_shown','support_offered','recovery_offered','incident_notice','safety_referral','resolution_reported','handoff_prepared','handoff_recorded','handoff_unknown','knowledge_gap','clarification']);
const allowedReason=x=>typeof x==='string'&&/^[A-Z0-9_]{1,80}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
/** Aggregate-only metrics. No text, actor, visit or student ID is persisted. */
export const initialMetrics=()=>({days:{}});
export function validateMetrics(data){
 return Boolean(data&&data.days&&typeof data.days==='object'&&!Array.isArray(data.days)&&Object.keys(data.days).length<=120&&Object.entries(data.days).every(([day,b])=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&b&&typeof b==='object'&&Object.keys(b).length<=3000&&Object.values(b).every(n=>Number.isSafeInteger(n)&&n>=0)));
}
export function createMetrics({store=null,now=()=>Date.now(),retentionDays=30,minimumGroup=5}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(retentionDays)||retentionDays<1||retentionDays>90||!Number.isSafeInteger(minimumGroup)||minimumGroup<1||minimumGroup>100)throw Error('INVALID_METRICS_CONFIG');
 let mem=initialMetrics();const seen=new Set();
 function change(fn){
  if(store){const s=store.snapshot();return store.transact(s.revision,fn).result;}
  return fn(mem);
 }
 function record({event,serviceId='other',reasonCode,eventKey,purpose}={}){
  if(!EVENTS.has(event)||!isServiceId(serviceId)||(reasonCode!==undefined&&!allowedReason(reasonCode)))throw Error('INVALID_METRIC_EVENT');
  if(purpose!==undefined&&(event!=='knowledge_gap'||!knownGuidePurpose(serviceId,purpose)||!gapKinds.has(reasonCode)))throw Error('INVALID_KNOWLEDGE_GAP');
  // Keys are transient opaque deduplication markers, never stored in metrics.
  if(eventKey!==undefined){if(typeof eventKey!=='string'||eventKey.length>200)throw Error('INVALID_METRIC_KEY');if(seen.has(eventKey))return false;}
  const day=new Date(now()).toISOString().slice(0,10),cutoff=new Date(now()-retentionDays*86400000).toISOString().slice(0,10);
  change(s=>{
   for(const d of Object.keys(s.days))if(d<cutoff)delete s.days[d];
   const b=s.days[day]??={};const key=[event,serviceId,reasonCode||'-',...(purpose?[purpose]:[])].join(':');
   if(!Object.hasOwn(b,key)&&Object.keys(b).length>=3000)throw Error('METRICS_CAPACITY');
   b[key]=(b[key]||0)+1;return true;
  });
  if(eventKey!==undefined){seen.add(eventKey);if(seen.size>10000)seen.delete(seen.values().next().value);}
  return true;
 }
 function summary({days=7,includeSmall=false}={}){
  if(!Number.isSafeInteger(days)||days<1||days>retentionDays)throw Error('INVALID_METRIC_WINDOW');
  const cutoff=new Date(now()-(days-1)*86400000).toISOString().slice(0,10),data=store?store.snapshot().data:mem,totals={};
  for(const [day,rows] of Object.entries(data.days))if(day>=cutoff)for(const [key,count] of Object.entries(rows))totals[key]=(totals[key]||0)+count;
  return Object.entries(totals).filter(([,count])=>includeSmall===true||count>=minimumGroup).map(([key,count])=>{const [event,serviceId,reasonCode,purpose]=key.split(':');return {event,serviceId,reasonCode:reasonCode==='-'?null:reasonCode,...(purpose?{purpose}:{}),count};}).sort((a,b)=>b.count-a.count);
 }
 return Object.freeze({record,summary});
}
export function metricForDecision(d){
 const map={ask:'question_asked',open_guide:'guide_offered',answer:'answer_shown',offer_support:'support_offered',offer_mfa_recovery:'recovery_offered',incident_notice:'incident_notice',safety_referral:'safety_referral',resolved_reported:'resolution_reported'};
 return map[d?.kind]||null;
}


/** Count a fixed knowledge gap once per transient issue/purpose/kind key.
 * Never record an incoming user's words, evidence values, exact guide ID,
 * or case identity. The optional counter is not a unique-student count. */
export function recordKnowledgeGap(metrics,state,eventKey){
 const g=state?.decision?.knowledgeGap;
 if(!metrics||state?.decision?.kind!=='offer_support'||['safety','exam'].includes(state.domain)||
 !g||!isServiceId(g.serviceId)||!knownGuidePurpose(g.serviceId,g.purpose)||!gapKinds.has(g.kind))return false;
 try{return metrics.record({event:'knowledge_gap',serviceId:g.serviceId,reasonCode:g.kind,purpose:g.purpose,eventKey});}catch{return false;}
}
