import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const port=5387,root=new URL('../',import.meta.url);
const routes=new Map([['/',['demo/index.html','text/html']],['/demo/styles.css',['demo/styles.css','text/css']],['/demo/app.mjs',['demo/app.mjs','text/javascript']],...['engine','classify','questions','demo-knowledge','knowledge','followup','evidence','service-taxonomy','service-playbooks','error-intelligence','privacy','catalog-adapter','answer-planner','error-intake','identity-signals','identity-flow','input-language','observation-intake','shared-access','resolution-planner','diagnostic-hypotheses'].map(x=>['/src/'+x+'.mjs',['src/'+x+'.mjs','text/javascript']])]);
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403);return res.end('Loopback host required');}
 const route=routes.get(req.url);
 if(!['GET','HEAD'].includes(req.method)||!route){res.writeHead(404);return res.end('Not found');}
 try{const b=await readFile(new URL(route[0],root));res.writeHead(200,{'Content-Type':route[1]+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(500);res.end('Demo file unavailable');}
});
server.on('error',e=>{console.error('Cannot start isolated lab:',e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('Diagnostic lab: http://127.0.0.1:'+port+'/'));
