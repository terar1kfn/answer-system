const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const fail=x=>{throw Error(x);};
export function newGuideLaunch({launchRef,reference}={}){
 if(!id(launchRef)||!reference||!id(reference.guideId)||!id(reference.nativeServiceId)||!id(reference.catalogRevision)||typeof reference.nativeGuideFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(reference.nativeGuideFingerprint))fail('INVALID_GUIDE_LAUNCH');
 return {launchRef,reference:{...reference},status:'awaiting_native_return'};
}
/**
 * Only the authenticated native visit's navigation recorder may supply this
 * receipt. Browser commands cannot submit step counts, a completion flag,
 * or a catalog fingerprint. A returned guide is NOT a resolved issue.
 */
export function acceptNativeGuideReturn(launch,receipt){
 if(!launch||!receipt||receipt.status!=='returned'||receipt.verified!==true||
 receipt.launchRef!==launch.launchRef||receipt.guideId!==launch.reference.guideId||
 receipt.nativeGuideFingerprint!==launch.reference.nativeGuideFingerprint||
 receipt.catalogRevision!==launch.reference.catalogRevision||
 !integer(receipt.totalSteps,1,200)||!integer(receipt.reachedStep,0,receipt.totalSteps))return null;
 const ref=launch.reference;
 // Legacy or branched progress may be displayed as navigation only. An
 // exact root-procedure number requires explicit native scope and pins.
 const root=receipt.progressScope==='root_resolution'&&receipt.resolutionGuideId===ref.guideId&&receipt.resolutionGuideFingerprint===ref.nativeGuideFingerprint&&receipt.totalSteps===ref.resolutionStepCount;
 return {launchRef:launch.launchRef,guideId:ref.guideId,catalogRevision:ref.catalogRevision,sourceRevision:ref.sourceRevision,nativeGuideFingerprint:ref.nativeGuideFingerprint,
  progressScope:root?'root_resolution':'unconfirmed',status:'returned',reachedStep:receipt.reachedStep,totalSteps:receipt.totalSteps};
}
export function mergeGuideReturns(rows,receipt,title){
 if(!receipt||receipt.status!=='returned'||!title||typeof title.en!=='string'||typeof title.ar!=='string')fail('INVALID_GUIDE_RETURN');
 const row={...receipt,title:{en:title.en,ar:title.ar}};
 return [...(rows||[]).filter(x=>x.launchRef!==receipt.launchRef),row].slice(-10);
}
export function guideContinuationView(issue){
 if(issue?.state?.decision?.kind!=='open_guide')return null;
 const launch=issue.guideLaunch;
 if(!launch)return {status:'offered',guideId:issue.state.decision.guideId};
 const receipt=(issue.guideReturns||[]).find(r=>r.launchRef===launch.launchRef);
 return receipt?{status:'returned',guideId:receipt.guideId,reachedStep:receipt.reachedStep,totalSteps:receipt.totalSteps}:
 {status:'awaiting_native_return',guideId:launch.reference.guideId};
}
