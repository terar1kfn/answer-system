// Fictional guide references. The host must provide the actual approved content.
const make=(id,serviceId,purpose,en,ar,steps)=>({id:'demo-'+id,serviceId,purpose,title:{en,ar},reviewed:true,enabled:true,audience:'student',synthetic:true,steps:{en:steps,ar:['في التطبيق الفعلي يجب عرض الإجراء المعتمد كاملاً.','اختبر المهمة الأصلية على جهازك.']}});
export const demoCatalog={revision:'synthetic-1',guides:[
 make('mfa-ios','identity','setup_ios','iPhone verification setup','إعداد التحقق على آيفون',['Open the institution-approved iPhone verification setup guide.','Check the original sign-in afterwards.']),
 make('mfa-android','identity','setup_android','Android verification setup','إعداد التحقق على أندرويد',['Open the institution-approved Android verification setup guide.','Check the original sign-in afterwards.']),
 make('mfa-existing','identity','manage_existing_method','Manage existing verification method','إدارة طريقة التحقق الحالية',['Use the approved method-management procedure.','Do not remove a working method until a replacement is verified.']),
 make('credentials','identity','credential_check','Check sign-in details','فحص بيانات الدخول',['Check the identifier format against the official sign-in instructions.','Do not repeatedly guess or share your password.']),
 make('recipient-limit','mail','recipient_limit_check','Recipient restriction check','فحص قيود المستلمين',['Inspect the delivery error.','Ask IT to verify the applicable recipient policy. No numerical limit is assumed.']),
 make('recipient-address','mail','recipient_address_check','Recipient address check','فحص عنوان المستلم',['Verify the intended recipient using a trusted directory.','Do not send confidential content to an unverified address.']),
 make('missing-mail','mail','missing_messages_check','Missing incoming messages','رسائل واردة مفقودة',['Check whether the expected message is visible in another folder.','If it is still missing, ask IT to investigate.']),
 make('connectivity','network','individual_connectivity','Individual connectivity check','فحص الاتصال الفردي',['Confirm the affected device and network.','Use the approved device-specific guide from the host.']),
 make('lockdown','exam','lockdown','Pre-exam LockDown preparation','التحضير لـ LockDown قبل الاختبار',['Open the approved pre-exam guide. This fixture contains no recovery procedure.']),
 make('examplify','exam','examplify','Pre-exam Examplify preparation','التحضير لـ Examplify قبل الاختبار',['Open the approved pre-exam guide. This fixture contains no recovery procedure.'])
]};
