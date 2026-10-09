import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-audit-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [];
const dataFile = path.join(state.sandbox, '.data/evaluations.json');
const records = JSON.parse(fs.readFileSync(dataFile));
const peerId = '0000000000000000000000f0';
const peer = { ...records.find(r => r._id === '00000000000000000000000c'), _id: peerId, status: 'pending_review', companyName: 'Peer audit company', assessorId: 'AUD 0002', assessorName: 'Other assessor', assignedAssessorId: 'AUD 0002', assignedAssessor: 'Other assessor', assignedAssessorName: 'Other assessor', createdBy: 'other@audit.test', comments: [], certificate: null };
fs.writeFileSync(dataFile, JSON.stringify([...records.filter(r => r._id !== peerId), peer], null, 2));
async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); } console.log(results.at(-1)); }
async function session(role) {
  const account = await (await fetch(`${base}/.netlify/functions/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@audit.test`, password: 'AuditPassword42!' }) })).json();
  const context = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(account => { localStorage.setItem('trackscore_token', account.token); localStorage.setItem('trackscore_user_role', account.role); localStorage.setItem('trackscore_user', JSON.stringify(account.user)); }, account);
  const page = await context.newPage(); page.on('pageerror', err => errors.push(err.message)); page.on('dialog', d => d.accept());
  await page.goto(`${base}/${role === 'manager' ? 'dashboard' : 'index'}.html`, { waitUntil: 'networkidle' });
  return { context, page };
}
try {
  const manager = await session('manager'); const page = manager.page;
  await check('Manager peer comment submits through API and persists', async () => {
    await page.locator(`#evaluations-tbody button[onclick="openEvaluationDetails('${peerId}')"]`).first().click();
    await page.locator('#peer-comment-input').fill('Manager audit evidence verified.');
    const waiting = page.waitForResponse(r => r.url().includes('/add-comment') && r.request().method() === 'POST');
    await page.locator('#btn-submit-peer-comment').click(); const response = await waiting; assert.ok(response.ok());
    const stored = JSON.parse(fs.readFileSync(dataFile)).find(r => r._id === peerId);
    assert.ok(stored.comments.some(c => c.text === 'Manager audit evidence verified.'));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await check('Vendor credentials Generate, Copy and both download formats work', async () => {
    await page.locator('#btn-top-generate-vendor-cred').click();
    await page.locator('#gen-cred-company-name').fill('Credential audit company');
    await page.locator('#gen-cred-contact-email').fill('credential@audit.test');
    const waiting = page.waitForResponse(r => r.url().includes('/vendor-invite') && r.request().method() === 'POST');
    await page.locator('#btn-submit-gen-cred').click(); const response = await waiting; assert.ok(response.ok());
    await page.locator('button[onclick="copyLoginEmail()"]').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('#vendor-invite-login-email').textContent());
    await page.locator('button[onclick="copyLoginPassword()"]').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('#vendor-invite-password').textContent());
    for (const format of ['txt', 'tst']) {
      const waiting = page.waitForEvent('download'); await page.locator(`button[onclick="downloadVendorCredentials('${format}')"]`).click();
      const file = await waiting; const stream = await file.createReadStream(); let bytes = 0; for await (const chunk of stream) bytes += chunk.length;
      assert.ok(bytes > 30); // Do not store generated passwords in audit artifacts.
    }
  });
  await manager.context.close();
  const assessor = await session('assessor');
  await check('Assessor peer Review and Post Comment persist without scoring edits', async () => {
    await assessor.page.locator('#tab-btn-peer-review').click();
    await assessor.page.locator(`button[onclick="openPeerReviewModal('${peerId}')"]`).click();
    await assessor.page.locator('#peer-comment-input').fill('Peer audit observation verified.');
    const waiting = assessor.page.waitForResponse(r => r.url().includes('/add-comment') && r.request().method() === 'POST');
    await assessor.page.locator('#btn-submit-peer-comment').click(); const response = await waiting; assert.ok(response.ok(), await response.text());
    const stored = JSON.parse(fs.readFileSync(dataFile)).find(r => r._id === peerId);
    assert.ok(stored.comments.some(c => c.text === 'Peer audit observation verified.')); assert.deepEqual(stored.breakdown, peer.breakdown);
  });
  await assessor.context.close();
} finally {
  fs.writeFileSync(path.join(root, 'qa/button-extra-workflows.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
