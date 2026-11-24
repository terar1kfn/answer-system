import {nativeRecordFingerprint} from './native-fingerprint.mjs';
export {nativeRecordFingerprint} from './native-fingerprint.mjs';
import {createEngine} from '../engine.mjs';
import {validGuidePrerequisites,normalizeGuidePrerequisites} from '../diagnostic-evidence.mjs';
import {isPermittedNativeRisk,isNativeStudentSelfService,isUnreviewedNativeSource} from './native-guide-policy.mjs';
import {SERVICE_IDS,isServiceId} from '../service-taxonomy.mjs';
import {validateReviewedContexts} from '../reviewed-context.mjs';
import {knownGuidePurpose} from '../guide-purposes.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const bilingual=x=>x&&typeof x.en==='string'&&x.en.trim()&&x.en.length<=500&&typeof x.ar==='string'&&x.ar.trim()&&x.ar.length<=500;
const list=x=>Array.isArray(x)&&x.length<=5000;
const fail=x=>{throw Error(x);};
const digest=nativeRecordFingerprint;
const unique=(xs,get)=>new Set(xs.map(get)).size===xs.length;
const boundedTerms=x=>Array.isArray(x)?x.filter(v=>typeof v==='string'&&v.trim()&&v.length<=500).slice(0,100):[];
/**
 * Read-only projection of a native application's published configuration.
 * Mapping, scope and policy callbacks are trusted server inputs. No institutional
 * IDs, current availability or guide text are bundled in the public repository.
 * Generic service categories are not interchangeable native card identities.
 */
