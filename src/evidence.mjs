// Explainable candidate causes. Student reports can support a hypothesis;
// they cannot establish an administrator-confirmed root cause.
const val=(state,k)=>state.evidence[k]?.value;
const domainCauses={
 identity:['mfa_setup_required','verification_method_unavailable','verification_failure','credential_rejection','account_restriction','connectivity','service_specific_failure'],
 mail:['recipient_restriction','recipient_address','sender_restriction','mailbox_delivery','service_specific_failure'],
 network:['connectivity','shared_network_incident'],
 task:['identity_or_access','service_specific_failure'],
 specific:['service_specific_failure','permission_or_configuration','local_client_failure','service_disruption'],
 exam:['exam_application_failure'],
 unknown:[],safety:[]
};
export function summarizeEvidence(state){
 const candidates=(domainCauses[state.domain]||[]).map(causeId=>({causeId,status:'candidate',evidenceKeys:[]}));
 const v=k=>val(state,k);
 const support=(id,keys)=>{const c=candidates.find(x=>x.causeId===id);if(c){c.status='supported';c.evidenceKeys=keys;}};
 if(v('mfa_prompt')==='setup_required')support('mfa_setup_required',['mfa_prompt']);
 if(v('mfa_access')==='no')support('verification_method_unavailable',['mfa_access']);
 if(['blocked','missing'].includes(v('mfa_prompt')))support('verification_failure',['mfa_prompt']);
 if(v('setup_blocker')==='verification')support('verification_failure',['setup_blocker']);
 if(v('credentials')==='rejected')support('credential_rejection',['credentials']);
 if(v('credentials')==='locked')support('account_restriction',['credentials']);
 if(v('connection')==='no')support('connectivity',['connection']);
 if(v('peers')==='yes'&&v('connection')==='no')support('shared_network_incident',['connection','peers']);
 if(v('send_error')==='recipients')support('recipient_restriction',['send_error']);
 if(v('send_error')==='address')support('recipient_address',['send_error']);
 if(v('send_error')==='restricted')support('sender_restriction',['send_error']);
 if(v('receive_scope')==='all'||v('receive_scope')==='some')support('mailbox_delivery',['receive_scope']);
 if(v('browser_scope')==='works')support('local_client_failure',['browser_scope']);
 if(v('browser_scope')==='fails')support('service_specific_failure',['browser_scope']);
 if(v('service_access')==='one_service')support('service_specific_failure',['service_access']);
 return candidates;
}
