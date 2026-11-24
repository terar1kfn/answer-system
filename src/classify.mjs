// Transient lexical classification; no raw query is returned or retained.
import {EXTRA_SERVICE_IDS,matchServices} from './service-taxonomy.mjs';
import {hasServicePlaybook,inferServiceIssue} from './service-playbooks.mjs';
import {recognizeErrors} from './error-intelligence.mjs';
import {sanitizeText} from './privacy.mjs';
import {detectIdentitySignals} from './identity-signals.mjs';
import {normalizePresentation} from './input-language.mjs';
import {isSharedServiceSet} from './shared-access.mjs';
import {reportedAcademicSystems} from './operation-context.mjs';
export function normalize(text){
 return normalizePresentation(text).toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^a-z0-9\u0600-\u06ff.]+/g,' ').replace(/(?<!\d)\.|\.(?!\d)/g,' ').replace(/\s+/g,' ').trim();
}
const has=(t,words)=>words.some(w=>(' '+t+' ').includes(' '+normalize(w)+' '));
function classifyBase(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>500)throw new TypeError('Query must contain 1-500 characters');
 const t=normalize(raw.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,' ').replace(/\b20\d{7,8}\b/g,' ').replace(/\b(?:password|passcode|otp|pin|token|secret)\s*(?:is\s*[:=]?|[:=])\s*(?:"[^"]*"|'[^']*'|\S+)/gi,' '));
 const facts={},services=[];const add=s=>{if(!services.includes(s))services.push(s);};
 const out=domain=>({domain,services,facts});
 if(/\b(?:smoke|burning smell|electric shock|swollen battery|phishing|malware|ransomware|hacked|stolen account)\b|دخان|بطاريه منتفخه|اختراق|تصيد|صدمه كهربائيه/.test(t)){add('other');return out('safety');}
 if(has(t,['examplify','examsoft','lockdown browser','lockdown','exam','quiz','اختبار','الاختبار','امتحان','الامتحان','اكزامبليفاي','لوك داون'])){
  if(has(t,['examplify','examsoft','اكزامبليفاي']))facts.exam_app='examplify';
  if(has(t,['lockdown browser','lockdown','لوك داون']))facts.exam_app=facts.exam_app?'unknown':'lockdown';
  if(/\b(?:during (?:my |the )?exam|exam (?:has )?started|exam in progress|mid exam)\b|اثناء الاختبار|بدا الاختبار|الاختبار جاري/.test(t))facts.exam_started='yes';
  add('exam');return out('exam');
 }
 const mail=has(t,['email','e mail','mail','outlook','reply all','mailbox','ايميل','الايميل','البريد','بريد','اوتلوك']);
 const portal=has(t,['moodle','banner','ors','student portal','academic portal','مودل','موديل','بانر','البوابه']);
 const attendance=has(t,['attendance app','attendance','au connect','تطبيق الحضور','الحضور']);
 const network=has(t,['wi fi','wifi','internet','network','connection','واي فاي','الواي فاي','وايفاي','الوايفاي','النت','انترنت','الانترنت','الشبكه']);
 const mfa=has(t,['authenticator','authintecator','authentcator','mfa','verification','two factor','2fa','المصادقه','التحقق','اوثنتيكيتور']);
 const phoneMention=/\b(?:changed|lost|new|old|replaced|broken) (?:my |the )?(?:old |new )?(?:phone|mobile)\b|\b(?:my )?(?:old|new) phone\b|غيرت (?:تلفوني|هاتفي|جوالي)|هاتف جديد|تلفون جديد|هاتف قديم/.test(t);
 // Merely mentioning a different phone is not evidence of an MFA problem.
 const oldPhone=phoneMention&&mfa;
 const login=has(t,['sign in','signin','login','log in','password','account locked','تسجيل الدخول','الدخول','كلمه المرور','باسورد']);
 const send=has(t,['send','sending','reply all','outgoing','ارسال','ارسل','الرد علي الجميع']);
 const receive=has(t,['receive','receiving','incoming','استقبال','استلم','استقبل']);
 if(mail)add('mail');if(portal)add('portal');if(attendance)add('attendance');if(network)add('network');
 // Identity is a cause domain unless the request explicitly concerns verification.
 if((mfa||oldPhone||login)&&!services.length)add('identity');
 if(mail&&send&&!receive&&!login)facts.task='send';
 if(mail&&receive&&!send&&!login)facts.task='receive';
 // The failed operation outranks a successfully completed operation.
 const failedSend=/\b(?:cannot|can t|cant|unable to|could not|not able to) (?:send|reply)\b|لا استطيع الارسال|ما اقدر ارسل/.test(t);
 const failedReceive=/\b(?:cannot|can t|cant|unable to|could not|not able to) receive\b|لا استطيع استقبال|ما توصلني/.test(t);
 if(mail&&failedSend!==failedReceive)facts.task=failedSend?'send':'receive';
 if(failedSend&&failedReceive)facts.task='unknown';
 if(login&&!send&&!receive)facts.task='login';
 if(/\b(?:550\s+5\.1\.8|5\.1\.8|sender restricted)\b|المرسل مقيد/.test(t)&&!receive){add('mail');facts.task='send';facts.send_error='restricted';}
 if(/\b(?:too many recipients|recipient limit)\b|عدد المستلمين|حد المستلمين/.test(t)&&!receive){add('mail');facts.task='send';facts.send_error='recipients';}
 if(/\brecipient (?:address )?not found\b|عنوان المستلم غير موجود/.test(t)&&!receive){add('mail');facts.task='send';facts.send_error='address';}
 if(oldPhone){facts.recovery_context='phone_change';facts.task||='login';}
 if(mfa&&!facts.task)facts.task='login';
 if(/\b(?:account (?:is )?(?:locked|blocked)|locked account)\b|حسابي مقفل|الحساب مقفل/.test(t)&&facts.task!=='send'&&facts.task!=='receive'){
  if(!services.length)add('identity');facts.task='login';facts.credentials='locked';
 }
 if(mfa&&/\b(?:cannot|can t|cant|unable to) (?:approve|complete verification|enter the code)\b|لا استطيع الموافقه/.test(t))facts.mfa_prompt='blocked';
 if(mfa&&/\b(?:unexpected (?:sign in |approval )?request|did not initiate|didn t initiate)\b|لم ابدا تسجيل الدخول/.test(t)){
  if(!services.length)add('identity');facts.task='login';facts.mfa_prompt='unexpected';
 }
 if(mfa&&!oldPhone&&/^(?:how (?:do|can) i |how to |i (?:want|need) to |please |كيف |اريد |ابغي |بدي )?(?:set up|setup|install|configure|اعداد|اعد|تثبيت|اثبت)(?: |$)|^(?:how|كيف)(?: .*)? (?:set up|install|configure|اعداد|اثبت|تثبيت)(?: |$)/.test(t))facts.setup_requested='yes';
 if(/\b(?:outlook|email) (?:says|shows) sign in\b/.test(t))facts.task='login';
 if(network&&!mail&&!portal&&!attendance&&!mfa&&!oldPhone&&!login)return out('network');
 if(!services.length)return out('unknown');
 if((network||services.some(s=>s!=='mail'&&s!=='identity'))&&(facts.task==='send'||facts.task==='receive'))return {domain:'unknown',services,facts:{}};
 if(facts.task==='unknown')return out('task');
 if(facts.task==='send'||facts.task==='receive')return out('mail');
 if(mfa||oldPhone||facts.task==='login')return out('identity');
 return out('task');
}


