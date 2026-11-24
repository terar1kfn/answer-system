import {createEngine} from './engine.mjs';
import {isServiceId} from './service-taxonomy.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
/**
 * Explicit private-host adapter. Never guesses guide mappings by title.
 * All guide IDs, approval status and availability must come from the host.
 * It exports metadata and references, not raw guide bodies or private data.
 */
export function buildCatalogSnapshot({sourceRevision,mappingRevision,guideRows,factRows=[],serviceAvailability={}}={}){
 if(!id(sourceRevision)||!id(mappingRevision)||!Array.isArray(guideRows)||!Array.isArray(factRows)||guideRows.length>5000||factRows.length>5000)throw Error('INVALID_CATALOG_INPUT');
 const guides=guideRows.map(row=>{
  if(!row||!id(row.id)||!id(row.purpose)||!isServiceId(row.serviceId)||typeof row.published!=='boolean'||typeof row.enabled!=='boolean'||typeof row.reviewed!=='boolean'||!['student','staff'].includes(row.audience))throw Error('INVALID_GUIDE_MAPPING');
  return {id:row.id,serviceId:row.serviceId,purpose:row.purpose,title:clone(row.title),reviewed:row.reviewed&&row.published,enabled:row.enabled,audience:row.audience,aliases:clone(row.aliases||[]),keywords:clone(row.keywords||[]),errorSignatures:clone(row.errorSignatures||[]),requires:clone(row.requires||{}),...(id(row.sourceRef)?{sourceRef:row.sourceRef}:{})};
 });
 const facts=factRows.map(row=>{
  if(!row||!id(row.id)||!isServiceId(row.serviceId)||!id(row.sourceRef)||typeof row.published!=='boolean'||typeof row.reviewed!=='boolean'||typeof row.enabled!=='boolean')throw Error('INVALID_FACT_MAPPING');
  return {id:row.id,serviceId:row.serviceId,title:clone(row.title),answer:clone(row.answer),aliases:clone(row.aliases),sourceRef:row.sourceRef,reviewed:row.published&&row.reviewed,enabled:row.enabled,audience:row.audience};
 });
 const catalog={revision:sourceRevision+'__'+mappingRevision,sourceRevision,mappingRevision,guides,facts,serviceAvailability:clone(serviceAvailability)};
 // Runtime validation when the host calls this adapter, not a release test.
 createEngine({catalog});
 return catalog;
}
export function createGuideResolver({getCatalog,loadReviewedGuide}={}){
 if(typeof getCatalog!=='function'||typeof loadReviewedGuide!=='function')throw Error('INVALID_GUIDE_RESOLVER');
 return async function resolve({guideId,catalogRevision,audience='student'}={}){
  const c=getCatalog();
  if(c.revision!==catalogRevision)throw Error('CATALOG_CHANGED');
  const g=c.guides.find(x=>x.id===guideId&&x.enabled&&x.reviewed&&x.audience===audience&&c.serviceAvailability?.[x.serviceId]!==false);
  if(!g)throw Error('GUIDE_UNAVAILABLE');
  // This host hook must independently verify the current publication state.
  const content=await loadReviewedGuide({guideId,sourceRevision:c.sourceRevision,audience});
  if(!content||content.id!==guideId||content.published!==true||getCatalog().revision!==catalogRevision)throw Error('GUIDE_UNAVAILABLE');
  return content;
 };
}
