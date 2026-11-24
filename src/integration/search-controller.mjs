// Browser-side controller only. The native home layout and assistant remain
// responsible for rendering. No credentials, persistent storage, session timer,
// ticket creation, automatic activity heartbeat, or network URL is introduced.
/**
 * Attach this to a search form immediately before the existing card grid.
 * submitNative is the existing assistant entry point; it receives the original
 * text and optional trusted UI scope, not a simulated diagnosis or new chat.
 * The native assistant decides whether to call the embedded bridge.
 */
export function createHomeSearchController({submitNative,recordActivity,onChange=()=>{}}={}){
 if(![submitNative,recordActivity,onChange].every(f=>typeof f==='function'))throw Error('NATIVE_SEARCH_HOOKS_REQUIRED');
 let generation=0,visitKey=null,pending=false,value='',language='en',controller=null;
 const state=()=>({value,language,pending,available:visitKey!==null});
 const emit=()=>onChange(state());
 function reset(){generation++;controller?.abort();controller=null;value='';pending=false;}
 function bindVisit(key,lang='en'){
  if(!(key===null||typeof key==='string'&&key.length>0)||!['en','ar'].includes(lang))throw Error('INVALID_SEARCH_CONTEXT');
  if(key!==visitKey){reset();visitKey=key;}
  language=lang;emit();
 }
 function input(text){if(typeof text!=='string')throw Error('INVALID_QUERY');value=text.slice(0,500);emit();}
 function setLanguage(lang){if(!['en','ar'].includes(lang))throw Error('INVALID_LANGUAGE');if(lang!==language){generation++;controller?.abort();controller=null;pending=false;language=lang;emit();}}
 async function submit(){
  if(visitKey===null||pending||!value.trim())return {kind:'ignored'};
  const seq=++generation,query=value.trim(),lang=language;
  controller=new AbortController();const signal=controller.signal;
  pending=true;emit();
  try{
   // Record a real deliberate user action only, never a background heartbeat.
   recordActivity();
   await submitNative({text:query,language:lang,signal});
   if(seq!==generation||signal.aborted)return {kind:'stale'};
   value='';return {kind:'submitted'};
  }catch{
   if(seq!==generation||signal.aborted)return {kind:'stale'};
   // Preserve the student's typed query on a failure. No automatic resend.
   return {kind:'unavailable'};
  }finally{if(seq===generation){pending=false;controller=null;emit();}}
 }
 function stop(){generation++;controller?.abort();controller=null;pending=false;emit();}
 function dispose(){reset();visitKey=null;emit();}
 return Object.freeze({bindVisit,input,setLanguage,submit,stop,dispose,state});
}
