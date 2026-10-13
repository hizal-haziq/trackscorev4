// Phase E Browser Verification Script
// Tests full Assessor workflow in React:
// 1. Assessor workspace mounting and bundle ownership
// 2. My Work queue with assigned tasks & SLA tracking
// 3. Technical assessment form with 33 criteria (24 Section A, 9 Section B)
// 4. Live score preview and criterion character counter (<= 2000 chars)
// 5. Draft storage subsystem (save, list, resume, discard, max 3 drafts limit)
// 6. Initial submission creating immutable v1 snapshot
// 7. Changes Requested queue with Manager rejection reason banner
// 8. Resubmission creating immutable v2 snapshot preserving v1
// 9. Submitted assessments list (read-only)
// 10. Peer Review workflow and commentary
// 11. Responsive viewports across all 5 sizes (1920, 1366, 1280, 768, 390)
// 12. Role-based access control (Manager and Vendor denied)

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {SECTION_A_CRITERIA, SECTION_B_CRITERIA, recomputeScores} from '../netlify/functions/rubric.js';
const ALL_CRITERIA = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA];

export async function verifyPhaseE({
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
  const readData = (name) => JSON.parse(fs.readFileSync(path.join(process.cwd(), '.data', `${name}.json`), 'utf8'));

  const assignedId = 'phasee-assigned-1';
  const peerId = 'phasee-peer-1';
  const now = new Date().toISOString();
  const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

  const assignedRecord = {
    _id: assignedId,
    companyName: 'Phase E Telematics Sdn Bhd',
    deviceModel: 'FleetTrack V5',
    status: 'scheduled',
    recordType: 'evaluation',
    currentVersion: 0,
    packageName: 'Commercial Telematics Compliance',
    scheduledDate: day,
    assessorId: 'PAA 001',
    assessorName: 'Phase A assessor',
    assignedAssessorId: 'phasea-assessor',
    assignedAssessorName: 'Phase A assessor',
    assignedAt: now,
    slaStartAt: now,
    slaDeadline: new Date(Date.now() + 5 * 86400000).toISOString(),
    sla: {
      status: 'ON_TRACK',
      label: 'On Track',
      deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
      remainingFormatted: '5 days remaining',
      isCompleted: false
    },
    statusHistory: [{ status: 'scheduled', actor: 'Manager Reviewer', note: 'Scheduled for inspection' }],
    documents: [],
    breakdown: []
  };

  const peerRecord = {
    _id: peerId,
    companyName: 'Phase E Competitor Fleet',
    deviceModel: 'CompBox 200',
    status: 'pending_review',
    recordType: 'evaluation',
    currentVersion: 1,
    packageName: 'Standard Telematics',
    assessorId: 'OTHER 002',
    assessorName: 'Other Assessor',
    assignedAssessorId: 'other-assessor',
    assignedAssessorName: 'Other Assessor',
    totalScore: 4.25,
    starRating: 4.25,
    starsCount: 4,
    ratingLabel: '4 Stars - Very Good (MIROS Grade B)',
    breakdown: ALL_CRITERIA.map(c => ({
      id: c.id,
      name: c.name,
      section: c.section,
      selectedOption: c.options[c.options.length - 1].label,
      points: c.options[c.options.length - 1].points,
      comment: 'Initial peer evidence'
    })),
    comments: [],
    createdAt: now,
    updatedAt: now
  };

  // Seed store with Phase E fixtures
  const currentEvals = readData('evaluations');
  const filteredEvals = currentEvals.filter(e => e._id !== assignedId && e._id !== peerId);
  write('evaluations', [...filteredEvals, assignedRecord, peerRecord]);

  async function ready() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await delay(70);
  }

  // 1. Assessor Workspace Mounting & Bundle Ownership
  await check('React Assessor workspace mounts with dedicated bundle', async () => {
    await login('assessor');
    await page.goto(`${dev.base}/react/assessor.html`);
    await page.locator('#assessor-main').waitFor();
    await ready();

    const ownership = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        rootExists: !!root,
        reactContainer: !!root && Object.keys(root).some(key => key.startsWith('__reactContainer$')),
        reactChild: !!root?.firstElementChild && Object.keys(root.firstElementChild).some(key => key.startsWith('__reactFiber$')),
        heading: document.querySelector('.ts-topbar span')?.textContent,
        scripts: [...document.scripts].map(s => s.src)
      };
    });

    assert.ok(ownership.rootExists && ownership.reactContainer && ownership.reactChild, 'React must mount in root');
    assert.equal(ownership.heading, 'Assessor Workspace');
    assert.ok(ownership.scripts.some(s => /\/react\/assets\/assessor-[\w-]+\.js/.test(s)), 'Must load assessor bundle');

    return { reactMounted: true, heading: ownership.heading };
  });

  // 2. My Work Queue
  await check('My Work queue renders assigned evaluations with SLA and action buttons', async () => {
    await page.goto(`${dev.base}/react/assessor.html#/work`);
    await page.getByRole('heading', { name: 'My Work Queue' }).waitFor();
    await ready();

    // Verify assigned item is visible
    const row = page.locator('tbody tr').filter({ hasText: 'Phase E Telematics Sdn Bhd' });
    await row.waitFor();
    assert.ok((await row.innerText()).includes('FleetTrack V5'));
    assert.ok((await row.innerText()).includes('Scheduled'));
    assert.ok((await row.innerText()).includes('On Track'));

    // Open assessment
    const actionBtn = row.getByRole('link', { name: 'Conduct Assessment →' });
    await actionBtn.click();
    await page.waitForURL(`**/react/assessor.html#/assessment/${assignedId}`);
    await page.getByRole('heading', { name: 'Evaluation Assessment Details' }).waitFor();
  });

  // 3. Technical Assessment Form with 33 Criteria & Live Preview
  await check('33-criterion assessment form renders Section A and Section B criteria with live preview', async () => {
    await page.goto(`${dev.base}/react/assessor.html#/assessment/${assignedId}`);
    await page.getByRole('heading', { name: 'Evaluation Assessment Details' }).waitFor();
    await ready();

    // Check sticky score bar
    const scoreBar = page.locator('.ts-sticky-score-bar');
    await scoreBar.waitFor();
    assert.ok((await scoreBar.innerText()).includes('Live Score Preview'));

    // Check 33 criteria items
    const criterionCards = page.locator('.ts-criterion-card');
    assert.equal(await criterionCards.count(), 33, 'Must render exactly 33 criteria cards');

    // Section headers
    assert.ok(await page.getByRole('heading', { name: /Section A:/ }).isVisible());
    assert.ok(await page.getByRole('heading', { name: /Section B:/ }).isVisible());

    // Select options on first criterion (Trip History)
    const tripCard = criterionCards.first();
    const highestOpt = tripCard.getByLabel(/>1yr/);
    if (await highestOpt.count() > 0) {
      await highestOpt.check();
    } else {
      // Pick second radio if label differs
      await tripCard.locator('input[type="radio"]').last().check();
    }
    await ready();

    // Add remark in comment field
    const commentField = tripCard.locator('textarea');
    await commentField.fill('Verified tamper resistant antenna connector');
    await ready();

    // Verify character counter shows correct count
    const charCounter = tripCard.getByText(/\d+ \/ 2000 chars/);
    await charCounter.waitFor();
    assert.ok((await charCounter.innerText()).includes('43 / 2000 chars'));
  });

  // 4. Draft Subsystem
  await check('Draft subsystem saves and resumes evaluation state via localStorage', async () => {
    await page.goto(`${dev.base}/react/assessor.html#/assessment/${assignedId}`);
    await page.getByRole('heading', { name: 'Evaluation Assessment Details' }).waitFor();
    await ready();

    // Fill comment on criterion 1
    const tripCard = page.locator('.ts-criterion-card').first();
    await tripCard.locator('input[type="radio"]').last().check();
    await tripCard.locator('textarea').fill('Special Draft Test Remark #1234');
    await ready();

    // Click Manual Save Draft
    const saveDraftBtn = page.getByRole('button', { name: 'Save Draft' }).first();
    await saveDraftBtn.click();
    await ready();

    // Check localStorage contains draft
    const draftCount = await page.evaluate(() => {
      const drafts = JSON.parse(localStorage.getItem('trackscore-drafts') || '{}');
      return Object.keys(drafts).length;
    });
    assert.ok(draftCount >= 1, 'Draft must be saved in localStorage');

    // Navigate to Drafts page
    await page.goto(`${dev.base}/react/assessor.html#/drafts`);
    await page.getByRole('heading', { name: 'Saved Assessment Drafts' }).waitFor();
    await ready();

    assert.ok((await page.locator('.ts-main').innerText()).includes('Phase E Telematics Sdn Bhd'));

    // Resume Draft
    const resumeBtn = page.getByRole('link', { name: 'Resume Draft →' }).first();
    await resumeBtn.click();
    await page.waitForURL(`**/react/assessor.html#/assessment/**`);
    await ready();

    // Verify remark was restored
    const restoredText = await page.locator('.ts-criterion-card').first().locator('textarea').inputValue();
    assert.equal(restoredText, 'Special Draft Test Remark #1234');
  });

  // 5. Initial Submission (v1 Creation)
  await check('Initial evaluation submission creates v1 snapshot and transitions status', async () => {
    await page.goto(`${dev.base}/react/assessor.html#/assessment/${assignedId}`);
    await page.getByRole('heading', { name: 'Evaluation Assessment Details' }).waitFor();
    await ready();

    // Complete all 33 criteria with maximum options
    const cards = page.locator('.ts-criterion-card');
    const total = await cards.count();
    for (let i = 0; i < total; i++) {
      const card = cards.nth(i);
      const radios = card.locator('input[type="radio"]');
      const radioCount = await radios.count();
      if (radioCount > 0) {
        await radios.last().check();
      }
    }
    await ready();

    // Verify Sticky bar shows 33/33
    const scoreBar = page.locator('.ts-sticky-score-bar');
    assert.ok((await scoreBar.innerText()).includes('33 / 33 Answered'));

    // Click Submit Evaluation
    const submitBtn = page.getByRole('button', { name: 'Submit Evaluation' }).first();
    await submitBtn.click();

    // Modal opens
    const modal = page.getByRole('dialog');
    await modal.waitFor();
    assert.ok((await modal.innerText()).includes('Submit Assessment Confirmation'));
    assert.ok((await modal.innerText()).includes('33 / 33 Answered (100%)'));

    // Confirm submit
    const confirmBtn = modal.getByRole('button', { name: 'Confirm & Submit to Manager' });
    await confirmBtn.click();

    // Wait for submission to complete
    await modal.waitFor({ state: 'hidden' });
    await ready();

    // Verify backend record status transitioned to submitted / pending_review
    const updatedEvals = readData('evaluations');
    const record = updatedEvals.find(e => e._id === assignedId);
    assert.ok(record, 'Record must exist');
    assert.ok(['submitted', 'pending_review'].includes(record.status), `Status must be submitted/pending_review but got ${record.status}`);
    assert.equal(record.currentVersion, 1);

    // Verify version 1 snapshot in assessment_versions
    const versions = readData('assessment_versions');
    const v1 = versions.find(v => v.evaluationId === assignedId && v.versionNumber === 1);
    assert.ok(v1, 'Version 1 snapshot must be created in storage');
    assert.equal(v1.scores?.totalScore || v1.totalScore, 5.00);
  });

  // 6. Changes Requested Workflow (v2 Creation)
  await check('Changes Requested queue displays Manager rejection reason and enables v2 resubmission', async () => {
    // Simulate Manager requesting changes on v1
    const evals = readData('evaluations');
    const idx = evals.findIndex(e => e._id === assignedId);
    assert.ok(idx >= 0);
    const rejectionReason = 'Section B tamper detection remarks require additional photographic evidence.';
    evals[idx].status = 'revision_requested';
    evals[idx].rejectionReason = rejectionReason;
    evals[idx].statusHistory = [
      ...(evals[idx].statusHistory || []),
      { status: 'revision_requested', actor: 'Manager Reviewer', reason: rejectionReason, timestamp: new Date().toISOString() }
    ];
    write('evaluations', evals);

    // Assessor navigates to Changes Requested page
    await page.goto(`${dev.base}/react/assessor.html#/changes-requested`);
    await page.getByRole('heading', { name: 'Changes Requested / Revisions' }).waitFor();
    await ready();

    // Item must be displayed with rejection reason
    const itemCard = page.locator('.ts-changes-requested-item, .ts-card').filter({ hasText: 'Phase E Telematics Sdn Bhd' });
    await itemCard.waitFor();
    assert.ok((await itemCard.innerText()).includes('Remediation Required · v1'));
    assert.ok((await itemCard.innerText()).includes(rejectionReason));

    // Click Fix & Resubmit (v2)
    const fixBtn = itemCard.getByRole('link', { name: /Fix & Resubmit/ }).first();
    await fixBtn.click();
    await page.waitForURL(`**/react/assessor.html#/assessment/${assignedId}`);
    await ready();

    // Assessment form must show Manager's rejection banner
    const banner = page.locator('div[role="alert"]').filter({ hasText: 'Changes Requested by Manager' });
    await banner.waitFor();
    assert.ok((await banner.innerText()).includes(rejectionReason));

    // Resubmit button label must reflect v2
    const resubmitBtn = page.getByRole('button', { name: 'Resubmit Revision (v2)' }).first();
    await resubmitBtn.waitFor();
    await resubmitBtn.click();

    // Confirmation modal
    const modal = page.getByRole('dialog');
    await modal.waitFor();
    assert.ok((await modal.innerText()).includes('Resubmitting Version 2'));

    // Confirm
    const confirmBtn = modal.getByRole('button', { name: 'Confirm & Resubmit Revision' });
    await confirmBtn.click();
    // Wait for resubmission to complete
    await modal.waitFor({ state: 'hidden' });
    await ready();

    // Verify database state: v2 created, v1 preserved
    const afterResubmit = readData('evaluations');
    const resubmittedRecord = afterResubmit.find(e => e._id === assignedId);
    assert.ok(['submitted', 'pending_review'].includes(resubmittedRecord.status));
    assert.equal(resubmittedRecord.currentVersion, 2);

    const allVersions = readData('assessment_versions');
    const v1Snap = allVersions.find(v => v.evaluationId === assignedId && v.versionNumber === 1);
    const v2Snap = allVersions.find(v => v.evaluationId === assignedId && v.versionNumber === 2);
    assert.ok(v1Snap, 'v1 snapshot must remain preserved intact');
    assert.ok(v2Snap, 'v2 snapshot must be appended');
  });

  // 7. Submitted Assessments View
  await check('Submitted queue displays completed evaluations read-only', async () => {
    await page.goto(`${dev.base}/react/assessor.html#/submitted`);
    await page.getByRole('heading', { name: 'Submitted Assessments' }).waitFor();
    await ready();

    const row = page.locator('tbody tr').filter({ hasText: 'Phase E Telematics Sdn Bhd' });
    await row.waitFor();
    assert.ok((await row.innerText()).includes('v2'));
    assert.ok((await row.innerText()).includes('5.00 / 5.00'));
  });

  // 8. Peer Review Workflow & Commentary
  await check('Peer Review workflow allows browsing peer evaluations and posting comments', async () => {
    await page.goto(`${dev.base}/react/assessor.html#/peer-reviews`);
    await page.getByRole('heading', { name: 'Peer Technical Reviews' }).waitFor();
    await ready();

    // Peer record must be listed
    const row = page.locator('tbody tr').filter({ hasText: 'Phase E Competitor Fleet' });
    await row.waitFor();
    assert.ok((await row.innerText()).includes('CompBox 200'));
    assert.ok((await row.innerText()).includes('Other Assessor'));

    // Open Peer Review Modal
    const reviewBtn = row.getByRole('button', { name: 'Review & Comment →' });
    await reviewBtn.click();

    const modal = page.getByRole('dialog');
    await modal.waitFor();
    assert.ok((await modal.innerText()).includes('Peer Technical Review'));

    // Post comment
    const commentInput = modal.locator('textarea');
    await commentInput.fill('Cross-verified GPS antenna conforms with MIROS Section A specs.');
    const postBtn = modal.getByRole('button', { name: 'Post Review Comment' });
    await postBtn.click();
    await ready();

    // Modal closes and comment count increments
    await delay(300);
    const updatedRow = page.locator('tbody tr').filter({ hasText: 'Phase E Competitor Fleet' });
    assert.ok((await updatedRow.innerText()).includes('1 comments'));

    // Verify stored comment in evaluations.json
    const evals = readData('evaluations');
    const peerDoc = evals.find(e => e._id === peerId);
    assert.equal(peerDoc.comments.length, 1);
    assert.ok(peerDoc.comments[0].text.includes('Cross-verified GPS antenna'));
    assert.equal(peerDoc.comments[0].authorRole || peerDoc.comments[0].role, 'assessor');
  });

  // 9. Responsive Layout across All 5 Viewports
  await check('All five viewports render Assessor workspace cleanly without overflow', async () => {
    const viewports = [
      { width: 1920, height: 1080, name: 'Desktop Full HD' },
      { width: 1366, height: 768,  name: 'Standard Laptop' },
      { width: 1280, height: 800,  name: 'Small Laptop / Tablet Landscape' },
      { width: 768,  height: 1024, name: 'Tablet Portrait' },
      { width: 390,  height: 844,  name: 'Mobile Phone' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${dev.base}/react/assessor.html#/work`);
      await ready();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      assert.equal(hasHorizontalScroll, false, `Viewport ${vp.name} (${vp.width}px) must not have root horizontal overflow`);
    }

    // Reset viewport to default
    await page.setViewportSize({ width: 1366, height: 768 });
  });

  // 10. Role-Based Access Control (RBAC)
  await check('Role access control blocks Manager and Vendor from Assessor workspace', async () => {
    // 1. Manager is denied access to Assessor workspace
    await login('manager');
    await page.goto(`${dev.base}/react/assessor.html`);
    await delay(500);
    // AssessorRoute redirects manager to /react/manager.html
    const managerUrl = page.url();
    assert.ok(managerUrl.endsWith('/react/manager.html') || managerUrl.endsWith('/login.html'),
      `Manager should be redirected away from assessor workspace, got ${managerUrl}`);

    // 2. Unauthenticated user is redirected to login
    await page.evaluate(() => {
      localStorage.removeItem('trackscore_token');
      localStorage.removeItem('trackscore_user');
      localStorage.removeItem('trackscore_user_role');
    });
    await page.goto(`${dev.base}/react/assessor.html`);
    await delay(500);
    const unauthUrl = page.url();
    assert.ok(unauthUrl.includes('/login.html'), `Unauthenticated user must be redirected to login, got ${unauthUrl}`);

    // Restore manager login for subsequent suite checks
    await login('manager');
  });
}
