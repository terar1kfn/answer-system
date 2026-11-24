import {normalize,classify} from './classify.mjs';
import {SERVICES} from './service-taxonomy.mjs';
import {sanitizeText} from './privacy.mjs';
import {ANSWER_FORMS} from './input-language.mjs';
import {observationOptions,readCompoundReply} from './observation-intake.mjs';
// Free-text follow-ups map only to the current question's allowed options.
// No inferred answer is accepted on an ambiguous or contradictory utterance.
const aliases={
 yes:['yes','y','yeah','yep','correct','نعم','اي','ايوه','صح','اجل'],
 no:['no','n','nope','لا','كلا','مو','مش'],
 unknown:['not sure','i dont know','i don t know','unknown','غير متاكد','ما ادري','لا اعرف','مش عارف','مو متاكد'],
};
const contextual={
 post_signin_stage:{original_works:['original task works now','everything works now','المهمه الاصليه تعمل الان'],still_blocked:['still cannot enter','still cannot sign in','لا استطيع الدخول بعد'],feature_fails:['i can enter but the feature fails','i can sign in but the feature fails','استطيع الدخول لكن الميزه لا تعمل']},
 academic_failure_scope:{login:['both sign in fails','cannot sign in to both','لا استطيع الدخول للنظامين'],one:['only one','نظام واحد فقط'],different:['different problems','مشاكل مختلفه']},
 retry_portal_scope:{signed_in:['i can enter but it still fails','استطيع الدخول لكن المشكله مستمره'],blocked:['still cannot enter','لا استطيع الدخول بعد'],works:['original task works now','المهمه الاصليه تعمل الان']},
 portal_system:{moodle:['moodle','مودل'],banner:['banner','بانر'],ors:['ors','online request system','نظام الطلبات']},
 assignment_kind:{standard:['standard','standard assignment','واجب عادي'],turnitin:['turnitin','turnitin assignment','تيرنتن'],approved_link:['instructor approved a link','المدرس سمح بالرابط']},
 mail_client:{new_windows:['new outlook','new outlook for windows','اوتلوك الجديد'],classic_windows:['classic outlook','old outlook','اوتلوك الكلاسيكي'],mac:['outlook for mac','mac outlook'],ios:['iphone','ipad','ios'],android:['android'],web:['webmail','outlook web','browser']},
 meeting_client:{desktop:['desktop app','computer app','تطبيق الكمبيوتر'],mobile:['mobile app','phone app','تطبيق الهاتف'],web:['web browser','browser','المتصفح']},
 attendance_qr_task:{gate:['gate qr','campus entry','دخول الحرم'],class:['instructor provided qr','class qr','رمز المدرس']},
 shared_operation:{login:['all have sign in problems','cannot sign in to both','لا استطيع تسجيل الدخول الي الخدمتين'],network:['same connection problem','same device cannot connect','مشكله الاتصال نفسها'],one:['only one service','خدمه واحده فقط'],different:['different problems','مشاكل مختلفه']},
 shared_access_pattern:{same:['same access error','same problem on both','نفس خطا الوصول'],different:['different errors','اخطاء مختلفه'],some_recovered:['one works now','some work now','بعض الخدمات تعمل الان']},
 mail_client_scope:{app_only:['webmail works','only app fails','بريد الويب يعمل'],both:['both fail','both have the same problem','الاثنان لا يعملان'],not_tried:['not checked webmail','لم اتحقق من بريد الويب']},
 send_scope:{one:['one recipient','one address','مستلم واحد'],many:['multiple recipients','only groups','عده مستلمين'],all:['every message','every recipient','كل الرسائل']},
 service:{mail:['email','outlook','البريد','ايميل'],portal:['moodle','banner','ors','مودل','بانر'],network:['wifi','wi fi','internet','واي فاي','الواي فاي'],identity:['authenticator','mfa','المصادقه'],attendance:['attendance','au connect','الحضور'],exam:['examplify','lockdown browser','exam','اختبار'],other:['other','something else','شيء اخر']},
 task:{login:['cant log in','can t log in','cannot login','cannot sign in','sign in','login','لا استطيع تسجيل الدخول','ما اقدر ادخل'],send:['cannot send','cant send','can t send','sending email','reply all','لا استطيع الارسال','ما اقدر ارسل'],receive:['cannot receive','cant receive','can t receive','receiving email','لا استطيع استقبال البريد','ما توصلني الرسائل'],app:['feature not working','already signed in','signed in','سجلت الدخول']},
 mfa_setup:{yes:['already set up','i have configured it','configured','تم الاعداد','مفعل'],no:['not set up','not configured','never set it up','not yet','لم اعده','غير مفعل']},
 mfa_access:{yes:['i have access','old phone works','i still have my old phone','الهاتف القديم معي'],no:['no registered method works','none of my registered methods is usable','no access to any registered verification method','i cannot use any registered method','لا استطيع استخدام اي طريقه تحقق مسجله','ما عندي اي طريقه تحقق اقدر استخدمها']},
 mfa_prompt:{approved:['approved','i approved the request','وافقت علي الطلب'],blocked:['it asks for a code i cannot enter','cannot approve','can t approve','stuck on verification','لا استطيع الموافقه'],missing:['no notification','no request appears','nothing appears','لا يظهر اشعار'],setup_required:['it asks me to set up authenticator','setup required','يطلب اعداد المصادقه'],credential_screen:['still at the password screen','email and password screen','شاشه كلمه المرور'],not_tried:['i have not tried signing in','لم احاول تسجيل الدخول'],unexpected:['i did not initiate it','unexpected request','i did not try to sign in','لم ابدا تسجيل الدخول']},
 setup_blocker:{verification:['verification blocks setup','it asks for an old verification method','التحقق يمنع الاعداد'],installation:['cannot install authenticator','cannot open authenticator','لا استطيع تثبيت التطبيق'],registration:['registration failed','could not register the new method','فشل تسجيل الطريقه الجديده'],setup_done_service_fails:['authenticator is set up but email still fails','setup completed but service still fails','تم الاعداد لكن الخدمه لا تعمل'],other:['another problem','مشكله اخري']},
 credentials:{rejected:['wrong password','incorrect password','invalid credentials','password rejected','كلمه المرور غير صحيحه'],locked:['account locked','account blocked','حسابي مقفل','الحساب محظور'],accepted:['password accepted','credentials accepted','تم قبول كلمه المرور']},
 phone:{ios:['iphone','ios','ايفون','اي فون'],android:['android','samsung','huawei','xiaomi','اندرويد','سامسونج','هواوي']},
 connection:{yes:['other websites work','internet works','المواقع الاخري تعمل'],no:['other websites do not work','no internet','nothing loads','لا يوجد انترنت']},
 peers:{yes:['others affected','my friends have the same issue','everyone affected','اصدقائي نفس المشكله'],no:['only my device','others are connected','جهازي فقط']},
 send_error:{recipients:['too many recipients','recipient limit','عدد المستلمين كبير'],restricted:['550 5.1.8','sender restricted','account restricted','المرسل مقيد'],address:['recipient not found','recipient address not found','عنوان المستلم غير موجود']},
 receive_scope:{all:['all messages','all','جميع الرسائل'],some:['some messages','some','بعض الرسائل']},
 exam_started:{yes:['already started','exam has started','بدا الاختبار'],no:['not started','before exam','لم يبدا الاختبار']},
 exam_app:{lockdown:['lockdown browser','lockdown','لوك داون'],examplify:['examplify','examsoft','اكزامبليفاي']},
 guide_result:{completed_same:['followed all steps','same problem after the guide','اتبعت الخطوات ونفس المشكله'],partial:['partially works','some parts work','تحسن جزء'],blocked:['could not complete a step','stuck on a step','لم استطع اكمال الخطوه'],not_tried:['not tried yet','i did not try it','لم اجرب'],different:['different error now','new error appeared','ظهر خطا جديد']},
 retry_mail_scope:{app_only:['webmail works but app does not','only the app fails','بريد الويب يعمل والتطبيق لا يعمل'],both:['both still fail','both fail','الاثنان لا يعملان'],not_tried:['not compared','لم اقارن']},
 retry_mail_detail:{address:['recipient not found','recipient address not found'],size:['message too large','attachment too large'],recipients:['too many recipients','recipient limit'],restricted:['sender restricted','account restricted']},
 retry_network_peers:{yes:['others still have the same issue','others affected now','الاخرون لديهم المشكله نفسها'],no:['only my device','جهازي فقط']},
 retry_network_scope:{ssid_missing:['network name missing','wifi not showing','اسم الشبكه غير ظاهر'],auth:['network sign in rejected','network authentication fails','رفض تسجيل الدخول للشبكه'],slow:['slow wifi','intermittent connection','الاتصال متقطع'],no_internet:['connected but no internet','متصل بدون انترنت']},
 retry_attendance_detail:{location:['location permission denied','اذن الموقع مرفوض'],camera:['camera permission denied','اذن الكاميرا مرفوض'],bluetooth:['bluetooth permission denied','اذن البلوتوث مرفوض']},
 retry_meeting_scope:{other_apps:['same issue in other apps','other apps also fail','نفس المشكله في التطبيقات الاخري'],only_meeting:['only meeting app','فقط تطبيق الاجتماع'],not_tried:['not checked','لم اتحقق']},
 retry_software_detail:{update_required:['update required','needs an update','يحتاج تحديث']},
 retry_storage_detail:{quota:['storage full','quota exceeded','المساحه ممتلئه']},
 retry_printer_detail:{queue:['printer available but job stuck','job stuck in queue','المهمه عالقه في قائمه الانتظار']},
 outcome:{yes:['it works','it works now','fixed','solved','اشتغل','تم الحل'],no:['still not working','did not work','didn t work','not fixed','ما اشتغل','ما زالت المشكله']}
};
export function interpretFollowup(questionId,text,options,state=null){
 if(typeof text!=='string'||!text.trim()||text.length>500)return {kind:'invalid'};
 const clean=sanitizeText(text);
 const signal=classify(clean.text||'redacted');
 if(signal.domain==='safety'||signal.facts.mfa_prompt==='unexpected'||(signal.domain==='exam'&&signal.facts.exam_started==='yes'))return {kind:'safety',policy:signal.domain==='exam'?'EXAM_PROFESSOR_FIRST':signal.facts.mfa_prompt==='unexpected'?'UNEXPECTED_VERIFICATION_REQUEST':'SENSITIVE_OR_DANGEROUS'};
 if(clean.categories.length)return {kind:'clarify',reasonCode:'REMOVE_PRIVATE_INFORMATION'};
 const matchCurrent=raw=>{
 const normalized=normalize(raw).replace(/\.+$/,'').trim();
 const observed=new Set(observationOptions(questionId,raw));
 return options.filter(o=>{
  const serviceTerms=questionId==='service'?(SERVICES.find(s=>s.id===o.id)?.aliases||[]):[];
  const terms=[o.id,o.label.en,o.label.ar,...(aliases[o.id]||[]),...(ANSWER_FORMS[o.id]||[]),...(contextual[questionId]?.[o.id]||[]),...serviceTerms];
  return observed.has(o.id)||terms.some(t=>normalize(t).replace(/\.+$/,'').trim()===normalized);
 }).map(o=>o.id);
 };
 const matched=matchCurrent(clean.text);
 if(matched.length===1)return {kind:'option',optionId:matched[0]};
 if(matched.length>1)return {kind:'clarify',reasonCode:'CONFLICTING_REPLY'};
 // Do not auto-start a different issue or turn a bare service mention into
 // the answer to an unrelated pending question.
 if(questionId!=='service'&&signal.services.length&&state?.services?.length&&signal.services.every(id=>!state.services.includes(id)&&!['identity','network','device'].includes(id)))return {kind:'clarify',reasonCode:'POSSIBLE_NEW_ISSUE'};
 const compound=readCompoundReply({state,questionId,text:clean.text,matchCurrent});
 return compound||{kind:'clarify',reasonCode:'FREE_TEXT_NOT_UNAMBIGUOUS'};
}
