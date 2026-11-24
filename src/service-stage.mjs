// Fixed operation evidence; never grants access or establishes a root cause.
const q=(en,ar,rows)=>({text:{en,ar},options:[...rows,['unknown','Not sure','غير متأكد']].map(([id,en,ar])=>({id,label:{en,ar}}))});
export const STAGE_QUESTIONS={
 meeting_product:q('Which meeting application is affected?','أي تطبيق للاجتماعات متأثر؟',[['zoom','Zoom','Zoom'],['teams','Microsoft Teams','Microsoft Teams'],['other','Another meeting app','تطبيق اجتماعات آخر']]),
 meeting_join_stage:q('What prevents entry to the ordinary meeting?','ما الذي يمنع الانضمام للاجتماع العادي؟',[['signin','University sign-in blocks entry','تسجيل الدخول الجامعي يمنع الدخول'],['host_access','Host admission, invitation or access permission is required','يتطلب قبول المضيف أو دعوة أو إذن وصول'],['technical','I have authorized meeting access but a technical join failure occurs','لدي وصول مصرح به لكن تحدث مشكلة تقنية في الانضمام']]),
 meeting_media_scope:q('Does the same affected camera, speaker or microphone work in another ordinary approved app on this device?','هل تعمل الكاميرا أو السماعة أو الميكروفون المتأثرة في تطبيق عادي معتمد آخر على هذا الجهاز؟',[['only_meeting','It works in another app; only this meeting app fails','يعمل في تطبيق آخر والمشكلة في تطبيق الاجتماع فقط'],['other_apps','The same media device also fails in another app','يفشل جهاز الصوت أو الكاميرا نفسه في تطبيق آخر أيضاً'],['not_tried','I have not compared it','لم أجر المقارنة']]),
 meeting_share_scope:q('Has the host allowed screen sharing for your current participant role?','هل سمح المضيف بمشاركة الشاشة لدورك الحالي؟',[['host_allowed','Sharing is allowed but a technical issue prevents it','المشاركة مسموحة لكن مشكلة تقنية تمنعها'],['host_restricted','Sharing is restricted or not allowed by the host','المشاركة مقيدة أو غير مسموحة من المضيف']]),
 portal_access:q('Can you enter the selected academic system now?','هل تستطيع الدخول إلى النظام الأكاديمي المحدد الآن؟',[['signed_in','Yes, I can enter it','نعم، أستطيع الدخول إليه'],['blocked','Sign-in or entry is blocked','يتعذر تسجيل الدخول أو الدخول إلى النظام'],['not_tried','I have not tried entering it','لم أحاول الدخول إليه']]),
 assignment_stage:q('What does the specific assignment activity show now?','ماذا يعرض نشاط الواجب المحدد الآن؟',[['ready','The activity is open and its permitted submission option is available','النشاط مفتوح وخيار التسليم المسموح متاح'],['submitted','I already submitted this assignment','لقد سلمت هذا الواجب بالفعل'],['closed_or_missing','The activity is closed or missing','النشاط مغلق أو غير ظاهر'],['access_denied','There is an access or permission restriction','يوجد قيد على الوصول أو الإذن']]),
 request_stage:q('What is the state of this specific online request?','ما حالة هذا الطلب الإلكتروني المحدد؟',[['new','I need to create a request and have not submitted this request','أحتاج إلى إنشاء طلب ولم أقدم هذا الطلب'],['existing','I already submitted this request and need to check it','قدمت هذا الطلب بالفعل وأحتاج إلى متابعته'],['blocked','Request access or permission is restricted','الوصول إلى الطلب أو الإذن مقيد']]),
 attendance_mark_context:q('Are you physically in the scheduled classroom, with attendance opened by the instructor?','هل أنت موجود فعلياً في قاعة المحاضرة المحددة وقد فتح المدرس تسجيل الحضور؟',[['in_class_open','I am in class and attendance is open','أنا في المحاضرة والحضور مفتوح'],['not_open','The instructor has not opened attendance','لم يفتح المدرس تسجيل الحضور'],['not_present','I am not in the scheduled classroom','لست في قاعة المحاضرة المحددة']])
};
for(const item of Object.values(STAGE_QUESTIONS)){Object.freeze(item.text);for(const o of item.options){Object.freeze(o.label);Object.freeze(o);}Object.freeze(item.options);Object.freeze(item);}
Object.freeze(STAGE_QUESTIONS);
const v=(s,k)=>s.evidence[k]?.value;
const own=(s,k,value)=>{s.evidence[k]={value,origin:'student_report'};};
const forget=(s,keys)=>{for(const k of keys)delete s.evidence[k];s.askedQuestionIds=s.askedQuestionIds.filter(k=>!keys.includes(k));};
export function serviceStageDecision(s,service,choice,{ask,support}){
 if(service==='collaboration'){
  if(!v(s,'meeting_product'))return ask('meeting_product');
  if(!['zoom','teams'].includes(v(s,'meeting_product')))return support('MEETING_PRODUCT_UNCONFIRMED');
  if(choice==='recording')return support('MEETING_HOST_PERMISSION_REVIEW');
  if(choice==='join'){
   const stage=v(s,'meeting_join_stage');
   if(!stage)return ask('meeting_join_stage');
   if(stage==='host_access')return support('MEETING_HOST_PERMISSION_REVIEW');
   if(stage!=='technical')return support('MEETING_JOIN_STAGE_UNCONFIRMED');
  }
  if(['audio','video','share'].includes(choice)){
   if(!v(s,'meeting_client'))return ask('meeting_client');
   if(v(s,'meeting_client')==='unknown')return support('MEETING_CLIENT_UNCONFIRMED');
  }
  if(['audio','video'].includes(choice)){
   const scope=v(s,'meeting_media_scope');
   if(!scope)return ask('meeting_media_scope');
   if(scope==='other_apps')return support('MEETING_DEVICE_MEDIA_REVIEW');
   if(scope!=='only_meeting')return support('MEETING_MEDIA_COMPARISON_NEEDED');
  }
  if(choice==='share'){
   if(!v(s,'meeting_share_scope'))return ask('meeting_share_scope');
   if(v(s,'meeting_share_scope')!=='host_allowed')return support('MEETING_HOST_PERMISSION_REVIEW');
  }
 }
 if(service==='portal'){
  const system=v(s,'portal_system');
  if(!system)return ask('portal_system');
  if(system==='unknown')return support('ACADEMIC_SYSTEM_UNCONFIRMED');
  if(choice==='content')return support(system==='moodle'?'ACADEMIC_COURSE_VISIBILITY_REVIEW':'ACADEMIC_FEATURE_OWNER_REVIEW');
  if(choice==='registration')return support(system==='banner'?'ACADEMIC_REGISTRATION_REVIEW':'ACADEMIC_FEATURE_OWNER_REVIEW');
  if(choice==='access')return support(system==='ors'?'ACADEMIC_REQUEST_ACCESS_REVIEW':system==='moodle'?'ACADEMIC_COURSE_VISIBILITY_REVIEW':'ACADEMIC_FEATURE_OWNER_REVIEW');
  if((choice==='assignment'&&system==='moodle')||(['request_create','request_status'].includes(choice)&&system==='ors')){
   if(!v(s,'portal_access'))return ask('portal_access');
   if(v(s,'portal_access')!=='signed_in')return support('ACADEMIC_PORTAL_ACCESS_UNCONFIRMED');
   if(choice==='assignment'){
    const stage=v(s,'assignment_stage');
    if(!stage)return ask('assignment_stage');
    if(stage==='submitted')return support('ACADEMIC_SUBMISSION_CONFIRMATION_REVIEW');
    if(['closed_or_missing','access_denied'].includes(stage))return support('ACADEMIC_SUBMISSION_OWNER_REVIEW');
    if(stage!=='ready')return support('ACADEMIC_SUBMISSION_STAGE_UNCONFIRMED');
   }else{
    const stage=v(s,'request_stage');
    if(!stage)return ask('request_stage');
    if(choice==='request_create'&&stage==='existing')return support('ACADEMIC_EXISTING_REQUEST_REVIEW');
    if(stage==='blocked')return support('ACADEMIC_REQUEST_ACCESS_REVIEW');
    if((choice==='request_create'&&stage!=='new')||(choice==='request_status'&&stage!=='existing'))return support('ACADEMIC_REQUEST_STAGE_UNCONFIRMED');
   }
  }
 }
 if(service==='attendance'){
  if(choice==='record')return support('ATTENDANCE_RECORD_OWNER_REVIEW');
  if(choice==='security_alert')return support('ATTENDANCE_SECURITY_ALERT_NATIVE_REVIEW');
  if(choice==='mark'){
   const context=v(s,'attendance_mark_context');
   if(!context)return ask('attendance_mark_context');
   if(['not_open','not_present'].includes(context))return support('ATTENDANCE_MARK_OWNER_REVIEW');
   return support(context==='in_class_open'?'ATTENDANCE_MARK_TECHNICAL_REVIEW':'ATTENDANCE_MARK_CONTEXT_UNCONFIRMED');
  }
 }
 return null;
}
export function applyServiceStageAnswer(s,questionId,optionId){
 const service=s.services.length===1?s.services[0]:null;
 if(!((service==='portal'&&questionId==='portal_access'&&optionId==='blocked')||
  (service==='collaboration'&&questionId==='meeting_join_stage'&&optionId==='signin')))return;
 // Clear stale stage evidence, never the verified recovery history.
 forget(s,['mfa_setup','mfa_prompt','mfa_access','mfa_method_goal','verification_context','login_screen','credentials','security_info_access','recovery_context','setup_requested','setup_completed','setup_blocker','post_signin_stage','service_access','password_intent','password_knowledge','password_change_environment','error_signature','outcome']);
 if(service==='portal')forget(s,['assignment_stage','request_stage','assignment_kind','browser_scope']);
 if(service==='collaboration')forget(s,['meeting_media_scope','meeting_share_scope']);
 s.domain='identity';own(s,'task','login');s.askedQuestionIds=s.askedQuestionIds.filter(k=>k!=='task');
}
export function resumeServiceStageAfterSignIn(s){
 if(s.services.length!==1)return;
 if(s.services[0]==='portal'&&v(s,'portal_access')==='blocked')own(s,'portal_access','signed_in');
 if(s.services[0]==='collaboration'&&v(s,'meeting_join_stage')==='signin')forget(s,['meeting_join_stage']);
}
