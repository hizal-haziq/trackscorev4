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
const context = await browser.newContext({ acceptDownloads: true });
const login = await (await fetch(`${base}/.netlify/functions/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager@audit.test', password: 'AuditPassword42!' }) })).json();
await context.addInitScript(account => { localStorage.setItem('trackscore_token', account.token); localStorage.setItem('trackscore_user_role', account.role); localStorage.setItem('trackscore_user', JSON.stringify(account.user)); }, login);
const page = await context.newPage();
const results = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const dataFile = path.join(state.sandbox, '.data/evaluations.json');
const original = fs.readFileSync(dataFile);
const id = '00000000000000000000000c';
try {
  for (const [label, width, company] of [
    ['mobile', 375, 'ABC Sdn. Bhd.'], ['laptop', 1280, 'ABC Sdn. Bhd.'],
    ['desktop', 1920, 'ABC Sdn. Bhd.'], ['long-company', 1440, 'International Advanced Telematics Transportation and Fleet Safety Assessment Solutions Research Development Services Malaysia Sdn. Bhd.']
  ]) {
    const records = JSON.parse(original); records.find(r => r._id === id).companyName = company;
    fs.writeFileSync(dataFile, JSON.stringify(records, null, 2));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/dashboard.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => loadHtml2Pdf());
    await page.evaluate(() => {
      window.__certificateMeasurements = [];
      const originalSave = html2pdf.Worker.prototype.save;
      html2pdf.Worker.prototype.save = function (...args) {
        return originalSave.apply(this, args).then(function () {
          window.__certificateMeasurements.push({ canvasWidth: this.prop.canvas.width, canvasHeight: this.prop.canvas.height, pages: this.prop.pdf.internal.getNumberOfPages() });
        });
      };
    });
    const pendingDownload = page.waitForEvent('download');
    await page.locator(`#evaluations-tbody button[onclick="downloadManagerCertificate('${id}')"]`).first().click();
    const file = await pendingDownload;
    await file.saveAs(path.join(root, `qa/certificate-audit-${label}.pdf`));
    await page.waitForFunction(() => window.__certificateMeasurements.length > 0);
    const measurements = await page.evaluate(() => window.__certificateMeasurements[0]);
    assert.equal(measurements.canvasWidth, 1588); assert.equal(measurements.canvasHeight, 2240); assert.equal(measurements.pages, 1);
    results.push({ label, viewportWidth: width, company, ...measurements });
    console.log('PASS', label, JSON.stringify(measurements));
  }
} finally {
  fs.writeFileSync(dataFile, original);
  fs.writeFileSync(path.join(root, 'qa/certificate-layout-results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
