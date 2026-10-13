import {test, beforeEach, afterEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import {
  ALL_CRITERIA,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  calculateScorePreview
} from '../src/utils/rubric.ts';
import {
  getStoredDrafts,
  saveDraft,
  discardDraft,
  saveStoredDrafts,
  getActiveDraftId,
  MAX_DRAFTS
} from '../src/services/assessorDrafts.ts';
import {
  submitAssessment,
  resubmitAssessment
} from '../src/services/assessorSubmission.ts';
import {
  fetchAssessorWork,
  fetchAssessmentDetail
} from '../src/services/assessorAssessments.ts';
import {
  fetchPeerReviews,
  addPeerComment
} from '../src/services/peerReviews.ts';
import {
  RUBRIC_VERSION,
  recomputeScores,
  validateBreakdownCriteria
} from '../netlify/functions/rubric.js';
import {generateToken} from '../netlify/functions/auth.js';
import {handler as saveEvaluationHandler} from '../netlify/functions/save-evaluation.js';
import {handler as lookupEvaluationHandler} from '../netlify/functions/lookup-evaluation.js';
import {handler as addCommentHandler} from '../netlify/functions/add-comment.js';
import {connectToDatabase} from '../netlify/functions/db.js';

const originalFetch = globalThis.fetch;
const prefix = 'phasee-unit-';

function session(role = 'assessor', name = 'Test Assessor', assessorId = 'TSA 1001') {
  const token = generateToken({ role, name, assessorId }, '1h');
  const values = new Map([
    ['trackscore_token', token],
    ['trackscore_user_role', role],
    ['trackscore_user', JSON.stringify({ name, role, assessorId })]
  ]);
  const storageMock = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
    clear: () => values.clear()
  };
  globalThis.localStorage = storageMock;
  globalThis.sessionStorage = storageMock;
  const target = new EventTarget();
  globalThis.window = {
    localStorage: storageMock,
    sessionStorage: storageMock,
    dispatchEvent: (e) => target.dispatchEvent(e)
  };
  return token;
}

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

beforeEach(() => session());
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

after(async () => {
  for (const name of ['evaluations', 'assessment_versions', 'assessment_risk']) {
    const filePath = '.data/' + name + '.json';
    if (fs.existsSync(filePath)) {
      try {
        const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        fs.writeFileSync(
          filePath,
          JSON.stringify(rows.filter((r) => !String(r._id || '').startsWith(prefix) && !String(r.evaluationId || '').startsWith(prefix)))
        );
      } catch {}
    }
  }
});

// Helper to build 33 criteria with specified values
function buildCompleteCriteria(optionIndex = 'max') {
  return ALL_CRITERIA.map(c => {
    const targetIdx = optionIndex === 'max'
      ? c.options.length - 1
      : optionIndex === 'min'
        ? 0
        : Math.min(Number(optionIndex) || 0, c.options.length - 1);
    const opt = c.options[targetIdx];
    return {
      id: c.id,
      name: c.name,
      section: c.section,
      points: opt.points,
      selectedOption: opt.label,
      comment: `Unit test remark for ${c.id}`
    };
  });
}

// ==========================================
// 1. Rubric Matrix & Score Calculations
// ==========================================
test('Rubric matrix defines exactly 33 criteria (24 Section A, 9 Section B)', () => {
  assert.equal(ALL_CRITERIA.length, 33);
  assert.equal(SECTION_A_CRITERIA.length, 24);
  assert.equal(SECTION_B_CRITERIA.length, 9);
});

test('Client preview score calculation matches backend scoring logic', () => {
  // Lowest options: all 0 points
  const minCriteria = buildCompleteCriteria('min');
  const minPreview = calculateScorePreview(minCriteria);
  assert.equal(minPreview.totalScore, 0);
  assert.equal(minPreview.starsCount, 0);
  assert.ok(minPreview.ratingLabel.includes('0 Stars') || minPreview.ratingLabel.includes('Not Rated'));

  // Highest options: max points (3.50 + 1.50 = 5.00)
  const maxCriteria = buildCompleteCriteria('max');
  const maxPreview = calculateScorePreview(maxCriteria);
  assert.equal(maxPreview.sectionAScore, 3.50);
  assert.equal(maxPreview.sectionBScore, 1.50);
  assert.equal(maxPreview.totalScore, 5.00);
  assert.equal(maxPreview.starsCount, 5);
  assert.ok(maxPreview.ratingLabel.includes('5 Stars') || maxPreview.ratingLabel.includes('Outstanding'));

  // Backend recomputeScores matches client preview exactly
  const backendResult = recomputeScores(maxCriteria);
  assert.equal(backendResult.sectionAScore, maxPreview.sectionAScore);
  assert.equal(backendResult.sectionBScore, maxPreview.sectionBScore);
  assert.equal(backendResult.totalScore, maxPreview.totalScore);
  assert.equal(backendResult.starsCount, maxPreview.starsCount);
  assert.equal(backendResult.ratingLabel, maxPreview.ratingLabel);
});

