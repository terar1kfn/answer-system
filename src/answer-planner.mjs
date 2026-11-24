import {normalize} from './classify.mjs';
import {eligible,searchKnowledge} from './knowledge.mjs';
// A retrieved topic is a suggestion, never a generated factual answer.
export function isInformationalQuery(text){
 const t=normalize(text);
 return /^(?:what (?:is|are|does|do)|meaning of|definition of|where (?:is|can i find)|ما (?:هو|هي|معني|معنى)|ماذا يعني|اين)(?: |$)/.test(t);
}
export function reviewedTopicChoices(catalog,{text,services=[]}={}){
 if(!isInformationalQuery(text))return [];
 const found=searchKnowledge(catalog,{text,services,limit:10,kind:'fact'});
 const eligibleFacts=found.filter(r=>r.kind==='fact'&&(r.exactPhrase||r.coverage>=0.65)&&r.score>=4);
 // If two reviewed records have the same visible topic in either language,
 // a student cannot reliably choose between them. Leave them to staff review.
 const facts=eligibleFacts.filter(r=>!eligibleFacts.some(other=>other.id!==r.id&&['en','ar'].some(l=>normalize(other.title[l])===normalize(r.title[l])))).slice(0,3);
 return facts.flatMap((r,i)=>{
  const fact=(catalog.facts||[]).find(f=>f.id===r.id&&eligible(f,{catalog,services}));
  return fact?[{optionId:'topic_'+(i+1),factId:fact.id,label:{...fact.title}}]:[];
 });
}
export function reviewedTopicQuestion(choices){
 return {text:{en:'Which of these reviewed topics matches your question?',ar:'أي من هذه المواضيع المعتمدة يطابق سؤالك؟'},options:[
  ...choices.map(c=>({id:c.optionId,label:{...c.label}})),
  {id:'none',label:{en:'None of these — continue diagnosis',ar:'لا شيء منها — تابع التشخيص'}}
 ]};
}
