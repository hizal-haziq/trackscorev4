/**
 * Unit Tests for TrackScore Scoring Engine (rubric.js)
 * Covers TrackScore Version 1.1 (May 2025) / Rubric v2.0:
 * - Section A Max Computation (3.50 pts)
 * - Section B Max Computation (1.50 pts)
 * - Total Max Computation (5.00 pts)
 * - Section A Raw Points (36.75 pts) and Section B Raw Points (10.25 pts)
 * - Raw Point Sectional Scaling Formula
 * - Star Rating Thresholds and MIROS Grade Classifications (0 to 5 Stars)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  computeSectionMax,
  computeSectionMaxRaw,
  computeCriterionMaxRawPoints,
  computeItemRawPoints,
  MAX_SCORE_A,
  MAX_SCORE_B,
  MAX_TOTAL_SCORE,
  MAX_RAW_SCORE_A,
  MAX_RAW_SCORE_B,
  MAX_RAW_TOTAL,
  recomputeScores
} from '../netlify/functions/rubric.js';

describe('Scoring Engine - Maximum Calculations (v2.0 / May 2025 Spec)', () => {
  it('should accurately report Section A scaled max score as 3.50 points', () => {
    assert.equal(MAX_SCORE_A, 3.50, 'Exported MAX_SCORE_A constant should equal 3.50');
    assert.equal(computeSectionMax(SECTION_A_CRITERIA), 3.50, 'computeSectionMax for Section A should equal 3.50');
  });

  it('should accurately report Section B scaled max score as 1.50 points', () => {
    assert.equal(MAX_SCORE_B, 1.50, 'Exported MAX_SCORE_B constant should equal 1.50');
    assert.equal(computeSectionMax(SECTION_B_CRITERIA), 1.50, 'computeSectionMax for Section B should equal 1.50');
  });

  it('should accurately report Total Max score as 5.00 points', () => {
    assert.equal(MAX_TOTAL_SCORE, 5.00, 'Total max score should equal 5.00 (3.50 + 1.50)');
  });

  it('should accurately compute Section A max raw points as 36.75 points', () => {
    const rawA = computeSectionMaxRaw(SECTION_A_CRITERIA);
    assert.equal(rawA, 36.75, 'Section A raw points sum must be 36.75');
    assert.equal(MAX_RAW_SCORE_A, 36.75);
  });

  it('should accurately compute Section B max raw points as 10.25 points', () => {
    const rawB = computeSectionMaxRaw(SECTION_B_CRITERIA);
    assert.equal(rawB, 10.25, 'Section B raw points sum must be 10.25');
    assert.equal(MAX_RAW_SCORE_B, 10.25);
  });

  it('should accurately compute Total Max Raw points as 47.00 points', () => {
    assert.equal(MAX_RAW_TOTAL, 47.00, 'Total raw points must equal 47.00 (36.75 + 10.25)');
  });

  it('should correctly accumulate raw points across tiered options', () => {
    // Trip history options: None (0), 3mo (1.0), >3mo-1yr (0.25), >1yr (0.5)
    const tripHist = SECTION_A_CRITERIA.find(c => c.id === 'trip_history');
    assert.equal(computeItemRawPoints(tripHist, 0), 0.0);
    assert.equal(computeItemRawPoints(tripHist, 1), 1.0);
    assert.equal(computeItemRawPoints(tripHist, 2), 1.25);
    assert.equal(computeItemRawPoints(tripHist, 3), 1.75);
    assert.equal(computeCriterionMaxRawPoints(tripHist), 1.75);
  });

  it('should produce 3.50 Section A, 1.50 Section B, 5.00 Total and 5.00 star rating when maximum options are selected', () => {
    // Select highest tier option for every criterion
    const maxBreakdown = [
      ...SECTION_A_CRITERIA.map(c => {
        const topOpt = c.options[c.options.length - 1];
        return { id: c.id, selectedOption: topOpt.label };
      }),
      ...SECTION_B_CRITERIA.map(c => {
        const topOpt = c.options[c.options.length - 1];
        return { id: c.id, selectedOption: topOpt.label };
      })
    ];

    const result = recomputeScores(maxBreakdown);
    assert.equal(result.rawEarnedA, 36.75);
    assert.equal(result.rawEarnedB, 10.25);
    assert.equal(result.sectionAScore, 3.50);
    assert.equal(result.sectionBScore, 1.50);
    assert.equal(result.totalScore, 5.00);
    assert.equal(result.starRating, 5.00);
    assert.equal(result.starsCount, 5);
    assert.match(result.ratingLabel, /Grade A/);
  });

  it('should produce 0.00 total and 0 Stars (Not Rated) when all options are None (0)', () => {
    const emptyBreakdown = [
      ...SECTION_A_CRITERIA.map(c => ({ id: c.id, selectedOption: 'None (0)', points: 0 })),
      ...SECTION_B_CRITERIA.map(c => ({ id: c.id, selectedOption: 'None (0)', points: 0 }))
    ];

    const result = recomputeScores(emptyBreakdown);
    assert.equal(result.sectionAScore, 0.0);
    assert.equal(result.sectionBScore, 0.0);
    assert.equal(result.totalScore, 0.0);
    assert.equal(result.starRating, 0.0);
    assert.equal(result.starsCount, 0);
    assert.match(result.ratingLabel, /Not Rated/);
  });
});

describe('Scoring Engine - Star Rating Thresholds and MIROS Grade Classification', () => {
  it('should classify score >= 4.50 as 5 Stars - Grade A', () => {
    // Max options in both sections gives 5.00
    const maxBreakdown = [
      ...SECTION_A_CRITERIA.map(c => ({ id: c.id, selectedOption: c.options[c.options.length - 1].label })),
      ...SECTION_B_CRITERIA.map(c => ({ id: c.id, selectedOption: c.options[c.options.length - 1].label }))
    ];
    const result = recomputeScores(maxBreakdown);
    assert.ok(result.totalScore >= 4.50);
    assert.equal(result.starsCount, 5);
    assert.equal(result.ratingLabel, '5 Stars - Outstanding (MIROS Certified Grade A)');
  });

  it('should classify score in [3.75, 4.49] as 4 Stars - Grade B', () => {
    // Select all Section A (3.50) + 1 point in Section B (tow_detection available = 1.0 raw out of 10.25 -> 0.15 pts) -> 3.65
    // Let's craft: all Section A (3.50) + panic_button (1.25) + mfa (1.0) + sop (1.0) + service (1.0) = 4.25 raw out of 10.25 -> 0.62 pts -> Total = 4.12
    const breakdown = [
      ...SECTION_A_CRITERIA.map(c => ({ id: c.id, selectedOption: c.options[c.options.length - 1].label })),
      { id: 'tow_detection', selectedOption: 'Available' },
      { id: 'panic_button', selectedOption: 'SMS/WhatsApp' },
      { id: 'mfa', selectedOption: 'OTP + Security PIN' },
      { id: 'sop_tech_problems', selectedOption: 'Solved in 3 business days' }
    ];
    const result = recomputeScores(breakdown);
    assert.ok(result.totalScore >= 3.75 && result.totalScore < 4.50, `Expected total between 3.75 and 4.49, got ${result.totalScore}`);
    assert.equal(result.starsCount, 4);
    assert.equal(result.ratingLabel, '4 Stars - Very Good (MIROS Grade B)');
  });

  it('should classify score in [3.00, 3.74] as 3 Stars - Grade C', () => {
    // Full Section A alone = 3.50
    const breakdown = [
      ...SECTION_A_CRITERIA.map(c => ({ id: c.id, selectedOption: c.options[c.options.length - 1].label }))
    ];
    const result = recomputeScores(breakdown);
    assert.equal(result.sectionAScore, 3.50);
    assert.equal(result.sectionBScore, 0.0);
    assert.equal(result.totalScore, 3.50);
    assert.ok(result.totalScore >= 3.00 && result.totalScore < 3.75);
    assert.equal(result.starsCount, 3);
    assert.equal(result.ratingLabel, '3 Stars - Satisfactory (MIROS Grade C)');
  });

  it('should classify score in [2.00, 2.99] as 2 Stars - Grade D', () => {
    // Select first option for 18 Section A items: 18 * 1.0 = 18.0 raw / 36.75 * 3.50 = 1.714
    // plus 6 items tier 2 (6 * 1.25 = 7.5 raw): 25.5 raw / 36.75 * 3.50 = 2.428
    const breakdown = SECTION_A_CRITERIA.slice(0, 20).map(c => ({
      id: c.id,
      selectedOption: c.options[1].label
    }));
    // 20 * 1.0 = 20 raw / 36.75 * 3.50 = 1.905 + 1.0 in Section B (0.15) = 2.05
    breakdown.push({ id: 'tow_detection', selectedOption: 'Available' });
    breakdown.push({ id: 'mfa', selectedOption: 'OTP + Security PIN' });
    const result = recomputeScores(breakdown);
    assert.ok(result.totalScore >= 2.00 && result.totalScore < 3.00, `Expected total in [2.00, 2.99], got ${result.totalScore}`);
    assert.equal(result.starsCount, 2);
    assert.equal(result.ratingLabel, '2 Stars - Marginal (MIROS Grade D)');
  });

  it('should classify score in [1.25, 1.99] as 1 Star - Grade E', () => {
    // Select 15 items in Section A with tier 1 (1.0 each) = 15.0 raw / 36.75 * 3.50 = 1.43
    const breakdown = SECTION_A_CRITERIA.slice(0, 15).map(c => ({
      id: c.id,
      selectedOption: c.options[1].label
    }));
    const result = recomputeScores(breakdown);
    assert.ok(result.totalScore >= 1.25 && result.totalScore < 2.00, `Expected total in [1.25, 1.99], got ${result.totalScore}`);
    assert.equal(result.starsCount, 1);
    assert.equal(result.ratingLabel, '1 Star - Substandard (MIROS Grade E)');
  });

  it('should classify score < 1.25 as 0 Stars - Not Rated', () => {
    // Select only 5 items in Section A with tier 1 (1.0 each) = 5.0 raw / 36.75 * 3.50 = 0.48
    const breakdown = SECTION_A_CRITERIA.slice(0, 5).map(c => ({
      id: c.id,
      selectedOption: c.options[1].label
    }));
    const result = recomputeScores(breakdown);
    assert.ok(result.totalScore < 1.25, `Expected total < 1.25, got ${result.totalScore}`);
    assert.equal(result.starsCount, 0);
    assert.equal(result.ratingLabel, '0 Stars - Not Rated (MIROS Non-Compliant)');
  });

  it('should support backward-compatible alias resolution for legacy v1.0 data labels', () => {
    const legacyBreakdown = [
      { id: 'trip_history', selectedOption: '<=3 months' }, // maps to '3mo' (1.0)
      { id: 'realtime_tracking', selectedOption: 'Available' }, // 1.0
      { id: 'map_source', selectedOption: 'Open updated' }, // maps to 'open source + latest update' (1.75)
      { id: 'geofence', selectedOption: 'Radius' }, // 1.0
      { id: 'geofence_alert', selectedOption: 'SMS/Call' }, // maps to 'sms/whatsapp/call' (1.25)
      { id: 'tow_detection', selectedOption: 'Available' }, // 1.0
      { id: 'tampered_alert', selectedOption: 'Push' } // 1.75
    ];

    const result = recomputeScores(legacyBreakdown);
    assert.ok(result.rawEarnedA > 0);
    assert.ok(result.rawEarnedB > 0);
    assert.ok(result.totalScore > 0);
    assert.equal(result.rubricVersion, '2.0');
  });
});
