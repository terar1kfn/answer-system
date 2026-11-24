import {QUESTIONS} from '../questions.mjs';
import {rankHypotheses,summarizeDiagnosticUncertainty} from '../diagnostic-hypotheses.mjs';
import {getErrorSignature} from '../error-intelligence.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
import {eligible} from '../knowledge.mjs';
import {nativeRecordFingerprint as digest} from './native-fingerprint.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const origins=new Set(['student_report','student_text_signal','student_confirmed_context','student_confirmed_error','staff_verified']);
const option=(key,value)=>QUESTIONS[key]?.options?.find(o=>o.id===value);
const knownReason=x=>typeof x==='string'&&/^[A-Z0-9_]{1,100}$/.test(x);
const services=xs=>Array.isArray(xs)?[...new Set(xs.filter(isServiceId))].slice(0,13):[];
const academics=xs=>Array.isArray(xs)?[...new Set(xs.filter(x=>['moodle','banner','ors'].includes(x)))]:[];
const actions={
 confirm_original_task:['Confirm the original task and the currently affected service.','أكد المهمة الأصلية والخدمة المتأثرة حالياً.'],
 inspect_failed_step:['Review the reported blocked step against the exact historical procedure. Do not treat navigation as execution.','راجع الخطوة المتعذرة وفق الإجراء التاريخي المحدد. لا تعتبر التنقل تنفيذاً.'],
 compare_current_screen:['Compare the current screen, application and platform with the approved instructions.','قارن الشاشة والتطبيق والمنصة الحالية بالإرشادات المعتمدة.'],
 review_permission:['Review permissions with the authorized owner. Do not bypass restrictions.','راجع الأذونات مع الجهة المخولة ولا تتجاوز القيود.'],
 verify_current_error:['Confirm the current error in the original operation; do not request passwords or verification codes.','أكد الخطأ الحالي في العملية الأصلية دون طلب كلمات مرور أو رموز تحقق.'],
 verify_access_state:['Use authorized native IT checks to establish the actual access or account state.','استخدم فحوصات الدعم المخولة لتحديد حالة الوصول أو الحساب الفعلية.'],
 review_existing_request:['Check the existing native recovery or support request; do not duplicate it.','تحقق من طلب الاستعادة أو الدعم الأصلي الموجود ولا تكرره.'],
 review_knowledge_gap:['Check current approved guide coverage and applicability. Do not publish or activate a draft.','راجع تغطية الإرشادات المعتمدة ومدى انطباقها ولا تنشر أو تفعل مسودة.'],
 separate_scope:['Separate remaining original tasks and review each affected service.','افصل المهام الأصلية المتبقية وراجع كل خدمة متأثرة.'],
 refresh_historical_guidance:['Check whether the historical procedure is still admitted and unchanged before relying on it.','تحقق من بقاء الإجراء التاريخي معتمداً دون تغيير قبل الاعتماد عليه.'],
 staff_review:['Review the remaining issue using the recorded evidence and authorized tools.','راجع المشكلة المتبقية باستخدام الأدلة والأدوات المخولة.']
};
function action(id){return {id,label:{en:actions[id][0],ar:actions[id][1]}};}
function evidenceRows(state){
 const rows=[];
 for(const [key,e] of Object.entries(state.evidence||{})){
  if(!origins.has(e?.origin))continue;
  const o=option(key,e.value);
  if(!o)continue;
  rows.push({questionId:key,optionId:o.id,question:copy(QUESTIONS[key].text),answer:copy(o.label),provenance:e.origin});
 }
 return rows.slice(0,80);
}
function attemptRow(a,catalog){
 if(!a||!id(a.guideId)||!isServiceId(a.serviceId)||!id(a.purpose)||!['yes','no','unknown'].includes(a.outcome)||!int(a.reportedAtTurn,1,24))return null;
 const fingerprint=hash(a.nativeGuideFingerprint)?a.nativeGuideFingerprint:null;
 const g=catalog.guides.find(x=>x.id===a.guideId&&x.serviceId===a.serviceId&&x.purpose===a.purpose&&x.nativeGuideFingerprint===fingerprint);
 const n=a.navigation;
 const nav=n&&n.guideId===a.guideId&&n.catalogRevision===a.catalogRevision&&n.nativeGuideFingerprint===fingerprint&&
 n.provenance==='host_verified_navigation'&&['root_resolution','unconfirmed'].includes(n.progressScope)&&int(n.totalSteps,1,200)&&int(n.reachedStep,0,n.totalSteps)?
 {scope:n.progressScope,reachedStep:n.reachedStep,totalSteps:n.totalSteps,provenance:'host_verified_navigation',executionVerified:false}:null;
 const followUp=[];
 for(const [k,v] of Object.entries(a.followUp||{})){
  const o=option(k,v);
  if(o)followUp.push({questionId:k,optionId:v,question:copy(QUESTIONS[k].text),answer:copy(o.label)});
  else if(k==='guide_failed_step'&&nav?.scope==='root_resolution'&&/^step_\d{1,2}$/.test(v)&&int(Number(v.slice(5)),1,Math.min(nav.totalSteps,16))){
   const i=Number(v.slice(5));followUp.push({questionId:k,optionId:v,reportedStep:i,question:{en:'Reported blocked step',ar:'الخطوة المتعذرة المبلغ عنها'},answer:{en:'Step '+i,ar:'الخطوة '+i}});
  }
 }
 return {guideId:a.guideId,serviceId:a.serviceId,purpose:a.purpose,guideFingerprint:fingerprint,
  historicalCatalogRevision:id(a.catalogRevision)?a.catalogRevision:null,title:g?copy(g.title):null,
  reportedOutcome:a.outcome,reportedAtTurn:a.reportedAtTurn,provenance:'student_report',
  focus:{services:services(a.focus?.services),portal:academics([a.focus?.portal])[0]??null,meetingProduct:['zoom','teams'].includes(a.focus?.meetingProduct)?a.focus.meetingProduct:null},
  navigation:nav,followUp:followUp.slice(0,16)};
}
function suggestedActions(state,attempts,error){
 const set=new Set(['confirm_original_task']);
 if(state.sharedProgress)set.add('separate_scope');
 if(attempts.some(a=>a.followUp.some(f=>['guide_blocker','guide_failed_step','guide_failure_point'].includes(f.questionId))))set.add('inspect_failed_step');
 if(attempts.some(a=>a.followUp.some(f=>f.questionId==='guide_blocker'&&f.optionId==='missing_option')))set.add('compare_current_screen');
 const reason=state.decision.reasonCode;
 if(attempts.some(a=>a.followUp.some(f=>f.questionId==='guide_blocker'&&['permission','unsafe'].includes(f.optionId)))||/PERMISSION|OWNER_REVIEW|POLICY|SAFETY/.test(reason))set.add('review_permission');
 if(error||/STEP_ERROR/.test(reason))set.add('verify_current_error');
 if(state.domain==='identity'||/ACCOUNT|SIGNIN|MFA|ACCESS/.test(reason))set.add('verify_access_state');
 if(state.decision.kind==='offer_mfa_recovery')set.add('review_existing_request');
 if(state.decision.knowledgeGap||/APPROVED_GUIDE|APPLICABILITY|CANDIDATE_LIMIT/.test(reason))set.add('review_knowledge_gap');
 set.add('staff_review');return [...set].map(action);
}
/** Trusted native host capture only after verifying an existing authorized
 * native case and the current visit. No raw transcripts, student identity,
 * attachments, credentials, free-form model output or native procedure body. */