// ==========================================
// 2. Draft Storage Subsystem (assessorDrafts)
// ==========================================
test('Draft storage saves, retrieves, and discards evaluation drafts', () => {
  saveStoredDrafts({});
  assert.equal(Object.keys(getStoredDrafts()).length, 0);

  const criteria = buildCompleteCriteria('max');
  const selections = {};
  for (const c of criteria) {
    selections[c.id] = {
      section: c.section,
      id: c.id,
      name: c.name,
      selectedOption: c.selectedOption,
      points: c.points,
      isAnswered: true,
      comment: c.comment
    };
  }

  const saved = saveDraft({
    companyName: 'Phase E Transport Sdn Bhd',
    deviceModel: 'TK-400',
    packageName: 'Commercial Telematics',
    assessorName: 'Test Assessor',
    assessorId: 'TSA 1001',
    formState: {
      metadata: {
        companyName: 'Phase E Transport Sdn Bhd',
        deviceModel: 'TK-400',
        packageName: 'Commercial Telematics',
        assessorName: 'Test Assessor',
        assessorId: 'TSA 1001',
        assessmentDate: '2026-10-12',
        resubmitRecordId: null
      },
      selections,
      answeredCriteria: { trip_history: true },
      scores: {
        sectionAScore: 3.5,
        sectionBScore: 1.5,
        totalScore: 5.0,
        starRating: 5.0,
        starsCount: 5,
        ratingLabel: '5 Stars - Outstanding'
      }
    }
  });

  assert.ok(saved.draftId);
  assert.equal(saved.companyName, 'Phase E Transport Sdn Bhd');
  assert.equal(getActiveDraftId(), saved.draftId);

  const stored = getStoredDrafts();
  assert.ok(stored[saved.draftId]);
  assert.equal(stored[saved.draftId].deviceModel, 'TK-400');

  discardDraft(saved.draftId);
  assert.equal(getStoredDrafts()[saved.draftId], undefined);
  assert.equal(getActiveDraftId(), null);
});

test('Draft storage enforces MAX_DRAFTS hard limit (maximum 3 concurrent drafts)', () => {
  saveStoredDrafts({});

  for (let i = 1; i <= 3; i++) {
    saveDraft({
      companyName: `Company ${i}`,
      deviceModel: `Model ${i}`,
      packageName: 'Standard',
      assessorName: 'Assessor',
      assessorId: 'TSA 1001',
      formState: {
        metadata: {
          companyName: `Company ${i}`,
          deviceModel: `Model ${i}`,
          packageName: 'Standard',
          assessorName: 'Assessor',
          assessorId: 'TSA 1001',
          assessmentDate: '2026-10-12',
          resubmitRecordId: null
        },
        selections: {},
        answeredCriteria: {},
        scores: {
          sectionAScore: 0,
          sectionBScore: 0,
          totalScore: 0,
          starRating: 0,
          starsCount: 0,
          ratingLabel: 'Not Rated'
        }
      }
    });
  }

  assert.equal(Object.keys(getStoredDrafts()).length, MAX_DRAFTS);

  // Attempting to create a 4th new draft must throw
  assert.throws(
    () => {
      saveDraft({
        companyName: 'Company 4',
        deviceModel: 'Model 4',
        packageName: 'Standard',
        assessorName: 'Assessor',
        assessorId: 'TSA 1001',
        formState: {
          metadata: {
            companyName: 'Company 4',
            deviceModel: 'Model 4',
            packageName: 'Standard',
            assessorName: 'Assessor',
            assessorId: 'TSA 1001',
            assessmentDate: '2026-10-12',
            resubmitRecordId: null
          },
          selections: {},
          answeredCriteria: {},
          scores: {
            sectionAScore: 0,
            sectionBScore: 0,
            totalScore: 0,
            starRating: 0,
            starsCount: 0,
            ratingLabel: 'Not Rated'
          }
        }
      });
    },
    (err) => err.message.includes(`Maximum of ${MAX_DRAFTS} drafts reached`)
  );
});

// ==========================================
// 3. Assessor Role & Security Invariants
// ==========================================
test('save-evaluation blocks Manager and Vendor with 403', async () => {
  const managerToken = session('manager');
  const resManager = await saveEvaluationHandler({
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({
      companyName: 'Denied Manager Corp',
      deviceModel: 'TS-99',
      assessorName: 'Unit Phase C Manager',
      breakdown: buildCompleteCriteria('max')
    })
  });
  assert.equal(resManager.statusCode, 403);
  const bodyManager = JSON.parse(resManager.body);
  assert.ok(bodyManager.error.includes('Forbidden') || bodyManager.error.includes('Assessors'));

  const vendorToken = session('vendor');
  const resVendor = await saveEvaluationHandler({
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      companyName: 'Denied Vendor Corp',
      deviceModel: 'TS-99',
      assessorName: 'Vendor User',
      breakdown: buildCompleteCriteria('max')
    })
  });
  assert.equal(resVendor.statusCode, 403);
});

