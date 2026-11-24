import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmbeddedAnswerBridge} from '../src/integration/embedded-bridge.mjs';
import {syntheticNative,clone,deferred} from './fixtures/native-synthetic.mjs';
function lab(overrides={}){
 const n=syntheticNative();let time=1000000,serial=0,allowed=true,incidents=[];
 const students={a:{role:'STUDENT',actorRef:'synthetic-a',visitRef:'synthetic-visit-a',active:true},b:{role:'STUDENT',actorRef:'synthetic-b',visitRef:'synthetic-visit-b',active:true}};
 const policy={allowed:true,revision:'synthetic-policy',allowedNativeServiceIds:[n.owner.id],diagnosticServices:['mail','network','identity','other'],examStatus:'not-started',allowMfaRecovery:true,allowModelAdvice:false};
 const bridge=createEmbeddedAnswerBridge({authenticate:async token=>students[token]??null,enabled:async()=>allowed,
  routeInput:async()=>({kind:'supplemental',scopeKey:'synthetic-scope'}),resolvePolicy:async()=>clone(policy),
  getConfiguration:async()=>clone(n.configuration),getMapping:async()=>clone(n.mapping),...n.callbacks,
  getIncidents:async()=>clone(incidents),getExistingRequest:async()=>({status:'none'}),verifyRecoveryCompletion:async()=>null,
  now:()=>time,newId:()=> 'synthetic-id-'+(++serial),...overrides});
 const call=(token,action,params={})=>bridge.dispatch(token,{action,...params});
 const begin=(token='a',text='Email not working',expectedVersion=0)=>call(token,'begin',{text,language:'en',expectedVersion});
 const mutation=(token,v,action,params={})=>call(token,action,{expectedVersion:v.version,issueId:v.issue.issueId,...params});
 const choose=(token,v,optionId)=>mutation(token,v,'respond',{questionId:v.issue.decision.questionId??v.issue.decision.followUp?.questionId,optionId});
 return {n,students,policy,bridge,call,begin,mutation,choose,advance:ms=>time+=ms,setAllowed:v=>allowed=v,setIncidents:x=>incidents=x};
}
test('embedded sessions isolate issue IDs and stale versions',async()=>{
 const l=lab(),a=await l.begin(),b=await l.begin('b');
 assert.notEqual(a.issue.issueId,b.issue.issueId);
 await assert.rejects(()=>l.mutation('b',a,'clear'),/STALE_ISSUE/);
 const next=await l.choose('a',a,'send');assert.equal(next.version,a.version+1);
 await assert.rejects(()=>l.choose('a',a,'send'),/STALE_VERSION/);
 assert.equal((await l.call('b','read')).issue.issueId,b.issue.issueId);
});
test('new pending visits consume capacity before a row exists',async()=>{
 const entered=deferred(),gate=deferred(),l=lab({maxVisits:1,routeInput:async()=>{entered.resolve();await gate.promise;return {kind:'supplemental',scopeKey:'synthetic-scope'};}});
 const first=l.begin();await entered.promise;
 const b=await l.begin('b');assert.equal(b.kind,'delegate');assert.equal(b.reason,'HOST_CAPACITY');
 gate.resolve();await first;assert.equal(l.bridge.stats().visits,1);
 l.bridge.forgetVisit(l.students.a.visitRef);assert.equal(l.bridge.stats().visits,0);
});
test('native cancellation discards outstanding initial result',async()=>{
 const entered=deferred(),gate=deferred(),l=lab({routeInput:async()=>{entered.resolve();await gate.promise;return {kind:'supplemental',scopeKey:'synthetic-scope'};}});
 const first=l.begin(),rejected=assert.rejects(first,/VISIT_ENDED/);await entered.promise;
 l.bridge.forgetVisit(l.students.a.visitRef);gate.resolve();await rejected;
 assert.equal(l.bridge.stats().visits,0);assert.equal(l.bridge.stats().inFlight,0);
});
test('idle issue cleanup preserves version tombstone and rejects stale begin',async()=>{
 const l=lab(),v=await l.begin();l.advance(2000);
 assert.equal(l.bridge.expireIdleIssues({idleMs:1000}),1);
 const next=await l.call('a','read');assert.equal(next.issue,null);assert.equal(next.version,v.version+1);
 await assert.rejects(()=>l.begin('a','Email not working',0),/STALE_VERSION/);
 assert.equal((await l.begin('a','Email not working',next.version)).version,next.version+1);
});
test('new native policy or confirmed incident invalidates old diagnostic state',async()=>{
 const l=lab(),v=await l.begin();l.policy.revision='synthetic-policy-2';
 const cleared=await l.call('a','read');assert.equal(cleared.kind,'delegate');assert.equal(cleared.reason,'CATALOG_CHANGED');assert.equal(cleared.issue,null);
 const b=await l.begin('a','Wi-Fi not working',cleared.version);
 l.setIncidents([{id:'synthetic-incident',serviceId:'network',status:'confirmed',authority:'authorized_staff',updatedAt:999999,expiresAt:1100000}]);
 const r=await l.call('a','read');assert.equal(r.reason,'CATALOG_CHANGED');assert.equal(r.issue,null);
});
test('native guide launch is an undo barrier; return never proves success',async()=>{
 const l=lab();let v=await l.begin('a','Cannot send email');
 assert.equal(v.issue.decision.questionId,'send_error');
 v=await l.choose('a',v,'address');assert.equal(v.issue.decision.kind,'open_guide');assert.equal(v.issue.canUndo,true);
 const opened=await l.mutation('a',v,'open_guide',{guideId:v.issue.decision.guideId});
 assert.equal(opened.kind,'open_native_guide');assert.equal(opened.issue.canUndo,false);
 await assert.rejects(()=>l.mutation('a',opened,'undo'),/UNDO_NOT_AVAILABLE/);
 const pending=await l.mutation('a',opened,'refresh_native_guide');assert.equal(pending.kind,'native_guide_pending');assert.equal(pending.issue.decision.kind,'open_guide');
 const failed=await l.choose('a',pending,'no');assert.equal(failed.issue.decision.questionId,'guide_result');assert.equal(failed.issue.canUndo,false);
});
test('native guide eligibility is refreshed even without policy revision change',async()=>{
 const l=lab(),v=await l.begin('a','Recipient address not found');
 assert.equal(v.issue.decision.kind,'open_guide');
 l.n.configuration.guides[0].isEnabled=false;l.n.refreshPins();
 const r=await l.call('a','read');assert.equal(r.reason,'CATALOG_CHANGED');assert.equal(r.issue,null);
});
test('screenshot advice requires explicit native feature policy and opaque reference',async()=>{
 let providerCalls=0;const l=lab({screenshotAdvisor:{suggest:async()=>{providerCalls++;return null;}},authorizeScreenshot:async()=>true,getApprovedScreenshot:async()=>null});
 const v=await l.begin();
 await assert.rejects(()=>l.mutation('a',v,'screenshot_advice',{screenshotRef:'https://example.test/photo'}),/INVALID_SCREENSHOT_REFERENCE/);
 const result=await l.mutation('a',v,'screenshot_advice',{screenshotRef:'synthetic_receipt_00001'});
 assert.equal(result.reasonCode,'SCREENSHOT_NOT_AVAILABLE');assert.equal(providerCalls,0);
 assert.equal(result.version,v.version);
});

