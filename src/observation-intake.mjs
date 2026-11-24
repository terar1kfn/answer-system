import {normalize} from './classify.mjs';
// Exact clauses only. A clause matched here is an explicit student report,
// not a model's inference. None of these phrases alone confirms an account
// state, outage, entitlement or successful resolution.
const phrases={
 mfa_setup:{
  yes:['i have already set up authenticator','authenticator is already set up','i already configured authenticator','انا مفعل المصادقه','تم اعداد تطبيق المصادقه'],
  no:['i have never set up authenticator','authenticator is not set up','i have not configured authenticator','لم اعد تطبيق المصادقه'],
  unknown:['i do not know if authenticator is set up','i don t know if authenticator is set up','لا اعرف هل تم اعداد المصادقه']
 },
 mfa_prompt:{
  approved:['i approved my own sign in','i approved my sign in successfully','i approved my sign in','وافقت علي تسجيل دخولي'],
  blocked:['verification asks for a code i cannot enter','i cannot complete the verification','i cannot complete verification','لا استطيع اكمال التحقق'],
  missing:['no approval notification arrives','i receive no approval notification','لا يصلني اشعار الموافقه'],
  setup_required:['it asks me to set up authenticator','it asks me to register a verification method','يطلب مني اعداد المصادقه'],
  credential_screen:['i am still at the password screen','ما زلت في شاشه كلمه المرور']
 },
 credentials:{
  accepted:['my credentials are accepted','my password is accepted','my password accepted','the password is accepted','password accepted','تم قبول كلمه المرور'],
  rejected:['my credentials are rejected','my password is rejected','my password rejected','password rejected','password incorrect','my password incorrect','تم رفض كلمه المرور'],
  locked:['my account is locked','my account is blocked','account is locked','حسابي مقفل','حسابي محظور']
 },
 connection:{
  yes:['other websites work','other websites work on this device','other websites work on the same connection','the internet works on this device','المواقع الاخري تعمل','الانترنت يعمل علي هذا الجهاز'],
  no:['other websites do not work','other websites do not work on this device','no internet on this device','nothing loads on this device','المواقع الاخري لا تعمل','لا يوجد انترنت علي هذا الجهاز']
 },
 peers:{
  yes:['my friends have the same connection problem','others nearby have the same connection problem','اصدقائي لديهم مشكله الاتصال نفسها'],
  no:['other people nearby can connect','only my device has the connection problem','المشكله في الاتصال علي جهازي فقط']
 },
 service_access:{
  one_service:['only this service fails','other university services work','الخدمات الجامعيه الاخري تعمل'],
  multiple:['several university services fail','other university services also fail','عده خدمات جامعيه لا تعمل']
 },
 mail_client_scope:{
  app_only:['webmail works but the app does not','webmail works but outlook does not','only the mail app fails','بريد الويب يعمل لكن التطبيق لا يعمل'],
  both:['webmail and the app both fail','the same problem occurs in webmail and outlook','المشكله نفسها في بريد الويب والتطبيق']
 }
};
const index=new Map();
for(const [key,values] of Object.entries(phrases))for(const [value,forms] of Object.entries(values))for(const form of forms){
 const n=normalize(form);const list=index.get(n)||[];list.push({key,value});index.set(n,list);
}
export const observationOptions=(questionId,text)=>(index.get(normalize(text).replace(/\.+$/,''))||[]).filter(x=>x.key===questionId).map(x=>x.value);
const CONTEXT={
 identity:new Set(['mfa_setup','mfa_prompt','credentials','connection','peers','service_access']),
 network:new Set(['connection','peers']),
 mail:new Set(['mail_client_scope'])
};
const CURRENT={
 identity:new Set(['mfa_setup','mfa_prompt','credentials','connection','peers','service_access']),
 network:new Set(['connection','peers']),
 mail:new Set(['mail_client_scope','send_scope','receive_scope'])
};
const fillers=new Set(['thanks','thank you','please','شكرا','شكرًا','لو سمحت','من فضلك'].map(normalize));
/**
 * Recognize at most five distinct clauses in a single typed reply. Only the
 * current question and explicitly phrased observations in its domain are
 * eligible. No inferred options, bare yes/no on future questions, overwrites
 * of existing evidence, or multi-answer transitions across issue/guide state.
 * Every non-filler clause must be understood or the whole reply is clarified.
 */
export function readCompoundReply({state,questionId,text,matchCurrent}){
 const allowed=CONTEXT[state?.domain];
 if(!allowed||!CURRENT[state.domain]?.has(questionId)||typeof matchCurrent!=='function')return null;
 const clauses=text.split(/[,\n;!?]+|\s+(?:and|but|however|ولكن|لكن|وكمان)\s+/i).map(x=>x.trim()).filter(Boolean);
 if(clauses.length<2||clauses.length>5)return null;
 const found=new Map();
 let answer=null;
 for(const clause of clauses){
  const n=normalize(clause).replace(/\.+$/,'');if(!n||fillers.has(n))continue;
  const matching=matchCurrent(clause);
  const known=(index.get(n)||[]).filter(x=>allowed.has(x.key));
  if(matching.length>1||known.length>1)return null;
  if(matching.length===1){
   if(answer!==null&&answer!==matching[0])return null;
   answer=matching[0];
   if(known.length&&(known[0].key!==questionId||known[0].value!==answer))return null;
   continue;
  }
  if(known.length!==1||known[0].key===questionId)return null;
  const {key,value}=known[0];
  if(found.has(key)&&found.get(key)!==value)return null;
  const previous=state.evidence[key];
  if(previous&&previous.value!==value)return null;
  if(!previous)found.set(key,value);
 }
 if(answer===null)return null;
 // Avoid treating a compound sign-in reply as proof of a recovery/registration
 // transition. These observations must be gathered by the specific next prompt.
 if(found.get('mfa_prompt')==='blocked'&&found.has('mfa_setup'))return null;
 return {kind:'option',optionId:answer,observations:[...found].map(([key,value])=>({key,value}))};
}


/** The initial symptom may include useful observations as full clauses.
 * Keep unmatched text for routing; only exact recognized clauses may prefill
 * evidence. A single sentence containing a conjunction is tried as a whole
 * before splitting, preserving phrases such as "webmail works but the app does not".
 */
export function readInitialObservations(text){
 if(typeof text!=='string'||!text.trim()||text.length>500)return {observations:[],remaining:''};
 const observations=[],remaining=[];
 function read(clause,maySplit){
  const n=normalize(clause);
  if(!n)return;
  const matches=index.get(n)||[];
  if(matches.length){observations.push(...matches.map(x=>({...x})));return;}
  const parts=maySplit?clause.split(/\s+(?:and|but|however|ولكن|لكن|وكمان)\s+/i).map(x=>x.trim()).filter(Boolean):[];
  if(parts.length>1&&parts.length<=5&&parts.some(p=>index.has(normalize(p)))){for(const part of parts)read(part,false);return;}
  remaining.push(clause.trim());
 }
 const clauses=text.split(/[,;!?]+|\.(?!\d)(?=\s|$)/).map(x=>x.trim()).filter(Boolean);
 if(clauses.length>8)return {observations:[],remaining:text};
 for(const clause of clauses)read(clause,true);
 return {observations:observations.slice(0,16),remaining:remaining.join(', ')};
}
