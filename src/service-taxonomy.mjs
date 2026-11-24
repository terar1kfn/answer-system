// Generic public taxonomy; institutions map their own stable IDs privately.
export const SERVICES=Object.freeze([
 {id:'mail',en:'Email / Outlook',ar:'البريد الإلكتروني',aliases:['email','outlook','mailbox','البريد','ايميل']},
 {id:'portal',en:'Academic portals',ar:'البوابات الأكاديمية',aliases:['moodle','banner','ors','academic portal','student portal','مودل','بانر']},
 {id:'attendance',en:'Attendance app',ar:'تطبيق الحضور',aliases:['attendance app','attendance','au connect','الحضور']},
 {id:'identity',en:'Sign-in verification',ar:'التحقق من تسجيل الدخول',aliases:['authenticator','mfa','verification','المصادقه']},
 {id:'network',en:'Wi-Fi / internet',ar:'الواي فاي / الإنترنت',aliases:['wifi','wi fi','internet','network','واي فاي','الواي فاي','النت']},
 {id:'exam',en:'Exam software',ar:'برامج الاختبارات',aliases:['examplify','examsoft','lockdown browser','exam','اختبار']},
 {id:'collaboration',en:'Online meetings',ar:'الاجتماعات عبر الإنترنت',aliases:['zoom','teams meeting','microsoft teams','video meeting','زوم','تيمز']},
 {id:'directory',en:'University directory',ar:'دليل الجامعة',aliases:['find my professor','find your professor','find a professor','professor directory','faculty directory','office location','دليل الاساتذه','مكتب الدكتور','اين الدكتور']},
 {id:'printing',en:'Printing / scanning',ar:'الطباعة والمسح الضوئي',aliases:['printer','printing','print queue','scanner','scan document','طابعه','الطباعه','طباعة','ماسح ضوئي']},
 {id:'software',en:'Software installation',ar:'تثبيت البرامج',aliases:['install software','software installation','software license','software licence','activation key','office installation','install office','install application','تثبيت البرامج','تنصيب','ترخيص البرنامج']},
 {id:'device',en:'Computer / device',ar:'الكمبيوتر أو الجهاز',aliases:['laptop','computer','device','windows pc','macbook','حاسوب','لابتوب','كمبيوتر','الجهاز']},
 {id:'storage',en:'Files / cloud storage',ar:'الملفات والتخزين السحابي',aliases:['onedrive','cloud storage','file sync','shared file','shared folder','ون درايف','التخزين السحابي','مزامنه الملفات']},
 {id:'other',en:'Other / not sure',ar:'شيء آخر / غير متأكد',aliases:['other','something else','شيء اخر']}
].map(s=>Object.freeze({...s,aliases:Object.freeze(s.aliases)})));
export const SERVICE_IDS=Object.freeze(SERVICES.map(s=>s.id));
const ids=new Set(SERVICE_IDS);
export const isServiceId=id=>ids.has(id);
export const SERVICE_CHOICES=Object.freeze(SERVICES.map(s=>Object.freeze([s.id,s.en,s.ar])));
export const EXTRA_SERVICE_IDS=Object.freeze(['collaboration','directory','printing','software','device','storage']);
export function matchServices(text,normalize,subset=SERVICE_IDS){
 const t=' '+text+' ';
 return SERVICES.filter(s=>subset.includes(s.id)&&s.aliases.some(a=>t.includes(' '+normalize(a)+' '))).map(s=>s.id);
}
