import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-audit-state.json')));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-control-inventory.json')));
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const base = `http://127.0.0.1:${state.port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [];
for (const [filename, role] of [['dashboard.html', 'manager'], ['index.html', 'assessor'], ['vendor-portal.html', 'vendor']]) {
  const account = await (await fetch(`${base}/.netlify/functions/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@audit.test`, password: role === 'vendor' ? 'AuditUpdatedPassword42!' : 'AuditPassword42!' }) })).json();
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(account => { localStorage.setItem('trackscore_token', account.token); localStorage.setItem('trackscore_user_role', account.role); localStorage.setItem('trackscore_user', JSON.stringify(account.user)); }, account);
  const page = await context.newPage(); page.setDefaultTimeout(3500); page.on('dialog', d => d.dismiss()); page.on('popup', p => p.close().catch(() => {}));
  page.on('pageerror', error => errors.push({ filename, message: error.message }));
  await page.goto(`${base}/${filename}`, { waitUntil: 'networkidle' });
  if (filename === 'index.html') await page.evaluate(() => { document.getElementById('companyName').value = 'Dynamic probe draft'; saveDraftToStorage(true); openDraftsModal(); });
  for (const control of inventory.controls.filter(c => c.page === filename && c.kind !== 'static' && ['button', 'a'].includes(c.tag))) {
    try {
      const handle = await page.evaluateHandle(control => {
        function matches(source, value) { return source && new RegExp('^' + source.split('__DYNAMIC__').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(value || ''); }
        return Array.from(document.querySelectorAll(control.tag)).find(el => control.id ? matches(control.id, el.id) : control.inline ? matches(control.inline, el.getAttribute('onclick')) : control.label === '__DYNAMIC__' ? !!el.getAttribute('data-load-draft') : matches(control.label, (el.textContent || '').replace(/\s+/g, ' ').trim()));
      }, control);
      const element = handle.asElement();
      if (!element) { results.push({ key: control.key, status: 'conditional template not rendered in fixture state' }); continue; }
      const disabled = await element.evaluate(el => !!el.disabled);
      if (disabled) { results.push({ key: control.key, status: 'disabled by workflow' }); continue; }
      await element.evaluate(el => {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; });
        let parent = el; while (parent && parent !== document.body) { if (getComputedStyle(parent).display === 'none') parent.style.display = parent.matches('.modal-overlay,.modal-backdrop') ? 'flex' : 'block'; if (parent.matches('.modal-overlay')) parent.classList.add('active'); parent = parent.parentElement; }
        if (el.form && el.type === 'submit') el.form.reset();
      });
      const before = errors.length; await element.click({ force: true }); await page.waitForTimeout(200);
      results.push({ key: control.key, status: errors.length === before ? 'native dynamic click probe passed' : 'exception' });
    } catch (error) { results.push({ key: control.key, status: 'probe failed', error: error.message.slice(0, 400) }); }
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(root, 'qa/button-dynamic-probes.json'), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ counts: results.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}), errors, failures: results.filter(r => ['probe failed', 'exception'].includes(r.status)) }, null, 2));