test('save-evaluation validates Assessor ID identity match', async () => {
  const assessorToken = session('assessor', 'Assessor Ali', 'TSA 1001');
  const resMismatched = await saveEvaluationHandler({
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${assessorToken}` },
    body: JSON.stringify({
      companyName: 'Mismatched Corp',
      deviceModel: 'TS-99',
      assessorName: 'Assessor Ali',
      assessorId: 'TSA 9999', // Mismatched with authenticated TSA 1001
      breakdown: buildCompleteCriteria('max')
    })
  });
  assert.equal(resMismatched.statusCode, 403);
});

// ==========================================
// 4. Submission & Immutable Versioning (v1, v2)
// ==========================================
test('Full evaluation submission creates v1 and transitions to pending_review', async () => {
  const evalId = prefix + 'eval-submit-1';
  const connection = await connectToDatabase();
  await connection.insertEvaluation({
    _id: evalId,
    companyName: 'Phase E Logistics',
    deviceModel: 'GPS-Tracker-v4',
    officeAddress: '123 Logistics Way',
    state: 'Selangor',
    status: 'scheduled',
    assignedAssessor: 'Test Assessor',
    assignedAssessorId: 'TSA 1001',
    assessorId: 'TSA 1001',
    createdAt: new Date().toISOString()
  });

  const assessorToken = session('assessor', 'Test Assessor', 'TSA 1001');
  const criteria = buildCompleteCriteria('max');
  const preview = calculateScorePreview(criteria);

  const resSubmit = await saveEvaluationHandler({
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${assessorToken}` },
    body: JSON.stringify({
      companyName: 'Phase E Logistics',
      deviceModel: 'GPS-Tracker-v4',
      officeAddress: '123 Logistics Way',
      state: 'Selangor',
      assessorName: 'Test Assessor',
      assessorId: 'TSA 1001',
      registrationId: evalId,
      submitEvaluation: true,
      sectionAScore: preview.sectionAScore,
      sectionBScore: preview.sectionBScore,
      totalScore: preview.totalScore,
      breakdown: criteria
    })
  });

  assert.equal(resSubmit.statusCode, 200, `Expected 200 but got: ${resSubmit.body}`);
  const submitBody = JSON.parse(resSubmit.body);
  assert.ok(['submitted', 'pending_review'].includes(submitBody.status));
  assert.equal(submitBody.currentVersion, 1);
  assert.equal(submitBody.verifiedScores.totalScore, 5.00);

  // Verify stored record and version snapshot
  const updatedDoc = await connection.getEvaluationById(evalId);
  assert.ok(['submitted', 'pending_review'].includes(updatedDoc.status));
  assert.equal(updatedDoc.currentVersion, 1);

  const versions = await connection.getAssessmentVersions(evalId);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].versionNumber, 1);
  assert.equal(versions[0].scores?.totalScore || versions[0].totalScore, 5.00);
});

