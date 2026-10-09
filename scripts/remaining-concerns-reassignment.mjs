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
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], failed = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', response => { if (response.status() >= 400) failed.push({ status: response.status(), path: new URL(response.url()).pathname }); });
async function api(endpoint, token, data) {
  return context.request.post(`${base}/.netlify/functions/${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, data });
}
try {
  await page.goto(`${base}/login.html?role=manager`);
  await page.locator('#login-email').fill('workflow-manager@audit.test');
  await page.locator('#login-password').fill('WorkflowValidation42!');
  await page.locator('#btn-login-submit').click();
  await page.waitForURL('**/dashboard.html');
  const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
  const assessorNames = [`Reassignment QA One ${Date.now()}`, `Reassignment QA Two ${Date.now()}`];
  for (const [i, name] of assessorNames.entries()) {
    const response = await api('manage-users', token, { name, email: `reassign-${i}-${Date.now()}@audit.test`, password: 'ReassignQaPass42!', role: 'assessor', assessorId: `RQA ${4411 + i}` });
    assert.ok(response.ok(), await response.text());
  }
  const registrationResponse = await api('register-customer', token, { companyName: `Reassignment QA ${Date.now()}`, deviceModel: 'Reassignment Gateway', requestedPackage: 'package_1', contactPerson: 'QA Contact', contactEmail: 'reassignment-qa@audit.test', contactPhone: '0123456789' });
  const registration = await registrationResponse.json();
  assert.ok(registrationResponse.ok() && registration.id);
  const workloadResponse = await context.request.get(`${base}/.netlify/functions/get-assessor-workload`, { headers: { Authorization: `Bearer ${token}` } });
  const workload = await workloadResponse.json();
  assert.ok(workloadResponse.ok() && workload.success && workload.assessors.some(row => row.name === assessorNames[0]) && workload.assessors.some(row => row.name === assessorNames[1]), `Assessor directory returned ${workload.assessors?.length || 0} rows`);
  await page.reload();
  await page.waitForURL('**/dashboard.html');
  await page.locator('#tab-btn-registered').click();
  for (const name of assessorNames) {
    await page.evaluate(id => openAssignTaskModal(id), registration.id);
    const options = await page.locator('#assign-task-assessor-select option').evaluateAll(items => items.map(item => ({ value: item.value, label: item.textContent })));
    if (!options.some(option => option.value === name)) throw new Error(`Assessor dropdown options: ${JSON.stringify(options)}`);
    await page.locator('#assign-task-assessor-select').selectOption({ value: name });
    await page.locator('#assign-task-device-input').fill('Reassignment Gateway');
    await page.locator('#assign-task-date-input').fill('2026-10-15');
    const responseWait = page.waitForResponse(response => response.url().includes('/assign-assessor') && response.request().method() === 'POST');
    await page.locator('#btn-submit-assign-task').click();
    const response = await responseWait;
    assert.ok(response.ok(), await response.text());
    await page.waitForFunction(() => !document.querySelector('.modal-overlay.active'));
  }
  const row = JSON.parse(fs.readFileSync(path.join(state.sandbox, '.data/evaluations.json'))).find(record => record._id === registration.id);
  assert.equal(row.assignedAssessor, assessorNames[1]);
  assert.ok(row.assignedAssessorId && row.assignedAssessorEmail && row.assignedAt && row.assignedBy);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(JSON.stringify({ reassignments: assessorNames.length, currentAssignee: assessorNames[1], assignmentIdentityPersisted: true, assignedAtPersisted: true, errors, failedResponses: failed }, null, 2));
} finally { await browser.close(); }
