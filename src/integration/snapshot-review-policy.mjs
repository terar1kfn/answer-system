// A conservative, read-only operator policy for exported snapshots. It is
// NOT student authorization and must never replace the native host's policy.
// Legacy service IDs and reviewed source labels are supplied explicitly by a
// reviewer from the actual host code, never guessed from a guide title.
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const validList=xs=>Array.isArray(xs)&&xs.length<=5000&&xs.every(id)&&new Set(xs).size===xs.length;
export function createSnapshotReviewPolicy({legacyAvailableServiceIds,reviewedSourceTypes,additionalEntryGuideIds=[]}={}){
 if(!validList(legacyAvailableServiceIds)||!validList(additionalEntryGuideIds)||
 !Array.isArray(reviewedSourceTypes)||!reviewedSourceTypes.length||reviewedSourceTypes.length>20||
 reviewedSourceTypes.some(s=>typeof s!=='string'||!s.trim()||s.length>100)||
 reviewedSourceTypes.some(s=>['DRAFT / NEEDS REVIEW','REQUIRES IT VALIDATION'].includes(s)))throw Error('EXPLICIT_SNAPSHOT_POLICY_REQUIRED');
 const legacy=new Set(legacyAvailableServiceIds),reviewed=new Set(reviewedSourceTypes),extraEntry=new Set(additionalEntryGuideIds);
 function isServiceAvailable(s){
  return Boolean(s&&s.active===true&&!s.directSupport&&
   (s.availability===undefined||s.availability===null?legacy.has(s.id):s.availability==='available'));
 }
 function ownsGuide(g,s,c){
  if(!g||!s||!c)return false;
  if(g.serviceId)return g.serviceId===s.id;
  if(!g.category||g.category!==s.category)return false;
  // Count every native service, not only visible/admitted services: hidden
  // owners do not turn an ambiguous category into a unique assignment.
  return c.services.filter(x=>x.category===g.category).length===1;
 }
 function isGuideAvailable(g,c){
  return Boolean(g?.isEnabled===true&&c.services.some(s=>ownsGuide(g,s,c)&&isServiceAvailable(s)));
 }
 function isReviewedGuide(g){return Boolean(g&&reviewed.has(g.sourceType));}
 function isEntryMenu(g,c){
  return extraEntry.has(g.id)||c.services.some(s=>s.entryGuideId===g.id)||
   !Array.isArray(g.resolutionSteps)||!g.resolutionSteps.length;
 }
 return Object.freeze({isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu});
}
