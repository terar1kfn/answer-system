// Actual headless Chromium browser; isolated synthetic localhost previews.
// playwright-core is an optional CI/dev-only dependency, not a runtime dependency.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {QUESTIONS} from '../src/questions.mjs';
const servers=[];
async function start(script,port){
 const child=spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']});
 servers.push(child);let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('PREVIEW_EXITED '+output);
  try{const r=await fetch(base);if(r.ok){await r.arrayBuffer();return base;}}catch{}
  await new Promise(r=>setTimeout(r,50));
 }
 throw Error('PREVIEW_START_TIMEOUT '+output);
}
let browser;
const results=[];
async function scenario(name,viewport,fn){
 const context=await browser.newContext({viewport});
 const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['5387','5388'].includes(url.port))await route.continue();
  else {errors.push('Unexpected network request: '+url.origin);await route.abort();}
 });
 const page=await context.newPage();page.setDefaultTimeout(7000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.request().resourceType()!=='image')errors.push(r.status()+' '+r.url());});
 try{
  await fn(page);
  assert.deepEqual(errors,[]);
  results.push({name,passed:true});
 }catch(e){results.push({name,passed:false,error:String(e.message).slice(0,1600),browserErrors:errors});}
 finally{await context.close();}
}
async function expectTrace(page,expected){
 await page.waitForFunction(value=>{
  try{const s=JSON.parse(document.getElementById('trace').textContent);return Object.entries(value).every(([k,v])=>s.decision[k]===v);}catch{return false;}
 },expected);
}
async function checkWidth(page){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Document horizontal overflow');
}
try{
 const lab=await start('scripts/serve.mjs',5387),workbench=await start('scripts/workbench.mjs',5388);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
 await scenario('diagnostic lab / desktop / full guide outcome',{width:1440,height:900},async page=>{
  await page.goto(lab);await page.locator('#query').fill('Recipient address not found');
  await page.getByRole('button',{name:'Start diagnosis'}).click();
  await expectTrace(page,{kind:'open_guide',guideId:'demo-recipient-address'});
  await page.getByRole('button',{name:QUESTIONS.outcome.options.find(o=>o.id==='yes').label.en,exact:true}).click();
  await expectTrace(page,{kind:'resolved_reported'});await checkWidth(page);
 });
 await scenario('diagnostic lab / mobile / Arabic fixed questions',{width:375,height:812},async page=>{
  await page.goto(lab);await page.locator('#query').fill('Wi-Fi not working');await page.locator('#lang').selectOption('ar');
  await page.getByRole('button',{name:'Start diagnosis'}).click();await expectTrace(page,{kind:'ask',questionId:'network_issue'});
  assert.equal(await page.locator('#result section').getAttribute('dir'),'rtl');
  const choice=QUESTIONS.network_issue.options.find(o=>o.id==='no_internet');
  await page.getByRole('button',{name:choice.label.ar,exact:true}).click();await expectTrace(page,{kind:'ask',questionId:'connection'});await checkWidth(page);
 });
 await scenario('workbench / desktop / model-free guide and staff view',{width:1440,height:900},async page=>{
  await page.goto(workbench);await page.locator('.searchbar input').fill('Recipient address not found');
  await page.getByRole('button',{name:'Diagnose',exact:true}).click();
  await page.getByRole('button',{name:QUESTIONS.outcome.options.find(o=>o.id==='yes').label.en,exact:true}).click();
  await page.getByRole('heading',{name:'Original task reported as working',exact:true}).waitFor();
  await page.locator('#persona').selectOption('intern-demo');
  await page.getByRole('heading',{name:'Intern workspace',exact:true}).waitFor();
  await checkWidth(page);
 });
 await scenario('workbench / mobile / Arabic and session isolation',{width:375,height:812},async page=>{
  await page.goto(workbench);await page.locator('.searchbar input').waitFor();
  await page.getByLabel('Diagnosis language').selectOption('ar');
  await page.getByRole('button',{name:'تشخيص',exact:true}).waitFor();
  await page.locator('.searchbar input').fill('Wi-Fi not working');
  await page.getByRole('button',{name:'تشخيص',exact:true}).click();
  await page.getByRole('heading',{name:QUESTIONS.network_issue.text.ar,exact:true}).waitFor();
  await checkWidth(page);
  await page.locator('#persona').selectOption('student-b');
  await page.getByRole('button',{name:'Diagnose',exact:true}).waitFor();
  assert.equal(await page.locator('.searchbar input').inputValue(),'');
  assert.equal(await page.locator('.choices').count(),0);
  await checkWidth(page);
 });
 console.log('BROWSER_SMOKE '+JSON.stringify(results));
 if(results.some(r=>!r.passed))process.exitCode=1;
}finally{
 await browser?.close();
 for(const child of servers){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,1500))]);if(child.exitCode===null)child.kill('SIGKILL');}}
}