function projectNativeCatalogCore({
 configuration, mapping, allowedNativeServiceIds, diagnosticServices,
 isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu
}={}){
 if(!configuration||!Number.isSafeInteger(configuration.revision)||configuration.revision<0||
 !list(configuration.services)||!list(configuration.guides)||!mapping||!id(mapping.revision)||
 !list(mapping.services)||!list(mapping.guides)||!list(allowedNativeServiceIds)||!allowedNativeServiceIds.every(id)||
 !list(diagnosticServices)||!diagnosticServices.length||!diagnosticServices.every(isServiceId)||
 ![isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu].every(f=>typeof f==='function'))fail('NATIVE_CATALOG_CONFIGURATION_REQUIRED');
 if(!unique(configuration.services,s=>s.id)||!unique(configuration.guides,g=>g.id)||
 !unique(mapping.services,s=>s.nativeId)||!unique(mapping.guides,g=>g.guideId))fail('AMBIGUOUS_NATIVE_MAPPING');
 for(const s of mapping.services)if(!s||!id(s.nativeId)||!isServiceId(s.serviceId))fail('INVALID_SERVICE_MAPPING');
 for(const g of mapping.guides)if(!g||!id(g.guideId)||!id(g.nativeServiceId)||!id(g.purpose)||
  (g.entryMode!==undefined&&!['diagnostic','resolution'].includes(g.entryMode))||
  (g.expectedFingerprint!==undefined&&(typeof g.expectedFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(g.expectedFingerprint))))fail('INVALID_GUIDE_MAPPING');
 const sourceRevision=String(configuration.gatewayRevision??configuration.revision);
 if(mapping.sourceRevision!==undefined&&mapping.sourceRevision!==sourceRevision)fail('MAPPING_SOURCE_REVISION_CHANGED');
 if(mapping.sourceCatalogFingerprint!==undefined&&mapping.sourceCatalogFingerprint!==digest(configuration))fail('MAPPING_SOURCE_CONTENT_CHANGED');
 const services=new Map(configuration.services.map(s=>[s.id,s]));
 const guides=new Map(configuration.guides.map(g=>[g.id,g]));
 const mappedServices=new Map(mapping.services.map(s=>[s.nativeId,s]));
 const allowed=new Set(allowedNativeServiceIds),diagnostic=[...new Set(diagnosticServices)].sort();
 const available=new Map(),withheld=[];
 for(const m of mapping.services){
  const s=services.get(m.nativeId);
  if(!s||!allowed.has(m.nativeId)||!diagnostic.includes(m.serviceId)||s.active!==true||
  ['hidden','unavailable'].includes(s.availability)||s.directSupport===true||
  isServiceAvailable(s,configuration)!==true)continue;
  available.set(m.nativeId,{nativeId:m.nativeId,serviceId:m.serviceId,category:typeof s.category==='string'?s.category.slice(0,60):null});
 }
 const projected=[];
 for(const m of mapping.guides){
  const owner=available.get(m.nativeServiceId),g=guides.get(m.guideId),s=services.get(m.nativeServiceId);
  if(!mappedServices.has(m.nativeServiceId))fail('GUIDE_OWNER_NOT_MAPPED');
  if(!knownGuidePurpose(mappedServices.get(m.nativeServiceId).serviceId,m.purpose)){withheld.push({guideId:m.guideId,reason:'UNKNOWN_GUIDE_PURPOSE'});continue;}
  if(!owner||!g){withheld.push({guideId:m.guideId,reason:'UNAVAILABLE_OR_OUT_OF_SCOPE'});continue;}
  if(m.requires!==undefined&&!validGuidePrerequisites(m.requires)){withheld.push({guideId:m.guideId,reason:'INVALID_GUIDE_PREREQUISITES'});continue;}
  const requires=normalizeGuidePrerequisites(m.requires);
  // Broad collaboration taxonomy is not an exact product authorization.
  // Preserve the original explicit single-product mapping gate as well.
  if(owner.serviceId==='collaboration'&&(!Array.isArray(m.requires?.meeting_product)||m.requires.meeting_product.length!==1||!['zoom','teams'].includes(m.requires.meeting_product[0]))){withheld.push({guideId:m.guideId,reason:'EXACT_MEETING_PRODUCT_REQUIRED'});continue;}
  if((g.serviceId&&g.serviceId!==m.nativeServiceId)||ownsGuide(g,s,configuration)!==true){withheld.push({guideId:m.guideId,reason:'OWNERSHIP_UNCONFIRMED'});continue;}
  // Entry menus and procedures for privileged personnel stay in the native router.
  if(g.isEnabled!==true||!isNativeStudentSelfService(g)||
  !isPermittedNativeRisk(g)||isUnreviewedNativeSource(g)||
  isGuideAvailable(g,configuration)!==true||isReviewedGuide(g,configuration)!==true||
  isEntryMenu(g,configuration)!==false){withheld.push({guideId:m.guideId,reason:'NOT_APPROVED_FOR_SUPPLEMENTAL_ROUTING'});continue;}
  const fingerprint=digest(g);
  if(m.expectedFingerprint!==undefined&&m.expectedFingerprint!==fingerprint){withheld.push({guideId:m.guideId,reason:'MAPPED_GUIDE_CHANGED'});continue;}
  const hasQuestions=Array.isArray(g.diagnosticQuestions)&&g.diagnosticQuestions.length>0;
  const entryMode=m.entryMode??'resolution';
  if(hasQuestions&&entryMode!=='diagnostic'||!hasQuestions&&entryMode==='diagnostic'){withheld.push({guideId:m.guideId,reason:'NATIVE_QUESTION_FLOW_REQUIRED'});continue;}
  if(!Array.isArray(g.resolutionSteps)||!Array.isArray(g.resolutionStepsAr)||!g.resolutionSteps.length||
   g.resolutionSteps.length!==g.resolutionStepsAr.length||
   [...g.resolutionSteps,...g.resolutionStepsAr].some(x=>typeof x!=='string'||!x.trim())){
   withheld.push({guideId:m.guideId,reason:'INCOMPLETE_BILINGUAL_PROCEDURE'});continue;
  }
  const title={en:g.title,ar:g.titleAr};
  if(!bilingual(title)){withheld.push({guideId:m.guideId,reason:'INCOMPLETE_BILINGUAL_METADATA'});continue;}
  projected.push({
   id:g.id,serviceId:owner.serviceId,nativeServiceId:owner.nativeId,purpose:m.purpose,title,
   // Hash the private native procedure, not just its title or aliases. The
   // original guide body remains in the host and is never returned here.
   nativeGuideFingerprint:fingerprint,resolutionStepCount:g.resolutionSteps.length,entryMode,reviewed:true,enabled:true,audience:'student',
   aliases:boundedTerms(g.aliases),keywords:boundedTerms(g.keywords),
   requires,errorSignatures:boundedTerms(m.errorSignatures)
  });
 }
 const serviceAvailability=Object.fromEntries(SERVICE_IDS.map(id=>[id,[...available.values()].some(s=>s.serviceId===id)]));
 const contextRows=mapping.reviewedContexts??[];
 validateReviewedContexts(contextRows);
 const withheldContexts=[],reviewedContexts=[];
 for(const p of contextRows){
  const g=projected.find(g=>g.id===p.guideId&&g.serviceId===p.serviceId&&g.purpose===p.purpose);
  if(!g||p.sourceRevision!==sourceRevision||p.guideFingerprint!==g.nativeGuideFingerprint){
   withheldContexts.push({patternRef:p.id,reason:'CONTEXT_GUIDE_OR_REVISION_STALE'});continue;
  }
  reviewedContexts.push(clone(p));
 }
 const body={sourceRevision,mappingRevision:mapping.revision,guides:projected.sort((a,b)=>a.id.localeCompare(b.id)),facts:[],serviceAvailability,diagnosticServices:diagnostic,reviewedContexts:reviewedContexts.sort((a,b)=>a.id.localeCompare(b.id))};
 // Availability, exact ownership and metadata changes invalidate old choices even
 // if an external publication revision is accidentally reused.
 const catalog={...body,revision:'native-'+digest(body)};
 return {catalog,availableNativeServices:[...available.values()].sort((a,b)=>a.nativeId.localeCompare(b.nativeId)),withheld,withheldContexts};
}
/** Uncached public API still validates every derived catalog. */
export function projectNativeCatalog(input){
 const projection=projectNativeCatalogCore(input);
 createEngine({catalog:projection.catalog});
 return projection;
}
/** Per-host bounded LRU of immutable engine instances. Every invocation
 * still runs the complete fresh native projection and all eligibility hooks.
 * Incidents are a separate exact content pin; no credentials, visit state,
 * raw questions or model payloads are cached. */
