import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as approveHandler } from '../netlify/functions/approve-evaluation.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR } from '../netlify/functions/auth.js';
import { connectToDatabase, closeDatabaseConnection, COLLECTION_NAME, buildMongoIdFilter } from '../netlify/functions/db.js';

describe('Approval & Review Workflow Unit Tests', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Assessor' });
  const testRecordId = 'test-eval-approval-workflow';

  before(async () => {
    const conn = await connectToDatabase();
    const doc = {
      _id: testRecordId,
      companyName: 'Approval Test Co',
      deviceModel: 'Test Device',
      status: 'pending_review',
      createdAt: new Date().toISOString()
    };
    if (conn.isMongoAtlas) {
      await conn.db.collection(COLLECTION_NAME).updateOne(
        { _id: testRecordId },
        { $set: doc },
        { upsert: true }
      );
    } else {
      const existing = await conn.getEvaluationById(testRecordId);
      if (existing) await conn.updateEvaluation(testRecordId, doc);
      else await conn.insertEvaluation(doc);
    }
  });

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_NAME).deleteOne(buildMongoIdFilter(testRecordId));
      } else {
        await conn.deleteEvaluation(testRecordId);
      }
    } catch {}
    await closeDatabaseConnection();
  });

  it('should reject Assessor role attempting to approve or reject with 403 Forbidden', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        id: testRecordId,
        action: 'approve'
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.error, /manager/i);
  });

  it('should reject invalid action with 400 Bad Request', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testRecordId,
        action: 'invalid_action'
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /Use approve or reject/i);
  });

  it('should reject rejection action when reason is missing with 400 Bad Request', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: testRecordId,
        action: 'reject',
        reason: '   ' // empty whitespace
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /Rejection reason is required/i);
  });
});
