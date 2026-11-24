// Interpret documented error families only as reported clues, not verified causes.
const ENTRA='https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes';
const EXCHANGE='https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/non-delivery-reports-in-exchange-online/non-delivery-reports-in-exchange-online';
const make=(id,code,serviceId,stage,sourceRef)=>Object.freeze({id,code,serviceId,stage,sourceRef});
export const ERROR_SIGNATURES=Object.freeze([
 make('entra-mfa-required','AADSTS50076','identity','verification_required',ENTRA),
 make('entra-mfa-challenge','AADSTS50074','identity','verification_challenge',ENTRA),
 make('entra-registration','AADSTS50079','identity','registration_or_claim_required',ENTRA),
 make('entra-registration-interrupt','AADSTS50072','identity','registration_required',ENTRA),
 make('entra-credential-rejected','AADSTS50126','identity','credential_validation',ENTRA),
 make('entra-policy-block','AADSTS53003','identity','policy_block',ENTRA),
 make('entra-signin-block','AADSTS50053','identity','sign_in_block',ENTRA),
 make('entra-expired-verification','AADSTS50078','identity','verification_expired',ENTRA),
 make('mail-bad-sender','5.1.8','mail','sender_restricted',EXCHANGE),
 make('mail-recipient-not-found','5.1.10','mail','recipient_address',EXCHANGE),
 make('mail-recipient-rate','5.1.90','mail','recipient_rate_limit',EXCHANGE),
 make('mail-quota','5.2.2','mail','quota_or_rate_review',EXCHANGE),
 make('mail-size','5.2.3','mail','message_size',EXCHANGE)
]);
export function recognizeErrors(text){
 if(typeof text!=='string'||text.length>10000)return [];
 text=text.replace(/\bAADSTS\s+(\d{5,7})\b/gi,'AADSTS$1').replace(/\b([245])\s*\.\s*(\d{1,3})\s*\.\s*(\d{1,3})\b/g,'$1.$2.$3').replace(/(?<!\d)\.|\.(?!\d)/g,' ');
 return ERROR_SIGNATURES.filter(e=>{
  const code=e.code.replace(/\./g,'\\.');
  return new RegExp('(?:^|[^a-z0-9.])'+code+'(?=$|[^a-z0-9.])','i').test(text);
 }).map(e=>({...e}));
}
export function getErrorSignature(id){return ERROR_SIGNATURES.find(e=>e.id===id)||null;}
