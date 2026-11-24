import {PLAYBOOK_GUIDES} from './service-playbooks.mjs';
const purpose=(serviceId,purpose,en,ar,aliases=[],priority='standard')=>({serviceId,purpose,title:{en,ar},aliases,priority});
// Inventory of guide purposes used by deterministic rules. These are not
// procedures, institutional policies, guide IDs or approval decisions.
const core=[
 purpose('identity','setup_ios','iPhone verification setup','إعداد التحقق على آيفون',['microsoft authenticator iphone','authenticator ios setup','إعداد المصادقة على آيفون'],'core'),
 purpose('identity','setup_android','Android verification setup','إعداد التحقق على أندرويد',['microsoft authenticator android','authenticator android setup','إعداد المصادقة على أندرويد'],'core'),
 purpose('identity','manage_existing_method','Manage an existing verification method','إدارة طريقة التحقق المسجلة',['change authenticator phone','manage verification methods','تغيير جهاز المصادقة'],'core'),
 purpose('identity','password_change_known','Change a known university password','تغيير كلمة مرور جامعية معروفة',['change known password','تغيير كلمة المرور'],'core'),
 purpose('identity','mfa_notification_check','Missing notification for a self-initiated sign-in','غياب إشعار طلب تسجيل دخول بدأته بنفسك',['authenticator no notification','لا يصلني اشعار المصادقة'],'core'),
 purpose('identity','credential_check','Check sign-in details','فحص بيانات تسجيل الدخول',['incorrect username or password','sign-in credentials','بيانات تسجيل الدخول'],'core'),
 purpose('network','individual_connectivity','Individual device connectivity','اتصال الجهاز الفردي',['campus wifi','connect to wifi','network connection','الاتصال بالواي فاي'],'core'),
 purpose('mail','recipient_limit_check','Recipient restriction check','فحص قيود المستلمين',['too many recipients','reply all','عدد المستلمين']),
 purpose('mail','recipient_address_check','Recipient address check','فحص عنوان المستلم',['recipient not found','invalid recipient','عنوان المستلم']),
 purpose('mail','missing_messages_check','Missing incoming messages','رسائل واردة مفقودة',['missing incoming email','cannot receive email','رسائل البريد المفقودة']),
 purpose('exam','lockdown','Pre-exam LockDown preparation','التحضير لبرنامج LockDown قبل الاختبار',['lockdown browser setup']),
 purpose('exam','examplify','Pre-exam Examplify preparation','التحضير لبرنامج Examplify قبل الاختبار',['examplify setup'])
];
const entries=new Map();
for(const item of [...core,...PLAYBOOK_GUIDES.map(g=>({...g,priority:['network','attendance'].includes(g.serviceId)?'core':'standard'}))]){
 const key=item.serviceId+':'+item.purpose,prior=entries.get(key);
 if(prior){prior.aliases=[...new Set([...prior.aliases,...(item.aliases||[]),item.title.en,item.title.ar])];continue;}
 entries.set(key,{serviceId:item.serviceId,purpose:item.purpose,title:{...item.title},aliases:[...(item.aliases||[])],priority:item.priority});
}
export const GUIDE_PURPOSES=Object.freeze([...entries.values()].map(x=>Object.freeze({...x,title:Object.freeze(x.title),aliases:Object.freeze(x.aliases)})));
export function knownGuidePurpose(serviceId,purpose){return entries.has(serviceId+':'+purpose);}
