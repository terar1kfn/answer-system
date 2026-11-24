// Synthetic only. No AU Assist institution data, real identities, URLs,
// screenshots, model calls, or private outcome records.
import {nativeRecordFingerprint as digest} from '../../src/integration/native-fingerprint.mjs';
import {projectNativeCatalog} from '../../src/integration/native-catalog.mjs';
import {inspectNativeGuideRoute} from '../../src/integration/native-route-review.mjs';
import {prepareMappingRelease} from '../../src/integration/mapping-release.mjs';
export const clone=x=>JSON.parse(JSON.stringify(x));
export function deferred(){
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};
}
export function syntheticNative({two=false,conditional=false}={}){
 const owner={id:'synthetic-mail-card',active:true,availability:'available',directSupport:false};
 const guide=(n)=>({id:'synthetic-mail-guide-'+n,serviceId:owner.id,isEnabled:true,audience:'Student',permissionLevel:'SELF SERVICE',riskLevel:'Low',sourceType:'REVIEWED',
  title:'Fictional recipient review '+n,titleAr:'مراجعة المستلم التجريبية '+n,aliases:[],keywords:[],diagnosticQuestions:[],
  resolutionSteps:['Synthetic check '+n],resolutionStepsAr:['تحقق تجريبي '+n]});
 const configuration={revision:21,services:[owner],guides:two?[guide(1),guide(2)]:[guide(1)]};
 const callbacks={isServiceAvailable:s=>s.active===true,isGuideAvailable:g=>g.isEnabled===true,isReviewedGuide:g=>g.sourceType==='REVIEWED',ownsGuide:(g,s)=>g.serviceId===s.id,isEntryMenu:()=>false};
 const mapping={revision:'synthetic-mapping-1',sourceRevision:'21',sourceCatalogFingerprint:digest(configuration),
  services:[{nativeId:owner.id,serviceId:'mail'}],
  guides:configuration.guides.map(g=>({guideId:g.id,nativeServiceId:owner.id,purpose:'recipient_address_check',requires:conditional?{device_os:['windows']}:{},entryMode:'resolution',expectedFingerprint:digest(g)})),reviewedContexts:[]};
 const input={configuration,mapping,allowedNativeServiceIds:[owner.id],diagnosticServices:['mail'],...callbacks};
 const refreshPins=()=>{
  mapping.sourceRevision=String(configuration.revision);mapping.sourceCatalogFingerprint=digest(configuration);
  for(const r of mapping.guides){const g=configuration.guides.find(x=>x.id===r.guideId);if(g)r.expectedFingerprint=digest(g);}
 };
 const projection=()=>projectNativeCatalog(input);
 const route=(i=0)=>inspectNativeGuideRoute({...input,mappingRow:mapping.guides[i]});
 async function approvedBase(){
  const approvals=mapping.guides.map((g,i)=>({guideId:g.guideId,reviewerRef:'synthetic-reviewer',approvalRef:'synthetic-approval-'+i,rowFingerprint:digest(g),guideFingerprint:g.expectedFingerprint,
   sourceCatalogFingerprint:mapping.sourceCatalogFingerprint,sourceConfirmed:true,applicabilityConfirmed:true,permissionConfirmed:true,routeFingerprint:route(i).routeFingerprint,routeDependenciesConfirmed:true}));
  const c=await prepareMappingRelease({...input,preparerRef:'synthetic-author',releaseReviewerRef:'synthetic-release-reviewer',releaseId:'synthetic-base-release',approvals,verifyMappingApproval:async()=>true});
  // This is deliberately a simulated authoritative host activation for tests,
  // not an implementation or example of a production activation shortcut.
  return {kind:'native_mapping_release',status:'active',activated:true,revoked:false,activationRef:'synthetic-base-activation',payload:c.payload,releaseFingerprint:c.releaseFingerprint};
 }
 return {input,configuration,mapping,owner,callbacks,refreshPins,projection,route,approvedBase};
}
