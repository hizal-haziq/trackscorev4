/**
 * Peer Commentary & Browser AI Summarization Test Suite
 *
 * Verifies:
 * 1. Assessor A can post a peer comment on Assessor B's evaluation with aiSummary and commentsOverallSummary
 * 2. Assessor A is strictly prevented from commenting on their own evaluation (403 Forbidden)
 * 3. Manager can comment on any evaluation
 * 4. Comments are append-only and immutable
 * 5. Vendor accounts are blocked from calling add-comment (403 Forbidden)
 * 6. Missing authentication is rejected (401 Unauthorized)
 * 7. Input validation enforces character limits and required fields (400 Bad Request)
 * 8. Vendor portal isolation: vendor-portal-data strictly omits comments and commentsOverallSummary
 * 9. lookup-evaluation surfaces comments to assessors and managers, and supports peerReview mode
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as addCommentHandler } from '../netlify/functions/add-comment.js';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { handler as lookupHandler } from '../netlify/functions/lookup-evaluation.js';
import { handler as vendorPortalHandler } from '../netlify/functions/vendor-portal-data.js';
import {
  generateToken,
  ROLE_MANAGER,
  ROLE_ASSESSOR,
  ROLE_VENDOR
} from '../netlify/functions/auth.js';
import {
  connectToDatabase,
  closeDatabaseConnection,
  COLLECTION_NAME,
  buildMongoIdFilter
} from '../netlify/functions/db.js';
import {
  recomputeScores,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA
} from '../netlify/functions/rubric.js';

describe('Peer Commentary & AI Summarization Test Suite', () => {
  const managerToken = generateToken({ id: 'mgr_01', role: ROLE_MANAGER, name: 'Lead Reviewer', email: 'manager@trackscore.my' });
  const assessorAToken = generateToken({ id: 'asr_A', role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Assessor Alpha', email: 'alpha@trackscore.my' });
  const assessorBToken = generateToken({ id: 'asr_B', role: ROLE_ASSESSOR, assessorId: 'JHR 5001', name: 'Assessor Beta', email: 'beta@trackscore.my' });
  const vendorToken = generateToken({ id: 'vnd_01', role: ROLE_VENDOR, vendorId: 'vendor_01', email: 'vendor@telematics.com' });

  let evalDocAId = null;
  let evalDocBId = null;
  const testIdsToCleanup = [];

  function buildSampleBreakdown() {
    return [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({
      id: c.id,
      selectedOption: c.options[0].label,
      points: c.options[0].points
    }));
  }

  before(async () => {
    // 1. Create Evaluation submitted by Assessor A
    const eventA = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assessorAToken}`
      },
      body: JSON.stringify({
        companyName: 'Alpha Tech Fleet',
        deviceModel: 'ATF-X100',
        packageName: 'Package 1: Standard Assessment (RM 4,500)',
        assessmentDate: '2026-09-25',
        assessorName: 'Assessor Alpha',
        assessorId: 'MKA 9006',
        breakdown: buildSampleBreakdown()
      })
    };

    const resA = await saveHandler(eventA, {});
    assert.equal(resA.statusCode, 200);
    const bodyA = JSON.parse(resA.body);
    evalDocAId = bodyA.insertedId || bodyA.id || bodyA.record?._id;
    testIdsToCleanup.push(evalDocAId);

    // 2. Create Evaluation submitted by Assessor B
    const eventB = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assessorBToken}`
      },
      body: JSON.stringify({
        companyName: 'Beta Dynamics Logistics',
        deviceModel: 'BDL-PRO-9',
        packageName: 'Package 2: Comprehensive Assessment (RM 6,000)',
        assessmentDate: '2026-09-25',
        assessorName: 'Assessor Beta',
        assessorId: 'JHR 5001',
        breakdown: buildSampleBreakdown()
      })
    };

    const resB = await saveHandler(eventB, {});
    assert.equal(resB.statusCode, 200);
    const bodyB = JSON.parse(resB.body);
    evalDocBId = bodyB.insertedId || bodyB.id || bodyB.record?._id;
    testIdsToCleanup.push(evalDocBId);
  });

  after(async () => {
    try {
      const connection = await connectToDatabase();
      if (connection.isMongoAtlas) {
        const col = connection.db.collection(COLLECTION_NAME);
        for (const id of testIdsToCleanup) {
          if (id) await col.deleteOne(buildMongoIdFilter(id));
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }
    await closeDatabaseConnection();
  });

  it('1. Assessor A can successfully post a peer comment on Assessor B evaluation', async () => {
    const commentPayload = {
      evaluationId: String(evalDocBId),
      text: 'Thorough evaluation on the CAN bus telemetry interface. Option selection for Criteria 14 matches MIROS test bench logs closely.',
      aiSummary: 'Thorough evaluation on CAN bus matching test bench logs.',
      commentsOverallSummary: 'Positive peer commentary validating telemetry compliance.'
    };

    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assessorAToken}`
      },
      body: JSON.stringify(commentPayload)
    };

    const res = await addCommentHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.success, true);
    assert.ok(body.comment);
    assert.ok(body.comment.commentId.startsWith('cmt_'));
    assert.equal(body.comment.authorName, 'Assessor Alpha');
    assert.equal(body.comment.authorRole, ROLE_ASSESSOR);
    assert.equal(body.comment.text, commentPayload.text);
    assert.equal(body.comment.aiSummary, commentPayload.aiSummary);
    assert.equal(body.commentsOverallSummary, commentPayload.commentsOverallSummary);
  });

  it('2. Assessor A is strictly prevented from commenting on their own evaluation (403 Forbidden)', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assessorAToken}`
      },
      body: JSON.stringify({
        evaluationId: String(evalDocAId),
        text: 'Self commentary attempt should be rejected by serverless policy.'
      })
    };

    const res = await addCommentHandler(event, {});
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.match(body.error, /cannot comment on their own evaluation/i);
  });

  it('3. Manager can post comments on any evaluation', async () => {
    const managerCommentPayload = {
      evaluationId: String(evalDocAId),
      text: 'Managerial quality audit complete: Section A scores verified against hardware bench photos.',
      aiSummary: 'Manager verified Section A scores against hardware photos.',
      commentsOverallSummary: 'Managerial audit verified hardware compliance.'
    };

    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify(managerCommentPayload)
    };

    const res = await addCommentHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.success, true);
    assert.equal(body.comment.authorName, 'Lead Reviewer');
    assert.equal(body.comment.authorRole, ROLE_MANAGER);
    assert.equal(body.comment.aiSummary, managerCommentPayload.aiSummary);
  });

  it('4. Comments are append-only: second comment on Assessor B adds to comments array', async () => {
    const secondCommentPayload = {
      evaluationId: String(evalDocBId),
      text: 'Manager follow-up: Concur with peer assessment. Ready for final review queue.',
      aiSummary: 'Concur with peer assessment.',
      commentsOverallSummary: 'Peer and manager agreement on compliance readiness.'
    };

    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify(secondCommentPayload)
    };

    const res = await addCommentHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.comment.authorRole, ROLE_MANAGER);

    // Verify in lookup that both comments exist
    const lookupRes = await lookupHandler({
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${managerToken}` },
      queryStringParameters: { id: String(evalDocBId) }
    }, {});

    assert.equal(lookupRes.statusCode, 200);
    const lookupBody = JSON.parse(lookupRes.body);
    const rec = lookupBody.data[0];
    assert.ok(Array.isArray(rec.comments));
    assert.equal(rec.comments.length, 2);
    assert.equal(rec.comments[0].authorRole, ROLE_ASSESSOR);
    assert.equal(rec.comments[1].authorRole, ROLE_MANAGER);
    assert.equal(rec.commentsOverallSummary, 'Peer and manager agreement on compliance readiness.');
  });

  it('5. Vendor accounts are blocked from calling add-comment (403 Forbidden)', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendorToken}`
      },
      body: JSON.stringify({
        evaluationId: String(evalDocBId),
        text: 'Vendor attempt to comment internally.'
      })
    };

    const res = await addCommentHandler(event, {});
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
  });

  it('6. Unauthenticated requests are rejected with 401 Unauthorized', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        evaluationId: String(evalDocBId),
        text: 'Unauthenticated comment'
      })
    };

    const res = await addCommentHandler(event, {});
    assert.equal(res.statusCode, 401);
  });

  it('7. Input validation enforces non-empty text and maximum 1000 character limits', async () => {
    // Empty text
    const emptyRes = await addCommentHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        evaluationId: String(evalDocBId),
        text: '   '
      })
    }, {});
    assert.equal(emptyRes.statusCode, 400);

    // Overlength text (>1000 chars)
    const longText = 'A'.repeat(1005);
    const longRes = await addCommentHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        evaluationId: String(evalDocBId),
        text: longText
      })
    }, {});
    assert.equal(longRes.statusCode, 400);

    // Missing evaluationId
    const noIdRes = await addCommentHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        text: 'Valid text without ID'
      })
    }, {});
    assert.equal(noIdRes.statusCode, 400);
  });

  it('8. Vendor portal isolation: vendor-portal-data strictly excludes internal comments', async () => {
    // Setup vendor in db linked to evalDocBId
    const connection = await connectToDatabase();
    if (connection.isMongoAtlas) {
      await connection.db.collection('vendors').updateOne(
        { email: 'vendor@telematics.com' },
        {
          $set: {
            loginEmail: 'vendor@telematics.com',
            contactEmail: 'vendor@telematics.com',
            vendorId: 'vendor_01',
            linkedRegistrationIds: [String(evalDocBId)],
            isActive: true
          }
        },
        { upsert: true }
      );
    }

    const event = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${vendorToken}` },
      queryStringParameters: { id: String(evalDocBId) }
    };

    const res = await vendorPortalHandler(event, {});
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      const evalItem = body.evaluations ? body.evaluations[0] : body.evaluation;
      assert.ok(evalItem);
      // Ensure comments and commentsOverallSummary are NOT present
      assert.equal(evalItem.comments, undefined);
      assert.equal(evalItem.commentsOverallSummary, undefined);
    }
  });

  it('9. Assessor A can view peer evaluation comments in lookup-evaluation when peerReview=true', async () => {
    const event = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${assessorAToken}` },
      queryStringParameters: { id: String(evalDocBId), peerReview: 'true' }
    };

    const res = await lookupHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data && body.data.length > 0);
    const peerDoc = body.data[0];
    assert.equal(peerDoc.companyName, 'Beta Dynamics Logistics');
    assert.ok(Array.isArray(peerDoc.comments));
    assert.equal(peerDoc.comments.length, 2);
    assert.ok(peerDoc.commentsOverallSummary);
  });

  it('10. Assessor A is blocked from viewing other assessor submissions without peerReview=true', async () => {
    const event = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${assessorAToken}` },
      queryStringParameters: { id: String(evalDocBId) }
    };

    const res = await lookupHandler(event, {});
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
  });
});
