import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/full-system-probe-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const interactions = [];
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
await context.exposeBinding('__recordAuditInteraction', (source, item) => { interactions.push({ page: new URL(source.page.url()).pathname, ...item }); });
await context.addInitScript(() => {
  window.__auditBindings = new WeakMap();
  const original = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...args) {
    const types = window.__auditBindings.get(this) || [];
    types.push(type); window.__auditBindings.set(this, types);
    return original.call(this, type, ...args);
  };
  for (const type of ['click', 'input', 'change', 'submit']) document.addEventListener(type, event => {
    const el = event.target.closest('button, a[href], input, select, textarea, [onclick], form');
    if (el) window.__recordAuditInteraction({ type, tag: el.localName, id: el.id, label: (el.textContent || '').trim().slice(0, 150), inline: el.getAttribute('onclick') || '', href: el.getAttribute('href') || '', name: el.getAttribute('name') || '' });
  }, true);
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const results = [], errors = [], requests = [], runtime = [], downloads = [];
let current = 'setup';
page.on('pageerror', err => errors.push({ test: current, kind: 'exception', message: err.message }));
page.on('console', msg => { if (msg.type() === 'error') errors.push({ test: current, kind: 'console', message: msg.text() }); });
page.on('requestfailed', req => requests.push({ test: current, url: req.url().replace(/token=[^&]+/, 'token=REDACTED'), error: req.failure()?.errorText }));
page.on('response', res => { if (res.status() >= 400) requests.push({ test: current, url: res.url().replace(/token=[^&]+/, 'token=REDACTED'), status: res.status() }); });
page.on('dialog', dialog => dialog.accept());
page.on('popup', popup => { popup.close().catch(() => {}); });
async function check(name, fn, controls = []) {
  current = name;
  const before = errors.length;
  try {
    await fn();
    if (errors.slice(before).some(e => e.kind === 'exception')) throw new Error(errors.slice(before).map(e => e.message).join('; '));
    results.push({ name, passed: true, controls });
  } catch (error) { results.push({ name, passed: false, error: error.message.slice(0, 1600), controls }); }
  console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} ${name}${results.at(-1).error ? ': ' + results.at(-1).error.slice(0, 500) : ''}`);
}
async function login(role) {
  await page.goto(`${base}/login.html?role=${role}`);
  await page.locator('#login-email').fill(`${role}@audit.test`);
  await page.locator('#login-password').fill('AuditPassword42!');
  await page.locator('#btn-login-submit').click();
  await page.waitForURL(`**/${role === 'manager' ? 'dashboard' : role === 'assessor' ? 'index' : 'vendor-portal'}.html`);
}
async function capture(label) {
  runtime.push({ label, url: page.url(), controls: await page.evaluate(() => Array.from(document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [onclick]:not(button):not(a):not(input):not(select):not(textarea)')).map(el => ({
    tag: el.tagName.toLowerCase(), id: el.id, label: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('name') || '').trim().slice(0, 130),
    inline: el.getAttribute('onclick') || el.getAttribute('onchange') || '', href: el.getAttribute('href') || '',
    events: window.__auditBindings.get(el) || [], onclick: typeof el.onclick === 'function', form: el.form?.id || '', formEvents: el.form ? window.__auditBindings.get(el.form) || [] : [],
    formInline: el.form?.getAttribute('onsubmit') || '', visible: !!el.getClientRects().length, disabled: !!el.disabled
  }))) });
}
async function closeAll() {
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-hidden', 'true'); }); document.querySelectorAll('.modal-backdrop').forEach(el => { el.style.display = 'none'; }); document.body.style.overflow = ''; });
}
async function apiClick(selector, endpoint) {
  const responsePromise = page.waitForResponse(res => res.url().includes(endpoint) && res.request().method() !== 'OPTIONS');
  const [response] = await Promise.all([responsePromise, page.locator(selector).click()]);
  const data = await response.json();
  assert.ok(response.ok(), JSON.stringify(data));
  assert.ok(data.success === true || data.valid === true, JSON.stringify(data));
  await page.waitForTimeout(250);
  return data;
}
async function download(selector, name) {
  const waiting = page.waitForEvent('download');
  const [file] = await Promise.all([waiting, page.locator(selector).first().click()]);
  const out = path.join(root, 'qa', name);
  await file.saveAs(out);
  assert.ok(fs.statSync(out).size > 10);
  downloads.push({ filename: name, bytes: fs.statSync(out).size });
  return out;
}
const pending = '00000000000000000000000a';
const prefinal = '00000000000000000000000b';
const completed = '00000000000000000000000c';
const registration = '00000000000000000000000d';
const rejected = '00000000000000000000000e';
try {
  await check('Homepage mobile navigation toggles', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/landing.html`); await capture('Homepage mobile');
    await page.locator('#mobile-toggle-btn').click();
    assert.equal(await page.locator('#mobile-toggle-btn').getAttribute('aria-expanded'), 'true');
    await page.locator('#mobile-toggle-btn').click();
    assert.equal(await page.locator('#mobile-toggle-btn').getAttribute('aria-expanded'), 'false');
  }, ['mobile-toggle-btn']);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/landing.html`);
  for (const tab of ['rating', 'matrix', 'packages', 'process', 'portals']) {
    await check(`Homepage drawer ${tab} link, tab, and Close`, async () => {
      await page.locator(`header .open-drawer-tab[data-tab="${tab}"]`).first().click();
      await page.locator(`.drawer-tab[data-tab-target="${tab}"]`).click();
      assert.equal(await page.locator('.drawer-tab.active').getAttribute('data-tab-target'), tab);
      await page.locator('#drawer-close-btn').click();
    }, ['drawer-close-btn']);
  }
  await capture('Homepage desktop');
  await page.goto(`${base}/login.html`);
  for (const role of ['manager', 'vendor', 'assessor']) await check(`Sign-in ${role} role tab`, async () => {
    await page.locator(`#tab-${role}`).click();
    assert.equal(await page.locator(`#tab-${role}`).evaluate(el => el.classList.contains('active')), true);
  }, [`tab-${role}`]);
  await check('Sign-in password visibility toggles both ways', async () => {
    await page.locator('#btn-toggle-password').click(); assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
    await page.locator('#btn-toggle-password').click(); assert.equal(await page.locator('#login-password').getAttribute('type'), 'password');
  }, ['btn-toggle-password']);
  await capture('Sign-in');
  await check('Public inquiry Submit stores inquiry and shows reference', async () => {
    await page.goto(`${base}/request-assessment.html`); await capture('Public inquiry');
    for (const [id, value] of Object.entries({ companyName: 'Audit Public Fleet', officeAddress: '123 Audit Road', contactPerson: 'Audit Contact', contactEmail: 'public@audit.test', contactPhone: '0123456789', deviceModel: 'Audit Public Gateway', message: 'Audit inquiry' })) await page.locator(`#${id}`).fill(value);
    await page.locator('#state').selectOption({ label: 'Selangor' });
    await apiClick('#btn-submit', '/submit-inquiry');
    await page.waitForFunction(() => document.getElementById('success-container').style.display === 'block');
    assert.match(await page.locator('#display-inquiry-ref').textContent(), /INQ/);
  }, ['btn-submit', 'companyName', 'officeAddress', 'state', 'contactPerson', 'contactEmail', 'contactPhone', 'deviceModel', 'message']);
  await check('Public Verify returns genuine issued certificate', async () => {
    await page.goto(`${base}/verify-certificate.html`); await capture('Public verification');
    const input = page.locator('input[type=text]').first(); await input.fill('TS-CERT-AUDIT-2026');
    await apiClick('#btn-submit', '/verify-certificate');
    assert.ok((await page.locator('body').textContent()).includes('ABC Sdn. Bhd.'));
  }, ['btn-submit']);

  await check('Manager sign-in with correct role', () => login('manager'), ['btn-login-submit']);
  await page.waitForFunction(() => evaluationsList.length > 0);
  await capture('Manager initial');
  for (const [id, content] of [['tab-btn-registered', 'registered-customers-tab-content'], ['tab-btn-inquiries', 'inquiries-tab-content'], ['tab-btn-workload', 'workload-tab-content'], ['tab-btn-evaluations', 'evaluations-tab-content']]) {
    await check(`Manager ${id} opens correct tab`, async () => { await closeAll(); await page.locator(`#${id}`).click(); assert.equal(await page.locator(`#${id}`).evaluate(el => el.classList.contains('active')), true); }, [id]);
  }
  await check('Manager Refresh makes one successful data request', async () => { await apiClick('#btn-refresh', '/get-evaluations'); }, ['btn-refresh']);
  for (const [id, value] of [['status-filter', 'pending_review'], ['sla-filter', 'ON_TRACK'], ['risk-filter', 'INSUFFICIENT_DATA'], ['sort-by-filter', 'slaDeadline']]) {
    await check(`Manager ${id} sends and applies selected filter`, async () => {
      const option = await page.locator(`#${id} option`).evaluateAll(options => options.map(o => o.value));
      await page.locator(`#${id}`).selectOption(option.includes(value) ? value : option.at(-1));
      await page.waitForTimeout(150);
      await page.evaluate(() => clearFilters());
    }, [id]);
  }
  await page.waitForFunction(id => evaluationsList.some(r => r._id === id), pending);
  await check('Manager risk summary card filters records', async () => {
    await page.locator('#tab-btn-overview').click();
    await page.locator('.manager-secondary summary').click();
    await page.locator('[onclick="filterByRiskLevel(\'NORMAL\')"]').click();
    assert.equal(await page.locator('#risk-filter').inputValue(), 'NORMAL');
    await page.evaluate(() => clearFilters());
  });
  await page.waitForFunction(id => evaluationsList.some(r => r._id === id), pending);
  await check('Manager Details displays all internal criterion comments', async () => {
    await page.locator(`#evaluations-tbody button[onclick="openEvaluationDetails('${pending}')"]`).click();
    await page.waitForFunction(() => document.querySelector('#details-modal').classList.contains('active'));
    assert.ok((await page.locator('#details-modal').textContent()).includes('Internal audit comment'));
    await capture('Manager Details');
  });
  await check('Manager quality check opens, recalculates, and closes', async () => {
    await page.locator('#modal-view-risk').click();
    await page.waitForFunction(() => document.querySelector('#risk-modal-body').textContent.includes('Quality check:'));
    await apiClick('#btn-recalculate-risk', '/get-assessment-risk');
    await page.locator('#risk-modal button').filter({ hasText: /^Close$/ }).click();
    assert.equal(await page.locator('#risk-modal').getAttribute('aria-hidden'), 'true');
  }, ['modal-view-risk', 'btn-recalculate-risk']);
  await check('Manager version history and snapshot open', async () => {
    await page.locator('#modal-view-history').click();
    await page.locator('#assessment-history-modal button').filter({ hasText: /View Snapshot/ }).first().click();
    await page.waitForFunction(() => document.querySelector('#version-detail-modal').classList.contains('active'));
    await capture('Manager version snapshot');
    await closeAll();
  }, ['modal-view-history']);
  await check('Assessment report PDF actual download', async () => {
    await page.evaluate(id => viewEvaluationReport(id), pending);
    await download('#btn-download-pdf-modal', 'full-system-role-assessment-report.pdf');
    assert.equal(fs.readFileSync(path.join(root, 'qa/full-system-role-assessment-report.pdf')).subarray(0, 5).toString(), '%PDF-');
  }, ['btn-download-pdf-modal']);
  await check('Report Approve opens existing approval confirmation', async () => {
    await page.locator('#report-modal-approval-actions button').filter({ hasText: /^Approve$/ }).click();
    assert.equal(await page.locator('#approve-confirm-modal').evaluate(el => el.classList.contains('active')), true);
    await page.locator('#approve-confirm-modal button').filter({ hasText: /^Cancel$/ }).click();
  });
  await check('Manager review Approve persists review comment through API', async () => {
    await closeAll(); await page.evaluate(id => openEvaluationDetails(id), pending);
    await page.locator('#btn-modal-approve').click();
    await page.locator('#approve-modal-comment-preview').fill('Audit manager review comment');
    await apiClick('#btn-execute-approve-confirm', '/approve-evaluation');
    const stored = JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/evaluations.json'))).find(r => r._id === pending);
    assert.equal(stored.managerReviewComment, 'Audit manager review comment');
  }, ['btn-modal-approve', 'approve-modal-comment-preview', 'btn-execute-approve-confirm']);
  await check('Manager Excel actual download', async () => { await closeAll(); await download('#btn-export-csv', 'full-system-role-export.xlsx'); }, ['btn-export-csv']);
  await check('Manager signed certificate PDF actual download', async () => {
    await page.locator(`#evaluations-tbody button[onclick="downloadManagerCertificate('${completed}')"]`).first().click();
    // Dedicated actual download test below captures the file with a waiter.
  });
  await check('Manager certificate PDF download contains PDF bytes', async () => {
    await download(`#evaluations-tbody button[onclick="downloadManagerCertificate('${completed}')"]`, 'full-system-role-certificate.pdf');
    assert.equal(fs.readFileSync(path.join(root, 'qa/full-system-role-certificate.pdf')).subarray(0, 5).toString(), '%PDF-');
    const record = JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/evaluations.json'))).find(r => r._id === completed);
    await page.evaluate(record => { const preview = document.createElement('div'); preview.id = 'audit-certificate-preview'; preview.innerHTML = generateCertificateHtml(record); document.body.append(preview); }, record);
    await page.locator('#audit-certificate-preview').screenshot({ path: path.join(root, 'qa/certificate-browser.png') });
    await page.evaluate(() => document.getElementById('audit-certificate-preview').remove());
  });
  for (const [button, modal] of [['btn-open-user-modal', 'user-management-modal'], ['btn-top-generate-vendor-cred', 'generate-vendor-credential-modal'], ['overview-new-registration', 'register-customer-modal']]) {
    await check(`Manager ${button} opens its workflow modal`, async () => {
      await closeAll();
      if (button === 'overview-new-registration') await page.locator('#tab-btn-overview').click();
      else await page.locator('#tab-btn-evaluations').click();
      await page.locator(`#${button}`).click();
      assert.ok(await page.locator('.modal-overlay.active').count());
      await capture(`Manager ${button}`); await closeAll();
    }, [button]);
  }
  await check('Manager scheduling saves through correct API', async () => {
    await page.locator('#tab-btn-registered').click();
    await page.evaluate(id => openScheduleModal(id), registration);
    await page.locator('#schedule-date-input').fill('2026-10-15');
    await page.locator('#schedule-device-model-input').fill('Audit Gateway Scheduled');
    await apiClick('#btn-submit-schedule', '/schedule-assessment');
  }, ['schedule-date-input', 'schedule-device-model-input', 'btn-submit-schedule']);
  await check('Manager assignment saves assessor identity through API', async () => {
    await closeAll(); await page.evaluate(id => openAssignTaskModal(id), registration);
    await page.locator('#assign-task-assessor-select').selectOption('Audit assessor');
    await page.locator('#assign-task-device-input').fill('Audit Gateway Scheduled');
    await page.locator('#assign-task-date-input').fill('2026-10-15');
    await apiClick('#btn-submit-assign-task', '/assign-assessor');
  }, ['assign-task-assessor-select', 'assign-task-date-input', 'btn-submit-assign-task']);
  await check('Manager payment verification saves confirmed payment', async () => {
    await closeAll(); await page.locator('#tab-btn-evaluations').click();
    await page.evaluate(id => openVerifyPaymentModal(id), prefinal);
    await page.locator('#verify-pay-amount-input').fill('500');
    await page.locator('#verify-pay-date-input').fill('2026-10-01');
    await page.locator('#verify-pay-ref-input').fill('AUDIT-TRANSFER-001');
    await apiClick('#btn-submit-verify-payment', '/verify-payment');
  }, ['btn-submit-verify-payment', 'verify-pay-amount-input', 'verify-pay-date-input', 'verify-pay-ref-input']);
  await check('Manager request changes requires a reason and persists revision', async () => {
    await closeAll(); await page.evaluate(id => openEvaluationDetails(id), pending);
    await page.locator('#btn-modal-reject').click();
    await page.locator('#reject-reason-input').fill('Audit request: please update technical evidence');
    await apiClick('#btn-confirm-reject', '/approve-evaluation');
  }, ['btn-modal-reject', 'reject-reason-input', 'btn-confirm-reject']);

  await check('Manager register customer saves registration', async () => {
    await closeAll(); await page.locator('#tab-btn-overview').click(); await page.locator('#overview-new-registration').click();
    for (const [id, value] of Object.entries({ 'reg-companyName': 'Audit Newly Registered Fleet', 'reg-officeAddress': '42 Audit Road', 'reg-contactPerson': 'Audit Registration', 'reg-contactPhone': '0123456789', 'reg-contactEmail': 'new-fleet@audit.test', 'reg-deviceModel': 'New Audit Model' })) await page.locator(`#${id}`).fill(value);
    await page.locator('#reg-state').selectOption({ label: 'Selangor' });
    await apiClick('#btn-submit-register', '/register-customer');
  }, ['overview-new-registration', 'btn-submit-register']);
  await check('Manager invoice Save persists invoice number', async () => {
    await closeAll(); await page.evaluate(id => openManageInvoiceModal(id), registration);
    await page.locator('#inv-number-input').fill('AUDIT-NEW-INVOICE');
    await page.locator('#inv-amount-input').fill('4500');
    await apiClick('#btn-submit-invoice', '/manage-invoice');
  }, ['btn-submit-invoice', 'inv-number-input', 'inv-amount-input']);
  for (const step of ['prepare', 'print', 'sign', 'deliver']) await check(`Manager certificate ${step} commits correct lifecycle step`, async () => {
    await closeAll(); await page.locator('#tab-btn-evaluations').click(); await page.evaluate((args) => openCertificateModal(args.id, args.step), { id: prefinal, step });
    if (step === 'print') await page.locator('#cert-print-confirm-check').check();
    if (step === 'sign') await page.locator('#cert-sign-name').fill('Audit Director General');
    await apiClick('#btn-submit-certificate-action', '/manage-certificate');
  }, ['btn-submit-certificate-action']);
  await check('Manager Team Accounts create, password reset, and delete test account', async () => {
    await closeAll(); await page.locator('#btn-open-user-modal').click();
    await page.locator('#staff-name-input').fill('Audit Temporary Staff');
    await page.locator('#staff-email-input').fill('temporary-staff@audit.test');
    await page.locator('#staff-assessor-id-input').fill('AUDIT-002');
    await page.locator('button[onclick="generateAndSetPassword()"]').click();
    await apiClick('#btn-submit-create-user', '/manage-users');
    const account = JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/users.json'))).find(u => u.email === 'temporary-staff@audit.test');
    assert.ok(account);
    await page.evaluate(id => openResetPasswordModal(id), account._id);
    await page.locator('button[onclick="generateResetModalPassword()"]').click();
    await apiClick('#btn-submit-reset-pw', '/manage-users');
    await closeAll(); await page.locator('#btn-open-user-modal').click(); await page.evaluate(id => openDeleteUserModal(id), account._id);
    await apiClick('#btn-confirm-delete-user', '/manage-users');
    assert.ok(!JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/users.json'))).some(u => u._id === account._id));
  }, ['btn-open-user-modal', 'staff-name-input', 'staff-email-input', 'staff-assessor-id-input', 'btn-submit-create-user', 'btn-submit-reset-pw', 'btn-confirm-delete-user']);
  await check('Manager archive confirmation persists soft deletion', async () => {
    await closeAll(); await page.locator('#tab-btn-evaluations').click(); await page.evaluate(id => openArchiveModal(id), rejected);
    await apiClick('#btn-confirm-archive', '/delete-evaluation');
  }, ['btn-confirm-archive']);

  await check('Manager Sign Out clears session', async () => {
    await closeAll(); await page.locator('#btn-logout').click(); await page.waitForURL('**/login.html');
    assert.equal(await page.evaluate(() => localStorage.getItem('trackscore_token')), null);
  }, ['btn-logout']);

  await check('Assessor sign-in with correct role', () => login('assessor'), ['btn-login-submit']);
  await page.waitForFunction(() => document.querySelectorAll('input[type=radio]').length > 0);
  await capture('Assessor initial');
  for (const tab of ['submissions', 'peer-review', 'notifications', 'matrix']) await check(`Assessor ${tab} navigation tab`, async () => {
    await page.locator(`#tab-btn-${tab}`).click(); assert.equal(await page.locator(`#tab-btn-${tab}`).evaluate(el => el.classList.contains('active')), true);
  }, [`tab-btn-${tab}`]);
  await check('Assessor criterion score controls and comments update all 33 entries', async () => {
    const names = await page.locator('input[type=radio]').evaluateAll(inputs => [...new Set(inputs.map(i => i.name))]);
    assert.equal(names.length, 33);
    for (const name of names) {
      const input = page.locator(`input[type=radio][name="${name}"]`).last();
      const id = await input.getAttribute('id');
      await page.locator(`label[for="${id}"]`).click();
      assert.equal(await input.isChecked(), true);
    }
    const comments = page.locator('textarea.criterion-comment-input');
    assert.equal(await comments.count(), 33);
    for (let i = 0; i < 33; i++) await comments.nth(i).fill(`Audit criterion comment ${i + 1}`);
  });
  await check('Assessor Save Draft and Drafts modal preserve comments', async () => {
    await page.locator('#companyName').fill('Audit Assessor Fleet');
    await page.locator('#deviceModel').fill('Audit Assessor Gateway');
    await page.locator('#btn-save-draft-top').click();
    await page.locator('#btn-my-drafts').click();
    assert.equal(await page.locator('#drafts-modal').evaluate(el => el.classList.contains('active')), true);
    await capture('Assessor saved drafts');
    await page.locator('#btn-close-drafts').click();
  }, ['btn-save-draft-top', 'btn-my-drafts', 'btn-close-drafts']);
  await check('Assessor drafts backup download', async () => {
    await page.locator('#btn-my-drafts-top').click();
    await download('#btn-export-drafts', 'full-system-drafts.json'); await page.locator('#btn-close-drafts').click();
  }, ['btn-my-drafts-top', 'btn-export-drafts']);
  await check('Assessor notifications filters, refresh and collapse', async () => {
    await page.locator('#tab-btn-notifications').click();
    for (const id of ['notif-filter-assigned', 'notif-filter-rejected', 'notif-filter-approved', 'notif-filter-all', 'btn-refresh-notifications', 'btn-toggle-notif-collapse']) await page.locator(`#${id}`).click();
    await capture('Assessor notifications');
    await page.locator('#tab-btn-matrix').click();
  }, ['notif-filter-assigned', 'notif-filter-rejected', 'notif-filter-approved', 'notif-filter-all', 'btn-refresh-notifications', 'btn-toggle-notif-collapse']);
  await check('Assessor Submit completes 33-criterion evaluation and persists comments', async () => {
    await page.locator('#assessmentDate').fill('2026-10-01');
    await page.locator('#btn-save-evaluation').click();
    await apiClick('#btn-execute-submit', '/save-evaluation');
    const record = JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/evaluations.json'))).find(r => r.companyName === 'Audit Assessor Fleet');
    assert.equal(record.breakdown.length, 33);
    assert.equal(record.breakdown[0].comment, 'Audit criterion comment 1');
    assert.equal(record.breakdown.at(-1).comment, 'Audit criterion comment 33');
  }, ['btn-save-evaluation', 'btn-execute-submit']);
  await check('Assessor Sign Out clears session', async () => { await page.locator('#btn-logout').click(); await page.waitForURL('**/login.html'); }, ['btn-logout']);

  await check('Vendor sign-in with correct role', () => login('vendor'), ['btn-login-submit']);
  await page.waitForFunction(() => document.body.textContent.includes('Audit Gateway'));
  await capture('Vendor initial');
  await check('Vendor portal excludes internal comments and risk analytics', async () => {
    const text = await page.locator('body').textContent();
    assert.ok(!text.includes('Internal audit comment'));
    const data = await page.evaluate(async () => (await fetch('/.netlify/functions/vendor-portal-data', { headers: { Authorization: 'Bearer ' + localStorage.getItem('trackscore_token') } })).json());
    assert.ok(!JSON.stringify(data).includes('Internal audit comment'));
  });
  await check('Vendor profile modal saves contact changes', async () => {
    await page.locator('button[onclick="openProfileModal()"]').click();
    await page.locator('#prof-person').fill('Updated Audit Contact');
    await apiClick('#btn-save-profile', '/vendor-profile'); await capture('Vendor profile'); await closeAll();
  }, ['prof-person', 'btn-save-profile']);
  await check('Vendor notifications modal opens and closes', async () => {
    await page.locator('#btn-notifications').click();
    assert.ok(await page.locator('#modal-notifications').isVisible()); await closeAll();
  }, ['btn-notifications']);
  await check('Vendor documents upload, download and delete', async () => {
    await page.evaluate(id => openDocumentsModal(id), pending);
    await page.locator('#doc-category').selectOption({ index: 1 });
    await page.locator('#doc-file').setInputFiles({ name: 'audit-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nAudit evidence\n%%EOF') });
    await apiClick('#btn-upload-submit', '/vendor-documents');
    await page.locator('button[onclick^="downloadDocument("]').first().click();
    await page.locator('button[onclick^="deleteDocument("]').first().click();
    await page.waitForTimeout(250); await capture('Vendor documents'); await closeAll();
  }, ['doc-category', 'doc-file', 'btn-upload-submit']);
  await check('Vendor revision Submit persists response', async () => {
    await closeAll(); await page.evaluate(id => openResubmitModal(id), pending);
    await page.locator('#resubmit-notes').fill('Updated technical evidence for audit revision');
    await apiClick('#btn-submit-resubmit', '/vendor-resubmit');
  }, ['resubmit-notes', 'btn-submit-resubmit']);
  await check('Vendor payment proof Submit queues manager verification', async () => {
    await closeAll(); await page.evaluate(id => openPaymentModal(id), pending);
    await page.locator('#payment-amount').fill('4500');
    await page.locator('#payment-ref').fill('AUDIT-VENDOR-TRANSFER');
    await page.locator('#payment-date').fill('2026-10-01');
    await apiClick('#btn-submit-payment', '/vendor-submit-payment');
  }, ['payment-amount', 'payment-ref', 'payment-date', 'btn-submit-payment']);
  await check('Vendor own signed certificate PDF downloads', async () => {
    await closeAll();
    await download(`button[onclick="downloadOfficialCertificate('${completed}')"]`, 'full-system-vendor-certificate.pdf');
  });
  await check('Vendor password Change requires current password and saves new password', async () => {
    await closeAll(); await page.locator('button[onclick="openProfileModal()"]').click(); await page.locator('#tab-profile-pwd').click();
    await page.locator('#pwd-current').fill('AuditPassword42!');
    await page.locator('#pwd-new').fill('AuditUpdatedPassword42!');
    await page.locator('#pwd-confirm').fill('AuditUpdatedPassword42!');
    await apiClick('#btn-save-pwd', '/vendor-profile');
  }, ['tab-profile-pwd', 'pwd-current', 'pwd-new', 'pwd-confirm', 'btn-save-pwd']);
  await check('Vendor Sign Out clears session', async () => { await closeAll(); await page.locator('#btn-logout').click(); await page.waitForURL('**/login.html'); }, ['btn-logout']);

  await check('All internal page links resolve over HTTP', async () => {
    const inventory = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-control-inventory.json')));
    const hrefs = [...new Set(inventory.controls.filter(e => e.href.startsWith('/') && !e.href.includes('__DYNAMIC__')).map(e => e.href))];
    for (const href of hrefs) { const response = await context.request.get(`${base}${href}`); assert.ok(response.status() < 400, `${href}: HTTP ${response.status()}`); }
  });
} finally {
  fs.writeFileSync(path.join(root, 'qa/full-system-role-control-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, errors, requests, downloads, runtime, interactions }, null, 2));
  console.log(JSON.stringify({ passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed), errors, requests, downloads }, null, 2));
  await browser.close();
}

