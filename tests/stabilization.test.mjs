import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {deflateSync} from 'node:zlib';
import {createEngine,RULE_VERSION} from '../src/engine.mjs';
import {demoCatalog} from '../src/demo-knowledge.mjs';
import {QUESTIONS} from '../src/questions.mjs';
import {validGuidePrerequisites,normalizeGuidePrerequisites,fixedOption,GUIDE_PREREQUISITE_QUESTIONS} from '../src/diagnostic-evidence.mjs';
import {compareGuideApplicability,planApplicableGuides,potentialGuideTie} from '../src/guide-selection.mjs';
import {createNativeCatalogEnginePool} from '../src/integration/native-catalog.mjs';
import {auditNativeCoverage} from '../src/integration/catalog-coverage.mjs';
import {studentInterfaceCopy,interfaceCopy,interfaceReasonCodes} from '../src/integration/client-copy.mjs';
import {createAdviceCoordinator} from '../src/advice-coordinator.mjs';
import {createDiagnosticIntakeAdvisor,prepareIntakeAdvice,validateIntakeAdvice,acceptIntakeSuggestions,currentIntakeSuggestion} from '../src/diagnostic-intake-advisor.mjs';
import {prepareScreenshotAdvice,validateScreenshotOutput,acceptScreenshotAdvice,normalizedScreenshotPng,createScreenshotAdvisor} from '../src/screenshot-advisor.mjs';
import {prepareReplyAdvice,validateReplyAdvice} from '../src/contextual-reply-advisor.mjs';
import {buildInternDiagnosticSnapshot} from '../src/integration/intern-diagnostic.mjs';
import {syntheticNative,clone,deferred} from './fixtures/native-synthetic.mjs';

const guide=(id,requires={})=>({id,requires});
const state=(evidence={})=>({evidence:Object.fromEntries(Object.entries(evidence).map(([k,value])=>[k,{value}])),askedQuestionIds:[]});
const plan=(guides,values)=>planApplicableGuides({guides,state:state(values),serviceId:'mail',purpose:'recipient_address_check'});
const askState=(questionId,overrides={})=>({domain:'specific',language:'en',services:['collaboration'],turn:0,evidence:{},decision:{kind:'ask',questionId,question:QUESTIONS[questionId]},...overrides});
const engine=()=>createEngine({catalog:demoCatalog});
const choose=(e,s,questionId,optionId)=>{assert.equal(s.decision.questionId??s.decision.followUp?.questionId,questionId);return e.advance(s,{expectedTurn:s.turn,questionId,optionId});};

