import {sanitizeText} from './privacy.mjs';
import {recognizeErrors} from './error-intelligence.mjs';
const ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
/** Pasted or host-extracted error text is transient. Only known codes survive. */
export function inspectErrorText(text,{maxChars=4000}={}){
 if(!Number.isSafeInteger(maxChars)||maxChars<1||maxChars>10000||typeof text!=='string'||!text.trim()||text.length>maxChars)return {status:'invalid',signals:[]};
 const clean=sanitizeText(text,{max:maxChars});
 const canonical=clean.text.replace(/\bAADSTS\s+(\d{5,7})\b/gi,'AADSTS$1').replace(/\b([245])\s*\.\s*(\d{1,3})\s*\.\s*(\d{1,3})\b/g,'$1.$2.$3');
 const signals=recognizeErrors(canonical.slice(0,1000));
 return {status:signals.length===1?'recognized':signals.length>1?'multiple':'unrecognized',signals,privateInformationRemoved:clean.categories.length>0};
}
/**
 * Optional OCR boundary, disabled by default. Only a trusted host provides an
 * opaque approved image reference and authorization. No file upload, image
 * decoding, arbitrary path, URL, storage or external OCR is implemented here.
 */
export function createErrorEvidenceIntake({enabled=false,mayReadImage,extractLocalText,timeoutMs=2500}={}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000||(enabled&&![mayReadImage,extractLocalText].every(f=>typeof f==='function')))throw Error('INVALID_OCR_INTAKE');
 let busy=false;
 async function inspectImage({actor,imageRef}={}){
  if(!enabled)return {status:'disabled',signals:[]};
  if(!ok(imageRef)||!actor||await mayReadImage({actor,imageRef})!==true)return {status:'forbidden',signals:[]};
  if(busy)return {status:'busy',signals:[]};
  busy=true;const controller=new AbortController();let timer;
  const task=Promise.resolve().then(()=>extractLocalText({imageRef,signal:controller.signal,maxChars:4000})).finally(()=>{busy=false;});
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('OCR_TIMEOUT'));},timeoutMs);});
  try{
   const result=await Promise.race([task,timeout]);
   return inspectErrorText(typeof result==='string'?result:result?.text);
  }catch{return {status:'unavailable',signals:[]};}
  finally{clearTimeout(timer);}
 }
 return Object.freeze({inspectImage});
}
