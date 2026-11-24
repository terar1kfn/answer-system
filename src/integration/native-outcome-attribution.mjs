import {routeReviewMatches} from './native-route-review.mjs';
const fail=code=>{throw Error(code);};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const downgrade=a=>a==='guide_only'?'not_established':a;
/** A historical, host-verified navigation record is transient. No answer
 * options, student or visit identifiers are retained in the outcome ledger. */
export function unverifiedRouteAttribution(record){
 return {sourceRevision:record.sourceRevision,routeFingerprint:null,routeAttribution:'unverified_route',attribution:downgrade(record.attribution)};
}
export function reviewNativeOutcomeAttribution({record,configuration,mappingRow,review}={}){
 if(!record||record.guideId!==mappingRow?.guideId||record.guideFingerprint!==mappingRow.expectedFingerprint||
 record.sourceRevision!==review?.sourceRevision||!routeReviewMatches({configuration,mappingRow,review}))fail('HISTORICAL_ROUTE_UNVERIFIED');
 const trace=record.routeTrace;
 if(!exact(trace,['routeFingerprint','choices','terminal','attemptedGuideId'])||
 trace.routeFingerprint!==review.routeFingerprint||!Array.isArray(trace.choices)||trace.choices.length>100||
 !['solution','escalation'].includes(trace.terminal)||!(trace.attemptedGuideId===null||id(trace.attemptedGuideId)))fail('INVALID_NATIVE_OUTCOME_TRACE');
 const root=configuration.guides.find(g=>g.id===mappingRow.guideId);
 const first=mappingRow.entryMode==='diagnostic'?root.diagnosticQuestions[0]?.id:null;
 const nodes=new Map(review.nodes.map(n=>[n.nodeId,n]));
 let current=JSON.stringify([root.id,first??null]),escalated=false;
 const visited=new Set([root.id]);
 for(const step of trace.choices){
  if(!exact(step,['nodeId','optionId'])||typeof step.nodeId!=='string'||step.nodeId.length>400||!id(step.optionId)||
   escalated||current!==step.nodeId||nodes.get(current)?.kind!=='question')fail('NATIVE_OUTCOME_TRACE_MISMATCH');
  const matches=review.edges.filter(e=>e.from===current&&e.optionId===step.optionId);
  if(matches.length!==1)fail('NATIVE_OUTCOME_TRACE_MISMATCH');
  const e=matches[0];
  if(e.action==='native_escalation'&&e.to===null){escalated=true;current=null;continue;}
  if(!e.to||!nodes.has(e.to))fail('NATIVE_OUTCOME_TRACE_MISMATCH');
  current=e.to;visited.add(nodes.get(current).guideId);
 }
 const last=nodes.get(current);
 if(trace.terminal==='escalation'){
  if(!escalated||trace.attemptedGuideId!==null||record.completion==='attempted')fail('NATIVE_OUTCOME_TRACE_MISMATCH');
  return {sourceRevision:record.sourceRevision,routeFingerprint:review.routeFingerprint,routeAttribution:'native_escalation',attribution:downgrade(record.attribution)};
 }
 if(escalated||last?.kind!=='solution'||(record.completion==='attempted'?trace.attemptedGuideId!==last.guideId:trace.attemptedGuideId!==null))fail('NATIVE_OUTCOME_TRACE_MISMATCH');
 const single=visited.size===1&&last.guideId===root.id;
 // Even a path that returns to the root after a linked guide is branched.
 // A verified outcome for the overall task is not proof that the root guide's
 // own procedure was the only intervention.
 return {sourceRevision:record.sourceRevision,routeFingerprint:review.routeFingerprint,routeAttribution:single?'single_native_guide':'branched_native_route',
  attribution:single?record.attribution:downgrade(record.attribution)};
}