export function createNativeCatalogEnginePool({maxEntries=8,now=()=>Date.now()}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<0||maxEntries>32||typeof now!=='function')fail('INVALID_ENGINE_POOL');
 const engines=new Map();
 function project(input,{incidents=[]}={}){
  if(!Array.isArray(incidents)||incidents.length>1000)fail('INVALID_ENGINE_INCIDENTS');
  const projection=projectNativeCatalogCore(input);
  const incidentFingerprint=digest(incidents);
  const key=digest([projection.catalog.revision,incidentFingerprint]);
  let engine=engines.get(key);
  if(engine){engines.delete(key);engines.set(key,engine);}
  else{
   engine=createEngine({catalog:projection.catalog,incidents,now});
   if(maxEntries){engines.set(key,engine);while(engines.size>maxEntries)engines.delete(engines.keys().next().value);}
  }
  return {projection,engine,incidentFingerprint};
 }
 return Object.freeze({project,clear:()=>engines.clear(),stats:()=>({size:engines.size,maxEntries})});
}
export function nativeGuideReference(projection,decision){
 if(!projection||decision?.kind!=='open_guide'||projection.catalog.revision!==decision.catalogRevision)fail('NATIVE_GUIDE_STALE');
 const g=projection.catalog.guides.find(x=>x.id===decision.guideId&&x.serviceId===decision.serviceId);
 if(!g||!projection.availableNativeServices.some(s=>s.nativeId===g.nativeServiceId))fail('NATIVE_GUIDE_UNAVAILABLE');
 // The native application must revalidate and open the complete existing guide.
 // Never reconstruct its actions, warnings, prerequisites, or screenshots here.
 return {guideId:g.id,nativeServiceId:g.nativeServiceId,catalogRevision:projection.catalog.revision,sourceRevision:projection.catalog.sourceRevision,nativeGuideFingerprint:g.nativeGuideFingerprint,resolutionStepCount:g.resolutionStepCount,entryMode:g.entryMode};
}
