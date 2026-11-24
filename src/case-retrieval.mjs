import {isServiceId} from './service-taxonomy.mjs';
import {QUESTIONS} from './questions.mjs';
import {getErrorSignature} from './error-intelligence.mjs';
import {eligible} from './knowledge.mjs';
const ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const VALID_EXTRA={
 recovery_context:['phone_change'],setup_requested:['yes'],setup_completed:['yes'],mfa_recovery:['completed'],
 verification_context:['challenge','conflicting_screen'],login_screen:['sign_in_visible']
};
const strength={error_signature:5,mfa_access:4,mfa_prompt:4,credentials:4,send_error:4,service_access:3,browser_scope:3,mail_client_scope:3,network_issue:3,connection:3,peers:2,phone:1,device_os:1,task:1};
function validSignal(s){
 if(!s||!ok(s.key)||!ok(s.value)||s.value==='unknown'||s.value==='not_tried')return false;
 if(s.key==='error_signature')return Boolean(getErrorSignature(s.value));
 if(Object.hasOwn(VALID_EXTRA,s.key))return VALID_EXTRA[s.key].includes(s.value);
 // These are contextual signals, not outcomes or staff authorization claims.
 if(['outcome','guide_result','reviewed_topic','service','exam_started'].includes(s.key))return false;
 return Boolean(QUESTIONS[s.key]?.options.some(o=>o.id===s.value));
}
/** Staff-reviewed, structured and anonymized cases. A case is a lead, never a
 * student-facing answer, proof of a cause, or permission to repeat its guide. */
export function createCaseIndex({cases=[],getCatalog}={}){
 if(!Array.isArray(cases)||cases.length>5000||typeof getCatalog!=='function')throw Error('INVALID_CASE_INDEX');
 const ids=new Set();
 const rows=cases.map(c=>{
  if(!c||!ok(c.id)||ids.has(c.id)||!isServiceId(c.serviceId)||!ok(c.causeCode)||!ok(c.solutionRef)||typeof c.approved!=='boolean'||
   !Array.isArray(c.signals)||!c.signals.length||c.signals.length>20||!c.signals.every(validSignal)||new Set(c.signals.map(s=>s.key)).size!==c.signals.length||
   c.outcomeEvidence!==undefined&&!['staff_verified','student_reported','unverified'].includes(c.outcomeEvidence))throw Error('INVALID_CASE_RECORD');
  ids.add(c.id);return clone({id:c.id,serviceId:c.serviceId,causeCode:c.causeCode,solutionRef:c.solutionRef,approved:c.approved,signals:c.signals,outcomeEvidence:c.outcomeEvidence||'unverified'});
 });
 function find(state,{limit=5}={}){
  if(!state||!Array.isArray(state.services)||!state.evidence||['safety','exam'].includes(state.domain)||!Number.isInteger(limit)||limit<1||limit>10)return [];
  const catalog=getCatalog();
  const guides=new Map(catalog.guides.filter(g=>eligible(g,{catalog})).map(g=>[g.id,g]));
  return rows.filter(r=>{
   const g=guides.get(r.solutionRef);
   return r.approved&&state.services.includes(r.serviceId)&&g?.serviceId===r.serviceId;
  }).flatMap(r=>{
   const g=guides.get(r.solutionRef),matched=[],missing=[],contradicted=[];
   let matchedWeight=0,totalWeight=0;
   for(const s of r.signals){
    const weight=strength[s.key]||2,v=state.evidence[s.key]?.value;totalWeight+=weight;
    if(v===s.value){matched.push(s.key);matchedWeight+=weight;}
    else if(!v||v==='unknown'||v==='not_tried')missing.push(s.key);
    else contradicted.push(s.key);
   }
   if(contradicted.length||!matched.length||matchedWeight/totalWeight<0.5)return [];
   const requirements=Object.entries(g.requires||{});
   if(requirements.some(([k,allowed])=>state.evidence[k]&&state.evidence[k].value!=='unknown'&&!allowed.includes(state.evidence[k].value)))return [];
   const missingPrerequisites=requirements.filter(([k,allowed])=>!allowed.includes(state.evidence[k]?.value)).map(([k])=>k);
   const priorAttempt=(state.guideAttempts||[]).some(a=>a.guideId===g.id&&a.outcome==='no');
   return [{caseRef:r.id,serviceId:r.serviceId,causeCode:r.causeCode,solutionRef:r.solutionRef,
    matched:matched.length,totalSignals:r.signals.length,contradicted:false,score:matchedWeight/totalWeight,matchedEvidenceKeys:matched,
    missingEvidenceKeys:missing,missingPrerequisites,priorAttempt,outcomeEvidence:r.outcomeEvidence,
    strongMatch:matched.length>=2&&matchedWeight>=5&&missing.length===0&&missingPrerequisites.length===0&&!priorAttempt&&r.outcomeEvidence==='staff_verified',
    requiresHumanReview:true}];
  }).sort((a,b)=>Number(b.strongMatch)-Number(a.strongMatch)||Number(a.priorAttempt)-Number(b.priorAttempt)||b.score-a.score||b.matched-a.matched||a.caseRef.localeCompare(b.caseRef)).slice(0,limit);
 }
 return Object.freeze({find});
}
