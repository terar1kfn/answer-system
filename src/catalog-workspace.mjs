import {createEngine} from './engine.mjs';
const copy=x=>JSON.parse(JSON.stringify(x)),ok=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x),fail=x=>{throw Error(x);};
const validCatalog=c=>{createEngine({catalog:c});return true;};
/**
 * Revisioned staging workspace for supplementary knowledge or the isolated lab.
 * It must NOT replace the live host's published catalog. The actual host owns
 * final approval/publication and synchronization. No student data belongs here.
 */
export function initialCatalogWorkspace(catalog){
 validCatalog(catalog);return {current:copy(catalog),drafts:[],history:[],audit:[]};
}
export function validateCatalogWorkspace(state){
 if(!state||!Array.isArray(state.drafts)||!Array.isArray(state.history)||!Array.isArray(state.audit)||state.drafts.length>200||state.history.length>30||state.audit.length>1000)return false;
 try{validCatalog(state.current);return state.drafts.every(d=>ok(d.id)&&ok(d.actorRef)&&['draft','approved','rejected','published'].includes(d.status)&&validCatalog(d.candidate))&&state.history.every(x=>validCatalog(x.catalog));}catch{return false;}
}
export function createCatalogWorkspace({store,newId=()=>globalThis.crypto.randomUUID(),now=()=>Date.now()}={}){
 if(!store||typeof store.snapshot!=='function'||typeof store.transact!=='function'||typeof newId!=='function'||typeof now!=='function')fail('INVALID_WORKSPACE');
 const audit=(s,action,actorRef,ref)=>{s.audit=[...s.audit,{action,actorRef,ref,at:now()}].slice(-1000);};
 function draft({expectedVersion,baseRevision,candidate,actorRef}={}){
  if(!ok(actorRef))fail('INVALID_ACTOR');validCatalog(candidate);
  return store.transact(expectedVersion,s=>{
   if(s.current.revision!==baseRevision)fail('CATALOG_CHANGED');
   if(s.drafts.length>=200)fail('DRAFT_CAPACITY');
   const id=newId();if(!ok(id)||s.drafts.some(x=>x.id===id))fail('DRAFT_ID_COLLISION');
   const row={id,actorRef,baseRevision,status:'draft',revision:1,candidate:copy(candidate),createdAt:now()};
   s.drafts.push(row);audit(s,'draft_created',actorRef,id);return row;
  });
 }
 function review({expectedVersion,draftId,expectedDraftRevision,reviewerRef,decision}={}){
  if(!ok(reviewerRef)||!['approve','reject'].includes(decision))fail('INVALID_REVIEW');
  return store.transact(expectedVersion,s=>{
   const d=s.drafts.find(x=>x.id===draftId);if(!d||d.revision!==expectedDraftRevision)fail('STALE_DRAFT');
   if(d.status!=='draft'||d.actorRef===reviewerRef)fail('INDEPENDENT_REVIEW_REQUIRED');
   if(d.baseRevision!==s.current.revision)fail('CATALOG_CHANGED');
   validCatalog(d.candidate);d.status=decision==='approve'?'approved':'rejected';d.revision++;d.reviewerRef=reviewerRef;d.reviewedAt=now();
   audit(s,'draft_'+d.status,reviewerRef,d.id);return d;
  });
 }
 // Authorized supplementary-workspace publication only; no external effect.
 function publish({expectedVersion,draftId,expectedDraftRevision,publisherRef}={}){
  if(!ok(publisherRef))fail('INVALID_ACTOR');
  return store.transact(expectedVersion,s=>{
   const d=s.drafts.find(x=>x.id===draftId);if(!d||d.revision!==expectedDraftRevision)fail('STALE_DRAFT');
   if(d.status!=='approved')fail('DRAFT_NOT_APPROVED');
   if(d.baseRevision!==s.current.revision)fail('CATALOG_CHANGED');
   const revision='workspace-'+newId();if(!ok(revision)||revision===s.current.revision||s.history.some(x=>x.catalog.revision===revision))fail('REVISION_COLLISION');
   const next={...copy(d.candidate),revision};validCatalog(next);
   s.history=[...s.history,{catalog:s.current,replacedAt:now(),draftId:d.id}].slice(-30);
   s.current=next;d.status='published';d.revision++;d.publishedRevision=revision;
   audit(s,'workspace_published',publisherRef,d.id);return next;
  });
 }
 // Restoration is deliberately a NEW draft and new publication revision.
 function restoreDraft({expectedVersion,revision,actorRef}={}){
  const s=store.snapshot();
  if(s.revision!==expectedVersion)fail('STORE_REVISION_CONFLICT');
  const old=s.data.history.find(x=>x.catalog.revision===revision);
  if(!old)fail('REVISION_NOT_FOUND');
  return draft({expectedVersion,baseRevision:s.data.current.revision,candidate:old.catalog,actorRef});
 }
 return Object.freeze({snapshot:()=>store.snapshot(),current:()=>store.snapshot().data.current,draft,review,publish,restoreDraft});
}
