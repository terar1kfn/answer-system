import {createEngine} from '../src/engine.mjs';
import {demoCatalog} from '../src/demo-knowledge.mjs';
const $=id=>document.getElementById(id);
let engine,state,history=[];
const messages={
 offer_support:['IT support recommended. No ticket has been created.','يوصى بالتواصل مع الدعم. لم يتم إنشاء تذكرة.'],
 offer_mfa_recovery:['Offer the existing staff-managed verification recovery process. No account action has occurred.','عرض إجراء استعادة التحقق عبر الدعم. لم ينفذ أي إجراء على الحساب.'],
 incident_notice:['A simulated staff-confirmed service incident is active. This is not a real outage.','يوجد انقطاع مؤكد في المحاكاة فقط.'],
 safety_referral:['Refer to authorized IT or the professor first. Avoid disruptive exam troubleshooting.','راجع الدعم المخول أو الأستاذ أولاً وتجنب تعطيل الاختبار.'],
 resolved_reported:['The student reports success. The root cause has not been independently confirmed.','أفاد الطالب بالنجاح. لم يتم التحقق من السبب بشكل مستقل.']
};
const el=(tag,t,cls)=>{const n=document.createElement(tag);if(t!==undefined)n.textContent=t;if(cls)n.className=cls;return n;};
function choices(q,id){
 const wrap=el('div',undefined,'choices');const lang=state.language;
 for(const o of q.options){const b=el('button',o.label[lang]);b.type='button';b.onclick=()=>{try{state=engine.advance(state,{expectedTurn:state.turn,questionId:id,optionId:o.id});history.push([q.text[lang],o.label[lang]]);render();}catch(e){$('result').append(el('p',e.message));}};wrap.append(b);}return wrap;
}
function render(){
 const lang=state.language,ar=lang==='ar',d=state.decision;
 $('history').replaceChildren();$('history').dir=ar?'rtl':'ltr';
 for(const [q,a] of history){const row=el('div',undefined,'history');row.append(el('strong',q),el('span',a));$('history').append(row);}
 const box=el('section',undefined,'result');box.dir=ar?'rtl':'ltr';box.append(el('p',d.kind.replaceAll('_',' ').toUpperCase(),'eyebrow'));
 if(d.kind==='ask')box.append(el('h2',d.question.text[lang]),choices(d.question,d.questionId));
 else if(d.kind==='answer'){
  box.append(el('h2',d.title[lang]));
  for(const part of d.answerParts||[{title:d.title,answer:d.answer,sourceRef:d.sourceRef}])box.append(el('h3',part.title[lang]),el('p',part.answer[lang]),el('p','Synthetic reviewed fact — '+part.sourceRef,'sub'));
  box.append(el('h3',d.followUp.question.text[lang]),choices(d.followUp.question,'outcome'));
 }else if(d.kind==='open_guide'){
  const g=demoCatalog.guides.find(g=>g.id===d.guideId);
  box.append(el('h2',g.title[lang]),el('p',ar?'إجراء تجريبي وليس دليلاً معتمداً.':'Synthetic guide fixture, not an approved institutional procedure.','sub'));
  const list=el('ol');for(const step of g.steps[lang])list.append(el('li',step));box.append(list,el('h3',d.followUp.question.text[lang]),choices(d.followUp.question,'outcome'));
 }else box.append(el('h2',messages[d.kind]?.[ar?1:0]||d.kind));
 if(d.kind==='ask'||d.followUp){
  const form=el('form');const input=el('input');input.type='text';input.maxLength=500;input.placeholder=ar?'اكتب إجابتك':'Type your answer';input.setAttribute('aria-label',input.placeholder);input.required=true;
  const send=el('button',ar?'إرسال':'Send answer');send.type='submit';form.className='free-answer';form.append(input,send);
  form.onsubmit=e=>{e.preventDefault();try{const prior=state;const r=engine.respond(state,{expectedTurn:state.turn,text:input.value});if(r.kind==='clarify'){form.append(el('p',ar?'اختر الإجابة المناسبة أعلاه.':'Please choose the matching option above.','sub'));return;}state=r.state;const id=prior.decision.questionId||'outcome';const value=id==='confirm_current_error'&&state.lastErrorConfirmation?.turn===state.turn?state.lastErrorConfirmation.choice:state.evidence[id]?.value;const q=prior.decision.question||prior.decision.followUp.question;const matched=q.options.find(o=>o.id===value);if(matched&&state.decision.questionId!=='confirm_current_error')history.push([q.text[lang],matched.label[lang]]);else if(state.decision.kind==='safety_referral')history.push([q.text[lang],ar?'تمت الإحالة الآمنة':'Safety referral']);render();}catch(e){form.append(el('p',e.message,'sub'));}};
  box.append(form);
 }
 $('result').replaceChildren(box);$('summary').replaceChildren();
 for(const [k,v] of [['State',state.status],['Domain',state.domain],['Services',state.services.join(', ')||'Unknown'],['Turn',String(state.turn)],['Decision',d.kind],['Reason',d.reasonCode||d.policyCode||d.status||'—']])$('summary').append(el('dt',k),el('dd',v));
 $('trace').textContent=JSON.stringify(state,null,2);
}
$('form').onsubmit=e=>{e.preventDefault();const status=$('incident').value,t=Date.now();const incidents=status==='none'?[]:[{id:'demo-network-incident',serviceId:'network',status,authority:'authorized_staff',updatedAt:t,expiresAt:t+600000}];
 try{engine=createEngine({catalog:demoCatalog,incidents});state=engine.begin({text:$('query').value,language:$('lang').value});history=[];render();}catch(e){$('result').replaceChildren(el('p',e.message));}
};
document.querySelectorAll('[data-example]').forEach(b=>{b.onclick=()=>{$('query').value=b.dataset.example;$('query').focus();};});
