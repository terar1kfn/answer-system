import {nativeRecordFingerprint as digest} from './native-fingerprint.mjs';
import {isPermittedNativeRisk,isNativeStudentSelfService,isUnreviewedNativeSource} from './native-guide-policy.mjs';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const filled=x=>typeof x==='string'&&Boolean(x.trim());
const fail=code=>{throw Error(code);};
const limits=Object.freeze({guides:5000,questionsPerGuide:200,optionsPerQuestion:100,nodes:2000,edges:10000});
const sorted=(xs,key)=>xs.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
const key=(g,q)=>JSON.stringify([g,q]);
const unique=(xs,id)=>Array.isArray(xs)&&xs.every(x=>x&&validId(x[id]))&&new Set(xs.map(x=>x[id])).size===xs.length;
const clone=x=>JSON.parse(JSON.stringify(x));
/**
 * Inspect the complete reachable native route, including CASE and SOLUTION
 * destinations. Does not launch, edit or return any student procedure text.
 * A release reviewer must explicitly confirm all reachable branches, including
 * intentional SOLUTION jumps, medium risk and native escalation terminals.
 * The original host continues to own every question and authorized action.
 */
export function inspectNativeGuideRoute({configuration,mappingRow,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu}={}){
 if(!configuration||!Number.isSafeInteger(configuration.revision)||configuration.revision<0||
 !unique(configuration.guides,'id')||configuration.guides.length>limits.guides||
 !unique(configuration.services,'id')||configuration.services.length>limits.guides||
 !mappingRow||!validId(mappingRow.guideId)||!validId(mappingRow.nativeServiceId)||
 !['diagnostic','resolution'].includes(mappingRow.entryMode)||
 ![isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu].every(f=>typeof f==='function'))fail('NATIVE_ROUTE_REVIEW_INPUT_REQUIRED');
 const configFingerprint=digest(configuration),sourceRevision=String(configuration.gatewayRevision??configuration.revision);
 const owner=configuration.services.find(s=>s.id===mappingRow.nativeServiceId);
 const all=new Map(configuration.guides.map(g=>[g.id,g]));
 const blockers=new Map(),notes=new Map(),dependencies=new Map(),nodes=new Map(),edges=[];
 const pending=[],queued=new Set(),checked=new Map();
 let truncated=false;
 const finding=(store,code,guideId,questionId=null,optionId=null)=>{
  const row={code,guideId,questionId,optionId};
  store.set(JSON.stringify(row),row);
 };
 const block=(...a)=>finding(blockers,...a),note=(...a)=>finding(notes,...a);
 const root=all.get(mappingRow.guideId);
 if(!owner||owner.active!==true||owner.directSupport===true||isServiceAvailable(owner,configuration)!==true)block('ROUTE_OWNER_UNAVAILABLE',mappingRow.guideId);
 if(!root||root&&digest(root)!==mappingRow.expectedFingerprint)block('ROUTE_ROOT_CHANGED_OR_MISSING',mappingRow.guideId);
 function record(g){
  if(checked.has(g.id))return checked.get(g.id);
  const q=g.diagnosticQuestions;
  const questionsOk=Array.isArray(q)&&q.length<=limits.questionsPerGuide&&unique(q,'id');
  const map=questionsOk?new Map(q.map(x=>[x.id,x])):new Map();
  checked.set(g.id,map);
  dependencies.set(g.id,{guideId:g.id,fingerprint:digest(g),riskLevel:typeof g.riskLevel==='string'?g.riskLevel:'unknown',permissionLevel:typeof g.permissionLevel==='string'?g.permissionLevel:'unknown'});
  if(!questionsOk)block('ROUTE_INVALID_QUESTIONS',g.id);
  if(!owner||g.serviceId&&g.serviceId!==owner.id||owner&&ownsGuide(g,owner,configuration)!==true)block('ROUTE_OWNER_CHANGED',g.id);
  if(g.isEnabled!==true||isGuideAvailable(g,configuration)!==true)block('ROUTE_GUIDE_UNAVAILABLE',g.id);
  if(!isNativeStudentSelfService(g))block('ROUTE_PRIVILEGED_OR_AUDIENCE_RESTRICTED',g.id);
  if(!isPermittedNativeRisk(g))block('ROUTE_HIGH_OR_UNKNOWN_RISK',g.id);
  else if(g.riskLevel==='Medium')note('ROUTE_MEDIUM_RISK_REVIEW',g.id);
  if(isUnreviewedNativeSource(g)||isReviewedGuide(g,configuration)!==true)block('ROUTE_SOURCE_UNREVIEWED',g.id);
  if(isEntryMenu(g,configuration)!==false)block('ROUTE_ENTRY_MENU_NATIVE_ONLY',g.id);
  if(!filled(g.title)||!filled(g.titleAr))block('ROUTE_BILINGUAL_TITLE_INCOMPLETE',g.id);
  return map;
 }
 function enqueue(g,q){
  const k=key(g.id,q);
  if(!queued.has(k)){
   if(queued.size>=limits.nodes){truncated=true;return null;}
   queued.add(k);pending.push({g,q,k});
  }
  return k;
 }
 function entry(g,mode){
  const q=record(g);
  return enqueue(g,mode==='diagnostic'&&q.size?q.keys().next().value:null);
 }
 function edge(from,to,g,q,option,action,targetGuideId=null){
  if(edges.length>=limits.edges){truncated=true;return;}
  edges.push({from,to,guideId:g.id,questionId:q,optionId:option,action,targetGuideId});
 }
 if(root){
  const qs=record(root);
  if(Boolean(qs.size)!==(mappingRow.entryMode==='diagnostic'))block('ROUTE_ROOT_ENTRY_MODE_MISMATCH',root.id);
  entry(root,mappingRow.entryMode);
 }
 for(let cursor=0;cursor<pending.length&&!truncated;cursor++){
  const {g,q,k}=pending[cursor],qs=record(g);
  nodes.set(k,{nodeId:k,guideId:g.id,questionId:q,kind:q===null?'solution':'question'});
  if(q===null){
   const en=g.resolutionSteps,ar=g.resolutionStepsAr;
   if(!Array.isArray(en)||!Array.isArray(ar)||!en.length||en.length!==ar.length||en.length>200||![...en,...ar].every(filled))block('ROUTE_BILINGUAL_STEPS_INCOMPLETE',g.id);
   continue;
  }
  const item=qs.get(q);
  if(!item||!filled(item.text)||!filled(item.textAr)||!unique(item.options,'id')||!item.options.length||item.options.length>limits.optionsPerQuestion){
   block('ROUTE_QUESTION_INCOMPLETE',g.id,q);continue;
  }
  for(const o of item.options){
   if(!filled(o.label)||!filled(o.labelAr)||filled(o.sublabel)!==filled(o.sublabelAr))block('ROUTE_OPTION_BILINGUAL_INCOMPLETE',g.id,q,o.id);
   if(o.entryQuestionId!==undefined&&o.entryQuestionId!==null)block('ROUTE_CUSTOM_ENTRY_NATIVE_ONLY',g.id,q,o.id);
   const next=o.nextStepId;
   if(next==='RESOLVE'||next==='END'){edge(k,enqueue(g,null),g,q,o.id,'solution',g.id);continue;}
   if(next==='ESCALATE'){edge(k,null,g,q,o.id,'native_escalation');note('ROUTE_ESCALATION_REVIEW',g.id,q,o.id);continue;}
   if(next==='BACK'){edge(k,null,g,q,o.id,'native_back');block('ROUTE_HISTORY_DEPENDENT_NATIVE_ONLY',g.id,q,o.id);continue;}
   if(typeof next==='string'&&(next.startsWith('CASE:')||next.startsWith('SOLUTION:'))){
    const id=next.slice(next.indexOf(':')+1),target=all.get(id),solution=next.startsWith('SOLUTION:');
    if(!target){block('ROUTE_TARGET_MISSING',g.id,q,o.id);edge(k,null,g,q,o.id,'missing_target',validId(id)?id:null);continue;}
    if(solution&&target.diagnosticQuestions?.length)note('ROUTE_INTENTIONAL_SOLUTION_JUMP_REVIEW',g.id,q,o.id);
    edge(k,entry(target,solution?'resolution':'diagnostic'),g,q,o.id,solution?'solution_link':'case_link',target.id);
    continue;
   }
   if(qs.has(next)){edge(k,enqueue(g,next),g,q,o.id,'question',g.id);continue;}
   block('ROUTE_UNKNOWN_DESTINATION',g.id,q,o.id);edge(k,null,g,q,o.id,'unknown');
  }
 }
 if(truncated)block('ROUTE_GRAPH_LIMIT',mappingRow.guideId);
 // Kahn traversal of the reachable directed question/solution graph: native
 // BACK is deliberately held rather than modeled as an invented history edge.
 const degrees=new Map([...nodes.keys()].map(k=>[k,0])),outgoing=new Map([...nodes.keys()].map(k=>[k,[]]));
 for(const e of edges)if(e.to!==null&&degrees.has(e.to)&&outgoing.has(e.from)){
  degrees.set(e.to,degrees.get(e.to)+1);outgoing.get(e.from).push(e.to);
 }
 const ready=[...degrees].filter(([,n])=>n===0).map(([k])=>k);let consumed=0;
 for(let i=0;i<ready.length;i++){
  consumed++;
  for(const k of outgoing.get(ready[i])){const n=degrees.get(k)-1;degrees.set(k,n);if(!n)ready.push(k);}
 }
 if(consumed!==nodes.size)block('ROUTE_FORWARD_CYCLE_NATIVE_ONLY',mappingRow.guideId);
 const body={kind:'native_route_dependency_review',schemaVersion:1,sourceRevision,sourceCatalogFingerprint:configFingerprint,
  guideId:mappingRow.guideId,nativeServiceId:mappingRow.nativeServiceId,entryMode:mappingRow.entryMode,
  rowFingerprint:digest(mappingRow),ownerFingerprint:owner?digest(owner):null,
  dependencies:sorted([...dependencies.values()],x=>x.guideId),nodes:sorted([...nodes.values()],x=>x.nodeId),
  edges:sorted(edges,x=>JSON.stringify([x.from,x.optionId,x.action,x.to])),
  blockers:sorted([...blockers.values()],JSON.stringify),reviewNotes:sorted([...notes.values()],JSON.stringify),truncated};
 return {...body,routeFingerprint:digest(body)};
}
/** Release verification is metadata-only. Actual current host activation,
 * exact owner and permissions are checked independently by the caller. */
