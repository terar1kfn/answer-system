const text=x=>typeof x==='string'&&x.trim()?x.trim().slice(0,200):undefined;
const status=x=>['started','not-started','unknown'].includes(x)?x:'unknown';
const compact=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));
const choice=(q,id)=>q?.options?.find(o=>o.id===id);
export function reportedAnswer(state,next){
 const d=state?.decision,q=d?.kind==='ask'?d.question:d?.followUp?.question,questionId=d?.kind==='ask'?d.questionId:d?.followUp?.questionId;
 if(!q||!questionId||next?.turn<=state.turn)return null;
 const answer=choice(q,next.evidence?.[questionId]?.value);
 if(!answer)return null;
 return {questionId,optionId:answer.id,question:{...q.text},answer:{...answer.label}};
}
/**
 * Supplemental journey delta, compatible with a native ticket journey
 * sanitizer. Only fixed questions and explicitly selected/reported options are
 * included. No student text, raw OCR, identity or unverified guide progress.
 * The host merges this with its own recorded guide navigation and attachments.
 */
export function buildNativeJourney({state,answers=[],nativeContext={}}={}){
 if(!state||!['en','ar'].includes(state.language))return null;
 const language=state.language;
 const device=state.evidence?.device_os?.value;
 const phone=state.evidence?.phone?.value;
 const devices={windows:'Windows',macos:'macOS',ios:'iPhone / iPad',android:'Android'};
 const examStatus=status(nativeContext.examStatus);
 return compact({
  service:text(nativeContext.serviceLabel),app:text(nativeContext.appLabel),
  device:text(nativeContext.deviceLabel)||devices[phone],os:devices[device],
  examStatus,language,
  errorMessage:text(state.errorHint?.code),
  answers:answers.slice(-25).map(a=>compact({question:text(a.question?.[language]),answer:text(a.answer?.[language])})).filter(a=>a.question&&a.answer)
 });
}
