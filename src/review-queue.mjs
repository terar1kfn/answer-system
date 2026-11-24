const copy=x=>JSON.parse(JSON.stringify(x)),ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x),fail=x=>{throw Error(x);};
// Host authorization required. Drafts and approvals are not catalog publication.
export function createReviewQueue({now=()=>Date.now(),newId=()=>globalThis.crypto.randomUUID(),capacity=200}={}){
 if(typeof now!=='function'||typeof newId!=='function'||!Number.isSafeInteger(capacity)||capacity<1)fail('INVALID_QUEUE_CONFIG');
 const records=new Map();
 function propose({actorRef,caseCode,causeCode,solutionRef,catalogRevision,proposalKind}={}){
  if(![actorRef,caseCode,causeCode,solutionRef,catalogRevision].every(ok)||!['new_guide','new_alias','new_rule','correct_guide'].includes(proposalKind))fail('INVALID_PROPOSAL');
  if(records.size>=capacity)fail('PROPOSAL_CAPACITY');
  const id=newId();if(!ok(id)||records.has(id))fail('PROPOSAL_ID_COLLISION');
  const r={id,actorRef,caseCode,causeCode,solutionRef,catalogRevision,proposalKind,status:'draft',revision:1,createdAt:now()};records.set(id,r);return copy(r);
 }
 function review(id,{expectedRevision,reviewerRef,decision,currentCatalogRevision}={}){
  const r=records.get(id);if(!r)fail('PROPOSAL_NOT_FOUND');if(r.revision!==expectedRevision)fail('STALE_PROPOSAL_REVISION');
  if(r.status!=='draft'||!ok(reviewerRef)||reviewerRef===r.actorRef||!['approve','reject'].includes(decision))fail('INVALID_REVIEW');
  if(r.catalogRevision!==currentCatalogRevision)fail('CATALOG_CHANGED');
  r.status=decision==='approve'?'approved_for_publication':'rejected';r.reviewerRef=reviewerRef;r.reviewedAt=now();r.revision++;return copy(r);
 }
 function publicationCandidate(id,{currentCatalogRevision}={}){
  const r=records.get(id);if(!r||r.status!=='approved_for_publication')fail('PROPOSAL_NOT_APPROVED');if(r.catalogRevision!==currentCatalogRevision)fail('CATALOG_CHANGED');
  return copy({proposalId:r.id,caseCode:r.caseCode,causeCode:r.causeCode,solutionRef:r.solutionRef,proposalKind:r.proposalKind,expectedCatalogRevision:r.catalogRevision});
 }
 return Object.freeze({propose,review,publicationCandidate,list:()=>[...records.values()].map(copy)});
}
