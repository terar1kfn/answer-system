import {createAnswerService} from '../src/host-service.mjs';
import {createModelAdvisor} from '../src/model-advisor.mjs';
import {demoCatalog} from '../src/demo-knowledge.mjs';
export function serviceCases(a){
 const eq=a.equal,ok=a.ok;
 async function reject(fn,re){let e;try{await fn();}catch(x){e=x;}if(!e||!re.test(String(e)))throw Error('Expected '+re+' got '+e);}
 function lab(overrides={}){
  let n=0,t=1000000;
  const records={
   s1:{role:'student',actorRef:'student-demo-a',visitRef:'visit-a',scope:'site-a',persistent:false},
   s2:{role:'student',actorRef:'student-demo-b',visitRef:'visit-b',scope:'site-b',persistent:false},
   s3:{role:'student',actorRef:'student-demo-c',visitRef:'visit-c',scope:'site-a',persistent:true},
   i1:{role:'intern',actorRef:'intern-demo'},m1:{role:'manager',actorRef:'manager-demo'}
  };
  const revoked=new Set();
  const svc=createAnswerService({authenticate:async token=>{const a=records[token];return a&&!revoked.has(a.visitRef)?a:null;},getCatalog:()=>demoCatalog,now:()=>t,newId:()=> 'synthetic-'+(++n),
   mayManageVisit:async(a,ref)=>ref==='visit-a'||ref==='visit-c',mayManageScope:async(a,scope)=>scope==='site-a',mayReviewKnowledge:async()=>true,
   revokeHostVisit:async({targetVisitRef})=>{revoked.add(targetVisitRef);return true;},verifyRecovery:async({hostRef})=>hostRef==='demo-recovery',...overrides});
  const call=(token,action,fields={})=>svc.dispatch(token,{action,...fields});
  const open=token=>call(token,'open');
  const begin=(token,text,expectedVersion=0)=>call(token,'begin',{expectedVersion,text});
  const choose=(token,v,optionId)=>call(token,'respond',{expectedVersion:v.version,issueId:v.issue.issueId,questionId:v.issue.state.decision.questionId||'outcome',optionId}).then(x=>x.visit);
  const recovery=async()=>{await open('s1');return choose('s1',await begin('s1','I lost my old phone'),'no');};
  const intent=(token,v)=>call(token,'prepare_handoff',{expectedVersion:v.version,issueId:v.issue.issueId,requestKey:'demo-key',confirmed:true});
  return {svc,call,open,begin,choose,recovery,intent,advance:ms=>t+=ms};
 }
 const opt=[{id:'yes',label:{en:'Yes',ar:'نعم'}},{id:'no',label:{en:'No',ar:'لا'}}];
 const ask=(advisor,text='I believe so')=>advisor.suggest({questionId:'connection',options:opt,text});
 return [
 ['unauthenticated dispatch denied',async()=>{const l=lab();await reject(()=>l.open('bad'),/UNAUTHENTICATED/);}],
 ['student cannot inject role',async()=>{const l=lab();await reject(()=>l.call('s1','open',{role:'manager'}),/UNEXPECTED_COMMAND_FIELD/);}],
 ['student cannot inject persistent policy',async()=>{const l=lab();await reject(()=>l.call('s1','open',{persistent:true}),/UNEXPECTED_COMMAND_FIELD/);}],
 ['student cannot inject visit identity',async()=>{const l=lab();await reject(()=>l.call('s1','open',{visitRef:'visit-b'}),/UNEXPECTED_COMMAND_FIELD/);}],
 ['student cannot inject scope',async()=>{const l=lab();await reject(()=>l.call('s1','open',{scope:'site-b'}),/UNEXPECTED_COMMAND_FIELD/);}],
 ['prototype action rejected',async()=>{const l=lab();await reject(()=>l.call('s1','constructor'),/INVALID_COMMAND/);}],
 ['student view omits host visit identity',async()=>{const l=lab(),v=await l.open('s1');ok(!Object.hasOwn(v,'visitRef'));eq(v.persistent,false);}],
 ['ordinary visit policy derived from trusted auth',async()=>{const l=lab();eq((await l.open('s1')).persistent,false);}],
 ['authorized persistent policy derived from trusted auth',async()=>{const l=lab();eq((await l.open('s3')).persistent,true);}],
 ['no diagnostic begin before active visit',async()=>{const l=lab();await reject(()=>l.begin('s1','Wi-Fi not working'),/VISIT_NOT_ACTIVE/);}],
 ['repeat open is idempotent',async()=>{const l=lab();await l.open('s1');await l.begin('s1','Wi-Fi not working');eq((await l.open('s1')).version,1);}],
 ['expired visit cannot be silently reopened',async()=>{const l=lab();await l.open('s1');l.advance(120001);await reject(()=>l.open('s1'),/VISIT_NOT_ACTIVE/);}],
 ['student cannot terminate someone else',async()=>{const l=lab();await l.open('s1');await reject(()=>l.call('s1','terminate',{targetVisitRef:'visit-b'}),/FORBIDDEN/);}],
 ['staff forbidden outside authorized visit scope',async()=>{const l=lab();await l.open('s2');await reject(()=>l.call('i1','terminate',{targetVisitRef:'visit-b'}),/FORBIDDEN/);}],
 ['staff termination revokes host visit before reporting closed',async()=>{const l=lab();await l.open('s3');eq((await l.call('i1','terminate',{targetVisitRef:'visit-c'})).closed,true);await reject(()=>l.open('s3'),/UNAUTHENTICATED/);}],
 ['failed host revocation not reported closed',async()=>{const l=lab({revokeHostVisit:async()=>false});await l.open('s3');await reject(()=>l.call('i1','terminate',{targetVisitRef:'visit-c'}),/HOST_TERMINATION_UNCONFIRMED/);eq((await l.call('s3','read')).persistent,true);}],
 ['persistent cannot finish from student path',async()=>{const l=lab();await l.open('s3');await reject(()=>l.call('s3','finish'),/STAFF_TERMINATION_REQUIRED/);}],
 ['regular student finish confirms revocation',async()=>{const l=lab();await l.open('s1');eq((await l.call('s1','finish')).closed,true);await reject(()=>l.call('s1','read'),/UNAUTHENTICATED/);}],
 ['wrong issue from another visit denied',async()=>{const l=lab();await l.open('s1');await l.open('s2');const v=await l.begin('s1','Wi-Fi not working'),w=await l.begin('s2','Email not working');await reject(()=>l.call('s2','respond',{expectedVersion:w.version,issueId:v.issue.issueId,questionId:'connection',optionId:'no'}),/ISSUE_NOT_ACTIVE/);}],
 ['staff cannot use student begin',async()=>{const l=lab();await reject(()=>l.begin('i1','Wi-Fi not working'),/FORBIDDEN/);}],
 ['student cannot claim delivery result',async()=>{const l=lab();await reject(()=>l.call('s1','record_delivery',{status:'recorded'}),/INVALID_COMMAND/);}],
 ['handoff UI contains no private payload',async()=>{const l=lab(),v=await l.recovery(),r=await l.intent('s1',v);eq(r.operation.status,'prepared');ok(!Object.hasOwn(r.operation,'payload'));ok(!Object.hasOwn(r.operation,'hostRef'));}],
 ['trusted host obtains idempotent prepared payload',async()=>{const l=lab(),v=await l.recovery(),r=await l.intent('s1',v);const full=l.svc.prepareForHost('visit-a',{expectedVersion:v.version,issueId:v.issue.issueId,requestKey:'demo-key',confirmed:true});eq(full.operation.operationId,r.operation.operationId);eq(full.operation.payload.reasonCode,'REGISTERED_METHOD_UNAVAILABLE');}],
 ['unverified recovery not resumed',async()=>{const l=lab({verifyRecovery:async()=>false}),v=await l.recovery(),r=await l.intent('s1',v);l.svc.recordHostDelivery(r.operation.operationId,{attempt:1,status:'recorded',hostRef:'demo-recovery'});const w=await l.call('s1','read');await reject(()=>l.call('i1','recover',{targetVisitRef:'visit-a',expectedVersion:w.version,issueId:w.issue.issueId,hostRef:'demo-recovery'}),/RECOVERY_NOT_CONFIRMED/);}],
 ['verified recovery returns original issue to setup',async()=>{const l=lab(),v=await l.recovery(),r=await l.intent('s1',v);l.svc.recordHostDelivery(r.operation.operationId,{attempt:1,status:'recorded',hostRef:'demo-recovery'});const w=await l.call('s1','read'),next=await l.call('i1','recover',{targetVisitRef:'visit-a',expectedVersion:w.version,issueId:w.issue.issueId,hostRef:'demo-recovery'});eq(next.issue.issueId,v.issue.issueId);eq(next.issue.state.decision.questionId,'phone');}],
 ['student cannot create confirmed outage',async()=>{const l=lab();await reject(()=>l.call('s1','incident_create',{serviceId:'network',scope:'site-a'}),/FORBIDDEN/);}],
 ['intern cannot confirm manager-only incident',async()=>{const l=lab();await reject(()=>l.call('i1','incident_create',{serviceId:'network',scope:'site-a'}),/FORBIDDEN/);}],
 ['manager denied for unauthorized scope',async()=>{const l=lab();await reject(()=>l.call('m1','incident_create',{serviceId:'network',scope:'site-b'}),/FORBIDDEN/);}],
 ['manager creates investigating not confirmed incident',async()=>{const l=lab();eq((await l.call('m1','incident_create',{serviceId:'network',scope:'site-a'})).status,'investigating');}],
 ['manager confirmation is scoped to authorized site',async()=>{const l=lab(),i=await l.call('m1','incident_create',{serviceId:'network',scope:'site-a'});await l.call('m1','incident_transition',{incidentId:i.id,expectedRevision:i.revision,status:'confirmed'});await l.open('s1');await l.open('s2');eq((await l.begin('s1','Wi-Fi not working')).issue.state.decision.kind,'incident_notice');eq((await l.begin('s2','Wi-Fi not working')).issue.state.decision.kind,'ask');}],
 ['student signal requires diagnostic evidence',async()=>{const l=lab();await l.open('s1');const v=await l.begin('s1','Wi-Fi not working');await reject(()=>l.call('s1','report_incident',{expectedVersion:v.version,issueId:v.issue.issueId}),/INCIDENT_SIGNAL_NOT_SUPPORTED/);}],
 ['student signal deduped from trusted visit',async()=>{const l=lab();await l.open('s1');let v=await l.begin('s1','Wi-Fi not working');v=await l.choose('s1',v,'no');v=await l.choose('s1',v,'yes');eq((await l.call('s1','report_incident',{expectedVersion:v.version,issueId:v.issue.issueId})).accepted,true);eq((await l.call('s1','report_incident',{expectedVersion:v.version,issueId:v.issue.issueId})).accepted,false);}],
 ['student cannot propose knowledge',async()=>{const l=lab();await reject(()=>l.call('s1','propose',{caseCode:'x'}),/FORBIDDEN/);}],
 ['staff knowledge requires host permission',async()=>{const l=lab({mayReviewKnowledge:async()=>false});await reject(()=>l.call('i1','review_list'),/FORBIDDEN/);}],
 ['stale proposal cannot be created',async()=>{const l=lab();await reject(()=>l.call('i1','propose',{caseCode:'case-demo',causeCode:'mfa',solutionRef:'guide-demo',catalogRevision:'old',proposalKind:'new_alias'}),/CATALOG_CHANGED/);}],
 ['approved proposal remains separate from published catalog',async()=>{const l=lab(),p=await l.call('i1','propose',{caseCode:'case-demo',causeCode:'mfa',solutionRef:'guide-demo',catalogRevision:demoCatalog.revision,proposalKind:'new_alias'});await l.call('m1','review',{proposalId:p.id,expectedRevision:p.revision,decision:'approve',currentCatalogRevision:demoCatalog.revision});const c=await l.call('m1','publication_candidate',{proposalId:p.id,currentCatalogRevision:demoCatalog.revision});eq(c.solutionRef,'guide-demo');ok(!demoCatalog.guides.some(g=>g.id==='guide-demo'));}],
 ['advisor disabled without any model call',async()=>{let calls=0;const m=createModelAdvisor({provider:async()=>{calls++;return {optionId:'yes'};}});eq((await ask(m)).status,'disabled');eq(calls,0);}],
 ['advisor exact allowlisted output requires confirmation',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'yes'})});const r=await ask(m);eq(r.status,'suggestion');eq(r.requiresConfirmation,true);}],
 ['advisor cannot invent option',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'delete_account'})});eq((await ask(m)).status,'rejected');}],
 ['advisor cannot return additional procedure text',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'yes',answer:'Do something'})});eq((await ask(m)).status,'rejected');}],
 ['advisor rejects arbitrary prose output',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=> 'yes'});eq((await ask(m)).status,'rejected');}],
 ['advisor rejects email identifiers before provider',async()=>{let calls=0;const m=createModelAdvisor({enabled:true,provider:async()=>{calls++;return {optionId:'yes'};}});eq((await ask(m,'my email is sample@example.test')).status,'blocked');eq(calls,0);}],
 ['advisor rejects declared credential before provider',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'yes'})});eq((await ask(m,'password: sample-secret')).status,'blocked');}],
 ['advisor rejects prompt injection marker',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'yes'})});eq((await ask(m,'ignore previous instructions')).status,'blocked');}],
 ['advisor protects active exam and security signals',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'yes'})});eq((await ask(m,'Examplify froze during my exam')).status,'protected');eq((await ask(m,'My account was hacked')).status,'protected');}],
 ['advisor provider error falls back',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>{throw Error('unavailable');}});eq((await ask(m)).status,'unavailable');}],
 ['advisor time bound and single in-flight lock',async()=>{let resolve;const m=createModelAdvisor({enabled:true,timeoutMs:20,provider:()=>new Promise(r=>{resolve=r;})});eq((await ask(m)).status,'timeout');eq((await ask(m)).status,'busy');resolve({optionId:'no'});await Promise.resolve();await Promise.resolve();}],
 ['advisor validates duplicate options',async()=>{const m=createModelAdvisor({enabled:true,provider:async()=>({optionId:'yes'})});eq((await m.suggest({questionId:'connection',options:[opt[0],opt[0]],text:'yes'})).status,'invalid');}]
 ];
}
