// Transient lexical classification; no raw query is returned or retained.
export function normalize(text){
 return text.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^a-z0-9\u0600-\u06ff.]+/g,' ').trim();
}
const has=(t,words)=>words.some(w=>(' '+t+' ').includes(' '+normalize(w)+' '));
export function classify(raw){
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
 const oldPhone=/\b(?:changed|lost|new|old|replaced|broken) (?:my |the )?(?:old |new )?(?:phone|mobile)\b|\b(?:my )?(?:old|new) phone\b|غيرت (?:تلفوني|هاتفي|جوالي)|هاتف جديد|تلفون جديد|هاتف قديم/.test(t);
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
 if(mfa&&!oldPhone&&/\b(?:set up|setup|install|configure)\b|اعداد|تثبيت/.test(t))facts.setup_requested='yes';
 if(/\b(?:outlook|email) (?:says|shows) sign in\b/.test(t))facts.task='login';
 if(network&&!mail&&!portal&&!attendance&&!mfa&&!oldPhone&&!login)return out('network');
 if(!services.length)return out('unknown');
 if((network||services.some(s=>s!=='mail'&&s!=='identity'))&&(facts.task==='send'||facts.task==='receive'))return {domain:'unknown',services,facts:{}};
 if(facts.task==='unknown')return out('task');
 if(facts.task==='send'||facts.task==='receive')return out('mail');
 if(mfa||oldPhone||facts.task==='login')return out('identity');
 return out('task');
}
