import {randomUUID} from 'node:crypto';
import {createEngine} from '../engine.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
import {sanitizeText} from '../privacy.mjs';
import {prepareReplyAdvice} from '../contextual-reply-advisor.mjs';
import {projectNativeCatalog,nativeGuideReference} from './native-catalog.mjs';
import {reportedAnswers,buildNativeJourney} from './native-journey.mjs';
import {recordKnowledgeGap} from '../analytics.mjs';
import {newGuideLaunch,acceptNativeGuideReturn,mergeGuideReturns,guideContinuationView} from './guide-continuation.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const opaque=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const languageOk=x=>['en','ar'].includes(x);
const routeCodes=new Set(['FEATURE_DISABLED','NATIVE_POLICY','PROTECTED_CONTEXT','NATIVE_EXACT_MATCH','NATIVE_SERVICE_ROUTE','NATIVE_UNAVAILABLE','NATIVE_FALLBACK','SCOPE_CHANGED','CATALOG_CHANGED','INCIDENT_REFRESH_REQUIRED','HOST_CAPACITY','NEW_ISSUE_REQUIRED']);
const native=(reason='NATIVE_FALLBACK')=>({kind:'delegate',reason:routeCodes.has(reason)?reason:'NATIVE_FALLBACK'});
const fields={
 read:[],begin:['expectedVersion','text','language'],respond:['expectedVersion','issueId','questionId','optionId','text'],
 undo:['expectedVersion','issueId'],clear:['expectedVersion','issueId'],set_language:['expectedVersion','issueId','language'],
 open_guide:['expectedVersion','issueId','guideId'],prepare_native_draft:['expectedVersion','issueId'],
 refresh_recovery:['expectedVersion','issueId'],refresh_native_guide:['expectedVersion','issueId']
};
function command(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(fields,input.action)||
 Object.keys(input).some(k=>k!=='action'&&!fields[input.action].includes(k)))fail('INVALID_EMBEDDED_COMMAND');
 return copy(input);
}
function inputText(text){if(typeof text!=='string'||!text.trim()||text.length>500)fail('INVALID_QUERY');return text;}
function sameActor(a,b){return a&&b&&a.role==='STUDENT'&&b.role==='STUDENT'&&a.visitRef===b.visitRef&&a.actorRef===b.actorRef;}
function publicDecision(d){
 if(!d)return native();
 const keys=['kind','questionId','question','reasonCode','policyCode','followUp','title','guideId','factId','sourceRef','answer','serviceId','incidentRef','status'];
 return Object.fromEntries(keys.filter(k=>Object.hasOwn(d,k)).map(k=>[k,copy(d[k])]));
}
/**
 * Embedded mode is for an EXISTING authenticated student support application.
 * Do not install the standalone lab's second ticket, account, timer or publishing
 * system into that application. The native host owns every privileged effect.
 *
 * Required hooks (all trusted server functions):
 * authenticate(credential) -> {role:'STUDENT',actorRef,visitRef,active:true}
 * enabled(actor) -> boolean
 * routeInput({actor,stage,text?,choice?,language,scopeKey?,state?})
 *   -> {kind:'native',reason?} OR {kind:'supplemental',scopeKey}
 * resolvePolicy({actor,scopeKey}) -> policy incl. current permitted exact native
 *   service IDs, diagnostic taxonomy scope, safety/exam context, mapping revision
 * getConfiguration(actor) -> live published configuration (not a seed or client cache)
 * getMapping(actor) -> independently reviewed private mapping. Use
 * createApprovedMappingProvider in an actual native deployment; it rejects
 * draft/obsolete/revoked releases before any guide can be projected.
 * Native routing must screen sensitive/protected topics and preserve existing exact
 * routes before returning supplemental. Raw input is transient and never stored.
 */
