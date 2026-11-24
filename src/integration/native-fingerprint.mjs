import {createHash} from 'node:crypto';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const nativeRecordFingerprint=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
