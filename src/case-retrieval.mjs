import {isServiceId} from './service-taxonomy.mjs';
const ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
/** Staff-reviewed, structured and anonymized cases; no raw ticket content. */
export function createCaseIndex({cases=[],getCatalog}={}){
 if(!Array.isArray(cases)||cases.length>5000||typeof getCatalog!=='function')throw Error('INVALID_CASE_INDEX');
 const ids=new Set();
 const rows=cases.map(c=>{
  if(!c||!ok(c.id)||ids.has(c.id)||!isServiceId(c.serviceId)||!ok(c.causeCode)||!ok(c.solutionRef)||typeof c.approved!=='boolean'||!Array.isArray(c.signals)||!c.signals.length||c.signals.length>20||c.signals.some(s=>!ok(s.key)||!ok(s.value)))throw Error('INVALID_CASE_RECORD');
  ids.add(c.id);return clone({id:c.id,serviceId:c.serviceId,causeCode:c.causeCode,solutionRef:c.solutionRef,approved:c.approved,signals:c.signals});
 });
 function find(state,{limit=5}={}){
  if(!state||!Array.isArray(state.services)||!state.evidence||!Number.isInteger(limit)||limit<1||limit>10)return [];
  const catalog=getCatalog(),eligible=new Set(catalog.guides.filter(g=>g.reviewed&&g.enabled&&g.audience==='student'&&catalog.serviceAvailability?.[g.serviceId]!==false).map(g=>g.id));
  return rows.filter(r=>r.approved&&state.services.includes(r.serviceId)&&eligible.has(r.solutionRef)).map(r=>{
   const matched=r.signals.filter(s=>state.evidence[s.key]?.value===s.value).length;
   const contradicted=r.signals.some(s=>state.evidence[s.key]&&state.evidence[s.key].value!=='unknown'&&state.evidence[s.key].value!==s.value);
   return {caseRef:r.id,serviceId:r.serviceId,causeCode:r.causeCode,solutionRef:r.solutionRef,matched,totalSignals:r.signals.length,contradicted,score:matched/r.signals.length};
  }).filter(r=>!r.contradicted&&r.matched>=1&&r.score>=0.5).sort((a,b)=>b.score-a.score||b.matched-a.matched||a.caseRef.localeCompare(b.caseRef)).slice(0,limit);
 }
 return Object.freeze({find});
}
