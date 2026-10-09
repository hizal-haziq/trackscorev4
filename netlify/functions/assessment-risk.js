/**
 * TrackScore Assessment Risk & Anomaly Detection Engine
 * Operational and compliance intelligence layer for telematics digital evaluations.
 * 
 * Analyzes multi-dimensional evaluation signals:
 * 1. Rapid Completion (RAPID_COMPLETION)
 * 2. Unusual Score Concentration (SCORE_CONCENTRATION)
 * 3. Unusual Criterion Pattern (CRITERION_PATTERN_ANOMALY)
 * 4. Large Version Score Change (LARGE_VERSION_CHANGE)
 * 5. Repeated Revision Pattern (REPEATED_RESUBMISSION)
 * 6. Assessor Score Outlier (ASSESSOR_SCORE_OUTLIER)
 * 7. Assessor Consistency Signal (ASSESSOR_CONSISTENCY_SIGNAL)
 * 8. Vendor Revision Anomaly (VENDOR_REVISION_ANOMALY)
 * 9. SLA Strain / Pattern Anomaly (SLA_PATTERN_ANOMALY)
 * 
 * Strict Guarantees:
 * - Read-only advisory signals: NEVER automatically rejects, fails, blocks, or alters scores.
 * - Neutral, objective, and explainable observations (no accusations of fraud or incompetence).
 * - Distinguishes NORMAL from INSUFFICIENT_DATA when baseline volume is low.
 */

import { SECTION_A_CRITERIA, SECTION_B_CRITERIA } from './rubric.js';
import { calculateAssessmentSla, SLA_STATUS } from './sla.js';

export const RISK_LEVELS = {
  NORMAL: 'NORMAL',
  REVIEW: 'REVIEW',
  HIGH_ATTENTION: 'HIGH_ATTENTION',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
};

export const SIGNAL_TYPES = {
  RAPID_COMPLETION: 'RAPID_COMPLETION',
  SCORE_CONCENTRATION: 'SCORE_CONCENTRATION',
  CRITERION_PATTERN_ANOMALY: 'CRITERION_PATTERN_ANOMALY',  
  LARGE_VERSION_CHANGE: 'LARGE_VERSION_CHANGE',
  REPEATED_RESUBMISSION: 'REPEATED_RESUBMISSION',
  ASSESSOR_SCORE_OUTLIER: 'ASSESSOR_SCORE_OUTLIER',
  ASSESSOR_CONSISTENCY_SIGNAL: 'ASSESSOR_CONSISTENCY_SIGNAL',
  VENDOR_REVISION_ANOMALY: 'VENDOR_REVISION_ANOMALY',
  SLA_PATTERN_ANOMALY: 'SLA_PATTERN_ANOMALY'
};

export const SIGNAL_WEIGHTS = {
  [SIGNAL_TYPES.RAPID_COMPLETION]: 15,
  [SIGNAL_TYPES.SCORE_CONCENTRATION]: 10,
  [SIGNAL_TYPES.CRITERION_PATTERN_ANOMALY]: 15,
  [SIGNAL_TYPES.LARGE_VERSION_CHANGE]: 15,
  [SIGNAL_TYPES.REPEATED_RESUBMISSION]: 10,
  [SIGNAL_TYPES.ASSESSOR_SCORE_OUTLIER]: 15,
  [SIGNAL_TYPES.ASSESSOR_CONSISTENCY_SIGNAL]: 10,
  [SIGNAL_TYPES.VENDOR_REVISION_ANOMALY]: 10,
  [SIGNAL_TYPES.SLA_PATTERN_ANOMALY]: 5
};

export const DEFAULT_THRESHOLDS = {
  MIN_GENERAL_SAMPLE: 5,
  MIN_ASSESSOR_SAMPLE: 3,
  MIN_VENDOR_SAMPLE: 2,
  RAPID_COMPLETION_RATIO: 0.25, // Less than 25% of historical median
  RAPID_COMPLETION_MIN_MINUTES: 30,
  LARGE_SCORE_DELTA_PCT: 25,    // 25% score change between versions
  LARGE_SCORE_DELTA_PTS: 1.25,  // 1.25 pts out of 5.00
  MAX_TYPICAL_VERSIONS: 3       // 4 or more versions is a repeated resubmission
};

