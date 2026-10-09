import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import jwt from 'jsonwebtoken';
const root=path.resolve(import.meta.dirname,'..'),state=JSON.parse(fs.readFileSync(path.join(root,'qa/full-system-state.json'))),base=`http://127.0.0.1:${state.port}`;
const rows=name=>JSON.parse(fs.readFileSync(path.join(state.sandbox,'.data',name+'.json'))),results=[],errors=[];
async function check(name,fn){try{const evidence=await fn();results.push({name,passed:true,evidence});}catch(e){results.push({name,passed:false,error:e.message});}console.log(results.at(-1));}
async function api(endpoint,token,data){return fetch(`${base}/.netlify/functions/${endpoint}`,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});}
const manager=await (await api('login',null,{email:'workflow-manager@audit.test',password:'WorkflowValidation42!',role:'manager'})).json();
const assessor=await (await api('login',null,{email:'workflow-assessor@audit.test',password:'WorkflowValidation42!',role:'assessor'})).json();
const template=rows('evaluations').find(r=>r.status==='completed');
const companyName='Runtime Revision Verification '+Date.now();
const registered=await (await api('register-customer',manager.token,{companyName,deviceModel:'Revision Gateway',requestedPackage:'package_1',contactPerson:'Verification',contactEmail:'revision-check@audit.test',contactPhone:'0123456789',assignedAssessor:assessor.user.name,assignedAssessorId:assessor.user.assessorId})).json();assert.ok(registered.id);
const submitted=await api('save-evaluation',assessor.token,{...template,_id:undefined,id:undefined,status:'pending_review',certificate:undefined,payment:undefined,companyName,deviceModel:'Revision Gateway',assessorName:assessor.user.name,assessorId:assessor.user.assessorId,registrationId:registered.id});assert.equal(submitted.status,200);
const rejected=await api('approve-evaluation',manager.token,{id:registered.id,action:'reject',reason:'Please revise the assessment evidence.'});assert.equal(rejected.status,200);
const record=rows('evaluations').find(r=>r._id===registered.id);assert.equal(record.status,'rejected');
await check('Unrelated Assessor cannot take over or spoof an assessment during resubmission',async()=>{
 const secret=fs.readFileSync(path.join(state.sandbox,'.env'),'utf8').match(/^JWT_SECRET=(.+)$/m)[1];
 const token=jwt.sign({role:'assessor',assessorId:'ZZZ 9999',name:'Unrelated verification assessor'},secret,{expiresIn:'5m'});
 const before=JSON.stringify(record);
 const ownIdentity=await api('save-evaluation',token,{...record,resubmitRecordId:record._id,assessorId:'ZZZ 9999',assessorName:'Unrelated verification assessor'});assert.equal(ownIdentity.status,403);
 const spoofedIdentity=await api('save-evaluation',token,{...record,resubmitRecordId:record._id});assert.equal(spoofedIdentity.status,403);
 assert.equal(JSON.stringify(rows('evaluations').find(r=>r._id===record._id)),before);return {unrelatedAssessor:403,spoofedIdentity:403,recordUnchanged:true};
});
const baseline=rows('assessment_versions').filter(v=>v.evaluationId===record._id),baselineJSON=JSON.stringify(baseline);assert.ok(baseline.length);
const {chromium}=await import(pathToFileURL(path.join(os.tmpdir(),'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),context=await browser.newContext();
await context.addInitScript(account=>{localStorage.setItem('trackscore_token',account.token);localStorage.setItem('trackscore_user_role',account.role);localStorage.setItem('trackscore_user',JSON.stringify(account.user));},assessor);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await check('Assessor loads requested revision with all 33 persisted criterion comments',async()=>{
 await page.goto(base+'/index.html');await page.locator('#tab-btn-submissions').click();await page.locator(`button[onclick="loadAndScrollEvaluationForCorrection('${record._id}')"]:visible`).click();
 await page.waitForFunction(name=>document.getElementById('companyName').value===name,companyName);
 const textareas=page.locator('textarea.criterion-comment-input');assert.equal(await textareas.count(),33);
 for(let i=0;i<33;i++)assert.equal(await textareas.nth(i).inputValue(),record.breakdown[i].comment);
 assert.ok((await page.locator('body').textContent()).includes('Please revise the assessment evidence.'));return {criteria:33,commentsRestored:33,managerReasonVisible:true};
});
await check('Assessor edits comments 1, 2, 10, 20, 33 and resubmits genuine version 2',async()=>{
 const comments=page.locator('textarea.criterion-comment-input');for(const i of [0,1,9,19,32])await comments.nth(i).fill(i===9?'Revision criterion 10 '+ 'x'.repeat(1800):`Revision criterion ${i+1} <script>window.__injected=true</script>`);
 await page.locator('#btn-save-evaluation').click();const waiting=page.waitForResponse(r=>r.url().includes('/save-evaluation')&&r.request().method()==='POST');await page.locator('#btn-execute-submit').click();const response=await waiting;assert.equal(response.status(),200);
 const current=rows('evaluations').find(r=>r._id===record._id);assert.equal(current.currentVersion,2);assert.equal(current.status,'submitted');for(const i of [0,1,9,19,32])assert.ok(current.breakdown[i].comment.startsWith(`Revision criterion ${i+1}`));
 assert.equal(JSON.stringify(rows('assessment_versions').filter(v=>baseline.some(b=>b._id===v._id))),baselineJSON);return {version:2,status:current.status,originalSnapshotUnchanged:true,editedCriteria:[1,2,10,20,33]};
});
await check('Reload retains revised comments and renders text without script execution',async()=>{
 await page.reload();await page.locator('#tab-btn-submissions').click();await page.evaluate(id=>loadAndScrollEvaluationForCorrection(id),record._id);await page.waitForFunction(name=>document.getElementById('companyName').value===name,companyName);
 for(const i of [0,1,9,19,32])assert.ok((await page.locator('textarea.criterion-comment-input').nth(i).inputValue()).startsWith(`Revision criterion ${i+1}`));assert.equal(await page.evaluate(()=>window.__injected===true),false);return {reloadPersisted:true,scriptExecuted:false};
});
await check('Backend rejects score tampering and overlong comments',async()=>{
 const current=rows('evaluations').find(r=>r._id===record._id);const tampered=await api('save-evaluation',assessor.token,{...current,resubmitRecordId:record._id,totalScore:999});assert.equal(tampered.status,400);
 const breakdown=current.breakdown.map((r,i)=>i===0?{...r,comment:'x'.repeat(2001)}:r);const long=await api('save-evaluation',assessor.token,{...current,resubmitRecordId:record._id,breakdown});assert.equal(long.status,400);return {tamperedScore:400,comment2001Characters:400};
});
await check('Approved record rejects direct mutation and has no correction action in submissions',async()=>{
 const approved=await api('approve-evaluation',manager.token,{id:record._id,action:'approve',managerReviewComment:'Revision verified'});assert.equal(approved.status,200);
 const current=rows('evaluations').find(r=>r._id===record._id);const snapshot=JSON.stringify(current);const modified=await api('save-evaluation',assessor.token,{...current,resubmitRecordId:record._id});const registrationPath=await api('save-evaluation',assessor.token,{...current,registrationId:record._id});fs.writeFileSync(path.join(root,'qa/full-system-immutability-response.json'),JSON.stringify({approvedStatus:current.status,status:modified.status,registrationPathStatus:registrationPath.status,recordUnchanged:JSON.stringify(rows('evaluations').find(r=>r._id===record._id))===snapshot},null,2));assert.equal(modified.status,403);assert.equal(registrationPath.status,403);assert.equal(JSON.stringify(rows('evaluations').find(r=>r._id===record._id)),snapshot);
 await page.reload();await page.locator('#tab-btn-submissions').click();assert.equal(await page.locator(`button[onclick="loadAndScrollEvaluationForCorrection('${record._id}')"]`).count(),0);return {status:403,recordUnchanged:true,frontendCorrectionActionAbsent:true};
});
await browser.close();fs.writeFileSync(path.join(root,'qa/full-system-revision-results.json'),JSON.stringify({results,errors},null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
