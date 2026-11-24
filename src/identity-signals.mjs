// Interpret what was reported on the affected device, not the state of an account.
// Input is normalized by the caller. Neither a code nor a password is collected.
const contains=(t,phrases)=>phrases.some(p=>(' '+t+' ').includes(' '+p+' '));
const patterns={
 signInScreen:['outlook says sign in','outlook shows sign in','outlook asks me to sign in','outlook asks to sign in','email shows sign in','sign in button in outlook','outlook sign in button','اوتلوك يطلب تسجيل الدخول','الاوتلوك يطلب تسجيل الدخول','يظهر تسجيل الدخول في الاوتلوك'],
 setupScreen:['asks me to set up authenticator','asks me to set up microsoft authenticator','asks to set up authenticator','asks to configure authenticator','asks me to register a verification method','asks me to install authenticator','asks me to set up a verification method','يطلب اعداد المصادقه','يطلب مني اعداد المصادقه','يطلب مني تثبيت تطبيق المصادقه','يطلب اعداد طريقه تحقق'],
 blocked:['cannot complete verification','can t complete verification','cannot approve my sign in','can t approve my sign in','cannot enter the verification code','can t enter the verification code','cannot access my authenticator','can t access my authenticator','no access to authenticator','code on my old phone','approval on my old phone','verification on my old phone','لا استطيع اكمال التحقق','ما اقدر اكمل التحقق','لا استطيع الموافقه علي تسجيل الدخول','ما اقدر اوافق علي تسجيل الدخول','رمز التحقق في هاتفي القديم','الكود في تلفوني القديم'],
 challenge:['asks me for a verification code','asks for a verification code','asks me to enter a code','asks me for a code','asks for a code','asks me to approve sign in','asks me to approve the sign in','authenticator code','authenticator approval','number matching','code sent to my old phone','يطلب مني رمز التحقق','يطلب رمز التحقق','يطلب مني كود','يطلب مني رمز','يطلب الموافقه علي تسجيل الدخول','رمز تطبيق المصادقه'],
 unexpected:['unexpected sign in request','unexpected approval request','unexpected authenticator request','sign in request i did not initiate','approval request i did not initiate','did not try to sign in','طلب تسجيل دخول لم ابدا','طلب موافقه لم ابدا','طلب تحقق غير متوقع'],
 unknownSetup:['i don t know what authenticator is','i dont know what authenticator is','never heard of authenticator','i don t know if authenticator is set up','ما اعرف وش المصادقه','ما اعرف ما هو تطبيق المصادقه','ما بعرف شو المصادقه','لا اعرف ما هو تطبيق المصادقه'],
 credentialRejected:['incorrect password','invalid username or password','username or password is incorrect','wrong username','invalid username','password is incorrect','password rejected','كلمه المرور غير صحيحه','اسم المستخدم غير صحيح','اسم المستخدم او كلمه المرور غير صحيحه']
};
export function detectIdentitySignals(t){
 const has=k=>contains(t,patterns[k]);
 const blocked=has('blocked'),challenge=has('challenge'),setup=has('setupScreen'),unexpected=has('unexpected');
 const credential=has('credentialRejected'),screen=has('signInScreen'),unknown=has('unknownSetup');
 const explicitMailFault=/\b(?:cannot|can t|cant|unable to|could not) (?:send|receive) (?:an? |any |my |all |the )?(?:emails?|messages?|mail)\b|\b(?:incoming|outgoing) (?:emails?|mail|messages)\b|لا استطيع (?:ارسال|استقبال) (?:البريد|الايميل|الرسائل)/.test(t);
 const explicitLogin=screen||setup||blocked||challenge||unexpected||credential||unknown;
 const facts={};
 if(unexpected)facts.mfa_prompt='unexpected';
 else if(setup&&blocked)facts.verification_context='conflicting_screen';
 else if(setup)facts.mfa_prompt='setup_required';
 else if(blocked)facts.mfa_prompt='blocked';
 else if(challenge)facts.verification_context='challenge';
 if(screen)facts.login_screen='sign_in_visible';
 if(unknown)facts.mfa_setup='unknown';
 if(credential)facts.credentials='rejected';
 return {explicitLogin,explicitMailFault,facts};
}