export function routeReviewMatches({review,configuration,mappingRow}={}){
 if(!review||review.kind!=='native_route_dependency_review'||review.schemaVersion!==1||review.truncated!==false||
 !Array.isArray(review.blockers)||review.blockers.length||
 !Array.isArray(review.dependencies)||!review.dependencies.length||review.dependencies.length>limits.guides||
 !unique(review.dependencies,'guideId')||!Array.isArray(review.nodes)||!review.nodes.length||review.nodes.length>limits.nodes||
 !Array.isArray(review.edges)||review.edges.length>limits.edges||!Array.isArray(review.reviewNotes)||
 review.guideId!==mappingRow?.guideId||review.nativeServiceId!==mappingRow?.nativeServiceId||review.entryMode!==mappingRow?.entryMode||
 review.rowFingerprint!==digest(mappingRow)||review.sourceRevision!==String(configuration.gatewayRevision??configuration.revision)||
 review.sourceCatalogFingerprint!==digest(configuration))return false;
 const {routeFingerprint,...body}=review;
 if(routeFingerprint!==digest(body))return false;
 const owner=configuration.services.find(s=>s.id===mappingRow.nativeServiceId);
 if(!owner||review.ownerFingerprint!==digest(owner))return false;
 const all=new Map(configuration.guides.map(g=>[g.id,g]));
 return review.dependencies.some(d=>d.guideId===mappingRow.guideId&&d.fingerprint===mappingRow.expectedFingerprint)&&
 review.dependencies.every(d=>{const g=all.get(d.guideId);return g&&d.fingerprint===digest(g)&&isPermittedNativeRisk(g)&&isNativeStudentSelfService(g)&&g.isEnabled===true&&!isUnreviewedNativeSource(g);});
}