export function buildInternDiagnosticSnapshot({caseRef,state,catalog}={}){
 if(!id(caseRef)||!state||!catalog||state.catalogRevision!==catalog.revision||!id(state.ruleVersion)||!id(catalog.revision)||
 !id(catalog.sourceRevision)||!['en','ar'].includes(state.language)||!int(state.turn,0,24)||
 !['offer_support','offer_mfa_recovery'].includes(state.decision?.kind)||!knownReason(state.decision.reasonCode)||
 ['safety','exam'].includes(state.domain))fail('DIAGNOSTIC_CAPTURE_NOT_ALLOWED');
 const attempts=(state.guideAttempts||[]).slice(-12).map(a=>attemptRow(a,catalog)).filter(Boolean);
 const error=getErrorSignature(state.evidence?.error_signature?.value);
 const candidates=rankHypotheses(state);
 const uncertainty=summarizeDiagnosticUncertainty(state,candidates);
 const evidence=evidenceRows(state);
 const body={kind:'private_native_diagnostic_snapshot',schemaVersion:1,caseRef,language:state.language,
  ruleVersion:state.ruleVersion,catalogRevision:catalog.revision,sourceRevision:catalog.sourceRevision,turn:state.turn,
  scope:{originalServices:services(state.sharedProgress?.originalServices||state.services),currentServices:services(state.services),
   originalAcademicSystems:academics(state.sharedProgress?.originalAcademicSystems||state.reportedAcademicSystems),
   currentAcademicSystem:academics([state.evidence?.portal_system?.value])[0]??null},
  handoff:{kind:state.decision.kind,reasonCode:state.decision.reasonCode},
  evidence,knownError:error?{signatureId:error.id,code:error.code,stage:error.stage,sourceRef:error.sourceRef,provenance:state.evidence.error_signature.origin}:null,
  hypotheses:candidates.slice(0,10).map(h=>({causeId:h.causeId,status:h.status,relativeScore:h.relativeScore,
   supportingKeys:h.evidenceKeys.filter(k=>evidence.some(e=>e.questionId===k)||k==='error_signature'&&error),
   contradictingKeys:h.contradictingEvidenceKeys.filter(k=>evidence.some(e=>e.questionId===k))})),
  uncertainty:{level:state.conflictingObservations?.length?'conflicting_observations':uncertainty.level,
   leadingCause:state.conflictingObservations?.length?null:uncertainty.leadingCause,competingCauses:uncertainty.competingCauses,verifiedRootCause:false},
  attempts,
  transitions:(state.resolutionTransitions||[]).slice(-2).filter(t=>knownReason(t.reason)&&int(t.turn,1,24)&&id(t.priorGuideId)).map(t=>({reason:t.reason,turn:t.turn,priorGuideId:t.priorGuideId,focus:services(t.focus)})),
  recommendedReviews:suggestedActions(state,attempts,error),automaticActions:false,verifiedRootCause:false};
 return {...body,snapshotFingerprint:digest(body)};
}
function validSnapshot(s,caseRef){
 if(!s||s.kind!=='private_native_diagnostic_snapshot'||s.schemaVersion!==1||s.caseRef!==caseRef||!hash(s.snapshotFingerprint)||
 s.automaticActions!==false||s.verifiedRootCause!==false||!Array.isArray(s.attempts)||s.attempts.length>12||
 !Array.isArray(s.evidence)||s.evidence.length>80||!Array.isArray(s.recommendedReviews)||s.recommendedReviews.length>12)return false;
 const {snapshotFingerprint,...body}=s;return snapshotFingerprint===digest(body);
}
/** Native staff endpoint adapter. A content hash is not authorization.
 * Host hooks verify case assignment/scope, authentic saved snapshot and
 * current permitted catalog. Recheck after asynchronous reads. */
