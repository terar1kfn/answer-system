import {normalize} from './classify.mjs';
import {readInitialObservations} from './observation-intake.mjs';
const ALLOWED={
 identity:new Set(['mfa_setup','mfa_prompt','credentials','connection','peers','service_access']),
 network:new Set(['connection','peers']),
 mail:new Set(['mail_client_scope']),
 specific:new Set(['connection','service_access'])
};
/**
 * Reconcile independently reported, exact observations with the classifier.
 * Never remove protected-context detection, infer "yes" from silence, or accept
 * a private/account action based on a compound phrase.
 */
export function reconcileInitialContext({text,classification,classify}){
 const original=classification;
 if(!original||['safety','exam','unknown'].includes(original.domain)||typeof classify!=='function')return {...original,conflicts:[]};
 const {observations,remaining}=readInitialObservations(text);
 let base=original;
 if(remaining&&remaining!==text){
  const primary=classify(remaining);
  // A contextual statement that websites work is not a separate Wi-Fi fault.
  // Retain the complete classifier result for genuine multi-service or
  // protected/identity conflicts; reduce only an extra generic network mention.
  if(original.services.includes('network')&&primary.services.length&&primary.services.every(x=>x!=='network'&&original.services.includes(x))&&
   observations.some(o=>o.key==='connection')&&
   (primary.domain===original.domain||original.domain==='shared'&&['task','specific','mail','identity'].includes(primary.domain))&&
   !['safety','exam','unknown'].includes(primary.domain))base={...original,domain:primary.domain,services:primary.services,facts:{...primary.facts}};
 }
 const allowed=ALLOWED[base.domain];
 if(!allowed)return {...base,conflicts:[]};
 const facts={...base.facts},conflicts=[];
 for(const key of allowed){
  const found=observations.filter(o=>o.key===key);
  if(!found.length)continue;
  const values=new Set(found.map(x=>x.value));
  if(Object.hasOwn(facts,key)&&facts[key]!=='unknown')values.add(facts[key]);
  if(values.size>1){delete facts[key];conflicts.push(key);continue;}
  const value=[...values][0];if(value!==undefined)facts[key]=value;
 }
 if(facts.verification_context==='conflicting_screen'){
  // Conflicting stage signals require an explicit latest screen even if an
  // isolated clause resembles a recognized prompt.
  delete facts.mfa_prompt;delete facts.setup_requested;
  if(facts.credentials!=='locked')delete facts.credentials;
 }
 // A current reported screen is more informative than a vague setup request.
 if(conflicts.includes('mfa_prompt')||conflicts.includes('mfa_setup')||Object.hasOwn(facts,'mfa_prompt')||Object.hasOwn(facts,'mfa_setup'))delete facts.setup_requested;
 return {...base,facts,conflicts};
}
