// Best-effort minimization, NOT a full secret or identity detector.
export function sanitizeText(raw,{max=500}={}){
 if(typeof raw!=='string'||!raw.trim()||raw.length>max)throw new TypeError('Query must contain 1-'+max+' characters');
 const categories=new Set();
 let text=raw.normalize('NFKC');
 function strip(pattern,kind){text=text.replace(pattern,()=>{categories.add(kind);return ' ';});}
 strip(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,'email');
 strip(/\b20\d{7,8}\b/g,'student_identifier');
 strip(/(?:\+971|00971|0)(?:[ -]?\d){8,9}\b/g,'phone');
 strip(/\b784[- ]?\d{4}[- ]?\d{7}[- ]?\d\b/g,'identity');
 strip(/\b(?:password|passcode|otp|pin|token|secret|api[ _-]?key|recovery code)\s*(?:is\s*[:=]?|[:=])\s*(?:"[^"]*"|'[^']*'|\S+)/gi,'credential');
 strip(/(?:كلمة\s*(?:المرور|السر)|رمز\s*التحقق|الباسورد|الرقم\s*السري)\s*[:=]\s*(?:"[^"]*"|\S+)/gu,'credential');
 strip(/\b(?:Bearer)\s+[A-Za-z0-9._~-]{8,}/gi,'credential');
 strip(/\b(?:https?:\/\/)[^\s]+/gi,'url');
 return {text:text.replace(/\s+/g,' ').trim(),categories:[...categories]};
}
