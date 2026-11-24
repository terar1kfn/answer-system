// All terminal guide purposes must resolve through the reviewed host catalog.
const q=(en,ar,rows)=>({text:{en,ar},options:rows.map(([id,en,ar])=>({id,label:{en,ar}}))});
const unknown=['unknown','Not sure','غير متأكد'];
const rows=(items)=>[...items,unknown];
const definitions={
 portal:{questionId:'portal_issue',title:['What part of the academic portal is failing?','ما الجزء الذي لا يعمل في البوابة الأكاديمية؟'],choices:[
  ['loading','Pages fail to load or display','الصفحات لا تظهر أو لا يتم تحميلها','portal_browser'],
  ['assignment','Assignment upload or submission','رفع الواجب أو تسليمه','portal_submission'],
  ['registration','Course registration or enrollment','التسجيل في المقررات',null],
  ['access','Course or page access denied','الوصول إلى مقرر أو صفحة مرفوض',null],
  ['content','Missing course content','محتوى المقرر غير ظاهر',null]
 ]},
 attendance:{questionId:'attendance_issue',title:['What is failing in the attendance app?','ما المشكلة في تطبيق الحضور؟'],choices:[
  ['scan','QR code or camera scanning','مسح رمز QR أو الكاميرا','attendance_scan'],
  ['permission','Camera or location permission','إذن الكاميرا أو الموقع','attendance_permissions'],
  ['record','Attendance record is wrong or missing','سجل الحضور خاطئ أو مفقود',null],
  ['app','App fails to open or update','التطبيق لا يفتح أو لا يتحدث','attendance_app']
 ]},
 collaboration:{questionId:'meeting_issue',title:['Which meeting feature is affected?','ما الميزة المتأثرة في الاجتماع؟'],choices:[
  ['join','Joining a meeting','الانضمام إلى اجتماع','meeting_join'],
  ['audio','Microphone or speaker','الميكروفون أو السماعة','meeting_audio'],
  ['video','Camera or video','الكاميرا أو الفيديو','meeting_video'],
  ['share','Screen sharing','مشاركة الشاشة','meeting_share'],
  ['recording','Recording or meeting permissions','التسجيل أو أذونات الاجتماع',null]
 ]},
 directory:{questionId:'directory_issue',title:['What are you trying to find?','ما الذي تحاول العثور عليه؟'],choices:[
  ['lookup','Find a professor or official contact','البحث عن أستاذ أو جهة اتصال رسمية','directory_lookup'],
  ['office','Find an office or department','العثور على مكتب أو قسم','directory_lookup'],
  ['incorrect','Incorrect directory information','معلومات الدليل غير صحيحة',null]
 ]},
 printing:{questionId:'printing_issue',title:['What is the printing problem?','ما مشكلة الطباعة؟'],choices:[
  ['setup','Set up or find the printer','إعداد الطابعة أو العثور عليها','printer_setup'],
  ['offline','Printer offline or unavailable','الطابعة غير متصلة أو غير متاحة','printer_offline'],
  ['queued','Print job stuck in queue','مهمة الطباعة عالقة','printer_queue'],
  ['scan','Scan a document','مسح مستند ضوئياً','scanner_setup'],
  ['access','Printing account, payment or permission','حساب الطباعة أو الدفع أو الإذن',null]
 ]},
 software:{questionId:'software_issue',title:['What do you need to do with the software?','ماذا تحتاج إلى فعله بالبرنامج؟'],choices:[
  ['install','Install approved software','تثبيت برنامج معتمد','software_install'],
  ['update','Update the application','تحديث التطبيق','software_update'],
  ['launch','Application fails to open','التطبيق لا يفتح','software_launch'],
  ['license','License or activation problem','مشكلة الترخيص أو التفعيل',null],
  ['permission','Administrator permission required','يتطلب إذن المسؤول',null]
 ]},
 device:{questionId:'device_issue',title:['What is happening on the device?','ما الذي يحدث على الجهاز؟'],choices:[
  ['slow','Slow performance','أداء بطيء','device_performance'],
  ['storage','Low storage or disk full','مساحة التخزين منخفضة أو ممتلئة','device_storage'],
  ['display','Display or external monitor','الشاشة أو شاشة خارجية','device_display'],
  ['audio','Sound or microphone','الصوت أو الميكروفون','device_audio'],
  ['update','Operating system update','تحديث نظام التشغيل','device_update'],
  ['hardware','Physical damage or hardware fault','تلف مادي أو عطل في الجهاز',null]
 ]},
 storage:{questionId:'storage_issue',title:['What is the file or storage issue?','ما مشكلة الملفات أو التخزين؟'],choices:[
  ['sync','Files are not syncing','الملفات لا تتزامن','storage_sync'],
  ['access','Shared file access or permission','الوصول إلى ملف مشترك أو إذن',null],
  ['missing','Missing or deleted file','ملف مفقود أو محذوف',null],
  ['space','Storage quota or available space','حصة التخزين أو المساحة المتاحة','storage_space']
 ]},
 mail:{questionId:'mail_feature',title:['Which email feature is affected?','ما ميزة البريد المتأثرة؟'],choices:[
  ['attachment','Attachment upload or size','رفع المرفق أو حجمه','mail_attachment'],
  ['sync','Mailbox is not syncing','صندوق البريد لا يتزامن','mail_sync'],
  ['calendar','Calendar or meeting invitations','التقويم أو دعوات الاجتماعات','mail_calendar'],
  ['rules','Mailbox rules or forwarding','قواعد البريد أو إعادة التوجيه',null]
 ]}
};
const extras={
 device_os:q('Which operating system is on the affected device?','ما نظام التشغيل على الجهاز المتأثر؟',rows([['windows','Windows','ويندوز'],['macos','macOS','ماك'],['ios','iPhone / iPad','آيفون / آيباد'],['android','Android','أندرويد'],['other','Other','آخر']])),
 browser_scope:q('Does the same page work in another supported browser or on another device?','هل تعمل الصفحة نفسها في متصفح مدعوم آخر أو على جهاز آخر؟',rows([['works','Yes, elsewhere it works','نعم، تعمل في مكان آخر'],['fails','No, the same issue occurs','لا، تحدث المشكلة نفسها'],['not_tried','I have not tried that','لم أجرب']])),
 service_access:q('After sign-in, are other university services accessible?','بعد تسجيل الدخول، هل يمكنك الوصول إلى خدمات جامعية أخرى؟',rows([['one_service','Only this service fails','هذه الخدمة فقط لا تعمل'],['multiple','Several services fail','عدة خدمات لا تعمل'],['not_tried','I have not checked','لم أتحقق']])),
 exam_issue:q('What needs attention before the exam?','ما الذي يحتاج إلى معالجة قبل الاختبار؟',rows([['install','Installation or update','التثبيت أو التحديث'],['launch','App does not open','التطبيق لا يفتح'],['camera','Camera or recording check','فحص الكاميرا أو التسجيل'],['audio','Microphone or sound check','فحص الميكروفون أو الصوت'],['download','Exam download or availability','تنزيل الاختبار أو توفره'],['other','Other preparation issue','مشكلة تحضير أخرى']])),
 network_issue:q('What does the network connection show?','ماذا يظهر اتصال الشبكة؟',rows([['ssid_missing','Network name is missing','اسم الشبكة غير ظاهر'],['auth','Network sign-in fails','تسجيل الدخول إلى الشبكة يفشل'],['no_internet','Connected but no internet','متصل ولكن لا يوجد إنترنت'],['slow','Connection is slow or intermittent','الاتصال بطيء أو متقطع']]))
};
for(const d of Object.values(definitions))extras[d.questionId]=q(...d.title,rows(d.choices.map(x=>x.slice(0,3))));
export const EXTRA_QUESTIONS=extras;
export const hasServicePlaybook=service=>Object.hasOwn(definitions,service);
const patterns={
 portal:{loading:['page not loading','blank page','white screen','page loading','الصفحه لا تعمل'],assignment:['assignment upload','submit assignment','assignment submission','رفع الواجب','تسليم الواجب'],registration:['course registration','enrollment','add drop','تسجيل المقررات'],access:['access denied','not enrolled','permission denied','الوصول مرفوض'],content:['course missing','missing course','missing content','المقرر غير ظاهر']},
 attendance:{scan:['qr code','scan qr','camera scan','رمز qr','مسح الرمز'],permission:['location permission','camera permission','اذن الموقع','اذن الكاميرا'],record:['attendance missing','absent incorrectly','attendance record','سجل الحضور'],app:['app crashing','app not opening','التطبيق لا يفتح']},
 collaboration:{join:['join meeting','cannot join','can t join','joining meeting','الانضمام للاجتماع'],audio:['microphone','speaker','no sound','audio','الميكروفون','الصوت'],video:['camera','video','webcam','الكاميرا','الفيديو'],share:['screen share','screen sharing','share screen','مشاركه الشاشه'],recording:['recording','host permission','التسجيل']},
 directory:{lookup:['find my professor','find your professor','find a professor','professor directory','faculty directory','دليل الاساتذه'],office:['office location','office number','مكتب الدكتور','اين الدكتور'],incorrect:['wrong information','incorrect contact','معلومات خاطئه']},
 printing:{setup:['add printer','install printer','find printer','اعداد الطابعه'],offline:['printer offline','printer unavailable','الطابعه غير متصله'],queued:['print queue','stuck printing','queued print','الطباعه عالقه'],scan:['scan document','scanner','مسح مستند'],access:['print balance','print quota','printing permission','رصيد الطباعه']},
 software:{install:['install software','software installation','install office','install application','تثبيت البرامج','تنصيب'],update:['update app','update software','تحديث البرنامج'],launch:['not opening','does not open','crashing','لا يفتح'],license:['software license','software licence','activation key','activation error','ترخيص البرنامج','تفعيل البرنامج'],permission:['admin permission','administrator permission','اذن المسؤول']},
 device:{slow:['slow laptop','slow computer','slow performance','الجهاز بطيء'],storage:['disk full','low storage','no space','مساحه ممتلئه'],display:['external monitor','black screen','display issue','شاشه سوداء'],audio:['no sound','microphone','speaker','الصوت'],update:['windows update','macos update','system update','تحديث النظام'],hardware:['physical damage','broken screen','water damage','تلف مادي']},
 storage:{sync:['not syncing','sync error','file sync','مزامنه الملفات'],access:['shared file access','permission denied','access denied','اذن الوصول'],missing:['deleted file','missing file','file disappeared','ملف مفقود','ملف محذوف'],space:['storage full','storage quota','مساحه التخزين']},
 mail:{attachment:['attachment','file too large','message too large','مرفق','المرفقات'],sync:['not syncing','sync error','مزامنه البريد'],calendar:['calendar','meeting invite','التقويم'],rules:['forwarding rule','mailbox rule','اعاده التوجيه']},
 exam:{install:['install','installation','update','تثبيت','تحديث'],launch:['not opening','does not open','crash','لا يفتح'],camera:['camera','webcam','recording check','كاميرا'],audio:['microphone','audio','ميكروفون'],download:['download exam','exam download','تنزيل الاختبار']},
 network:{ssid_missing:['network name missing','ssid missing','wifi not showing','الواي فاي لا يظهر'],auth:['wifi password','network sign in','network authentication','كلمه مرور الشبكه'],no_internet:['connected no internet','connected but no internet','متصل بدون انترنت'],slow:['slow internet','slow wifi','intermittent connection','النت بطيء']}
};
export function inferServiceIssue(service,text,normalize){
 const entries=patterns[service];if(!entries)return null;
 const whole=' '+text+' ';
 const matches=Object.entries(entries).filter(([,terms])=>terms.some(t=>whole.includes(' '+normalize(t)+' '))).map(([k])=>k);
 if(matches.length!==1)return null;
 return {questionId:definitions[service]?.questionId||(service==='exam'?'exam_issue':'network_issue'),optionId:matches[0]};
}
export function nextServiceDecision(state,{ask,guide,support}){
 const service=state.services.length===1?state.services[0]:null,d=definitions[service];
 if(!d)return support('SERVICE_SPECIFIC_REVIEW');
 const val=k=>state.evidence[k]?.value;
 const choice=val(d.questionId);
 if(!choice)return ask(d.questionId);
 const row=d.choices.find(x=>x[0]===choice);
 if(!row||!row[3])return support(choice==='unknown'?'SERVICE_TASK_UNCLEAR':'SERVICE_PERMISSION_OR_OWNER_REVIEW');
 if((service==='software'||service==='printing')&&!val('device_os'))return ask('device_os');
 if((service==='software'||service==='printing')&&['unknown','other'].includes(val('device_os')))return support('DEVICE_PLATFORM_UNCLEAR');
 if(service==='portal'&&choice==='loading'){
  if(!val('browser_scope'))return ask('browser_scope');
  if(val('browser_scope')==='fails')return support('PORTAL_FAILURE_ACROSS_CLIENTS');
 }
 return guide(service,row[3]);
}
export const PLAYBOOK_GUIDES=Object.freeze(Object.entries(definitions).flatMap(([service,d])=>d.choices.filter(row=>row[3]).map(row=>Object.freeze({serviceId:service,purpose:row[3],title:{en:row[1],ar:row[2]},aliases:patterns[service]?.[row[0]]||[]}))).concat([
 ...['examplify','lockdown'].flatMap(app=>['install','launch','camera','audio','download'].map(issue=>({serviceId:'exam',purpose:app+'_'+issue,title:{en:app+' pre-exam '+issue,ar:'التحضير للاختبار: '+app+' / '+issue},aliases:[]}))),
 {serviceId:'network',purpose:'network_ssid',title:{en:'Network name missing',ar:'اسم الشبكة غير ظاهر'},aliases:patterns.network.ssid_missing},
 {serviceId:'network',purpose:'network_auth',title:{en:'Network sign-in check',ar:'فحص تسجيل الدخول للشبكة'},aliases:patterns.network.auth},
 {serviceId:'network',purpose:'network_slow',title:{en:'Intermittent connectivity check',ar:'فحص الاتصال المتقطع'},aliases:patterns.network.slow}
]));