export function createInternDiagnosticReviewer({authenticate,mayReadCase,loadCaseSnapshot,verifyCaseSnapshot,getCurrentCatalog}={}){
 if(![authenticate,mayReadCase,loadCaseSnapshot,verifyCaseSnapshot,getCurrentCatalog].every(f=>typeof f==='function'))fail('INTERN_DIAGNOSTIC_HOOKS_REQUIRED');
 async function actor(credential,caseRef){
  const a=await authenticate(credential);
  if(!a||a.active!==true||!['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)||!id(a.actorRef)||await mayReadCase({actor:a,caseRef})!==true)fail('FORBIDDEN');
  return a;
 }
 return async function review(credential,{caseRef}={}){
  if(!id(caseRef))fail('INVALID_CASE_REFERENCE');
  const a=await actor(credential,caseRef);
  const raw=await loadCaseSnapshot({actor:a,caseRef});
  if(!raw)return {kind:'diagnostic_snapshot_unavailable'};
  const s=copy(raw);
  if(!validSnapshot(s,caseRef)||await verifyCaseSnapshot({actor:a,caseRef,snapshot:copy(s)})!==true)fail('DIAGNOSTIC_SNAPSHOT_UNVERIFIED');
  const latest=await actor(credential,caseRef);
  if(latest.role!==a.role||latest.actorRef!==a.actorRef)fail('FORBIDDEN');
  const catalog=await getCurrentCatalog({actor:latest,caseRef});
  const fresh=await loadCaseSnapshot({actor:latest,caseRef});
  if(!validSnapshot(fresh,caseRef)||fresh.snapshotFingerprint!==s.snapshotFingerprint)fail('DIAGNOSTIC_SNAPSHOT_CHANGED');
  const end=await actor(credential,caseRef);
  if(end.role!==a.role||end.actorRef!==a.actorRef||await verifyCaseSnapshot({actor:end,caseRef,snapshot:copy(s)})!==true)fail('FORBIDDEN');
  const current=await getCurrentCatalog({actor:end,caseRef});
  if(current?.revision!==catalog?.revision||current&&catalog&&digest(current)!==digest(catalog))fail('DIAGNOSTIC_CATALOG_CHANGED');
  const attempts=s.attempts.map(r=>({...r,currentGuideStatus:!current?'unavailable':hash(r.guideFingerprint)&&current.guides?.some(g=>g.id===r.guideId&&g.serviceId===r.serviceId&&g.purpose===r.purpose&&g.nativeGuideFingerprint===r.guideFingerprint&&eligible(g,{catalog:current}))?'current_exact_match':'historical_or_out_of_scope'}));
  const reviews=[...s.recommendedReviews];
  if(attempts.some(a=>a.currentGuideStatus!=='current_exact_match'))reviews.push(action('refresh_historical_guidance'));
  return {kind:'private_intern_diagnostic_report',snapshotFingerprint:s.snapshotFingerprint,sourceRevision:s.sourceRevision,
   currentSourceRevision:current?.sourceRevision??null,scope:s.scope,handoff:s.handoff,evidence:s.evidence,knownError:s.knownError,
   hypotheses:s.hypotheses,uncertainty:s.uncertainty,attempts,transitions:s.transitions,recommendedReviews:reviews,
   automaticActions:false,verifiedRootCause:false};
 };
}
