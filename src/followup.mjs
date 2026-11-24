import {normalize,classify} from './classify.mjs';
import {SERVICES} from './service-taxonomy.mjs';
import {sanitizeText} from './privacy.mjs';
// Free-text follow-ups map only to the current question's allowed options.
// No inferred answer is accepted on an ambiguous or contradictory utterance.
const aliases={
 yes:['yes','y','yeah','yep','correct','نعم','اي','ايوه','صح','اجل'],
 no:['no','n','nope','لا','كلا','مو','مش'],
 unknown:['not sure','i dont know','i don t know','unknown','غير متاكد','ما ادري','لا اعرف','مش عارف','مو متاكد'],
};
const contextual={
 service:{mail:['email','outlook','البريد','ايميل'],portal:['moodle','banner','ors','مودل','بانر'],network:['wifi','wi fi','internet','واي فاي','الواي فاي'],identity:['authenticator','mfa','المصادقه'],attendance:['attendance','au connect','الحضور'],exam:['examplify','lockdown browser','exam','اختبار'],other:['other','something else','شيء اخر']},
 task:{login:['cant log in','can t log in','cannot login','cannot sign in','sign in','login','لا استطيع تسجيل الدخول','ما اقدر ادخل'],send:['cannot send','cant send','can t send','sending email','reply all','لا استطيع الارسال','ما اقدر ارسل'],receive:['cannot receive','cant receive','can t receive','receiving email','لا استطيع استقبال البريد','ما توصلني الرسائل'],app:['feature not working','already signed in','signed in','سجلت الدخول']},
 mfa_setup:{yes:['already set up','i have configured it','configured','تم الاعداد','مفعل'],no:['not set up','not configured','never set it up','not yet','لم اعده','غير مفعل']},
 mfa_access:{yes:['i have access','old phone works','i still have my old phone','الهاتف القديم معي'],no:['old phone is lost','i lost my old phone','no access to old phone','old phone unavailable','ما عندي الهاتف القديم','الهاتف القديم مفقود','غيرت تلفوني']},
 mfa_prompt:{approved:['approved','i approved the request','وافقت علي الطلب'],blocked:['it asks for a code i cannot enter','cannot approve','can t approve','stuck on verification','لا استطيع الموافقه'],missing:['no notification','no request appears','nothing appears','لا يظهر اشعار'],setup_required:['it asks me to set up authenticator','setup required','يطلب اعداد المصادقه'],unexpected:['i did not initiate it','unexpected request','i did not try to sign in','لم ابدا تسجيل الدخول']},
 credentials:{rejected:['wrong password','incorrect password','invalid credentials','password rejected','كلمه المرور غير صحيحه'],locked:['account locked','account blocked','حسابي مقفل','الحساب محظور'],accepted:['password accepted','credentials accepted','تم قبول كلمه المرور']},
 phone:{ios:['iphone','ios','ايفون','اي فون'],android:['android','samsung','huawei','xiaomi','اندرويد','سامسونج','هواوي']},
 connection:{yes:['other websites work','internet works','المواقع الاخري تعمل'],no:['other websites do not work','no internet','nothing loads','لا يوجد انترنت']},
 peers:{yes:['others affected','my friends have the same issue','everyone affected','اصدقائي نفس المشكله'],no:['only my device','others are connected','جهازي فقط']},
 send_error:{recipients:['too many recipients','recipient limit','عدد المستلمين كبير'],restricted:['550 5.1.8','sender restricted','account restricted','المرسل مقيد'],address:['recipient not found','recipient address not found','عنوان المستلم غير موجود']},
 receive_scope:{all:['all messages','all','جميع الرسائل'],some:['some messages','some','بعض الرسائل']},
 exam_started:{yes:['already started','exam has started','بدا الاختبار'],no:['not started','before exam','لم يبدا الاختبار']},
 exam_app:{lockdown:['lockdown browser','lockdown','لوك داون'],examplify:['examplify','examsoft','اكزامبليفاي']},
 outcome:{yes:['it works','it works now','fixed','solved','اشتغل','تم الحل'],no:['still not working','did not work','didn t work','not fixed','ما اشتغل','ما زالت المشكله']}
};
export function interpretFollowup(questionId,text,options){
 if(typeof text!=='string'||!text.trim()||text.length>500)return {kind:'invalid'};
 const clean=sanitizeText(text);
 const signal=classify(clean.text||'redacted');
 if(signal.domain==='safety'||(signal.domain==='exam'&&signal.facts.exam_started==='yes'))return {kind:'safety',policy:signal.domain==='exam'?'EXAM_PROFESSOR_FIRST':'SENSITIVE_OR_DANGEROUS'};
 if(clean.categories.length)return {kind:'clarify',reasonCode:'REMOVE_PRIVATE_INFORMATION'};
 const normalized=normalize(clean.text).replace(/\.+$/,'').trim();
 const matched=options.filter(o=>{
  const serviceTerms=questionId==='service'?(SERVICES.find(s=>s.id===o.id)?.aliases||[]):[];
  const terms=[o.id,o.label.en,o.label.ar,...(aliases[o.id]||[]),...(contextual[questionId]?.[o.id]||[]),...serviceTerms];
  return terms.some(t=>normalize(t).replace(/\.+$/,'').trim()===normalized);
 });
 return matched.length===1?{kind:'option',optionId:matched[0].id}:{kind:'clarify',reasonCode:'FREE_TEXT_NOT_UNAMBIGUOUS'};
}
