// Compare applicability by logical containment, not a count of conditions,
// lexical score or historical success. Every condition is conjunctive.
import {chooseGuidePrerequisite} from './question-priority.mjs';
const uncertain=new Set(['unknown','not_tried']);
const MAX_CANDIDATES=128;
export function moreSpecific(a,b){
 const ar=a.requires||{},br=b.requires||{};
 if(Object.entries(br).some(([k,values])=>!Object.hasOwn(ar,k)||ar[k].some(v=>!values.includes(v))))return false;
 return Object.keys(ar).some(k=>!Object.hasOwn(br,k)||ar[k].length<br[k].length);
}
function evidenceStatus(g,state){
 const mismatch=[],missing=[],unconfirmed=[];
 for(const [key,values] of Object.entries(g.requires||{})){
  const e=state.evidence[key];
  if(!e){missing.push(key);continue;}
  if(uncertain.has(e.value)){unconfirmed.push(key);continue;}
  if(!values.includes(e.value))mismatch.push(key);
 }
 return {guideId:g.id,mismatch,missing,unconfirmed};
}
export function planApplicableGuides({guides,state,serviceId,purpose}){
 if(!Array.isArray(guides)||!state?.evidence||!Array.isArray(state.askedQuestionIds))throw Error('GUIDE_SELECTION_INPUT_REQUIRED');
 if(guides.length>MAX_CANDIDATES)return {kind:'limit',audit:{serviceId,purpose,eligibleCount:guides.length,reason:'CANDIDATE_LIMIT'}};
 const rows=guides.map(g=>({g,...evidenceStatus(g,state)}));
 const viable=rows.filter(r=>!r.mismatch.length);
 const pending=viable.filter(r=>r.missing.length||r.unconfirmed.length);
 const matched=viable.filter(r=>!r.missing.length&&!r.unconfirmed.length).map(r=>r.g);
 const maximal=matched.filter(g=>!matched.some(other=>other.id!==g.id&&moreSpecific(other,g)));
 // A potentially applicable narrower/incomparable guide must be clarified
 // before falling back to an otherwise generic choice. Unknown is not proof.
 const unresolved=pending.filter(r=>!maximal.some(g=>moreSpecific(g,r.g)));
 const audit={serviceId,purpose,eligibleCount:guides.length,matchedIds:matched.map(g=>g.id),
  maximalIds:maximal.map(g=>g.id),pending:unresolved.map(({guideId,missing,unconfirmed})=>({guideId,missing,unconfirmed})),
  contradicted:rows.filter(r=>r.mismatch.length).map(({guideId,mismatch})=>({guideId,mismatch}))};
 if(unresolved.length){
  const questionId=chooseGuidePrerequisite(unresolved.map(r=>r.g),state);
  return questionId?{kind:'ask',questionId,audit}:{kind:'unconfirmed',audit};
 }
 if(!maximal.length)return {kind:'no_match',audit};
 return {kind:'matched',guides:maximal,audit};
}
