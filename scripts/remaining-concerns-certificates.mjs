import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'qa/full-system-state.json')));
const store = path.join(state.sandbox, '.data');
const read = name => JSON.parse(fs.readFileSync(path.join(store, `${name}.json`), 'utf8'));
const write = (name, rows) => fs.writeFileSync(path.join(store, `${name}.json`), JSON.stringify(rows, null, 2));
const vendorId = 'eeeeeeeeeeeeeeeeeeeeeeee';
const ids = ['eeeeeeeeeeeeeeeeeee001', 'eeeeeeeeeeeeeeeeeee002'];
const password = 'PdfAuditPass42!';
const vendors = read('vendors').filter(row => row._id !== vendorId);
vendors.push({ _id: vendorId, companyName: 'PDF Regression QA', contactEmail: 'pdf-regression@audit.test', passwordHash: bcrypt.hashSync(password, 10), contactName: 'PDF QA', phone: '0123456789', linkedRegistrationIds: ids, isActive: true, mustChangePassword: false });
write('vendors', vendors);
const template = read('evaluations').find(row => row.status === 'completed');
assert.ok(template?.certificate?.signedBy && template.certificate.signedDate);
const companies = ['ABC Sdn. Bhd.', 'Very Long Commercial Vehicle Telematics Technology Sdn. Bhd.'];
const docs = companies.map((companyName, index) => ({ ...template, _id: ids[index], companyName, contactEmail: 'pdf-regression@audit.test', contactPerson: 'PDF QA', vendorId, linkedRegistrationId: ids[index], registrationReferenceId: ids[index], certificate: { ...template.certificate, certificateNumber: `TS-QA-PDF-${index + 1}`, signedBy: 'TrackScore QA Signatory', signedDate: '2026-10-01', preparedDate: '2026-09-29', printedDate: '2026-09-30', sentToCustomerDate: '2026-10-01' } }));
write('evaluations', [...read('evaluations').filter(row => !ids.includes(row._id)), ...docs]);

const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const errors = [], failed = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', response => { if (response.status() >= 400) failed.push({ status: response.status(), path: new URL(response.url()).pathname }); });
const evidence = [];
try {
  await page.goto(`http://127.0.0.1:${state.port}/login.html?role=vendor`);
  await page.locator('#login-email').fill('pdf-regression@audit.test');
  await page.locator('#login-password').fill(password);
  await page.locator('#btn-login-submit').click();
  await page.waitForURL('**/vendor-portal.html');
  await page.waitForFunction(ids => ids.every(id => document.querySelector(`button[onclick="downloadOfficialCertificate('${id}')"]`)), ids);
  for (let index = 0; index < companies.length; index++) {
    const company = companies[index];
    const target = page.locator(`button[onclick="downloadOfficialCertificate('${ids[index]}')"]`);
    const downloadWait = page.waitForEvent('download');
    await target.click();
    const download = await downloadWait;
    const temp = await download.path();
    const bytes = fs.readFileSync(temp);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const output = path.join(root, 'qa', `remaining-concerns-certificate-${evidence.length + 1}.pdf`);
    fs.copyFileSync(temp, output);
    fs.unlinkSync(temp);
    evidence.push({ company, bytes: bytes.length, filename: download.suggestedFilename(), path: path.basename(output) });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(JSON.stringify({ certificates: evidence, errors, failedResponses: failed }, null, 2));
} finally { await browser.close(); }
