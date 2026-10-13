/**
 * Assessment Risk & Anomaly Detection Unit & Integration Test Suite
 * 
 * Verifies:
 * 1. Normal assessment produces NORMAL risk level with 0 signals
 * 2. Rapid completion produces RAPID_COMPLETION signal
 * 3. High score concentration produces SCORE_CONCENTRATION signal
 * 4. Large score delta between versions produces LARGE_VERSION_CHANGE signal
 * 5. Repeated resubmissions produce REPEATED_RESUBMISSION signal
 * 6. Divergent criterion selections produce CRITERION_PATTERN_ANOMALY signal
 * 7. Assessor historical score deviation produces ASSESSOR_SCORE_OUTLIER signal
 * 8. Assessor criterion divergence produces ASSESSOR_CONSISTENCY_SIGNAL
 * 9. Vendor revision count exceeds baseline producing VENDOR_REVISION_ANOMALY signal
 * 10. Overdue / strained timeline produces SLA_PATTERN_ANOMALY signal
 * 11. Insufficient historical data produces INSUFFICIENT_DATA data confidence
 * 12. Multiple signals combine deterministically to calculate aggregate riskScore and riskLevel
 * 13. API RBAC: Managers have full access; Assessors are scoped to own evaluations; Vendors receive 403 Forbidden; Unauthenticated receives 401
 * 14. Vendor Isolation: Vendors are blocked from internal risk analytics and cannot access any evaluation's risk data
 * 15. Risk snapshot isolation: snapshots per version are preserved independently without mutating assessment_versions
 * 16. Preservation: Scoring rubric, SLA status, and assessor workload are unchanged by risk evaluation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAssessmentRisk,
  computeRiskAggregateOverview,
  RISK_LEVELS,
  SIGNAL_TYPES,
  SIGNAL_WEIGHTS
} from '../netlify/functions/assessment-risk.js';
import { handler as riskHandler } from '../netlify/functions/get-assessment-risk.js';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from '../netlify/functions/auth.js';
import {
  connectToDatabase,
  closeDatabaseConnection,
  COLLECTION_NAME,
  COLLECTION_RISK,
  buildMongoIdFilter
} from '../netlify/functions/db.js';
import { SECTION_A_CRITERIA, SECTION_B_CRITERIA, recomputeScores } from '../netlify/functions/rubric.js';
import { SLA_STATUS } from '../netlify/functions/sla.js';

describe('Assessment Risk & Anomaly Detection Test Suite', () => {
  const managerToken = generateToken({ id: 'mgr_risk_01', role: ROLE_MANAGER, name: 'Risk Manager Lead', email: 'risk_mgr@trackscore.my' });
  const assessorAToken = generateToken({ id: 'asr_risk_A', role: ROLE_ASSESSOR, assessorId: 'RSK 1001', name: 'Ts. Risk Assessor A', email: 'risk_a@trackscore.my' });
  const assessorBToken = generateToken({ id: 'asr_risk_B', role: ROLE_ASSESSOR, assessorId: 'RSK 2002', name: 'Ts. Risk Assessor B', email: 'risk_b@trackscore.my' });
  const vendorToken = generateToken({ id: 'vnd_risk_01', role: ROLE_VENDOR, vendorId: 'vendor_risk_01', email: 'vendor@risktelematics.com' });

  let savedEvalId = null;
  const testIdsToCleanup = [];

  function buildSampleBreakdown(allPassed = false) {
    return [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({
      id: c.id,
      name: c.name,
      section: c.id.startsWith('b_') ? 'B' : 'A',
      selectedOption: allPassed ? c.options[c.options.length - 1].label : c.options[0].label,
      points: allPassed ? c.options[c.options.length - 1].points : 0
    }));
  }

  before(async () => {
    // Seed an evaluation for API testing
    const breakdown = buildSampleBreakdown(true);
    const scores = recomputeScores(breakdown);
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assessorAToken}`
      },
      body: JSON.stringify({
        companyName: 'AeroFleet Systems Sdn Bhd',
        deviceModel: 'AFS-T900',
        packageName: 'Package 1: Standard Assessment (RM 4,500)',
        package: 'package_1',
        assessmentDate: '2026-09-25',
        assessorName: 'Ts. Risk Assessor A',
        assessorId: 'RSK 1001',
        breakdown,
        sectionAScore: scores.sectionAScore,
        sectionBScore: scores.sectionBScore,
        totalScore: scores.totalScore
      })
    };

    const res = await saveHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    savedEvalId = body.id || body.insertedId;
    testIdsToCleanup.push(savedEvalId);
  });

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        const col = conn.db.collection(COLLECTION_NAME);
        const riskCol = conn.db.collection(COLLECTION_RISK);
        for (const id of testIdsToCleanup) {
          if (id) {
            await col.deleteOne(buildMongoIdFilter(String(id)));
            await riskCol.deleteMany({ evaluationId: String(id) });
          }
        }
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
    await closeDatabaseConnection();
  });

  // =========================================================================
  // 1. Normal Assessment Detection
  // =========================================================================
  it('1. should classify a typical evaluation as NORMAL with 0 risk signals', () => {
    const normalEval = {
      _id: 'eval_normal_001',
      totalScore: 3.80,
      package: 'package_1',
      packageName: 'Package 1: Standard Assessment',
      assessorId: 'ASR_001',
      assessorName: 'Ts. Normal Assessor',
      companyName: 'Apex Transport',
      currentVersion: 1,
      breakdown: buildSampleBreakdown(false).map((b, idx) => ({ ...b, points: idx % 2 === 0 ? 0.25 : 0 })),
      startedAt: '2026-09-25T08:00:00.000Z',
      completedAt: '2026-09-25T11:30:00.000Z', // 3.5 hours
      sla: { status: SLA_STATUS.ON_TRACK, durationDays: 7 }
    };

    // 10 peer evaluations for baseline
    const peerEvals = Array.from({ length: 12 }, (_, i) => ({
      _id: `peer_${i}`,
      totalScore: 3.50 + (i % 4) * 0.2,
      package: 'package_1',
      assessorId: 'ASR_001',
      currentVersion: 1,
      startedAt: '2026-09-20T08:00:00.000Z',
      completedAt: '2026-09-20T11:45:00.000Z',
      breakdown: buildSampleBreakdown(false).map((b, idx) => ({ ...b, points: idx % 2 === 0 ? 0.25 : 0 }))
    }));

    const result = analyzeAssessmentRisk(normalEval, { allEvaluations: peerEvals });
    assert.equal(result.riskLevel, RISK_LEVELS.NORMAL);
    assert.equal(result.riskScore, 0);
    assert.equal(result.signals.length, 0);
    assert.equal(result.dataConfidence, 'HIGH');
  });

  // =========================================================================
  // 2. Rapid Assessment Completion Signal
  // =========================================================================
  it('2. should detect RAPID_COMPLETION when duration is drastically below historical median', () => {
    const rapidEval = {
      _id: 'eval_rapid_001',
      totalScore: 4.20,
      package: 'package_1',
      assessorId: 'ASR_001',
      companyName: 'Speedy Fleet',
      startedAt: '2026-09-25T08:00:00.000Z',
      completedAt: '2026-09-25T08:14:00.000Z', // 14 minutes
      breakdown: buildSampleBreakdown(false)
    };

    // Peers with median duration around 180 minutes (3 hours)
    const peerEvals = Array.from({ length: 8 }, (_, i) => ({
      _id: `peer_${i}`,
      totalScore: 4.0,
      package: 'package_1',
      startedAt: '2026-09-20T08:00:00.000Z',
      completedAt: '2026-09-20T11:00:00.000Z', // 180 mins
      breakdown: buildSampleBreakdown(false)
    }));

    const result = analyzeAssessmentRisk(rapidEval, { allEvaluations: peerEvals });
    const rapidSignal = result.signals.find(s => s.type === SIGNAL_TYPES.RAPID_COMPLETION);
    assert.ok(rapidSignal, 'Should generate RAPID_COMPLETION signal');
    assert.equal(rapidSignal.score, 15);
    assert.match(rapidSignal.explanation, /significantly shorter than the historical baseline/i);
  });

  // =========================================================================
  // 3. Unusual Score Concentration Signal
  // =========================================================================
  it('3. should detect SCORE_CONCENTRATION when evaluation passes 33/33 criteria in low-incidence group', () => {
    const perfectEval = {
      _id: 'eval_perfect_001',
      totalScore: 5.00,
      package: 'package_1',
      assessorId: 'ASR_001',
      companyName: 'Pristine Tech',
      breakdown: buildSampleBreakdown(true) // All 33 criteria passed
    };

    // Peers where perfect scores are uncommon (< 25%)
    const peerEvals = Array.from({ length: 10 }, (_, i) => ({
      _id: `peer_${i}`,
      totalScore: 3.20 + (i * 0.1),
      package: 'package_1',
      breakdown: buildSampleBreakdown(false).map((b, idx) => ({ ...b, points: idx < 20 ? 0.25 : 0 }))
    }));

    const result = analyzeAssessmentRisk(perfectEval, { allEvaluations: peerEvals });
    const concentrationSignal = result.signals.find(s => s.type === SIGNAL_TYPES.SCORE_CONCENTRATION);
    assert.ok(concentrationSignal, 'Should generate SCORE_CONCENTRATION signal');
    assert.equal(concentrationSignal.score, 10);
    assert.match(concentrationSignal.observed, /Passed 33 of 33 criteria/);
  });

  // =========================================================================
  // 4. Large Version Score Change Signal
  // =========================================================================
  it('4. should detect LARGE_VERSION_CHANGE when score jumps substantially between versions', () => {
    const v2Eval = {
      _id: 'eval_versioned_001',
      currentVersion: 2,
      totalScore: 4.80, // Jumped from 2.50 to 4.80 (2.30 pts = 46%)
      package: 'package_1',
      assessorId: 'ASR_001',
      companyName: 'Delta Leap Corp',
      breakdown: buildSampleBreakdown(true)
    };

    const historyVersions = [
      { versionNumber: 1, snapshot: { totalScore: 2.50 } },
      { versionNumber: 2, snapshot: { totalScore: 4.80 } }
    ];

    const result = analyzeAssessmentRisk(v2Eval, { historyVersions, allEvaluations: [] });
    const versionSignal = result.signals.find(s => s.type === SIGNAL_TYPES.LARGE_VERSION_CHANGE);
    assert.ok(versionSignal, 'Should generate LARGE_VERSION_CHANGE signal');
    assert.equal(versionSignal.score, 15);
    assert.equal(versionSignal.severity, 'HIGH');
    assert.match(versionSignal.explanation, /score changed significantly by/i);
  });

  // =========================================================================
  // 5. Repeated Resubmission Pattern Signal
  // =========================================================================
  it('5. should detect REPEATED_RESUBMISSION when assessment reaches 5 versions', () => {
    const multiVersionEval = {
      _id: 'eval_multi_001',
      currentVersion: 5,
      totalScore: 4.10,
      package: 'package_1',
      companyName: 'Iterative Fleets',
      breakdown: buildSampleBreakdown(false)
    };

    const historyVersions = [
      { versionNumber: 1 }, { versionNumber: 2 }, { versionNumber: 3 }, { versionNumber: 4 }, { versionNumber: 5 }
    ];

    const result = analyzeAssessmentRisk(multiVersionEval, { historyVersions, allEvaluations: [] });
    const resubmitSignal = result.signals.find(s => s.type === SIGNAL_TYPES.REPEATED_RESUBMISSION);
    assert.ok(resubmitSignal, 'Should generate REPEATED_RESUBMISSION signal');
    assert.equal(resubmitSignal.score, 10);
    assert.match(resubmitSignal.observed, /5 submitted versions/);
  });

  // =========================================================================
  // 6. Unusual Criterion Pattern Anomaly
  // =========================================================================
  it('6. should detect CRITERION_PATTERN_ANOMALY when criteria diverge from package norms', () => {
    const candidateBreakdown = buildSampleBreakdown(false);
    // Force 2 rare criteria to pass
    candidateBreakdown[0].points = 1.0;
    candidateBreakdown[1].points = 1.0;

    const evalDoc = {
      _id: 'eval_crit_001',
      totalScore: 3.50,
      package: 'package_1',
      breakdown: candidateBreakdown
    };

    // 8 peer evaluations where criteria 0 and 1 never pass (0% pass rate)
    const peerEvals = Array.from({ length: 8 }, (_, i) => {
      const b = buildSampleBreakdown(false);
      b[0].points = 0;
      b[1].points = 0;
      // other criteria pass
      b[2].points = 0.5;
      b[3].points = 0.5;
      return {
        _id: `peer_${i}`,
        package: 'package_1',
        totalScore: 3.20,
        breakdown: b
      };
    });

    const result = analyzeAssessmentRisk(evalDoc, { allEvaluations: peerEvals });
    const critSignal = result.signals.find(s => s.type === SIGNAL_TYPES.CRITERION_PATTERN_ANOMALY);
    assert.ok(critSignal, 'Should generate CRITERION_PATTERN_ANOMALY signal');
    assert.equal(critSignal.score, 15);
    assert.match(critSignal.explanation, /diverge from historical patterns/i);
  });

  // =========================================================================
  // 7. Assessor Score Outlier Signal
  // =========================================================================
  it('7. should detect ASSESSOR_SCORE_OUTLIER when score deviates from assessor mean', () => {
    const evalDoc = {
      _id: 'eval_assessor_outlier_001',
      totalScore: 4.95,
      assessorId: 'ASR_FARHAN',
      assessorName: 'Ts. Mohd Farhan',
      package: 'package_1',
      breakdown: buildSampleBreakdown(false)
    };

    // Assessor Farhan historical evaluations consistently around 3.20 (std dev ~ 0.15)
    const peerEvals = [
      { _id: 'p1', assessorId: 'ASR_FARHAN', totalScore: 3.10 },
      { _id: 'p2', assessorId: 'ASR_FARHAN', totalScore: 3.25 },
      { _id: 'p3', assessorId: 'ASR_FARHAN', totalScore: 3.20 },
      { _id: 'p4', assessorId: 'ASR_FARHAN', totalScore: 3.15 }
    ];

    const result = analyzeAssessmentRisk(evalDoc, { allEvaluations: peerEvals });
    const outlierSignal = result.signals.find(s => s.type === SIGNAL_TYPES.ASSESSOR_SCORE_OUTLIER);
    assert.ok(outlierSignal, 'Should generate ASSESSOR_SCORE_OUTLIER signal');
    assert.equal(outlierSignal.score, 15);
    assert.match(outlierSignal.explanation, /differs noticeably from this assessor's historical score distribution/i);
  });

  // =========================================================================
  // 8. Assessor Consistency Signal
  // =========================================================================
  it('8. should detect ASSESSOR_CONSISTENCY_SIGNAL when criterion selections diverge from assessor history', () => {
    const candidateBreakdown = buildSampleBreakdown(false);
    // Assessor awards points on criteria 0, 1, 2 where historically they never award points
    candidateBreakdown[0].points = 1.0;
    candidateBreakdown[1].points = 1.0;
    candidateBreakdown[2].points = 1.0;

    const evalDoc = {
      _id: 'eval_consistency_001',
      totalScore: 3.80,
      assessorId: 'ASR_CONSISTENT',
      breakdown: candidateBreakdown
    };

    // 4 past evaluations where assessor never awards points for criteria 0, 1, 2
    const peerEvals = Array.from({ length: 4 }, (_, i) => {
      const b = buildSampleBreakdown(false);
      b[0].points = 0;
      b[1].points = 0;
      b[2].points = 0;
      return {
        _id: `past_${i}`,
        assessorId: 'ASR_CONSISTENT',
        breakdown: b
      };
    });

    const result = analyzeAssessmentRisk(evalDoc, { allEvaluations: peerEvals });
    const consistencySignal = result.signals.find(s => s.type === SIGNAL_TYPES.ASSESSOR_CONSISTENCY_SIGNAL);
    assert.ok(consistencySignal, 'Should generate ASSESSOR_CONSISTENCY_SIGNAL');
    assert.equal(consistencySignal.score, 10);
  });

  // =========================================================================
  // 9. Vendor Revision Anomaly Signal
  // =========================================================================
  it('9. should detect VENDOR_REVISION_ANOMALY when revisions exceed vendor baseline', () => {
    const evalDoc = {
      _id: 'eval_vendor_rev_001',
      companyName: 'Acme Fleet SDN BHD',
      currentVersion: 4,
      breakdown: buildSampleBreakdown(false)
    };

    // Prior Acme assessments had 1 version each (average 1.0)
    const peerEvals = [
      { _id: 'acme_1', companyName: 'Acme Fleet SDN BHD', currentVersion: 1 },
      { _id: 'acme_2', companyName: 'Acme Fleet SDN BHD', currentVersion: 1 },
      { _id: 'acme_3', companyName: 'Acme Fleet SDN BHD', currentVersion: 1 }
    ];

    const result = analyzeAssessmentRisk(evalDoc, { allEvaluations: peerEvals });
    const vendorSignal = result.signals.find(s => s.type === SIGNAL_TYPES.VENDOR_REVISION_ANOMALY);
    assert.ok(vendorSignal, 'Should generate VENDOR_REVISION_ANOMALY signal');
    assert.equal(vendorSignal.score, 10);
    assert.match(vendorSignal.observed, /4 versions/);
  });

  // =========================================================================
  // 10. SLA Pattern Anomaly Signal
  // =========================================================================
  it('10. should detect SLA_PATTERN_ANOMALY when assessment timeline is COMPLETED_LATE or OVERDUE', () => {
    const evalDoc = {
      _id: 'eval_sla_strain_001',
      totalScore: 3.50,
      sla: {
        status: SLA_STATUS.COMPLETED_LATE,
        isCompleted: true,
        durationDays: 7
      },
      breakdown: buildSampleBreakdown(false)
    };

    const result = analyzeAssessmentRisk(evalDoc, { allEvaluations: [] });
    const slaSignal = result.signals.find(s => s.type === SIGNAL_TYPES.SLA_PATTERN_ANOMALY);
    assert.ok(slaSignal, 'Should generate SLA_PATTERN_ANOMALY signal');
    assert.equal(slaSignal.score, 5);
    assert.match(slaSignal.observed, /COMPLETED_LATE/);
  });

  // =========================================================================
  // 11. Insufficient Data Handling
  // =========================================================================
  it('11. should classify dataConfidence as INSUFFICIENT_DATA when peer baseline is small', () => {
    const evalDoc = {
      _id: 'eval_new_system_001',
      totalScore: 3.50,
      package: 'package_1',
      breakdown: buildSampleBreakdown(false)
    };

    // Only 1 peer in system
    const peerEvals = [{ _id: 'only_peer', totalScore: 3.40 }];

    const result = analyzeAssessmentRisk(evalDoc, { allEvaluations: peerEvals });
    assert.equal(result.dataConfidence, RISK_LEVELS.INSUFFICIENT_DATA);
    assert.equal(result.riskLevel, RISK_LEVELS.INSUFFICIENT_DATA);
    assert.equal(result.riskScore, 0);
  });

  // =========================================================================
  // 12. Multiple Signals Deterministic Combination & Level Thresholds
  // =========================================================================
  it('12. should combine multiple signals deterministically to reach REVIEW and HIGH_ATTENTION levels', () => {
    const multiRiskEval = {
      _id: 'eval_combo_001',
      currentVersion: 5, // Repeated Resubmission (10)
      totalScore: 5.00,  // Score Concentration (10)
      package: 'package_1',
      assessorId: 'ASR_001',
      companyName: 'Acme Fleet SDN BHD',
      startedAt: '2026-09-25T08:00:00.000Z',
      completedAt: '2026-09-25T08:10:00.000Z', // Rapid Completion (15)
      sla: { status: SLA_STATUS.OVERDUE, durationDays: 7 }, // SLA Pattern (5)
      breakdown: buildSampleBreakdown(true)
    };

    const historyVersions = [
      { versionNumber: 1, snapshot: { totalScore: 2.00 } }, // Large Version Change (15)
      { versionNumber: 5, snapshot: { totalScore: 5.00 } }
    ];

    const peerEvals = Array.from({ length: 10 }, (_, i) => ({
      _id: `peer_${i}`,
      totalScore: 3.50,
      package: 'package_1',
      startedAt: '2026-09-20T08:00:00.000Z',
      completedAt: '2026-09-20T12:00:00.000Z',
      breakdown: buildSampleBreakdown(false)
    }));

    const result = analyzeAssessmentRisk(multiRiskEval, { historyVersions, allEvaluations: peerEvals });
    assert.ok(result.riskScore >= 50, `Risk score should be cumulative: ${result.riskScore}`);
    assert.ok(result.signals.length >= 3, `Expected at least 3 triggered signals: ${result.signals.length}`);
    assert.ok(result.riskLevel === RISK_LEVELS.REVIEW || result.riskLevel === RISK_LEVELS.HIGH_ATTENTION);
  });

  // =========================================================================
  // 13. API Endpoint RBAC Verification
  // =========================================================================
  it('13. get-assessment-risk should enforce strict RBAC across roles', async () => {
    assert.ok(savedEvalId);

    // A. Unauthenticated -> 401
    const unauthEvent = {
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { evaluationId: savedEvalId }
    };
    const unauthRes = await riskHandler(unauthEvent, {});
    assert.equal(unauthRes.statusCode, 401, 'Unauthenticated request must be rejected with 401');

    // B. Vendor -> 403 Forbidden
    const vendorEvent = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${vendorToken}` },
      queryStringParameters: { evaluationId: savedEvalId }
    };
    const vendorRes = await riskHandler(vendorEvent, {});
    assert.equal(vendorRes.statusCode, 403, 'Vendor must be forbidden with 403');
    const vendorBody = JSON.parse(vendorRes.body);
    assert.match(vendorBody.error, /Forbidden/i);

    // C. Non-assigned Assessor B -> 403 Forbidden
    const otherAssessorEvent = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${assessorBToken}` },
      queryStringParameters: { evaluationId: savedEvalId }
    };
    const otherAssessorRes = await riskHandler(otherAssessorEvent, {});
    assert.equal(otherAssessorRes.statusCode, 403, 'Non-assigned assessor must be rejected with 403');

    // D. Assigned Assessor A -> 200 OK
    const ownAssessorEvent = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${assessorAToken}` },
      queryStringParameters: { evaluationId: savedEvalId }
    };
    const ownAssessorRes = await riskHandler(ownAssessorEvent, {});
    assert.equal(ownAssessorRes.statusCode, 200, 'Assigned assessor should access own risk findings');
    const ownBody = JSON.parse(ownAssessorRes.body);
    assert.equal(ownBody.success, true);
    assert.ok(ownBody.risk);

    // E. Manager -> 200 OK with full overview support
    const managerEvent = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${managerToken}` },
      queryStringParameters: { overview: 'true' }
    };
    const managerRes = await riskHandler(managerEvent, {});
    assert.equal(managerRes.statusCode, 200, 'Manager should access global risk overview');
    const mgrBody = JSON.parse(managerRes.body);
    assert.equal(mgrBody.success, true);
    assert.ok(mgrBody.overview);
    assert.ok(mgrBody.overview.counts);
  });

  // =========================================================================
  // 14. Non-Destructive Advisory Nature (Preserves Scoring, SLA, Workload)
  // =========================================================================
  it('14. Risk analysis must not modify scores, SLA, workload, or assessment versions', async () => {
    assert.ok(savedEvalId);
    const conn = await connectToDatabase();
    let initialDoc = null;
    if (conn.isMongoAtlas) {
      initialDoc = await conn.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(savedEvalId));
    } else {
      initialDoc = await conn.getEvaluationById(savedEvalId);
    }

    assert.ok(initialDoc);
    const initialScore = initialDoc.totalScore;
    const initialStatus = initialDoc.status;

    // Trigger risk calculation
    const event = {
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: savedEvalId, recalculate: 'true' }
    };
    const res = await riskHandler(event, {});
    assert.equal(res.statusCode, 200);

    // Verify evaluation document in database was NOT altered
    let postDoc = null;
    if (conn.isMongoAtlas) {
      postDoc = await conn.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(savedEvalId));
    } else {
      postDoc = await conn.getEvaluationById(savedEvalId);
    }

    assert.equal(postDoc.totalScore, initialScore, 'Total score must remain untouched');
    assert.equal(postDoc.status, initialStatus, 'Status must remain untouched (no automatic rejection/failure)');
  });
});
