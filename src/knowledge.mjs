/**
 * Local reviewed-knowledge retrieval. Scores are ranking signals, not probabilities.
 * No model, external source, URL, or generated procedure is used.
 */
import {normalize} from './classify.mjs';
const STOP=new Set(['i','my','the','a','an','to','of','is','it','how','do','can','what','please','help','me','and','or','for','on','in','with','this','كيف','ما','هو','هي','هل','انا','من','في','علي','الي','عن','مع','ممكن','اريد']);
const CONCEPTS=new Map([
 ...['mfa','authenticator','مصادقه','المصادقه','التحقق'].map(x=>[x,'mfa']),
 ...['outlook','email','mail','البريد','ايميل','الايميل'].map(x=>[x,'email']),
 ...['wifi','وايفاي','الوايفاي','النت','انترنت','الانترنت'].map(x=>[x,'network']),
 ...['printer','printing','الطباعه','طابعه','الطابعه'].map(x=>[x,'printer']),
 ...['camera','webcam','كاميرا','الكاميرا'].map(x=>[x,'camera']),
 ...['microphone','mic','ميكروفون','الميكروفون'].map(x=>[x,'microphone']),
 ...['windows','ويندوز'].map(x=>[x,'windows']),
 ...['macos','ماك'].map(x=>[x,'macos']),
 ...['zoom','زوم'].map(x=>[x,'zoom']),
 ...['moodle','مودل','موديل'].map(x=>[x,'moodle'])
]);
const tokens=t=>[...new Set(normalize(t).replace(/\bwi fi\b|الواي فاي|واي فاي/g,'wifi').split(/\s+/).filter(x=>x.length>1&&!STOP.has(x)).map(x=>CONCEPTS.get(x)||x))];
const bounded=s=>typeof s==='string'&&s.length>0&&s.length<=500;
const titles=g=>[g.title?.en,g.title?.ar].filter(bounded);
function phrases(g){
 return [...titles(g),...(Array.isArray(g.aliases)?g.aliases.filter(bounded):[])].map(normalize).filter(Boolean);
}
function distance(a,b){
 if(Math.abs(a.length-b.length)>1||a.length<5||b.length<5||a.length>40||b.length>40)return false;
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue;}
  if(++edits>1)return false;
  if(a.length>b.length)i++;else if(a.length<b.length)j++;else{i++;j++;}
 }
 return edits+(a.length-i)+(b.length-j)<=1;
}
export const eligible=(entry,{audience='student',services=[],catalog}={})=>
 Boolean(entry&&entry.enabled===true&&entry.reviewed===true&&entry.audience===audience&&
 (!services.length||services.includes(entry.serviceId))&&
 (!catalog?.serviceAvailability||catalog.serviceAvailability[entry.serviceId]!==false));
export function searchKnowledge(catalog,{text,services=[],audience='student',limit=5}={}){
 if(!bounded(text)||!Array.isArray(services)||!['student','staff'].includes(audience)||!Number.isInteger(limit)||limit<1||limit>10)return [];
 const norm=normalize(text),query=tokens(text);
 if(!query.length)return [];
 const entries=[...(catalog.guides||[]).map(e=>({...e,kind:'guide'})),...(catalog.facts||[]).map(e=>({...e,kind:'fact'}))];
 const results=[];
 for(const g of entries){
  if(!eligible(g,{audience,services,catalog}))continue;
  const ps=phrases(g),index=new Map();
  for(const w of tokens(ps.join(' ')))index.set(w,3);
  for(const w of tokens((g.keywords||[]).filter(bounded).join(' ')))index.set(w,Math.max(2,index.get(w)||0));
  for(const w of tokens((g.errorSignatures||[]).filter(bounded).join(' ')))index.set(w,6);
  let score=0,matched=0,exact=0;
  for(const w of query){
   if(index.has(w)){score+=index.get(w);matched++;exact++;continue;}
   if([...index.keys()].some(k=>distance(k,w))){score+=1;matched++;}
  }
  const phrase=ps.some(p=>p===norm);
  if(phrase)score+=12;
  const coverage=matched/query.length;
  if(!phrase&&(exact<1||score<4||coverage<0.5))continue;
  results.push({id:g.id,kind:g.kind,serviceId:g.serviceId,title:g.title,score,coverage,exactPhrase:phrase});
 }
 return results.sort((a,b)=>Number(b.exactPhrase)-Number(a.exactPhrase)||b.score-a.score||b.coverage-a.coverage||a.id.localeCompare(b.id)).slice(0,limit);
}
// Direct answers require an exact reviewed question alias, unique among eligible facts.
// A search hit on a guide or a fuzzy match is not permission to produce a fact.
export function exactReviewedFact(catalog,text,services=[]){
 const norm=normalize(text);
 const matches=(catalog.facts||[]).filter(g=>eligible(g,{services,catalog})&&
  (g.aliases||[]).some(a=>normalize(a)===norm));
 return matches.length===1?matches[0]:null;
}
