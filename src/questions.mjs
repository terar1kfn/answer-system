// Fixed reviewed-question templates. Public generic fixtures, not university policy.
const q=(en,ar,rows)=>({text:{en,ar},options:rows.map(([id,en,ar])=>({id,label:{en,ar}}))});
const unknown=['unknown','Not sure','غير متأكد'];
const yes=['yes','Yes','نعم'],no=['no','No','لا'];
export const QUESTIONS={
 service:q('Which service is affected?','ما الخدمة المتأثرة؟',[
 ['mail','Email / Outlook','البريد الإلكتروني'],['portal','Academic portal','البوابة الأكاديمية'],['attendance','Attendance app','تطبيق الحضور'],['identity','Sign-in verification / Authenticator','التحقق من تسجيل الدخول'],['network','Wi-Fi / internet','الواي فاي / الإنترنت'],['exam','Exam software','برنامج الاختبار'],['other','Something else / not sure','شيء آخر / غير متأكد']]),
 task:q('What exactly is not working?','ما الذي لا يعمل بالتحديد؟',[
 ['login','I cannot sign in','لا أستطيع تسجيل الدخول'],['send','I can sign in but cannot send email','أسجل الدخول ولكن لا أستطيع إرسال البريد'],['receive','I can sign in but cannot receive email','أسجل الدخول ولكن لا أستطيع استقبال البريد'],['app','A feature is not working after I sign in','إحدى الميزات لا تعمل بعد تسجيل الدخول'],unknown]),
 mfa_setup:q('Have you already set up Microsoft Authenticator or another verification method?','هل أعددت Microsoft Authenticator أو طريقة تحقق أخرى مسبقاً؟',[
 ['yes','Yes, already set up','نعم، تم الإعداد'],['no','No, not yet','لا، ليس بعد'],unknown]),
 mfa_access:q('Can you access a previously registered verification method on your own device?','هل تستطيع استخدام طريقة تحقق مسجلة مسبقاً على جهازك؟',[
 ['yes','Yes, I have access','نعم، أستطيع استخدامها'],['no','No, the old phone or method is unavailable','لا، الهاتف القديم أو طريقة التحقق غير متاحة'],unknown]),
 mfa_prompt:q('What happens at the verification step of a sign-in you initiated?','ماذا يحدث في خطوة التحقق من تسجيل دخول بدأته بنفسك؟',[
 ['approved','I approved my own sign-in successfully','وافقت على تسجيل دخولي بنجاح'],['blocked','I cannot complete verification','لا أستطيع إكمال التحقق'],['missing','No approval request appears','لا يظهر طلب الموافقة'],unknown]),
 credentials:q('What does the sign-in screen say? Do not enter your password here.','ماذا تعرض شاشة الدخول؟ لا تكتب كلمة مرورك هنا.',[
 ['rejected','Identifier or password rejected','تم رفض اسم المستخدم أو كلمة المرور'],['locked','Account locked or blocked','الحساب مقفل أو محظور'],['accepted','Credentials accepted; failure happens later','تُقبل بيانات الدخول ثم تحدث المشكلة'],unknown]),
 connection:q('Can you open other websites on the affected device?','هل تستطيع فتح مواقع أخرى على الجهاز المتأثر؟',[yes,no,unknown]),
 peers:q('Are other people nearby experiencing the same connection problem?','هل يعاني أشخاص آخرون بالقرب منك من مشكلة الاتصال نفسها؟',[['yes','Yes, others are affected','نعم، آخرون متأثرون'],['no','No, only my device seems affected','لا، يبدو أنها على جهازي فقط'],unknown]),
 phone:q('Which phone are you using?','ما نوع هاتفك؟',[['ios','iPhone','آيفون'],['android','Android','أندرويد'],unknown]),
 send_error:q('What happens when you try to send?','ماذا يحدث عند محاولة الإرسال؟',[
 ['recipients','Too many recipients / recipient limit','عدد مستلمين كبير أو حد المستلمين'],['restricted','Sender or account restricted','المرسل أو الحساب مقيد'],['address','Recipient address not found','عنوان المستلم غير موجود'],['other','Another error','خطأ آخر'],unknown]),
 receive_scope:q('Are all incoming messages missing, or only some?','هل جميع الرسائل الواردة مفقودة أم بعضها فقط؟',[
 ['all','All','جميع الرسائل'],['some','Some','بعض الرسائل'],unknown]),
 exam_started:q('Has your exam started?','هل بدأ اختبارك؟',[yes,no,unknown]),
 exam_app:q('Which exam app are you using?','ما تطبيق الاختبار؟',[['lockdown','LockDown Browser','LockDown Browser'],['examplify','Examplify','Examplify'],unknown]),
 outcome:q('After following the guidance, does the original task work now?','بعد اتباع الإرشادات، هل تعمل المهمة الأصلية الآن؟',[['yes','Yes, it works','نعم، تعمل الآن'],['no','No, still failing','لا، المشكلة قائمة'],unknown])
};
for(const v of Object.values(QUESTIONS)){Object.freeze(v.text);for(const o of v.options){Object.freeze(o.label);Object.freeze(o);}Object.freeze(v.options);Object.freeze(v);}
Object.freeze(QUESTIONS);
