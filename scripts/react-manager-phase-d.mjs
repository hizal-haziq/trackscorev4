// Phase D Browser Verification Script
// Tests full Certificate Lifecycle in React: Prepare -> Print -> Sign -> Public Verification -> Single-page A4 PDF -> Deliver -> Completed.
// Also tests double-submit protection, long company names, and responsive viewports.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SECTION_A_CRITERIA, SECTION_B_CRITERIA, recomputeScores } from '../netlify/functions/rubric.js';

export async function verifyPhaseD({
  page,
  context,
  browser,
  dev,
  qa,
  check,
  write,
  records,
  users,
  login,
  overview,
  settled,
  delay,
  streams
}) {
  const readData = (name) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), '.data', `${name}.json`), 'utf8'));

  const specs = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA];
  const breakdownComplete = specs.map((criterion, i) => ({
    id: criterion.id,
    selectedOption: criterion.options.at(-1).label,
    points: criterion.options.at(-1).points,
    comment: `Phase D verified evidence ${i + 1}`
  }));
  const scored = recomputeScores(breakdownComplete);

  const evalId = 'phased-cert-eval';
  const customCertNumber = `TS-CERT-${new Date().getFullYear()}-8888`;

  // Fixture: approved assessment with complete 33 criteria
  const certRecord = {
    _id: evalId,
    companyName: 'Phase D Telematics Logistics Sdn Bhd',
    deviceModel: 'FleetGuard V4 Pro',
    status: 'approved',
    currentVersion: 1,
    approvedVersion: 1,
    packageName: 'Commercial Telematics Evaluation',
    contactPerson: 'Haji Sulaiman',
    contactEmail: 'sulaiman@phased.test',
    contactPhone: '0123456789',
    officeAddress: 'Level 10, Menara MIROS, Kajang',
    state: 'Selangor',
    totalScore: scored.totalScore,
    starsCount: scored.starsCount,
    ratingLabel: scored.ratingLabel,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [
      { status: 'registered', actor: 'Haji Sulaiman', note: 'Customer registered' },
      { status: 'approved', actor: 'Operations Manager', note: 'Manager approved v1' }
    ],
    documents: [],
    breakdown: breakdownComplete,
    certificate: {}
  };

  const certGuardId = 'phased-cert-guard';
  const certGuardRecord = {
    _id: certGuardId,
    companyName: 'Phase D Guard Telematics Sdn Bhd',
    deviceModel: 'FleetGuard Lock V4',
    status: 'approved',
    currentVersion: 1,
    approvedVersion: 1,
    packageName: 'Commercial Telematics Evaluation',
    contactPerson: 'Safety Officer',
    contactEmail: 'safety@phased.test',
    contactPhone: '0123456788',
    officeAddress: 'Level 10, Menara MIROS, Kajang',
    state: 'Selangor',
    totalScore: scored.totalScore,
    starsCount: scored.starsCount,
    ratingLabel: scored.ratingLabel,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [
      { status: 'approved', actor: 'Operations Manager', note: 'Approved' }
    ],
    documents: [],
    breakdown: breakdownComplete,
    certificate: {}
  };

  const initialEvaluations = [...records, certRecord, certGuardRecord];
  write('evaluations', initialEvaluations);
  write('assessment_versions', [
    {
      _id: `${evalId}-v1`,
      evaluationId: evalId,
      versionNumber: 1,
      action: 'INITIAL_APPROVAL',
      actor: { name: 'Operations Manager', role: 'manager' },
      scores: scored,
      breakdown: breakdownComplete,
      createdAt: new Date().toISOString(),
      isApprovedVersion: true
    },
    {
      _id: `${certGuardId}-v1`,
      evaluationId: certGuardId,
      versionNumber: 1,
      action: 'INITIAL_APPROVAL',
      actor: { name: 'Operations Manager', role: 'manager' },
      scores: scored,
      breakdown: breakdownComplete,
      createdAt: new Date().toISOString(),
      isApprovedVersion: true
    }
  ]);

  async function ready() {
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].some(
          (button) => /Refresh assessment/.test(button.textContent) && button.disabled
        )
    );
    await delay(70);
  }

  async function gotoWorkspace(id) {
    await page.goto(`${dev.base}/react/manager.html#/assessments/${encodeURIComponent(id)}`);
    await page.getByRole('tab', { name: 'Overview', exact: true }).waitFor();
    await ready();
  }

  async function clickTab(name) {
    await page.getByRole('tab', { name, exact: true }).click();
    await page.getByRole('tabpanel').waitFor();
    await delay(60);
  }

  try {
    await login('manager');

    // 1. STEP 1: PREPARE CERTIFICATE
    await check('React Manager prepares certificate with authoritative certificate number', async () => {
      await gotoWorkspace(evalId);
      await clickTab('Certificate');

      // Verify initial pipeline & button
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Ready for Certificate'));
      const prepBtn = page.getByRole('tabpanel').getByRole('button', { name: '1. Prepare Certificate', exact: true });
      await prepBtn.click();

      // Modal opens
      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Step 1: Prepare Certificate'));

      // Fill custom certificate number
      await page.locator('#cert-prep-number').fill(customCertNumber);
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm Preparation', exact: true }).click();

      // Success feedback
      await page.getByRole('status').filter({ hasText: 'prepared' }).waitFor();
      await ready();

      // State updates to Prepared
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Prepared'));
      assert.ok((await page.getByRole('tabpanel').innerText()).includes(customCertNumber));
    });

    // 2. STEP 2: MARK PRINTED
    await check('React Manager marks certificate as physically printed and routed to DGO', async () => {
      await gotoWorkspace(evalId);
      await clickTab('Certificate');

      const printBtn = page.getByRole('tabpanel').getByRole('button', { name: '2. Mark Printed', exact: true });
      await printBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Step 2: Physical Printing'));

      await page.getByRole('dialog').getByRole('button', { name: 'Confirm Physical Print', exact: true }).click();

      await page.getByRole('status').filter({ hasText: 'print' }).waitFor();
      await ready();

      // State updates to Printed
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Printed'));
    });

    // 3. STEP 3: RECORD DGO SIGNATURE
    await check('React Manager records official DGO signature and advances status to certificate_issued', async () => {
      await gotoWorkspace(evalId);
      await clickTab('Certificate');

      const signBtn = page.getByRole('tabpanel').getByRole('button', { name: '3. Record DGO Signature', exact: true });
      await signBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Step 3: Record DGO Signature'));

      await page.locator('#cert-sign-name').fill("Dato' Ts. Dr. Siti Zaharah Ishak");
      await page.getByRole('dialog').getByRole('button', { name: 'Record DGO Signature', exact: true }).click();

      await page.getByRole('status').filter({ hasText: /signed|issued/i }).waitFor();
      await ready();

      // Status advances to certificate_issued and cert state is Signed
      const panelText = await page.getByRole('tabpanel').innerText();
      assert.ok(panelText.includes('Signed'));
      assert.ok(panelText.includes("Dato' Ts. Dr. Siti Zaharah Ishak"));

      // Verify Online link is rendered
      const verifyLink = page.getByRole('link', { name: 'Verify Online ↗' });
      await verifyLink.waitFor();
      assert.ok((await verifyLink.getAttribute('href')).includes(encodeURIComponent(customCertNumber)));
    });

    // 4. PUBLIC VERIFICATION INTEGRITY
    await check('Public certificate verification confirms valid endorsement and omits private data', async () => {
      const publicPage = await context.newPage();
      await publicPage.goto(`${dev.base}/verify-certificate.html?cert=${encodeURIComponent(customCertNumber)}`);

      await publicPage.getByText('OFFICIALLY VERIFIED & ACTIVE').waitFor();
      const text = await publicPage.innerText('body');
      assert.ok(text.includes('Phase D Telematics Logistics Sdn Bhd'));
      assert.ok(text.includes('FleetGuard V4 Pro'));
      assert.ok(text.includes("Dato' Ts. Dr. Siti Zaharah Ishak"));
      assert.ok(text.includes(customCertNumber));

      // Assert private fields are NOT leaked in public DOM
      assert.ok(!text.includes('assessorId'));
      assert.ok(!text.includes('internalNotes'));
      assert.ok(!text.includes('PAA 001'));

      await publicPage.close();
    });

    // 5. OFFICIAL SINGLE-PAGE A4 PDF GENERATION & DYNAMIC LOADER
    await check('React triggers single-page A4 PDF generator via certificate-pdf.js', async () => {
      await gotoWorkspace(evalId);
      await clickTab('Certificate');

      // Pre-mock html2pdf engine only, leaving window.downloadTrackScoreCertificatePdf undefined
      // so ensureCertificatePdfLoaded dynamically loads /certificate-pdf.js on demand
      await page.evaluate(() => {
        window.__capturedRenderHtml = null;
        window.html2pdf = () => {
          const worker = {
            set: () => worker,
            from: (el) => {
              window.__capturedRenderHtml = el ? el.outerHTML : '';
              return worker;
            },
            toContainer: () => worker,
            get: async () => {
              const parent = document.createElement('div');
              const child = document.createElement('div');
              parent.appendChild(child);
              return child;
            },
            save: async () => {}
          };
          return worker;
        };
      });

      // Trigger download
      const downloadBtn = page.getByRole('tabpanel').getByRole('button', { name: /Download Official PDF/i });
      await downloadBtn.click();

      // Wait for script to be loaded and download execution to complete
      await page.waitForFunction(() =>
        typeof window.downloadTrackScoreCertificatePdf === 'function' &&
        typeof window.generateCertificateHtml === 'function'
      );
      await page.getByRole('status').filter({ hasText: /downloaded successfully/i }).waitFor();

      const verification = await page.evaluate((certNo) => {
        const scriptTag = document.querySelector('script[src*="certificate-pdf.js"]');
        const captured = window.__capturedRenderHtml || '';
        return {
          scriptLoaded: scriptTag !== null,
          hasCertNumber: captured.includes(certNo),
          hasCompanyName: captured.includes('Phase D Telematics Logistics Sdn Bhd'),
          hasQr: captured.includes('data:image/svg+xml'),
          hasStar: captured.includes('★') || captured.includes('Star')
        };
      }, customCertNumber);

      assert.ok(verification.scriptLoaded, 'certificate-pdf.js must be injected into DOM on demand');
      assert.ok(verification.hasCertNumber, 'Rendered HTML contains certificate number');
      assert.ok(verification.hasCompanyName, 'Rendered HTML contains company name');
      assert.ok(verification.hasQr, 'Rendered HTML contains QR code SVG');
    });

    // 6. LONG COMPANY NAME LAYOUT STABILITY IN PDF TEMPLATE
    await check('PDF template layout remains stable with long company name without overflow', async () => {
      const longName = 'Perusahaan Pengangkutan Logistik Bersepadu Dan Perkhidmatan Telematik Nasional Antarabangsa Berhad';
      const layoutStability = await page.evaluate((longName) => {
        const testRecord = {
          companyName: longName,
          deviceModel: 'Super Long Model Name Telematics Gateway Edition 2026',
          packageName: 'Comprehensive Telematics Safety & Environmental Compliance Package',
          totalScore: 98,
          starsCount: 5,
          ratingLabel: 'Gold Star Telematics Standard',
          approvedVersion: 2,
          certificate: {
            certificateNumber: 'TS-CERT-2026-LONG-01',
            certifiedVersion: 2,
            preparedDate: '2026-10-12',
            printedDate: '2026-10-12',
            signedDate: '2026-10-12',
            signedBy: "Ketua Pengarah MIROS Dato' Ts. Dr. Siti Zaharah Ishak"
          }
        };

        const html = window.generateCertificateHtml(testRecord);
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.innerHTML = html;
        document.body.appendChild(container);

        const card = container.querySelector('#trackscore-cert-render');
        const height = card ? card.scrollHeight : 0;
        const width = card ? card.scrollWidth : 0;

        container.remove();

        return {
          height,
          width,
          fitsSinglePage: height <= 1120 && width <= 794
        };
      }, longName);

      assert.ok(layoutStability.fitsSinglePage, 'Long company name must fit inside single-page A4 canvas');
    });

    // 7. STEP 4: DELIVER TO CUSTOMER
    await check('React Manager marks certificate as delivered to customer and completes evaluation lifecycle', async () => {
      await gotoWorkspace(evalId);
      await clickTab('Certificate');

      const deliverBtn = page.getByRole('tabpanel').getByRole('button', { name: '4. Deliver to Customer', exact: true });
      await deliverBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Step 4: Deliver Certificate'));

      await page.locator('#cert-deliver-notes').fill('Courier dispatch ref #MY-POST-998877.');
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm Delivery to Customer', exact: true }).click();

      await page.getByRole('status').filter({ hasText: /dispatched|completed/i }).waitFor();
      await ready();

      // Status advances to completed
      const panelText = await page.getByRole('tabpanel').innerText();
      assert.ok(panelText.includes('Completed'));
      assert.ok(panelText.includes('Courier dispatch ref #MY-POST-998877.'));

      // Check DB record completed
      const stored = readData('evaluations');
      const updatedRecord = stored.find((e) => e._id === evalId);
      assert.equal(updatedRecord.status, 'completed');
      assert.ok(updatedRecord.completedAt);
      assert.ok(updatedRecord.certificate.sentToCustomerDate);
      assert.equal(updatedRecord.certificate.notes, 'Courier dispatch ref #MY-POST-998877.');
    });

    // 8. DOUBLE-SUBMIT PROTECTION ON CERTIFICATE ACTIONS
    await check('Double-submit lock disables action buttons during certificate mutations', async () => {
      await gotoWorkspace(certGuardId);
      await clickTab('Certificate');

      // Click Prepare Certificate on guard fixture to test modal lock
      const prepBtn = page.getByRole('tabpanel').getByRole('button', { name: '1. Prepare Certificate', exact: true });
      await prepBtn.click();
      await page.getByRole('dialog').waitFor();

      await page.route('**/manage-certificate', async (route) => {
        await delay(500);
        await route.continue().catch(() => {});
      });

      const submitBtn = page.getByRole('dialog').getByRole('button', { name: 'Confirm Preparation', exact: true });
      const responsePromise = page.waitForResponse((r) => r.url().includes('manage-certificate'));
      await submitBtn.click();

      // Immediately verify disabled state during pending submission
      const pendingBtn = page.getByRole('button', { name: 'Preparing...' });
      await pendingBtn.waitFor();
      assert.equal(await pendingBtn.isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Cancel' }).isDisabled(), true);

      await responsePromise;
      await page.unroute('**/manage-certificate');
      await ready();
    });

    // 9. VIEWPORTS FIT CERTIFICATE WORKSPACE CLEANLY
    await check('All five viewports render Phase D Certificate workspace cleanly without overflow', async () => {
      for (const [width, height] of [
        [1920, 1080],
        [1366, 768],
        [1280, 800],
        [768, 1024],
        [390, 844]
      ]) {
        await page.setViewportSize({ width, height });
        await gotoWorkspace(evalId);
        await clickTab('Certificate');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${qa}/phase-d-certificate-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1366, height: 768 });
    });

  } finally {
    // Cleanup
    write('evaluations', records);
    write('assessment_versions', []);
  }
}