export function classify(raw){
 const privacy=sanitizeText(raw),t=normalize(privacy.text),base=classifyBase(privacy.text||'redacted');
 const out=(domain,services,facts)=>({domain,services:[...new Set(services)],facts});
 // Never allow an ordinary service or error match to override protected topics.
 if(base.domain==='safety')return base;
 if(/\b(?:certificate warning|certificate is not trusted|your connection is not private|unexpected approval request|unsolicited sign in request)\b|الاتصال غير خاص|طلب موافقه لم ابدا/.test(t))return out('safety',['other'],{});
 if(base.domain==='exam'){
  const specific=inferServiceIssue('exam',t,normalize);
  if(specific)base.facts[specific.questionId]=specific.optionId;
  return base;
 }
 const signals=detectIdentitySignals(t);
 if(signals.facts.mfa_prompt==='unexpected')return out('safety',['other'],{mfa_prompt:'unexpected'});
 const hints=recognizeErrors(t);
 if(hints.length>1)return out('unknown',[...base.services,...hints.map(x=>x.serviceId)],{error_conflict:'yes'});
 if(hints.length===1){
  const hint=hints[0],facts={...base.facts,error_signature:hint.id};
  const others=[...new Set([...base.services,...matchServices(t,normalize,EXTRA_SERVICE_IDS)])].filter(s=>!['identity','other','network','device'].includes(s));
  if(hint.serviceId==='identity'){
   if(base.domain==='mail'&&['send','receive'].includes(base.facts.task))return out('unknown',['mail','identity'],{error_conflict:'yes'});
   return out('identity',others.length?others:['identity'],{...facts,task:'login'});
  }
  if(others.some(s=>s!=='mail')||base.facts.task==='receive')return out('unknown',[...others,'mail'],{error_conflict:'yes'});
  const mailFacts={...facts,task:'send'};
  if(hint.stage==='recipient_address')mailFacts.send_error='address';
  if(hint.stage==='sender_restricted')mailFacts.send_error='restricted';
  if(hint.stage==='message_size')mailFacts.send_error='size';
  return out('mail',['mail'],mailFacts);
 }
 const extras=matchServices(t,normalize,EXTRA_SERVICE_IDS);
 // A named application outranks a generic "device" or "connection" mention.
 const named=extras.filter(x=>x!=='device');
 let services=[...new Set([...base.services,...(named.length?named:extras)])];
 if(services.length>1&&services.includes('device'))services=services.filter(s=>s!=='device');
 if(named.length&&services.includes('network')&&!/\b(?:wifi|wi fi|internet)\b|واي فاي|النت|انترنت/.test(t))services=services.filter(s=>s!=='network');
 if(named.length&&services.includes('identity')&&base.domain==='identity')services=services.filter(s=>s!=='identity');
 const facts={...base.facts};
 const portalNames=reportedAcademicSystems(t);
 if(services.includes('collaboration')){
  const products=[['zoom',['zoom','زوم','زووم']],['teams',['microsoft teams','teams meeting','مايكروسوفت تيمز','تيمز']]].filter(([,forms])=>has(t,forms));
  if(products.length===1)facts.meeting_product=products[0][0];
 }
 if(services.includes('portal')&&portalNames.length===1)facts.portal_system=portalNames[0];
 if(services.length===1&&services[0]==='portal'&&facts.portal_system==='moodle'&&
  has(t,['moodle app','moodle mobile','تطبيق مودل'])&&has(t,['site address','add site','wrong site','invalid site','عنوان الموقع','اضافه موقع','موقع غير صحيح'])&&
  !signals.facts.mfa_prompt&&!signals.facts.verification_context&&!signals.facts.credentials&&!facts.recovery_context&&!facts.setup_requested){
  return out('specific',services,{...facts,task:'app',portal_issue:'mobile_setup'});
 }
 if(base.domain==='identity'&&facts.task==='login'&&!facts.recovery_context&&!facts.setup_requested&&!signals.facts.mfa_prompt&&!signals.facts.verification_context){
  const forgot=has(t,['forgot my password','forgot password','forgotten password','i don t remember my password','نسيت كلمه المرور','نسيت الباسورد']);
  const change=has(t,['change my password','change password','update my password','تغيير كلمه المرور','اغير كلمه المرور']);
  if(forgot!==change)facts.password_intent=forgot?'forgot':'change';
 }
 if(signals.facts.mfa_setup||signals.facts.verification_context==='conflicting_screen')delete facts.setup_requested;
 // Network credentials are not automatically an MFA problem. Preserve
 // explicitly recognized network-only operations unless identity risk is present.
 if(services.length===1&&services[0]==='network'&&!facts.recovery_context&&!facts.setup_requested&&facts.credentials!=='locked'&&!signals.facts.mfa_prompt&&!signals.facts.verification_context){
  const n=inferServiceIssue('network',t,normalize);
  if(n){delete facts.task;delete facts.credentials;facts[n.questionId]=n.optionId;return out('network',services,facts);}
 }
 if(signals.explicitLogin){
  if(signals.explicitMailFault&&base.domain==='mail')return out('task',['mail'],{});
  Object.assign(facts,signals.facts);
  if(signals.facts.verification_context==='conflicting_screen'){delete facts.mfa_prompt;if(facts.credentials!=='locked')delete facts.credentials;delete facts.setup_requested;}
  delete facts.send_error;delete facts.receive_scope;
  // A verification code is not necessarily an incoming email. Identify the
  // sign-in operation without claiming the method is inaccessible.
  facts.task='login';
  const affected=services.filter(x=>!['other','device'].includes(x));
  return out('identity',affected.length?affected:['identity'],facts);
 }
 if(base.domain==='identity'&&facts.task==='login')return out('identity',services.length?services:['identity'],facts);
 if(services.length===1&&services[0]==='portal'&&portalNames.length>1)return out('shared',services,{});
 if(base.domain==='mail'&&services.every(s=>s==='mail'||s==='identity'))return out('mail',['mail'],facts);
 if(services.length>1&&base.domain!=='identity'){
  // Multiple named university services are not automatically multiple root
  // causes, nor is naming them proof of an institution-wide incident.
  if(isSharedServiceSet(services)&&!facts.error_conflict)return out('shared',services,{});
  return out('unknown',services,{});
 }
 if(services.length===1){
  const service=services[0],specific=inferServiceIssue(service,t,normalize);
  if(specific)facts[specific.questionId]=specific.optionId;
  if(service==='portal'&&facts.portal_issue==='assignment'&&has(t,['turnitin assignment','submit turnitin','واجب turnitin','واجب تيرنتن']))facts.assignment_kind='turnitin';
  if(service==='attendance'&&facts.attendance_issue==='scan'&&has(t,['campus entry qr','gate qr','qr code for campus entry','رمز دخول الحرم']))facts.attendance_qr_task='gate';
  if(service==='attendance'&&facts.attendance_issue==='permission'){
   const kinds=[['location',['location permission','precise location','اذن الموقع']],['camera',['camera permission','اذن الكاميرا']],['bluetooth',['bluetooth permission','اذن البلوتوث']]].filter(([,forms])=>has(t,forms));
   if(kinds.length===1)facts.attendance_permission_kind=kinds[0][0];
  }
  if(service==='network')return out('network',services,facts);
  if(hasServicePlaybook(service)&&(named.includes(service)||service==='device'||specific))return out('specific',services,{...facts,task:'app'});
 }
 return out(base.domain,services,facts);
}