test('Revision resubmission creates immutable v2 preserving v1 snapshot', async () => {
  const evalId = prefix + 'eval-revision-1';
  const connection = await connectToDatabase();

  const v1Criteria = buildCompleteCriteria('max'); // 5.00 points
  const v1Date = new Date(Date.now() - 3600000).toISOString();

  await connection.insertEvaluation({
    _id: evalId,
    companyName: 'Phase E Revision Fleet',
    deviceModel: 'Telematics-X',
    officeAddress: '456 Fleet Road',
    state: 'Johor',
    status: 'revision_requested',
    currentVersion: 1,
    totalScore: 5.00,
    sectionAScore: 3.50,
    sectionBScore: 1.50,
    assessorName: 'Test Assessor',
    assessorId: 'TSA 1001',
    breakdown: v1Criteria,
    statusHistory: [
      {
        status: 'revision_requested',
        changedBy: 'Manager Reviewer',
        changedAt: new Date().toISOString(),
        reason: 'Section B remarks lack adequate photographic reference.'
      }
    ]
  });

  // Verify Manager rejection reason is readable
  const lookupRes = await lookupEvaluationHandler({
    httpMethod: 'GET',
    headers: { Authorization: `Bearer ${session('assessor')}` },
    queryStringParameters: { id: evalId }
  });
  assert.equal(lookupRes.statusCode, 200);
  const detail = JSON.parse(lookupRes.body).data[0];
  assert.equal(detail.status, 'revision_requested');
  assert.ok(detail.statusHistory.some(h => h.reason?.includes('photographic reference')));

  // Assessor modifies criteria to min and resubmits
  const v2Criteria = buildCompleteCriteria('min');
  const v2Scores = calculateScorePreview(v2Criteria);
  const assessorToken = session('assessor', 'Test Assessor', 'TSA 1001');

  const resResubmit = await saveEvaluationHandler({
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${assessorToken}` },
    body: JSON.stringify({
      companyName: 'Phase E Revision Fleet',
      deviceModel: 'Telematics-X',
      officeAddress: '456 Fleet Road',
      state: 'Johor',
      assessorName: 'Test Assessor',
      assessorId: 'TSA 1001',
      resubmitRecordId: evalId,
      submitEvaluation: true,
      sectionAScore: v2Scores.sectionAScore,
      sectionBScore: v2Scores.sectionBScore,
      totalScore: v2Scores.totalScore,
      breakdown: v2Criteria
    })
  });

  assert.equal(resResubmit.statusCode, 200, `Expected 200 but got: ${resResubmit.body}`);
  const resubmitBody = JSON.parse(resResubmit.body);
  assert.ok(['submitted', 'pending_review'].includes(resubmitBody.status));
  assert.equal(resubmitBody.currentVersion, 2);

  // Check database: v1 must be preserved intact and v2 appended
  const resubmittedDoc = await connection.getEvaluationById(evalId);
  assert.equal(resubmittedDoc.currentVersion, 2);

  const versions = await connection.getAssessmentVersions(evalId);
  assert.equal(versions.length, 2);

  // Invariant: v1 was preserved in version history
  const v1 = versions.find(v => v.versionNumber === 1);
  const v2 = versions.find(v => v.versionNumber === 2);
  assert.ok(v1, 'v1 snapshot must exist');
  assert.ok(v2, 'v2 snapshot must exist');
  assert.equal(v1.scores?.totalScore ?? v1.totalScore, 5.00);
  assert.equal(v2.scores?.totalScore ?? v2.totalScore, 0.00);
});

// ==========================================
// 5. Peer Review Workflow & Commentary
// ==========================================
test('Peer Review commentary appends comment to peer evaluation', async () => {
  const evalId = prefix + 'peer-eval-1';
  const connection = await connectToDatabase();
  await connection.insertEvaluation({
    _id: evalId,
    companyName: 'Phase E Peer Fleet',
    deviceModel: 'Peer-Box-1',
    status: 'pending_review',
    assessorName: 'Other Assessor',
    assessorId: 'TSA 2002',
    breakdown: buildCompleteCriteria('max'),
    comments: []
  });

  // Assessor TSA 1001 comments on Peer evaluation assigned to TSA 2002
  const tokenAssessor1 = session('assessor', 'Reviewer Assessor', 'TSA 1001');
  const commentRes = await addCommentHandler({
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${tokenAssessor1}` },
    body: JSON.stringify({
      evaluationId: evalId,
      text: 'Verified Section A item 4 antenna specification matches manufacturer sheet.'
    })
  });

  assert.equal(commentRes.statusCode, 200, `Expected 200 but got: ${commentRes.body}`);
  const commentBody = JSON.parse(commentRes.body);
  assert.equal(commentBody.success, true);

  // Verify comment persisted in document
  const doc = await connection.getEvaluationById(evalId);
  assert.equal(doc.comments.length, 1);
  assert.equal(doc.comments[0].authorName || doc.comments[0].author, 'Reviewer Assessor');
  assert.equal(doc.comments[0].authorRole || doc.comments[0].role, 'assessor');
  assert.ok(doc.comments[0].text.includes('antenna specification'));
});

// ==========================================
// 6. React Assessor Services (API abstraction)
// ==========================================
test('Assessor submission service calls /save-evaluation with payload', async () => {
  let capturedUrl = '';
  let capturedBody = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(options?.body || '{}'));
    return response({
      success: true,
      id: 'mock-eval-1',
      status: 'pending_review',
      currentVersion: 1
    });
  };

  const payload = {
    companyName: 'Test Corp',
    deviceModel: 'Device 1',
    packageName: 'Package 1',
    assessorName: 'Assessor 1',
    assessorId: 'TSA 1001',
    assessmentDate: '2026-10-12',
    breakdown: buildCompleteCriteria('max')
  };

  const res = await submitAssessment(payload);
  assert.equal(res.success, true);
  assert.ok(capturedUrl.includes('/save-evaluation'));
  assert.equal(capturedBody.companyName, 'Test Corp');
});

test('Assessor resubmit service requires resubmitRecordId', async () => {
  await assert.rejects(
    () => resubmitAssessment({}),
    (err) => err.message.includes('valid record ID is required')
  );
});
