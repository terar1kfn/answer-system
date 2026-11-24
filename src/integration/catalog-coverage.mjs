import {GUIDE_PURPOSES,knownGuidePurpose} from '../guide-purposes.mjs';
import {projectNativeCatalog} from './native-catalog.mjs';
import {searchKnowledge} from '../knowledge.mjs';
import {QUESTIONS} from '../questions.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
const fail=x=>{throw Error(x);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const terms=x=>Array.isArray(x)?x.filter(s=>typeof s==='string'&&s.trim()&&s.length<=500).slice(0,100):[];
const title=g=>typeof g.title==='string'&&g.title.trim()&&g.title.length<=500&&typeof g.titleAr==='string'&&g.titleAr.trim()&&g.titleAr.length<=500;
const priority=x=>x.priority==='core'?0:1;
const allowedPrerequisites=new Set(['network_scope','attendance_permission_kind','device_os','phone','browser_scope']);
function overlapping(a,b){
 const ra=a.requires||{},rb=b.requires||{};
 if(Object.keys(ra).length!==Object.keys(rb).length)return false;
 for(const key of Object.keys(ra))if(Object.hasOwn(rb,key)&&!ra[key].some(v=>rb[key].includes(v)))return false;
 return true;
}
function overlappingPairs(rows){
 const output=[];
 // Bound comparison output. Report potential overlaps, not proof that no
 // more specific third guide would resolve a given assignment.
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(overlapping(rows[i],rows[j])){
  output.push([rows[i].id,rows[j].id]);if(output.length>=25)return {pairs:output,truncated:true};
 }
 return {pairs:output,truncated:false};
}
function candidateRows(input,projection){
 const {configuration,mapping,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu}=input;
 const mapped=new Set(mapping.guides.map(g=>g.guideId));
 const owners=projection.availableNativeServices.map(s=>({...s,native:configuration.services.find(n=>n.id===s.nativeId)}));
 const result=[];
 for(const g of configuration.guides){
  if(!g||!id(g.id)||mapped.has(g.id)||g.isEnabled!==true||!['Student','All'].includes(g.audience)||g.permissionLevel!=='SELF SERVICE'||
   !title(g)||isGuideAvailable(g,configuration)!==true||isReviewedGuide(g,configuration)!==true||isEntryMenu(g,configuration)!==false)continue;
  const eligibleOwners=owners.filter(o=>(!g.serviceId||g.serviceId===o.nativeId)&&isServiceAvailable(o.native,configuration)===true&&ownsGuide(g,o.native,configuration)===true);
  if(eligibleOwners.length!==1)continue;
  const owner=eligibleOwners[0];
  result.push({id:g.id,nativeServiceId:owner.nativeId,serviceId:owner.serviceId,title:{en:g.title,ar:g.titleAr},
   aliases:terms([...(g.aliases||[]),...(g.symptoms||[]),...(g.symptomsAr||[])]),keywords:terms(g.keywords),
   reviewed:true,enabled:true,audience:'student'});
 }
 return result;
}
function suggestions(p,rows){
 const catalog={guides:rows,facts:[]};
 const ranked=new Map();
 // Query only reviewed metadata in the same service. Lexical relevance is a
 // review lead, never an automatically applied guide-purpose mapping.
 for(const query of [...new Set([p.title.en,p.title.ar,...p.aliases])].slice(0,16)){
  for(const r of searchKnowledge(catalog,{text:query,services:[p.serviceId],limit:5})){
   if(!r.exactPhrase&&(r.coverage<0.65||r.score<6))continue;
   const prior=ranked.get(r.id);
   if(!prior||r.score>prior.score)ranked.set(r.id,r);
  }
 }
 return [...ranked.values()].sort((a,b)=>Number(b.exactPhrase)-Number(a.exactPhrase)||b.score-a.score||a.id.localeCompare(b.id)).slice(0,5).map(r=>{
  const source=rows.find(x=>x.id===r.id);
  return {guideId:r.id,nativeServiceId:source.nativeServiceId,title:r.title,match:r.exactPhrase?'exact_metadata':'related_metadata',requiresHumanReview:true};
 });
}
/**
 * Server/operator-only read-only mapping report. The caller must be an
 * authorized private knowledge reviewer. Never expose it through student
 * commands, upload the report to this public repo, or approve mappings from
 * a suggestion. Native routing may already solve a gap listed here.
 */
export function auditNativeCoverage(input,{nativeOnlyServices=['exam','directory'],includeSuggestions=true}={}){
 if(!input||!Array.isArray(nativeOnlyServices)||!nativeOnlyServices.every(isServiceId)||typeof includeSuggestions!=='boolean')fail('INVALID_COVERAGE_CONFIG');
 const projection=projectNativeCatalog(input),c=projection.catalog,scope=new Set(c.diagnosticServices),nativeOnly=new Set(nativeOnlyServices);
 const mappedServices=new Map(input.mapping.services.map(s=>[s.nativeId,s.serviceId]));
 const requested=new Set(input.allowedNativeServiceIds);
 const rawGuides=new Map(input.configuration.guides.map(g=>[g.id,g]));
 const withheld=new Map(projection.withheld.map(r=>[r.guideId,r.reason]));
 const candidates=includeSuggestions?candidateRows(input,projection):[];
 const rows=GUIDE_PURPOSES.map(p=>{
  const base={serviceId:p.serviceId,purpose:p.purpose,title:p.title,priority:p.priority};
  if(nativeOnly.has(p.serviceId))return {...base,status:'native_route'};
  if(!scope.has(p.serviceId))return {...base,status:'out_of_scope'};
  const mappedNative=[...mappedServices].filter(([nativeId,serviceId])=>serviceId===p.serviceId&&requested.has(nativeId)).map(([nativeId])=>nativeId);
  if(!mappedNative.length)return {...base,status:'service_mapping_needed'};
  if(c.serviceAvailability[p.serviceId]!==true)return {...base,status:'service_unavailable'};
  const existing=c.guides.filter(g=>g.serviceId===p.serviceId&&g.purpose===p.purpose);
  const rejected=input.mapping.guides.filter(g=>g.purpose===p.purpose&&mappedServices.get(g.nativeServiceId)===p.serviceId&&withheld.has(g.guideId)).map(g=>({guideId:g.guideId,reason:withheld.get(g.guideId)}));
  if(!existing.length)return {...base,status:rejected.length?'withheld':'mapping_needed',withheld:rejected,candidates:suggestions(p,candidates)};
  const {pairs,truncated}=overlappingPairs(existing);
  const prerequisites=existing.map(g=>({guideId:g.id,requires:g.requires||{},
   questionsNotAutomaticallyAsked:Object.keys(g.requires||{}).filter(k=>!allowedPrerequisites.has(k))}));
  const unconditional=existing.some(g=>!Object.keys(g.requires||{}).length);
  // A conditional mapping can be eligible in some cases only. Even a mapped
  // unconditional guide is not proof that runtime routing works correctly.
  return {...base,status:pairs.length?'potential_ambiguity':unconditional?'mapped':'conditional_mapping',
   guideIds:existing.map(g=>g.id),prerequisites,overlappingPairs:pairs,overlapListTruncated:truncated,withheld:rejected};
 }).sort((a,b)=>priority(a)-priority(b)||a.serviceId.localeCompare(b.serviceId)||a.purpose.localeCompare(b.purpose));
 const counts={};
 for(const row of rows)counts[row.status]=(counts[row.status]||0)+1;
 const serviceSummaries=[...new Set(rows.map(r=>r.serviceId))].map(serviceId=>{
  const states={};for(const row of rows.filter(x=>x.serviceId===serviceId))states[row.status]=(states[row.status]||0)+1;
  return {serviceId,counts:states};
 });
 const unknownPurposes=input.mapping.guides.filter(g=>mappedServices.has(g.nativeServiceId)&&!knownGuidePurpose(mappedServices.get(g.nativeServiceId),g.purpose)).map(g=>({guideId:g.guideId,nativeServiceId:g.nativeServiceId,purpose:g.purpose}));
 const missingNativeReferences=input.mapping.guides.filter(g=>!rawGuides.has(g.guideId)).map(g=>g.guideId);
 return {kind:'metadata_mapping_report',sourceRevision:c.sourceRevision,catalogRevision:c.revision,mappingRevision:c.mappingRevision,
  counts,serviceSummaries,rows,unknownPurposes,missingNativeReferences,withheld:projection.withheld,
  candidateCount:candidates.length,executionValidated:false,published:false};
}
/** Explicit authorization wrapper for use in an existing private staff tool. */
export function createNativeCoverageReviewer({authenticate,mayReviewKnowledge,getInput}={}){
 if(![authenticate,mayReviewKnowledge,getInput].every(f=>typeof f==='function'))fail('COVERAGE_REVIEW_HOOKS_REQUIRED');
 return async function review(credential){
  const actor=await authenticate(credential);
  if(!actor||!['INTERN','MANAGER','SUPER_MANAGER'].includes(actor.role)||actor.active!==true||!id(actor.actorRef)||await mayReviewKnowledge(actor)!==true)fail('FORBIDDEN');
  const input=await getInput(actor);
  const result=auditNativeCoverage(input);
  const latest=await authenticate(credential);
  if(!latest||latest.active!==true||latest.role!==actor.role||latest.actorRef!==actor.actorRef||await mayReviewKnowledge(latest)!==true)fail('FORBIDDEN');
  return result;
 };
}
