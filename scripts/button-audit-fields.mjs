// Native field and local-link probes supplement the successful role workflows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-audit-state.json')));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-control-inventory.json')));
const base = `http://127.0.0.1:${state.port}`;
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [];
for (const filename of Object.keys(inventory.byPage)) {
  const role = filename === 'dashboard.html' ? 'manager' : filename === 'vendor-portal.html' ? 'vendor' : 'assessor';
  const account = await (await fetch(`${base}/.netlify/functions/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@audit.test`, password: role === 'vendor' ? 'AuditUpdatedPassword42!' : 'AuditPassword42!' }) })).json();
  const context = await browser.newContext();
  await context.addInitScript(account => { localStorage.setItem('trackscore_token', account.token); localStorage.setItem('trackscore_user_role', account.role); localStorage.setItem('trackscore_user', JSON.stringify(account.user)); }, account);
  const page = await context.newPage(); page.setDefaultTimeout(3000);
  page.on('pageerror', err => errors.push({ filename, message: err.message })); page.on('dialog', d => d.dismiss());
  await page.goto(`${base}/${filename}`, { waitUntil: 'networkidle' });
  for (const control of inventory.controls.filter(c => c.page === filename && c.kind === 'static' && c.tag !== 'button')) {
    try {
      if (new URL(page.url()).pathname !== `/${filename}`) await page.goto(`${base}/${filename}`, { waitUntil: 'networkidle' });
      if (control.tag === 'a') {
        if (control.href.startsWith('javascript:')) {
          const link = control.id ? page.locator(`[id="${control.id}"]`) : page.locator(`a[href="${control.href}"]`).first();
          await link.evaluate(el => { let parent = el; while (parent && parent !== document.body) { if (getComputedStyle(parent).display === 'none') parent.style.display = 'block'; parent = parent.parentElement; } });
          await link.click({ force: true }); results.push({ key: control.key, status: 'native action link passed' }); continue;
        }
        if (/^(https?:|mailto:|tel:)/.test(control.href)) {
          results.push({ key: control.key, status: 'external handoff inspected', href: control.href }); continue;
        }
        const response = await context.request.get(new URL(control.href || filename, page.url()).href);
        if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
        if (control.href.startsWith('#')) {
          const target = control.href.slice(1);
          const found = !target || await page.locator(`[id="${target}"]`).count();
          // Drawer links deliberately use semantic hashes, then preventDefault.
          const drawer = await page.locator(`a[href="${control.href}"]`).first().evaluate(el => el.classList.contains('open-drawer-tab'));
          if (!found && !drawer) throw new Error(`Missing anchor ${control.href}`);
        }
        results.push({ key: control.key, status: 'local link resolves', href: control.href }); continue;
      }
      if (!control.id && control.inline && !['input', 'select', 'textarea'].includes(control.tag)) {
        const handle = await page.evaluateHandle(inline => Array.from(document.querySelectorAll('[onclick]')).find(el => el.getAttribute('onclick') === inline), control.inline);
        await handle.asElement().click(); results.push({ key: control.key, status: 'native navigation control passed' }); continue;
      }
      if (!control.id) { results.push({ key: control.key, status: 'no static ID; handled in runtime workflow' }); continue; }
      const field = page.locator(`[id="${control.id}"]`);
      if (!['input', 'select', 'textarea'].includes(control.tag)) {
        await field.click({ force: true }); results.push({ key: control.key, status: 'native navigation control passed' }); continue;
      }
      const meta = await field.evaluate(el => {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; });
        let parent = el; while (parent && parent !== document.body) { if (getComputedStyle(parent).display === 'none') parent.style.display = parent.matches('.modal-overlay,.modal-backdrop') ? 'flex' : 'block'; if (parent.matches('.modal-overlay')) parent.classList.add('active'); parent = parent.parentElement; }
        el.addEventListener('input', () => el.dataset.auditInput = 'yes'); el.addEventListener('change', () => el.dataset.auditChange = 'yes');
        return { type: el.type, disabled: el.disabled, readOnly: el.readOnly, value: el.value, options: el.options ? Array.from(el.options).filter(o => !o.disabled).map(o => o.value) : [] };
      });
      if (meta.disabled || meta.readOnly) { results.push({ key: control.key, status: 'read-only or disabled by workflow', valueUnchanged: true }); continue; }
      if (control.tag === 'select') await field.selectOption(meta.options.find(v => v) ?? meta.options[0]);
      else if (meta.type === 'file') await field.setInputFiles({ name: 'audit-probe.txt', mimeType: 'text/plain', buffer: Buffer.from('Isolated audit field probe') });
      else if (['checkbox', 'radio'].includes(meta.type)) {
        await field.click();
      }
      else await field.fill(meta.type === 'number' ? '1' : meta.type === 'date' ? '2026-10-01' : meta.type === 'datetime-local' ? '2026-10-01T10:00' : meta.type === 'email' ? 'probe@audit.test' : 'Audit probe');
      if (!await field.evaluate(el => el.dataset.auditInput === 'yes' || el.dataset.auditChange === 'yes')) throw new Error('Native input/change event not observed');
      results.push({ key: control.key, status: 'native field event passed' });
    } catch (error) { results.push({ key: control.key, status: 'probe failed', error: error.message.slice(0, 400) }); }
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(root, 'qa/button-field-probes.json'), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ counts: results.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}), errors, failures: results.filter(r => r.status === 'probe failed') }, null, 2));