test('fixed evidence and prerequisite definitions remain consistent',()=>{
 for(const q of GUIDE_PREREQUISITE_QUESTIONS)assert.ok(QUESTIONS[q]?.options.length);
 assert.equal(fixedOption('constructor','anything'),undefined);
 assert.deepEqual(normalizeGuidePrerequisites({device_os:['windows','unknown','windows','macos']}),{device_os:['macos','windows']});
 for(const bad of [null,[],{device_os:[]},{device_os:['unknown']},{device_os:['bogus']},{bogus:['yes']}])assert.equal(validGuidePrerequisites(bad),false);
 assert.equal(validGuidePrerequisites({device_os:['windows','windows']},{requireUnique:true}),false);
});
test('specificity is set containment, not duplicate counts',()=>{
 const a=guide('a',{device_os:['windows','windows']}),b=guide('b',{device_os:['windows']});
 assert.equal(compareGuideApplicability(a,b),'equivalent');assert.equal(potentialGuideTie(a,b),true);
 assert.equal(compareGuideApplicability(b,guide('c',{device_os:['windows','macos']})),'a_more_specific');
 assert.equal(compareGuideApplicability(b,guide('c',{device_os:['macos']})),'disjoint');
 assert.equal(compareGuideApplicability(b,guide('d',{mail_client:['web']})),'overlapping');
 assert.equal(plan([a,b],{device_os:'windows'}).guides.length,2);
});
test('pending narrower guide does not silently fall back to generic',()=>{
 const rows=[guide('generic'),guide('narrow',{device_os:['windows']})];
 assert.equal(plan(rows,{}).questionId,'device_os');
 assert.equal(plan(rows,{device_os:'unknown'}).kind,'unconfirmed');
 assert.deepEqual(plan(rows,{device_os:'macos'}).guides.map(g=>g.id),['generic']);
 assert.deepEqual(plan(rows,{device_os:'windows'}).guides.map(g=>g.id),['narrow']);
});
test('coverage detects incomparable overlaps with unequal condition counts',()=>{
 const n=syntheticNative({two:true});
 n.mapping.guides[0].requires={device_os:['windows']};
 n.mapping.guides[1].requires={mail_client:['web'],phone:['ios']};
 const row=auditNativeCoverage(n.input).rows.find(r=>r.serviceId==='mail'&&r.purpose==='recipient_address_check');
 assert.equal(row.status,'potential_ambiguity');
});
test('native risk admission and route inspection reject missing, unknown and high risk',()=>{
 for(const risk of [undefined,'Unknown','High']){
  const n=syntheticNative();if(risk===undefined)delete n.configuration.guides[0].riskLevel;else n.configuration.guides[0].riskLevel=risk;
  n.refreshPins();
  assert.equal(n.projection().catalog.guides.length,0);
  assert.ok(n.route().blockers.some(b=>b.code==='ROUTE_HIGH_OR_UNKNOWN_RISK'));
 }
 const n=syntheticNative();n.configuration.guides[0].riskLevel='Medium';n.refreshPins();
 assert.equal(n.projection().catalog.guides.length,1);
 assert.ok(n.route().reviewNotes.some(b=>b.code==='ROUTE_MEDIUM_RISK_REVIEW'));
});
test('engine pool reuses only freshly admitted identical catalog and incident pins',()=>{
 const n=syntheticNative();let permitted=true,checks=0;
 n.input.isGuideAvailable=()=>{checks++;return permitted;};
 const p=createNativeCatalogEnginePool({maxEntries:1,now:()=>1000000});
 const a=p.project(n.input),b=p.project(n.input);assert.equal(a.engine,b.engine);assert.ok(checks>=2);
 b.projection.catalog.guides.length=0;assert.equal(p.project(n.input).projection.catalog.guides.length,1);
 permitted=false;const c=p.project(n.input);assert.notEqual(c.engine,a.engine);assert.equal(c.projection.catalog.guides.length,0);
 permitted=true;const d=p.project(n.input);assert.notEqual(d.engine,a.engine);assert.equal(p.stats().size,1);
 const f=p.project(n.input,{incidents:[{id:'synthetic-incident',serviceId:'mail',status:'confirmed',authority:'authorized_staff',updatedAt:999999,expiresAt:1100000}]});
 assert.notEqual(f.engine,d.engine);p.clear();assert.equal(p.stats().size,0);
 const disabled=createNativeCatalogEnginePool({maxEntries:0});assert.notEqual(disabled.project(n.input).engine,disabled.project(n.input).engine);
});
test('bilingual registry covers important reason codes and masks unknown server text',()=>{
 for(const k of interfaceReasonCodes)for(const lang of ['en','ar'])assert.ok(interfaceCopy(k,lang)?.trim());
 for(const k of ['ACCOUNT_LOCKED','EXAM_PROFESSOR_FIRST','GUIDE_PERMISSION_BLOCKED','SCREENSHOT_NOT_AVAILABLE','VISIT_BUSY'])assert.ok(interfaceReasonCodes.includes(k));
 assert.equal(interfaceCopy('SYNTHETIC_PRIVATE_EXCEPTION','en'),null);
 assert.equal(studentInterfaceCopy('SYNTHETIC_PRIVATE_EXCEPTION','ar'),interfaceCopy('BRIDGE_UNAVAILABLE','ar'));
});
test('timeout retains actual inference slot; cancelled wait cannot open another slot',async()=>{
 const c=createAdviceCoordinator(),gate=deferred(),started=deferred();
 const pending=c.run(async()=>{started.resolve();return gate.promise;},{timeoutMs:100});
 await started.promise;assert.equal((await pending).status,'timeout');assert.equal(c.stats().active,1);
 assert.equal((await c.run(async()=>1)).status,'busy');gate.resolve('done');
 // Wait for actual promise settlement rather than relying on a fixed delay.
 await new Promise(resolve=>setImmediate(resolve));assert.equal(c.stats().active,0);
 const cancel=new AbortController(),hold=deferred(),entered=deferred();
 const running=c.run(async({signal})=>{entered.resolve(signal);return hold.promise;},{signal:cancel.signal,timeoutMs:5000});
 const signal=await entered.promise;cancel.abort();assert.equal((await running).status,'cancelled');assert.equal(signal.aborted,true);assert.equal(c.stats().active,1);
 hold.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.stats().active,0);
});
test('ordinary intake suggestions are fixed, grounded and unconfirmed',async()=>{
 const s=askState('meeting_product'),text='Zoom meeting problem';
 const prepared=prepareIntakeAdvice(s,text);assert.equal(prepared.status,'ready');
 const output={observations:[{questionId:'meeting_product',optionId:'zoom',quote:'Zoom'}]};
 const result=validateIntakeAdvice(prepared.request,output);
 assert.equal(result.requiresConfirmation,true);
 assert.deepEqual(currentIntakeSuggestion(s,acceptIntakeSuggestions(prepared.request,result)),{questionId:'meeting_product',optionId:'zoom',requiresConfirmation:true});
 assert.deepEqual(s.evidence,{});
 assert.equal(validateIntakeAdvice(prepared.request,{observations:[{...output.observations[0],quote:'Teams'}]}).status,'ungrounded');
 assert.equal(validateIntakeAdvice(prepared.request,{observations:[{...output.observations[0],optionId:'injected'}]}).status,'rejected');
 assert.equal((await createDiagnosticIntakeAdvisor().suggest({state:s,text})).status,'disabled');
 assert.notEqual(prepareIntakeAdvice({...s,evidence:{credentials:{value:'locked'}}},text).status,'ready');
});
test('contextual reply cannot select an unlisted option or retain its quote',()=>{
 const s=askState('meeting_product'),p=prepareReplyAdvice(s,'Zoom');
 assert.equal(p.status,'ready');
 assert.deepEqual(validateReplyAdvice(p.request,{optionId:'zoom',quote:'Zoom'}),{status:'suggestion',questionId:'meeting_product',optionId:'zoom',requiresConfirmation:true});
 assert.equal(validateReplyAdvice(p.request,{optionId:'injected',quote:'Zoom'}).status,'rejected');
});
function pngChunk(type,bytes){
 const name=Buffer.from(type,'ascii'),payload=Buffer.concat([name,bytes]);let crc=0xffffffff;
 for(const b of payload){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const size=Buffer.alloc(4),tail=Buffer.alloc(4);size.writeUInt32BE(bytes.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([size,payload,tail]);
}
function tinyPng(extra=[]){
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),...extra,pngChunk('IDAT',deflateSync(Buffer.from([0,255,255,255]))),pngChunk('IEND',Buffer.alloc(0))]);
}
test('synthetic PNG structure, metadata rejection and exact visual hint',async()=>{
 const png=tinyPng();assert.deepEqual(normalizedScreenshotPng(png),png);
 assert.throws(()=>normalizedScreenshotPng(Buffer.concat([png,Buffer.from([0])])),/SCREENSHOT_FORMAT/);
 assert.throws(()=>normalizedScreenshotPng(tinyPng([pngChunk('tEXt',Buffer.from('synthetic'))])),/SCREENSHOT_METADATA_OR_FORMAT/);
 assert.throws(()=>normalizedScreenshotPng(Buffer.alloc(2*1024*1024+1)),/SCREENSHOT_SIZE_OR_FORMAT/);
 const s=askState('meeting_product'),p=prepareScreenshotAdvice(s);assert.equal(p.status,'ready');
 const output={kind:'option',value:'zoom'};
 assert.equal(validateScreenshotOutput(p.request,{...output,rawText:'never allowed'}).status,'rejected');
 assert.equal(validateScreenshotOutput(p.request,{kind:'option',value:'injected'}).status,'rejected');
 const advisor=createScreenshotAdvisor({enabled:true,provider:async()=>output});
 assert.deepEqual(acceptScreenshotAdvice(p.request,await advisor.suggest({state:s,png})),{suggestion:{questionId:'meeting_product',optionId:'zoom',requiresConfirmation:true}});
 assert.deepEqual(s.evidence,{});
 assert.equal(prepareScreenshotAdvice({...s,domain:'exam'}).status,'not_applicable');
});
test('updated phone-transfer path confirms actual method and Security info',()=>{
 const e=engine();let s=e.begin({text:'I changed my phone and cannot complete Authenticator verification'});
 // The explicit failed approval variant is not inferred from phone ownership.
 if(s.decision.questionId==='mfa_method_goal')s=choose(e,s,'mfa_method_goal','transfer');
 if(s.decision.questionId==='mfa_prompt')s=choose(e,s,'mfa_prompt','blocked');
 s=choose(e,s,'mfa_access','yes');
 if(s.decision.questionId==='mfa_method_goal')s=choose(e,s,'mfa_method_goal','transfer');
 assert.equal(s.decision.questionId,'security_info_access');
 s=choose(e,s,'security_info_access','yes');assert.equal(s.decision.guideId,'demo-mfa-existing');
});
test('failure is not automatic resolution or a repeated guide',()=>{
 const e=engine(),first=e.begin({text:'Recipient address not found'});
 assert.equal(first.decision.guideId,'demo-recipient-address');
 const second=choose(e,first,'outcome','no');
 assert.equal(second.decision.questionId,'guide_result');assert.equal(second.guideAttempts.at(-1).outcome,'no');
 let third=choose(e,second,'guide_result','not_tried');
 third=choose(e,third,'guide_not_tried_reason','no_opportunity');
 assert.equal(third.decision.reasonCode,'GUIDE_NOT_ATTEMPTED');
 assert.equal(third.resolutionPlan.automaticActions,false);
 const snapshot=buildInternDiagnosticSnapshot({caseRef:'synthetic-case',state:third,catalog:demoCatalog});
 assert.equal(snapshot.verifiedRootCause,false);assert.equal(snapshot.automaticActions,false);
 assert.ok(!JSON.stringify(snapshot).includes('Recipient address not found'));
});
test('old diagnostic rule pins cannot be replayed',()=>{
 const e=engine(),s=e.begin({text:'Wi-Fi not working'});
 assert.equal(s.ruleVersion,RULE_VERSION);
 assert.throws(()=>e.advance({...s,ruleVersion:'0.36.0'},{expectedTurn:s.turn,questionId:s.decision.questionId,optionId:s.decision.question.options[0].id}),/STALE_STATE/);
});