/**
 * Derives the completion duration of an evaluation in minutes based on verifiable status history.
 * If reliable start and completion timestamps are unavailable, returns null (never invents data).
 */
export function extractAssessmentDurationMinutes(evaluation) {
  if (!evaluation) return null;

  // 1. Check explicit timestamps if present
  let startTime = null;
  let endTime = null;

  if (evaluation.startedAt) {
    startTime = new Date(evaluation.startedAt).getTime();
  } else if (Array.isArray(evaluation.statusHistory) && evaluation.statusHistory.length > 0) {
    // Look for earliest registration, assignment, or initial creation entry
    const startEntry = evaluation.statusHistory.find(s => 
      s && (s.status === 'registered' || s.status === 'scheduled' || s.status === 'submitted')
    ) || evaluation.statusHistory[0];
    if (startEntry?.timestamp || startEntry?.changedAt) {
      startTime = new Date(startEntry.timestamp || startEntry.changedAt).getTime();
    }
  }

  if (evaluation.completedAt) {
    endTime = new Date(evaluation.completedAt).getTime();
  } else if (evaluation.submittedAt || evaluation.statusChangedAt) {
    endTime = new Date(evaluation.submittedAt || evaluation.statusChangedAt).getTime();
  } else if (Array.isArray(evaluation.statusHistory) && evaluation.statusHistory.length > 0) {
    const endEntry = [...evaluation.statusHistory].reverse().find(s => 
      s && (s.status === 'completed' || s.status === 'approved' || s.status === 'pending_review' || s.status === 'submitted')
    );
    if (endEntry?.timestamp || endEntry?.changedAt) {
      endTime = new Date(endEntry.timestamp || endEntry.changedAt).getTime();
    }
  }

  if (!startTime || !endTime || isNaN(startTime) || isNaN(endTime)) {
    return null;
  }

  const durationMs = endTime - startTime;
  if (durationMs <= 0) {
    return null;
  }

  return Math.round(durationMs / 60000);
}

/**
 * Calculates statistical mean and standard deviation for an array of numbers.
 */
export function computeStats(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return { count: 0, mean: 0, stdDev: 0, median: 0 };
  }
  const clean = numbers.filter(n => typeof n === 'number' && !isNaN(n));
  if (clean.length === 0) return { count: 0, mean: 0, stdDev: 0, median: 0 };

  const count = clean.length;
  const sum = clean.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  const variance = clean.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const sorted = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return { count, mean, stdDev, median };
}

/**
 * Analyzes risk and anomalies for a single assessment against historical baselines.
 * 
 * @param {Object} currentEvaluation - Authoritative evaluation document
 * @param {Object} context - Historical context:
 *   - historyVersions: Array of assessment_versions records for this evaluation
 *   - allEvaluations: Array of peer evaluations across the system for baseline benchmarking
 *   - customThresholds: Optional overrides
 * @returns {Object} Structured assessment risk analysis findings
 */
