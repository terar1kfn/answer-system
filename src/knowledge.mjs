/**
 * Reviewed metadata retrieval. Exact aliases, explicit error-code mappings and
 * lexical relevance are separate signals; none authorizes a procedure.
 * The score is a ranking feature, not a probability or verified diagnosis.
 */
import {normalize} from './classify.mjs';
import {recognizeErrors} from './error-intelligence.mjs';
const STOP=new Set(['i','my','the','a','an','to','of','is','it','how','do','can','what','please','help','me','and','or','for','on','in','with','this','not','working','problem','issue','كيف','ما','هو','هي','هل','انا','من','في','علي','الي','عن','مع','ممكن','اريد','مشكله','المشكله']);
const CONCEPTS=new Map([
 ...['mfa','authenticator','مصادقه','المصادقه','التحقق','2fa'].map(x=>[x,'mfa']),
 ...['outlook','email','mail','البريد','ايميل','الايميل'].map(x=>[x,'email']),
 ...['wifi','وايفاي','الوايفاي','النت','انترنت','الانترنت'].map(x=>[x,'network']),
 ...['printer','printing','الطباعه','طابعه','الطابعه'].map(x=>[x,'printer']),
 ...['camera','webcam','كاميرا','الكاميرا'].map(x=>[x,'camera']),
 ...['microphone','mic','ميكروفون','الميكروفون'].map(x=>[x,'microphone']),
 ...['windows','ويندوز'].map(x=>[x,'windows']),
 ...['macos','ماك','macbook'].map(x=>[x,'macos']),
 ...['zoom','زوم'].map(x=>[x,'zoom']),
 ...['moodle','مودل','موديل'].map(x=>[x,'moodle']),
 ...['banner','بانر'].map(x=>[x,'banner']),
 ...['iphone','ايفون','ios'].map(x=>[x,'ios']),
 ...['android','اندرويد'].map(x=>[x,'android']),
 ...['password','باسورد','كلمه_المرور'].map(x=>[x,'password']),
 ...['signin','login','تسجيل_الدخول'].map(x=>[x,'login']),
 ...['recipients','recipient','مستلم','المستلم','المستلمين'].map(x=>[x,'recipient']),
 ...['attachment','attachments','مرفق','المرفق','المرفقات'].map(x=>[x,'attachment']),
 ...['sync','syncing','synchronization','مزامنه','المزامنه'].map(x=>[x,'sync']),
 ...['permission','permissions','اذن','اذونات','الاذن'].map(x=>[x,'permission']),
 ...['install','installation','تثبيت','التثبيت'].map(x=>[x,'install']),
 ...['setup','configure','configuration','اعداد','الاعداد'].map(x=>[x,'setup']),
 ...['send','sending','outgoing','ارسال','الارسال','ارسل'].map(x=>[x,'send']),
 ...['receive','receiving','incoming','استقبال','الاستقبال','استلم'].map(x=>[x,'receive'])
]);
function canonical(text){
 return normalize(text)
  .replace(/\bwi fi\b|الواي فاي|واي فاي/g,'wifi')
  .replace(/\btwo factor(?: authentication)?\b/g,'mfa')
  .replace(/\b(?:log in|sign in)\b/g,'login')
  .replace(/تسجيل الدخول/g,'تسجيل_الدخول').replace(/كلمه المرور/g,'كلمه_المرور');
}
const tokens=text=>[...new Set(canonical(text).split(/\s+/).filter(x=>x.length>1&&!STOP.has(x)).map(x=>CONCEPTS.get(x)||x))];
const bounded=s=>typeof s==='string'&&s.length>0&&s.length<=500;
const titles=g=>[g.title?.en,g.title?.ar].filter(bounded);
const terms=x=>Array.isArray(x)?x.filter(bounded).slice(0,100):[];
const phrases=g=>[...titles(g),...terms(g.aliases)].map(normalize).filter(Boolean);
const codeLike=x=>/\d/.test(x);
function distance(a,b){
 // Codes, quantities and short acronyms must match exactly. A one-character
 // error can completely change an identity or mail diagnostic code.
 if(codeLike(a)||codeLike(b)||Math.abs(a.length-b.length)>1||a.length<5||b.length<5||a.length>40||b.length>40)return false;
 if(a.length===b.length){
  const diffs=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])diffs.push(i);
  return diffs.length===1||(diffs.length===2&&diffs[1]===diffs[0]+1&&a[diffs[0]]===b[diffs[1]]&&a[diffs[1]]===b[diffs[0]]);
 }
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue;}
  if(++edits>1)return false;
  if(a.length>b.length)i++;else j++;
 }
 return edits+(a.length-i)+(b.length-j)<=1;
}
export const eligible=(entry,{audience='student',services=[],catalog}={})=>
 Boolean(entry&&entry.enabled===true&&entry.reviewed===true&&entry.audience===audience&&
 (!services.length||services.includes(entry.serviceId))&&
 (!catalog?.serviceAvailability||catalog.serviceAvailability[entry.serviceId]!==false)&&
 (audience!=='student'||!catalog?.diagnosticServices||catalog.diagnosticServices.includes(entry.serviceId)));
