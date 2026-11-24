const ok=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x),fail=x=>{throw Error(x);};
export const initialDeliveryLedger=()=>({operations:[]});
export function validateDeliveryLedger(s){
 return Boolean(s&&Array.isArray(s.operations)&&s.operations.length<=5000&&s.operations.every(o=>ok(o.operationId)&&ok(o.visitRef)&&ok(o.issueId)&&ok(o.requestKey)&&['offer_support','offer_mfa_recovery'].includes(o.kind)&&['prepared','sending','unknown','failed','recorded'].includes(o.status)&&Number.isInteger(o.attempt)&&o.attempt>=1&&o.attempt<=3&&(o.status!=='recorded'||ok(o.hostRef))&&Number.isFinite(o.updatedAt)));
}
/**
 * Durable operation metadata; never persists the diagnostic payload. The
 * private host must own a durable delivery idempotency key at its destination.
 * A crash or timeout cannot be interpreted as a definite failure.
 */
export function createDeliveryLedger({store,now=()=>Date.now()}={}){
 if(!store||typeof store.snapshot!=='function'||typeof store.transact!=='function'||typeof now!=='function')fail('INVALID_LEDGER');
 const get=id=>store.snapshot().data.operations.find(o=>o.operationId===id)||null;
 function mutate(fn){const snap=store.snapshot();return store.transact(snap.revision,s=>fn(s.operations)).result;}
 function register(op){
  if(!op||![op.operationId,op.visitRef,op.issueId,op.requestKey].every(ok)||!['offer_support','offer_mfa_recovery'].includes(op.kind)||!Number.isInteger(op.attempt)||op.attempt<1||op.attempt>3)fail('INVALID_OPERATION');
  const prior=get(op.operationId);
  if(prior){
   if(['visitRef','issueId','requestKey','kind'].some(k=>prior[k]!==op[k]))fail('OPERATION_CONFLICT');
   return prior;
  }
  if(op.attempt!==1)fail('FIRST_ATTEMPT_REQUIRED');
  return mutate(rows=>{
   if(rows.length>=5000)fail('LEDGER_CAPACITY');
   if(rows.some(o=>o.visitRef===op.visitRef&&o.issueId===op.issueId&&o.requestKey===op.requestKey))fail('IDEMPOTENCY_CONFLICT');
   const row={operationId:op.operationId,visitRef:op.visitRef,issueId:op.issueId,requestKey:op.requestKey,kind:op.kind,attempt:1,status:'prepared',updatedAt:now()};
   rows.push(row);return row;
  });
 }
 function claim(id,attempt){
  return mutate(rows=>{
   const o=rows.find(r=>r.operationId===id);if(!o)fail('OPERATION_NOT_FOUND');
   if(o.status==='failed'&&attempt===o.attempt+1&&attempt<=3){o.attempt=attempt;o.status='prepared';}
   if(o.status!=='prepared'||o.attempt!==attempt)fail('DELIVERY_NOT_CLAIMABLE');
   o.status='sending';o.updatedAt=now();return o;
  });
 }
 function result(id,{attempt,status,hostRef}={}){
  if(!['recorded','failed','unknown'].includes(status)||(status==='recorded'&&!ok(hostRef))||(status!=='recorded'&&hostRef!==undefined))fail('INVALID_DELIVERY_RESULT');
  return mutate(rows=>{
   const o=rows.find(r=>r.operationId===id);if(!o||o.attempt!==attempt)fail('STALE_ATTEMPT');
   if(o.status==='recorded'&&status==='recorded'&&o.hostRef===hostRef)return o;
   if(!['sending','unknown'].includes(o.status))fail('DELIVERY_STATE_CONFLICT');
   o.status=status;o.updatedAt=now();if(status==='recorded')o.hostRef=hostRef;return o;
  });
 }
 function unresolved(){return store.snapshot().data.operations.filter(o=>['sending','unknown'].includes(o.status));}
 // Only host-confirmed terminal records may be removed under retention policy.
 function purgeTerminal({before}={}){
  if(!Number.isFinite(before)||before>now())fail('INVALID_RETENTION_CUTOFF');
  const snap=store.snapshot();
  return store.transact(snap.revision,s=>{const n=s.operations.length;s.operations=s.operations.filter(o=>!['recorded','failed'].includes(o.status)||o.updatedAt>=before);return n-s.operations.length;}).result;
 }
 return Object.freeze({get,register,claim,result,unresolved,purgeTerminal});
}
export function createHandoffDispatcher({ledger,deliver,lookup}={}){
 if(!ledger||typeof deliver!=='function'||typeof lookup!=='function')fail('INVALID_DISPATCHER');
 function disposition(out){
  return out?.status==='recorded'&&ok(out.hostRef)?{status:'recorded',hostRef:out.hostRef}:out?.status==='failed'&&out.definitiveNoEffect===true?{status:'failed'}:{status:'unknown'};
 }
 async function send(op){
  const existing=ledger.register(op);
  if(existing.status==='recorded'||['sending','unknown'].includes(existing.status))return existing;
  if(!op.payload)fail('HANDOFF_PAYLOAD_MISSING');
  ledger.claim(op.operationId,op.attempt);
  let out;
  try{out=disposition(await deliver({operationId:op.operationId,idempotencyKey:op.operationId,attempt:op.attempt,kind:op.kind,payload:op.payload}));}catch{out={status:'unknown'};}
  return ledger.result(op.operationId,{attempt:op.attempt,...out});
 }
 async function reconcile(operationId){
  const o=ledger.get(operationId);if(!o||!['sending','unknown'].includes(o.status))fail('RECONCILIATION_NOT_REQUIRED');
  let out;try{out=disposition(await lookup({operationId,attempt:o.attempt,idempotencyKey:operationId}));}catch{out={status:'unknown'};}
  return ledger.result(operationId,{attempt:o.attempt,...out});
 }
 return Object.freeze({send,reconcile});
}
