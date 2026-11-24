const $=id=>document.getElementById(id);
const root=$('root'),key=document.querySelector('meta[name="workbench-key"]').content;
let meta,persona='student-a',student=null,staffData=null,managerData=null,workspace=null,ledger=[],language='en',tab='visits',selectedVisit=null,detail=null,caseMatches=[],guide=null,guideStep=1,results=null,errorResult=null,busy=false,deliveryMessage='';
const labels={offer_support:'IT assistance recommended',offer_mfa_recovery:'Verification recovery required',incident_notice:'Confirmed service incident (simulation)',safety_referral:'Authorized support or professor first',resolved_reported:'Original task reported as working'};
const arLabels={offer_support:'يوصى بالدعم التقني',offer_mfa_recovery:'يلزم استعادة التحقق',incident_notice:'انقطاع مؤكد في المحاكاة',safety_referral:'راجع الدعم المخول أو الأستاذ أولاً',resolved_reported:'أفاد الطالب بأن المهمة تعمل'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
function append(parent,...children){for(const child of children)if(child)parent.append(child);return parent;}
const panel=(title,...children)=>append(el('section',undefined,'panel'),el('h2',title),...children);
const row=(...children)=>append(el('div',undefined,'row'),...children);
const stack=(...children)=>append(el('div',undefined,'stack'),...children);
const tag=text=>el('span',text,'tag '+String(text).replace(/[^a-z_]/g,''));
const muted=text=>el('p',text,'muted');
const empty=text=>el('p',text,'empty');
function button(text,fn,cls='secondary',disabled=false){const b=el('button',text,cls);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>run(fn));return b;}
function select(options,value){const s=el('select');for(const item of options){const o=el('option',typeof item==='string'?item:item.label);o.value=typeof item==='string'?item:item.value;s.append(o);}s.value=value??options[0]?.value??options[0];return s;}
function field(label,node){return append(el('label',label),node);}
function input(placeholder,max=500){const i=el('input');i.placeholder=placeholder;i.maxLength=max;i.setAttribute('aria-label',placeholder);return i;}
function form(children,submit){const f=append(el('form',undefined,'inline-form'),...children);f.onsubmit=e=>{e.preventDefault();run(submit);};return f;}
function submitButton(text){const b=el('button',text,'primary');b.type='submit';return b;}
function facts(obj){const d=el('dl',undefined,'facts');for(const [k,v] of Object.entries(obj||{}))append(d,el('dt',k.replaceAll('_',' ')),el('dd',typeof v==='object'?JSON.stringify(v):v??'—'));return d;}
function trace(data){return append(el('details'),el('summary','Structured decision trace'),el('pre',JSON.stringify(data,null,2)));}
function table(headers,rows){
 const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');
 for(const r of rows){const line=el('tr');for(const cell of r){const td=el('td');if(cell instanceof Node)td.append(cell);else td.textContent=String(cell??'—');line.append(td);}body.append(line);}
 t.append(body);return append(el('div',undefined,'table-wrap'),t);
}
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
async function api(operation,options={}){
 const r=await fetch('/api/workbench',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Key':key},body:JSON.stringify({persona,operation,...options})});
 const j=await r.json();if(!r.ok||j.ok!==true)throw Error(j.error||'REQUEST_FAILED');return j.data;
}
const cmd=(action,fields={})=>api('dispatch',{command:{action,...fields}});
const op=(operation,data={})=>api(operation,{data});
const active=()=>meta.personas.find(p=>p.id===persona);
const concurrency=()=>({expectedVersion:student.version,issueId:student.issue?.issueId});
function t(en,ar){return language==='ar'?ar:en;}
async function run(fn){
 if(busy)return;busy=true;status('Working…');
 try{await fn();if($('status').textContent==='Working…')status('');}catch(e){status(String(e.message||e).replaceAll('_',' '),true);}
 finally{busy=false;}
}
async function updateGuide(){
 const d=student?.issue?.state?.decision;
 if(d?.kind!=='open_guide'){guide=null;guideStep=1;return;}
 if(guide?.id!==d.guideId||guide?.revision!==d.catalogRevision){
  const content=await cmd('load_guide',{...concurrency(),guideId:d.guideId});
  guide={...content,revision:d.catalogRevision};guideStep=student.issue.guideProgress?.find(x=>x.guideId===d.guideId)?.lastViewedStep||1;
 }
}
async function studentUpdate(next){student=next;language=next.issue?.state?.language||language;await updateGuide();render();}
async function begin(text){
 deliveryMessage='';results=null;errorResult=null;
 const next=await cmd('begin',{expectedVersion:student.version,text,language});await studentUpdate(next);
}
async function serviceCard(id){
 deliveryMessage='';results=null;
 const next=await cmd('begin',{expectedVersion:student.version,text:language==='ar'?'مشكلة':'It is broken',language});student=next;
 const d=next.issue.state.decision;
 if(d.kind==='ask'&&d.questionId==='service'&&d.question.options.some(o=>o.id===id)){
  const r=await cmd('respond',{...concurrency(),questionId:'service',optionId:id});await studentUpdate(r.visit);
 }else await studentUpdate(next);
}
async function choose(questionId,optionId){
 const r=await cmd('respond',{...concurrency(),questionId,optionId});await studentUpdate(r.visit);
}
function questionBox(q,id){
 const choices=el('div',undefined,'choices');
 q.options.forEach(o=>choices.append(button(o.label[language],()=>choose(id,o.id))));
 const answer=input(t('Type your answer','اكتب إجابتك'));
 const f=form([answer,submitButton(t('Send','إرسال'))],async()=>{
  const r=await cmd('respond',{...concurrency(),text:answer.value});
  if(r.kind==='clarify'){status(t('Please choose the matching option.','اختر الإجابة المناسبة.'),true);return;}
  await studentUpdate(r.visit);
 });
 return append(el('div'),el('h2',q.text[language]),choices,f);
}
async function progress(step){
 const d=student.issue.state.decision;
 const next=await cmd('guide_progress',{...concurrency(),guideId:d.guideId,step});guideStep=step;await studentUpdate(next);
}
function renderGuide(d){
 const box=el('div');box.append(el('h2',d.title[language]),muted(t('Reviewed synthetic guide reference. The real host supplies the complete approved procedure.','مرجع تجريبي. يعرض التطبيق الفعلي الإجراء المعتمد كاملاً.')));
 if(!guide){box.append(button(t('Load guide','عرض الدليل'),async()=>{await updateGuide();render();}));return box;}
 const steps=Array.isArray(guide.steps)?guide.steps:guide.steps[language]||[],at=Math.min(Math.max(guideStep,1),steps.length);
 if(steps.length){
  const p=el('progress');p.max=steps.length;p.value=at;const progressbar=append(el('div',undefined,'bar'),p);
  box.append(muted(t('Step ','الخطوة ')+at+' / '+steps.length),progressbar,append(el('div',undefined,'step-box'),el('p',steps[at-1])),row(button(t('Previous','السابق'),()=>progress(at-1),'secondary',at<=1),button(t('Next','التالي'),()=>progress(at+1),'primary',at>=steps.length)));
 }
 box.append(questionBox(d.followUp.question,'outcome'));return box;
}
async function submitHandoff(retry=false){
 const issue=student.issue;
 const requestKey='request-'+issue.issueId;
 if(!retry&&!confirm('Create a fictional support request in the isolated workbench?'))return;
 const r=await cmd(retry?'retry_handoff':'prepare_handoff',{...concurrency(),requestKey,...(retry?{}:{confirmed:true})});
 deliveryMessage='Simulated delivery: '+r.delivery.status+' (attempt '+r.delivery.attempt+')';await studentUpdate(r.visit);
}
function renderDecision(){
 const i=student?.issue,box=el('div',undefined,'result');
 if(!i){box.append(empty(t('Describe an issue or select a service to begin.','صف المشكلة أو اختر خدمة للبدء.')));return box;}
 if(!i.state){box.append(el('h2','Refresh required'),muted('The knowledge or incident revision changed. Start a new diagnosis to avoid stale guidance.'));return box;}
 const s=i.state,d=s.decision,ar=language==='ar';box.dir=ar?'rtl':'ltr';
 const head=row(tag(i.status),tag(d.kind),el('small',s.catalogRevision));box.append(head);
 if(deliveryMessage)box.append(el('div',deliveryMessage,'mini'));
 if(i.status==='awaiting_it'){box.append(el('h2',t('Waiting for authorized IT','بانتظار الدعم المخول')),muted(t('The fictional request is recorded. An intern must confirm recovery in the staff view.','تم تسجيل الطلب التجريبي. يجب أن يؤكد الموظف الاستعادة.')));}
 else if(i.status==='escalated'){box.append(el('h2',t('Fictional support request recorded','تم تسجيل طلب دعم تجريبي')));}
 else if(i.status==='handoff_failed'){box.append(el('h2','Definite simulated delivery failure'),muted('The destination confirmed no effect. A same-key retry is available.'),button('Retry same request',()=>submitHandoff(true),'primary'));}
 else if(['handoff_prepared','handoff_unknown'].includes(i.status)){box.append(el('h2','Delivery not confirmed'),muted('An authorized staff member must reconcile the fictional operation. No blind retry.'));}
 else if(d.kind==='ask')box.append(questionBox(d.question,d.questionId));
 else if(d.kind==='open_guide')box.append(renderGuide(d));
 else if(d.kind==='answer')box.append(el('h2',d.title[language]),el('p',d.answer[language]),muted('Source: '+d.sourceRef),questionBox(d.followUp.question,'outcome'));
 else{
  box.append(el('h2',(ar?arLabels:labels)[d.kind]||d.kind));
  if(d.kind==='safety_referral')box.append(muted(t('Do not bypass security or make disruptive changes during an active exam. Contact authorized support.','لا تتجاوز ضوابط الأمان أو تعطل اختباراً جارياً. تواصل مع الدعم المخول.')));
  if(d.kind==='incident_notice')box.append(muted('This is a scoped, fictional staff-confirmed incident, not a real service outage.'));
  if(d.kind==='resolved_reported')box.append(muted('Student-reported outcome, not independent verification of root cause.'));
  if(['offer_support','offer_mfa_recovery'].includes(d.kind)){
   box.append(muted('The host would use its existing authorized workflow. No real account action occurs.'),button(t('Confirm fictional support request','تأكيد طلب الدعم التجريبي'),()=>submitHandoff(),'primary'));
  }
  if(d.reasonCode==='POSSIBLE_SHARED_NETWORK_INCIDENT')box.append(button('Submit distinct-visit incident signal',async()=>{const r=await cmd('report_incident',concurrency());deliveryMessage=r.accepted?'Signal accepted; not a confirmed outage.':'Duplicate signal ignored.';render();}));
 }
 if(d.reasonCode||d.policyCode)box.append(muted((d.reasonCode||d.policyCode).replaceAll('_',' ')));
 if(!i.handoffRef&&!['awaiting_it','escalated','handoff_unknown','handoff_failed','handoff_prepared'].includes(i.status)){
  box.append(row(button(t('Correct previous answer','تصحيح الإجابة السابقة'),async()=>studentUpdate(await cmd('undo',concurrency())),'secondary',s.turn===0||d.kind==='safety_referral'),button(t('Clear current issue','مسح المشكلة الحالية'),async()=>studentUpdate(await cmd('cancel_issue',concurrency())),'secondary')));
 }
 return box;
}
function studentView(){
 const lang=select([{value:'en',label:'English'},{value:'ar',label:'العربية'}],language);
 lang.setAttribute('aria-label','Diagnosis language');lang.onchange=()=>run(async()=>{language=lang.value;if(student.issue?.state)await studentUpdate(await cmd('set_language',{...concurrency(),language}));else render();});
 const query=input(t('Search / Type Your Problem','ابحث أو اكتب مشكلتك'));
 const start=submitButton(t('Diagnose','تشخيص')),search=button(t('Find knowledge','بحث الأدلة'),async()=>{results=await cmd('search',{text:query.value,limit:8});render();});
 const searchForm=append(el('form',undefined,'searchbar'),query,start,search);searchForm.onsubmit=e=>{e.preventDefault();run(()=>begin(query.value));};
 const cards=el('div',undefined,'cards');cards.dir=language==='ar'?'rtl':'ltr';
 meta.services.filter(s=>s.id!=='other').forEach(s=>{const b=button('',()=>serviceCard(s.id),'service-card');append(b,el('b',s.id.slice(0,2).toUpperCase()),el('span',s[language]));cards.append(b);});
 const top=panel(t('Student support','دعم الطالب'),row(lang,tag(student?.persistent?'authorized persistent':'ordinary session'),button('Keep active',async()=>{await cmd('keep_alive');render();}),button('Finish session',async()=>{await cmd('finish');student=null;render();},'danger',student?.persistent===true)));
 if(!student){top.append(empty('The fictional visit is closed.'),button('Start a new fictional visit',async()=>studentUpdate(await api('start')),'primary'));root.append(top);return;}
 top.append(searchForm,cards);
 const err=input(t('Paste a fictional error code or message','الصق رمز خطأ تجريبي أو رسالة'),4000);
 const errorPanel=append(el('details'),el('summary','Error evidence'),form([err,submitButton('Interpret error')],async()=>{errorResult=await cmd('analyze_error',{text:err.value});render();}));
 if(errorResult){
  errorPanel.append(muted('Interpretation: '+errorResult.status));
  for(const signal of errorResult.signals||[]){const box=append(el('div',undefined,'mini'),el('strong',signal.code),muted(signal.stage.replaceAll('_',' ')),muted('Reported clue only; not a confirmed cause.'));if(errorResult.signals.length===1)box.append(button('Diagnose this code',()=>begin(signal.code),'primary'));errorPanel.append(box);}
  if(errorResult.privateInformationRemoved)errorPanel.append(muted('Potential private information was removed. Do not paste credentials.'));
 }
 top.append(errorPanel);
 if(results!==null){const r=append(el('div',undefined,'result'),el('h3','Eligible knowledge matches'));if(!results.length)r.append(empty('No reviewed matches.'));else results.forEach(g=>r.append(append(el('div',undefined,'mini'),el('strong',g.title?.[language]||g.id),muted(g.kind+' • '+g.serviceId+' • '+g.id))));top.append(r);}
 top.append(renderDecision());
 const s=student.issue?.state,inspector=panel('Diagnostic inspector',facts({session:student.persistent?'authorized persistent':'ordinary',version:student.version,status:student.issue?.status||'ready',domain:s?.domain||'—',services:s?.services?.join(', ')||'—',catalog:s?.catalogRevision||meta.catalogRevision}));
 if(s){
  inspector.append(el('h3','Reported evidence'),facts(Object.fromEntries(Object.entries(s.evidence).map(([k,v])=>[k,v.value+' ('+v.origin+')']))),el('h3','Candidate causes'));
  if(!s.candidates?.length)inspector.append(empty('No supported cause yet.'));
  else s.candidates.forEach(c=>inspector.append(append(el('div',undefined,'mini'),el('strong',c.causeId.replaceAll('_',' ')),row(tag(c.status),el('small',c.evidenceKeys.join(', ')||'No supporting evidence yet')))));
  if(s.errorHint)inspector.append(el('h3','Documented error signal'),facts({code:s.errorHint.code,stage:s.errorHint.stage,source:s.errorHint.sourceRef}));
  if(student.issue.guideProgress?.length)inspector.append(el('h3','Guide progress'),facts(Object.fromEntries(student.issue.guideProgress.map(g=>[g.guideId,g.furthestStep+' / '+g.totalSteps]))));
  inspector.append(trace(s));
 }
 root.append(append(el('div',undefined,'layout'),top,inspector));
}
async function refreshStaff(){
 staffData=await api('staff_snapshot');
 if(active().role==='manager')managerData=await api('manager_snapshot');else managerData=null;
 workspace=await api('catalog_workspace');ledger=await api('ledger_list');
 if(selectedVisit){
  try{detail=await cmd('read_visit',{targetVisitRef:selectedVisit});caseMatches=await cmd('case_matches',{targetVisitRef:selectedVisit});}catch{selectedVisit=null;detail=null;caseMatches=[];}
 }
}
async function inspect(ref){selectedVisit=ref;detail=await cmd('read_visit',{targetVisitRef:ref});caseMatches=await cmd('case_matches',{targetVisitRef:ref});render();}
async function staffAction(fn){await fn();await refreshStaff();render();}
function visitsView(){
 const visits=staffData?.visits||[],summary=append(el('div',undefined,'grid3'),...[
  ['Active visits',visits.length],['Persistent',visits.filter(v=>v.persistent).length],['Awaiting IT',visits.filter(v=>v.status==='awaiting_it').length]
 ].map(([name,count])=>panel(name,el('div',count,'kpi'))));
 const list=panel('Active diagnostic visits',muted('Authorized fictional staff view. Select a visit to inspect reported evidence and its handoff status.'));
 if(!visits.length)list.append(empty('No active fictional student visits. Switch persona to open one.'));
 else list.append(table(['Visit','Scope','Policy','Status','Actions'],visits.map(v=>[
  v.visitRef.slice(0,18)+'…',v.scope||'global',v.persistent?'Persistent':'Ordinary',tag(v.status),
  append(el('div',undefined,'table-actions'),button('Inspect',()=>inspect(v.visitRef)),button('Terminate',()=>staffAction(async()=>{if(confirm('Terminate this fictional visit?'))await cmd('terminate',{targetVisitRef:v.visitRef});}),'danger'),v.status==='awaiting_it'?button('Confirm recovery',()=>staffAction(()=>op('complete_recovery',{visitRef:v.visitRef})),'primary'):null,v.handoff&&['unknown','prepared'].includes(v.handoff.status)?button('Reconcile',()=>staffAction(()=>op('reconcile_delivery',{operationId:v.handoff.operationId}))):null)
 ])));
 const detailBox=panel('Selected visit');
 if(!detail)detailBox.append(empty('Choose Inspect to see a visit.'));
 else{
  const s=detail.issue?.state;detailBox.append(facts({visit:detail.visitRef,status:detail.issue?.status||'ready',persistent:detail.persistent,version:detail.version}),s?trace(s):empty('No active diagnostic issue.'));
  detailBox.append(el('h3','Reviewed similar cases'));
  if(!caseMatches.length)detailBox.append(empty('No matching approved structured case.'));
  else caseMatches.forEach(c=>detailBox.append(append(el('div',undefined,'mini'),el('strong',c.causeCode.replaceAll('_',' ')),muted(c.caseRef+' • '+c.matched+'/'+c.totalSignals+' matching signals • '+c.solutionRef))));
 }
 return stack(summary,append(el('div',undefined,'layout'),list,detailBox));
}
function incidentView(){
 const m=managerData||{},service=select(meta.services.map(s=>({value:s.id,label:s.en})),'network'),scope=select([{value:'site-a',label:'Site A'},{value:'site-b',label:'Site B'},{value:'global',label:'Global'}],'site-a');
 const create=panel('Incident control',muted('Create an investigating record, then confirm or dismiss it. No student report can confirm an outage.'),append(el('div',undefined,'controls'),field('Affected service',service),field('Scope',scope)),button('Open investigation',()=>staffAction(()=>cmd('incident_create',{serviceId:service.value,scope:scope.value==='global'?null:scope.value})),'primary'));
 const incidents=m.incidents||[];
 if(incidents.length)create.append(table(['Service','Scope','Status','Revision','Actions'],incidents.map(i=>[
  i.serviceId,i.scope||'global',tag(i.status),i.revision,append(el('div',undefined,'table-actions'),...((i.status==='investigating'?['confirmed','dismissed','resolved']:i.status==='confirmed'?['investigating','resolved','confirmed']:[]).map(s=>button(s==='confirmed'?'Confirm / refresh':s,()=>staffAction(()=>cmd('incident_transition',{incidentId:i.id,expectedRevision:i.revision,status:s}))))))
 ])));else create.append(empty('No incident records.'));
 const signals=panel('Suspected signals');
 const candidates=m.candidates||[];signals.append(candidates.length?table(['Service','Scope','Distinct visits','Status'],candidates.map(c=>[c.serviceId,c.scope||'global',c.distinctVisits,tag(c.status)])):empty('Three distinct fictional visit reports in a scope produce a candidate.'));
 const probes=panel('Monitoring observations',muted('Simulate observations from known probe IDs. Repeated unhealthy observations are evidence for staff, not confirmation.'));
 const probe=select((m.monitoring||[]).map(x=>({value:x.id,label:x.id}))),health=select(['healthy','unhealthy','unknown'],'unhealthy');
 if(m.monitoring?.length)probes.append(append(el('div',undefined,'controls'),field('Probe',probe),field('Status',health)),button('Record fictional observation',()=>staffAction(()=>op('observe_probe',{probeId:probe.value,status:health.value}))),table(['Probe','Service','Scope','Status','Failure streak'],m.monitoring.map(p=>[p.id,p.serviceId,p.scope||'global',tag(p.status),p.streak])));
 if(m.monitorCandidates?.length)probes.append(el('h3','Monitoring candidates'),facts(Object.fromEntries(m.monitorCandidates.map(c=>[c.probeId,c.consecutiveFailures+' unhealthy observations']))));
 return stack(append(el('div',undefined,'layout'),create,signals),probes);
}
function knowledgeView(){
 const k=workspace,proposals=staffData.proposals||[],preset=select([{value:'add_fact',label:'Add a reviewed synthetic factual answer'},{value:'disable_sample_guide',label:'Disable a synthetic recipient guide'}],'add_fact');
 const catalog=panel('Supplementary catalog workspace',facts({revision:k.currentRevision,guides:k.guideCount,facts:k.factCount,store_version:k.version}),muted('Only fictional presets are available. Drafts need another staff member’s approval and manager publication.'),row(preset,button('Stage draft',()=>staffAction(()=>op('stage_catalog',{preset:preset.value})),'primary')));
 if(k.drafts.length)catalog.append(table(['Draft','Author','Status','Actions'],k.drafts.map(d=>[d.id.slice(0,12),d.actorRef,tag(d.status),append(el('div',undefined,'table-actions'),d.status==='draft'&&d.actorRef!==persona?button('Approve',()=>staffAction(()=>op('review_catalog',{draftId:d.id,expectedDraftRevision:d.revision,decision:'approve'}))):null,d.status==='draft'&&d.actorRef!==persona?button('Reject',()=>staffAction(()=>op('review_catalog',{draftId:d.id,expectedDraftRevision:d.revision,decision:'reject'}))):null,d.status==='approved'&&active().role==='manager'?button('Publish synthetic revision',()=>staffAction(()=>op('publish_catalog',{draftId:d.id,expectedDraftRevision:d.revision})),'primary'):null)])));
 const history=panel('Revision history');
 if(!k.history.length)history.append(empty('Previous published revisions appear here.'));
 else history.append(table(['Revision','Replaced','Action'],k.history.map(h=>[h.revision,new Date(h.replacedAt).toLocaleString(),active().role==='manager'?button('Stage restore',()=>staffAction(()=>op('restore_catalog',{revision:h.revision}))):'Manager only'])));
 const proposalsPanel=panel('Reviewed case proposals',muted('A structured proposal is separate from publication. No private ticket content is imported.'));
 proposalsPanel.append(button('Create sample recovery proposal',()=>staffAction(()=>cmd('propose',{caseCode:'demo-case',causeCode:'verification_method_unavailable',solutionRef:'demo-mfa-ios',catalogRevision:k.currentRevision,proposalKind:'new_alias'})),'primary'));
 if(proposals.length)proposalsPanel.append(table(['Case','Cause','Status','Actions'],proposals.map(p=>[p.caseCode,p.causeCode,tag(p.status),append(el('div',undefined,'table-actions'),p.status==='draft'&&p.actorRef!==persona?button('Approve',()=>staffAction(()=>cmd('review',{proposalId:p.id,expectedRevision:p.revision,decision:'approve',currentCatalogRevision:k.currentRevision}))):null,p.status==='draft'&&p.actorRef!==persona?button('Reject',()=>staffAction(()=>cmd('review',{proposalId:p.id,expectedRevision:p.revision,decision:'reject',currentCatalogRevision:k.currentRevision}))):null,p.status==='approved_for_publication'?button('View candidate',async()=>{const c=await cmd('publication_candidate',{proposalId:p.id,currentCatalogRevision:k.currentRevision});proposalsPanel.append(trace(c));}):null)])));
 return stack(append(el('div',undefined,'layout'),catalog,history),proposalsPanel,panel('Recent workspace audit',k.audit.length?table(['Action','Actor','Reference'],k.audit.map(a=>[a.action,a.actorRef,a.ref.slice(0,16)])):empty('No workspace changes yet.')));
}
function operationsView(){
 const m=managerData,ledgerPanel=panel('Delivery ledger',muted('Metadata only. A simulated lost reply stays unknown until destination reconciliation.'));
 if(ledger.length)ledgerPanel.append(table(['Operation','Kind','Status','Attempt','Action'],ledger.map(o=>[o.operationId.slice(0,16),o.kind,tag(o.status),o.attempt,['unknown','sending'].includes(o.status)?button('Reconcile',()=>staffAction(()=>op('reconcile_delivery',{operationId:o.operationId}))):'—'])));
 else ledgerPanel.append(empty('No simulated delivery intents.'));
 if(active().role==='manager'){
  const mode=select([{value:'recorded',label:'Destination records the request'},{value:'lost_reply',label:'Destination records it, reply is lost'},{value:'definitive_failure',label:'Confirmed no effect'}],m.deliveryMode);
  ledgerPanel.append(el('h3','Simulated destination behavior'),row(mode,button('Set mode',()=>staffAction(()=>op('set_delivery_mode',{mode:mode.value})))));
 }
 const metricsPanel=panel('Aggregate event analytics',muted('Counts of fictional events, not verified students or root-cause accuracy.'));
 if(m?.analytics?.length)metricsPanel.append(table(['Event','Service','Reason','Count'],m.analytics.map(x=>[x.event,x.serviceId,x.reasonCode,x.count])));else metricsPanel.append(empty(active().role==='manager'?'No recorded events.':'Manager-only analytics.'));
 return stack(ledgerPanel,metricsPanel);
}
function staffView(){
 const tabs=[['visits','Active visits'],['knowledge','Knowledge & review'],['operations','Delivery & analytics'],...(active().role==='manager'?[['incidents','Incidents & monitoring']]:[])];
 if(!tabs.some(x=>x[0]===tab))tab='visits';
 const nav=el('div',undefined,'subnav');tabs.forEach(([id,name])=>nav.append(button(name,async()=>{tab=id;render();},tab===id?'active':'secondary')));
 root.append(nav,tab==='visits'?visitsView():tab==='knowledge'?knowledgeView():tab==='incidents'?incidentView():operationsView());
}
function render(){
 root.replaceChildren();
 const a=active();$('page-title').textContent=a.role==='student'?'Student support':a.role==='intern'?'Intern workspace':'Manager workspace';
 $('page-description').textContent=a.role==='student'?'Search, investigate, follow reviewed guidance, and report the outcome.':'Inspect scoped fictional visits, recovery workflows, knowledge and operational signals.';
 if(a.role==='student')studentView();else staffView();
 $('footer').textContent='Synthetic '+meta.persistence.replaceAll('_',' ')+' • Local model disabled • Build phase: validation deferred • No real IT actions';
}
async function refresh(){
 if(active().role==='student'){
  try{student=await cmd('read');await updateGuide();}catch(e){if(['VISIT_NOT_ACTIVE','UNAUTHENTICATED'].includes(e.message)){student=null;guide=null;}else throw e;}
 }else await refreshStaff();
 render();
}
async function switchPersona(id){
 persona=id;student=null;staffData=null;managerData=null;selectedVisit=null;detail=null;guide=null;guideStep=1;results=null;deliveryMessage='';
 errorResult=null;
 if(active().role==='student'){student=await api('start');language=student.issue?.state?.language||'en';await updateGuide();}
 else await refreshStaff();
 render();
}
$('refresh').onclick=()=>run(refresh);
$('persona').onchange=()=>run(()=>switchPersona($('persona').value));
run(async()=>{meta=await api('bootstrap');for(const p of meta.personas){const o=el('option',p.label+' • '+p.role);o.value=p.id;$('persona').append(o);}$('persona').value=persona;await switchPersona(persona);});
