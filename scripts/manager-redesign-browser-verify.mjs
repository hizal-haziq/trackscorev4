import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/manager-redesign-browser-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext();
const page = await context.newPage(); page.setDefaultTimeout(12000);
const results = [], errors = [], failed = [], responseCounts = {};
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().includes('/.netlify/functions/')) { const name = new URL(r.url()).pathname.split('/').at(-1); responseCounts[name] = (responseCounts[name] || 0) + 1; if (r.status() >= 400) failed.push({ name, status: r.status() }); } });
page.on('dialog', d => d.accept());
let managerHeaders;
async function check(name, run) { try { await run(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); throw e; } finally { console.log(results.at(-1)); } }
async function post(endpoint, data, headers = managerHeaders) { const res = await context.request.post(`${base}/.netlify/functions/${endpoint}`, { headers, data }); const result = await res.json(); assert.ok(res.ok(), `${endpoint}: ${JSON.stringify(result)}`); return result; }
async function overview() { await page.locator('#tab-btn-overview').click(); await page.waitForFunction(() => document.getElementById('manager-overview').getAttribute('aria-busy') === 'false'); }
async function closeModal() { await page.locator('.modal-overlay.active .modal-close-btn').last().click(); }
const stores = () => JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/evaluations.json')));
try {
  await page.goto(base + '/login.html?role=manager');
  await page.locator('#login-email').fill('workflow-manager@audit.test'); await page.locator('#login-password').fill('WorkflowValidation42!'); await page.locator('#btn-login-submit').click();
  await page.waitForURL('**/dashboard.html'); await page.waitForFunction(() => document.getElementById('overview-active').textContent !== '—');
  managerHeaders = { Authorization: 'Bearer ' + await page.evaluate(() => localStorage.getItem('trackscore_token')) };
  await check('Profile, keyboard dismissal, notifications and header destinations work', async () => {
    await page.locator('#overview-profile').click(); await page.locator('#overview-profile-dialog').waitFor({state:'visible'}); assert.ok((await page.locator('#overview-profile-email').textContent()).includes('@audit.test'));
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#overview-profile-dialog').isVisible(), false);
    await page.locator('#overview-profile').click(); await page.locator('#overview-profile-close').click();
    await page.locator('#overview-notifications').click(); await page.locator('#overview-notifications-dialog').waitFor({state:'visible'}); await page.locator('#overview-notifications-close').click();
    await page.locator('#nav-landing').click(); await page.waitForURL('**/landing.html'); await page.goto(base+'/dashboard.html'); await overview();
    await page.locator('#nav-audit-matrix').click(); await page.waitForURL('**/index.html');
    await page.goto(base+'/dashboard.html'); await overview();
    await page.locator('#overview-profile').click(); await page.locator('#overview-profile-dialog a').click(); await page.waitForURL('**/change-password.html');
    await page.goto(base+'/dashboard.html'); await overview();
  });
  await check('New Registration actually submits the existing registration form', async () => {
    if (stores().some(r=>r.companyName==='Dashboard UI Registration')) { await page.locator('#overview-new-registration').click(); await page.locator('#reg-modal-close').click(); return; }
    await page.locator('#overview-new-registration').click();
    for (const [id,value] of Object.entries({'reg-companyName':'Dashboard UI Registration','reg-contactPerson':'Validation Contact','reg-contactPhone':'0123456789','reg-contactEmail':'dashboard-registration@audit.test','reg-deviceModel':'UI Gateway'})) await page.locator('#'+id).fill(value);
    const response = page.waitForResponse(r=>r.url().includes('/register-customer') && r.request().method()==='POST'); await page.locator('#btn-submit-register').click(); assert.equal((await response).status(),201);
    await page.waitForFunction(()=>!document.getElementById('register-customer-modal').classList.contains('active'));
  });
  const assessor = JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/users.json'))).find(u=>u.role==='assessor');
  const template = stores().find(r=>r.status==='completed');
  const assessorAuth = await post('login',{email:'workflow-assessor@audit.test',password:'WorkflowValidation42!',role:'assessor'});
  const assessorHeaders = { Authorization: 'Bearer ' + assessorAuth.token };
  const ids = {};
  await check('Populated records are created through registration and assessment APIs, not seeded storage', async () => {
    const keys=['review','payment','certificate','revision','progress','dueSoon','overdue','scheduled'];
    if (keys.every(key=>stores().some(r=>r.companyName==='Dashboard Validation '+key))) { for(const key of keys) ids[key]=stores().find(r=>r.companyName==='Dashboard Validation '+key)._id; return; }
    for (const [key,slaDays] of [['review',7],['payment',7],['certificate',7],['revision',7],['progress',7],['dueSoon',1],['overdue',0.00001],['scheduled',7]]) {
      const registration = await post('register-customer', { companyName: 'Dashboard Validation '+key, deviceModel:'Workflow Gateway '+key, requestedPackage:'package_1', contactPerson:'Validation Contact', contactEmail:'dashboard-vendor@audit.test', contactPhone:'0123456789', slaDays, assignedAssessor:assessor.name, assignedAssessorId:assessor.assessorId, assignedAssessorEmail:assessor.email, scheduledDate:new Date().toISOString().slice(0,10)+(key==='scheduled'?'T11:30:00+08:00':'T09:00:00+08:00') });
      ids[key] = registration.id;
      if (['review','payment','certificate','revision','progress'].includes(key)) await post('save-evaluation', { ...template, _id:undefined, id:undefined, certificate:undefined, payment:undefined, status:key==='progress'?'in_progress':'pending_review', companyName:registration.registration.companyName, deviceModel:registration.registration.deviceModel, assessorName:assessor.name, assessorId:assessor.assessorId, registrationId:registration.id, assessmentDate:new Date().toISOString().slice(0,10) },assessorHeaders);
    }
    for (const key of ['payment','certificate']) await post('approve-evaluation',{id:ids[key],action:'approve',managerReviewComment:'Validation review approved'});
    await post('approve-evaluation',{id:ids.revision,action:'reject',reason:'Please revise the assessment evidence.'});
    let vendor;
    for(const key of ['payment','certificate']) vendor=(await post('vendor-invite',{registrationId:ids[key],companyName:'Dashboard Validation Vendor',contactEmail:'dashboard-vendor@audit.test',contactPhone:'0123456789'})).vendor;
    const vendorLogin=await post('vendor-login',{email:vendor.loginEmail,password:vendor.password});
    for(const key of ['payment','certificate']) await post('vendor-submit-payment',{id:ids[key],evaluationId:ids[key],amount:4500,paymentMethod:'Bank Transfer',paymentDate:new Date().toISOString().slice(0,10),referenceNumber:'DASHBOARD-'+key},{Authorization:'Bearer '+vendorLogin.token});
    await post('verify-payment',{id:ids.certificate,amountReceived:4500,paymentMethod:'Bank Transfer',referenceNumber:'DASHBOARD-certificate',paymentDate:new Date().toISOString().slice(0,10)});
  });
  await page.waitForTimeout(1500);
  await overview();
  await check('Global metrics, overdue priority, payment/certificate queues and workload warning reflect actual records', async () => {
    assert.ok(Number(await page.locator('#overview-active').textContent()) >= 8);
    assert.equal(await page.locator('#overview-review').textContent(),'1');
    assert.equal(await page.locator('#overview-payments').textContent(),'1');
    assert.equal(await page.locator('#overview-certificates').textContent(),'1');
    assert.equal(await page.locator('#overview-overdue').textContent(),'1');
    assert.ok(Number(await page.locator('#overview-dueSoon').textContent())>=1);
    assert.ok((await page.locator('#overview-attention .manager-list-item').first().textContent()).includes('overdue'));
    assert.ok((await page.locator('#overview-workload').textContent()).includes('High workload'));
    assert.ok((await page.locator('#overview-schedule').textContent()).includes('scheduled'));
  });
  await check('Notification Details opens the selected assessment without a competing dialog', async () => {
    await page.locator('#overview-notifications').click();
    await page.locator('#overview-notification-list button').first().click();
    assert.equal(await page.locator('#overview-notifications-dialog').isVisible(),false);
    await page.locator('#details-modal.active').waitFor(); await page.locator('#modal-close').click();
  });
  await check('Recent search and status/SLA filters do not change global totals', async () => {
    const active = await page.locator('#overview-active').textContent();
    await page.locator('#overview-search').fill('Dashboard Validation review'); await page.waitForFunction(()=>document.getElementById('overview-recent-count').textContent.startsWith('1 matching'));
    assert.equal(await page.locator('#overview-recent-body tr').count(),1); assert.equal(await page.locator('#overview-active').textContent(),active);
    await page.locator('#overview-search').fill(''); await page.locator('#overview-status').selectOption('revision'); await page.waitForFunction(()=>document.getElementById('overview-recent-body').textContent.includes('Revision Required'));
    await page.locator('#overview-status').selectOption('all'); await page.locator('#overview-sla').selectOption('OVERDUE'); await page.waitForFunction(()=>document.getElementById('overview-recent-count').textContent.startsWith('1 matching'));
    assert.ok((await page.locator('#overview-recent-body').textContent()).includes('overdue'));
    await page.locator('#overview-sla').selectOption('all');
  });
  await check('Attention Review opens existing read-only criterion review and Request Changes persists', async () => {
    await page.locator(`#overview-attention button[data-record="${ids.review}"]`).click();
    await page.locator('#details-modal.active').waitFor(); assert.ok((await page.locator('#modal-body').textContent()).includes('Workflow evidence'));
    assert.equal(await page.locator('#details-modal input[type=radio]').count(),0);
    await page.locator('#btn-modal-reject').click(); await page.locator('#reject-reason-input').fill('Dashboard shortcut revision validation');
    const response=page.waitForResponse(r=>r.url().includes('/approve-evaluation')&&r.request().method()==='POST'); await page.locator('#btn-confirm-reject').click(); assert.equal((await response).status(),200);
    await page.waitForFunction(()=>!document.getElementById('rejection-reason-modal').classList.contains('active') && document.getElementById('modal-body').textContent.includes('Evaluation Returned'));
    await page.locator('#modal-close').click();
    await page.waitForFunction(()=>document.getElementById('overview-review').textContent==='0');
  });
  await check('Recent and schedule Details and workload Details open the correct existing modals', async () => {
    await page.locator('#overview-recent-body button').first().click(); await page.locator('#details-modal.active').waitFor(); await page.locator('#modal-close').click();
    await page.locator('#overview-schedule button').first().click(); await page.locator('#details-modal.active').waitFor(); await page.locator('#modal-close').click();
    await page.locator('#overview-workload button').first().click(); await page.locator('#assessor-detail-modal.active').waitFor(); await closeModal();
  });
  await check('Attention Verify and Issue open the correct existing payment/certificate modals', async () => {
    await page.locator(`#overview-attention button[data-record="${ids.payment}"]`).click(); await page.locator('#verify-payment-modal.active').waitFor(); await closeModal();
    await page.locator(`#overview-attention button[data-record="${ids.certificate}"]`).click(); await page.locator('#manage-certificate-modal.active').waitFor(); await closeModal();
  });
  await check('Payment and certificate summary links filter the existing repository; Clear Filter and View All work', async () => {
    await page.locator('#overview-payments-link').click(); await page.waitForFunction(()=>document.getElementById('manager-queue-label').textContent.includes('Payments'));
    await page.waitForFunction(()=>document.getElementById('evaluations-tbody').textContent.includes('Dashboard Validation payment'));
    assert.ok(!(await page.locator('#evaluations-tbody').textContent()).includes('Dashboard Validation certificate'));
    await page.locator('#manager-queue-clear').click(); assert.equal(await page.locator('#manager-queue-banner').isVisible(),false);
    await overview(); await page.locator('#overview-certificates-link').click(); await page.waitForFunction(()=>document.getElementById('evaluations-tbody').textContent.includes('Dashboard Validation certificate'));
    assert.ok(!(await page.locator('#evaluations-tbody').textContent()).includes('Dashboard Validation payment'));
    await overview(); await page.locator('#overview-view-all').click(); assert.equal(await page.locator('#evaluations-tab-content').isVisible(),true);
    await overview(); await page.locator('#overview-workload-all').click(); assert.equal(await page.locator('#workload-tab-content').isVisible(),true);
    await page.locator('#tab-btn-registered').click(); assert.equal(await page.locator('#registered-customers-tab-content').isVisible(),true);
    await page.locator('#tab-btn-inquiries').click(); assert.equal(await page.locator('#inquiries-tab-content').isVisible(),true);
    await overview();
  });
  await check('Secondary quality filters are keyboard accessible and open the repository', async () => {
    await page.locator('.manager-secondary summary').click();
    for(const level of ['NORMAL','REVIEW','HIGH_ATTENTION','INSUFFICIENT_DATA']) {
      await page.locator(`button[onclick="filterByRiskLevel('${level}')"]`).focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#evaluations-tab-content').isVisible(),true);
      assert.equal(await page.locator('#risk-filter').inputValue(),level);
      await overview();
    }
    await page.locator('.manager-secondary summary').click();
  });
  await check('Populated responsive layouts and mobile modal stay usable at all requested sizes', async () => {
    for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow at '+width);
      assert.ok(!(await page.locator('#manager-overview').textContent()).match(/undefined|NaN|\[object Object\]/));
      await page.waitForTimeout(250);
      await page.screenshot({path:path.join(root,`qa/manager-redesign-populated-${width}.png`),fullPage:true});
    }
    await page.locator('#overview-new-registration').click(); await page.locator('#register-customer-modal.active').waitFor();
    assert.ok(await page.locator('#btn-submit-register').isVisible()); await page.locator('#reg-modal-close').click();
    await page.locator('#overview-profile').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#overview-profile-dialog').isVisible(),true); await page.keyboard.press('Escape');
  });
  await check('Loading, API error, stale-data label and Retry recover cleanly', async () => {
    await page.route('**/get-evaluations?*',async route=>{ if(new URL(route.request().url()).searchParams.get('view')==='overview') await route.fulfill({status:503,contentType:'application/json',body:'{"success":false}'});else await route.continue(); });
    await page.locator('#overview-refresh').click(); await page.locator('#overview-error').waitFor({state:'visible'}); assert.equal(await page.locator('#overview-updated').textContent(),'Showing last loaded data');
    await page.unroute('**/get-evaluations?*'); await page.locator('#overview-retry').click(); await page.waitForFunction(()=>document.getElementById('overview-error').hidden===true&&document.getElementById('manager-overview').getAttribute('aria-busy')==='false');
  });
  await check('Sign Out clears Manager authentication and returns to login', async()=>{await page.locator('#btn-logout').click();await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('trackscore_token')),null);});
  assert.deepEqual(errors,[]);
} finally {
  fs.writeFileSync(path.join(root,'qa/manager-redesign-browser-results.json'),JSON.stringify({results,errors,failed,responseCounts},null,2));
  await browser.close();
}
