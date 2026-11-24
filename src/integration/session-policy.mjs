/**
 * Server-only policy resolution for an EXISTING native session service.
 * No hard-coded student ID, new session token, authentication bypass,
 * background heartbeat or actual timer override is performed by this module.
 */
export function createSessionPolicyResolver({authorizePersistentVisit,ordinaryIdleSec=120,ordinaryMaxSec=600}={}){
 if(typeof authorizePersistentVisit!=='function'||!Number.isSafeInteger(ordinaryIdleSec)||ordinaryIdleSec<1||!Number.isSafeInteger(ordinaryMaxSec)||ordinaryMaxSec<ordinaryIdleSec)throw Error('NATIVE_SESSION_POLICY_REQUIRED');
 return async function resolve(actor){
  if(!actor||actor.role!=='STUDENT'||actor.active!==true||typeof actor.actorRef!=='string'||!actor.actorRef||typeof actor.visitRef!=='string'||!actor.visitRef)throw Error('UNAUTHENTICATED');
  const permission=await authorizePersistentVisit({actorRef:actor.actorRef,visitRef:actor.visitRef});
  if(permission===true)return {mode:'persistent',idleTimeoutSec:null,maxDurationSec:null,studentCanFinish:false,staffTerminationRequired:true,authenticationRevocationStillApplies:true};
  return {mode:'ordinary',idleTimeoutSec:ordinaryIdleSec,maxDurationSec:ordinaryMaxSec,studentCanFinish:true,staffTerminationRequired:false,authenticationRevocationStillApplies:true};
 };
}
