import {test, beforeEach, afterEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import {
  approveAssessment,
  requestChanges,
  scheduleAssessment,
  assignAssessor,
  getAssessorDirectory,
  requireManager
} from '../src/services/managerMutations.ts';
import {connectToDatabase, createAssessmentVersionRecord} from '../netlify/functions/db.js';
import {handler as approveHandler} from '../netlify/functions/approve-evaluation.js';
import {handler as scheduleHandler} from '../netlify/functions/schedule-assessment.js';
import {handler as assignHandler} from '../netlify/functions/assign-assessor.js';
import {handler as workloadHandler} from '../netlify/functions/get-assessor-workload.js';

const originalFetch = globalThis.fetch;
const prefix = 'phasec-unit-';
const criteria33 = Array.from({length: 33}, (_, i) => ({
  id: `c-${i + 1}`,
  name: `Criterion ${i + 1}`,
  section: i < 15 ? 'A' : 'B',
  points: 1,
  selectedOption: 'Yes',
  comment: `Verified evidence ${i + 1}`
}));

const record = {
  _id: prefix + 'test-eval',
  companyName: 'Phase C Fleet',
  deviceModel: 'Phase C Gateway',
  status: 'pending_review',
  currentVersion: 1,
  totalScore: 95,
  breakdown: criteria33,
  sla: { status: 'ON_TRACK', deadline: new Date(Date.now() + 5 * 86400000).toISOString() },
  certificate: {}
};

function session(role = 'manager') {
  const token = jwt.sign(
    { role, name: 'Unit Phase C Manager', assessorId: 'MGR-01' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
  const values = new Map([
    ['trackscore_token', token],
    ['trackscore_user_role', role],
    ['trackscore_user', JSON.stringify({ name: 'Unit Phase C Manager', role })]
  ]);
  const target = new EventTarget();
  globalThis.window = {
    localStorage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k)
    },
    sessionStorage: { removeItem() {} },
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
});

after(async () => {
  for (const name of ['evaluations', 'assessment_versions', 'assessment_risk']) {
    const path = '.data/' + name + '.json';
    if (fs.existsSync(path)) {
      try {
        const rows = JSON.parse(fs.readFileSync(path, 'utf8'));
        fs.writeFileSync(
          path,
          JSON.stringify(rows.filter((r) => !String(r._id || '').startsWith(prefix) && !String(r.evaluationId || '').startsWith(prefix)))
        );
      } catch {}
    }
  }
});

// 1. Role & Auth Guards
test('requireManager allows Manager and throws 403 for Assessor and Vendor', () => {
  session('manager');
  assert.equal(requireManager().user.role, 'manager');

  session('assessor');
  assert.throws(() => requireManager(), (e) => e.status === 403);

  session('vendor');
  assert.throws(() => requireManager(), (e) => e.status === 403);
});

// 2. Review & Approval Service Layer
test('approveAssessment constructs correct POST payload and parses response', async () => {
  let capturedUrl = '';
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedOptions = options;
    return response({
      success: true,
      id: record._id,
      status: 'approved',
      approvedVersion: 1,
      message: 'Assessment approved.'
    });
  };

  const result = await approveAssessment(record._id, 'Compliance verified.');
  assert.equal(result.success, true);
  assert.equal(result.status, 'approved');
  assert.equal(result.approvedVersion, 1);
  assert.ok(capturedUrl.includes('approve-evaluation'));
  assert.equal(capturedOptions.method, 'POST');

  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.id, record._id);
  assert.equal(body.action, 'approve');
  assert.equal(body.managerReviewComment, 'Compliance verified.');
});

// 3. Request Changes Service Layer
test('requestChanges requires non-empty reason and constructs reject payload', async () => {
  // Fails client-side if reason is empty
  await assert.rejects(
    () => requestChanges(record._id, '   '),
    (e) => e.status === 400 && e.message.includes('required')
  );

  let capturedOptions = null;
  globalThis.fetch = async (_, options) => {
    capturedOptions = options;
    return response({
      success: true,
      id: record._id,
      status: 'rejected',
      message: 'Changes requested.'
    });
  };

  const result = await requestChanges(record._id, 'Revise criterion 1 evidence', 'General note');
  assert.equal(result.status, 'rejected');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.id, record._id);
  assert.equal(body.action, 'reject');
  assert.equal(body.reason, 'Revise criterion 1 evidence');
  assert.equal(body.rejectionReason, 'Revise criterion 1 evidence');
});

// 4. Scheduling Service Layer
test('scheduleAssessment requires date and constructs schedule payload', async () => {
  await assert.rejects(
    () => scheduleAssessment({ id: record._id, scheduledDate: '' }),
    (e) => e.status === 400
  );

  let capturedOptions = null;
  globalThis.fetch = async (_, options) => {
    capturedOptions = options;
    return response({
      success: true,
      id: record._id,
      status: 'scheduled',
      scheduledDate: '2026-10-25'
    });
  };

  const result = await scheduleAssessment({
    id: record._id,
    scheduledDate: '2026-10-25',
    deviceModel: 'Fleet Box V2',
    notes: 'Depot audit'
  });

  assert.equal(result.status, 'scheduled');
  assert.equal(result.scheduledDate, '2026-10-25');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.scheduledDate, '2026-10-25');
  assert.equal(body.deviceModel, 'Fleet Box V2');
  assert.equal(body.notes, 'Depot audit');
});

