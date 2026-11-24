import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmbeddedAssistantController} from '../src/integration/client-controller.mjs';
import {createHomeSearchController} from '../src/integration/search-controller.mjs';
import {createApprovedMappingProvider} from '../src/integration/mapping-release.mjs';
import {newGuideLaunch,acceptNativeGuideReturn,guideContinuationView} from '../src/integration/guide-continuation.mjs';
import {nativeRecordFingerprint as digest} from '../src/integration/native-fingerprint.mjs';
import {createOllamaOptionProvider} from '../src/providers/ollama.mjs';
import {createAdviceCoordinator} from '../src/advice-coordinator.mjs';
import {QUESTIONS} from '../src/questions.mjs';
import {createEngine} from '../src/engine.mjs';
import {demoCatalog} from '../src/demo-knowledge.mjs';
import {syntheticNative,clone,deferred} from './fixtures/native-synthetic.mjs';

const askIssue=(id='synthetic-issue')=>({issueId:id,language:'en',status:'diagnosing',decision:{kind:'ask',questionId:'task',question:clone(QUESTIONS.task)},guideContinuation:null,canUndo:false});
const askView=(version=1,id)=>({kind:'state',version,issue:askIssue(id)});
const guideRef=()=>({guideId:'synthetic-guide',nativeServiceId:'synthetic-owner',catalogRevision:'native-synthetic',sourceRevision:'21',nativeGuideFingerprint:'a'.repeat(64),resolutionStepCount:2,entryMode:'resolution'});
const guideIssue=()=>({...askIssue(),status:'guidance',decision:{kind:'open_guide',guideId:guideRef().guideId,title:{en:'Fictional guide',ar:'دليل تجريبي'},followUp:{questionId:'outcome',question:clone(QUESTIONS.outcome)}},guideContinuation:{status:'offered',guideId:guideRef().guideId}});
const guideEffect=(ref=guideRef())=>({kind:'open_native_guide',version:2,issue:guideIssue(),launchRef:'synthetic-launch',reference:ref});
const draftIssue=()=>({...askIssue(),status:'handoff_offered',decision:{kind:'offer_support',reasonCode:'NO_APPROVED_GUIDE'}});
function client({request,onChange,onEffect,recordActivity}={}){
 const c=createEmbeddedAssistantController({request:request??(async()=>askView()),onChange,onEffect,recordActivity});c.bindVisit('synthetic-visit-a');return c;
}
test('client cancellation during pending render prevents transport from reaching a different visit',async()=>{
 let c,calls=0,armed=false;
 c=client({request:async()=>{calls++;return askView();},onChange:v=>{if(armed&&v.pending){armed=false;c.bindVisit('synthetic-visit-b');}}});
 armed=true;assert.equal((await c.refresh()).kind,'stale');assert.equal(calls,0);assert.equal(c.snapshot().issue,null);
});
test('client cancellation during activity hook prevents stale submission',async()=>{
 let c,calls=0;
 c=client({request:async()=>{calls++;return askView();},recordActivity:()=>c.bindVisit('synthetic-visit-b')});
 await c.refresh();assert.equal((await c.begin('Email problem')).kind,'stale');assert.equal(calls,1);assert.equal(c.snapshot().issue,null);
});
test('client render rebinding after response prevents even calling stale native effect',async()=>{
 let c,armed=false,effects=0;
 c=client({request:async command=>command.action==='read'?askView():{kind:'delegate',version:2,issue:null,reason:'NATIVE_EXACT_MATCH'},
  onChange:v=>{if(armed&&v.version===2){armed=false;c.bindVisit('synthetic-visit-b');}},onEffect:async()=>{effects++;}});
 await c.refresh();armed=true;assert.equal((await c.begin('Email problem')).kind,'stale');assert.equal(effects,0);
});
test('client rendering exception does not strand the single-flight lock or submit',async()=>{
 let armed=false,calls=0;const c=client({request:async()=>{calls++;return askView();},onChange:v=>{if(armed&&v.pending)throw Error('synthetic render error');}});
 armed=true;assert.equal((await c.refresh()).kind,'unavailable');assert.equal(c.snapshot().pending,false);assert.equal(calls,0);
 armed=false;assert.equal((await c.refresh()).kind,'state');
});
test('client rejects regressing read version within the same visit',async()=>{
 let v=4;const c=client({request:async()=>askView(v)});
 await c.refresh();v=3;assert.equal((await c.refresh()).reasonCode,'STALE_BRIDGE_RESPONSE');assert.equal(c.snapshot().version,4);assert.equal(c.snapshot().needsRefresh,true);
 c.bindVisit('synthetic-visit-b');v=0;assert.equal((await c.refresh()).kind,'state');
});
test('client rejects different issue at the same version',async()=>{
 let id='synthetic-issue';const c=client({request:async()=>askView(4,id)});
 await c.refresh();id='synthetic-other';assert.equal((await c.refresh()).reasonCode,'STALE_BRIDGE_RESPONSE');assert.equal(c.snapshot().issue.issueId,'synthetic-issue');
});
test('client read cannot replay a native guide or draft navigation effect',async()=>{
 let effects=0;const c=client({request:async()=>({kind:'open_native_draft',version:1,issue:draftIssue(),channel:'support',reasonCode:'NO_APPROVED_GUIDE',journey:{}}),onEffect:async()=>{effects++;}});
 assert.equal((await c.refresh()).kind,'unavailable');assert.equal(effects,0);
});
test('client rejects response tied to another issue even with newer version',async()=>{
 let effects=0;const c=client({request:async command=>command.action==='read'?{kind:'state',version:1,issue:guideIssue()}:{...guideEffect(),issue:{...guideIssue(),issueId:'synthetic-other'}},onEffect:async()=>{effects++;}});
 await c.refresh();assert.equal((await c.openGuide()).kind,'unavailable');assert.equal(effects,0);
});
test('client validates complete native guide fingerprint, source and step bound',async()=>{
 for(const ref of [{...guideRef(),nativeGuideFingerprint:''},{...guideRef(),nativeGuideFingerprint:'x'.repeat(64)},{...guideRef(),sourceRevision:''},{...guideRef(),resolutionStepCount:0},{...guideRef(),resolutionStepCount:201}]){
  let effects=0;const c=client({request:async command=>command.action==='read'?{kind:'state',version:1,issue:guideIssue()}:guideEffect(ref),onEffect:async()=>{effects++;}});
  await c.refresh();assert.equal((await c.openGuide()).kind,'unavailable');assert.equal(effects,0);
 }
});
test('client valid native guide effect is still available and guarded',async()=>{
 let guard;const c=client({request:async command=>command.action==='read'?{kind:'state',version:1,issue:guideIssue()}:guideEffect(),onEffect:async(e,g)=>{assert.equal(e.reference.guideId,'synthetic-guide');assert.equal(g.isCurrent(),true);guard=g.isCurrent;}});
 await c.refresh();assert.equal((await c.openGuide()).kind,'open_native_guide');c.bindVisit('synthetic-visit-b');assert.equal(guard(),false);
});
test('client excludes unexpected response metadata from browser view and guide reference',async()=>{
 const marker='synthetic_private_metadata';
 let effect;const c=client({request:async command=>command.action==='read'?{kind:'state',version:1,issue:{...guideIssue(),privateMarker:marker,decision:{...guideIssue().decision,privateMarker:marker}}}:guideEffect({...guideRef(),privateMarker:marker}),onEffect:async e=>{effect=e;}});
 await c.refresh();assert.ok(!JSON.stringify(c.snapshot()).includes(marker));assert.equal((await c.openGuide()).kind,'open_native_guide');assert.ok(!JSON.stringify(effect).includes(marker));
});
test('client rejects mismatch between support decision and recovery effect channel',async()=>{
 let effects=0;const c=client({request:async command=>command.action==='read'?{kind:'state',version:1,issue:draftIssue()}:{kind:'open_native_draft',version:1,issue:draftIssue(),channel:'mfa_recovery',journey:{}},onEffect:async()=>{effects++;}});
 await c.refresh();assert.equal((await c.requestDraft()).kind,'unavailable');assert.equal(effects,0);
});
test('search rebinding during pending render does not submit old text',async()=>{
 let c,armed=false,calls=0;c=createHomeSearchController({submitNative:async()=>{calls++;},recordActivity:()=>{},onChange:v=>{if(armed&&v.pending){armed=false;c.bindVisit('synthetic-b');}}});
 c.bindVisit('synthetic-a');c.input('Email problem');armed=true;assert.equal((await c.submit()).kind,'stale');assert.equal(calls,0);assert.equal(c.state().value,'');
});
test('search activity cancellation prevents stale submission',async()=>{
 let c,calls=0;c=createHomeSearchController({submitNative:async()=>{calls++;},recordActivity:()=>c.stop()});c.bindVisit('synthetic-a');c.input('Email problem');
 assert.equal((await c.submit()).kind,'stale');assert.equal(calls,0);
});
test('search render failure releases pending state and preserves deliberate query',async()=>{
 let armed=false,calls=0;const c=createHomeSearchController({submitNative:async()=>{calls++;},recordActivity:()=>{},onChange:v=>{if(armed&&v.pending)throw Error('synthetic render error');}});
 c.bindVisit('synthetic-a');c.input('Email problem');armed=true;assert.equal((await c.submit()).kind,'unavailable');assert.equal(c.state().pending,false);assert.equal(c.state().value,'Email problem');assert.equal(calls,0);
});
test('search native callback can detect visit invalidation after await',async()=>{
 const entered=deferred(),gate=deferred();let effect=false;
 const c=createHomeSearchController({recordActivity:()=>{},submitNative:async({isCurrent})=>{entered.resolve();await gate.promise;effect=typeof isCurrent==='function'&&isCurrent();}});
 c.bindVisit('synthetic-a');c.input('Email problem');const running=c.submit();await entered.promise;c.bindVisit('synthetic-b');gate.resolve();assert.equal((await running).kind,'stale');assert.equal(effect,false);
 c.bindVisit('synthetic-a');c.input('Email problem');assert.equal((await c.submit()).kind,'submitted');assert.equal(effect,true);
});
test('search discards unbound text and cannot resurrect a disposed controller',()=>{
 const c=createHomeSearchController({submitNative:async()=>{},recordActivity:()=>{}});c.input('synthetic_unbound_text');assert.equal(c.state().value,'');c.bindVisit('synthetic-a');c.dispose();assert.throws(()=>c.bindVisit('synthetic-b'),/CLIENT_DISPOSED/);
});
test('base mapping verifier cannot approve a mutable object changed while awaiting authority',async()=>{
 const n=syntheticNative(),release=await n.approvedBase();const provider=createApprovedMappingProvider({getConfiguration:async()=>n.configuration,getActiveRelease:async()=>release,
  verifyActiveRelease:async()=>{release.payload.mapping.revision='synthetic-mutated';return true;}});
 await assert.rejects(()=>provider({actorRef:'synthetic-student'}),/APPROVED_MAPPING_UNAVAILABLE/);
});
test('base mapping revocation while awaiting authority fails closed',async()=>{
 const n=syntheticNative(),release=await n.approvedBase();let revoked=false;
 const provider=createApprovedMappingProvider({getConfiguration:async()=>clone(n.configuration),getActiveRelease:async()=>({...clone(release),revoked}),
  verifyActiveRelease:async()=>{revoked=true;return true;}});
 await assert.rejects(()=>provider({actorRef:'synthetic-student'}),/APPROVED_MAPPING_UNAVAILABLE/);
});
test('base mapping consumer rejects structurally non-independent row approval',async()=>{
 const n=syntheticNative(),release=await n.approvedBase();release.payload.approvals[0].reviewerRef=release.payload.preparerRef;
 release.releaseFingerprint=digest(release.payload);
 const provider=createApprovedMappingProvider({getConfiguration:async()=>clone(n.configuration),getActiveRelease:async()=>clone(release),verifyActiveRelease:async()=>true});
 await assert.rejects(()=>provider({actorRef:'synthetic-student'}),/APPROVED_MAPPING_UNAVAILABLE/);
});
test('native guide launch requires exact usable source and bounded step metadata',()=>{
 for(const ref of [{...guideRef(),sourceRevision:''},{...guideRef(),resolutionStepCount:0},{...guideRef(),resolutionStepCount:201},{...guideRef(),entryMode:'other'}])
  assert.throws(()=>newGuideLaunch({launchRef:'synthetic-launch',reference:ref}),/INVALID_GUIDE_LAUNCH/);
});
test('native catalog withholds procedures beyond route-review bounds',()=>{
 const n=syntheticNative(),g=n.configuration.guides[0];g.resolutionSteps=Array(201).fill('Synthetic step');g.resolutionStepsAr=Array(201).fill('خطوة تجريبية');n.refreshPins();
 assert.equal(n.projection().catalog.guides.length,0);assert.ok(n.route().blockers.length);
});
test('unconfirmed navigation receipt is labeled as unconfirmed in public view',()=>{
 const ref=guideRef(),launch=newGuideLaunch({launchRef:'synthetic-launch',reference:ref});
 const receipt=acceptNativeGuideReturn(launch,{...ref,launchRef:launch.launchRef,status:'returned',verified:true,reachedStep:2,totalSteps:2});
 assert.equal(receipt.progressScope,'unconfirmed');
 const view=guideContinuationView({state:{decision:{kind:'open_guide',guideId:ref.guideId}},guideLaunch:launch,guideReturns:[receipt]});
 assert.equal(view.progressScope,'unconfirmed');assert.equal(view.status,'returned');
});
const providerInput={questionId:'connection',language:'en',options:[{id:'yes',label:'Yes'},{id:'no',label:'No'}],text:'I think so'};
const response=()=>new Response(JSON.stringify({done:true,message:{content:'{"optionId":"yes"}'}}),{headers:{'content-type':'application/json'}});
test('pre-cancelled local inference sends no HTTP request',async()=>{
 let calls=0;const p=createOllamaOptionProvider({enabled:true,model:'synthetic-local',fetchImpl:async()=>{calls++;return response();}});
 const abort=new AbortController();abort.abort();await assert.rejects(()=>p(providerInput,{signal:abort.signal}),/ABORT|CANCEL/i);assert.equal(calls,0);
});
test('late HTTP completion after cancellation cannot become advice',async()=>{
 const gate=deferred(),entered=deferred(),abort=new AbortController();
 const p=createOllamaOptionProvider({enabled:true,model:'synthetic-local',fetchImpl:async()=>{entered.resolve();await gate.promise;return response();}});
 const running=p(providerInput,{signal:abort.signal});const checked=assert.rejects(running,/ABORT|CANCEL/i);await entered.promise;abort.abort();gate.resolve();await checked;
});
test('oversized announced response closes its body',async()=>{
 let cancelled=false;const p=createOllamaOptionProvider({enabled:true,model:'synthetic-local',maxBytes:1024,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':'4096'}})});
 await assert.rejects(()=>p(providerInput),/PROVIDER_RESPONSE_TOO_LARGE/);assert.equal(cancelled,true);
});
test('HTTP error closes its body without accepting output',async()=>{
 let cancelled=false;const p=createOllamaOptionProvider({enabled:true,model:'synthetic-local',fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:500})});
 await assert.rejects(()=>p(providerInput),/LOCAL_PROVIDER_UNAVAILABLE/);assert.equal(cancelled,true);
});
test('local provider transport is loopback-only and rejects redirects by construction',async()=>{
 let request;const p=createOllamaOptionProvider({enabled:true,model:'synthetic-local',port:12345,fetchImpl:async(url,options)=>{request={url,options};return response();}});
 assert.deepEqual(await p(providerInput),{optionId:'yes'});assert.equal(request.url,'http://127.0.0.1:12345/api/chat');assert.equal(request.options.redirect,'error');assert.equal(request.options.credentials,'omit');
 assert.throws(()=>createOllamaOptionProvider({enabled:true,model:'synthetic:cloud',fetchImpl:async()=>response()}),/INVALID_LOCAL_MODEL/);
});
test('advice lease releases after synchronous throw and respects pre-cancellation',async()=>{
 const c=createAdviceCoordinator({maxConcurrent:2});let invoked=0;const abort=new AbortController();abort.abort();
 assert.equal((await c.run(()=>{invoked++;},{signal:abort.signal})).status,'cancelled');assert.equal(invoked,0);
 assert.equal((await c.run(()=>{throw Error('synthetic failure');})).status,'unavailable');assert.equal(c.stats().active,0);
 assert.equal((await c.run(()=>42)).value,42);
});
for(const [label,text,language] of [
 ['email','Email not working','en'],['phone','I changed my phone and use Authenticator','en'],['network','Wi-Fi not working','en'],
 ['portal','Moodle not working','en'],['collaboration','Zoom microphone not working','en'],['shared','Outlook and Moodle are not working','en'],
 ['unknown','It is broken','en'],['Arabic mail','البريد الإلكتروني لا يعمل','ar'],['Arabic network','الواي فاي لا يعمل','ar'],['exam','Examplify not opening','en']
]){
 test('bounded choice exploration: '+label,()=>{
  const e=createEngine({catalog:demoCatalog,now:()=>1000000});const queue=[e.begin({text,language})];let transitions=0;
  const approved=new Set(demoCatalog.guides.filter(g=>g.enabled&&g.reviewed&&g.audience==='student').map(g=>g.id));
  // A deterministic bounded breadth-first walk, not a proof of all paths.
  for(let i=0;i<queue.length&&transitions<180;i++){
   const s=queue[i],d=s.decision;
   assert.equal(s.language,language);assert.ok(s.askedQuestionIds.length<=12);assert.ok(s.turn<=24);
   if(d.kind==='open_guide')assert.ok(approved.has(d.guideId));
   if(s.turn>=4)continue;
   const q=d.kind==='ask'?{id:d.questionId,q:d.question}:['open_guide','answer'].includes(d.kind)?{id:d.followUp.questionId,q:d.followUp.question}:null;
   if(!q)continue;
   assert.ok(q.q.options.length);assert.equal(new Set(q.q.options.map(o=>o.id)).size,q.q.options.length);
   for(const option of q.q.options){
    const before=JSON.stringify(s),next=e.advance(s,{expectedTurn:s.turn,questionId:q.id,optionId:option.id});
    assert.equal(JSON.stringify(s),before);assert.equal(next.turn,s.turn+1);
    if(next.decision.kind==='open_guide')assert.ok(approved.has(next.decision.guideId));
    queue.push(next);transitions++;if(transitions>=180)break;
   }
  }
  assert.ok(transitions>0);console.log('synthetic transitions ('+label+'): '+transitions);
 });
}
