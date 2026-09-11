/**
 * Integration Tests for save-evaluation.js
 * Covers:
 * 1. Valid payload (200) with Assessor JWT
 * 2. Tampered totals that don't match recomputed score (400)
 * 3. Missing/invalid Bearer token (401)
 * 4. Duplicate Company + Device + Assessor + Date (409)
 * 5. Strict Assessor ID Format Validation (400)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/save-evaluation.js';
import { generateToken, ROLE_ASSESSOR } from '../netlify/functions/auth.js';
import { closeDatabaseConnection } from '../netlify/functions/db.js';
import { recomputeScores } from '../netlify/functions/rubric.js';

describe('save-evaluation.js Integration Suite', () => {
  const assessorToken = generateToken({
    role: ROLE_ASSESSOR,
    assessorId: 'MKA 9006',
    name: 'Lead Assessor'
  });

  after(async () => {
    await closeDatabaseConnection();
  });

  // Build a legitimate evaluation payload with matching scores
  function createValidPayload(overrides = {}) {
    const timestamp = Date.now();
    const breakdown = [
      { id: 'trip_history', selectedOption: '3mo', points: 1.0 },
      { id: 'realtime_tracking', selectedOption: 'Available', points: 1.0 },
      { id: 'geofence', selectedOption: 'Radius', points: 1.0 }
    ];
    const recomputed = recomputeScores(breakdown);
    return {
      companyName: `Test Fleet Corp ${timestamp}`,
      deviceModel: `TG-800-${timestamp}`,
      packageName: 'Premium Enterprise',
      assessorName: `Assessor-${timestamp}`,
      assessorId: 'MKA 9006',
      assessmentDate: '2026-03-15',
      breakdown,
      sectionAScore: recomputed.sectionAScore,
      sectionBScore: recomputed.sectionBScore,
      totalScore: recomputed.totalScore,
      starRating: recomputed.starRating,
      ...overrides
    };
  }

  // 1. Missing / Invalid Bearer Token (401)
  it('should return 401 when Authorization header is missing', async () => {
    const payload = createValidPayload();
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    };

    const response = await handler(event, {});
    assert.equal(response.statusCode, 401, 'Should reject request with 401 Unauthorized');
    const body = JSON.parse(response.body);
    assert.ok(body.error, 'Response body should contain error message');
    assert.match(body.error, /Unauthorized|Bearer token/i);
  });

  it('should return 401 when Bearer token is invalid/unrecognized', async () => {
    const payload = createValidPayload();
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer completely-wrong-unauthorized-key'
      },
      body: JSON.stringify(payload)
    };

    const response = await handler(event, {});
    assert.equal(response.statusCode, 401, 'Should return 401 for bad token');
  });

  // 2. Valid Payload (200)
  it('should return 200 and persist evaluation when payload and Assessor JWT are valid', async () => {
    const payload = createValidPayload();
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify(payload)
    };

    const response = await handler(event, {});
    assert.equal(response.statusCode, 200, 'Should accept valid payload with 200 OK');
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.ok(body.id, 'Should return inserted record id');
    assert.equal(body.verifiedScores.totalScore, payload.totalScore);
  });

  // 3. Tampered totals that do not match recomputed score (400)
  it('should return 400 when client submits tampered total score', async () => {
    const payload = createValidPayload({
      totalScore: 42.50
    });
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify(payload)
    };

    const response = await handler(event, {});
    assert.equal(response.statusCode, 400, 'Should reject tampered score with 400 Bad Request');
    const body = JSON.parse(response.body);
    assert.match(body.error, /tampered|integrity|mismatch/i);
  });

  // 4. Duplicate Company + Device + Assessor + Date (409)
  it('should return 409 Conflict when duplicate evaluation record is submitted', async () => {
    const uniqueCompany = `DuplicateCorp-${Date.now()}`;
    const uniqueModel = `Tracker-X-${Date.now()}`;
    const uniqueAssessor = 'Lead Assessor Rizal';
    const uniqueAssessorId = 'MKA 9006';
    const specificDate = '2026-03-20';

    const payload = createValidPayload({
      companyName: uniqueCompany,
      deviceModel: uniqueModel,
      assessorName: uniqueAssessor,
      assessorId: uniqueAssessorId,
      assessmentDate: specificDate
    });

    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify(payload)
    };

    // First submission -> 200
    const firstRes = await handler(event, {});
    assert.equal(firstRes.statusCode, 200, 'First submission should succeed with 200');

    // Second submission with exact same Company, Device, Assessor, Date -> 409
    const secondRes = await handler(event, {});
    assert.equal(secondRes.statusCode, 409, 'Duplicate submission should be rejected with 409 Conflict');
    const body = JSON.parse(secondRes.body);
    assert.match(body.error, /duplicate|already exists/i);
  });

  // 5. Strict Assessor ID Format Validation (400)
  it('should return 400 when assessorId does not follow 3 letters and 4 numbers format', async () => {
    const invalidIds = ['MKA9006', 'MK 9006', 'MKAA 9006', 'MKA 900', 'MKA 90006', '123 9006', 'MKA ABCD'];
    for (const invalidId of invalidIds) {
      const payload = createValidPayload({
        companyName: `InvalidId Corp ${Date.now()}`,
        assessorId: invalidId
      });
      const event = {
        httpMethod: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${assessorToken}`
        },
        body: JSON.stringify(payload)
      };
      const res = await handler(event, {});
      assert.equal(res.statusCode, 400, `Should reject invalid assessorId "${invalidId}" with 400`);
      const body = JSON.parse(res.body);
      assert.match(body.error, /Assessor ID/i);
    }
  });
});
