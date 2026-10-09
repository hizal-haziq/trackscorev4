// Supplement workflow tests with native click/error probes. Hidden modals are
// exposed synthetically: these checks do not claim full workflow success.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-audit-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-control-inventory.json')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [];
const accounts = {};
for (const role of ['manager', 'assessor', 'vendor']) {
  const response = await fetch(`${base}/.netlify/functions/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@audit.test`, password: role === 'vendor' ? 'AuditUpdatedPassword42!' : 'AuditPassword42!' }) });
  accounts[role] = await response.json();
}
for (const filename of ['landing.html', 'login.html', 'change-password.html', 'request-assessment.html', 'verify-certificate.html', 'index.html', 'dashboard.html', 'vendor-portal.html']) {
  const context = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const role = filename === 'dashboard.html' ? 'manager' : filename === 'vendor-portal.html' ? 'vendor' : 'assessor';
  const account = accounts[role];
  await context.addInitScript(account => {
    if (account?.token) { localStorage.setItem('trackscore_token', account.token); localStorage.setItem('trackscore_user_role', account.role); localStorage.setItem('trackscore_user', JSON.stringify(account.user)); }
    window.print = () => { window.__auditPrintInvoked = true; };
  }, account);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('dialog', d => d.dismiss());
  page.on('popup', p => p.close().catch(() => {}));
  page.on('pageerror', err => errors.push({ page: filename, message: err.message }));
  async function initialize() {
    await page.goto(`${base}/${filename}`, { waitUntil: 'networkidle' });
    if (filename === 'index.html') await page.evaluate(() => {
      showAssignmentModal({ evaluationId: '00000000000000000000000d', companyName: 'ABC Sdn. Bhd.', deviceModel: 'Audit Gateway', packageName: 'Package 1' });
      document.getElementById('assignment-alert-modal')?.classList.remove('active');
    });
    if (filename === 'dashboard.html') await page.evaluate(() => {
      activeEvaluation = evaluationsList.find(r => r._id === '00000000000000000000000a') || evaluationsList[0];
    });
  }
  try {
    await initialize();
    for (const control of inventory.controls.filter(c => c.page === filename && c.kind === 'static' && c.tag === 'button')) {
      if (new URL(page.url()).pathname !== `/${filename}`) await initialize();
      let locator;
      if (control.id) locator = page.locator(`[id="${control.id}"]`);
      if (!control.id) {
        const handle = await page.evaluateHandle(control => Array.from(document.querySelectorAll('button')).find(el => (el.getAttribute('onclick') || '') === control.inline && (el.textContent || '').replace(/\s+/g, ' ').trim() === control.label), control);
        const element = handle.asElement();
        if (!element) { results.push({ key: control.key, status: 'not present', label: control.label }); continue; }
        locator = element;
      }
      const before = errors.length;
      try {
        await locator.evaluate(el => {
          if (el.closest('#info-modal-backdrop')) document.getElementById('info-modal-backdrop').classList.add('open');
          document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
          document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; });
          let parent = el;
          while (parent && parent !== document.body) {
            if (getComputedStyle(parent).display === 'none') parent.style.display = parent.matches('.modal-overlay,.modal-backdrop') ? 'flex' : 'block';
            if (parent.matches('.modal-overlay')) parent.classList.add('active');
            parent = parent.parentElement;
          }
          document.body.style.overflow = '';
          // Probe validation rather than accidentally submit a partially filled
          // form left by a preceding control.
          if (el.form && (el.type === 'submit' || !el.getAttribute('type'))) el.form.reset();
        });
        if (filename === 'landing.html') await page.waitForTimeout(400);
        await locator.click({ force: true });
        await page.waitForTimeout(40);
        results.push({ key: control.key, status: errors.length === before ? 'native click probe passed' : 'exception', label: control.label, inline: control.inline });
      } catch (error) { results.push({ key: control.key, status: 'probe failed', label: control.label, error: error.message.slice(0, 500) }); }
    }
  } catch (error) { results.push({ page: filename, status: 'page setup failed', error: error.message }); }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(root, 'qa/button-click-sweep.json'), JSON.stringify({ generatedAt: new Date().toISOString(), method: 'Native click probes with synthetic visibility and empty-form validation, separate from complete workflow assertions', results, errors }, null, 2));
console.log(JSON.stringify({ counts: results.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}), errors, failures: results.filter(r => ['probe failed', 'page setup failed', 'exception'].includes(r.status)) }, null, 2));
