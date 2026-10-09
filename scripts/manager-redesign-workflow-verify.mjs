import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/manager-redesign-browser-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const results = [], errors = [], network = [];
const stores = () => Object.fromEntries(['users', 'vendors', 'evaluations', 'inquiries', 'assessment_versions', 'assessment_risk'].map(name => [name, JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data', name + '.json')))]));
async function check(name, run) { try { await run(); results.push({ name, passed: true }); } catch (err) { results.push({ name, passed: false, error: err.message }); throw err; } finally { console.log(results.at(-1)); } }
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
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
async function close() { await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active')); document.querySelectorAll('.modal-backdrop').forEach(el => el.style.display = 'none'); document.body.style.overflow = ''; }); }
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
    for (const id of ['active','review','dueSoon','overdue','payments','certificates']) assert.equal(await page.locator('#overview-'+id).textContent(),'0');
    assert.ok((await page.locator('#overview-attention').textContent()).includes('caught up'));
    assert.ok((await page.locator('#overview-schedule').textContent()).includes('No assessments'));
    for (const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow at '+width);
      await page.screenshot({path:path.join(root,`qa/manager-redesign-empty-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1366,height:768});
    await page.locator('#tab-btn-evaluations').click();
  });
  await check('Manager empty tables and backend-derived statistics remain zero', async () => {
    await page.waitForFunction(() => document.getElementById('evaluations-tbody').textContent.toLowerCase().includes('no '));
    for (const [id, expected] of [['stat-total-evals','0'],['stat-avg-score','0.00'],['stat-five-star','0'],['sla-stat-active','0'],['sla-stat-rate','0%']]) assert.equal((await page.locator('#'+id).textContent()).trim(), expected);
    for (const id of ['tab-btn-registered','tab-btn-inquiries','tab-btn-workload','tab-btn-evaluations']) await page.locator('#'+id).click();
    assert.equal(stores().evaluations.length, 0); assert.equal(stores().vendors.length, 0);
    await page.screenshot({ path: path.join(root, 'qa/manager-redesign-workflow-empty-manager.png'), fullPage: true });
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
    await page.screenshot({ path: path.join(root, 'qa/manager-redesign-workflow-empty-assessor.png'), fullPage: true });
  });
  await login('manager','workflow-manager@audit.test',password);
  await check('Vendor account created through UI; empty portal contains no fabricated assessments', async () => {
    await page.locator('#btn-top-generate-vendor-cred').click(); await page.locator('#gen-cred-company-name').fill('Workflow Validation Fleet'); await page.locator('#gen-cred-contact-email').fill('workflow-vendor@audit.test');
    await clickApi('#btn-submit-gen-cred','/vendor-invite');
    vendorEmail = await page.locator('#vendor-invite-login-email').textContent(); vendorPassword = await page.locator('#vendor-invite-password').textContent();
    await login('vendor',vendorEmail.trim(),vendorPassword.trim());
    await page.waitForFunction(() => document.getElementById('kpi-active-count').textContent === '0');
    assert.equal(stores().evaluations.length, 0); assert.equal(await page.locator('#kpi-payment-status').textContent(), 'N/A'); assert.equal(await page.locator('#kpi-cert-status').textContent(), 'N/A');
    await page.screenshot({ path: path.join(root, 'qa/manager-redesign-workflow-empty-vendor.png'), fullPage: true });
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
    await page.locator('#tab-btn-registered').click(); await page.evaluate(id=>openScheduleModal(id),evaluationId); await page.locator('#schedule-date-input').fill('2026-10-02'); await page.locator('#schedule-device-model-input').fill('Workflow Gateway'); await clickApi('#btn-submit-schedule','/schedule-assessment');
    await close(); await page.evaluate(id=>openAssignTaskModal(id),evaluationId); await page.locator('#assign-task-assessor-select').selectOption('Workflow Assessor'); await page.locator('#assign-task-date-input').fill('2026-10-02'); await page.locator('#assign-task-device-input').fill('Workflow Gateway'); await clickApi('#btn-submit-assign-task','/assign-assessor'); await close();
  });
  await check('Assessor completes all 33 criteria and submits assigned registration in place', async () => {
    await login('assessor','workflow-assessor@audit.test',password); await page.locator('#tab-btn-submissions').click();
    await page.locator(`button[onclick^="startAssignedEvaluation('${evaluationId}'"]`).first().click();
    await page.locator('#assessmentDate').fill('2026-10-01');
    const names=await page.locator('input[type=radio]').evaluateAll(inputs=>[...new Set(inputs.map(i=>i.name))]); assert.equal(names.length,33);
    for(const name of names){const radio=page.locator(`input[type=radio][name="${name}"]`).last();await page.locator(`label[for="${await radio.getAttribute('id')}"]`).click();}
    for(let i=0;i<33;i++)await page.locator('textarea.criterion-comment-input').nth(i).fill(`Workflow evidence ${i+1}`);
    await page.locator('#btn-save-evaluation').click();await clickApi('#btn-execute-submit','/save-evaluation');
    assert.equal(stores().evaluations.length,1);assert.equal(stores().evaluations[0].breakdown.length,33);assert.equal(stores().evaluations[0].status,'pending_review');assert.equal(stores().assessment_versions.length,1);
  });
  await check('Manager approves and sends pre-final results; unpaid Vendor stays unpaid', async () => {
    await login('manager','workflow-manager@audit.test',password);await page.locator(`button[onclick="openEvaluationDetails('${evaluationId}')"]`).first().click();await page.locator('#manager-review-comment').fill('Workflow review completed');await page.locator('#btn-modal-approve').click();await clickApi('#btn-execute-approve-confirm','/approve-evaluation');await close();
    if(stores().evaluations[0].status==='pre_final_pending'){await page.evaluate(id=>openSendPreFinalModal(id),evaluationId);await clickApi('#btn-submit-pre-final','/send-pre-final');await close();}
    await login('vendor',vendorEmail.trim(),vendorPassword.trim());await page.waitForFunction(()=>document.getElementById('kpi-active-count').textContent==='1');assert.equal(await page.locator('#kpi-payment-status').textContent(),'PENDING');assert.equal(await page.locator('.badge-paid').count(),0);assert.ok(!JSON.stringify(await page.evaluate(()=>cachedEvaluations)).includes('Workflow evidence'));
  });
  await check('Vendor submits payment proof, Manager verifies, and certificate follows lifecycle', async () => {
    await page.evaluate(id=>openPaymentModal(id),evaluationId);await page.locator('#payment-amount').fill('4500');await page.locator('#payment-ref').fill('WORKFLOW-TRANSFER');await page.locator('#payment-date').fill('2026-10-01');await clickApi('#btn-submit-payment','/vendor-submit-payment');
    await login('manager','workflow-manager@audit.test',password);await page.evaluate(id=>openVerifyPaymentModal(id),evaluationId);await page.locator('#verify-pay-amount-input').fill('4500');await page.locator('#verify-pay-ref-input').fill('WORKFLOW-TRANSFER');await page.locator('#verify-pay-date-input').fill('2026-10-01');await clickApi('#btn-submit-verify-payment','/verify-payment');await close();
    for(const step of ['prepare','print','sign','deliver']){await page.evaluate(args=>openCertificateModal(args.id,args.step),{id:evaluationId,step});if(step==='print')await page.locator('#cert-print-confirm-check').check();if(step==='sign')await page.locator('#cert-sign-name').fill('Workflow Signatory');await clickApi('#btn-submit-certificate-action','/manage-certificate');await close();}
    assert.equal(stores().evaluations[0].status,'completed');assert.equal(stores().evaluations[0].certificate.signedBy,'Workflow Signatory');
  });
  await check('Vendor downloads genuine workflow certificate and public verification succeeds', async () => {
    await login('vendor',vendorEmail.trim(),vendorPassword.trim());const waiting=page.waitForEvent('download');await page.locator(`button[onclick="downloadOfficialCertificate('${evaluationId}')"]`).click();const file=await waiting;await file.saveAs(path.join(root,'qa/manager-redesign-workflow-workflow-certificate.pdf'));
    const response=await context.request.get(`${base}/.netlify/functions/verify-certificate?cert=${encodeURIComponent(stores().evaluations[0].certificate.certificateNumber)}`);assert.equal(response.status(),200);assert.equal((await response.json()).valid,true);
  });
  assert.ok(!errors.some(e=>e.kind==='exception'));
} finally {
  fs.writeFileSync(path.join(root,'qa/manager-redesign-workflow-browser-results.json'),JSON.stringify({results,errors,network,finalCounts:Object.fromEntries(Object.entries(stores()).map(([name,rows])=>[name,rows.length]))},null,2));
  await browser.close();
}
