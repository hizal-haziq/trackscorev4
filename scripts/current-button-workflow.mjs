import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { recomputeScores } from '../netlify/functions/rubric.js';
const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/payment-removal-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const results = [], errors = [], network = [], interactions = [], runtime = [];
let current = "setup";
const stores = () => Object.fromEntries(['users', 'vendors', 'evaluations', 'inquiries', 'assessment_versions', 'assessment_risk'].map(name => [name, JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data', name + '.json')))]));
async function check(name, run) { current = name; const start = interactions.length; try { await run(); results.push({ name, passed: true, interactions: interactions.slice(start) }); } catch (err) { results.push({ name, passed: false, error: err.message, interactions: interactions.slice(start) }); throw err; } finally { console.log({ name: results.at(-1).name, passed: results.at(-1).passed, error: results.at(-1).error }); } }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
await context.exposeBinding('__recordControl', (source, item) => interactions.push({ page: new URL(source.page.url()).pathname, test: current, ...item }));
await context.addInitScript(() => {
 for (const type of ['click','change','input','submit']) document.addEventListener(type, e => {
  const el = e.target.closest('button,a[href],input,select,textarea,summary,[onclick],form');
  if(el) window.__recordControl({type,tag:el.localName,id:el.id,label:(el.textContent||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,180),inline:el.getAttribute('onclick')||'',href:el.getAttribute('href')||'',name:el.getAttribute('name')||''});
 }, true);
});
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on('pageerror', err => errors.push({ kind: 'exception', message: err.message }));
page.on('console', msg => { if (msg.type() === 'error') errors.push({ kind: 'console', message: msg.text() }); });
page.on('response', res => { if (res.status() >= 400) network.push({ url: res.url().replace(/token=[^&]+/, 'token=REDACTED'), status: res.status() }); });
page.on('dialog', d => d.accept());
async function clickApi(selector, endpoint) {
  const waiting = page.waitForResponse(r => r.url().includes(endpoint) && r.request().method() === 'POST');
  let response;
  try { [response] = await Promise.all([waiting, page.locator(selector).click()]); }
  catch (error) {
    const invalid = await page.evaluate(() => Array.from(document.querySelectorAll(':invalid')).map(el => ({ id: el.id, message: el.validationMessage })).filter(el => el.id));
    throw new Error(`${selector}: ${error.message}; invalid fields ${JSON.stringify(invalid)}`);
  }
  const data = await response.json(); assert.ok(response.ok(), JSON.stringify(data)); assert.equal(data.success, true, JSON.stringify(data));
  await page.waitForTimeout(300); return data;
}
async function login(role, email, password) {
  await page.goto(`${base}/login.html?role=${role}`);
  await page.locator('#login-email').fill(email); await page.locator('#login-password').fill(password); await page.locator('#btn-login-submit').click();
  await page.waitForURL(`**/${role === 'manager' ? 'dashboard' : role === 'assessor' ? 'index' : 'vendor-portal'}.html`);
  if (role === 'manager') {
    await page.waitForFunction(() => document.getElementById('overview-active').textContent !== '?');
    await page.locator('#tab-btn-evaluations').click();
    await page.waitForFunction(() => document.getElementById('stat-db-source').textContent !== 'Checking');
  }
}
async function close() {
 for (let attempt=0;attempt<8;attempt++) {
  const buttons=page.locator('.modal-overlay.active .modal-close-btn:visible, .modal-backdrop .modal-close:visible');
  if(!await buttons.count()) break;
  await buttons.last().click();
 }
}
const password = 'WorkflowValidation42!'; let vendorEmail, vendorPassword, inquiryId, evaluationId;
try {
  await check('All six application stores start at zero; preset-account login rejected', async () => {
    assert.ok(Object.values(stores()).every(rows => rows.length === 0));
    const response = await context.request.post(`${base}/.netlify/functions/login`, { data: { email: 'manager@trackscore.my', password, role: 'manager' } });
    assert.equal(response.status(), 401); assert.ok(Object.values(stores()).every(rows => rows.length === 0));
    await page.goto(`${base}/landing.html`); assert.ok(!(await page.content()).includes('5-Star Elite Grade'));
  });
  await check('Test fixtures, JSON storage and QA artifacts are not served publicly', async () => {
    for (const file of ['/.data/evaluations.json', '/tests/production-data-integrity.test.js', '/scripts/button-audit-setup.mjs', '/qa/certificate-pdf.pdf', '/cert_test_standard_company.pdf']) assert.equal((await context.request.get(base + file)).status(), 404, file);
  });
  await check('Explicit first-Manager setup creates exactly one chosen account', async () => {
    const created = spawnSync(process.execPath, ['scripts/create-first-manager.js', 'workflow-manager@audit.test', password, 'Workflow Manager'], { cwd: state.sandbox, encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr); assert.equal(stores().users.length, 1); assert.equal(stores().users[0].email, 'workflow-manager@audit.test');
  });
  await login('manager', 'workflow-manager@audit.test', password);
  await check('New Manager overview renders true empty states and responsive layout', async () => {
    await page.locator('#tab-btn-overview').click();
    await page.waitForFunction(() => document.getElementById('overview-active').textContent === '0');
    for (const id of ['active','review','dueSoon','overdue','certificates']) assert.equal(await page.locator('#overview-'+id).textContent(),'0');
    assert.ok((await page.locator('#overview-attention').textContent()).includes('caught up'));
    assert.ok((await page.locator('#overview-schedule').textContent()).includes('No assessments'));
    for (const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow at '+width);
      await page.screenshot({path:path.join(root,`qa/payment-removal-empty-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1366,height:768});
    await page.locator('#tab-btn-evaluations').click();
  });
  await check('Manager empty tables and backend-derived statistics remain zero', async () => {
    await page.waitForFunction(() => document.getElementById('evaluations-tbody').textContent.toLowerCase().includes('no '));
    for (const [id, expected] of [['stat-total-evals','0'],['stat-avg-score','0.00'],['stat-five-star','0'],['sla-stat-active','0'],['sla-stat-rate','0%']]) assert.equal((await page.locator('#'+id).textContent()).trim(), expected);
    for (const id of ['tab-btn-registered','tab-btn-inquiries','tab-btn-workload','tab-btn-evaluations']) await page.locator('#'+id).click();
    assert.equal(stores().evaluations.length, 0); assert.equal(stores().vendors.length, 0);
    await page.screenshot({ path: path.join(root, 'qa/payment-removal-workflow-empty-manager.png'), fullPage: true });
  });
  await check('Manager creates Assessor via Team Accounts', async () => {
    await page.locator('#btn-open-user-modal').click();
    for (const [id,value] of Object.entries({ 'staff-name-input':'Workflow Assessor','staff-email-input':'workflow-assessor@audit.test','staff-assessor-id-input':'AUD 0001','staff-password-input':password })) await page.locator('#'+id).fill(value);
    await clickApi('#btn-submit-create-user','/manage-users'); assert.equal(stores().users.length, 2); await close();
  });
  await check('Assessor empty submissions and notifications render without sample records', async () => {
    await login('assessor','workflow-assessor@audit.test',password);
    await page.locator('#tab-btn-submissions').click(); await page.locator('#tab-btn-notifications').click();
    assert.equal(stores().evaluations.length, 0); assert.equal(await page.evaluate(() => typeof fillDemoData), 'undefined');
    await page.screenshot({ path: path.join(root, 'qa/payment-removal-workflow-empty-assessor.png'), fullPage: true });
  });
  await login('manager','workflow-manager@audit.test',password);
  await check('Vendor account created through UI; empty portal contains no fabricated assessments', async () => {
    await page.locator('#btn-top-generate-vendor-cred').click(); await page.locator('#gen-cred-company-name').fill('Workflow Validation Fleet'); await page.locator('#gen-cred-contact-email').fill('workflow-vendor@audit.test');
    await clickApi('#btn-submit-gen-cred','/vendor-invite');
    vendorEmail = await page.locator('#vendor-invite-login-email').textContent(); vendorPassword = await page.locator('#vendor-invite-password').textContent();
    await login('vendor',vendorEmail.trim(),vendorPassword.trim());
    await page.waitForFunction(() => document.getElementById('kpi-active-count').textContent === '0');
    assert.equal(stores().evaluations.length, 0); assert.equal(await page.locator('#kpi-assessment-status').textContent(), 'N/A'); assert.equal(await page.locator('#kpi-cert-status').textContent(), 'N/A');
    await page.screenshot({ path: path.join(root, 'qa/payment-removal-workflow-empty-vendor.png'), fullPage: true });
  });
  await check('Public Inquiry creates a record through the actual form', async () => {
    await page.goto(`${base}/request-assessment.html`);
    for (const [id,value] of Object.entries({ companyName:'Workflow Validation Fleet',officeAddress:'Validation workspace',contactPerson:'Workflow Contact',contactEmail:'workflow-vendor@audit.test',contactPhone:'0123456789',deviceModel:'Workflow Gateway',message:'Isolated workflow validation' })) await page.locator('#'+id).fill(value);
    await page.locator('#state').selectOption({ label:'Selangor' }); await clickApi('#btn-submit','/submit-inquiry'); inquiryId=stores().inquiries[0]._id; assert.equal(stores().inquiries.length,1);
  });
  await login('manager','workflow-manager@audit.test',password);
  await check('Inquiry conversion creates registered assessment and real invoice', async () => {
    await page.locator('#tab-btn-inquiries').click(); await page.locator(`button[onclick="openConvertInquiryModal('${inquiryId}')"]`).click(); await clickApi('#btn-confirm-convert-inq','/manage-inquiries');
    evaluationId=stores().evaluations[0]._id; assert.equal(stores().evaluations.length,1); assert.equal(stores().inquiries[0].status,'converted'); assert.ok(stores().evaluations[0].invoice.invoiceNumber); await close();
  });
  await check('Vendor account links to registration through credential workflow', async () => {
    await page.locator('#tab-btn-evaluations').click(); await page.locator('#btn-top-generate-vendor-cred').click(); await page.locator('#gen-cred-company-select').selectOption(evaluationId);
    await clickApi('#btn-submit-gen-cred','/vendor-invite'); vendorEmail=await page.locator('#vendor-invite-login-email').textContent(); vendorPassword=await page.locator('#vendor-invite-password').textContent(); assert.ok(stores().vendors[0].linkedRegistrationIds.includes(evaluationId)); await close();
  });
  await check('Scheduling and assignment save through real handlers', async () => {
    await page.locator('#tab-btn-registered').click(); await page.locator(`button[onclick^="openScheduleModal('${evaluationId}'"]`).first().click(); await page.locator('#schedule-date-input').fill('2026-10-02'); await page.locator('#schedule-device-model-input').fill('Workflow Gateway'); await clickApi('#btn-submit-schedule','/schedule-assessment');
    await close(); await page.locator(`button[onclick^="openAssignTaskModal('${evaluationId}'"]`).first().click(); await page.locator('#assign-task-assessor-select').selectOption('Workflow Assessor'); await page.locator('#assign-task-date-input').fill('2026-10-02'); await page.locator('#assign-task-device-input').fill('Workflow Gateway'); await clickApi('#btn-submit-assign-task','/assign-assessor'); await close();
  });
  await check('Assessor completes all 33 criteria and submits assigned registration in place', async () => {
    await login('assessor','workflow-assessor@audit.test',password); await page.locator('#tab-btn-submissions').click();
    await page.locator(`button[onclick^="startAssignedEvaluation('${evaluationId}'"]:visible`).first().click();
    await page.locator('#assessmentDate').fill('2026-10-01');
    const names=await page.locator('input[type=radio]').evaluateAll(inputs=>[...new Set(inputs.map(i=>i.name))]); assert.equal(names.length,33);
    for(const name of names){const radio=page.locator(`input[type=radio][name="${name}"]`).last();await page.locator(`label[for="${await radio.getAttribute('id')}"]`).click();}
    for(let i=0;i<33;i++)await page.locator('textarea.criterion-comment-input').nth(i).fill(`Workflow evidence ${i+1}`);
    await page.locator('#btn-save-evaluation').click();await clickApi('#btn-execute-submit','/save-evaluation');
    assert.equal(stores().evaluations.length,1);assert.equal(stores().evaluations[0].breakdown.length,33);assert.deepEqual(stores().evaluations[0].breakdown.map(c=>c.comment),Array.from({length:33},(_,i)=>`Workflow evidence ${i+1}`));const calculated=recomputeScores(stores().evaluations[0].breakdown);for(const key of ['sectionAScore','sectionBScore','totalScore','starRating'])assert.equal(stores().evaluations[0][key],calculated[key]);assert.equal(stores().evaluations[0].status,'pending_review');assert.equal(stores().assessment_versions.length,1);
  });
  await check('Certificate API blocks before approval and denies Assessor and Vendor roles', async () => {
    await login('manager','workflow-manager@audit.test',password);
    const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
    const blocked = await context.request.post(base+'/.netlify/functions/manage-certificate', { headers: { Authorization: 'Bearer '+token }, data: { id: evaluationId, step: 'prepare' } });
    assert.equal(blocked.status(),400);
    for(const role of ['assessor','vendor']) {
      await login(role, role==='assessor'?'workflow-assessor@audit.test':vendorEmail.trim(), role==='assessor'?password:vendorPassword.trim());
      const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
      const denied = await context.request.post(base+'/.netlify/functions/manage-certificate', { headers: { Authorization: 'Bearer '+token }, data: { id: evaluationId, step: 'prepare' } });
      assert.equal(denied.status(),403);
      assert.ok(!(await page.locator('body').innerText()).match(/Submit Payment|Payment Pending|Payment Verified/));
    }
  });
  await check('Manager requests changes; Assessor revises and resubmits version 2', async () => {
    await login('manager','workflow-manager@audit.test',password);
    await page.locator(`button[onclick="openEvaluationDetails('${evaluationId}')"]`).first().click();
    await page.locator('#btn-modal-reject').click(); await page.locator('#reject-reason-input').fill('Please revise evidence for criterion 1.');
    await clickApi('#btn-confirm-reject','/approve-evaluation'); await close();
    await login('assessor','workflow-assessor@audit.test',password);
    await page.locator('#tab-btn-submissions').click();
    await page.locator(`button[onclick="loadAndScrollEvaluationForCorrection('${evaluationId}')"]:visible`).click();
    await page.locator('textarea.criterion-comment-input').first().fill('Revised workflow evidence 1');
    await page.locator('#btn-save-evaluation').click(); await clickApi('#btn-execute-submit','/save-evaluation');
    assert.equal(stores().assessment_versions.length,2); assert.equal(stores().evaluations[0].currentVersion,2);
  });
  await check('Manager approves version 2 directly to certificate readiness without creating payment data', async () => {
    await login('manager','workflow-manager@audit.test',password);
    await page.locator(`button[onclick="openEvaluationDetails('${evaluationId}')"]`).first().click();
    await page.locator('#manager-review-comment').fill('Workflow review completed');
    await page.locator('#btn-modal-approve').click(); await clickApi('#btn-execute-approve-confirm','/approve-evaluation');
    assert.equal(stores().evaluations[0].status,'approved'); assert.equal(stores().evaluations[0].approvedVersion,2);
    assert.equal(stores().evaluations[0].payment,undefined);
    assert.equal(await page.locator('#verify-payment-modal').count(),0); assert.equal(await page.locator('#send-pre-final-modal').count(),0);
    await close();
    await page.locator('#status-filter').selectOption('approved');
    await page.waitForFunction(() => document.getElementById('evaluations-tbody').textContent.includes('Workflow Validation Fleet'));
    await page.locator('#status-filter').selectOption('all');
  });
  await check('Manager prepares, prints, signs and delivers through certificate modal controls', async () => {
    for(const step of ['prepare','print','sign','deliver']) {
      await page.locator(`button[onclick="openEvaluationDetails('${evaluationId}')"]`).first().click();
      await page.locator(`#modal-approval-actions button[onclick="openCertificateModal('${evaluationId}', '${step}')"]`).click();
      if(step==='print') await page.locator('#cert-print-confirm-check').check();
      if(step==='sign') await page.locator('#cert-sign-name').fill('Workflow Signatory');
      await clickApi('#btn-submit-certificate-action','/manage-certificate'); await close();
    }
    assert.equal(stores().evaluations[0].status,'completed'); assert.equal(stores().evaluations[0].certificate.certifiedVersion,2);
    assert.equal(stores().evaluations[0].payment,undefined);
  });
  await check('Vendor downloads genuine workflow certificate and public verification succeeds', async () => {
    await login('vendor',vendorEmail.trim(),vendorPassword.trim());const waiting=page.waitForEvent('download');await page.locator(`button[onclick="downloadOfficialCertificate('${evaluationId}')"]`).click();const file=await waiting;await file.saveAs(path.join(root,'qa/payment-removal-workflow-workflow-certificate.pdf'));
    const response=await context.request.get(`${base}/.netlify/functions/verify-certificate?cert=${encodeURIComponent(stores().evaluations[0].certificate.certificateNumber)}`);assert.equal(response.status(),200);assert.equal((await response.json()).valid,true);
  });
  await check('Retired Express and Netlify payment routes return 410 without changing records', async () => {
    const before = JSON.stringify(stores().evaluations);
    for (const prefix of ['/api/', '/.netlify/functions/']) for (const endpoint of ['verify-payment', 'vendor-submit-payment', 'send-pre-final']) {
      const response = await context.request.post(base + prefix + endpoint, { data: { id: evaluationId, evaluationId, amount: 4500 } });
      assert.equal(response.status(), 410);
    }
    assert.equal(JSON.stringify(stores().evaluations), before);
  });
  await check('Vendor milestones and Manager completed certificate download remain usable', async () => {
    assert.equal(await page.locator('#modal-payment').count(), 0);
    assert.equal(await page.locator('option[value="payment_proof"]').count(), 0);
    assert.ok(!(await page.locator('body').innerText()).match(/Payment Pending|Submit Payment|Payment Verified/));
    await page.screenshot({ path: path.join(root, 'qa/payment-removal-vendor-completed.png'), fullPage: true });
    await login('manager','workflow-manager@audit.test',password);
    await page.locator(`button[onclick="openEvaluationDetails('${evaluationId}')"]`).first().click();
    assert.equal(await page.locator('#btn-modal-approve').count(), 0);
    const download = page.waitForEvent('download');
    await page.locator('#btn-footer-download-cert').click();
    await (await download).saveAs(path.join(root, 'qa/payment-removal-manager-certificate.pdf'));
    await page.screenshot({ path: path.join(root, 'qa/payment-removal-manager-completed.png'), fullPage: true });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
} finally {
  fs.writeFileSync(path.join(root,'qa/current-button-workflow-results.json'),JSON.stringify({generatedAt:new Date().toISOString(),results,errors,network,interactions,finalCounts:Object.fromEntries(Object.entries(stores()).map(([name,rows])=>[name,rows.length]))},null,2));
  await browser.close();
}
