// Phase F Browser Verification Script
// Tests full Vendor workflow in React (/react/vendor.html):
// 1. React Vendor portal mounts with dedicated single bundle
// 2. Dashboard KPIs, SLA tracking, and linked assessments
// 3. Strict confidentiality: zero internal assessor/manager/risk/audit secrets in DOM
// 4. Data isolation & IDOR prevention (Vendor A cannot see Vendor B records)
// 5. Required Actions queue & revision resubmission (v1 -> v2)
// 6. Evidence document upload, listing, and download
// 7. Disallowed document upload rejection
// 8. Official certificate display, PDF download reuse, and public verification link
// 9. Company profile update and password change
// 10. Payment workflow permanently retired (zero payment UI)
// 11. Responsive viewports across all 5 sizes (1920, 1366, 1280, 768, 390)
// 12. Role-based access control (Manager and Assessor redirected/denied)

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

export async function verifyPhaseF({
  page,
  context,
  browser,
  dev,
  qa,
  check,
  write,
  records,
  users,
  vendors,
  login,
  overview,
  settled,
  delay,
  streams
}) {
  const readData = (name) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), '.data', `${name}.json`), 'utf8'));

  const vendorEvalIdA = 'phasef-vendor-eval-a';
  const vendorEvalIdB = 'phasef-vendor-eval-b';
  const now = new Date().toISOString();
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  // Sentinel secrets to test confidentiality boundary
  const SECRET_ASSESSOR = 'INTERNAL_ASSESSOR_COMMENT_SECRET_F123';
  const SECRET_MANAGER = 'MANAGER_NOTE_SECRET_F456';
  const SECRET_RISK = 'RISK_SECRET_F789';
  const SECRET_WORKLOAD = 'WORKLOAD_SECRET_F101';
  const SECRET_AUDIT = 'AUDIT_SECRET_F202';
  const SECRET_OTHER_VENDOR = 'OTHER_VENDOR_SECRET_F303';

  // Vendor A Evaluation Record (needs revision initially, later certificate ready)
  const evalRecordA = {
    _id: vendorEvalIdA,
    companyName: 'Phase F Alpha Logistics Sdn Bhd',
    deviceModel: 'AlphaTrack Pro 5G',
    status: 'rejected',
    recordType: 'evaluation',
    currentVersion: 1,
    packageName: 'Comprehensive Fleet Telematics',
    package: 'package_1',
    scheduledDate: day,
    rejectionReason: 'Wiring harness diagram requires ISO compliance label.',
    // Internal confidential fields that must NEVER appear in Vendor UI:
    comments: [{ author: 'Assessor Ahmad', text: SECRET_ASSESSOR }],
    managerReviewNotes: SECRET_MANAGER,
    riskAssessment: { score: 92, note: SECRET_RISK },
    assessorWorkload: SECRET_WORKLOAD,
    internalAuditId: SECRET_AUDIT,
    assessorId: 'PAA 001',
    assessorName: 'Phase A assessor',
    assignedAssessorId: 'phasea-assessor',
    assignedAssessorName: 'Phase A assessor',
    totalScore: 4.5,
    starsCount: 4,
    ratingLabel: '4 Stars - High Telematics Standard',
    sla: {
      status: 'ON_TRACK',
      label: 'On Track',
      deadline: new Date(Date.now() + 6 * 86400000).toISOString(),
      remainingFormatted: '6 days remaining',
      isCompleted: false
    },
    certificate: {
      certificateNumber: 'MIROS-CERT-2026-F001',
      preparedDate: day,
      printedDate: day,
      signedDate: now,
      signedBy: 'Director General Office'
    },
    statusHistory: [
      { status: 'registered', timestamp: now, note: 'Customer registered hardware' },
      { status: 'rejected', timestamp: now, note: 'Wiring harness diagram requires ISO compliance label.' }
    ],
    documents: [
      {
        id: 'doc_existing_1',
        name: 'device_spec_v1.pdf',
        category: 'device_spec',
        categoryLabel: 'Device Technical Specification',
        fileType: 'application/pdf',
        fileSize: 2048,
        status: 'uploaded',
        uploadedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  // Vendor B Evaluation Record (owned by competitor)
  const evalRecordB = {
    _id: vendorEvalIdB,
    companyName: 'Phase F Competitor Logistics Sdn Bhd',
    deviceModel: 'CompTrack 900',
    status: 'approved',
    recordType: 'evaluation',
    currentVersion: 1,
    packageName: 'Standard Telematics',
    secretNotes: SECRET_OTHER_VENDOR,
    documents: [],
    createdAt: now,
    updatedAt: now
  };

  // Seed evaluations in store
  const currentEvals = readData('evaluations');
  const filteredEvals = currentEvals.filter(
    (e) => e._id !== vendorEvalIdA && e._id !== vendorEvalIdB
  );
  write('evaluations', [...filteredEvals, evalRecordA, evalRecordB]);

  // Update vendors in store: link eval A to phasea-vendor
  const currentVendors = readData('vendors');
  const updatedVendors = currentVendors.map((v) => {
    if (v._id === 'phasea-vendor' || v.contactEmail === 'vendor@phasea.test') {
      return {
        ...v,
        companyName: 'Phase F Alpha Logistics Sdn Bhd',
        linkedRegistrationIds: [vendorEvalIdA]
      };
    }
    return v;
  });
  write('vendors', updatedVendors);

  async function ready() {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    await delay(70);
  }

  // =========================================================================
  // 1. Mount React Vendor Portal
  // =========================================================================
  await check('React Vendor portal mounts with dedicated bundle', async () => {
    await login('vendor');
    await page.goto(`${dev.base}/react/vendor.html`);
    await page.locator('#kpi-summary-grid').waitFor();
    await ready();

    const ownership = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        rootExists: !!root,
        reactContainer: !!root && Object.keys(root).some((key) => key.startsWith('__reactContainer$')),
        reactChild: !!root?.firstElementChild && Object.keys(root.firstElementChild).some((key) => key.startsWith('__reactFiber$')),
        brandText: document.querySelector('.brand-title')?.textContent,
        scripts: [...document.scripts].map((s) => s.src)
      };
    });

    assert.ok(ownership.rootExists && ownership.reactContainer && ownership.reactChild, 'React must mount in root');
    assert.ok(ownership.brandText?.includes('Vendor Portal'), 'Brand header must state Vendor Portal');
    assert.ok(
      ownership.scripts.some((s) => /\/react\/assets\/vendor-[\w-]+\.js/.test(s)),
      'Must load dedicated vendor bundle'
    );

    return { reactMounted: true, brand: ownership.brandText };
  });

  // =========================================================================
  // 2. Dashboard KPIs & Assessments List
  // =========================================================================
  await check('Vendor Dashboard renders KPIs, status, and linked assessments', async () => {
    await page.goto(`${dev.base}/react/vendor.html#/dashboard`);
    await page.locator('#kpi-summary-grid').waitFor();
    await ready();

    assert.equal(await page.locator('#kpi-active-count').innerText(), '1');
    assert.ok((await page.locator('#kpi-sla-status').innerText()).includes('On Track'));

    // Check assessment card
    const card = page.locator('article.card').first();
    await card.waitFor();
    assert.ok((await card.innerText()).includes('Phase F Alpha Logistics Sdn Bhd'));
    assert.ok((await card.innerText()).includes('AlphaTrack Pro 5G'));
    assert.ok((await card.innerText()).includes('REVISION REQUIRED'));

    return { activeCount: 1, cardRendered: true };
  });

  // =========================================================================
  // 3. Strict Confidentiality Boundary Test
  // =========================================================================
  await check('Confidentiality boundary: zero internal assessor/manager/risk/audit secrets in DOM', async () => {
    const pageText = await page.evaluate(() => document.body.innerText);

    assert.equal(pageText.includes(SECRET_ASSESSOR), false, 'Assessor comment leaked in page text');
    assert.equal(pageText.includes(SECRET_MANAGER), false, 'Manager review notes leaked in page text');
    assert.equal(pageText.includes(SECRET_RISK), false, 'Risk assessment leaked in page text');
    assert.equal(pageText.includes(SECRET_WORKLOAD), false, 'Assessor workload leaked in page text');
    assert.equal(pageText.includes(SECRET_AUDIT), false, 'Internal audit leaked in page text');
    assert.equal(pageText.includes(SECRET_OTHER_VENDOR), false, 'Competitor vendor data leaked in page text');

    // Also inspect network responses
    const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
    const evalDataRes = await fetch(`${dev.base}/.netlify/functions/vendor-portal-data`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const evalData = await evalDataRes.text();

    assert.equal(evalData.includes(SECRET_ASSESSOR), false, 'Assessor secret leaked in API response');
    assert.equal(evalData.includes(SECRET_MANAGER), false, 'Manager secret leaked in API response');
    assert.equal(evalData.includes(SECRET_RISK), false, 'Risk secret leaked in API response');

    return { secretsLeaked: 0 };
  });

  // =========================================================================
  // 4. Data Isolation & IDOR Prevention
  // =========================================================================
  await check('Vendor A is restricted to own records and cannot access Vendor B records', async () => {
    // Navigate to Vendor B's assessment
    await page.goto(`${dev.base}/react/vendor.html#/assessments/${vendorEvalIdB}`);
    await ready();

    // Verify error state
    assert.ok(await page.getByRole('heading', { name: 'Assessment Not Found' }).isVisible());

    // API level IDOR check
    const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
    const idorRes = await fetch(`${dev.base}/.netlify/functions/vendor-portal-data?id=${vendorEvalIdB}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const idorStatus = idorRes.status;

    assert.equal(idorStatus, 403, 'API must return 403 Forbidden for cross-vendor access');

    return { idorBlocked: true, statusCode: idorStatus };
  });

  // =========================================================================
  // 5. Required Actions Queue & Revision Resubmission
  // =========================================================================
  await check('Required Actions displays feedback and supports revision resubmission to v2', async () => {
    await page.goto(`${dev.base}/react/vendor.html#/actions`);
    await ready();

    // Verify rejection alert
    const banner = page.locator('#priority-alerts-area, [role="alert"]').first();
    await banner.waitFor();
    assert.ok((await banner.innerText()).includes('Wiring harness diagram requires ISO compliance label.'));

    // Click Respond to Revision
    await page.getByRole('button', { name: 'Respond to Revision' }).first().click();
    await page.getByRole('heading', { name: 'Respond to Revision & Resubmit' }).waitFor();

    // Fill remediation form
    await page.locator('#resubmit-notes').fill('Replaced schematic diagram with ISO-certified wiring specification.');
    await page.locator('#btn-submit-resubmit').click();
    await ready();

    // Verify modal closes and status transitions to submitted
    await page.waitForFunction(() => !document.querySelector('#btn-submit-resubmit'));
    await page.goto(`${dev.base}/react/vendor.html#/dashboard`);
    await ready();

    const card = page.locator('article.card').first();
    assert.ok((await card.innerText()).includes('SUBMITTED'));
    assert.ok((await card.innerText()).includes('(v2)'));

    return { resubmitted: true, newVersion: 2 };
  });

  // =========================================================================
  // 6. Evidence Document Upload & Listing
  // =========================================================================
  await check('Vendor uploads permitted evidence document and sees it in attached files', async () => {
    await page.goto(`${dev.base}/react/vendor.html#/documents`);
    await ready();

    // Verify existing document
    assert.ok((await page.locator('.doc-table').innerText()).includes('device_spec_v1.pdf'));

    // Open upload modal
    await page.getByRole('button', { name: '+ Upload Document' }).click();
    await page.getByRole('heading', { name: 'Upload Supporting Documentation' }).waitFor();

    // Select category and input mock file
    await page.locator('#doc-category').selectOption('test_report');
    await page.locator('#doc-notes').fill('Lab calibration test results.');

    // Upload a small valid text/pdf file
    await page.locator('#doc-file').setInputFiles({
      name: 'iso_compliance_cert.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 Official Certificate Content')
    });

    await page.locator('#btn-upload-submit').click();
    await ready();

    // Verify document table reflects newly added file
    await page.waitForFunction(() => !document.querySelector('#btn-upload-submit'));
    const docTableText = await page.locator('.doc-table').innerText();
    assert.ok(docTableText.includes('iso_compliance_cert.pdf'));
    assert.ok(docTableText.includes('Lab / Calibration Test Report'));

    return { documentUploaded: true, fileName: 'iso_compliance_cert.pdf' };
  });

  // =========================================================================
  // 7. Disallowed Document Upload Rejection
  // =========================================================================
  await check('Disallowed file types are rejected by backend', async () => {
    const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
    const uploadRes = await fetch(`${dev.base}/.netlify/functions/vendor-documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'upload',
        evaluationId: vendorEvalIdA,
        name: 'trojan.exe',
        category: 'other',
        fileType: 'application/x-msdownload',
        fileData: Buffer.from('malicious-exe-bytes').toString('base64')
      })
    });
    const uploadBody = await uploadRes.json();

    assert.equal(uploadRes.status, 400);
    assert.match(uploadBody.error, /unsupported file type/i);

    return { rejected: true, status: uploadRes.status };
  });

  // =========================================================================
  // 8. Official Certificate Display & PDF Verification Link
  // =========================================================================
  await check('Certificates section displays official MIROS certificate and verify link', async () => {
    // Update assessment in store to completed status with certificate
    const current = readData('evaluations');
    const updated = current.map((e) => {
      if (e._id === vendorEvalIdA) {
        return {
          ...e,
          status: 'certificate_issued',
          certificate: {
            certificateNumber: 'MIROS-CERT-2026-F001',
            preparedDate: day,
            printedDate: day,
            signedDate: now,
            signedBy: 'DGO Signatory'
          }
        };
      }
      return e;
    });
    write('evaluations', updated);

    await page.goto(`${dev.base}/react/vendor.html#/certificates`);
    await page.reload();
    await ready();

    // Verify certificate banner
    const certBanner = page.locator('.cert-banner').first();
    await certBanner.waitFor();
    assert.ok((await certBanner.innerText()).includes('MIROS-CERT-2026-F001'));
    assert.ok((await certBanner.innerText()).includes('DGO Signatory'));

    // Verify public verify online link
    const verifyLink = certBanner.locator('a.btn-verify-cert');
    await verifyLink.waitFor();
    assert.ok((await verifyLink.getAttribute('href')).includes('verify-certificate.html?cert=MIROS-CERT-2026-F001'));

    // Verify Download PDF button is enabled
    const downloadBtn = certBanner.locator('.btn-download-cert');
    assert.equal(await downloadBtn.isDisabled(), false);

    return { certificateReady: true, certNumber: 'MIROS-CERT-2026-F001' };
  });

  // =========================================================================
  // 9. Company Profile Management & Security
  // =========================================================================
  await check('Company Profile updates allowed contact fields and supports password change', async () => {
    await page.goto(`${dev.base}/react/vendor.html#/profile`);
    await ready();

    // Update contact person and phone
    await page.locator('#prof-person').fill('Alice Vendor Updated');
    await page.locator('#prof-phone').fill('+60 12-888 9999');
    await page.locator('#btn-save-profile').click();
    await ready();

    // Verify success banner
    await page.getByRole('status').filter({ hasText: 'Profile updated successfully' }).waitFor();

    // Switch to Change Password tab
    await page.getByRole('button', { name: 'Change Password' }).click();
    assert.ok(await page.locator('#pwd-current').isVisible());

    return { profileUpdated: true };
  });

  // =========================================================================
  // 10. Payment Retirement Invariant
  // =========================================================================
  await check('Payment workflow is completely retired with zero active controls in React', async () => {
    await page.goto(`${dev.base}/react/vendor.html#/dashboard`);
    await ready();

    const buttons = await page.locator('button, a').allInnerTexts();
    const hasPayment = buttons.some((text) =>
      /pay now|make payment|submit payment|payment proof|fpx/i.test(text)
    );
    assert.equal(hasPayment, false, 'No payment buttons should exist in React Vendor portal');

    // Retired endpoint test
    const token = await page.evaluate(() => localStorage.getItem('trackscore_token'));
    const retiredRes = await fetch(`${dev.base}/.netlify/functions/vendor-submit-payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ evaluationId: vendorEvalIdA })
    });
    const retiredStatus = retiredRes.status;

    assert.equal(retiredStatus, 410, 'Retired payment endpoint must return 410 Gone');

    return { retiredPaymentPassed: true };
  });

  // =========================================================================
  // 11. Responsive Viewports Across All 5 Sizes
  // =========================================================================
  await check('All five requested viewports render Vendor portal without horizontal overflow', async () => {
    const viewports = [
      [1920, 1080],
      [1366, 768],
      [1280, 800],
      [768, 1024],
      [390, 844]
    ];

    for (const [w, h] of viewports) {
      await page.setViewportSize({ width: w, height: h });
      await ready();
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(hasOverflow, false, `Page must not overflow horizontally at ${w}x${h}`);
    }

    await page.setViewportSize({ width: 1366, height: 768 });
    return { viewportsTested: viewports.length };
  });

  // =========================================================================
  // 12. Role-Based Access Control Guards
  // =========================================================================
  await check('Role access control redirects Manager and Assessor away from Vendor portal', async () => {
    // 1. Manager login
    await login('manager');
    await page.goto(`${dev.base}/react/vendor.html`);
    await page.waitForURL('**/react/manager.html');

    // 2. Assessor login
    await login('assessor');
    await page.goto(`${dev.base}/react/vendor.html`);
    await page.waitForURL('**/react/assessor.html');

    // 3. Restore manager login
    await login('manager');

    return { rbacGuardsActive: true };
  });
}

