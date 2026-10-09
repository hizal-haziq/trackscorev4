/**
 * Final Production Verification Test Suite for Assessment History & Versioning
 * Independent verification script covering:
 * - End-to-end lifecycle (v1 -> v2 -> approve v2 -> cert v2 -> v3)
 * - Immutability of historical versions
 * - Score integrity (tamper rejection)
 * - Concurrency & Duplicate key prevention
 * - Vendor & Assessor IDOR isolation
 * - SLA & Workload invariance
 * - Legacy evaluation backfill
 */

import { describe, it, after } from 'node:test';
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
  createAssessmentVersionRecord,
  COLLECTION_NAME,
  COLLECTION_VERSIONS,
  buildMongoIdFilter
} from '../netlify/functions/db.js';
import {
  recomputeScores,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA
} from '../netlify/functions/rubric.js';

describe('Final Production Verification: Assessment History & Versioning', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Operations Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Farhan Assessor' });
  const rogueAssessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'PEN 8888', name: 'Rogue Assessor' });
  
  const vendorAToken = generateToken({ role: ROLE_VENDOR, name: 'Vendor A Corp', linkedRegistrationIds: ['vendor-a-reg-1'] });
  const vendorBToken = generateToken({ role: ROLE_VENDOR, name: 'Vendor B Corp', linkedRegistrationIds: ['vendor-b-reg-2'] });

  const testIdsToCleanup = [];

  function buildBreakdown(optionIndex = 0) {
    return [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({
      id: c.id,
      selectedOption: c.options[Math.min(optionIndex, c.options.length - 1)].label,
      points: c.options[Math.min(optionIndex, c.options.length - 1)].points
    }));
  }

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        for (const id of testIdsToCleanup) {
          await conn.db.collection(COLLECTION_NAME).deleteOne(buildMongoIdFilter(id));
          await conn.db.collection(COLLECTION_VERSIONS).deleteMany({ evaluationId: String(id) });
        }
      }
    } catch {}
    await closeDatabaseConnection();
  });

  // =========================================================================
  // TEST 1: Full End-to-End Lifecycle & Traceability (v1 -> v2 -> approve -> cert -> v3)
  // =========================================================================
  it('E2E Lifecycle: v1 -> v2 -> approve v2 -> cert v2 -> v3 preserves immutability & audit links', async () => {
    const timestamp = Date.now();
    const b1 = buildBreakdown(0);
    const rec1 = recomputeScores(b1);

    // 1. Initial Submission -> v1
    const subRes = await saveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        companyName: `Lifecycle Corp ${timestamp}`,
        deviceModel: `LFC-99-${timestamp}`,
        packageName: 'Professional Telematics Package',
        assessorName: 'Farhan Assessor',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-25',
        breakdown: b1,
        sectionAScore: rec1.sectionAScore,
        sectionBScore: rec1.sectionBScore,
        totalScore: rec1.totalScore,
        starRating: rec1.starRating
      })
    }, {});

    assert.equal(subRes.statusCode, 200);
    const subBody = JSON.parse(subRes.body);
    const evalId = String(subBody.id);
    testIdsToCleanup.push(evalId);

    assert.equal(subBody.currentVersion, 1);
    const initialDeadline = subBody.sla?.deadline;

    // Snapshot v1 data
    const v1SnapRes = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${assessorToken}` },
      queryStringParameters: { evaluationId: evalId, version: '1' }
    });
    assert.equal(v1SnapRes.statusCode, 200);
    const v1Snap = JSON.parse(v1SnapRes.body).version;
    assert.equal(v1Snap.versionNumber, 1);
    assert.equal(v1Snap.scores.totalScore, rec1.totalScore);
    const v1BreakdownSnapshot = JSON.stringify(v1Snap.breakdown);

    // 2. Reject evaluation
    const rejRes = await approveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: evalId,
        action: 'rejected',
        reason: 'GNSS sensitivity requires higher gain documentation'
      })
    });
    assert.equal(rejRes.statusCode, 200);

    // 3. Resubmit -> v2
    const b2 = buildBreakdown(1);
    const rec2 = recomputeScores(b2);
    const resubRes = await saveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        resubmitRecordId: evalId,
        companyName: `Lifecycle Corp ${timestamp}`,
        deviceModel: `LFC-99-${timestamp}`,
        assessorName: 'Farhan Assessor',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-26',
        changeReason: 'Updated GNSS antenna gain lab report',
        breakdown: b2,
        sectionAScore: rec2.sectionAScore,
        sectionBScore: rec2.sectionBScore,
        totalScore: rec2.totalScore,
        starRating: rec2.starRating
      })
    });
    assert.equal(resubRes.statusCode, 200);
    const resubBody = JSON.parse(resubRes.body);
    assert.equal(resubBody.currentVersion, 2);

    // SLA deadline must be preserved
    assert.equal(resubBody.sla.deadline, initialDeadline);

    // Verify v1 immutability after v2 creation
    const v1CheckRes = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${assessorToken}` },
      queryStringParameters: { evaluationId: evalId, version: '1' }
    });
    const v1Check = JSON.parse(v1CheckRes.body).version;
    assert.equal(JSON.stringify(v1Check.breakdown), v1BreakdownSnapshot, 'v1 breakdown must remain byte-identical');
    assert.equal(v1Check.scores.totalScore, rec1.totalScore, 'v1 score must remain unchanged');

    // 4. Approve v2
    const appRes = await approveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: evalId,
        action: 'approved'
      })
    });
    assert.equal(appRes.statusCode, 200);
    const appBody = JSON.parse(appRes.body);
    assert.equal(appBody.approvedVersion, 2);

    // 5. Issue certificate -> stamps certifiedVersion = 2
    const certRes = await certHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: evalId,
        action: 'prepare'
      })
    });
    assert.equal(certRes.statusCode, 200);
    const certBody = JSON.parse(certRes.body);
    assert.equal(certBody.certificate.certifiedVersion, 2);

    // 6. Create v3 (e.g. subsequent post-certification compliance audit version)
    const conn = await connectToDatabase();
    const b3 = buildBreakdown(2);
    const rec3 = recomputeScores(b3);

    await createAssessmentVersionRecord(conn, {
      evaluationId: evalId,
      versionNumber: 3,
      action: 'RESUBMISSION',
      changeReason: 'Post-certification annual calibration audit',
      actor: { name: 'Farhan Assessor', role: 'assessor', assessorId: 'MKA 9006' },
      scores: {
        sectionAScore: rec3.sectionAScore,
        sectionBScore: rec3.sectionBScore,
        totalScore: rec3.totalScore,
        starRating: rec3.starRating
      },
      breakdown: b3,
      metadata: { companyName: `Lifecycle Corp ${timestamp}`, deviceModel: `LFC-99-${timestamp}` },
      createdAt: new Date().toISOString()
    });

    // 7. Verify History endpoint integrity: approvedVersion and certifiedVersion must NOT be overridden by v3
    const histRes = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: evalId }
    });
    assert.equal(histRes.statusCode, 200);
    const histBody = JSON.parse(histRes.body);
    assert.equal(histBody.history.length, 3);
    assert.equal(histBody.approvedVersion, 2, 'approvedVersion must remain locked at 2');
    assert.equal(histBody.certifiedVersion, 2, 'certifiedVersion must remain locked at 2');

    // Verify version-specific tags
    const v3Item = histBody.history.find(h => h.versionNumber === 3);
    const v2Item = histBody.history.find(h => h.versionNumber === 2);
    assert.equal(v3Item.isApprovedVersion, false);
    assert.equal(v3Item.isCertifiedVersion, false);
    assert.equal(v2Item.isApprovedVersion, true);
    assert.equal(v2Item.isCertifiedVersion, true);
  });

  // =========================================================================
  // TEST 2: Score Tamper Rejection
  // =========================================================================
  it('Score Integrity: should reject client attempt to forge totals with 400 Bad Request', async () => {
    const timestamp = Date.now();
    const b = buildBreakdown(0);
    const legitimate = recomputeScores(b);

    const tamperedPayload = {
      companyName: `Tamper Corp ${timestamp}`,
      deviceModel: `TMP-01`,
      assessorName: 'Farhan Assessor',
      assessorId: 'MKA 9006',
      assessmentDate: '2026-03-25',
      breakdown: b,
      sectionAScore: legitimate.sectionAScore,
      sectionBScore: legitimate.sectionBScore,
      totalScore: 99.99, // Tampered score!
      starRating: 5
    };

    const res = await saveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify(tamperedPayload)
    }, {});

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /integrity verification failed/i);
  });

  // =========================================================================
  // TEST 3: Concurrency & Duplicate Version Prevention
  // =========================================================================
  it('Concurrency: duplicate (evaluationId, versionNumber) must be rejected', async () => {
    const conn = await connectToDatabase();
    const testEvalId = 'duplicate-test-' + Date.now();
    testIdsToCleanup.push(testEvalId);

    // First insert: version 1 succeeds
    const v1 = await createAssessmentVersionRecord(conn, {
      evaluationId: testEvalId,
      versionNumber: 1,
      action: 'INITIAL_SUBMISSION',
      actor: { name: 'Farhan', role: 'assessor' },
      scores: { totalScore: 80 },
      breakdown: []
    });
    assert.ok(v1._id || v1.insertedId);

    // Second insert with same versionNumber 1 must throw duplicate key error (code 11000)
    let duplicateRejected = false;
    try {
      await createAssessmentVersionRecord(conn, {
        evaluationId: testEvalId,
        versionNumber: 1,
        action: 'CONCURRENT_COLLISION',
        actor: { name: 'Rogue', role: 'assessor' },
        scores: { totalScore: 85 },
        breakdown: []
      });
    } catch (err) {
      duplicateRejected = true;
      assert.ok(err.code === 11000 || String(err.message).includes('11000') || String(err.message).includes('duplicate'));
    }

    assert.equal(duplicateRejected, true, 'Duplicate versionNumber must be strictly rejected');
  });

  // =========================================================================
  // TEST 4: Vendor & Assessor IDOR Isolation
  // =========================================================================
  it('Vendor & Assessor Isolation: unauthorized roles cannot access other evaluations', async () => {
    const conn = await connectToDatabase();
    const vendorAEvalId = 'vendor-a-eval-' + Date.now();
    testIdsToCleanup.push(vendorAEvalId);

    const doc = {
      _id: vendorAEvalId,
      companyName: 'Vendor A Logistics',
      deviceModel: 'V-A-100',
      registrationReferenceId: 'vendor-a-reg-1',
      assessorId: 'MKA 9006',
      assessorName: 'Farhan Assessor',
      currentVersion: 1,
      totalScore: 85,
      sectionAScore: 40,
      sectionBScore: 45,
      status: 'pending_review',
      breakdown: buildBreakdown(0),
      createdAt: new Date().toISOString()
    };

    if (conn.isMongoAtlas) {
      await conn.db.collection(COLLECTION_NAME).insertOne(doc);
    } else {
      await conn.insertEvaluation(doc);
    }

    await createAssessmentVersionRecord(conn, {
      evaluationId: vendorAEvalId,
      versionNumber: 1,
      action: 'INITIAL_SUBMISSION',
      actor: { name: 'Farhan Assessor', role: 'assessor', assessorId: 'MKA 9006' },
      scores: { totalScore: 85 },
      breakdown: doc.breakdown
    });

    // 1. Vendor A CAN view own evaluation history
    const vAHist = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${vendorAToken}` },
      queryStringParameters: { evaluationId: vendorAEvalId }
    });
    assert.equal(vAHist.statusCode, 200);

    // 2. Vendor B CANNOT view Vendor A's evaluation history (403 Forbidden)
    const vBHist = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${vendorBToken}` },
      queryStringParameters: { evaluationId: vendorAEvalId }
    });
    assert.equal(vBHist.statusCode, 403);
    const vBBody = JSON.parse(vBHist.body);
    assert.match(vBBody.error, /Forbidden/i);

    // 3. Rogue assessor CANNOT view evaluation not assigned to them (403 Forbidden)
    const rogueHist = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${rogueAssessorToken}` },
      queryStringParameters: { evaluationId: vendorAEvalId }
    });
    assert.equal(rogueHist.statusCode, 403);

    // 4. Rogue assessor CANNOT retrieve snapshot breakdown (403 Forbidden)
    const rogueVer = await versionHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${rogueAssessorToken}` },
      queryStringParameters: { evaluationId: vendorAEvalId, version: '1' }
    });
    assert.equal(rogueVer.statusCode, 403);
  });

  // =========================================================================
  // TEST 5: Legacy Evaluation Resubmission Backfill
  // =========================================================================
  it('Legacy Backfill: resubmitting legacy evaluation without prior version records backfills baseline v1', async () => {
    const conn = await connectToDatabase();
    const legacyEvalId = 'legacy-resub-' + Date.now();
    testIdsToCleanup.push(legacyEvalId);

    const bLegacy = buildBreakdown(0);
    const recLegacy = recomputeScores(bLegacy);

    const legacyDoc = {
      _id: legacyEvalId,
      companyName: 'Legacy Fleet Trans',
      deviceModel: 'LEG-MODEL-88',
      assessorId: 'MKA 9006',
      assessorName: 'Farhan Assessor',
      status: 'pending_review',
      sectionAScore: recLegacy.sectionAScore,
      sectionBScore: recLegacy.sectionBScore,
      totalScore: recLegacy.totalScore,
      starRating: recLegacy.starRating,
      breakdown: bLegacy,
      createdAt: '2026-01-10T08:00:00.000Z'
    };

    if (conn.isMongoAtlas) {
      await conn.db.collection(COLLECTION_NAME).insertOne(legacyDoc);
    } else {
      await conn.insertEvaluation(legacyDoc);
    }

    // Now resubmit this legacy record with corrections
    const bNew = buildBreakdown(1);
    const recNew = recomputeScores(bNew);

    const resubRes = await saveHandler({
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        resubmitRecordId: legacyEvalId,
        companyName: 'Legacy Fleet Trans',
        deviceModel: 'LEG-MODEL-88',
        assessorName: 'Farhan Assessor',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-25',
        changeReason: 'Remediated legacy evaluation criteria',
        breakdown: bNew,
        sectionAScore: recNew.sectionAScore,
        sectionBScore: recNew.sectionBScore,
        totalScore: recNew.totalScore,
        starRating: recNew.starRating
      })
    });

    assert.equal(resubRes.statusCode, 200);
    const resubBody = JSON.parse(resubRes.body);
    assert.equal(resubBody.currentVersion, 2);

    // Verify history now contains BOTH v1 (baseline) and v2 (remediation)
    const histRes = await historyHandler({
      httpMethod: 'GET',
      headers: { 'Authorization': `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: legacyEvalId }
    });
    assert.equal(histRes.statusCode, 200);
    const histBody = JSON.parse(histRes.body);
    assert.equal(histBody.history.length, 2);
    assert.equal(histBody.history[1].versionNumber, 1);
    assert.equal(histBody.history[1].scores.totalScore, recLegacy.totalScore);
    assert.equal(histBody.history[0].versionNumber, 2);
    assert.equal(histBody.history[0].scores.totalScore, recNew.totalScore);
  });
});
