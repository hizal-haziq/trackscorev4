import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
const root=path.resolve(import.meta.dirname,'..');
const state=JSON.parse(fs.readFileSync(path.join(root,'qa/full-system-state.json')));
const base=`http://127.0.0.1:${state.port}`;
const rows=name=>JSON.parse(fs.readFileSync(path.join(state.sandbox,'.data',name+'.json')));
const results=[];
async function check(name,run){try{const evidence=await run();results.push({name,passed:true,evidence});}catch(e){results.push({name,passed:false,error:e.message});}console.log(results.at(-1));}
async function api(endpoint,token,data,method=data===undefined?'GET':'POST'){return fetch(`${base}/.netlify/functions/${endpoint}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});}
async function login(email,password,role){const r=await api('login',null,{email,password,role});assert.equal(r.status,200);return r.json();}
const manager=await login('workflow-manager@audit.test','WorkflowValidation42!','manager');
const assessor=await login('workflow-assessor@audit.test','WorkflowValidation42!','assessor');
const target=rows('evaluations').find(r=>r.status==='completed');assert.ok(target);
const inviteResponse=await api('vendor-invite',manager.token,{evaluationId:target._id,companyName:target.companyName,contactEmail:target.contactEmail});assert.ok(inviteResponse.ok);
const credentials=(await inviteResponse.json()).vendor;
const vendor=await login(credentials.loginEmail,credentials.password,'vendor');
const outsiderResponse=await api('vendor-invite',manager.token,{companyName:'Isolated ownership test',contactEmail:'ownership-check@audit.test'});assert.ok(outsiderResponse.ok);
const outsiderCredentials=(await outsiderResponse.json()).vendor;
const outsider=await login(outsiderCredentials.loginEmail,outsiderCredentials.password,'vendor');
const upload={evaluationId:target._id,name:'runtime-proof.txt',fileType:'text/plain',category:'payment_proof',fileData:Buffer.from('TrackScore runtime upload and byte-exact download\n').toString('base64')};
let documentId;
await check('Authentication rejects incorrect, absent and expired credentials',async()=>{
 assert.equal((await api('login',null,{email:'workflow-manager@audit.test',password:'incorrect',role:'manager'})).status,401);
 assert.equal((await api('get-evaluations')).status,401);
 const secret=fs.readFileSync(path.join(state.sandbox,'.env'),'utf8').match(/^JWT_SECRET=(.+)$/m)[1];
 const expired=jwt.sign({role:'manager'},secret,{expiresIn:-1});assert.equal((await api('get-evaluations',expired)).status,401);
 return {invalidPassword:401,missingJWT:401,expiredJWT:401};
});
await check('Vendor and Assessor cannot execute Manager-only operations',async()=>{
 const checked=[];for(const token of [vendor.token,assessor.token])for(const endpoint of ['approve-evaluation','assign-assessor','verify-payment','manage-certificate','vendor-invite']){const r=await api(endpoint,token,{id:target._id,step:'prepare',action:'approve'});assert.equal(r.status,403,endpoint);checked.push(endpoint);}
 assert.equal((await api('export-evaluations',vendor.token)).status,403);return {deniedRequests:checked.length+1};
});
await check('Internal notifications deny Vendors and preserve Manager and Assessor access',async()=>{
 assert.equal((await api('get-notifications',vendor.token)).status,403);assert.equal((await api('get-notifications',outsider.token)).status,403);
 assert.equal((await api('get-notifications',manager.token)).status,200);assert.equal((await api('get-notifications',assessor.token)).status,200);return {vendor:403,unrelatedVendor:403,manager:200,assessor:200};
});
await check('Document upload persists and download returns identical original bytes',async()=>{
 const r=await api('vendor-documents',vendor.token,upload);assert.equal(r.status,201);const data=await r.json();
 const docs=rows('evaluations').find(r=>r._id===target._id).documents;documentId=docs.at(-1).id;assert.ok(documentId);
 const downloaded=await api(`vendor-documents?evaluationId=${target._id}&docId=${documentId}&action=download`,vendor.token);
 assert.equal(downloaded.status,200);const bytes=Buffer.from(await downloaded.arrayBuffer());assert.deepEqual(bytes,Buffer.from(upload.fileData,'base64'));
 return {uploadStatus:r.status,documentStored:true,downloadStatus:downloaded.status,expectedBytes:Buffer.from(upload.fileData,'base64').length,actualBytes:bytes.length,byteExact:true};
});
await check('Documents reject unsupported MIME types',async()=>{
 const r=await api('vendor-documents',vendor.token,{...upload,name:'blocked.html',fileType:'text/html'});assert.equal(r.status,400);return {status:r.status};
});
await check('Oversized HTTP upload is rejected without storing it',async()=>{
 const before=rows('evaluations').find(r=>r._id===target._id).documents.length;
 const r=await api('vendor-documents',vendor.token,{...upload,name:'oversized.txt',fileData:Buffer.alloc(10*1024*1024+1).toString('base64')});assert.ok([400,413].includes(r.status));
 assert.equal(rows('evaluations').find(r=>r._id===target._id).documents.length,before);return {status:r.status,stored:false};
});
await check('Cross-Vendor documents, payment and revisions are denied',async()=>{
 const outputs=[];for(const [endpoint,data] of [[`vendor-documents?evaluationId=${target._id}&docId=${documentId}&action=download`,undefined],['vendor-documents',upload],['vendor-submit-payment',{evaluationId:target._id,amount:4500,referenceNumber:'CROSS-VENDOR'}],['vendor-resubmit',{evaluationId:target._id,notes:'Unauthorized revision'}]]){const r=await api(endpoint,outsider.token,data);assert.equal(r.status,403,endpoint);outputs.push({endpoint:endpoint.split('?')[0],status:r.status});}return outputs;
});
await check('Vendor portal excludes internal assessment comments and unrelated records',async()=>{
 const r=await api('vendor-portal-data',vendor.token);assert.equal(r.status,200);const data=await r.json();const raw=JSON.stringify(data);
 for(const item of target.breakdown)if(item.comment)assert.ok(!raw.includes(item.comment));
 const other=await api('vendor-portal-data',outsider.token);const unrelated=JSON.stringify(await other.json());assert.ok(!unrelated.includes(target._id));return {internalCommentsAbsent:true,unrelatedAssessmentAbsent:true};
});
await check('Express SSE rejects Assessor token without identity and mismatched scope',async()=>{
 const secret=fs.readFileSync(path.join(state.sandbox,'.env'),'utf8').match(/^JWT_SECRET=(.+)$/m)[1];
 const missing=jwt.sign({role:'assessor',name:'Isolated missing identity'},secret,{expiresIn:'5m'});
 const r=await api('status-stream',missing);assert.equal(r.status,403);
 const mismatch=await api('status-stream?assessorId=ZZZ%209999',assessor.token);assert.equal(mismatch.status,403);
 assert.equal((await api('status-stream')).status,401);return {missingIdentity:403,mismatchedScope:403,unauthenticated:401};
});
async function readStream(token){const abort=new AbortController();const r=await fetch(`${base}/.netlify/functions/status-stream`,{headers:{Authorization:`Bearer ${token}`},signal:abort.signal});assert.equal(r.status,200);const reader=r.body.getReader();const chunk=await reader.read();abort.abort();return new TextDecoder().decode(chunk.value).split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));}
await check('SSE history is scoped, sanitized and reconnects after disconnect',async()=>{
 const managerEvents=await readStream(manager.token);assert.ok(managerEvents.length>0);
 const vendorEvents=await readStream(vendor.token);assert.ok(vendorEvents.length>0);assert.ok(vendorEvents.every(e=>vendor.user.linkedRegistrationIds.includes(e.evaluationId)));assert.ok(vendorEvents.every(e=>!('actor' in e)&&!('assessorId' in e)));
 const outsiderEvents=await readStream(outsider.token);assert.equal(outsiderEvents.length,0);
 const assessorEvents=await readStream(assessor.token);assert.ok(assessorEvents.every(e=>String(e.assessorId||e.assignedAssessorId).toLowerCase()===assessor.user.assessorId.toLowerCase()));
 const reconnect=await readStream(vendor.token);assert.ok(reconnect.length>0);return {managerEvents:managerEvents.length,vendorEvents:vendorEvents.length,outsiderEvents:0,assessorEvents:assessorEvents.length,reconnected:true};
});
await check('Excel export returns a genuine readable workbook and correct rows',async()=>{
 const r=await api('export-evaluations',manager.token);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');
 fs.writeFileSync(path.join(root,'qa/full-system-export.xlsx'),bytes);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.worksheets[0];assert.ok(sheet.rowCount>1);assert.ok(JSON.stringify(sheet.getSheetValues()).includes(target.companyName));return {status:200,bytes:bytes.length,rows:sheet.rowCount,worksheets:workbook.worksheets.length};
});
await check('Public certificate API handles valid, invalid and missing identifiers',async()=>{
 const valid=await api(`verify-certificate?cert=${encodeURIComponent(target.certificate.certificateNumber)}`);assert.equal(valid.status,200);assert.equal((await valid.json()).valid,true);
 const bad=await api('verify-certificate?cert=DOES-NOT-EXIST');const data=await bad.json();assert.equal(data.valid,false);
 const response=await api('verify-certificate');assert.equal((await response.json()).valid,false);return {valid:200,invalid:bad.status,missing:response.status};
});
const {chromium}=await import(pathToFileURL(path.join(os.tmpdir(),'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({acceptDownloads:true});await context.addInitScript(account=>{localStorage.setItem('trackscore_token',account.token);localStorage.setItem('trackscore_user_role',account.role);localStorage.setItem('trackscore_user',JSON.stringify(account.user));},manager);
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await check('Assessment report PDF and Excel download through Manager controls',async()=>{
 await page.goto(base+'/dashboard.html');await page.locator('#tab-btn-evaluations').click();await page.waitForFunction(()=>document.querySelector('#stat-db-source').textContent!=='Checking');
 await page.evaluate(id=>viewEvaluationReport(id),target._id);const pdfWaiting=page.waitForEvent('download');await page.locator('#btn-download-pdf-modal').click();await (await pdfWaiting).saveAs(path.join(root,'qa/full-system-assessment-report.pdf'));
 assert.equal(fs.readFileSync(path.join(root,'qa/full-system-assessment-report.pdf')).subarray(0,5).toString(),'%PDF-');await page.evaluate(()=>document.querySelectorAll('.modal-overlay.active').forEach(e=>e.classList.remove('active')));
 const excelWaiting=page.waitForEvent('download');await page.locator('#btn-export-csv').click();const downloaded=await excelWaiting;assert.ok(downloaded.suggestedFilename().endsWith('.xlsx'));const out=path.join(root,'qa/full-system-browser-export.xlsx');await downloaded.saveAs(out);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(fs.readFileSync(out));assert.ok(JSON.stringify(workbook.worksheets[0].getSheetValues()).includes(target.companyName));return {pdfDownloaded:true,excelDownloaded:true,filenameExtension:'.xlsx',exceptions:errors.length};
});
const responsive=[];
await check('Eight pages tested at all five requested viewport sizes',async()=>{
 for(const filename of ['landing.html','login.html','request-assessment.html','verify-certificate.html','change-password.html','dashboard.html','index.html','vendor-portal.html']){
 const role=filename==='vendor-portal.html'?vendor:filename==='index.html'?assessor:manager;
 await page.evaluate(account=>{localStorage.setItem('trackscore_token',account.token);localStorage.setItem('trackscore_user_role',account.role);localStorage.setItem('trackscore_user',JSON.stringify(account.user));},role);
 await page.goto(base+'/'+filename);await page.waitForTimeout(200);
 for(const [width,height]of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);responsive.push({page:filename,width,height,overflow});if(overflow)await page.screenshot({path:path.join(root,`qa/full-system-overflow-${filename}-${width}.png`),fullPage:true});}
 }assert.ok(responsive.every(r=>!r.overflow),JSON.stringify(responsive.filter(r=>r.overflow)));return {checked:responsive.length};
});
await browser.close();
fs.writeFileSync(path.join(root,'qa/full-system-runtime-results.json'),JSON.stringify({results,responsive,errors},null,2));
process.exitCode=results.some(r=>!r.passed)?1:0;
