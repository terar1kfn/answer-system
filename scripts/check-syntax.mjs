import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&p.endsWith('.mjs'))files.push(p);}}
for(const dir of ['src','scripts','demo','tests'])walk(dir);
let failures=0;
for(const p of files){const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status!==0){failures++;console.error('Syntax check failed:',p);}}
console.log('Syntax files checked: '+files.length+'; failures: '+failures);
process.exitCode=failures?1:0;
