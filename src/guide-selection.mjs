// Compare applicability by logical containment, not a count of conditions,
// lexical score or historical success. Every condition is conjunctive.
import {chooseGuidePrerequisite} from './question-priority.mjs';
import {normalizeGuidePrerequisites,isUnconfirmedPrerequisite} from './diagnostic-evidence.mjs';
export const MAX_GUIDE_CANDIDATES=128;
const requirements=g=>normalizeGuidePrerequisites(g.requires);
/** Compare conjunctions of confirmed fixed-option sets. Additional evidence
 * keys and strict subsets increase specificity. Equal sets (irrespective of
 * order or duplicates) never dominate one another. Overlap is theoretical:
 * a native route, third candidate or unreachable combination may resolve it. */
export function compareGuideApplicability(a,b){
 const ar=requirements(a),br=requirements(b);
 if(Object.entries(ar).some(([k,vs])=>Object.hasOwn(br,k)&&!vs.some(v=>br[k].includes(v))))return 'disjoint';
 const subset=(x,y)=>Object.entries(y).every(([k,vs])=>Object.hasOwn(x,k)&&x[k].every(v=>vs.includes(v)));
 const ab=subset(ar,br),ba=subset(br,ar);
 if(ab&&ba)return 'equivalent';
 if(ab)return 'a_more_specific';
 if(ba)return 'b_more_specific';
 return 'overlapping';
}
export function moreSpecific(a,b){return compareGuideApplicability(a,b)==='a_more_specific';}
export function potentialGuideTie(a,b){
 const relation=compareGuideApplicability(a,b);
 return relation==='equivalent'||relation==='overlapping';
}
export function confirmedPrerequisitesMatch(guide,values){
 return Object.entries(requirements(guide)).every(([k,vs])=>values&&Object.hasOwn(values,k)&&!isUnconfirmedPrerequisite(values[k])&&vs.includes(values[k]));
}
function evidenceStatus(g,state){
 const mismatch=[],missing=[],unconfirmed=[];
 for(const [key,values] of Object.entries(requirements(g))){
  const e=state.evidence[key];
  if(!e){missing.push(key);continue;}
  if(isUnconfirmedPrerequisite(e.value)){unconfirmed.push(key);continue;}
  if(!values.includes(e.value))mismatch.push(key);
 }
 return {guideId:g.id,mismatch,missing,unconfirmed};
}
export function planApplicableGuides({guides,state,serviceId,purpose}){
 if(!Array.isArray(guides)||!state?.evidence||!Array.isArray(state.askedQuestionIds))throw Error('GUIDE_SELECTION_INPUT_REQUIRED');
 if(guides.length>MAX_GUIDE_CANDIDATES)return {kind:'limit',audit:{serviceId,purpose,eligibleCount:guides.length,reason:'CANDIDATE_LIMIT'}};
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