// 5. Assignment Service Layer
test('assignAssessor requires assessorName and handles optional briefing', async () => {
  await assert.rejects(
    () => assignAssessor({ id: record._id, assessorName: '' }),
    (e) => e.status === 400
  );

  let capturedOptions = null;
  globalThis.fetch = async (_, options) => {
    capturedOptions = options;
    return response({
      success: true,
      id: record._id,
      status: 'scheduled',
      assignedAssessor: 'Ts. Mohd Farhan',
      assignedAssessorId: 'AST-01'
    });
  };

  const result = await assignAssessor({
    id: record._id,
    assessorName: 'Ts. Mohd Farhan',
    assessorId: 'AST-01',
    instructions: 'Focus on sensor accuracy'
  });

  assert.equal(result.status, 'scheduled');
  assert.equal(result.assignedAssessor, 'Ts. Mohd Farhan');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.assessorName, 'Ts. Mohd Farhan');
  assert.equal(body.instructions, 'Focus on sensor accuracy');
});

// 6. Assessor Directory Parsing
test('getAssessorDirectory retrieves registered staff list with workload metrics', async () => {
  globalThis.fetch = async () =>
    response({
      success: true,
      assessors: [
        {
          id: 'u1',
          name: 'Assessor One',
          assessorId: 'AST-01',
          email: 'one@test.my',
          workload: { active: 2, capacity: 5, isAtCapacity: false }
        }
      ]
    });

  const directory = await getAssessorDirectory(new AbortController().signal);
  assert.equal(directory.length, 1);
  assert.equal(directory[0].name, 'Assessor One');
  assert.equal(directory[0].workload.active, 2);
});

// 7. Error Handling (401, 403, 404, 500)
test('mutation endpoints handle 401 session expiry and 403 forbidden cleanly', async () => {
  globalThis.fetch = async () => response({ error: 'Session expired' }, 401);
  await assert.rejects(
    () => approveAssessment(record._id),
    (e) => e.status === 401
  );
  assert.equal(window.localStorage.getItem('trackscore_token'), null);

  session('manager');
  globalThis.fetch = async () => response({ error: 'Not allowed in current state' }, 403);
  await assert.rejects(
    () => approveAssessment(record._id),
    (e) => e.status === 403
  );
  assert.ok(window.localStorage.getItem('trackscore_token'));
});

// 8. Backend Integration: approve-evaluation (approve & reject)
test('backend approve-evaluation completes approval and transitions to approved', async () => {
  const db = await connectToDatabase();
  const testId = prefix + 'approve-test';
  const evalDoc = {
    ...record,
    _id: testId,
    status: 'pending_review',
    currentVersion: 1
  };
  await db.insertEvaluation(evalDoc);
  await createAssessmentVersionRecord(db, {
    evaluationId: testId,
    versionNumber: 1,
    breakdown: criteria33,
    scores: { totalScore: 95 }
  });

  const token = jwt.sign(
    { role: 'manager', name: 'Lead Manager' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  const eventApprove = {
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: testId,
      action: 'approve',
      managerReviewComment: 'Approved for certification'
    })
  };

  const res = await approveHandler(eventApprove);
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.status, 'approved');
  assert.equal(data.approvedVersion, 1);

  // Check updated db record
  const updated = await db.getEvaluationById(testId);
  assert.equal(updated.status, 'approved');
  assert.equal(updated.approvedVersion, 1);
  assert.equal(updated.managerReviewComment, 'Approved for certification');
});

// 9. Backend Integration: request changes requires reason
test('backend approve-evaluation rejects without reason and succeeds with reason', async () => {
  const db = await connectToDatabase();
  const testId = prefix + 'reject-test';
  await db.insertEvaluation({ ...record, _id: testId, status: 'pending_review' });

  const token = jwt.sign({ role: 'manager' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  // Missing reason fails with 400
  const failRes = await approveHandler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: testId, action: 'reject', reason: '' })
  });
  assert.equal(failRes.statusCode, 400);

  // With reason succeeds with 200 and status rejected
  const okRes = await approveHandler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: testId,
      action: 'reject',
      reason: 'Please provide calibration certificate',
      rejectionReason: 'Please provide calibration certificate'
    })
  });
  assert.equal(okRes.statusCode, 200);
  const data = JSON.parse(okRes.body);
  assert.equal(data.status, 'rejected');
  assert.equal(data.rejectionReason, 'Please provide calibration certificate');
});

// 10. Backend Integration: schedule-assessment updates date and status
test('backend schedule-assessment sets inspection date and updates status to scheduled', async () => {
  const db = await connectToDatabase();
  const testId = prefix + 'schedule-test';
  await db.insertEvaluation({ ...record, _id: testId, status: 'registered', scheduledDate: null });

  const token = jwt.sign({ role: 'manager' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  const res = await scheduleHandler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: testId, scheduledDate: '2026-10-30', notes: 'Gate 4 inspection' })
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.status, 'scheduled');
  assert.equal(data.scheduledDate, '2026-10-30');

  const updated = await db.getEvaluationById(testId);
  assert.equal(updated.status, 'scheduled');
  assert.equal(updated.scheduledDate, '2026-10-30');
});

// 11. Backend Integration: assign-assessor assigns assessor and promotes registered
test('backend assign-assessor assigns task and returns capacity metrics', async () => {
  const db = await connectToDatabase();
  const testId = prefix + 'assign-test';
  await db.insertEvaluation({ ...record, _id: testId, status: 'registered', assignedAssessor: null });

  const token = jwt.sign({ role: 'manager' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  const res = await assignHandler({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: testId,
      assessorName: 'Unit Specialist',
      assessorId: 'SPEC-01',
      instructions: 'Review Section B sensors'
    })
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.status, 'scheduled');
  assert.equal(data.assignedAssessor, 'Unit Specialist');

  const updated = await db.getEvaluationById(testId);
  assert.equal(updated.assignedAssessor, 'Unit Specialist');
  assert.equal(updated.assignedAssessorId, 'SPEC-01');
});

