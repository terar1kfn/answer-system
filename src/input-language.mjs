// Normalization of written digits, spacing and presentation forms only.
// Keep lexical meaning and error-code punctuation; never transliterate arbitrary
// identifiers or replace an uncertain phrase with a diagnosis.
export function normalizePresentation(text){
 return text.normalize('NFKC')
  .replace(/[\u0660-\u0669\u06f0-\u06f9]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)<0x06f0?0x0660:0x06f0)))
  .replace(/[\u0640\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'')
  .replace(/[‘’]/g,"'")
  .replace(/[،؛]/g,c=>c==='،'?',':';');
}
// A bounded list of unambiguous conversational forms. This is not a general
// dialect translator: unmatched or contradictory text still needs clarification.
export const ANSWER_FORMS=Object.freeze({
 yes:['ايوا','أيوه','ايوة','اه','هيه','تمام','yes it does','yes i do','yes i can'],
 no:['لأ','لا ابدا','لا ما اقدر','no i cannot','no i can t','no it does not'],
 unknown:['ما بعرف','ما اعرف','مش متأكد','مو عارف','مادري','not certain','no idea','i am not sure']
});
