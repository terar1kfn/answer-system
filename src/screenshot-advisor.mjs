import {Buffer} from 'node:buffer';
import {QUESTIONS} from './questions.mjs';
import {ERROR_SIGNATURES,getErrorSignature} from './error-intelligence.mjs';
import {isServiceId} from './service-taxonomy.mjs';

const safeServices=new Set(['mail','portal','attendance','network','collaboration','storage','printing','software','device','directory']);
const ordinary=new Set(['unknown','specific','task','network','mail']);
const visualOptions={
 service:[...safeServices],
 meeting_product:['zoom','teams'],meeting_client:['desktop','mobile','web'],
 meeting_issue:['join','audio','video','share'],
 portal_system:['moodle','banner','ors'],
 portal_issue:['loading','assignment','mobile_setup','request_create','request_status'],
 mail_client:['new_windows','classic_windows','mac','ios','android','web'],
 mail_feature:['attachment','sync','calendar'],
 device_os:['windows','macos','ios','android'],phone:['ios','android'],
 network_issue:['no_internet'],printing_issue:['offline','queued'],
 software_issue:['install','update','launch'],storage_issue:['sync','space'],
 device_issue:['storage','display','audio','update']
};
const blockedKeys=['error_signature','error_conflict','mfa_prompt','mfa_access','mfa_recovery','recovery_context','verification_context','credentials','password_intent','setup_requested'];
const bounded=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const shape=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
export const MAX_SCREENSHOT_BYTES=2*1024*1024;
export const isScreenshotRef=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,160}$/.test(v);

/** Accept only a fresh, host-decoded, redacted, re-encoded RGB/RGBA PNG.
 * This structural check is NOT a decoder, privacy detector or CRC validator.
 * The native host must validate pixels and strip metadata before calling it.
 * Reject ancillary chunks, animated frames, oversized dimensions and trailers. */
export function normalizedScreenshotPng(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<57||bytes.byteLength>MAX_SCREENSHOT_BYTES)throw Error('SCREENSHOT_SIZE_OR_FORMAT');
 const png=Buffer.from(bytes);
 if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('SCREENSHOT_FORMAT');
 let pos=8,header=false,data=false,end=false,chunks=0;
 while(pos<png.length){
  if(++chunks>256||png.length-pos<12)throw Error('SCREENSHOT_FORMAT');
  const len=png.readUInt32BE(pos),type=png.toString('latin1',pos+4,pos+8),start=pos+8;
  if(len>png.length-pos-12)throw Error('SCREENSHOT_FORMAT');
  if(!header){
   if(type!=='IHDR'||len!==13)throw Error('SCREENSHOT_FORMAT');
   const w=png.readUInt32BE(start),h=png.readUInt32BE(start+4);
   if(w<1||h<1||w>2048||h>2048||w*h>4000000||png[start+8]!==8||
    ![2,6].includes(png[start+9])||png[start+10]!==0||png[start+11]!==0||png[start+12]!==0)throw Error('SCREENSHOT_DIMENSIONS_OR_ENCODING');
   header=true;
  }else if(type==='IDAT'){
   if(end||!len)throw Error('SCREENSHOT_FORMAT');data=true;
  }else if(type==='IEND'){
   if(!data||len!==0||pos+12!==png.length)throw Error('SCREENSHOT_FORMAT');end=true;
  }else throw Error('SCREENSHOT_METADATA_OR_FORMAT');
  pos+=len+12;
 }
 if(!header||!data||!end)throw Error('SCREENSHOT_FORMAT');
 return png;
}

function safeState(state){
 return state&&ordinary.has(state.domain)&&['en','ar'].includes(state.language)&&Array.isArray(state.services)&&
  state.services.length<=1&&state.services.every(s=>isServiceId(s)&&safeServices.has(s))&&
  !state.pendingError&&!state.pendingContext&&!state.sharedProgress&&!state.conflictingObservations?.length&&
  !state.reviewedFactId&&!state.reviewedFactIds?.length&&!state.knowledgeChoices?.length&&!state.reviewedFactConflict&&!state.compositeAnswerGap&&
  !blockedKeys.some(k=>Object.hasOwn(state.evidence||{},k));
}
/** Only current ordinary fixed questions. No inferred permission, account state,
 * outcome, scope across devices, troubleshooting execution or root cause. */
