/** Shared local-model concurrency boundary. No queue or automatic retry.
 * The lease belongs to the actual invocation, NOT the caller's wait. A
 * timed-out or cancelled provider that ignores abort retains its lease until
 * it settles. The host must recover a genuinely hung local worker separately. */
export function createAdviceCoordinator({maxConcurrent=1}={}){
 if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8)throw Error('INVALID_ADVICE_CONCURRENCY');
 let active=0;
 async function run(task,{signal,timeoutMs=12000}={}){
  if(typeof task!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000||
   signal!==undefined&&(!signal||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))throw Error('INVALID_ADVICE_TASK');
  if(signal?.aborted)return {status:'cancelled'};
  if(active>=maxConcurrent)return {status:'busy'};
  active++;
  const controller=new AbortController();
  let timer,onAbort;
  const stopped=new Promise(resolve=>{
   onAbort=()=>{resolve({status:'cancelled'});controller.abort();};
   signal?.addEventListener('abort',onAbort,{once:true});
   timer=setTimeout(()=>{resolve({status:'timeout'});controller.abort();},timeoutMs);
  });
  const work=Promise.resolve().then(async()=>{
   if(controller.signal.aborted)return {status:'cancelled'};
   try{return {status:'completed',value:await task({signal:controller.signal})};}
   catch{return {status:'unavailable'};}
  }).finally(()=>{active--;});
  try{return await Promise.race([work,stopped]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
 }
 return Object.freeze({run,stats:()=>({active,maxConcurrent})});
}
