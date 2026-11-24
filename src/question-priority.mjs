/**
 * Prefer safe prerequisite questions that separate the largest number of
 * viable approved-guide alternatives. This is a deterministic partition score,
 * not a learned probability. Hard safety/identity prerequisites are never
 * reordered by this module.
 */
const permitted=['device_os','phone','browser_scope'];
export function chooseGuidePrerequisite(viable,state,{minimumSpecificity=-1}={}){
 if(!Array.isArray(viable)||!state?.evidence)return null;
 const relevant=viable.filter(g=>Object.keys(g.requires||{}).length>minimumSpecificity);
 const candidates=permitted.filter(k=>!Object.hasOwn(state.evidence,k)&&!state.askedQuestionIds.includes(k)&&relevant.some(g=>Object.hasOwn(g.requires||{},k)));
 const score=key=>{
  const options=[...new Set(relevant.flatMap(g=>g.requires?.[key]||[]))];
  const constrained=relevant.filter(g=>g.requires?.[key]);
  const groups=options.map(o=>constrained.filter(g=>g.requires[key].includes(o)).length);
  const distinguish=groups.length>1?constrained.length-Math.max(...groups):0;
  // Ask about the highest-value missing prerequisite; a tie retains fixed order.
  return constrained.length*2+distinguish*3+options.length;
 };
 return candidates.sort((a,b)=>score(b)-score(a)||permitted.indexOf(a)-permitted.indexOf(b))[0]||null;
}
