// Reproduction script for Role Isolation / RBAC Regression (P0)
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'trackscore-rbac-repro-'));
fs.cpSync(path.join(root, 'public'), path.join(sandbox, 'public'), { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(sandbox, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'build'), path.join(sandbox, 'build'), { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'));
fs.mkdirSync(path.join(sandbox, '.data'));

const secret = 'test-jwt-secret-at-least-32-chars-long-1234567890';
const password = 'Password123!';
const passwordHash = bcrypt.hashSync(password, 10);

// Authoritative test accounts
const managerUser = {
  _id: 'manager-test-id',
  role: 'manager',
  name: 'MANAGER_TEST',
  email: 'manager.test@phasea.test',
  passwordHash,
  mustChangePassword: false
};

const assessorUser = {
  _id: 'assessor-test-id',
  role: 'assessor',
  name: 'ASSESSOR_TEST',
  email: 'assessor.test@phasea.test',
  assessorId: 'PAA-TEST-001',
  passwordHash,
  mustChangePassword: false
};

const vendorUser = {
  _id: 'vendor-test-id',
  role: 'vendor',
  companyName: 'VENDOR_TEST',
  contactEmail: 'vendor.test@phasea.test',
  loginEmail: 'vendor.test@phasea.test',
  linkedRegistrationIds: ['eval-test-vendor-1'],
  passwordHash,
  isActive: true,
  mustChangePassword: false
};

const evalTestRecord = {
  _id: 'eval-test-vendor-1',
  companyName: 'VENDOR_TEST Logistics',
  deviceModel: 'TestGPS-100',
  status: 'rejected',
  rejectionReason: 'Need revision',
  recordType: 'evaluation',
  currentVersion: 1,
  assessorId: 'PAA-TEST-001',
  assessorName: 'ASSESSOR_TEST',
  assignedAssessorId: 'assessor-test-id',
  assignedAssessorName: 'ASSESSOR_TEST',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  documents: []
};

// Write store files
fs.writeFileSync(path.join(sandbox, '.data/users.json'), JSON.stringify([managerUser, assessorUser], null, 2));
fs.writeFileSync(path.join(sandbox, '.data/vendors.json'), JSON.stringify([vendorUser], null, 2));
fs.writeFileSync(path.join(sandbox, '.data/evaluations.json'), JSON.stringify([evalTestRecord], null, 2));
fs.writeFileSync(path.join(sandbox, '.data/assessment_versions.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(sandbox, '.data/inquiries.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(sandbox, '.data/assessment_risk.json'), JSON.stringify([], null, 2));

async function getFreePort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  return port;
}

const port = await getFreePort();
const env = {
  ...process.env,
  PORT: String(port),
  NODE_ENV: 'development',
  JWT_SECRET: secret,
  MONGODB_URI: '',
  AUTO_SEED_DEFAULT_USERS: 'false',
  CONTEXT: 'test'
};

const serverChild = spawn(
  process.execPath,
  ['build/server.cjs'],
  { cwd: sandbox, env, stdio: 'inherit' }
);

const base = `http://127.0.0.1:${port}`;
// Wait for server health
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${base}/api/health`);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`Server started at ${base}`);

const pwModule = process.env.TRACKSCORE_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.TRACKSCORE_PLAYWRIGHT_MODULE).href
  : 'playwright-core';
const { chromium } = await import(pwModule);
const browser = await chromium.launch({
  ...process.env.TRACKSCORE_BROWSER_EXECUTABLE ? { executablePath: process.env.TRACKSCORE_BROWSER_EXECUTABLE } : {}
});
const context = await browser.newContext();
const page = await context.newPage();

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

try {
  // 1. Authoritative login
  const loginRes = await fetch(`${base}/.netlify/functions/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'assessor.test@phasea.test', password })
  });
  const loginData = await loginRes.json();
  const assessorToken = loginData.token;
  const assessorClaims = jwt.verify(assessorToken, secret);
  record('Assessor Login Issues Signed Token', !!assessorToken, `Role in token: ${assessorClaims.role}`);

  const managerLoginRes = await fetch(`${base}/.netlify/functions/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager.test@phasea.test', password })
  });
  const managerData = await managerLoginRes.json();
  const managerToken = managerData.token;

  const vendorLoginRes = await fetch(`${base}/.netlify/functions/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'vendor.test@phasea.test', password })
  });
  const vendorData = await vendorLoginRes.json();
  const vendorToken = vendorData.token;

  // Helper to set session in browser
  async function setSession(token, role, user) {
    await page.goto(`${base}/login.html`);
    await page.evaluate(({ t, r, u }) => {
      localStorage.setItem('trackscore_token', t);
      localStorage.setItem('trackscore_user_role', r);
      localStorage.setItem('trackscore_user', JSON.stringify(u));
    }, { t: token, r: role, u: user });
  }

  // =========================================================================
  // REPRODUCTION TEST 1: Assessor manually opens /react/manager.html
  // =========================================================================
  await setSession(assessorToken, 'assessor', { role: 'assessor', name: 'ASSESSOR_TEST' });
  await page.goto(`${base}/react/manager.html`);
  await page.waitForTimeout(500);
  const currentUrl1 = page.url();
  const hasDeniedBanner = (await page.locator('text=Manager access required').count()) > 0 || currentUrl1.includes('/react/assessor.html');
  record(
    'Assessor opening /react/manager.html is denied access',
    hasDeniedBanner,
    `Access denied verified (heading present or redirected)`
  );

  // =========================================================================
  // REPRODUCTION TEST 2: Assessor manually opens /react/vendor.html
  // =========================================================================
  await setSession(assessorToken, 'assessor', { role: 'assessor', name: 'ASSESSOR_TEST' });
  await page.goto(`${base}/react/vendor.html`);
  await page.waitForTimeout(500);
  const currentUrl2 = page.url();
  const isRedirectedFromVendor = currentUrl2.includes('/react/assessor.html');
  record(
    'Assessor opening /react/vendor.html redirects to /react/assessor.html',
    isRedirectedFromVendor,
    `Current URL: ${currentUrl2}`
  );

  // =========================================================================
  // REPRODUCTION TEST 3: Assessor opens legacy /dashboard.html (with tampered role)
  // =========================================================================
  await setSession(assessorToken, 'manager', { role: 'manager', name: 'ASSESSOR_TEST' }); // Tampered localStorage role
  await page.goto(`${base}/dashboard.html`);
  await page.waitForTimeout(600);
  const dashUrl = page.url();
  const isBlockedFromDash = !dashUrl.includes('/dashboard.html');
  record(
    'Assessor with tampered localStorage role is blocked from /dashboard.html',
    isBlockedFromDash,
    `URL after navigating: ${dashUrl}`
  );

  // =========================================================================
  // REPRODUCTION TEST 4: Assessor opens legacy /vendor-portal.html (with tampered role)
  // =========================================================================
  await setSession(assessorToken, 'vendor', { role: 'vendor', name: 'ASSESSOR_TEST' }); // Tampered role
  await page.goto(`${base}/vendor-portal.html`);
  await page.waitForTimeout(600);
  const vpUrl = page.url();
  const isBlockedFromVp = !vpUrl.includes('/vendor-portal.html');
  record(
    'Assessor with tampered localStorage role is blocked from /vendor-portal.html',
    isBlockedFromVp,
    `URL after navigating: ${vpUrl}`
  );

  // =========================================================================
  // REPRODUCTION TEST 5: Manager opens legacy /index.html (Assessor page)
  // =========================================================================
  await setSession(managerToken, 'manager', { role: 'manager', name: 'MANAGER_TEST' });
  await page.goto(`${base}/index.html`);
  await page.waitForTimeout(600);
  const idxUrl = page.url();
  const isManagerBlockedFromAssessorPage = !idxUrl.includes('/index.html');
  record(
    'Manager is redirected away from legacy /index.html (Assessor portal)',
    isManagerBlockedFromAssessorPage,
    `URL after navigating: ${idxUrl}`
  );

  // =========================================================================
  // REPRODUCTION TEST 6: Manager APIs called with Assessor JWT
  // =========================================================================
  const mgrEndpoints = [
    { name: 'approve-evaluation', method: 'POST', url: `${base}/.netlify/functions/approve-evaluation`, body: { evaluationId: 'eval-test-vendor-1' } },
    { name: 'schedule-assessment', method: 'POST', url: `${base}/.netlify/functions/schedule-assessment`, body: { evaluationId: 'eval-test-vendor-1', scheduledDate: '2026-10-15' } },
    { name: 'assign-assessor', method: 'POST', url: `${base}/.netlify/functions/assign-assessor`, body: { evaluationId: 'eval-test-vendor-1', assessorId: 'PAA-TEST-001' } },
    { name: 'manage-certificate', method: 'POST', url: `${base}/.netlify/functions/manage-certificate`, body: { action: 'prepare', evaluationId: 'eval-test-vendor-1' } },
    { name: 'get-assessor-workload', method: 'GET', url: `${base}/.netlify/functions/get-assessor-workload` },
    { name: 'manage-users', method: 'GET', url: `${base}/.netlify/functions/manage-users` },
    { name: 'get-evaluations (overview)', method: 'GET', url: `${base}/.netlify/functions/get-evaluations?view=overview` },
    { name: 'get-assessment-risk (overview)', method: 'GET', url: `${base}/.netlify/functions/get-assessment-risk?overview=true` }
  ];

  for (const ep of mgrEndpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: {
        Authorization: `Bearer ${assessorToken}`,
        'Content-Type': 'application/json'
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    record(`Assessor calling Manager API ${ep.name} returns 403`, res.status === 403, `Got status ${res.status}`);
  }

  // =========================================================================
  // REPRODUCTION TEST 7: Vendor APIs called with Assessor JWT
  // =========================================================================
  const vendorEndpoints = [
    { name: 'vendor-portal-data', method: 'GET', url: `${base}/.netlify/functions/vendor-portal-data` },
    { name: 'vendor-resubmit', method: 'POST', url: `${base}/.netlify/functions/vendor-resubmit`, body: { evaluationId: 'eval-test-vendor-1', deviceModel: 'TestGPS-100', responseNotes: 'Notes' } },
    { name: 'vendor-profile', method: 'GET', url: `${base}/.netlify/functions/vendor-profile` },
    {
      name: 'vendor-documents (upload)',
      method: 'POST',
      url: `${base}/.netlify/functions/vendor-documents`,
      body: {
        action: 'upload',
        evaluationId: 'eval-test-vendor-1',
        name: 'test.pdf',
        category: 'device_spec',
        fileType: 'application/pdf',
        fileData: Buffer.from('%PDF-1.4 test').toString('base64')
      }
    }
  ];

  for (const ep of vendorEndpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: {
        Authorization: `Bearer ${assessorToken}`,
        'Content-Type': 'application/json'
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    record(`Assessor calling Vendor API ${ep.name} returns 403`, res.status === 403, `Got status ${res.status}`);
  }

  // =========================================================================
  // REPRODUCTION TEST 8: Manager calling Assessor API (save-evaluation)
  // =========================================================================
  const saveRes = await fetch(`${base}/.netlify/functions/save-evaluation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managerToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      companyName: 'Manager Submitted Co',
      deviceModel: 'Model X',
      assessorName: 'MANAGER_TEST',
      breakdown: []
    })
  });
  record(`Manager calling Assessor API save-evaluation returns 403`, saveRes.status === 403, `Got status ${saveRes.status}`);

} finally {
  await browser.close();
  serverChild.kill();
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log('\n--- REPRODUCTION SUMMARY ---');
const failed = results.filter((r) => !r.passed);
console.log(`Total tests: ${results.length}`);
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);
if (failed.length > 0) {
  console.log('Confirmed Vulnerabilities / Regressions:');
  for (const f of failed) {
    console.log(` - ${f.name} (${f.detail})`);
  }
}