export function analyzeAssessmentRisk(currentEvaluation, context = {}) {
  const {
    historyVersions = [],
    allEvaluations = [],
    customThresholds = {}
  } = context;

  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  const evaluationId = String(currentEvaluation?._id || currentEvaluation?.id || 'unknown');
  const currentVersion = Number(currentEvaluation?.currentVersion || 1);
  const currentTotalScore = Number(currentEvaluation?.totalScore || 0);
  const currentPackage = currentEvaluation?.package || 'package_1';
  const currentPackageName = currentEvaluation?.packageName || (currentPackage === 'package_2' ? 'Package 2: Comprehensive Assessment' : 'Package 1: Standard Assessment');
  const assessorId = currentEvaluation?.assessorId || currentEvaluation?.assignedAssessorId || null;
  const assessorName = currentEvaluation?.assessorName || currentEvaluation?.assignedAssessor || 'Assessor';
  const companyName = currentEvaluation?.companyName || 'Unknown Vendor';

  // Filter historical comparison peer records (exclude self)
  const peerEvaluations = allEvaluations.filter(e => {
    const eId = String(e._id || e.id);
    return eId !== evaluationId && !e.deletedAt;
  });

  const totalBaselineEvaluations = peerEvaluations.length;

  // Determine baseline data confidence
  let dataConfidence = RISK_LEVELS.NORMAL;
  if (totalBaselineEvaluations < thresholds.MIN_GENERAL_SAMPLE) {
    dataConfidence = RISK_LEVELS.INSUFFICIENT_DATA;
  } else if (totalBaselineEvaluations < 10) {
    dataConfidence = 'MEDIUM';
  } else {
    dataConfidence = 'HIGH';
  }

  const signals = [];
  const benchmarkingNotes = [];

  // =========================================================================
  // Signal 1 — Rapid Assessment Completion (RAPID_COMPLETION)
  // =========================================================================
  const currentDurationMin = extractAssessmentDurationMinutes(currentEvaluation);
  if (currentDurationMin !== null) {
    const peerDurations = peerEvaluations
      .map(e => extractAssessmentDurationMinutes(e))
      .filter(d => d !== null && d > 0);

    if (peerDurations.length >= 3) {
      const durationStats = computeStats(peerDurations);
      const medianDuration = durationStats.median || durationStats.mean || 180;
      const ratio = currentDurationMin / medianDuration;

      if (ratio <= thresholds.RAPID_COMPLETION_RATIO && currentDurationMin < thresholds.RAPID_COMPLETION_MIN_MINUTES) {
        const severity = ratio < 0.15 ? 'HIGH' : 'MEDIUM';
        signals.push({
          type: SIGNAL_TYPES.RAPID_COMPLETION,
          severity,
          score: SIGNAL_WEIGHTS[SIGNAL_TYPES.RAPID_COMPLETION],
          name: 'Rapid Assessment Completion',
          observed: `Completion turnaround was ${currentDurationMin} minutes`,
          baseline: `Historical median is ${Math.round(medianDuration)} minutes (across ${peerDurations.length} assessments)`,
          explanation: `Assessment duration of ${currentDurationMin} min was significantly shorter than the historical baseline median of ${Math.round(medianDuration)} min (${Math.round(ratio * 100)}% of baseline).`
        });
      }
    } else {
      benchmarkingNotes.push('Insufficient historical duration timestamps for duration comparison.');
    }
  } else {
    benchmarkingNotes.push('Assessment start or completion timestamps unavailable for duration calculation.');
  }

  // =========================================================================
  // Signal 2 — Unusual Score Concentration (SCORE_CONCENTRATION)
  // =========================================================================
  const breakdown = Array.isArray(currentEvaluation?.breakdown) ? currentEvaluation.breakdown : [];
  const passedCriteriaCount = breakdown.filter(b => Number(b.points || 0) > 0).length;
  const isPerfectScore = passedCriteriaCount === 33 || (passedCriteriaCount >= 32 && currentTotalScore >= 4.90);

  if (isPerfectScore) {
    // Benchmark incidence of perfect/near-perfect scores in comparison group
    const peersWithBreakdown = peerEvaluations.filter(e => Array.isArray(e.breakdown) && e.breakdown.length > 0);
    if (peersWithBreakdown.length >= thresholds.MIN_GENERAL_SAMPLE) {
      const perfectPeers = peersWithBreakdown.filter(e => {
        const passed = (e.breakdown || []).filter(b => Number(b.points || 0) > 0).length;
        return passed >= 32 || Number(e.totalScore || 0) >= 4.90;
      });
      const incidenceRate = (perfectPeers.length / peersWithBreakdown.length) * 100;

      // Only trigger if perfect scores are historically uncommon (< 25% of baseline)
      if (incidenceRate < 25) {
        signals.push({
          type: SIGNAL_TYPES.SCORE_CONCENTRATION,
          severity: 'LOW',
          score: SIGNAL_WEIGHTS[SIGNAL_TYPES.SCORE_CONCENTRATION],
          name: 'Unusual Score Concentration',
          observed: `Passed ${passedCriteriaCount} of 33 criteria (Score: ${currentTotalScore.toFixed(2)}/5.00)`,
          baseline: `Historical incidence of near-perfect scores is ${incidenceRate.toFixed(1)}% (${perfectPeers.length}/${peersWithBreakdown.length})`,
          explanation: `This assessment passed ${passedCriteriaCount} of 33 criteria (Score: ${currentTotalScore.toFixed(2)}/5.00). This high score concentration is uncommon within the historical comparison group (${incidenceRate.toFixed(1)}% historical incidence).`
        });
      }
    } else {
      // If historical data is scarce, document observation neutrally without penalizing
      benchmarkingNotes.push(`Assessment passed ${passedCriteriaCount}/33 criteria; historical comparison sample is too small for incidence calculation.`);
    }
  }

  // =========================================================================
  // Signal 3 — Unusual Criterion Pattern (CRITERION_PATTERN_ANOMALY)
  // =========================================================================
  const samePackagePeers = peerEvaluations.filter(e => 
    (e.package || 'package_1') === currentPackage && Array.isArray(e.breakdown) && e.breakdown.length > 0
  );

  if (samePackagePeers.length >= thresholds.MIN_GENERAL_SAMPLE && breakdown.length > 0) {
    const divergentCriteria = [];

    // Calculate pass rate per criterion in the same package
    for (const criterion of breakdown) {
      const cid = criterion.id;
      const peerObservations = samePackagePeers.map(p => {
        const item = (p.breakdown || []).find(b => b.id === cid);
        return item ? Number(item.points || 0) > 0 : null;
      }).filter(v => v !== null);

      if (peerObservations.length >= thresholds.MIN_GENERAL_SAMPLE) {
        const passes = peerObservations.filter(Boolean).length;
        const passRate = passes / peerObservations.length;
        const currentPassed = Number(criterion.points || 0) > 0;

        // Anomaly: Passed a criterion that historically rarely passes (< 20% pass rate)
        if (currentPassed && passRate < 0.20) {
          divergentCriteria.push({
            id: cid,
            name: criterion.name || cid,
            historicalPassRate: Math.round(passRate * 100),
            observed: 'Passed (Points awarded)',
            expected: `Pass rate normally ${Math.round(passRate * 100)}%`
          });
        }
      }
    }

    if (divergentCriteria.length >= 2) {
      const summaryList = divergentCriteria.map(d => `${d.name} (pass rate: ${d.historicalPassRate}%)`).join(', ');
      signals.push({
        type: SIGNAL_TYPES.CRITERION_PATTERN_ANOMALY,
        severity: 'MEDIUM',
        score: SIGNAL_WEIGHTS[SIGNAL_TYPES.CRITERION_PATTERN_ANOMALY],
        name: 'Unusual Criterion Pattern',
        observed: `${divergentCriteria.length} criteria were awarded points despite low historical pass rates`,
        baseline: `Package: ${currentPackageName} (${samePackagePeers.length} peer assessments)`,
        details: divergentCriteria,
        explanation: `Assessment criteria selections diverge from historical patterns for ${currentPackageName}. The following criteria were awarded points despite having low historical pass rates (<20%): ${summaryList}.`
      });
    }
  } else {
    benchmarkingNotes.push(`Criterion pattern benchmarking requires at least ${thresholds.MIN_GENERAL_SAMPLE} peer assessments in ${currentPackageName}.`);
  }

  // =========================================================================
  // Signal 4 — Large Version Score Change (LARGE_VERSION_CHANGE)
  // =========================================================================
  if (Array.isArray(historyVersions) && historyVersions.length > 1) {
    const sortedVersions = [...historyVersions].sort((a, b) => (a.versionNumber || 0) - (b.versionNumber || 0));
    const firstVersion = sortedVersions[0];
    const prevVersion = sortedVersions[sortedVersions.length - 2];
    const latestVersion = sortedVersions[sortedVersions.length - 1];

    const vPrevScore = Number(prevVersion?.snapshot?.totalScore ?? prevVersion?.totalScore ?? firstVersion?.snapshot?.totalScore ?? 0);
    const vCurrScore = Number(latestVersion?.snapshot?.totalScore ?? currentTotalScore ?? 0);

    const scoreDelta = Math.abs(vCurrScore - vPrevScore);
    const scoreDeltaPct = (scoreDelta / 5.00) * 100;

    if (scoreDeltaPct >= thresholds.LARGE_SCORE_DELTA_PCT || scoreDelta >= thresholds.LARGE_SCORE_DELTA_PTS) {
      signals.push({
        type: SIGNAL_TYPES.LARGE_VERSION_CHANGE,
        severity: 'HIGH',
        score: SIGNAL_WEIGHTS[SIGNAL_TYPES.LARGE_VERSION_CHANGE],
        name: 'Large Version Score Change',
        observed: `Score changed by ${scoreDeltaPct.toFixed(1)} percentage points (${scoreDelta.toFixed(2)} pts) between v${prevVersion.versionNumber} and v${latestVersion.versionNumber}`,
        baseline: `Version ${prevVersion.versionNumber}: ${vPrevScore.toFixed(2)} pts → Version ${latestVersion.versionNumber}: ${vCurrScore.toFixed(2)} pts`,
        explanation: `Assessment score changed significantly by ${scoreDeltaPct.toFixed(1)} percentage points (from ${vPrevScore.toFixed(2)} in v${prevVersion.versionNumber} to ${vCurrScore.toFixed(2)} in v${latestVersion.versionNumber}).`
      });
    }
  }

  // =========================================================================
  // Signal 5 — Repeated Revision Pattern (REPEATED_RESUBMISSION)
  // =========================================================================
  const versionCount = Math.max(
    currentVersion,
    Array.isArray(historyVersions) ? historyVersions.length : 1,
    Array.isArray(currentEvaluation?.evaluationHistory) ? currentEvaluation.evaluationHistory.length : 1
  );

  if (versionCount > thresholds.MAX_TYPICAL_VERSIONS) {
    const peerVersionCounts = peerEvaluations.map(e => Number(e.currentVersion || 1));
    const versionStats = computeStats(peerVersionCounts);
    const avgVersions = versionStats.mean || 1.3;

    signals.push({
      type: SIGNAL_TYPES.REPEATED_RESUBMISSION,
      severity: versionCount >= 5 ? 'HIGH' : 'MEDIUM',
      score: SIGNAL_WEIGHTS[SIGNAL_TYPES.REPEATED_RESUBMISSION],
      name: 'Repeated Revision Pattern',
      observed: `Assessment has undergone ${versionCount} submitted versions`,
      baseline: `Historical average is ${avgVersions.toFixed(1)} versions per assessment`,
      explanation: `This assessment has undergone ${versionCount} submitted versions, exceeding the typical threshold of ${thresholds.MAX_TYPICAL_VERSIONS} revisions (historical average: ${avgVersions.toFixed(1)}).`
    });
  }

  // =========================================================================
  // Signal 6 — Assessor Score Outlier (ASSESSOR_SCORE_OUTLIER)
  // =========================================================================
  if (assessorId) {
    const assessorPeers = peerEvaluations.filter(e => 
      (e.assessorId === assessorId || e.assignedAssessorId === assessorId) &&
      e.totalScore !== undefined && e.totalScore !== null
    );

    if (assessorPeers.length >= thresholds.MIN_ASSESSOR_SAMPLE) {
      const assessorScores = assessorPeers.map(e => Number(e.totalScore || 0));
      const stats = computeStats(assessorScores);

      // Check if current score is > 1.8 standard deviations away or > 1.2 pts from assessor mean
      const deviation = Math.abs(currentTotalScore - stats.mean);
      const isOutlier = (stats.stdDev > 0.15 && deviation > 1.8 * stats.stdDev) || deviation > 1.25;

      if (isOutlier) {
        signals.push({
          type: SIGNAL_TYPES.ASSESSOR_SCORE_OUTLIER,
          severity: 'MEDIUM',
          score: SIGNAL_WEIGHTS[SIGNAL_TYPES.ASSESSOR_SCORE_OUTLIER],
          name: 'Assessor Score Variance',
          observed: `Current score is ${currentTotalScore.toFixed(2)} pts`,
          baseline: `Assessor historical average is ${stats.mean.toFixed(2)} pts (std dev: ${stats.stdDev.toFixed(2)} across ${assessorPeers.length} assessments)`,
          explanation: `Current assessment score of ${currentTotalScore.toFixed(2)} differs noticeably from this assessor's historical score distribution (mean: ${stats.mean.toFixed(2)}, std dev: ${stats.stdDev.toFixed(2)} across ${assessorPeers.length} prior assessments).`
        });
      }
    } else {
      benchmarkingNotes.push(`Assessor score benchmarking requires at least ${thresholds.MIN_ASSESSOR_SAMPLE} prior evaluations for ${assessorName} (currently ${assessorPeers.length}).`);
    }
  }

  // =========================================================================
  // Signal 7 — Assessor Consistency Signal (ASSESSOR_CONSISTENCY_SIGNAL)
  // =========================================================================
  if (assessorId && breakdown.length > 0) {
    const assessorBreakdowns = peerEvaluations.filter(e => 
      (e.assessorId === assessorId || e.assignedAssessorId === assessorId) &&
      Array.isArray(e.breakdown) && e.breakdown.length > 0
    );

    if (assessorBreakdowns.length >= thresholds.MIN_ASSESSOR_SAMPLE) {
      const personalContradictions = [];

      for (const criterion of breakdown) {
        const cid = criterion.id;
        const currentPassed = Number(criterion.points || 0) > 0;
        const pastPasses = assessorBreakdowns.map(ab => {
          const item = (ab.breakdown || []).find(b => b.id === cid);
          return item ? Number(item.points || 0) > 0 : null;
        }).filter(v => v !== null);

        if (pastPasses.length >= thresholds.MIN_ASSESSOR_SAMPLE) {
          const personalRate = pastPasses.filter(Boolean).length / pastPasses.length;
          // Contradiction: Assessor usually never awards points (rate < 15%) but awarded points here
          // OR assessor usually always awards points (rate > 85%) but withheld points here
          if ((currentPassed && personalRate < 0.15) || (!currentPassed && personalRate > 0.85)) {
            personalContradictions.push({
              id: cid,
              name: criterion.name || cid,
              personalRate: Math.round(personalRate * 100),
              observed: currentPassed ? 'Passed' : 'Failed'
            });
          }
        }
      }

      if (personalContradictions.length >= 3) {
        signals.push({
          type: SIGNAL_TYPES.ASSESSOR_CONSISTENCY_SIGNAL,
          severity: 'LOW',
          score: SIGNAL_WEIGHTS[SIGNAL_TYPES.ASSESSOR_CONSISTENCY_SIGNAL],
          name: 'Assessor Consistency Signal',
          observed: `${personalContradictions.length} criteria deviated from this assessor's normal evaluation pattern`,
          baseline: `Derived from ${assessorBreakdowns.length} prior itemized evaluations by ${assessorName}`,
          details: personalContradictions,
          explanation: `Criterion-level scoring in this assessment shows noticeable variance compared to this assessor's established scoring consistency across ${assessorBreakdowns.length} prior assessments (${personalContradictions.length} criteria deviated from personal trend).`
        });
      }
    }
  }

  // =========================================================================
  // Signal 8 — Vendor Revision Pattern (VENDOR_REVISION_ANOMALY)
  // =========================================================================
  const vendorPeers = peerEvaluations.filter(e => 
    String(e.companyName || '').trim().toLowerCase() === String(companyName).trim().toLowerCase()
  );

  if (vendorPeers.length >= thresholds.MIN_VENDOR_SAMPLE) {
    const vendorVersionCounts = vendorPeers.map(e => Number(e.currentVersion || 1));
    const vendorStats = computeStats(vendorVersionCounts);
    const vendorAvg = vendorStats.mean || 1.2;

    if (versionCount >= 3 && versionCount > vendorAvg * 2.0) {
      signals.push({
        type: SIGNAL_TYPES.VENDOR_REVISION_ANOMALY,
        severity: 'LOW',
        score: SIGNAL_WEIGHTS[SIGNAL_TYPES.VENDOR_REVISION_ANOMALY],
        name: 'Vendor Revision Pattern',
        observed: `Current assessment has undergone ${versionCount} versions`,
        baseline: `Vendor average across ${vendorPeers.length} prior assessments is ${vendorAvg.toFixed(1)} versions`,
        explanation: `This vendor's assessment required ${versionCount} revisions, compared to their historical average of ${vendorAvg.toFixed(1)} revisions across ${vendorPeers.length} prior assessments.`
      });
    }
  } else {
    benchmarkingNotes.push(`Vendor revision pattern requires at least ${thresholds.MIN_VENDOR_SAMPLE} prior assessments for ${companyName}.`);
  }

  // =========================================================================
  // Signal 9 — SLA Behavior Signal (SLA_PATTERN_ANOMALY)
  // =========================================================================
  const slaSnapshot = currentEvaluation.sla || calculateAssessmentSla(currentEvaluation);
  const slaStatus = slaSnapshot?.status;

  if (slaStatus === SLA_STATUS.COMPLETED_LATE || slaStatus === SLA_STATUS.OVERDUE) {
    signals.push({
      type: SIGNAL_TYPES.SLA_PATTERN_ANOMALY,
      severity: 'LOW',
      score: SIGNAL_WEIGHTS[SIGNAL_TYPES.SLA_PATTERN_ANOMALY],
      name: 'SLA Behavior Signal',
      observed: `Assessment SLA state is ${slaStatus}`,
      baseline: `Target turnaround duration: ${slaSnapshot?.durationDays || 7} calendar days`,
      explanation: `Assessment timeline indicates schedule pressure or overdue milestone completion (${slaStatus}). Recommended for operational process review.`
    });
  }

  // =========================================================================
  // Overall Risk Score & Classification
  // =========================================================================
  const totalRiskScore = signals.reduce((sum, s) => sum + (s.score || 0), 0);

  let riskLevel = RISK_LEVELS.NORMAL;
  if (dataConfidence === RISK_LEVELS.INSUFFICIENT_DATA && totalRiskScore === 0) {
    riskLevel = RISK_LEVELS.INSUFFICIENT_DATA;
  } else if (totalRiskScore >= 60) {
    riskLevel = RISK_LEVELS.HIGH_ATTENTION;
  } else if (totalRiskScore >= 30) {
    riskLevel = RISK_LEVELS.REVIEW;
  } else {
    riskLevel = RISK_LEVELS.NORMAL;
  }

  const generatedAt = new Date().toISOString();

  return {
    evaluationId,
    versionNumber: currentVersion,
    companyName,
    assessorId,
    assessorName,
    packageName: currentPackageName,
    package: currentPackage,
    totalScore: currentTotalScore,
    riskLevel,
    riskScore: totalRiskScore,
    dataConfidence,
    signalsCount: signals.length,
    signals,
    benchmarkingNotes,
    baselineStats: {
      totalEvaluationsCompared: totalBaselineEvaluations,
      samePackageEvaluationsCompared: samePackagePeers.length,
      assessorEvaluationsCompared: peerEvaluations.filter(e => e.assessorId === assessorId || e.assignedAssessorId === assessorId).length,
      vendorEvaluationsCompared: vendorPeers.length
    },
    generatedAt
  };
}

