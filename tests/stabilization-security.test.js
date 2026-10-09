import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {handler as update} from '../netlify/functions/update-evaluation.js';
import {handler as getEvaluations} from '../netlify/functions/get-evaluations.js';
import {handler as save} from '../netlify/functions/save-evaluation.js';
import {handler as archive} from '../netlify/functions/delete-evaluation.js';
import {handler as portal} from '../netlify/functions/vendor-portal-data.js';
import {connectToDatabase,closeDatabaseConnection,createAssessmentVersionRecord} from '../netlify/functions/db.js';
import {generateToken} from '../netlify/functions/auth.js';
import {SECTION_A_CRITERIA,SECTION_B_CRITERIA,recomputeScores} from '../netlify/functions/rubric.js';
const headers={authorization:'Bearer '+generateToken({role:'manager',name:'Regression Manager'})};
const breakdown=[...SECTION_A_CRITERIA,...SECTION_B_CRITERIA].map(c=>({id:c.id,selectedOption:c.options.at(-1).label,raw:c.options.at(-1).points,comment:'Original comment'}));
const score=recomputeScores(breakdown);
test('production database failure cannot create or use JSON fallback',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trackscore-production-test-'));
 try{for(const uri of ['', 'mongodb://127.0.0.1:1']){
  const module=pathToFileURL(path.resolve('netlify/functions/db.js')).href;
  const code=`const {connectToDatabase}=await import(${JSON.stringify(module)});try{await connectToDatabase();process.exitCode=1;}catch(e){if(e.code!=='DATABASE_UNAVAILABLE')throw e;}`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:dir,encoding:'utf8',env:{...process.env,NODE_ENV:'production',CONTEXT:'production',MONGODB_URI:uri}});
  assert.equal(r.status,0,r.stderr);assert.equal(fs.existsSync(path.join(dir,'.data')),false);
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('metadata API rejects technical edits and preserves the live assessment and version',async()=>{
 const db=await connectToDatabase();assert.equal(db.isMongoAtlas,false);const id='stability-technical-'+Date.now();
 await db.insertEvaluation({_id:id,status:'pending_review',companyName:'Technical Guard',breakdown:score.breakdown,...score});await createAssessmentVersionRecord(db,{evaluationId:id,versionNumber:1,breakdown:score.breakdown,scores:score});
 for(const patch of [{breakdown:breakdown.map(c=>({...c,comment:'overwrite'}))},{totalScore:0},{breakdown:[]}]){const r=await update({httpMethod:'PUT',headers,body:JSON.stringify({id,...patch})});assert.equal(r.statusCode,403,r.body);}
 assert.equal((await db.getEvaluationById(id)).breakdown[0].comment,'Original comment');assert.equal((await db.getAssessmentVersion(id,1)).breakdown[0].comment,'Original comment');
 const allowed=await update({httpMethod:'PUT',headers,body:JSON.stringify({id,officeAddress:'Allowed metadata'})});assert.equal(allowed.statusCode,200,allowed.body);await closeDatabaseConnection();
});
test('all approved and certified stages reject generic metadata changes',async()=>{
 const db=await connectToDatabase();for(const status of ['approved','pre_final_sent','payment_confirmed','certificate_issued','completed']){const id='stability-lock-'+status;await db.insertEvaluation({_id:id,status,companyName:'Locked identity',approvedVersion:1});const r=await update({httpMethod:'PUT',headers,body:JSON.stringify({id,companyName:'Tampered identity'})});assert.equal(r.statusCode,403,r.body);assert.equal((await db.getEvaluationById(id)).companyName,'Locked identity');}await closeDatabaseConnection();
});
test('null update and submit bodies fail with safe validation errors',async()=>{
 assert.equal((await update({httpMethod:'PUT',headers,body:'null'})).statusCode,400);
 const assessorHeaders={authorization:'Bearer '+generateToken({role:'assessor',name:'Stability Assessor',assessorId:'STB 0001'})};assert.equal((await save({httpMethod:'POST',headers:assessorHeaders,body:'null'})).statusCode,400);
});
test('concurrent first submissions cannot mismatch the live record and v1 snapshot',async()=>{
 const db=await connectToDatabase(),id='stability-race-'+Date.now();await db.insertEvaluation({_id:id,status:'assigned',companyName:id,deviceModel:'Race gateway',assignedAssessorId:'STB 0001',assignedAssessor:'Race Assessor'});
 const assessorHeaders={authorization:'Bearer '+generateToken({role:'assessor',assessorId:'STB 0001',name:'Race Assessor'})};
 const payload={registrationId:id,companyName:id,deviceModel:'Race gateway',assessorName:'Race Assessor',assessorId:'STB 0001',assessmentDate:'2026-10-08',...score};
 const rs=await Promise.all(['first','second'].map(comment=>save({httpMethod:'POST',headers:assessorHeaders,body:JSON.stringify({...payload,breakdown:breakdown.map(c=>({...c,comment}))})})));
 assert.deepEqual(rs.map(r=>r.statusCode).sort(),[200,409]);const live=await db.getEvaluationById(id),v=await db.getAssessmentVersion(id,1);assert.deepEqual(live.breakdown,v.breakdown);assert.equal(live.currentVersion,1);await closeDatabaseConnection();
});
test('storage failure returns a safe error instead of filesystem diagnostics',async()=>{
 await closeDatabaseConnection();const db=await connectToDatabase();assert.equal(db.isMongoAtlas,false);const file=path.join(process.cwd(),'.data/evaluations.json');const saved=fs.readFileSync(file);fs.unlinkSync(file);fs.mkdirSync(file);
 try{const r=await getEvaluations({httpMethod:'GET',headers,queryStringParameters:{}});assert.equal(r.statusCode,500);assert.doesNotMatch(r.body,/EISDIR|ENOENT|node_modules|stack|\.data|\/tmp\//i);}finally{fs.rmdirSync(file);fs.writeFileSync(file,saved);await closeDatabaseConnection();}
});
test('vendor history retains changedAt timestamps without exposing internal identity fields',async()=>{
 const db=await connectToDatabase(),id='stability-history-'+Date.now(),vendorId='stability-history-vendor-'+Date.now();await db.insertEvaluation({_id:id,companyName:'History test',status:'registered',statusHistory:[{status:'registered',changedAt:'2026-10-08T00:00:00Z',changedBy:'PRIVATE_INTERNAL',note:'Registered'}]});await db.createVendor({_id:vendorId,contactEmail:vendorId+'@audit.test',linkedRegistrationIds:[id],isActive:true});
 const r=await portal({httpMethod:'GET',headers:{authorization:'Bearer '+generateToken({role:'vendor',vendorId,email:vendorId+'@audit.test'})},queryStringParameters:{}});assert.equal(r.statusCode,200,r.body);const data=JSON.parse(r.body);assert.equal(data.evaluations[0].statusHistory[0].timestamp,'2026-10-08T00:00:00Z');assert.doesNotMatch(r.body,/PRIVATE_INTERNAL/);await closeDatabaseConnection();
});

test('archiving a nonexistent JSON record returns 404 without claiming success',async()=>{const db=await connectToDatabase();const before=JSON.stringify(await db.getEvaluations(true));const r=await archive({httpMethod:'DELETE',headers,body:JSON.stringify({id:'missing-archive-fixture'})});assert.equal(r.statusCode,404);assert.equal(JSON.stringify(await db.getEvaluations(true)),before);await closeDatabaseConnection();});
test('certificate delivery notes persist and oversized notes cannot change a signed record',async()=>{
 const {handler:certificate}=await import('../netlify/functions/issue-certificate.js');const db=await connectToDatabase();const id='stability-delivery-notes';
 await db.insertEvaluation({_id:id,status:'certificate_issued',companyName:'Notes Fleet',deviceModel:'Notes Gateway',approvedVersion:1,currentVersion:1,...score,certificate:{certificateNumber:'TS-NOTES-REGRESSION',certifiedVersion:1,preparedDate:'2026-10-08',printedDate:'2026-10-08',signedBy:'QA Signatory',signedDate:'2026-10-08'}});await createAssessmentVersionRecord(db,{evaluationId:id,versionNumber:1,breakdown:score.breakdown,scores:score});
 const oversized=await certificate({httpMethod:'POST',headers,body:JSON.stringify({id,step:'deliver',notes:'x'.repeat(2001)})});assert.equal(oversized.statusCode,400);assert.equal((await db.getEvaluationById(id)).status,'certificate_issued');
 const response=await certificate({httpMethod:'POST',headers,body:JSON.stringify({id,step:'deliver',notes:'  QA recipient pickup  ',deliveryMethod:'Direct In-Person Collection'})});assert.equal(response.statusCode,200,response.body);const saved=await db.getEvaluationById(id);assert.equal(saved.certificate.notes,'QA recipient pickup');assert.equal(saved.status,'completed');assert.equal(saved.certificate.certifiedVersion,1);await closeDatabaseConnection();
});
test('assignment notifications use authenticated account IDs and exclude another account even with matching names',async()=>{
 const {handler:notifications}=await import('../netlify/functions/get-notifications.js');const db=await connectToDatabase();const owner={role:'assessor',userId:'notif-account-owner',assessorId:'NTF 0001',name:'Notification Assessor',email:'notif-owner@test.invalid'};
 for(const [id,assignedAssessorId,name]of [['notif-own','notif-account-owner',owner.name],['notif-other','notif-other-account',owner.name],['notif-blank','notif-other-account','']])await db.insertEvaluation({_id:id,status:'assigned',companyName:id,assignedAssessorId,assignedAssessorName:name,assignedAssessor:name,assessorName:name,createdAt:new Date().toISOString()});
 const r=await notifications({httpMethod:'GET',headers:{authorization:'Bearer '+generateToken(owner)},queryStringParameters:{assessorId:'SPOOFED 9999'}});assert.equal(r.statusCode,200,r.body);const data=JSON.parse(r.body).notifications;assert.ok(data.some(n=>n.id==='notif-own'));assert.ok(!data.some(n=>['notif-other','notif-blank'].includes(n.id)));await closeDatabaseConnection();
});
