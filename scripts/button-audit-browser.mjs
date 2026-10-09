import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/button-audit-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [], failedRequests = [];
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
page.on('response', res => { if (res.status() >= 400) failedRequests.push({ url: res.url(), status: res.status() }); });
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err.message.slice(0, 1000) }); }
}
async function login(role) {
  await page.goto(`${base}/login.html?role=${role}`);
  await page.locator('#login-email').fill(`${role}@audit.test`);
  await page.locator('#login-password').fill('AuditPassword42!');
  await page.locator('#btn-login-submit').click();
  await page.waitForURL(`**/${role === 'manager' ? 'dashboard' : role === 'assessor' ? 'index' : 'vendor-portal'}.html`);
}
try {
  await check('Manager login via real sign-in form', () => login('manager'));
  await page.waitForFunction(() => document.querySelectorAll('#evaluations-tbody tr').length > 0).catch(() => {});
  await check('Manager risk card invokes its handler', async () => {
    await page.locator('[onclick="filterByRiskLevel(\'NORMAL\')"]').click();
    assert.equal(await page.locator('#risk-filter').inputValue(), 'NORMAL');
  });
  await check('Manager risk details opens and loads API result', async () => {
    await page.evaluate(() => openRiskDetailsModal('00000000000000000000000a'));
    await page.waitForFunction(() => document.querySelector('#risk-modal').classList.contains('active') && !document.querySelector('#risk-modal-body').textContent.includes('Loading'));
  });
  await check('Report Approve control references a callable handler', async () => {
    await page.evaluate(() => { closeRiskModal(); clearFilters(); });
    await page.waitForFunction(() => evaluationsList.some(r => r._id === '00000000000000000000000a'));
    await page.evaluate(() => viewEvaluationReport('00000000000000000000000a'));
    await page.locator('#report-modal.active #report-modal-approval-actions button').filter({ hasText: /^Approve$/ }).click();
    assert.equal(await page.locator('#approve-confirm-modal').evaluate(el => el.classList.contains('active')), true);
  });
} finally {
  fs.writeFileSync(path.join(root, 'qa/button-browser-reproduction.json'), JSON.stringify({ results, errors, failedRequests }, null, 2));
  console.log(JSON.stringify({ results, errors, failedRequests }, null, 2));
  await browser.close();
}
