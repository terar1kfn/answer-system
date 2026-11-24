// Explicit local operator utility. No network, runtime start, publication,
// tests, or automatic repair. Keep both inputs and outputs outside Git.
import {readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileNativeMapping} from '../src/integration/catalog-reconciliation.mjs';
import {createSnapshotReviewPolicy} from '../src/integration/snapshot-review-policy.mjs';
const fail=code=>{throw Error(code);};
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const inside=(parent,p)=>{const r=relative(parent,p);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
async function readPrivate(path){
 const real=await realpath(resolve(path));if(inside(root,real))fail('KEEP_PRIVATE_INPUT_OUTSIDE_REPOSITORY');
 const info=await stat(real);if(!info.isFile()||info.size>25*1024*1024)fail('INVALID_PRIVATE_INPUT');
 return JSON.parse(await readFile(real,'utf8'));
}
async function main(){
 const [requestPath,outputPath,...extra]=process.argv.slice(2);
 if(!requestPath||!outputPath||extra.length)fail('RECONCILIATION_ARGUMENTS_REQUIRED');
 const request=await readPrivate(requestPath);
 if(!request||typeof request.currentCatalogPath!=='string'||typeof request.mappingPath!=='string'||
  !request.policy||!request.options)fail('INVALID_RECONCILIATION_REQUEST');
 const configuration=await readPrivate(request.currentCatalogPath),envelope=await readPrivate(request.mappingPath);
 const previousMapping=envelope.candidateMapping??envelope;
 const baselineConfiguration=request.baselineCatalogPath?await readPrivate(request.baselineCatalogPath):null;
 const policy=createSnapshotReviewPolicy(request.policy);
 const result=reconcileNativeMapping({configuration,baselineConfiguration,previousMapping,
  allowedNativeServiceIds:request.allowedNativeServiceIds,diagnosticServices:request.diagnosticServices,...policy},request.options);
 const target=resolve(outputPath),parent=await realpath(dirname(target));
 if(inside(root,parent))fail('KEEP_PRIVATE_OUTPUT_OUTSIDE_REPOSITORY');
 // Exclusive creation prevents overwriting an existing draft or catalog.
 await writeFile(target,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 // Report counts only. Do not log catalog bodies or guide identifiers.
 console.log(JSON.stringify({status:result.status,relation:result.relation,retainedReviewCandidates:result.retainedReviewCandidates,withheldCount:result.withheldCount,published:false}));
}
try{await main();}catch(e){console.error(/^[A-Z0-9_]+$/.test(e?.message||'')?e.message:'PRIVATE_RECONCILIATION_FAILED');process.exitCode=1;}
