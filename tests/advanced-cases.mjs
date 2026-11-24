import {createEngine} from '../src/engine.mjs';
import {demoCatalog} from '../src/demo-knowledge.mjs';
export function advancedCases(assert){
 const c=()=>JSON.parse(JSON.stringify(demoCatalog));
 const E=opts=>createEngine({catalog:c(),...opts});
 const begin=(t,e=E())=>e.begin({text:t});
 const answer=(e,s,text)=>e.respond(s,{expectedTurn:s.turn,text});
 const choose=(e,s,optionId)=>e.advance(s,{expectedTurn:s.turn,questionId:s.decision.questionId||'outcome',optionId});
 return [
 ['typed Android follows phone question',()=>{const e=E(),s=begin('setup authenticator',e);assert.equal(answer(e,s,'Samsung').state.decision.guideId,'demo-mfa-android');}],
 ['typed Arabic Wi-Fi service',()=>{const e=E(),s=begin('It is broken',e);assert.equal(answer(e,s,'الواي فاي').state.decision.questionId,'connection');}],
 ['unknown free text does not alter state',()=>{const e=E(),s=begin('Cannot login to Moodle',e),r=answer(e,s,'yes and no');assert.equal(r.kind,'clarify');assert.equal(r.state.turn,s.turn);}],
 ['free text must match pending question',()=>{const e=E(),s=begin('Cannot login to Moodle',e);assert.equal(answer(e,s,'Android').kind,'clarify');}],
 ['safety input during diagnostic interrupts immediately',()=>{const e=E(),s=begin('Cannot login to Moodle',e);assert.equal(answer(e,s,'My laptop has a swollen battery').state.decision.kind,'safety_referral');}],
 ['active exam follow-up has priority',()=>{const e=E(),s=begin('Wi-Fi not working',e);assert.equal(answer(e,s,'Examplify froze during my exam').state.decision.policyCode,'EXAM_PROFESSOR_FIRST');}],
 ['typed old-phone access unavailable',()=>{const e=E(),s=begin('I changed my phone',e);assert.equal(answer(e,s,'I lost my old phone').state.decision.kind,'offer_mfa_recovery');}],
 ['typed blocked approval',()=>{const e=E(),s=choose(e,begin('Cannot login to Moodle',e),'yes');assert.equal(answer(e,s,'cannot approve').state.decision.questionId,'mfa_access');}],
 ['unexpected approval referred',()=>{const e=E(),s=choose(e,begin('Cannot login to Moodle',e),'yes');assert.equal(choose(e,s,'unexpected').decision.policyCode,'UNEXPECTED_VERIFICATION_REQUEST');}],
 ['unexpected request detected from complaint',()=>assert.equal(begin('Authenticator unexpected approval request').decision.policyCode,'UNEXPECTED_VERIFICATION_REQUEST')],
 ['setup required after a prompt',()=>{const e=E(),s=choose(e,begin('Cannot login to Moodle',e),'yes');assert.equal(choose(e,s,'setup_required').decision.questionId,'phone');}],
 ['explicit lockout does not lead to MFA setup',()=>assert.equal(begin('My account is locked').decision.reasonCode,'ACCOUNT_LOCKED')],
 ['send succeeds, receiving fails',()=>assert.equal(begin('I can send but cannot receive email').decision.questionId,'receive_scope')],
 ['receive succeeds, sending fails',()=>assert.equal(begin('I can receive but cannot send email').decision.questionId,'send_error')],
 ['portal task choices do not include mail operations',()=>{const s=begin('Moodle not working');assert.ok(!s.decision.question.options.some(o=>o.id==='send'));}],
 ['hidden option rejected',()=>{const e=E(),s=begin('Moodle not working',e);assert.throws(()=>choose(e,s,'send'),/INVALID_ANSWER/);}],
 ['supported candidate is not confirmed cause',()=>{const e=E(),s=choose(e,begin('I changed my phone',e),'no');assert.equal(s.candidates.find(x=>x.causeId==='verification_method_unavailable').status,'supported');assert.ok(!s.candidates.some(x=>x.status==='confirmed'));}],
 ['unknown facts do not support negative hypothesis',()=>{const e=E(),s=choose(e,begin('I changed my phone',e),'unknown');assert.ok(s.candidates.every(x=>x.status==='candidate'));}],
 ['exact reviewed factual answer',()=>assert.equal(begin('What is MFA?').decision.kind,'answer')],
 ['Arabic exact fact',()=>assert.equal(begin('ما هي المصادقة متعددة العوامل').decision.kind,'answer')],
 ['fact remains source-bound',()=>assert.equal(begin('What is MFA?').decision.sourceRef,'synthetic-reviewed-fixture')],
 ['fact outcome is explicitly reported',()=>{const e=E(),s=begin('What is MFA?',e);assert.equal(choose(e,s,'yes').decision.kind,'resolved_reported');}],
 ['disabled fact not answered',()=>{const catalog=c();catalog.facts[0].enabled=false;assert.ok(begin('What is MFA?',E({catalog})).decision.kind!=='answer');}],
 ['staff-only fact not answered',()=>{const catalog=c();catalog.facts[0].audience='staff';assert.ok(begin('What is MFA?',E({catalog})).decision.kind!=='answer');}],
 ['ambiguous exact fact not answered',()=>{const catalog=c();catalog.facts.push({...catalog.facts[0],id:'demo-conflict'});assert.ok(begin('What is MFA?',E({catalog})).decision.kind!=='answer');}],
 ['unreviewed guide service unavailable',()=>{const catalog=c();catalog.serviceAvailability={identity:false};const e=E({catalog});assert.equal(choose(e,begin('setup authenticator',e),'ios').decision.reasonCode,'NO_APPROVED_GUIDE');}],
 ['knowledge search ranks exact question first',()=>assert.equal(E().search({text:'What is MFA?'})[0].id,'demo-fact-mfa')],
 ['knowledge search not a generator',()=>assert.ok(E().search({text:'unrelated cafeteria menu'}).length===0)],
 ['unavailable knowledge excluded',()=>{const catalog=c();catalog.serviceAvailability={identity:false};assert.ok(!E({catalog}).search({text:'What is MFA?'}).some(x=>x.serviceId==='identity'));}],
 ['search scoped to service',()=>assert.ok(E().search({text:'What is MFA?',services:['network']}).length===0)],
 ['wrong turn rejects typed reply',()=>{const e=E(),s=begin('Wi-Fi not working',e);assert.throws(()=>e.respond(s,{expectedTurn:4,text:'yes'}),/STALE_STATE/);}],
 ['raw typed reply not retained',()=>{const e=E(),s=begin('Wi-Fi not working',e),r=answer(e,s,'yes password: sample-private');assert.ok(!JSON.stringify(r).includes('sample-private'));}],
 ['malformed fact rejected',()=>{const catalog=c();catalog.facts[0].sourceRef='';assert.throws(()=>E({catalog}),/Invalid fact/);}]
 ];
}
