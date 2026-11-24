import {eligible,searchKnowledge} from './knowledge.mjs';
import {sanitizeText} from './privacy.mjs';
import {classify} from './classify.mjs';
const cleanVector=v=>{
 if(!Array.isArray(v)||!v.length||v.length>4096||v.some(n=>!Number.isFinite(n)))throw Error('INVALID_VECTOR');
 const norm=Math.sqrt(v.reduce((a,b)=>a+b*b,0));if(!Number.isFinite(norm)||norm<=0)throw Error('INVALID_VECTOR');
 return v.map(n=>n/norm);
};
const dot=(a,b)=>a.length===b.length?a.reduce((s,x,i)=>s+x*b[i],0):-1;
const entries=c=>[...(c.guides||[]).map(g=>({...g,kind:'guide'})),...(c.facts||[]).map(g=>({...g,kind:'fact'}))];
const preview=g=>({id:g.id,kind:g.kind,serviceId:g.serviceId,title:g.title});
const metadata=g=>[g.title?.en,g.title?.ar,...(g.aliases||[]),...(g.keywords||[]),...(g.errorSignatures||[])].filter(x=>typeof x==='string').join('\n').slice(0,3500);
/**
 * A revision-pinned optional index over reviewed metadata only. No raw guides,
 * tickets, identities or model-generated procedures are sent to the embedder.
 * Production enablement still requires institutional privacy approval.
 */
export function createHybridRetriever({getCatalog,embed,enabled=false,maxEntries=1000,batchSize=16,minimumSimilarity=0.64,timeoutMs=4000}={}){
 if(typeof getCatalog!=='function'||typeof enabled!=='boolean'||(enabled&&typeof embed!=='function')||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>5000||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>32||!Number.isFinite(minimumSimilarity)||minimumSimilarity<0||minimumSimilarity>1||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)throw Error('INVALID_HYBRID_CONFIG');
 let index=null,busy=false;
 async function call(input){
  if(busy)throw Error('EMBEDDING_BUSY');
  busy=true;const controller=new AbortController();let timer;
  const task=Promise.resolve().then(()=>embed(input,{signal:controller.signal})).finally(()=>{busy=false;});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('EMBEDDING_TIMEOUT'));},timeoutMs);});
  try{
   const out=await Promise.race([task,deadline]);
   if(!Array.isArray(out)||out.length!==input.length)throw Error('INVALID_VECTOR_COUNT');
   return out.map(cleanVector);
  }finally{clearTimeout(timer);}
 }
 async function rebuild(){
  if(!enabled)return {status:'disabled'};
  const c=getCatalog(),revision=c.revision;
  const rows=entries(c).filter(g=>eligible(g,{catalog:c})).slice(0,maxEntries+1);
  if(rows.length>maxEntries)return {status:'capacity'};
  const safe=[];
  for(const g of rows){
   const t=metadata(g);if(!t.trim())continue;
   const cleaned=sanitizeText(t,{max:3500});if(cleaned.categories.length)continue;
   safe.push({ref:preview(g),text:cleaned.text});
  }
  if(!safe.length){index=null;return {status:'empty'};}
  const next=[];let dimension=null;
  try{
   for(let i=0;i<safe.length;i+=batchSize){
    if(getCatalog().revision!==revision)return {status:'stale'};
    const batch=safe.slice(i,i+batchSize),vectors=await call(batch.map(x=>x.text));
    for(let j=0;j<vectors.length;j++){
     dimension??=vectors[j].length;if(vectors[j].length!==dimension)throw Error('VECTOR_DIMENSION_MISMATCH');
     next.push({...batch[j].ref,vector:vectors[j]});
    }
   }
   if(getCatalog().revision!==revision)return {status:'stale'};
   index={revision,dimension,rows:next};return {status:'ready',revision,count:next.length,dimension};
  }catch{return {status:'unavailable'};}
 }
 async function search({text,services=[],limit=5}={}){
  const c=getCatalog();let clean;
  try{clean=sanitizeText(text);}catch{return {mode:'lexical',results:[]};}
  if(!Array.isArray(services)||!Number.isInteger(limit)||limit<1||limit>10)return {mode:'lexical',results:[]};
  if(!clean.text||clean.categories.length)return {mode:'lexical',results:[]};
  const intent=classify(clean.text);
  if(['safety','exam'].includes(intent.domain)||intent.facts.mfa_prompt==='unexpected'||intent.facts.error_conflict)return {mode:'protected_or_conflicting',results:[]};
  const lexical=searchKnowledge(c,{text:clean.text,services,limit:10});
  const fallback=()=>({mode:'lexical',results:lexical.slice(0,limit)});
  if(!enabled||!index||index.revision!==c.revision||busy||clean.categories.length||!clean.text)return fallback();
  // Error-code queries may only use explicit reviewed metadata associations.
  if(intent.facts.error_signature)return fallback();
  // Retain the exact-match ranking ahead of semantic-only suggestions.
  if(lexical[0]?.exactPhrase||lexical[0]?.exactError)return fallback();
  const pinned=index;
  try{
   const [vector]=await call([clean.text]);
   if(getCatalog().revision!==c.revision||index!==pinned)return {mode:'stale',results:[]};
   if(vector.length!==pinned.dimension)return fallback();
   const allowed=new Set(entries(c).filter(g=>eligible(g,{catalog:c,services})).map(g=>g.id));
   const semantic=pinned.rows.filter(g=>allowed.has(g.id)).map(g=>({g,similarity:dot(vector,g.vector)})).filter(x=>x.similarity>=minimumSimilarity).sort((a,b)=>b.similarity-a.similarity).slice(0,10);
   const combined=new Map();
   lexical.forEach((g,i)=>combined.set(g.id,{...g,rankScore:1/(40+i+1),channels:['lexical']}));
   semantic.forEach(({g,similarity},i)=>{
    const old=combined.get(g.id),base=old||{id:g.id,kind:g.kind,serviceId:g.serviceId,title:g.title,exactPhrase:false,rankScore:0,channels:[]};
    combined.set(g.id,{...base,rankScore:base.rankScore+0.7/(40+i+1),channels:[...base.channels,'semantic'],similarity});
   });
   return {mode:'hybrid',results:[...combined.values()].sort((a,b)=>b.rankScore-a.rankScore||a.id.localeCompare(b.id)).slice(0,limit)};
  }catch{return fallback();}
 }
 const status=()=>({enabled,ready:Boolean(index&&index.revision===getCatalog().revision),revision:index?.revision??null,count:index?.rows.length??0,busy});
 const invalidate=()=>{index=null;};
 return Object.freeze({rebuild,search,status,invalidate});
}