/**
 * Computes aggregate risk overview for manager dashboards
 */
export function computeRiskAggregateOverview(evaluations = [], riskRecords = []) {
  const riskMap = new Map();
  for (const r of riskRecords) {
    if (r && r.evaluationId) {
      riskMap.set(String(r.evaluationId), r);
    }
  }

  let normalCount = 0;
  let reviewCount = 0;
  let highAttentionCount = 0;
  let insufficientDataCount = 0;

  const signalTypeCounts = {};

  for (const e of evaluations) {
    if (!e || e.deletedAt) continue;
    const eId = String(e._id || e.id);
    const risk = riskMap.get(eId);

    const level = risk?.riskLevel || RISK_LEVELS.NORMAL;
    if (level === RISK_LEVELS.HIGH_ATTENTION) highAttentionCount++;
    else if (level === RISK_LEVELS.REVIEW) reviewCount++;
    else if (level === RISK_LEVELS.INSUFFICIENT_DATA) insufficientDataCount++;
    else normalCount++;

    if (risk && Array.isArray(risk.signals)) {
      for (const sig of risk.signals) {
        signalTypeCounts[sig.type] = (signalTypeCounts[sig.type] || 0) + 1;
      }
    }
  }

  const totalAssessed = normalCount + reviewCount + highAttentionCount + insufficientDataCount;

  return {
    totalAssessed,
    counts: {
      [RISK_LEVELS.NORMAL]: normalCount,
      [RISK_LEVELS.REVIEW]: reviewCount,
      [RISK_LEVELS.HIGH_ATTENTION]: highAttentionCount,
      [RISK_LEVELS.INSUFFICIENT_DATA]: insufficientDataCount
    },
    signalDistribution: signalTypeCounts,
    complianceHealthIndex: totalAssessed > 0 
      ? Math.round(((normalCount + insufficientDataCount * 0.8) / totalAssessed) * 100) 
      : 100,
    generatedAt: new Date().toISOString()
  };
}

export default {
  RISK_LEVELS,
  SIGNAL_TYPES,
  SIGNAL_WEIGHTS,
  DEFAULT_THRESHOLDS,
  extractAssessmentDurationMinutes,
  computeStats,
  analyzeAssessmentRisk,
  computeRiskAggregateOverview
};
