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
const page = await browser.newPage();
const errors = [], failed = [], pages = ['/login.html', '/change-password.html', '/vendor-portal.html', '/verify-certificate.html'];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', response => { if (response.status() >= 400) failed.push({ status: response.status(), path: new URL(response.url()).pathname }); });
try {
  for (const pathname of pages) {
    await page.goto(base + pathname);
    const favicon = await page.locator('link[rel~="icon"]').getAttribute('href');
    assert.ok(favicon, `${pathname}: missing favicon link`);
    const response = await page.request.get(new URL(favicon, page.url()).href);
    assert.ok(response.ok(), `${pathname}: favicon HTTP ${response.status()}`);
  }
  const config = await page.request.get(`${base}/api/config.js`);
  const configBody = await config.text();
  assert.ok(config.ok());
  for (const secret of ['JWT_SECRET', 'MONGODB_URI', 'RESEND_API_KEY', 'PRIVATE_API_KEY', 'ADMIN_PASSWORD']) assert.ok(!configBody.includes(secret));

  process.env.JWT_SECRET = 'QA_SECRET_SENTINEL_DO_NOT_EXPOSE';
  process.env.MONGODB_URI = 'mongodb://DB_PASSWORD_SENTINEL@example.test';
  process.env.RESEND_API_KEY = 'EMAIL_SECRET_SENTINEL_DO_NOT_EXPOSE';
  process.env.APP_URL = 'https://public.example.test';
  const generatedExports = {};
  const generatedSource = fs.readFileSync(path.join(root, 'netlify/functions/config.js'), 'utf8');
  new Function('exports', 'process', generatedSource)(generatedExports, process);
  const { handler } = generatedExports;
  const generated = await handler({}, {});
  assert.equal(generated.statusCode, 200);
  assert.ok(generated.body.includes('https://public.example.test'));
  assert.ok(!generated.body.includes('SENTINEL') && !generated.body.includes('DB_PASSWORD'));
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(JSON.stringify({ faviconPages: pages.length, failedResponses: failed, consoleErrors: errors, configStatus: config.status(), configSafe: true, dynamicGeneratorOmitsSecretSentinels: true }, null, 2));
} finally { await browser.close(); }