export function prepareScreenshotAdvice(state){
 if(!safeState(state)||state.decision?.kind!=='ask')return {status:'not_applicable'};
 const d=state.decision,q=QUESTIONS[d.questionId],permitted=visualOptions[d.questionId]||[];
 if(!q||Object.hasOwn(state.evidence||{},d.questionId)||!bounded(q.text?.[state.language],500))return {status:'not_applicable'};
 const options=(d.question?.options||[]).filter(o=>permitted.includes(o.id)&&q.options.some(x=>x.id===o.id))
  .map(o=>({id:o.id,label:q.options.find(x=>x.id===o.id).label[state.language]}));
 // Only ordinary documented mail delivery codes. Identity/security/exam codes
 // stay with native routing. Do not treat a model's reading as verified OCR.
 const errors=state.services.length===1&&state.services[0]==='mail'&&(permitted.length||d.questionId==='task')?
  ERROR_SIGNATURES.filter(e=>e.serviceId==='mail').map(e=>({id:e.id,code:e.code})):[];
 if(!options.length&&!errors.length)return {status:'not_applicable'};
 return {status:'ready',request:{language:state.language,services:[...state.services],questionId:d.questionId,question:q.text[state.language],options,errors}};
}
/** Validate the entire model response against exact current IDs. No model prose,
 * confidence number, arbitrary OCR, screen coordinates or generated fix exits. */
export function validateScreenshotOutput(request,output){
 if(!request||!shape(output,['kind','value'])||typeof output.value!=='string')return {status:'rejected'};
 if(output.kind==='abstain'&&output.value==='')return {status:'abstained'};
 if(output.kind==='option'&&request.options.some(o=>o.id===output.value))return {status:'suggestion',kind:'option',value:output.value};
 if(output.kind==='known_error'&&request.errors.some(e=>e.id===output.value)&&getErrorSignature(output.value)?.serviceId==='mail')return {status:'suggestion',kind:'known_error',value:output.value};
 return {status:'rejected'};
}
/** Revalidate the injected advisor at the native host boundary. */
export function acceptScreenshotAdvice(request,result){
 if(!shape(result,['status','kind','value'])||result.status!=='suggestion')return null;
 const checked=validateScreenshotOutput(request,{kind:result.kind,value:result.value});
 if(checked.status!=='suggestion')return null;
 if(checked.kind==='option')return {suggestion:{questionId:request.questionId,optionId:checked.value,requiresConfirmation:true}};
 const error=getErrorSignature(checked.value);
 return {errorSuggestion:{signatureId:error.id,code:error.code,requiresConfirmation:true}};
}
export function createScreenshotAdvisor({enabled=false,provider,timeoutMs=12000}={}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000||enabled&&typeof provider!=='function')throw Error('INVALID_SCREENSHOT_ADVISOR');
 let busy=false;
 async function suggest({state,png}={}){
  if(!enabled)return {status:'disabled'};
  if(busy)return {status:'busy'};
  const p=prepareScreenshotAdvice(state);if(p.status!=='ready')return {status:p.status};
  let image;
  try{image=normalizedScreenshotPng(png).toString('base64');}catch{return {status:'blocked'};}
  const controller=new AbortController();let timer;
  busy=true;
  const task=Promise.resolve().then(()=>provider({...p.request,image},{signal:controller.signal})).finally(()=>{busy=false;});
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);});
  try{const result=await Promise.race([task,timeout]);return result===null?{status:'timeout'}:validateScreenshotOutput(p.request,result);}
  catch{return {status:'unavailable'};}finally{clearTimeout(timer);}
 }
 return Object.freeze({suggest});
}
