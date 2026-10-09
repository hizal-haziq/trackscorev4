/**
 * Unit Tests for TrackScore Assessment SLA & Deadline Tracking System
 * Validates:
 * 1. SLA deadline calculation across packages
 * 2. On-track state (sufficient time remaining)
 * 3. Due-soon state (within 48 hours of deadline)
 * 4. Overdue state (deadline expired, not completed)
 * 5. Completed on-time state (completedAt <= deadline)
 * 6. Completed late state (completedAt > deadline)
 * 7. Graceful handling of missing deadline / dates
 * 8. Graceful handling of invalid date strings
 * 9. Legacy records without explicit SLA fields
 * 10. Human-readable duration formatting
 * 11. Aggregate SLA metrics summary
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLA_STATUS,
  DEFAULT_SLA_CONFIG,
  resolveSlaDurationDays,
  resolveSlaStartAt,
  computeSlaDeadline,
  formatDurationSeconds,
  calculateAssessmentSla,
  computeSlaAggregateSummary
} from '../netlify/functions/sla.js';

describe('Assessment SLA & Deadline Engine Unit Tests', () => {
  const baseTime = new Date('2026-09-20T09:00:00.000Z');

  it('1. should resolve package-specific SLA durations (Package 1 = 7 days, Package 2 = 5 days)', () => {
    assert.equal(resolveSlaDurationDays({ package: 'package_1' }), 7);
    assert.equal(resolveSlaDurationDays({ package: 'package_2' }), 5);
    assert.equal(resolveSlaDurationDays({ requestedPackage: 'package_2' }), 5);
    assert.equal(resolveSlaDurationDays({}), 7, 'Default should be 7 days');
    assert.equal(resolveSlaDurationDays({ slaDurationDays: 3 }), 3, 'Explicit override takes precedence');
  });

  it('2. should correctly compute SLA deadline from start timestamp', () => {
    const startIso = baseTime.toISOString();
    const deadline7Days = computeSlaDeadline({}, startIso, 7);
    const expectedDeadline = new Date('2026-09-27T09:00:00.000Z').toISOString();
    assert.equal(deadline7Days, expectedDeadline);

    const deadline5Days = computeSlaDeadline({}, startIso, 5);
    const expected5Days = new Date('2026-09-25T09:00:00.000Z').toISOString();
    assert.equal(deadline5Days, expected5Days);
  });

  it('3. should classify assessment as ON_TRACK when remaining time > 48 hours', () => {
    const doc = {
      slaStartAt: baseTime.toISOString(),
      slaDurationDays: 7,
      status: 'scheduled'
    };
    // Current time: 2 days after start (5 days remaining > 48h)
    const now = new Date('2026-09-22T09:00:00.000Z');
    const result = calculateAssessmentSla(doc, { now });

    assert.equal(result.status, SLA_STATUS.ON_TRACK);
    assert.equal(result.isCompleted, false);
    assert.equal(result.overdueSeconds, 0);
    assert.equal(result.remainingSeconds, 5 * 86400);
    assert.match(result.remainingFormatted, /5 days remaining/i);
  });

  it('4. should classify assessment as DUE_SOON when remaining time <= 48 hours and > 0', () => {
    const doc = {
      slaStartAt: baseTime.toISOString(),
      slaDurationDays: 7,
      status: 'submitted'
    };
    // Current time: 26 hours before deadline
    const now = new Date('2026-09-26T07:00:00.000Z');
    const result = calculateAssessmentSla(doc, { now });

    assert.equal(result.status, SLA_STATUS.DUE_SOON);
    assert.equal(result.isCompleted, false);
    assert.equal(result.overdueSeconds, 0);
    assert.equal(result.remainingSeconds, 26 * 3600);
    assert.match(result.remainingFormatted, /1 day 2h remaining/i);
  });

  it('5. should classify assessment as OVERDUE when deadline has expired and not completed', () => {
    const doc = {
      slaStartAt: baseTime.toISOString(),
      slaDurationDays: 7,
      status: 'scheduled'
    };
    // Current time: 1 day after deadline
    const now = new Date('2026-09-28T09:00:00.000Z');
    const result = calculateAssessmentSla(doc, { now });

    assert.equal(result.status, SLA_STATUS.OVERDUE);
    assert.equal(result.isCompleted, false);
    assert.equal(result.remainingSeconds, 0);
    assert.equal(result.overdueSeconds, 86400);
    assert.match(result.overdueFormatted, /Overdue by 1 day/i);
  });

  it('6. should classify as COMPLETED_ON_TIME when finished before or at deadline', () => {
    const doc = {
      slaStartAt: baseTime.toISOString(),
      slaDurationDays: 7,
      status: 'completed',
      completedAt: '2026-09-25T12:00:00.000Z' // 1.875 days ahead
    };
    const now = new Date('2026-10-01T00:00:00.000Z'); // Far in future
    const result = calculateAssessmentSla(doc, { now });

    assert.equal(result.status, SLA_STATUS.COMPLETED_ON_TIME);
    assert.equal(result.isCompleted, true);
    assert.equal(result.overdueSeconds, 0);
    assert.match(result.remainingFormatted, /Completed on time/i);
  });

  it('7. should classify as COMPLETED_LATE when finished after deadline', () => {
    const doc = {
      slaStartAt: baseTime.toISOString(),
      slaDurationDays: 7,
      status: 'approved',
      approvedAt: '2026-09-29T15:00:00.000Z' // 2 days 6 hours late
    };
    const now = new Date('2026-10-01T00:00:00.000Z');
    const result = calculateAssessmentSla(doc, { now });

    assert.equal(result.status, SLA_STATUS.COMPLETED_LATE);
    assert.equal(result.isCompleted, true);
    assert.equal(result.remainingSeconds, 0);
    assert.match(result.overdueFormatted, /Completed late by 2 days/i);
  });

  it('8. should gracefully handle missing start date by falling back to createdAt or now', () => {
    const doc = {
      createdAt: '2026-09-15T00:00:00.000Z',
      package: 'package_1'
    };
    const result = calculateAssessmentSla(doc);
    assert.ok(result.startAt);
    assert.ok(result.deadline);
    assert.equal(result.durationDays, 7);
  });

  it('9. should gracefully handle invalid date strings without throwing errors', () => {
    const doc = {
      slaStartAt: 'not-a-valid-date-string',
      slaDeadline: 'invalid-deadline',
      status: 'scheduled'
    };
    const result = calculateAssessmentSla(doc);
    assert.ok(result.startAt);
    assert.ok(result.deadline);
    assert.ok(!isNaN(new Date(result.deadline).getTime()));
  });

  it('10. should correctly format human-readable duration strings', () => {
    assert.equal(formatDurationSeconds(86400 * 5), '5 days');
    assert.equal(formatDurationSeconds(86400 * 1 + 3600 * 4), '1 day 4h');
    assert.equal(formatDurationSeconds(3600 * 18), '18 hours');
    assert.equal(formatDurationSeconds(3600 * 2 + 60 * 14), '2 hours 14m');
    assert.equal(formatDurationSeconds(60 * 35), '35 mins');
    assert.equal(formatDurationSeconds(20), '< 1 min');
  });

  it('11. should compute accurate aggregate SLA summaries', () => {
    const records = [
      // 1. On Track
      { slaStartAt: '2026-09-20T00:00:00.000Z', slaDurationDays: 10, status: 'scheduled' },
      // 2. Due Soon
      { slaStartAt: '2026-09-20T00:00:00.000Z', slaDurationDays: 4, status: 'submitted' },
      // 3. Overdue
      { slaStartAt: '2026-09-10T00:00:00.000Z', slaDurationDays: 5, status: 'scheduled' },
      // 4. Completed on time
      { slaStartAt: '2026-09-10T00:00:00.000Z', slaDurationDays: 7, status: 'completed', completedAt: '2026-09-15T00:00:00.000Z' },
      // 5. Completed late
      { slaStartAt: '2026-09-10T00:00:00.000Z', slaDurationDays: 5, status: 'completed', completedAt: '2026-09-20T00:00:00.000Z' }
    ];

    const now = new Date('2026-09-23T00:00:00.000Z');
    const summary = computeSlaAggregateSummary(records, { now });

    assert.equal(summary.totalActive, 3);
    assert.equal(summary.onTrack, 1);
    assert.equal(summary.dueSoon, 1);
    assert.equal(summary.overdue, 1);
    assert.equal(summary.completedOnTime, 1);
    assert.equal(summary.completedLate, 1);
    assert.equal(summary.totalCompleted, 2);
    assert.equal(summary.complianceRate, '50.0%');
  });
});
