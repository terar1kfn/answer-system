// Fixed reviewed-question templates. Public generic fixtures, not university policy.
import {SERVICE_CHOICES} from './service-taxonomy.mjs';
import {EXTRA_QUESTIONS} from './service-playbooks.mjs';
const q=(en,ar,rows)=>({text:{en,ar},options:rows.map(([id,en,ar])=>({id,label:{en,ar}}))});
const unknown=['unknown','Not sure','غير متأكد'];
const yes=['yes','Yes','نعم'],no=['no','No','لا'];
export const QUESTIONS={
 ...EXTRA_QUESTIONS,
 service:q('Which service is affected?','ما الخدمة المتأثرة؟',SERVICE_CHOICES),
 task:q('What exactly is not working?','ما الذي لا يعمل بالتحديد؟',[
 ['login','I cannot sign in','لا أستطيع تسجيل الدخول'],['send','I can sign in but cannot send email','أسجل الدخول ولكن لا أستطيع إرسال البريد'],['receive','I can sign in but cannot receive email','أسجل الدخول ولكن لا أستطيع استقبال البريد'],['app','A feature is not working after I sign in','إحدى الميزات لا تعمل بعد تسجيل الدخول'],unknown]),
 mfa_setup:q('Have you already set up Microsoft Authenticator or another verification method?','هل أعددت Microsoft Authenticator أو طريقة تحقق أخرى مسبقاً؟',[
 ['yes','Yes, already set up','نعم، تم الإعداد'],['no','No, not yet','لا، ليس بعد'],unknown]),
 mfa_access:q('Can you complete sign-in using ANY verification method already registered to your account, on a device you can access? Do not share a code.','هل تستطيع إكمال تسجيل الدخول باستخدام أي طريقة تحقق مسجلة مسبقاً في حسابك على جهاز يمكنك الوصول إليه؟ لا تشارك أي رمز.',[
 ['yes','Yes, at least one registered method is usable','نعم، يمكنني استخدام طريقة مسجلة واحدة على الأقل'],['no','No, none of my registered methods is usable','لا، لا يمكنني استخدام أي طريقة تحقق مسجلة'],unknown]),
 mfa_prompt:q('On your own affected device, what happens when you try to sign in? Do not type your password or verification code here.','ماذا يحدث عند محاولة تسجيل الدخول على جهازك المتأثر؟ لا تكتب كلمة المرور أو رمز التحقق هنا.',[
 ['approved','I approved my own sign-in successfully','وافقت على تسجيل دخولي بنجاح'],['blocked','A verification code or approval is required, but I cannot complete it','يطلب رمز تحقق أو موافقة ولا أستطيع إكمالها'],['missing','I expected an approval request, but none appears','كنت أتوقع طلب موافقة لكنه لا يظهر'],['setup_required','It asks me to install or set up a verification method','يطلب تثبيت أو إعداد طريقة تحقق'],['credential_screen','I am still at the email or password screen','ما زلت في شاشة البريد الإلكتروني أو كلمة المرور'],['unexpected','I did not initiate this sign-in request','لم أبدأ طلب تسجيل الدخول هذا'],['not_tried','I have not tried signing in yet','لم أحاول تسجيل الدخول بعد'],unknown]),
 setup_blocker:q('What prevented the original task from working after the setup guide?','ما الذي منع المهمة الأصلية من العمل بعد اتباع دليل الإعداد؟',[
 ['verification','An existing verification method or code blocks setup','طريقة تحقق مسجلة أو رمز يمنع الإعداد'],['installation','I could not install or open the Authenticator app','لم أتمكن من تثبيت تطبيق المصادقة أو فتحه'],['registration','The new method could not be registered','تعذر تسجيل طريقة التحقق الجديدة'],['setup_done_service_fails','Setup is complete, but my original service still fails','اكتمل الإعداد لكن الخدمة الأصلية ما زالت لا تعمل'],['other','Another problem','مشكلة أخرى'],unknown]),
 credentials:q('What does the sign-in screen say? Do not enter your password here.','ماذا تعرض شاشة الدخول؟ لا تكتب كلمة مرورك هنا.',[
 ['rejected','Identifier or password rejected','تم رفض اسم المستخدم أو كلمة المرور'],['locked','Account locked or blocked','الحساب مقفل أو محظور'],['accepted','Credentials accepted; failure happens later','تُقبل بيانات الدخول ثم تحدث المشكلة'],unknown]),
 connection:q('On the affected personal device, using the same connection that has the problem, can you open another website?','على جهازك الشخصي المتأثر وباستخدام الاتصال نفسه الذي تواجه فيه المشكلة، هل تستطيع فتح موقع آخر؟',[yes,no,unknown]),
 peers:q('Are other people nearby experiencing the same connection problem?','هل يعاني أشخاص آخرون بالقرب منك من مشكلة الاتصال نفسها؟',[['yes','Yes, others are affected','نعم، آخرون متأثرون'],['no','No, only my device seems affected','لا، يبدو أنها على جهازي فقط'],unknown]),
 phone:q('Which phone are you using?','ما نوع هاتفك؟',[['ios','iPhone','آيفون'],['android','Android','أندرويد'],unknown]),
 send_error:q('What happens when you try to send?','ماذا يحدث عند محاولة الإرسال؟',[
 ['recipients','Too many recipients / recipient limit','عدد مستلمين كبير أو حد المستلمين'],['restricted','Sender or account restricted','المرسل أو الحساب مقيد'],['address','Recipient address not found','عنوان المستلم غير موجود'],['size','Message or attachment too large','حجم الرسالة أو المرفق كبير'],['other','Another error','خطأ آخر'],unknown]),
 receive_scope:q('Are all incoming messages missing, or only some?','هل جميع الرسائل الواردة مفقودة أم بعضها فقط؟',[
 ['all','All','جميع الرسائل'],['some','Some','بعض الرسائل'],unknown]),
 exam_started:q('Has your exam started?','هل بدأ اختبارك؟',[yes,no,unknown]),
 exam_app:q('Which exam app are you using?','ما تطبيق الاختبار؟',[['lockdown','LockDown Browser','LockDown Browser'],['examplify','Examplify','Examplify'],unknown]),
 outcome:q('After following the guidance, does the original task work now?','بعد اتباع الإرشادات، هل تعمل المهمة الأصلية الآن؟',[['yes','Yes, it works','نعم، تعمل الآن'],['no','No, still failing','لا، المشكلة قائمة'],unknown])
};
for(const v of Object.values(QUESTIONS)){Object.freeze(v.text);for(const o of v.options){Object.freeze(o.label);Object.freeze(o);}Object.freeze(v.options);Object.freeze(v);}
Object.freeze(QUESTIONS);