function document(entry){
 const ps=phrases(entry),weights=new Map();
 const add=(words,weight)=>{for(const w of words)weights.set(w,Math.max(weight,weights.get(w)||0));};
 add(tokens(titles(entry).join(' ')),4);
 add(tokens(terms(entry.aliases).join(' ')),3);
 add(tokens(terms(entry.keywords).join(' ')),2);
 add(tokens(terms(entry.errorSignatures).join(' ')),6);
 const codeMetadata=[...titles(entry),...terms(entry.aliases),...terms(entry.errorSignatures)];
 const codes=new Set(codeMetadata.flatMap(x=>[...recognizeErrors(x).map(e=>e.id),x]));
 return {entry,ps,weights,codes};
}
function exactErrorIds(doc,hints){return hints.filter(h=>doc.codes.has(h.id)||doc.codes.has(h.code)).map(h=>h.id);}
function containsPhrase(query,phrase){return (' '+query+' ').includes(' '+phrase+' ');}
function specificPhrase(ps,query){
 return ps.some(p=>tokens(p).length>=2&&containsPhrase(query,p));
}
/**
 * Build once per trusted, pinned catalog snapshot. No mutable global cache;
 * the caller must rebuild whenever its publication or permission view changes.
 */
export function createKnowledgeRetriever(catalog){
 const all=[...(catalog.guides||[]).map(e=>({...e,kind:'guide'})),...(catalog.facts||[]).map(e=>({...e,kind:'fact'}))].map(document);
 function search({text,services=[],audience='student',limit=5,kind='all'}={}){
  if(!bounded(text)||!Array.isArray(services)||!['student','staff'].includes(audience)||!['all','guide','fact'].includes(kind)||!Number.isInteger(limit)||limit<1||limit>10)return [];
  const norm=normalize(text),query=tokens(text),hints=recognizeErrors(text);
  if(!query.length||hints.length>1)return [];
  const docs=all.filter(d=>(kind==='all'||d.entry.kind===kind)&&eligible(d.entry,{audience,services,catalog}));
  const df=new Map();
  for(const d of docs)for(const w of d.weights.keys())df.set(w,(df.get(w)||0)+1);
  const rarity=w=>Math.min(3,1+Math.log((docs.length+1)/((df.get(w)||0)+1)));
  const results=[];
  for(const doc of docs){
   const g=doc.entry,codes=exactErrorIds(doc,hints);
   // A documented error query needs an explicit metadata association. Do not
   // let near-identical codes or general authentication words outrank it.
   if(hints.length&&!codes.length)continue;
   const phrase=doc.ps.includes(norm),contained=!phrase&&specificPhrase(doc.ps,norm);
   let score=0,rankScore=0,matched=0,exact=0;
   const exactTerms=[],approximateTerms=[];
   for(const w of query){
    if(doc.weights.has(w)){
     const weight=doc.weights.get(w);score+=weight;rankScore+=weight*rarity(w);matched++;exact++;exactTerms.push(w);continue;
    }
    if([...doc.weights.keys()].some(k=>distance(k,w))){score++;rankScore+=0.65;matched++;approximateTerms.push(w);}
   }
   if(phrase){score+=12;rankScore+=20;}
   if(contained){score+=4;rankScore+=6;}
   if(codes.length){score+=12;rankScore+=30;}
   const coverage=matched/query.length;
   if(!phrase&&!contained&&!codes.length&&(exact<1||score<4||coverage<0.5))continue;
   // Normalize broadly indexed documents modestly; high coverage and rare
   // discriminating terms matter more than the number of aliases.
   rankScore=(rankScore*(0.7+0.3*coverage))/(1+Math.max(0,doc.weights.size-40)/500);
   results.push({id:g.id,kind:g.kind,serviceId:g.serviceId,title:g.title,score,rankScore,coverage,exactPhrase:phrase,
    exactError:codes.length>0,containedPhrase:contained,matchEvidence:{exactTerms,approximateTerms,errorSignatureIds:codes}});
  }
  return results.sort((a,b)=>Number(b.exactError)-Number(a.exactError)||Number(b.exactPhrase)-Number(a.exactPhrase)||b.rankScore-a.rankScore||b.coverage-a.coverage||a.id.localeCompare(b.id)).slice(0,limit);
 }
 return Object.freeze({search});
}
export function searchKnowledge(catalog,request){return createKnowledgeRetriever(catalog).search(request);}
/** Exact reviewed questions only. Duplicate aliases are a catalog conflict,
 * not a reason to silently choose whichever answer has the better rank. */
export function resolveReviewedFact(catalog,text,services=[]){
 if(!bounded(text))return {status:'none'};
 const norm=normalize(text);
 const matches=(catalog.facts||[]).filter(g=>eligible(g,{services,catalog})&&
  (g.aliases||[]).some(a=>normalize(a)===norm));
 if(matches.length>1)return {status:'conflict',factIds:matches.map(g=>g.id)};
 return matches.length===1?{status:'exact',fact:matches[0]}:{status:'none'};
}
export function exactReviewedFact(catalog,text,services=[]){
 const result=resolveReviewedFact(catalog,text,services);
 return result.status==='exact'?result.fact:null;
}
