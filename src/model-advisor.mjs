import {classify,normalize} from './classify.mjs';
import {sanitizeText} from './privacy.mjs';
const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const BLOCK=/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b20\d{7,8}\b|\b(?:password|passcode|otp|pin|token|secret|api key)\s*(?:is\b|[:=])|\b(?:ignore (?:all |previous |the )?instructions|system prompt|developer message)\b|\d{5,}|كلمه المرور\s*[:=]|رمز التحقق\s*[:=]/i;
/**
 * Optional host-injected advisory inference. Disabled unless explicitly enabled.
 * Never executes a decision, publishes text, or calls a provider itself.
 * It can suggest one allowed option ONLY; a student must explicitly select it.
 * Local inference is the intended integration. Host privacy review is required;
 * pattern detection is best effort, not complete DLP.
 */
export function createModelAdvisor({enabled=false,provider,timeoutMs=1800}={}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<20||timeoutMs>10000||(enabled&&typeof provider!=='function'))throw Error('INVALID_ADVISOR_CONFIG');
 let busy=false;
 async function suggest({questionId,options,text,language='en'}={}){
  if(!enabled)return {status:'disabled'};
  if(busy)return {status:'busy'};
  if(!safeId(questionId)||!Array.isArray(options)||options.length<2||options.length>20||!['en','ar'].includes(language)||typeof text!=='string'||text.length>240||!text.trim())return {status:'invalid'};
  if(options.some(o=>!o||!safeId(o.id)||typeof o.label?.[language]!=='string'||o.label[language].length>180)||new Set(options.map(o=>o.id)).size!==options.length)return {status:'invalid'};
  if(BLOCK.test(text)||BLOCK.test(normalize(text))||sanitizeText(text,{max:240}).categories.length)return {status:'blocked'};
  const c=classify(text);
  if(c.domain==='safety'||c.domain==='exam'||c.facts?.mfa_prompt==='unexpected')return {status:'protected'};
  const allowed=options.map(o=>({id:o.id,label:o.label[language]}));
  const request=Object.freeze({questionId,language,options:allowed,text:text.trim()});
  const controller=typeof AbortController==='function'?new AbortController():null;
  busy=true;
  let timer;
  // Keep the single-flight lock until the provider actually settles, even if
  // it ignores cancellation. This prevents a backlog of timed-out model calls.
  const task=Promise.resolve().then(()=>provider(request,{signal:controller?.signal})).finally(()=>{busy=false;});
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller?.abort();resolve({timedOut:true});},timeoutMs);});
  try{
   const out=await Promise.race([task,timeout]);
   if(out?.timedOut===true)return {status:'timeout'};
   if(!out||typeof out!=='object'||Array.isArray(out)||Object.keys(out).length!==1||!Object.hasOwn(out,'optionId')||!allowed.some(o=>o.id===out.optionId))return {status:'rejected'};
   return {status:'suggestion',optionId:out.optionId,requiresConfirmation:true};
  }catch{return {status:'unavailable'};}
  finally{clearTimeout(timer);}
 }
 return Object.freeze({suggest});
}
