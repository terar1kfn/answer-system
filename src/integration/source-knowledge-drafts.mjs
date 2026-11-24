import {knownGuidePurpose} from '../guide-purposes.mjs';
import {isServiceId} from '../service-taxonomy.mjs';
import {nativeRecordFingerprint} from './native-catalog.mjs';
import {QUESTIONS} from '../questions.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=x=>{throw Error(x);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const bounded=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const bilingual=(x,n)=>x&&bounded(x.en,n)&&bounded(x.ar,n);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const unique=(xs,k)=>new Set(xs.map(x=>x[k])).size===xs.length;
const kinds=new Set(['new_guide','revise_guide','referral','policy_review']);
const scopes=new Set(['institutional_requirement','vendor_behavior','conservative_diagnostic_guidance']);
function sourceValid(s){
 if(!s||!id(s.id)||!['institution','vendor'].includes(s.kind)||!bounded(s.title,500)||!date(s.accessedOn)||!bounded(s.url,1000))return false;
 try{const u=new URL(s.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash;}catch{return false;}
}
function prerequisitesValid(requires){
 return requires&&typeof requires==='object'&&!Array.isArray(requires)&&Object.entries(requires).every(([k,vs])=>Object.hasOwn(QUESTIONS,k)&&Array.isArray(vs)&&vs.length&&new Set(vs).size===vs.length&&vs.every(v=>QUESTIONS[k].options.some(o=>o.id===v)));
}
/** Validate draft shape and evidence attribution, not the truth or local
 * applicability of a source. Drafts never enter createEngine as facts/guides. */
export function inspectSourceKnowledgePack(pack){
 if(!pack||pack.kind!=='private_knowledge_gap_pack'||pack.schemaVersion!==1||pack.status!=='needs_independent_review'||
 pack.published!==false||pack.activated!==false||!hash(pack.sourceCatalogFingerprint)||
 typeof pack.sourceRevision!=='string'||!/^(0|[1-9]\d{0,15})$/.test(pack.sourceRevision)||
 !Array.isArray(pack.sources)||!pack.sources.length||pack.sources.length>100||!pack.sources.every(sourceValid)||!unique(pack.sources,'id')||
 !Array.isArray(pack.proposals)||!pack.proposals.length||pack.proposals.length>100||
 !unique(pack.proposals,'id'))fail('INVALID_SOURCE_KNOWLEDGE_PACK');
 const sources=new Map(pack.sources.map(s=>[s.id,s]));
 for(const p of pack.proposals){
  if(!p||!id(p.id)||!kinds.has(p.kind)||!isServiceId(p.serviceId)||
   (p.purpose!==null&&!knownGuidePurpose(p.serviceId,p.purpose))||
   (p.kind==='new_guide'&&p.purpose===null)||!bilingual(p.title,500)||!bilingual(p.applicability,1000)||
   !Array.isArray(p.existingGuideIds)||p.existingGuideIds.length>30||!p.existingGuideIds.every(id)||
   !prerequisitesValid(p.requires)||!Array.isArray(p.steps)||!p.steps.length||p.steps.length>20||
   !Array.isArray(p.reviewQuestions)||!p.reviewQuestions.length||p.reviewQuestions.length>15||
   !p.reviewQuestions.every(q=>bilingual(q,1000))||
   !Array.isArray(p.boundaries)||!p.boundaries.length||p.boundaries.length>15||!p.boundaries.every(q=>bilingual(q,1000)))fail('INVALID_SOURCE_KNOWLEDGE_PROPOSAL');
  for(const step of p.steps){
   if(!bilingual(step,1000)||!scopes.has(step.claimKind)||!Array.isArray(step.sourceIds)||!step.sourceIds.length||
    step.sourceIds.length>8||!step.sourceIds.every(s=>sources.has(s)))fail('SOURCE_ATTRIBUTION_REQUIRED');
   if(step.claimKind==='institutional_requirement'&&!step.sourceIds.some(s=>sources.get(s).kind==='institution'))fail('INSTITUTIONAL_SOURCE_REQUIRED');
  }
 }
 return {proposalCount:pack.proposals.length,sourceCount:pack.sources.length,publicationAuthorized:false,sourceTruthVerified:false};
}
function pinned(pack,configuration){
 return configuration&&Array.isArray(configuration.guides)&&
  String(configuration.gatewayRevision??configuration.revision)===pack.sourceRevision&&
  nativeRecordFingerprint(configuration)===pack.sourceCatalogFingerprint;
}
/**
 * Review intake only. Source verification hooks must check the actual named
 * publication and its claims; an institution URL is not itself an approval.
 * Prepare selected proposals for the native knowledge editor; no writes or
 * change of native service visibility. Source review and applicability remain
 * separately attributable to the human reviewer.
 */
export async function prepareSourceKnowledgeReview({pack,configuration,proposalIds,actorRef,verifySource,mayReviewProposal}={}){
 inspectSourceKnowledgePack(pack);
 if(!pinned(pack,configuration))fail('KNOWLEDGE_DRAFT_BASE_CHANGED');
 if(!id(actorRef)||!Array.isArray(proposalIds)||!proposalIds.length||proposalIds.length>100||
 !proposalIds.every(id)||new Set(proposalIds).size!==proposalIds.length||
 typeof verifySource!=='function'||typeof mayReviewProposal!=='function')fail('KNOWLEDGE_REVIEW_HOOKS_REQUIRED');
 const byId=new Map(pack.proposals.map(p=>[p.id,p])),sources=new Map(pack.sources.map(s=>[s.id,s]));
 const proposals=[];
 for(const proposalId of proposalIds){
  const proposal=byId.get(proposalId);if(!proposal)fail('UNKNOWN_KNOWLEDGE_PROPOSAL');
  if(await mayReviewProposal(copy(proposal),actorRef)!==true)fail('FORBIDDEN');
  const sourceIds=[...new Set(proposal.steps.flatMap(s=>s.sourceIds))],findings=[];
  for(const sourceId of sourceIds){
   const source=sources.get(sourceId),claims=proposal.steps.filter(s=>s.sourceIds.includes(sourceId)).map(copy);
   const verified=await verifySource({source:copy(source),claims,proposalId,actorRef});
   findings.push({sourceId,status:verified===true?'reviewed_by_host':'needs_source_review'});
  }
  const missingGuideIds=proposal.existingGuideIds.filter(g=>!configuration.guides.some(x=>x.id===g));
  proposals.push({proposal:copy(proposal),findings,missingGuideIds,
   status:missingGuideIds.length||findings.some(f=>f.status!=='reviewed_by_host')?'needs_source_or_reference_review':'needs_independent_applicability_review'});
 }
 return {kind:'private_source_review_draft',sourceRevision:pack.sourceRevision,sourceCatalogFingerprint:pack.sourceCatalogFingerprint,actorRef,proposals,
  published:false,activated:false};
}
export function createSourceKnowledgeReviewer({authenticate,mayReviewKnowledge,getConfiguration,verifySource,mayReviewProposal}={}){
 if(![authenticate,mayReviewKnowledge,getConfiguration,verifySource,mayReviewProposal].every(f=>typeof f==='function'))fail('KNOWLEDGE_REVIEW_HOOKS_REQUIRED');
 const authorized=async a=>a&&a.active===true&&id(a.actorRef)&&['INTERN','MANAGER','SUPER_MANAGER'].includes(a.role)&&await mayReviewKnowledge(a)===true;
 return async function review(credential,pack,proposalIds){
  const actor=await authenticate(credential);if(!await authorized(actor))fail('FORBIDDEN');
  const configuration=await getConfiguration(actor);
  const report=await prepareSourceKnowledgeReview({pack,configuration,proposalIds,actorRef:actor.actorRef,verifySource,
   mayReviewProposal:(proposal)=>mayReviewProposal(actor,proposal)});
  const latest=await authenticate(credential);
  if(!await authorized(latest)||latest.actorRef!==actor.actorRef||latest.role!==actor.role)fail('FORBIDDEN');
  if(!pinned(pack,await getConfiguration(latest)))fail('KNOWLEDGE_DRAFT_BASE_CHANGED');
  return report;
 };
}