test('native draft rechecks existing request before offering duplicate navigation',async()=>{
 let reads=0;const l=lab({getExistingRequest:async()=>++reads===1?{status:'none'}:{status:'recorded',reference:'synthetic-existing-case'}});
 const v=await l.begin('a','550 5.1.8');assert.equal(v.issue.decision.kind,'offer_support');
 const result=await l.mutation('a',v,'prepare_native_draft');assert.equal(result.kind,'existing_native_request');assert.equal(result.reference,'synthetic-existing-case');
});
test('native recovery must still refer to the same recorded request after completion check',async()=>{
 let ref='synthetic-recovery-a';const l=lab({getExistingRequest:async()=>({status:'recorded',reference:ref}),verifyRecoveryCompletion:async({reference})=>{ref='synthetic-recovery-b';return {status:'completed',verified:true,reference};}});
 let v=await l.begin('a','I changed my phone and use Authenticator');v=await l.choose('a',v,'transfer');v=await l.choose('a',v,'no');assert.equal(v.issue.decision.kind,'offer_mfa_recovery');
 const result=await l.mutation('a',v,'refresh_recovery');assert.equal(result.kind,'recovery_pending');assert.equal(result.issue.decision.kind,'offer_mfa_recovery');
});

test('AI-disabled policy never invokes injected providers or screenshot hooks',async()=>{
 let calls=0;
 const forbidden=async()=>{calls++;throw Error('AI_MUST_NOT_RUN');};
 const l=lab({intakeAdvisor:{suggest:forbidden},replyAdvisor:{suggest:forbidden},screenshotAdvisor:{suggest:forbidden},authorizeScreenshot:forbidden,getApprovedScreenshot:forbidden});
 l.policy.allowIntakeAdvice=true;l.policy.allowScreenshotAdvice=true;
 let v=await l.begin();
 assert.equal(v.issue.decision.questionId,'task');
 const picture=await l.mutation('a',v,'screenshot_advice',{screenshotRef:'synthetic_screenshot_123'});
 assert.equal(picture.reasonCode,'SCREENSHOT_NOT_AVAILABLE');
 v=await l.choose('a',v,'send');assert.equal(v.issue.decision.questionId,'send_error');
 v=await l.choose('a',v,'address');assert.equal(v.issue.decision.kind,'open_guide');
 v=await l.mutation('a',v,'open_guide',{guideId:v.issue.decision.guideId});assert.equal(v.kind,'open_native_guide');
 v=await l.choose('a',v,'yes');assert.equal(v.issue.decision.kind,'resolved_reported');assert.equal(calls,0);
});
test('no model or provider needed for native MFA handoff',async()=>{
 const l=lab();let v=await l.begin('a','I changed my phone and use Authenticator');
 v=await l.choose('a',v,'transfer');v=await l.choose('a',v,'no');
 assert.equal(v.issue.decision.kind,'offer_mfa_recovery');
 const d=await l.mutation('a',v,'prepare_native_draft');assert.equal(d.kind,'open_native_draft');assert.equal(d.channel,'mfa_recovery');
});
test('provider exception during intake cannot prevent deterministic diagnosis',async()=>{
 let calls=0;const unavailable=async()=>{calls++;throw Error('MODEL_OFFLINE');};
 const l=lab({intakeAdvisor:{suggest:unavailable}});l.policy.allowModelAdvice=true;l.policy.allowIntakeAdvice=true;
 let v=await l.begin();assert.equal(calls,1);assert.equal(v.kind,'state');assert.equal(v.issue.decision.questionId,'task');
 v=await l.choose('a',v,'send');v=await l.choose('a',v,'address');assert.equal(v.issue.decision.kind,'open_guide');
});
test('provider timeout leaves deterministic session usable and retains actual resource lease',async()=>{
 const gate=deferred();let calls=0;
 const l=lab({adviceTimeoutMs:100,intakeAdvisor:{suggest:async()=>{calls++;await gate.promise;return null;}}});
 l.policy.allowModelAdvice=true;l.policy.allowIntakeAdvice=true;
 try{
  let v=await l.begin();assert.equal(v.kind,'state');assert.equal(calls,1);
  const b=await l.begin('b');assert.equal(b.kind,'state');assert.equal(calls,1);
  v=await l.choose('a',v,'send');v=await l.choose('a',v,'address');assert.equal(v.issue.decision.kind,'open_guide');
 }finally{gate.resolve();}
});
test('failed contextual model does not replace a valid fixed answer',async()=>{
 let calls=0;const l=lab({replyAdvisor:{suggest:async()=>{calls++;throw Error('MODEL_OFFLINE');}}});
 l.policy.allowModelAdvice=true;
 const v=await l.begin();
 const uncertain=await l.mutation('a',v,'respond',{text:'The situation seems rather peculiar'});
 assert.equal(uncertain.kind,'clarify');assert.equal(calls,1);assert.equal(uncertain.version,v.version);assert.equal(uncertain.issue.decision.questionId,'task');
 const answered=await l.choose('a',uncertain,'send');assert.equal(answered.issue.decision.questionId,'send_error');
});
test('sustained synthetic concurrent visits work with no model hooks', {timeout:30000},async()=>{
 const n=syntheticNative(),count=32,rounds=12,actors=new Map();
 for(let i=0;i<count;i++)actors.set('s'+i,{role:'STUDENT',actorRef:'synthetic-load-actor-'+i,visitRef:'synthetic-load-visit-'+i,active:true});
 let serial=0;const times=[];
 const bridge=createEmbeddedAnswerBridge({
  authenticate:async token=>actors.get(token),enabled:async()=>true,
  routeInput:async()=>({kind:'supplemental',scopeKey:'synthetic-load-scope'}),
  resolvePolicy:async()=>({allowed:true,revision:'synthetic-load-policy',allowedNativeServiceIds:[n.owner.id],diagnosticServices:['mail'],examStatus:'not-started',allowMfaRecovery:false,allowModelAdvice:false}),
  getConfiguration:async()=>clone(n.configuration),getMapping:async()=>clone(n.mapping),...n.callbacks,getExistingRequest:async()=>({status:'none'}),verifyRecoveryCompletion:async()=>null,
  now:()=>1000000,newId:()=> 'synthetic-load-'+(++serial),maxVisits:count
 });
 async function command(token,input){
  const start=performance.now();const result=await bridge.dispatch(token,input);times.push(performance.now()-start);return result;
 }
 const start=performance.now();
 await Promise.all([...actors.keys()].map(async token=>{
  let v={version:0};
  for(let r=0;r<rounds;r++){
   v=await command(token,{action:'begin',expectedVersion:v.version,text:'Cannot send email',language:r%2?'ar':'en'});
   assert.equal(v.issue.decision.questionId,'send_error');
   const mutate=(action,extra)=>command(token,{action,expectedVersion:v.version,issueId:v.issue.issueId,...extra});
   v=await mutate('respond',{questionId:'send_error',optionId:'address'});assert.equal(v.issue.decision.kind,'open_guide');
   v=await mutate('open_guide',{guideId:v.issue.decision.guideId});assert.equal(v.kind,'open_native_guide');
   v=await mutate('respond',{questionId:'outcome',optionId:'yes'});assert.equal(v.issue.decision.kind,'resolved_reported');
  }
 }));
 assert.equal(times.length,count*rounds*4);
 assert.equal(bridge.stats().visits,count);assert.equal(bridge.stats().inFlight,0);
 for(const actor of actors.values())bridge.forgetVisit(actor.visitRef);
 assert.equal(bridge.stats().visits,0);
 const elapsed=performance.now()-start;times.sort((a,b)=>a-b);
 console.log('SYNTHETIC_LOAD '+JSON.stringify({visits:count,rounds,operations:times.length,elapsedMs:Math.round(elapsed),p95Ms:Math.round(times[Math.ceil(times.length*.95)-1]*100)/100}));
});
