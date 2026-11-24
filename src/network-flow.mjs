const value=(s,k)=>s.evidence[k]?.value;
/** Choose the exact failing operation before offering a network procedure.
 * A report of no general connectivity does not establish that Wi-Fi is
 * already connected. Keep the original task and admitted service scope. */
export function decideNetwork(state,{ask,guide,support,fromIdentity=false}){
 const v=k=>value(state,k);
 if(!v('network_issue'))return ask('network_issue');
 const issue=v('network_issue');
 if(issue==='unknown')return support('NETWORK_SYMPTOM_UNCLEAR');
 if(issue==='setup')return fromIdentity?support('ORIGINAL_CONNECTION_UNRESOLVED'):guide('network','network_setup');
 if(issue==='only_service')return v('connection')==='no'?support('NETWORK_OBSERVATIONS_CONFLICT'):support('SPECIFIC_SERVICE_FAILURE');
 if(issue==='auth')return v('credentials')==='locked'?support('ACCOUNT_LOCKED'):guide('network','network_auth');
 if(issue==='ssid_missing'){
  if(!v('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  if(v('peers')!=='no')return support('NETWORK_SCOPE_UNCLEAR');
  return guide('network','network_ssid');
 }
 if(issue==='slow'){
  if(!v('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  return v('peers')==='no'?guide('network','network_slow'):support('NETWORK_SCOPE_UNCLEAR');
 }
 if(issue==='no_internet'){
  if(!v('connection'))return ask('connection');
  if(v('connection')!=='no')return support(v('connection')==='yes'?'NETWORK_OBSERVATIONS_CONFLICT':'NETWORK_EVIDENCE_INCOMPLETE');
  if(!v('peers'))return ask('peers');
  if(v('peers')==='yes')return support('POSSIBLE_SHARED_NETWORK_INCIDENT');
  return v('peers')==='no'?guide('network','network_connected_no_internet'):support('NETWORK_SCOPE_UNCLEAR');
 }
 return support('NETWORK_SYMPTOM_UNCLEAR');
}
