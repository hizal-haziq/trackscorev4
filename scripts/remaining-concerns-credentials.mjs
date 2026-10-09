import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/full-system-state.json')));
const base = `http://127.0.0.1:${state.port}`;
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [], failed = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', response => { if (response.status() >= 400) failed.push({ status: response.status(), path: new URL(response.url()).pathname }); });
const result = {};
try {
  await page.goto(`${base}/login.html?role=manager`);
  await page.locator('#login-email').fill('workflow-manager@audit.test');
  await page.locator('#login-password').fill('WorkflowValidation42!');
  await page.locator('#btn-login-submit').click();
  await page.waitForURL('**/dashboard.html');
  await page.locator('#tab-btn-evaluations').click();
  await page.locator('#btn-top-generate-vendor-cred').click();
  await page.locator('#gen-cred-company-name').fill('Credential Control QA');
  await page.locator('#gen-cred-contact-email').fill('credential-control@audit.test');
  const responseWait = page.waitForResponse(response => response.url().includes('/vendor-invite') && response.request().method() === 'POST');
  await page.locator('#btn-submit-gen-cred').click();
  const response = await responseWait;
  assert.ok(response.ok());
  await page.locator('#vendor-invite-modal').waitFor({ state: 'visible' });
  const email = (await page.locator('#vendor-invite-login-email').textContent()).trim();
  const password = (await page.locator('#vendor-invite-password').textContent()).trim();
  assert.ok(email && password);
  const files = {};
  for (const ext of ['txt', 'tst']) {
    const downloadWait = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download as .${ext}` }).click();
    const download = await downloadWait;
    const tempFile = await download.path();
    const content = fs.readFileSync(tempFile, 'utf8');
    files[ext] = { filename: download.suggestedFilename(), hasEmail: content.includes(email), hasPassword: content.includes(password) };
    assert.ok(files[ext].hasEmail && files[ext].hasPassword);
    fs.unlinkSync(tempFile);
  }
  await page.getByRole('button', { name: 'Copy All to Clipboard' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  result.vendor = { txt: files.txt, tst: files.tst, clipboardHasEmail: clipboard.includes(email), clipboardHasPassword: clipboard.includes(password) };
  assert.ok(result.vendor.clipboardHasEmail && result.vendor.clipboardHasPassword);
  await page.locator('#vendor-invite-modal').getByRole('button', { name: 'Close', exact: true }).click();

  await page.locator('#btn-open-user-modal').click();
  await page.locator('#staff-name-input').fill('Credential Handoff QA');
  await page.locator('#staff-email-input').fill(`staff-share-${Date.now()}@audit.test`);
  await page.locator('#staff-assessor-id-input').fill('QAH 1200');
  await page.locator('#staff-phone-input').fill('60123456789');
  await page.locator('#staff-password-input').fill('IsolatedQaPass42!');
  const createWait = page.waitForResponse(response => response.url().includes('/manage-users') && response.request().method() === 'POST');
  await page.locator('#btn-submit-create-user').click();
  assert.ok((await createWait).ok());
  await page.locator('#new-user-credentials-banner').waitFor({ state: 'visible' });
  await page.locator('button[onclick="copyFullCredentialsMessage()"]').click();
  const staffClipboard = await page.evaluate(() => navigator.clipboard.readText());
  const staffEmail = await page.locator('#banner-staff-email').textContent();
  const staffPassword = await page.locator('#new-user-temp-pw').inputValue();
  result.staffClipboard = { hasEmail: staffClipboard.includes(staffEmail), hasPassword: staffClipboard.includes(staffPassword) };
  assert.ok(result.staffClipboard.hasEmail && result.staffClipboard.hasPassword);

  const popupWait = page.waitForEvent('popup');
  await page.locator('#btn-share-whatsapp').click();
  const popup = await popupWait;
  const wa = new URL(popup.url());
  result.whatsapp = { host: wa.host, route: wa.pathname, hasPrefilledText: Boolean(wa.searchParams.get('text')), phoneMatches: wa.searchParams.get('phone') === '60123456789' };
  assert.match(wa.host, /whatsapp\.com$/);
  assert.ok(result.whatsapp.hasPrefilledText && result.whatsapp.phoneMatches);
  await popup.close();
  result.errors = errors;
  result.failedResponses = failed;
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
