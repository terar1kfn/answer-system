// Best-effort minimization, NOT a full secret or identity detector.
import {normalizePresentation} from './input-language.mjs';
export function sanitizeText(raw,{max=500}={}){
 if(typeof raw!=='string'||!raw.trim()||raw.length>max)throw new TypeError('Query must contain 1-'+max+' characters');
 const categories=new Set();
 let text=normalizePresentation(raw);
 function strip(pattern,kind){text=text.replace(pattern,()=>{categories.add(kind);return ' ';});}
 strip(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,'email');
 strip(/\b20\d{7,8}\b/g,'student_identifier');
 strip(/(?:\+971|00971|0)(?:[ -]?\d){8,9}\b/g,'phone');
 strip(/\b784[- ]?\d{4}[- ]?\d{7}[- ]?\d\b/g,'identity');
 // Preserve a bounded, ordinary description of a password's status, never
 // a colon-delimited value. "password: accepted" is still sensitive.
 text=text.replace(/\b(password)\s+is\s+(accepted|rejected|incorrect|wrong|expired|not accepted|not working|not correct)\b(?=\s*(?:[,.!;?]|$))/gi,(_m,label,status)=>label+' '+status);
 strip(/\b(?:password|passcode|otp|pin|token|secret|api[ _-]?key|recovery code|verification code)\s*(?:is\s*[:=]?|[:=])\s*(?:"[^"]*"|'[^']*'|\S+)/gi,'credential');
 // Do not retain standalone code-like values. AADSTS codes and dotted SMTP
 // status codes are structurally different and survive these boundaries.
 strip(/(?<![A-Za-z0-9.])\d{4,8}(?![A-Za-z0-9.])/g,'possible_code');
 strip(/(?:كلمة\s*(?:المرور|السر)|رمز\s*التحقق|الباسورد|الرقم\s*السري)\s*[:=]\s*(?:"[^"]*"|\S+)/gu,'credential');
 strip(/\b(?:Bearer)\s+[A-Za-z0-9._~-]{8,}/gi,'credential');
 strip(/\b(?:https?:\/\/)[^\s]+/gi,'url');
 return {text:text.replace(/\s+/g,' ').trim(),categories:[...categories]};
}
