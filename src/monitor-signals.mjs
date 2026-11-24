import {isServiceId} from './service-taxonomy.mjs';
const ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
/**
 * Accept health observations from a trusted, separately configured monitoring
 * host. Does not probe URLs, infer permissions, or confirm an outage.
 */
export function createMonitorSignals({probes=[],now=()=>Date.now(),freshMs=180000,failuresRequired=3}={}){
 if(!Array.isArray(probes)||probes.length>300||typeof now!=='function'||!Number.isSafeInteger(freshMs)||freshMs<1000||!Number.isSafeInteger(failuresRequired)||failuresRequired<2||failuresRequired>20)throw Error('INVALID_MONITOR_CONFIG');
 const config=new Map(),observations=new Map();
 for(const p of probes){
  if(!p||!ok(p.id)||config.has(p.id)||!isServiceId(p.serviceId)||!(p.scope===null||ok(p.scope)))throw Error('INVALID_PROBE');
  config.set(p.id,{id:p.id,serviceId:p.serviceId,scope:p.scope});
 }
 function observe({probeId,status,observedAt}={}){
  const p=config.get(probeId),t=now(),old=observations.get(probeId);
  if(!p||!['healthy','unhealthy','unknown'].includes(status)||!Number.isFinite(observedAt)||observedAt>t||t-observedAt>freshMs||(old&&observedAt<=old.observedAt))throw Error('INVALID_OBSERVATION');
  const priorFresh=old&&observedAt-old.observedAt<=freshMs;
  const streak=status==='unhealthy'?(priorFresh&&old.status==='unhealthy'?Math.min(old.streak+1,1000):1):0;
  const r={...p,status,observedAt,streak};observations.set(probeId,r);return {...r};
 }
 function snapshot(){
  const t=now();
  return [...config.values()].map(p=>{const o=observations.get(p.id);return o&&t-o.observedAt<=freshMs?{...o}:{...p,status:'unknown',observedAt:null,streak:0};});
 }
 function candidates(){return snapshot().filter(o=>o.status==='unhealthy'&&o.streak>=failuresRequired).map(o=>({probeId:o.id,serviceId:o.serviceId,scope:o.scope,consecutiveFailures:o.streak,status:'suspected',observedAt:o.observedAt}));}
 return Object.freeze({observe,snapshot,candidates});
}
