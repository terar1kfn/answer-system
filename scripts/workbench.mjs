import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createDevelopmentHost} from '../src/development-host.mjs';
const port=5388,root=new URL('../',import.meta.url),hosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);
const origins=new Set([...hosts].map(h=>'http://'+h)),key=randomBytes(32).toString('hex');
const persist=process.argv.includes('--persist-demo');
const host=createDevelopmentHost({persistDirectory:persist?fileURLToPath(new URL('.data/workbench/',root)):null});
const assets=new Map([
 ['/',['demo/workbench.html','text/html; charset=utf-8']],
 ['/workbench.css',['demo/workbench.css','text/css; charset=utf-8']],
 ['/workbench.mjs',['demo/workbench.mjs','text/javascript; charset=utf-8']]
]);
function headers(res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req){
 const declared=Number(req.headers['content-length']);if(Number.isFinite(declared)&&declared>24000)throw Error('REQUEST_TOO_LARGE');
 const chunks=[];let bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>24000)throw Error('REQUEST_TOO_LARGE');chunks.push(chunk);}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['persona','operation','command','data'].includes(k)))throw Error('INVALID_REQUEST');
 return data;
}
const server=createServer(async(req,res)=>{
 headers(res);
 if(!hosts.has(req.headers.host)){res.writeHead(403);return res.end('Loopback host required');}
 if(req.method==='POST'&&req.url==='/api/workbench'){
  if(!origins.has(req.headers.origin)||req.headers['x-workbench-key']!==key||!String(req.headers['content-type']).startsWith('application/json')||(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'))return json(res,403,{ok:false,error:'FORBIDDEN'});
  try{const result=await host.handle(await body(req));return json(res,200,{ok:true,data:result});}
  catch(e){const code=/^[A-Z0-9_]{1,100}$/.test(e?.message||'')?e.message:'WORKBENCH_REQUEST_FAILED';return json(res,400,{ok:false,error:code});}
 }
 const asset=assets.get(req.url);
 if(!['GET','HEAD'].includes(req.method)||!asset){res.writeHead(404);return res.end('Not found');}
 try{
  let content=await readFile(new URL(asset[0],root));
  if(req.url==='/')content=content.toString('utf8').replace('__WORKBENCH_KEY__',key);
  res.writeHead(200,{'Content-Type':asset[1]});res.end(req.method==='HEAD'?undefined:content);
 }catch{res.writeHead(500);res.end('Workbench unavailable');}
});
server.requestTimeout=15000;server.headersTimeout=10000;
let shuttingDown=false;
function close(){if(shuttingDown)return;shuttingDown=true;server.close(()=>{host.close();process.exitCode=0;});}
server.on('error',e=>{console.error('Isolated workbench could not start:',e.message);host.close();process.exitCode=1;});
process.once('SIGINT',close);process.once('SIGTERM',close);
server.listen(port,'127.0.0.1',()=>console.log('Synthetic development workbench: http://127.0.0.1:'+port+'/'));
