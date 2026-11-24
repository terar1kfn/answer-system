import {classify,normalize} from './classify.mjs';
import {sanitizeText} from './privacy.mjs';
import {eligible,resolveReviewedFact} from './knowledge.mjs';
import {isInformationalQuery} from './answer-planner.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const bounded=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const bilingual=(x,n)=>x&&bounded(x.en,n)&&bounded(x.ar,n);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const protectedInput=r=>['safety','exam'].includes(r.domain)||r.facts.error_signature||r.facts.error_conflict||r.facts.mfa_prompt==='unexpected'||r.facts.credentials==='locked'||r.facts.send_error==='restricted';
/**
 * Compose at most three independent, explicitly phrased informational
 * questions. Every part must resolve to a unique reviewed fact in the
 * admitted catalog. No generated sentence, paraphrase, policy or procedure.
 */
export function planCompositeFacts(catalog,text){
 let clean;try{clean=sanitizeText(text);}catch{return {status:'none'};}
 if(!clean.text||clean.categories.length||protectedInput(classify(clean.text)))return {status:'none'};
 const clauses=clean.text.split(/[?؟;؛]+|\s+(?:and|also)\s+(?=(?:what (?:is|are|does|do)|where (?:is|can i find)|meaning of|definition of)\b)/i)
  .map((x,i)=>i?x.trim().replace(/^(?:and|also)\s+/i,''):x.trim()).filter(Boolean);
 if(clauses.length<2)return {status:'none'};
 if(!clauses.every(isInformationalQuery))return {status:'mixed'};
 if(clauses.length>3)return {status:'incomplete',reason:'COMPOSITE_ANSWER_LIMIT'};
 const ids=[],services=[];
 for(const part of clauses){
  const intent=classify(part);
  if(protectedInput(intent))return {status:'mixed'};
  const result=resolveReviewedFact(catalog,part,intent.services);
  if(result.status==='conflict')return {status:'conflict'};
  if(result.status!=='exact')return {status:'incomplete',reason:'COMPOSITE_ANSWER_INCOMPLETE'};
  if(!ids.includes(result.fact.id))ids.push(result.fact.id);
  if(!services.includes(result.fact.serviceId))services.push(result.fact.serviceId);
 }
 return {status:'exact',factIds:ids,services};
}
/** Build a source-bound extractive answer packet from an already selected
 * exact/explicitly confirmed set of fact IDs, not arbitrary model text. */
export function buildReviewedAnswer(catalog,factIds,{services=[]}={}){
 if(!catalog||!bounded(catalog.revision,200)||!Array.isArray(factIds)||!factIds.length||factIds.length>3||
 new Set(factIds).size!==factIds.length||!Array.isArray(services))return null;
 const parts=[];
 for(const id of factIds){
  const f=(catalog.facts||[]).find(x=>x.id===id&&eligible(x,{catalog,services}));
  if(!f||!bounded(f.id,160)||!bounded(f.sourceRef,500)||!bilingual(f.title,500)||!bilingual(f.answer,800))return null;
  parts.push({factId:f.id,serviceId:f.serviceId,title:clone(f.title),answer:clone(f.answer),sourceRef:f.sourceRef});
 }
 const single=parts.length===1;
 return {kind:'answer',catalogRevision:catalog.revision,factIds:[...factIds],sourceRefs:[...new Set(parts.map(p=>p.sourceRef))],answerParts:parts,
  ...(single?{factId:parts[0].factId,sourceRef:parts[0].sourceRef}:{}),
  title:single?clone(parts[0].title):{en:'Reviewed answers',ar:'إجابات معتمدة'},
  answer:{en:parts.map(p=>p.answer.en).join('\n\n'),ar:parts.map(p=>p.answer.ar).join('\n\n')},
  reasonCode:single?'EXACT_REVIEWED_FACT':'COMPOSITE_REVIEWED_FACTS'};
}
/**
 * Consumption-time packet verification. Reconstruct all displayed statements
 * and references from current eligible records. A matching packet establishes
 * consistency with the reviewed catalog, not independent source truth.
 * The host must still authorize its audience, verify sources and publication.
 */
export function verifyReviewedAnswer(catalog,packet,{services=[]}={}){
 if(!packet||packet.kind!=='answer'||packet.catalogRevision!==catalog?.revision)return {valid:false,reasonCode:'ANSWER_REVISION_CHANGED'};
 const expected=buildReviewedAnswer(catalog,packet.factIds,{services});
 if(!expected)return {valid:false,reasonCode:'ANSWER_SOURCE_UNAVAILABLE'};
 for(const key of ['kind','catalogRevision','factIds','sourceRefs','answerParts','factId','sourceRef','title','answer','reasonCode']){
  if(!same(packet[key],expected[key]))return {valid:false,reasonCode:'ANSWER_SOURCE_MISMATCH'};
 }
 return {valid:true,sourceRefs:[...expected.sourceRefs],factIds:[...expected.factIds]};
}
export const answerOutcomeQuestion=Object.freeze({
 text:{en:'Does this reviewed information answer your original question?',ar:'هل تجيب هذه المعلومات المعتمدة عن سؤالك الأصلي؟'},
 options:[
  {id:'yes',label:{en:'Yes, this answers my question',ar:'نعم، هذه إجابة سؤالي'}},
  {id:'no',label:{en:'No, I still need information',ar:'لا، ما زلت بحاجة إلى معلومات'}},
  {id:'unknown',label:{en:'Not sure',ar:'غير متأكد'}}
 ]
});
