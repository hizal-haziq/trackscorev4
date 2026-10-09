// Browser mutation checks always run against a fresh temporary application copy.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import net from 'node:net';
const root=path.resolve(import.meta.dirname,'..'),qa=path.join(root,'qa');
const npm=process.platform==='win32'?'npm.cmd':'npm';
if(!fs.existsSync(path.join(os.tmpdir(),'trackscore-audit-tools/node_modules/playwright-core/index.mjs')))throw new Error('Install browser audit tools as described in qa/button_functionality_audit.md first.');
async function run(command,args,log){const fd=fs.openSync(path.join(qa,log),'w');try{const child=spawn(command,args,{cwd:root,stdio:['ignore',fd,fd],env:{...process.env,AUDIT_MANAGER_PASSWORD:''}});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)throw new Error(`${command} ${args.join(' ')} failed; see qa/${log}`);}finally{fs.closeSync(fd);}}
await run(npm,['run','build'],'current-build.log');
await run(process.execPath,['scripts/payment-removal-browser-setup.mjs'],'current-browser-setup.log');
const state=JSON.parse(fs.readFileSync(path.join(qa,'payment-removal-state.json')));
const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});state.port=probe.address().port;await new Promise(resolve=>probe.close(resolve));fs.writeFileSync(path.join(qa,'payment-removal-state.json'),JSON.stringify(state,null,2));
const fd=fs.openSync(path.join(qa,'current-browser-server.log'),'w');
const server=spawn(process.execPath,['build/server.cjs'],{cwd:state.sandbox,stdio:['ignore',fd,fd],env:{...process.env,PORT:String(state.port),NODE_ENV:'development'}});
try{
 let ready=false;
 for(let attempt=0;attempt<40;attempt++){try{const response=await fetch(`http://127.0.0.1:${state.port}/api/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('Temporary browser server failed to start.');
 for(const name of ['workflow','supplement','extended']){console.log(`Running ${name} browser checks...`);await run(process.execPath,[`scripts/current-button-${name}.mjs`],`current-button-${name}.log`);const result=JSON.parse(fs.readFileSync(path.join(qa,`current-button-${name}-results.json`)));if(result.results.some(t=>!t.passed))throw new Error(`${name} has failed browser assertions; inspect its results JSON.`);}
 // The extended suite changes only the temporary Manager password.
 const secondaryFd=fs.openSync(path.join(qa,'current-button-secondary.log'),'w');
 try{const child=spawn(process.execPath,['scripts/current-button-secondary.mjs'],{cwd:root,stdio:['ignore',secondaryFd,secondaryFd],env:{...process.env,AUDIT_MANAGER_PASSWORD:'ManagerChanged42!'}});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)throw new Error('Secondary browser checks failed.');}finally{fs.closeSync(secondaryFd);}
 await run(npm,['test'],'current-test.log');
 await run(npm,['run','lint'],'current-lint.log');
 await run(npm,['run','build'],'current-build.log');
 await run(process.execPath,['scripts/button-audit-inventory.mjs'],'current-control-source-inventory.log');
 await run(process.execPath,['scripts/current-button-report.mjs'],'current-button-report.log');
 const secondary=JSON.parse(fs.readFileSync(path.join(qa,'current-button-secondary-results.json')));
 if(secondary.results.some(t=>!t.passed))throw new Error('Secondary assertions failed; the report records the exact outcomes.');
 console.log('Audit report: qa/button_functionality_audit.md');
}finally{server.kill();fs.closeSync(fd);}
