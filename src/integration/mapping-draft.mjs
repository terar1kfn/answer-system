import {projectNativeCatalog} from './native-catalog.mjs';
import {knownGuidePurpose} from '../guide-purposes.mjs';
import {QUESTIONS} from '../questions.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const fail=x=>{throw Error(x);};
function checkedPrerequisites(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([key,values])=>!Object.hasOwn(QUESTIONS,key)||!Array.isArray(values)||!values.length||new Set(values).size!==values.length||values.some(v=>!QUESTIONS[key].options.some(o=>o.id===v))))fail('INVALID_MAPPING_PREREQUISITES');
 return copy(value);
}
/**
 * Prepare a candidate mapping for independent private review. The existing
 * native publishing/editor workflow is still the authority. This function
 * never writes files, changes service availability, approves a guide or
 * updates the published mapping.
 */
export function prepareMappingDraft({input,expectedCatalogRevision,nextMappingRevision,authorRef,changes}={}){
 if(!input||!id(expectedCatalogRevision)||!id(nextMappingRevision)||!id(authorRef)||!Array.isArray(changes)||!changes.length||changes.length>50)fail('INVALID_MAPPING_DRAFT');
 const prior=projectNativeCatalog(input);
 if(prior.catalog.revision!==expectedCatalogRevision||input.mapping.revision===nextMappingRevision)fail('CATALOG_CHANGED');
 const mapping=copy(input.mapping),owners=new Map(mapping.services.map(s=>[s.nativeId,s.serviceId])),changed=new Set();
 for(const row of changes){
  if(!row||!['add','replace','remove'].includes(row.action)||!id(row.guideId)||changed.has(row.guideId)||
   Object.keys(row).some(k=>!['action','guideId','nativeServiceId','purpose','requires'].includes(k)))fail('INVALID_MAPPING_CHANGE');
  changed.add(row.guideId);
  const previous=mapping.guides.find(g=>g.guideId===row.guideId);
  if(row.action==='remove'){
   if(!previous||Object.keys(row).some(k=>!['action','guideId'].includes(k)))fail('INVALID_MAPPING_REMOVE');
   mapping.guides=mapping.guides.filter(g=>g.guideId!==row.guideId);continue;
  }
  if((row.action==='add'&&previous)||(row.action==='replace'&&!previous)||!id(row.nativeServiceId)||!id(row.purpose)||
   !owners.has(row.nativeServiceId)||!knownGuidePurpose(owners.get(row.nativeServiceId),row.purpose))fail('INVALID_MAPPING_CHANGE');
  const candidate={guideId:row.guideId,nativeServiceId:row.nativeServiceId,purpose:row.purpose,requires:checkedPrerequisites(row.requires??{})};
  mapping.guides=mapping.guides.filter(g=>g.guideId!==row.guideId);mapping.guides.push(candidate);
 }
 mapping.revision=nextMappingRevision;
 const projected=projectNativeCatalog({...input,mapping});
 // New/replaced mappings must survive all the exact same native eligibility
 // gates as live routing. Removals do not enable hidden/disabled services.
 const accepted=new Set(projected.catalog.guides.map(g=>g.id));
 if(changes.some(c=>c.action!=='remove'&&!accepted.has(c.guideId)))fail('MAPPING_GUIDE_NOT_ELIGIBLE');
 return {kind:'private_mapping_draft',status:'needs_independent_review',authorRef,baseCatalogRevision:prior.catalog.revision,
  baseMappingRevision:input.mapping.revision,candidateCatalogRevision:projected.catalog.revision,candidateMapping:mapping,
  changes:copy(changes),published:false};
}
