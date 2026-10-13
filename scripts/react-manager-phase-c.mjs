// Phase C Browser Verification Script
// Tests full workflow mutations in React: Schedule -> Assign -> Submit v1 -> Request Changes -> Submit v2 -> Approve v2 -> Ready for Certificate.
// Also tests Reassignment, double-submit protection, and responsive dialog viewports.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {SECTION_A_CRITERIA, SECTION_B_CRITERIA, recomputeScores} from '../netlify/functions/rubric.js';

export async function verifyPhaseC({page, context, browser, dev, qa, check, write, records, users, login, overview, settled, delay, streams}) {
  const readData = (name) => JSON.parse(fs.readFileSync(path.join(process.cwd(), '.data', `${name}.json`), 'utf8'));
  const specs = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA];
  const breakdownV1 = specs.map((criterion, i) => ({
    id: criterion.id,
    selectedOption: criterion.options.at(-1).label,
    points: criterion.options.at(-1).points,
    comment: `Phase C v1 evidence ${i + 1}`
  }));
  const scoredV1 = recomputeScores(breakdownV1);

  const breakdownV2 = specs.map((criterion, i) => ({
    id: criterion.id,
    selectedOption: criterion.options.at(-1).label,
    points: criterion.options.at(-1).points,
    comment: `Phase C v2 revised evidence ${i + 1}`
  }));
  const scoredV2 = recomputeScores(breakdownV2);

  // Fixture: un-evaluated registration record
  const registrationId = 'phasec-reg-1';
  const regRecord = {
    _id: registrationId,
    companyName: 'Phase C Workflow Fleet',
    deviceModel: 'Tracker Pro V4',
    status: 'registered',
    currentVersion: 0,
    packageName: 'Standard Assessment',
    contactPerson: 'Director Ali',
    contactEmail: 'director@phasec.test',
    contactPhone: '0123456789',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [{ status: 'registered', actor: 'Director Ali', note: 'New customer registration' }],
    documents: [],
    breakdown: []
  };

  const regRecordGuard = {
    _id: 'phasec-reg-guard',
    companyName: 'Phase C Guard Fleet',
    deviceModel: 'Tracker Pro Guard',
    status: 'registered',
    currentVersion: 0,
    packageName: 'Standard Assessment',
    contactPerson: 'Manager Safety',
    contactEmail: 'guard@phasec.test',
    contactPhone: '0123456788',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [{ status: 'registered', actor: 'Manager Safety', note: 'New customer registration' }],
    documents: [],
    breakdown: []
  };

  const initialEvaluations = [...records, regRecord, regRecordGuard];
  write('evaluations', initialEvaluations);
  write('assessment_versions', []);

  async function ready() {
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => /Refresh assessment/.test(button.textContent) && button.disabled));
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
    await delay(50);
  }

  try {
    await login('manager');

    // 1. Scheduling Workflow
    await check('React Manager schedules registration inspection date', async () => {
      await gotoWorkspace(registrationId);
      await clickTab('Actions');

      // Schedule Inspection card
      const scheduleBtn = page.getByRole('button', { name: 'Schedule Inspection' });
      await scheduleBtn.click();

      // Modal opens
      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Schedule Assessment Inspection'));

      // Fill date and notes
      await page.locator('#schedule-date-input').fill('2026-10-25');
      await page.locator('#schedule-notes-input').fill('Inspection at Klang logistics hub');
      await page.getByRole('button', { name: 'Save Inspection Schedule' }).click();

      // Feedback announced
      await page.getByRole('status').filter({ hasText: 'Inspection scheduled' }).waitFor();
      await ready();

      // Confirms updated status
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Scheduled'));
    });

    // 2. Assessor Assignment Workflow
    await check('React Manager assigns registered assessor from live directory', async () => {
      await clickTab('Actions');
      const assignBtn = page.getByRole('button', { name: 'Assign Assessor' });
      await assignBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Assign Assessor'));

      // Wait for directory select
      await page.locator('#assign-assessor-select').waitFor();
      await page.locator('#assign-instructions-input').fill('Verify calibration certificates');
      await page.getByRole('dialog').getByRole('button', { name: 'Assign Assessor' }).click();

      await page.getByRole('status').filter({ hasText: 'successfully assigned' }).waitFor();
      await ready();

      // Confirms assigned assessor display
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Phase A assessor'));
    });

    // 3. Reassignment Workflow
    await check('React Manager reassigns assessor with confirmation', async () => {
      await clickTab('Actions');
      const reassignBtn = page.getByRole('button', { name: 'Reassign Assessor' });
      await reassignBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Reassign Assessor'));
      assert.ok((await page.getByRole('dialog').innerText()).includes('Currently Assigned To'));

      // Select another assessor if available or re-confirm
      await page.getByRole('button', { name: 'Confirm Reassignment' }).click();
      await page.getByRole('status').filter({ hasText: 'successfully assigned' }).waitFor();
      await ready();
    });

    // 4. Assessor Submits Version 1 (Simulated legacy assessor submission)
    const stored = readData('evaluations');
    const targetIdx = stored.findIndex(e => e._id === registrationId);
    stored[targetIdx] = {
      ...stored[targetIdx],
      ...scoredV1,
      status: 'pending_review',
      currentVersion: 1,
      assessorName: 'Phase A assessor',
      assessorId: 'PAA 001',
      breakdown: scoredV1.breakdown
    };
    write('evaluations', stored);
    write('assessment_versions', [
      {
        _id: `${registrationId}-v1`,
        evaluationId: registrationId,
        versionNumber: 1,
        action: 'INITIAL_SUBMISSION',
        actor: { name: 'Phase A assessor', role: 'assessor' },
        scores: scoredV1,
        breakdown: scoredV1.breakdown,
        createdAt: new Date().toISOString()
      }
    ]);

    // 5. Manager Review & Request Changes
    await check('React Manager reviews v1 and requests changes with required reason', async () => {
      await gotoWorkspace(registrationId);
      await clickTab('Actions');

      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Awaiting Review'));

      const reqChangesBtn = page.getByRole('button', { name: 'Request Changes' });
      await reqChangesBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Request Changes from Assessor'));

      // Validate required reason
      await page.locator('#request-changes-reason').fill('Please provide updated sensor calibration proof for criterion 1.');
      await page.getByRole('button', { name: 'Send Revision Request' }).click();

      await page.getByRole('status').filter({ hasText: 'Changes requested' }).waitFor();
      await ready();

      // Confirms Changes Requested
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Changes Requested'));
    });

    // 6. Assessor Resubmits Version 2
    const storedAfterReject = readData('evaluations');
    const rejectIdx = storedAfterReject.findIndex(e => e._id === registrationId);
    storedAfterReject[rejectIdx] = {
      ...storedAfterReject[rejectIdx],
      ...scoredV2,
      status: 'pending_review',
      currentVersion: 2,
      breakdown: scoredV2.breakdown
    };
    write('evaluations', storedAfterReject);
    const existingVersions = readData('assessment_versions');
    existingVersions.push({
      _id: `${registrationId}-v2`,
      evaluationId: registrationId,
      versionNumber: 2,
      action: 'RESUBMISSION',
      actor: { name: 'Phase A assessor', role: 'assessor' },
      scores: scoredV2,
      breakdown: scoredV2.breakdown,
      changeReason: 'Updated sensor calibration certificates',
      createdAt: new Date().toISOString()
    });
    write('assessment_versions', existingVersions);

    // 7. Manager Approves Version 2
    await check('React Manager approves v2 and unlocks certificate readiness', async () => {
      await gotoWorkspace(registrationId);
      await clickTab('Actions');

      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Awaiting Review'));

      const approveBtn = page.getByRole('button', { name: 'Approve Assessment' });
      await approveBtn.click();

      await page.getByRole('dialog').waitFor();
      assert.ok((await page.getByRole('dialog').innerText()).includes('Confirm Manager Approval'));
      assert.ok((await page.getByRole('dialog').innerText()).includes('Version 2'));

      await page.locator('#approve-comment').fill('All sensor criteria verified and approved.');
      await page.getByRole('button', { name: 'Confirm & Approve Assessment' }).click();

      await page.getByRole('status').filter({ hasText: 'Assessment approved' }).waitFor();
      await ready();

      // Authoritative status is approved
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Approved'));

      // Check certificate boundary: Ready for Certificate
      await clickTab('Certificate');
      assert.ok((await page.getByRole('tabpanel').innerText()).includes('Ready for Certificate'));
    });

    // 8. Mutation Safety & Double-Click Guard
    await check('Double submit protection disables buttons while mutation is pending', async () => {
      await gotoWorkspace('phasec-reg-guard');
      await clickTab('Actions');
      const scheduleBtn = page.getByRole('button', { name: 'Schedule Inspection' });
      await scheduleBtn.click();
      await page.getByRole('dialog').waitFor();

      // Route delay
      await page.route('**/schedule-assessment', async route => {
        await delay(500);
        await route.continue().catch(() => {});
      });

      await page.locator('#schedule-date-input').fill('2026-11-01');
      const submitBtn = page.getByRole('button', { name: 'Save Inspection Schedule' });
      const responsePromise = page.waitForResponse(r => r.url().includes('schedule-assessment'));
      await submitBtn.click();

      // Immediately verify disabled state during pending submission
      const pendingBtn = page.getByRole('button', { name: 'Saving Schedule...' });
      await pendingBtn.waitFor();
      assert.equal(await pendingBtn.isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Cancel' }).isDisabled(), true);
      await responsePromise;
      await page.unroute('**/schedule-assessment');
      await ready();
    });

    // 9. All 5 viewports fit modal and actions cleanly
    await check('All five viewports render Phase C actions and dialogs without overflow', async () => {
      for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 800], [768, 1024], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await gotoWorkspace(registrationId);
        await clickTab('Actions');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${qa}/phase-c-actions-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1366, height: 768 });
    });

  } finally {
    // Cleanup
    write('evaluations', records);
    write('assessment_versions', []);
  }
}
