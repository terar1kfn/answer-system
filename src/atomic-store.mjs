import {mkdirSync,lstatSync,openSync,closeSync,readFileSync,writeFileSync,renameSync,unlinkSync,fsyncSync,existsSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const clone=x=>JSON.parse(JSON.stringify(x));
const nameOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(x);
const fail=x=>{throw Error(x);};
/**
 * Single-writer file store for private, authorized operational metadata.
 * Exclusive process lock + compare-and-swap + atomic same-directory replacement.
 * Not distributed storage; no stale-lock override or automatic data recovery.
 * Never use this for passwords, MFA codes, raw transcripts or sensitive uploads.
 */
export function openAtomicStore({directory,name,initial,validate=()=>true,maxBytes=8*1024*1024}={}){
 if(typeof directory!=='string'||!isAbsolute(directory)||!nameOk(name)||typeof validate!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>64*1024*1024)fail('INVALID_STORE_CONFIG');
 mkdirSync(directory,{recursive:true,mode:0o700});if(lstatSync(directory).isSymbolicLink()||!lstatSync(directory).isDirectory())fail('INVALID_STORE_DIRECTORY');
 const file=join(directory,name+'.json'),lock=join(directory,name+'.lock');let lockFd,closed=false,writing=false,state;
 const owner=randomUUID();
 try{lockFd=openSync(lock,'wx',0o600);}catch{fail('STORE_LOCKED');}
 function unlock(){
  if(lockFd!==undefined){try{closeSync(lockFd);}catch{}lockFd=undefined;}
  try{if(readFileSync(lock,'utf8')===owner)unlinkSync(lock);}catch{}
 }
 function envelope(value){
  if(!value||value.format!==1||!Number.isSafeInteger(value.revision)||value.revision<0||validate(clone(value.data))!==true)fail('INVALID_STORE_DATA');
  return value;
 }
 function serialized(value){
  const text=JSON.stringify(value);if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>maxBytes)fail('STORE_CAPACITY');return text;
 }
 function write(value){
  const text=serialized(envelope(value)),temp=join(directory,'.'+name+'.'+randomUUID()+'.tmp');let fd;
  try{
   fd=openSync(temp,'wx',0o600);writeFileSync(fd,text,{encoding:'utf8'});fsyncSync(fd);closeSync(fd);fd=undefined;
   renameSync(temp,file);
  }finally{
   if(fd!==undefined)try{closeSync(fd);}catch{}
   if(existsSync(temp))try{unlinkSync(temp);}catch{}
  }
  // Directory sync is best effort on platforms where opening directories for fsync is unsupported.
  let dirfd;try{dirfd=openSync(directory,'r');fsyncSync(dirfd);}catch{}finally{if(dirfd!==undefined)try{closeSync(dirfd);}catch{}}
 }
 try{
  writeFileSync(lockFd,owner,'utf8');fsyncSync(lockFd);
  if(existsSync(file)){
   const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)fail('INVALID_STORE_FILE');
   state=envelope(JSON.parse(readFileSync(file,'utf8')));
  }else{state=envelope({format:1,revision:0,data:clone(initial)});write(state);}
 }catch(e){unlock();throw e;}
 function assertOpen(){if(closed)fail('STORE_CLOSED');}
 function snapshot(){assertOpen();return clone(state);}
 function transact(expectedRevision,mutate){
  assertOpen();if(writing)fail('STORE_REENTRANT');
  if(expectedRevision!==state.revision||!Number.isSafeInteger(expectedRevision))fail('STORE_REVISION_CONFLICT');
  if(typeof mutate!=='function')fail('INVALID_MUTATION');
  writing=true;
  try{
   const draft=clone(state.data),result=mutate(draft);
   if(result&&typeof result.then==='function')fail('ASYNC_MUTATION_NOT_ALLOWED');
   const next=envelope({format:1,revision:state.revision+1,data:draft});
   write(next);state=next;return {snapshot:clone(state),result:result===undefined?null:clone(result)};
  }finally{writing=false;}
 }
 function close(){if(writing)fail('STORE_BUSY');if(!closed){closed=true;unlock();}}
 return Object.freeze({snapshot,transact,close});
}
