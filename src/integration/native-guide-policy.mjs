// Exact native enum values. Missing or unknown risk does not imply low risk.
// These predicates do not establish ownership, availability, source review,
// current permission or approval. Independent host hooks remain mandatory.
export const isPermittedNativeRisk=guide=>guide?.riskLevel==='Low'||guide?.riskLevel==='Medium';
export const isNativeStudentSelfService=guide=>Boolean(guide&&['Student','All'].includes(guide.audience)&&guide.permissionLevel==='SELF SERVICE');
export const isUnreviewedNativeSource=guide=>['DRAFT / NEEDS REVIEW','REQUIRES IT VALIDATION'].includes(guide?.sourceType);
