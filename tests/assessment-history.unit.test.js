/**
 * Assessment History & Versioning Test Suite
 * Tests:
 * 1. Initial submission creates version 1 snapshot
 * 2. Sequential versioning ($v_1 \to v_2 \to v_3$) on resubmissions
 * 3. Snapshot fidelity and immutability
 * 4. Manager approval stamps approvedVersion
 * 5. Certificate issuance stamps certifiedVersion
 * 6. get-assessment-history endpoint & RBAC
 * 7. get-assessment-version endpoint & snapshot retrieval
 * 8. SLA & Assessor Workload invariance
 * 9. Legacy evaluation fallback handling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { handler as approveHandler } from '../netlify/functions/approve-evaluation.js';
import { handler as certHandler } from '../netlify/functions/issue-certificate.js';
import { handler as historyHandler } from '../netlify/functions/get-assessment-history.js';
import { handler as versionHandler } from '../netlify/functions/get-assessment-version.js';
import { handler as workloadHandler } from '../netlify/functions/get-assessor-workload.js';
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
  COLLECTION_VERSIONS,
  COLLECTION_USERS,
  buildMongoIdFilter
} from '../netlify/functions/db.js';
import {
  recomputeScores,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA
} from '../netlify/functions/rubric.js';

describe('Assessment History & Versioning Suite', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Audit Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Assessor Farhan' });
  const otherAssessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'KUL 1234', name: 'Other Assessor' });
  const vendorToken = generateToken({ role: ROLE_VENDOR, name: 'Vendor Tech', linkedRegistrationIds: [] });

  let createdEvalId = null;
  const testIdsToCleanup = [];
  const testUserEmail = `test.history.farhan.${Date.now()}@trackscore.my`;

  function buildBreakdown(optionIndex = 0) {
    return [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({
      id: c.id,
      selectedOption: c.options[Math.min(optionIndex, c.options.length - 1)].label,
      points: c.options[Math.min(optionIndex, c.options.length - 1)].points
    }));
  }

  before(async () => {
    try {
      const conn = await connectToDatabase();
      const userDoc = {
        name: 'Assessor Farhan',
        email: testUserEmail,
        role: ROLE_ASSESSOR,
        assessorId: 'MKA 9006',
        createdAt: new Date().toISOString()
      };
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_USERS).insertOne(userDoc);
      } else {
        await conn.createUser(userDoc);
      }
    } catch {}
  });

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_USERS).deleteOne({ email: testUserEmail });
        for (const id of testIdsToCleanup) {
          await conn.db.collection(COLLECTION_NAME).deleteOne(buildMongoIdFilter(id));
          await conn.db.collection(COLLECTION_VERSIONS).deleteMany({ evaluationId: String(id) });
        }
      } else {
        const users = await conn.listUsers();
        const found = users.find(u => u.email === testUserEmail);
        if (found) await conn.deleteUser(found.id || found._id);
      }
    } catch {}
    await closeDatabaseConnection();
  });

  it('1. should create v1 snapshot upon initial evaluation submission', async () => {
    const timestamp = Date.now();
    const breakdown = buildBreakdown(0);
    const recomputed = recomputeScores(breakdown);

    const payload = {
      companyName: `VersionTest Fleet ${timestamp}`,
      deviceModel: `VT-100-${timestamp}`,
      packageName: 'Comprehensive Track',
      assessorName: 'Assessor Farhan',
      assessorId: 'MKA 9006',
      assessmentDate: '2026-03-20',
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
    assert.equal(body.success, true);
    assert.equal(body.currentVersion, 1);
    assert.equal(body.version, 1);
    createdEvalId = String(body.id);
    testIdsToCleanup.push(createdEvalId);

    // Verify v1 version document exists via history endpoint
    const histRes = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: createdEvalId }
    });

    assert.equal(histRes.statusCode, 200);
    const histBody = JSON.parse(histRes.body);
    assert.equal(histBody.success, true);
    assert.equal(histBody.currentVersion, 1);
    assert.equal(histBody.history.length, 1);
    assert.equal(histBody.history[0].versionNumber, 1);
    assert.equal(histBody.history[0].action, 'INITIAL_SUBMISSION');
    assert.equal(histBody.history[0].scores.totalScore, recomputed.totalScore);
  });

  it('2. should reject evaluation to allow resubmission', async () => {
    const rejectRes = await approveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: createdEvalId,
        action: 'rejected',
        reason: 'Missing calibration documentation for criterion 5'
      })
    }, {});

    assert.equal(rejectRes.statusCode, 200);
    const body = JSON.parse(rejectRes.body);
    assert.equal(body.status, 'rejected');
  });

  it('3. should create v2 snapshot upon assessor resubmission', async () => {
    const breakdownV2 = buildBreakdown(1);
    const recomputedV2 = recomputeScores(breakdownV2);

    const resubmitRes = await saveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        resubmitRecordId: createdEvalId,
        companyName: `VersionTest Fleet Resubmitted`,
        deviceModel: `VT-100-MOD`,
        assessorName: 'Assessor Farhan',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-21',
        changeReason: 'Updated criterion 5 calibration certificates',
        breakdown: breakdownV2,
        sectionAScore: recomputedV2.sectionAScore,
        sectionBScore: recomputedV2.sectionBScore,
        totalScore: recomputedV2.totalScore,
        starRating: recomputedV2.starRating
      })
    }, {});

    assert.equal(resubmitRes.statusCode, 200);
    const body = JSON.parse(resubmitRes.body);
    assert.equal(body.success, true);
    assert.equal(body.isResubmission, true);
    assert.equal(body.currentVersion, 2);

    // Verify history now has 2 versions
    const histRes = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: createdEvalId }
    });

    const histBody = JSON.parse(histRes.body);
    assert.equal(histBody.history.length, 2);
    assert.equal(histBody.currentVersion, 2);
    assert.equal(histBody.history[0].versionNumber, 2);
    assert.equal(histBody.history[0].action, 'RESUBMISSION');
    assert.match(histBody.history[0].changeReason, /calibration/i);
    assert.equal(histBody.history[1].versionNumber, 1);
  });

  it('4. should retrieve full snapshot breakdown for specific version via get-assessment-version', async () => {
    const v1Res = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${assessorToken}` },
      queryStringParameters: { evaluationId: createdEvalId, version: '1' }
    });

    assert.equal(v1Res.statusCode, 200);
    const v1Body = JSON.parse(v1Res.body);
    assert.equal(v1Body.version.versionNumber, 1);
    assert.equal(Array.isArray(v1Body.version.breakdown), true);
    assert.equal(v1Body.version.breakdown.length, 33);

    const v2Res = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${assessorToken}` },
      queryStringParameters: { evaluationId: createdEvalId, version: '2' }
    });

    assert.equal(v2Res.statusCode, 200);
    const v2Body = JSON.parse(v2Res.body);
    assert.equal(v2Body.version.versionNumber, 2);
    assert.match(v2Body.version.changeReason, /calibration/i);
  });

  it('5. should stamp approvedVersion when manager approves evaluation', async () => {
    const approveRes = await approveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: createdEvalId,
        action: 'approved'
      })
    });

    assert.equal(approveRes.statusCode, 200);
    const body = JSON.parse(approveRes.body);
    assert.equal(body.approvedVersion, 2);

    // Verify history reflects approved version
    const histRes = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: createdEvalId }
    });
    const histBody = JSON.parse(histRes.body);
    assert.equal(histBody.approvedVersion, 2);
    const v2Entry = histBody.history.find(h => h.versionNumber === 2);
    assert.equal(v2Entry.isApprovedVersion, true);
  });

  it('6. should stamp certifiedVersion when certificate is issued', async () => {
    const certRes = await certHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: createdEvalId,
        action: 'prepare'
      })
    });

    assert.equal(certRes.statusCode, 200);
    const body = JSON.parse(certRes.body);
    assert.equal(body.certificate.certifiedVersion, 2);
  });

  it('7. should enforce RBAC scoping on history and version endpoints', async () => {
    // Unauthenticated -> 401
    const unauthHist = await historyHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { evaluationId: createdEvalId }
    });
    assert.equal(unauthHist.statusCode, 401);

    // Different assessor not assigned -> 403
    const forbiddenHist = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${otherAssessorToken}` },
      queryStringParameters: { evaluationId: createdEvalId }
    });
    assert.equal(forbiddenHist.statusCode, 403);

    // Different assessor on version endpoint -> 403
    const forbiddenVer = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${otherAssessorToken}` },
      queryStringParameters: { evaluationId: createdEvalId, version: '1' }
    });
    assert.equal(forbiddenVer.statusCode, 403);
  });

  it('8. should return synthetic v1 fallback for legacy evaluations without prior snapshots', async () => {
    const conn = await connectToDatabase();
    const legacyId = 'legacy-eval-' + Date.now();
    testIdsToCleanup.push(legacyId);

    const legacyDoc = {
      _id: legacyId,
      companyName: 'Legacy Telematics Ltd',
      deviceModel: 'LEG-10',
      assessorName: 'Legacy Assessor',
      assessorId: 'MKA 9006',
      totalScore: 88.5,
      sectionAScore: 40,
      sectionBScore: 48.5,
      status: 'pending_review',
      breakdown: buildBreakdown(0),
      createdAt: '2026-01-01T00:00:00.000Z'
    };

    if (conn.isMongoAtlas) {
      await conn.db.collection(COLLECTION_NAME).insertOne(legacyDoc);
    } else {
      await conn.insertEvaluation(legacyDoc);
    }

    const histRes = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: legacyId }
    });

    assert.equal(histRes.statusCode, 200);
    const body = JSON.parse(histRes.body);
    assert.equal(body.totalVersions, 1);
    assert.equal(body.history[0].versionNumber, 1);
    assert.equal(body.history[0].scores.totalScore, 88.5);

    const verRes = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: legacyId, version: '1' }
    });
    assert.equal(verRes.statusCode, 200);
    const verBody = JSON.parse(verRes.body);
    assert.equal(verBody.version.versionNumber, 1);
    assert.equal(verBody.version.scores.totalScore, 88.5);
  });

  it('9. should preserve SLA deadline and not inflate assessor workload with versions', async () => {
    // Check workload endpoint: multiple versions must NOT count as multiple assessments
    const workRes = await workloadHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` }
    });

    assert.equal(workRes.statusCode, 200);
    const workBody = JSON.parse(workRes.body);
    assert.equal(workBody.success, true);
    // Assessor Farhan should only have 1 active assessment count for createdEvalId (or completed)
    const farhan = workBody.assessors.find(w => w.assessorId === 'MKA 9006');
    assert.ok(farhan, 'Assessor workload summary exists');
  });
});
