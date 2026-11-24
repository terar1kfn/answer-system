const copy=x=>JSON.parse(JSON.stringify(x)),ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x),fail=x=>{throw Error(x);};
const SERVICES=new Set(['mail','portal','attendance','identity','network','exam','other']);
// Host-authorized staff methods, not an authorization boundary. Signals count visits,
// NOT verified people. Suspected candidates never become confirmed automatically.
export function createIncidentRegistry({now=()=>Date.now(),newId=()=>globalThis.crypto.randomUUID(),windowMs=600000,maxAgeMs=900000,maxSignals=2048,maxIncidents=256}={}){
 if(![now,newId].every(x=>typeof x==='function')||![windowMs,maxAgeMs,maxSignals,maxIncidents].every(x=>Number.isSafeInteger(x)&&x>0))fail('INVALID_REGISTRY_CONFIG');
 const signals=new Map(),records=new Map(),scopeOk=x=>x===null||ok(x),key=(s,scope)=>s+':'+(scope??'*');
 function prune(){const t=now();for(const [k,v] of signals)if(v.at<=t-windowMs)signals.delete(k);}
 function report({visitRef,serviceId,scope=null}={}){
  if(!ok(visitRef)||!SERVICES.has(serviceId)||!scopeOk(scope))fail('INVALID_SIGNAL');
  prune();const k=visitRef+':'+key(serviceId,scope);
  if(signals.has(k))return {accepted:false,reason:'DUPLICATE_SIGNAL'};
  if(signals.size>=maxSignals)fail('SIGNAL_CAPACITY');
  signals.set(k,{serviceId,scope,at:now()});return {accepted:true};
 }
 function candidates(){
  prune();const groups=new Map();
  for(const s of signals.values()){const k=key(s.serviceId,s.scope),r=groups.get(k)||{serviceId:s.serviceId,scope:s.scope,distinctVisits:0,status:'suspected'};r.distinctVisits++;groups.set(k,r);}
  return [...groups.values()].filter(r=>r.distinctVisits>=3).sort((a,b)=>b.distinctVisits-a.distinctVisits).map(copy);
 }
 function ttl(x){return Number.isSafeInteger(x)&&x>0&&x<=maxAgeMs;}
 function create({serviceId,scope=null,actorRef,expiresInMs=maxAgeMs}={}){
  if(!SERVICES.has(serviceId)||!scopeOk(scope)||!ok(actorRef)||!ttl(expiresInMs))fail('INVALID_INCIDENT');
  if(records.size>=maxIncidents)fail('INCIDENT_CAPACITY');
  const t=now(),id=newId();if(!ok(id)||records.has(id))fail('INCIDENT_ID_COLLISION');
  const r={id,serviceId,scope,status:'investigating',authority:'authorized_staff',revision:1,updatedAt:t,expiresAt:t+expiresInMs,history:[{status:'investigating',actorRef,at:t}]};records.set(id,r);return copy(r);
 }
 function transition(id,{expectedRevision,status,actorRef,expiresInMs=maxAgeMs}={}){
  const r=records.get(id);if(!r)fail('INCIDENT_NOT_FOUND');if(r.revision!==expectedRevision)fail('STALE_INCIDENT_REVISION');
  if(!ok(actorRef)||!ttl(expiresInMs))fail('INVALID_TRANSITION');
  const allowed={investigating:['confirmed','dismissed','resolved'],confirmed:['confirmed','resolved','investigating'],dismissed:[],resolved:[]};
  if(!allowed[r.status].includes(status))fail('INVALID_INCIDENT_TRANSITION');
  r.status=status;r.revision++;r.updatedAt=now();r.expiresAt=r.updatedAt+expiresInMs;r.history=[...r.history,{status,actorRef,at:r.updatedAt}].slice(-32);return copy(r);
 }
 function snapshot(scope=null){
  if(!scopeOk(scope))fail('INVALID_SCOPE');const t=now();
  return [...records.values()].filter(r=>(r.scope===null||r.scope===scope)&&r.expiresAt>t&&r.updatedAt<=t&&t-r.updatedAt<=maxAgeMs&&['confirmed','investigating'].includes(r.status)).map(({history,...r})=>copy(r));
 }
 return Object.freeze({report,candidates,create,transition,snapshot,list:()=>[...records.values()].map(copy),prune});
}
