// Plain localized interface copy. Never generate a procedure or an account
// diagnosis from a reason code. The host renders native policy referrals.
const labels={
 FREE_TEXT_NOT_UNAMBIGUOUS:['I need a little more detail. Choose the option that best matches what you see.','أحتاج إلى مزيد من التفاصيل. اختر الخيار الأقرب إلى ما تراه.'],
 CONFLICTING_OBSERVATIONS:['Some reported observations point in different directions. Please confirm what is happening now on the affected device.','تشير بعض المعلومات إلى احتمالات مختلفة. يرجى تأكيد ما يحدث الآن على الجهاز المتأثر.'],
 REVIEWED_FACT_CONFLICT:['More than one approved answer matches this question. IT needs to confirm which applies.','توجد أكثر من إجابة معتمدة تطابق السؤال. يجب أن يؤكد الدعم التقني أيها ينطبق.'],
 NETWORK_OBSERVATIONS_CONFLICT:['The reported connection details conflict. IT can review the current network state.','تتعارض معلومات الاتصال المبلغ عنها. يمكن للدعم التقني مراجعة حالة الشبكة الحالية.'],
 CONFLICTING_REPLY:['Your reply could mean more than one answer. Which option matches?','قد تعني إجابتك أكثر من خيار. أي خيار يطابق المشكلة؟'],
 POSSIBLE_NEW_ISSUE:['Is this a different problem? Start a new search or answer the current question.','هل هذه مشكلة مختلفة؟ ابدأ بحثاً جديداً أو أجب عن السؤال الحالي.'],
 NEW_ISSUE_REQUIRED:['This may need a separate diagnosis. Start a new search if it is a different issue.','قد تتطلب هذه المشكلة تشخيصاً منفصلاً. ابدأ بحثاً جديداً إذا كانت مختلفة.'],
 REMOVE_PRIVATE_INFORMATION:['Do not enter passwords, verification codes or personal account details. Describe what the screen says instead.','لا تدخل كلمات المرور أو رموز التحقق أو بيانات الحساب الشخصية. صف ما تعرضه الشاشة بدلاً من ذلك.'],
 REGISTERED_METHOD_UNAVAILABLE:['An existing verification method is blocking your sign-in. Authorized IT can review a recovery request.','طريقة تحقق مسجلة تمنع تسجيل الدخول. يمكن للدعم التقني المخول مراجعة طلب الاستعادة.'],
 RECOVERY_STILL_BLOCKED:['Verification is still blocked after recovery. Ask authorized IT to review the remaining problem.','ما زال التحقق متعذراً بعد الاستعادة. اطلب من الدعم التقني المخول مراجعة المشكلة المتبقية.'],
 POSSIBLE_SHARED_NETWORK_INCIDENT:['Other people may be affected. IT needs to confirm whether there is a shared connection problem.','قد يتأثر أشخاص آخرون. يجب على الدعم التقني التأكد من وجود مشكلة اتصال مشتركة.'],
 EVIDENCE_SUPPORTED_ALTERNATIVE:['Based on what you reported, another approved guide may be relevant to the original problem.','بناءً على ما ذكرت، قد يكون هناك دليل معتمد آخر مناسب للمشكلة الأصلية.'],
 NO_DISTINCT_APPROVED_ALTERNATIVE:['There is no different approved guide supported by the available evidence. IT can review what you have tried.','لا يوجد دليل معتمد مختلف تدعمه المعلومات المتاحة. يمكن للدعم التقني مراجعة ما جربته.'],
 ALTERNATIVE_BUDGET_EXHAUSTED:['You have already tried several approaches. IT can investigate the remaining problem without repeating those steps.','جربت عدة طرق بالفعل. يمكن للدعم التقني التحقيق في المشكلة المتبقية دون تكرار الخطوات.'],
 GUIDE_NOT_ATTEMPTED:['The previous guidance has not been tried. You can return to it or ask IT for assistance.','لم تُجرب الإرشادات السابقة. يمكنك العودة إليها أو طلب مساعدة الدعم التقني.'],
 GUIDE_STEP_BLOCKED:['IT can review which part of the approved guidance could not be completed.','يمكن للدعم التقني مراجعة الجزء الذي تعذر إكماله من الإرشادات المعتمدة.'],
 SYMPTOMS_CHANGED_REVIEW:['The symptom changed. IT can review the new error and the earlier attempt.','تغيرت الأعراض. يمكن للدعم التقني مراجعة الخطأ الجديد والمحاولة السابقة.'],
 GUIDE_DID_NOT_WORK:['The original problem still needs attention. You can ask IT for help.','المشكلة الأصلية ما زالت قائمة. يمكنك طلب المساعدة من الدعم التقني.'],
 NO_APPROVED_GUIDE:['There is no approved matching guide available here. Ask IT for help.','لا يوجد دليل معتمد مطابق متاح هنا. اطلب المساعدة من الدعم التقني.'],
 CATALOG_CHANGED:['The available guidance changed. Please start the diagnosis again.','تغيرت الإرشادات المتاحة. يرجى بدء التشخيص من جديد.'],
 INCIDENT_REFRESH_REQUIRED:['Service information has changed. Start a new diagnosis.','تغيرت معلومات الخدمة. ابدأ تشخيصاً جديداً.'],
 BRIDGE_UNAVAILABLE:['The assistant could not confirm the latest state. Refresh before continuing.','تعذر على المساعد تأكيد الحالة الأخيرة. حدّثها قبل المتابعة.'],
 STALE_VERSION:['The question changed. Refresh before answering.','تغير السؤال. حدّثه قبل الإجابة.']
};
const effects={
 native_guide_pending:['Return from the existing guide to continue.','عُد من الدليل الحالي للمتابعة.'],
 native_guide_returned:['You have returned from the guide. Is the original problem fixed?','عدت من الدليل. هل حُلّت المشكلة الأصلية؟'],
 recovery_pending:['IT has not confirmed recovery completion yet.','لم يؤكد الدعم التقني اكتمال الاستعادة بعد.'],
 native_request_unconfirmed:['The existing request could not be confirmed. Check its status before submitting another.','تعذر تأكيد الطلب الحالي. تحقق من حالته قبل إرسال طلب آخر.'],
 resolved_reported:['You reported that the original problem now works.','أفدت بأن المشكلة الأصلية حُلّت الآن.']
};
export function interfaceCopy(code,language='en'){
 if(!['en','ar'].includes(language))throw Error('INVALID_LANGUAGE');
 const row=Object.hasOwn(labels,code)?labels[code]:Object.hasOwn(effects,code)?effects[code]:null;
 return row?.[language==='ar'?1:0]??null;
}
