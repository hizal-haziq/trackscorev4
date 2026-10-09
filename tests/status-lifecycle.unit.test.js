import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as approveHandler } from '../netlify/functions/approve-evaluation.js';
import { handler as updateHandler } from '../netlify/functions/update-evaluation.js';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR } from '../netlify/functions/auth.js';
import { connectToDatabase, buildMongoIdFilter, COLLECTION_NAME, closeDatabaseConnection } from '../netlify/functions/db.js';
import {
  recomputeScores,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA
} from '../netlify/functions/rubric.js';

describe('Status Lifecycle & History Tracking Unit Tests', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'TSA 1001', name: 'Assessor' });

  let testEvalId;

  async function fetchEval(id) {
    const connection = await connectToDatabase();
    if (connection.isMongoAtlas) {
      return connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(id));
    }
    return connection.getEvaluationById(id);
  }

  before(async () => {
    const timestamp = Date.now();
    const breakdown = [
      ...SECTION_A_CRITERIA,
      ...SECTION_B_CRITERIA
    ].map(criteria => ({
      id: criteria.id,
      selectedOption: criteria.options[0].label,
      points: criteria.options[0].points
    }));
    const recomputed = recomputeScores(breakdown);
    const payload = {
      companyName: `Lifecycle Test Fleet ${timestamp}`,
      deviceModel: `TG-900-${timestamp}`,
      packageName: 'Premium Enterprise',
      assessorName: `Assessor-${timestamp}`,
      assessorId: 'TSA 1001',
      assessmentDate: '2026-03-15',
      breakdown,
      sectionAScore: recomputed.sectionAScore,
      sectionBScore: recomputed.sectionBScore,
      totalScore: recomputed.totalScore,
      starRating: recomputed.starRating
    };

    const res = await saveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify(payload)
    }, {});

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    testEvalId = body.id;
  });

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        if (testEvalId) {
          await conn.db.collection(COLLECTION_NAME).deleteOne(buildMongoIdFilter(testEvalId));
        }
        await conn.db.collection(COLLECTION_NAME).deleteMany({ companyName: 'Ban Soon Sdn Bhd' });
      } else {
        if (testEvalId) {
          conn.deleteEvaluation(testEvalId);
        }
      }
    } catch {}
    await closeDatabaseConnection();
  });

  it('should reject invalid status values in update-evaluation.js with 400 Bad Request', async () => {
    const event = {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testEvalId,
        status: 'bogus_status'
      })
    };

    const res = await updateHandler(event, {});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /Invalid status/i);
  });

  it('should allow valid status progression and append to statusHistory', async () => {
    const connection = await connectToDatabase();
    await connection.updateEvaluation(testEvalId, { status: 'submitted' });
    const event = {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testEvalId,
        status: 'pending_review'
      })
    };

    const res = await updateHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'pending_review');

    // Verify statusHistory
    const updated = await fetchEval(testEvalId);
    assert.equal(updated.status, 'pending_review');
    assert.ok(Array.isArray(updated.statusHistory));
    assert.ok(updated.statusHistory.length >= 1);
    const latest = updated.statusHistory[updated.statusHistory.length - 1];
    assert.equal(latest.status, 'pending_review');
    assert.ok(latest.changedAt);
    assert.ok(latest.changedBy);
  });

  it('should allow rejection from pending_review status and track history with reason', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testEvalId,
        action: 'reject',
        reason: 'Specification documents incomplete'
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'rejected');

    const updated = await fetchEval(testEvalId);
    assert.equal(updated.status, 'rejected');
    const latest = updated.statusHistory[updated.statusHistory.length - 1];
    assert.equal(latest.status, 'rejected');
    assert.equal(latest.reason, 'Specification documents incomplete');
  });

  it('should reject attempting to reject an evaluation not in pending_review or pending_review', async () => {
    // Current status is 'rejected'
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testEvalId,
        action: 'reject',
        reason: 'Cannot reject again'
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /Rejection is only permitted/i);
  });

  it('requires an Assessor resubmission and a new version after rejection', async () => {
    const blocked = await updateHandler({ httpMethod: 'PUT', headers: { Authorization: `Bearer ${managerToken}` }, body: JSON.stringify({ id: testEvalId, status: 'submitted' }) }, {});
    assert.equal(blocked.statusCode, 403);
    const previous = await fetchEval(testEvalId);
    assert.equal(previous.status, 'rejected');
    const submitted = await saveHandler({ httpMethod: 'POST', headers: { Authorization: `Bearer ${assessorToken}` }, body: JSON.stringify({ ...previous, _id: undefined, id: undefined, resubmitRecordId: testEvalId, assessorId: 'TSA 1001', assessorName: 'Assessor', breakdown: previous.breakdown }) }, {});
    assert.equal(submitted.statusCode, 200, submitted.body);
    const updated = await fetchEval(testEvalId);
    assert.equal(updated.status, 'submitted');
    assert.equal(updated.currentVersion, previous.currentVersion + 1);
  });

  it('blocks direct completion and keeps completed records immutable', async () => {
    // Advance to completed
    const event = {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testEvalId,
        status: 'completed'
      })
    };

    const res = await updateHandler(event, {});
    assert.equal(res.statusCode, 400);
    const connection = await connectToDatabase();
    await connection.updateEvaluation(testEvalId, { status: 'completed' });

    // Attempting to edit any fields on completed record should be blocked
    const editAttempt = {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testEvalId,
        deviceModel: 'Tampered-Model'
      })
    };

    const editRes = await updateHandler(editAttempt, {});
    assert.equal(editRes.statusCode, 403);
    const editBody = JSON.parse(editRes.body);
    assert.match(editBody.error, /locked and cannot be edited/i);
  });
});