export function createEmbeddedAnswerBridge({
 authenticate,enabled=()=>false,routeInput,resolvePolicy,getConfiguration,getMapping,
 isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu,
 getIncidents=()=>[],getExistingRequest,verifyRecoveryCompletion,getNativeGuideReturn=async()=>null,replyAdvisor=null,knowledgeMetrics=null,
 now=()=>Date.now(),newId=()=>randomUUID(),maxVisits=128
}={}){
 if(![authenticate,enabled,routeInput,resolvePolicy,getConfiguration,getMapping,isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu,getIncidents,getExistingRequest,verifyRecoveryCompletion,getNativeGuideReturn,now,newId].every(f=>typeof f==='function')||
 (knowledgeMetrics!==null&&typeof knowledgeMetrics?.record!=='function')||
 (replyAdvisor!==null&&typeof replyAdvisor?.suggest!=='function')||!Number.isSafeInteger(maxVisits)||maxVisits<1||maxVisits>10000)fail('NATIVE_HOST_HOOKS_REQUIRED');
 const rows=new Map(),locks=new Map();
 function newIssueId(){const x=newId();if(!opaque(x)||[...rows.values()].some(r=>r.issue?.id===x))fail('ISSUE_ID_COLLISION');return x;}
 async function authenticateStudent(credential){
  const a=await authenticate(credential);
  if(!a||a.role!=='STUDENT'||a.active!==true||!opaque(a.actorRef)||!opaque(a.visitRef))fail('UNAUTHENTICATED');
  return {role:a.role,actorRef:a.actorRef,visitRef:a.visitRef};
 }
 async function context(actor,scopeKey){
  const policy=await resolvePolicy({actor,scopeKey});
  if(!policy||policy.allowed!==true||!opaque(policy.revision)||!Array.isArray(policy.allowedNativeServiceIds)||!policy.allowedNativeServiceIds.every(opaque)||
  !Array.isArray(policy.diagnosticServices)||!policy.diagnosticServices.length||!policy.diagnosticServices.every(isServiceId)||
  !['started','not-started','unknown'].includes(policy.examStatus)||typeof policy.allowMfaRecovery!=='boolean')return null;
  // Any active or protected/uncertain exam context stays in native routing.
  // An unknown exam status alone is not a reason to block ordinary non-exam help.
  if(policy.protected===true||policy.examStatus==='started')return null;
  const [configuration,mapping]=await Promise.all([getConfiguration(actor),getMapping(actor)]);
  const projection=projectNativeCatalog({configuration,mapping,
   allowedNativeServiceIds:policy.allowedNativeServiceIds,diagnosticServices:policy.diagnosticServices,
   isServiceAvailable,isGuideAvailable,isReviewedGuide,ownsGuide,isEntryMenu});
  const raw=await getIncidents({actor,scopeKey});
  // getIncidents is responsible for exact native service/location authorization.
  // Never promote aggregate reports to confirmed incidents here.
  const incidents=Array.isArray(raw)?raw.filter(i=>i?.authority==='authorized_staff'&&i.status==='confirmed'&&policy.diagnosticServices.includes(i.serviceId)&&
   opaque(i.id)&&Number.isFinite(i.updatedAt)&&Number.isFinite(i.expiresAt)&&i.updatedAt<=now()&&i.expiresAt>now()&&now()-i.updatedAt<=900000):[];
  const pin=JSON.stringify([policy.revision,projection.catalog.revision,policy.allowMfaRecovery,policy.examStatus,policy.allowModelAdvice===true,policy.allowKnowledgeMetrics===true]);
  return {policy,projection,incidents,pin,engine:createEngine({catalog:projection.catalog,incidents,now})};
 }
 function view(row){return {version:row?.version??0,issue:row?.issue?{issueId:row.issue.id,language:row.issue.state.language,
  status:row.issue.state.status,decision:publicDecision(row.issue.state.decision),guideContinuation:guideContinuationView(row.issue),canUndo:row.issue.history.length>0&&row.issue.state.decision.kind!=='safety_referral'}:null};}
 function measureGap(issue,ctx){
  const g=issue?.state?.decision?.knowledgeGap;
  if(knowledgeMetrics&&ctx?.policy.allowKnowledgeMetrics===true&&g&&ctx.policy.diagnosticServices.includes(g.serviceId))
   recordKnowledgeGap(knowledgeMetrics,issue.state,[issue.id,g.serviceId,g.purpose,g.kind].join(':'));
 }
 function current(row,c){
  if(!row||row.version!==c.expectedVersion||!Number.isSafeInteger(c.expectedVersion))fail('STALE_VERSION');
  if(!row.issue||row.issue.id!==c.issueId)fail('STALE_ISSUE');
  return row.issue;
 }
 function save(key,row,issue){const next={version:(row?.version??0)+1,actorRef:row?.actorRef,issue};rows.set(key,next);return next;}
 function clear(key,row,reason){
  // Do not retain abandoned diagnostic evidence, even during rollback.
  const next=row?save(key,row,null):null;
  return {...native(reason),...view(next)};
 }
 function decisionAllowed(state,ctx){
  if(['safety','exam'].includes(state.domain)||state.decision.kind==='safety_referral')return 'PROTECTED_CONTEXT';
  if(state.decision.reasonCode==='DIAGNOSTIC_SCOPE_NOT_ALLOWED'||state.services.some(s=>!ctx.policy.diagnosticServices.includes(s)))return 'NATIVE_UNAVAILABLE';
  if(state.decision.kind==='offer_mfa_recovery'&&!ctx.policy.allowMfaRecovery)return 'NATIVE_POLICY';
  // In embedded mode, the native system owns any factual/free-form answer path.
  if(state.decision.kind==='answer')return 'NATIVE_FALLBACK';
  return null;
 }
 function incidentStillCurrent(issue,ctx){
  const d=issue.state.decision;
  return d.kind!=='incident_notice'||ctx.incidents.some(i=>i.id===d.incidentRef&&i.serviceId===d.serviceId);
 }
 async function dispatch(credential,input){
  const c=command(input),actor=await authenticateStudent(credential),key=actor.visitRef;
  if(locks.has(key))fail('VISIT_BUSY');
  const lock={cancelled:false};locks.set(key,lock);
  let row=rows.get(key);
  if(row&&row.actorRef!==actor.actorRef){locks.delete(key);fail('VISIT_OWNER_MISMATCH');}
  async function live(){
   const fresh=await authenticateStudent(credential);
   if(lock.cancelled||!sameActor(actor,fresh))fail('VISIT_ENDED');
   if(await enabled(fresh)!==true)fail('FEATURE_DISABLED');
   if(lock.cancelled)fail('VISIT_ENDED');
  }
  async function recheck(scopeKey,pin){
   await live();
   const latest=await context(actor,scopeKey);
   await live();
   if(!latest||latest.pin!==pin)fail('CATALOG_CHANGED');
   return latest;
  }
  try{
   if(await enabled(actor)!==true){
    if(lock.cancelled)fail('VISIT_ENDED');return clear(key,row,'FEATURE_DISABLED');
   }
   if(lock.cancelled)fail('VISIT_ENDED');
   if(c.action==='read'&&!row?.issue){await live();return {kind:'state',...view(row)};}
   if(c.action==='begin'){
    if(!Number.isSafeInteger(c.expectedVersion)||c.expectedVersion!==(row?.version??0))fail('STALE_VERSION');
    if(!row&&rows.size>=maxVisits)return {...native('HOST_CAPACITY'),...view(null)};
    if(!languageOk(c.language))fail('INVALID_LANGUAGE');
    const text=inputText(c.text);
    // The host's existing safety and native exact-routing checks happen first.
    const route=await routeInput({actor,stage:'begin',text,language:c.language});
    await live();
    if(route?.kind!=='supplemental'||!opaque(route.scopeKey))return clear(key,row,route?.reason);
    const ctx=await context(actor,route.scopeKey);await live();
    if(!ctx)return clear(key,row,'PROTECTED_CONTEXT');
    const clean=sanitizeText(text);
    if(!clean.text)return clear(key,row,'NATIVE_FALLBACK');
    // Pass original transient text through the engine's single minimization
    // boundary so it can also detect that private input was removed.
    const state=ctx.engine.begin({text,language:c.language});
    const reason=decisionAllowed(state,ctx);if(reason)return clear(key,row,reason);
    const latest=await recheck(route.scopeKey,ctx.pin);
    const issue={id:newIssueId(),scopeKey:route.scopeKey,pin:ctx.pin,state,answers:[],history:[],guideLaunch:null,guideReturns:[],recoveryResumed:false};
    if(!incidentStillCurrent(issue,latest))return clear(key,row,'INCIDENT_REFRESH_REQUIRED');
    row=save(key,row||{version:0,actorRef:actor.actorRef},issue);measureGap(row.issue,latest);return {kind:'state',...view(row)};
   }
   if(!row?.issue)fail('ISSUE_NOT_ACTIVE');
   const issue=c.action==='read'?row.issue:current(row,c);
   const ctx=await context(actor,issue.scopeKey);await live();
   if(!ctx)return clear(key,row,'PROTECTED_CONTEXT');
   if(issue.pin!==ctx.pin)return clear(key,row,'CATALOG_CHANGED');
   if(!incidentStillCurrent(issue,ctx))return clear(key,row,'INCIDENT_REFRESH_REQUIRED');
   const blocked=decisionAllowed(issue.state,ctx);if(blocked)return clear(key,row,blocked);
   if(c.action==='read')return {kind:'state',...view(row)};
   if(c.action==='clear'){row=save(key,row,null);return {kind:'state',...view(row)};}
   if(c.action==='set_language'){
    if(!languageOk(c.language))fail('INVALID_LANGUAGE');
    row=save(key,row,{...issue,state:{...issue.state,language:c.language}});return {kind:'state',...view(row)};
   }
   if(c.action==='open_guide'){
    const d=issue.state.decision;if(d.kind!=='open_guide'||d.guideId!==c.guideId)fail('NATIVE_GUIDE_UNAVAILABLE');
    const latest=await recheck(issue.scopeKey,ctx.pin);
    const reference=nativeGuideReference(latest.projection,d);
    const launch=issue.guideLaunch||newGuideLaunch({launchRef:newId(),reference});
    if(launch.reference.guideId!==reference.guideId||launch.reference.nativeGuideFingerprint!==reference.nativeGuideFingerprint)fail('NATIVE_GUIDE_STALE');
    if(!issue.guideLaunch)row=save(key,row,{...issue,guideLaunch:launch});
    return {kind:'open_native_guide',reference,launchRef:launch.launchRef,...view(row)};
   }
   if(c.action==='refresh_native_guide'){
    const d=issue.state.decision,launch=issue.guideLaunch;
    if(d.kind!=='open_guide'||!launch)fail('NATIVE_GUIDE_NOT_LAUNCHED');
    const previous=(issue.guideReturns||[]).find(r=>r.launchRef===launch.launchRef);
    if(previous)return {kind:'native_guide_returned',...view(row)};
    const receipt=await getNativeGuideReturn({actor,issueId:issue.id,launchRef:launch.launchRef,reference:copy(launch.reference)});
    const latest=await recheck(issue.scopeKey,ctx.pin);
    const reference=nativeGuideReference(latest.projection,d);
    if(reference.nativeGuideFingerprint!==launch.reference.nativeGuideFingerprint)fail('NATIVE_GUIDE_STALE');
    const accepted=acceptNativeGuideReturn(launch,receipt);
    if(!accepted)return {kind:'native_guide_pending',...view(row)};
    const state=latest.engine.observeGuideReturn(issue.state,{expectedTurn:issue.state.turn,observation:accepted});
    row=save(key,row,{...issue,state,guideReturns:mergeGuideReturns(issue.guideReturns,accepted,d.title)});
    return {kind:'native_guide_returned',...view(row)};
   }
   if(c.action==='prepare_native_draft'){
    const d=issue.state.decision;if(!['offer_support','offer_mfa_recovery'].includes(d.kind))fail('NATIVE_DRAFT_NOT_OFFERED');
    const channel=d.kind==='offer_mfa_recovery'?'mfa_recovery':'support';
    // Existing request lookup is separate for ordinary tickets and MFA recovery.
    // Never mint a reference or create a second request.
    const existing=await getExistingRequest({actor,channel,issueId:issue.id});
    const latest=await recheck(issue.scopeKey,ctx.pin);
    if(existing?.status==='recorded'&&opaque(existing.reference))return {kind:'existing_native_request',channel,reference:existing.reference,...view(row)};
    if(existing?.status!=='none')return {kind:'native_request_unconfirmed',channel,...view(row)};
    const journey=buildNativeJourney({state:issue.state,answers:issue.answers,guideReturns:issue.guideReturns,nativeContext:{...latest.policy.journeyContext,examStatus:latest.policy.examStatus}});
    return {kind:'open_native_draft',channel,reasonCode:d.reasonCode,journey,...view(row)};
   }
   if(c.action==='refresh_recovery'){
    if(issue.state.decision.kind!=='offer_mfa_recovery'||!ctx.policy.allowMfaRecovery||issue.recoveryResumed)fail('RECOVERY_NOT_AVAILABLE');
    // Only the native host can establish identity verification and actual
    // recovery completion; a student or an arbitrary "done" checkbox cannot.
    const existing=await getExistingRequest({actor,channel:'mfa_recovery',issueId:issue.id});
    if(existing?.status!=='recorded'||!opaque(existing.reference)){
     await recheck(issue.scopeKey,ctx.pin);return {kind:'recovery_pending',...view(row)};
    }
    const completion=await verifyRecoveryCompletion({actor,issueId:issue.id,reference:existing.reference});
    const latest=await recheck(issue.scopeKey,ctx.pin);
    if(completion?.status!=='completed'||completion.verified!==true||completion.reference!==existing.reference)return {kind:'recovery_pending',...view(row)};
    const state=latest.engine.resumeRecovery(issue.state,{expectedTurn:issue.state.turn});
    const reason=decisionAllowed(state,latest);if(reason)return clear(key,row,reason);
    row=save(key,row,{...issue,state,history:[],guideLaunch:null,recoveryResumed:true});
    return {kind:'state',...view(row)};
   }
   if(c.action==='undo'){
    if(!issue.history.length||issue.state.decision.kind==='safety_referral')fail('UNDO_NOT_AVAILABLE');
    const latest=await recheck(issue.scopeKey,ctx.pin),previous=issue.history[issue.history.length-1];
    const state=latest.engine.reconsider({...previous.state,language:issue.state.language},{nextTurn:issue.state.turn+1});
    const reason=decisionAllowed(state,latest);if(reason)return clear(key,row,reason);
    row=save(key,row,{...issue,state,answers:previous.answers,guideLaunch:null,history:issue.history.slice(0,-1)});
    return {kind:'state',...view(row)};
   }
   if(c.action==='respond'){
    const typed=c.text!==undefined;
    if(typed&&(c.questionId!==undefined||c.optionId!==undefined))fail('AMBIGUOUS_INPUT');
    if(!typed&&(!opaque(c.questionId)||!opaque(c.optionId)))fail('INVALID_ANSWER');
    const text=typed?inputText(c.text):undefined;
    const routed=await routeInput({actor,stage:'respond',scopeKey:issue.scopeKey,language:issue.state.language,
     ...(typed?{text}:{choice:{questionId:c.questionId,optionId:c.optionId}}),state:copy(issue.state)});
    await live();
    if(routed?.kind!=='supplemental')return clear(key,row,routed?.reason);
    if(routed.scopeKey!==issue.scopeKey)return {kind:'clarify',reasonCode:'NEW_ISSUE_REQUIRED',...view(row)};
    const latest=await recheck(issue.scopeKey,ctx.pin);
    let state;
    if(typed){
     const r=latest.engine.respond(issue.state,{expectedTurn:issue.state.turn,text});
     if(r.kind==='clarify'){
      // Only ambiguous ordinary replies may get an optional confirmation hint.
      // Keep the existing question and version. Do not advance engine state.
      const fallback=()=>({kind:'clarify',reasonCode:r.reasonCode,...view(row)});
      if(r.reasonCode!=='FREE_TEXT_NOT_UNAMBIGUOUS'||!replyAdvisor||latest.policy.allowModelAdvice!==true||(issue.adviceCalls||0)>=4)return fallback();
      const prepared=prepareReplyAdvice(issue.state,text);
      if(prepared.status!=='ready')return fallback();
      issue.adviceCalls=(issue.adviceCalls||0)+1; // internal bounded per-issue resource counter
      let proposed;
      try{proposed=await replyAdvisor.suggest({state:copy(issue.state),text});}catch{proposed=null;}
      await recheck(issue.scopeKey,ctx.pin);
      if(proposed?.status!=='suggestion'||proposed.requiresConfirmation!==true||
       proposed.questionId!==prepared.request.questionId||!prepared.request.options.some(o=>o.id===proposed.optionId))return fallback();
      return {kind:'clarify',reasonCode:'CONFIRM_INTERPRETED_REPLY',suggestion:{questionId:proposed.questionId,optionId:proposed.optionId,requiresConfirmation:true},...view(row)};
     }
     state=r.state;
    }else state=latest.engine.advance(issue.state,{expectedTurn:issue.state.turn,questionId:c.questionId,optionId:c.optionId});
    const reason=decisionAllowed(state,latest);if(reason)return clear(key,row,reason);
    const answers=reportedAnswers(issue.state,state);
    row=save(key,row,{...issue,state,guideLaunch:null,answers:[...issue.answers,...answers].slice(-25),
     history:[...issue.history,{state:copy(issue.state),answers:copy(issue.answers)}].slice(-12)});
    measureGap(row.issue,latest);
    return {kind:'state',...view(row)};
   }
   fail('INVALID_EMBEDDED_COMMAND');
  }catch(e){
   if(lock.cancelled||['VISIT_ENDED','UNAUTHENTICATED'].includes(e?.message)){rows.delete(key);throw e;}
   if(['MAPPING_SOURCE_REVISION_CHANGED','MAPPING_SOURCE_CONTENT_CHANGED','APPROVED_MAPPING_UNAVAILABLE'].includes(e?.message)){
    // A publication changed while the private supplemental mapping is stale.
    // Recheck the actor before returning to the existing native workflow.
    const fresh=await authenticateStudent(credential);
    if(lock.cancelled||!sameActor(actor,fresh)){rows.delete(key);fail('VISIT_ENDED');}
    return clear(key,rows.get(key),'CATALOG_CHANGED');
   }
   if(['CATALOG_CHANGED','FEATURE_DISABLED'].includes(e?.message))return clear(key,rows.get(key),e.message);
   throw e;
  }finally{if(locks.get(key)===lock)locks.delete(key);}
 }
 /** Trusted native lifecycle hook: invoke on expiry, sign-out, staff termination,
  * kiosk cleanup or revocation. Not a student command. Never terminate host auth. */
 function forgetVisit(visitRef){const lock=locks.get(visitRef);if(lock)lock.cancelled=true;return rows.delete(visitRef);}
 function clearAll(){for(const lock of locks.values())lock.cancelled=true;rows.clear();}
 return Object.freeze({dispatch,forgetVisit,clearAll});
}
