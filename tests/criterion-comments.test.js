/**
 * Comprehensive Test Suite for Per-Criterion Assessor Comments Save & Edit Persistence
 * Covers Requirements:
 * 1. Rubric Scoring Invariance with Criterion Comments
 * 2. Server-side Validation:
 *    - Valid comments preserved across all 33 criteria
 *    - Comment trimming and null normalization
 *    - Rejection of comments > 2000 chars with HTTP 400
 *    - Rejection of non-string comment types with HTTP 400
 * 3. Save -> Reload -> Edit -> Save -> Reload Persistence
 * 4. Multiple Criteria Mapping (1, 2, 10, 20, 33)
 * 5. Assessment Versioning & Snapshot Immutability (v1 vs v2)
 * 6. Legacy Record Compatibility (Records without comments load gracefully and can be edited)
 * 7. RBAC & Vendor Data Isolation (Vendors cannot access internal assessor comments)
 * 8. XSS Safety & Escaping
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  recomputeScores,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA
} from '../netlify/functions/rubric.js';
import { handler as saveEvaluationHandler } from '../netlify/functions/save-evaluation.js';
import { handler as getVersionHandler } from '../netlify/functions/get-assessment-version.js';
import { handler as lookupHandler } from '../netlify/functions/lookup-evaluation.js';
import {
  generateToken,
  ROLE_ASSESSOR,
  ROLE_MANAGER,
  ROLE_VENDOR
} from '../netlify/functions/auth.js';
import {
  connectToDatabase,
  closeDatabaseConnection,
  COLLECTION_NAME,
  COLLECTION_VERSIONS
} from '../netlify/functions/db.js';

describe('Per-Criterion Assessor Comments Persistence Suite', () => {
  const assessorToken = generateToken({
    role: ROLE_ASSESSOR,
    assessorId: 'MKA 9006',
    name: 'Lead Assessor'
  });

  const managerToken = generateToken({
    role: ROLE_MANAGER,
    id: 'MGR-001',
    name: 'Quality Assurance Manager'
  });

  const createdEvalIds = [];

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        if (createdEvalIds.length > 0) {
          await conn.db.collection(COLLECTION_NAME).deleteMany({
            _id: { $in: createdEvalIds }
          });
          await conn.db.collection(COLLECTION_VERSIONS).deleteMany({
            evaluationId: { $in: createdEvalIds.map(String) }
          });
        }
        await conn.db.collection(COLLECTION_NAME).deleteMany({
          companyName: { $regex: /^Comment Test Fleet Corp/i }
        });
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }
    await closeDatabaseConnection();
  });

  function create33CriteriaBreakdown(commentGenerator = null) {
    const allCriteria = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA];
    assert.equal(allCriteria.length, 33, 'Must have exactly 33 criteria');

    return allCriteria.map((c, idx) => {
      const opt = c.options[0];
      const comment = commentGenerator ? commentGenerator(c, idx) : `Verified criterion ${c.id} compliance.`;
      return {
        id: c.id,
        name: c.name,
        section: c.section,
        selectedOption: opt.label,
        points: opt.points,
        comment
      };
    });
  }

  it('Locks approval lifecycle stages and rejects unrelated Assessor resubmissions', async () => {
    const breakdown = create33CriteriaBreakdown();
    const scores = recomputeScores(breakdown);
    const payload = { companyName: `Comment Test Fleet Corp Authorization ${Date.now()}`, deviceModel: 'Authorization Gateway', assessorName: 'Lead Assessor', assessorId: 'MKA 9006', breakdown, ...scores };
    const request = (token, body) => saveEvaluationHandler({ httpMethod: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const initial = await request(assessorToken, payload);
    assert.equal(initial.statusCode, 200);
    const id = JSON.parse(initial.body).id;
    createdEvalIds.push(id);
    const conn = await connectToDatabase();
    assert.equal(conn.isMongoAtlas, false, 'Run this storage mutation regression only in the isolated JSON test runner');
    for (const status of ['approved', 'pre_final_sent', 'payment_confirmed', 'cert_issued', 'certificate_issued', 'completed']) {
      await conn.updateEvaluation(id, { status });
      const before = JSON.stringify(await conn.getEvaluationById(id));
      assert.equal((await request(assessorToken, { ...payload, resubmitRecordId: id })).statusCode, 403, status);
      assert.equal((await request(assessorToken, { ...payload, registrationId: id })).statusCode, 403, `registration path: ${status}`);
      assert.equal(JSON.stringify(await conn.getEvaluationById(id)), before);
    }
    await conn.updateEvaluation(id, { status: 'rejected' });
    const other = generateToken({ role: ROLE_ASSESSOR, assessorId: 'ZZZ 9999', name: 'Other Assessor' });
    assert.equal((await request(other, { ...payload, assessorId: 'ZZZ 9999', assessorName: 'Other Assessor', resubmitRecordId: id })).statusCode, 403);
    assert.equal((await request(other, { ...payload, resubmitRecordId: id })).statusCode, 403);
    assert.equal((await request(assessorToken, { ...payload, resubmitRecordId: id })).statusCode, 200);
  });

  describe('1. Rubric Scoring Invariance & Normalization', () => {
    it('should recompute scores correctly and preserve comments on each criterion', () => {
      const breakdown = create33CriteriaBreakdown((c, idx) => `Observation for ${c.id} (#${idx + 1})`);
      const result = recomputeScores(breakdown);

      assert.ok(Array.isArray(result.breakdown));
      assert.equal(result.breakdown.length, 33);

      result.breakdown.forEach((item, idx) => {
        const original = breakdown[idx];
        assert.equal(item.id, original.id);
        assert.equal(item.comment, `Observation for ${original.id} (#${idx + 1})`);
      });

      // Verify scoring math remains strictly unaltered
      assert.ok(result.sectionAScore >= 0 && result.sectionAScore <= 3.50);
      assert.ok(result.sectionBScore >= 0 && result.sectionBScore <= 1.50);
      assert.ok(result.totalScore >= 0 && result.totalScore <= 5.00);
      assert.ok(result.starRating >= 0 && result.starRating <= 5.0);
    });

    it('should trim surrounding whitespace from comments and normalize undefined to empty string', () => {
      const breakdown = create33CriteriaBreakdown((c, idx) => {
        if (idx === 0) return '   Whitespace padded comment   ';
        if (idx === 1) return undefined;
        if (idx === 2) return null;
        return '';
      });

      const result = recomputeScores(breakdown);
      assert.equal(result.breakdown[0].comment, 'Whitespace padded comment');
      assert.equal(result.breakdown[1].comment, '');
      assert.equal(result.breakdown[2].comment, '');
    });

    it('should produce identical score values whether comments are empty or populated', () => {
      const breakdownEmpty = create33CriteriaBreakdown(() => '');
      const breakdownPopulated = create33CriteriaBreakdown((c) => `Technical test evidence for ${c.id}`);

      const resEmpty = recomputeScores(breakdownEmpty);
      const resPopulated = recomputeScores(breakdownPopulated);

      assert.equal(resEmpty.sectionAScore, resPopulated.sectionAScore);
      assert.equal(resEmpty.sectionBScore, resPopulated.sectionBScore);
      assert.equal(resEmpty.totalScore, resPopulated.totalScore);
      assert.equal(resEmpty.starRating, resPopulated.starRating);
      assert.equal(resEmpty.ratingLabel, resPopulated.ratingLabel);
    });
  });

  describe('2. Server-side Comment Validation (save-evaluation.js)', () => {
    it('should reject submission with 400 if any criterion comment exceeds 2000 characters', async () => {
      const breakdown = create33CriteriaBreakdown();
      // Set criterion 5 comment to 2001 chars
      breakdown[4].comment = 'A'.repeat(2001);
      const recomputed = recomputeScores(breakdown);

      const event = {
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName: `Comment Test Fleet Corp ${Date.now()}`,
          deviceModel: 'TG-COMMENT-TEST',
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore
        })
      };

      const res = await saveEvaluationHandler(event);
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.match(body.error, /exceeds maximum allowed length of 2000 characters/i);
    });

    it('should reject submission with 400 if any criterion comment is not a string (e.g. number or object)', async () => {
      const breakdown = create33CriteriaBreakdown();
      // Tamper comment with object
      breakdown[2].comment = { malicious: true };
      const recomputed = recomputeScores(breakdown);

      const event = {
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName: `Comment Test Fleet Corp ${Date.now()}`,
          deviceModel: 'TG-COMMENT-TEST',
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore
        })
      };

      const res = await saveEvaluationHandler(event);
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.match(body.error, /must be a string/i);
    });

    it('should successfully save evaluation with valid comments across all 33 criteria', async () => {
      const timestamp = Date.now();
      const companyName = `Comment Test Fleet Corp ${timestamp}`;
      const breakdown = create33CriteriaBreakdown((c, idx) => `Comprehensive audit observation #${idx + 1} for ${c.id}`);
      const recomputed = recomputeScores(breakdown);

      const payload = {
        companyName,
        deviceModel: `TG-COMMENT-PASS-${timestamp}`,
        packageName: 'Comprehensive',
        assessorName: 'Lead Assessor',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-30',
        breakdown,
        sectionAScore: recomputed.sectionAScore,
        sectionBScore: recomputed.sectionBScore,
        totalScore: recomputed.totalScore
      };

      const res = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.ok(body.id, 'Response should contain evaluation ID');
      createdEvalIds.push(body.id);

      // Verify persisted version snapshot contains comments
      const verRes = await getVersionHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${managerToken}` },
        queryStringParameters: {
          evaluationId: String(body.id),
          version: '1'
        }
      });
      assert.equal(verRes.statusCode, 200);
      const verData = JSON.parse(verRes.body).version;
      assert.equal(verData.breakdown.length, 33);
      assert.equal(verData.breakdown[0].comment, 'Comprehensive audit observation #1 for trip_history');
      assert.equal(verData.breakdown[32].comment, 'Comprehensive audit observation #33 for tampered_alert');
    });
  });

  describe('3. Save -> Reload -> Edit -> Save -> Reload Persistence Flow', () => {
    it('should save initial comments, reload them, allow edits, and persist edited comments', async () => {
      const timestamp = Date.now();
      const companyName = `Comment Test Fleet Corp EditFlow ${timestamp}`;
      const deviceModel = `TG-EDIT-${timestamp}`;

      // Step 1: Initial Save with initial comments
      const breakdownV1 = create33CriteriaBreakdown((c, idx) => {
        if (c.id === 'trip_history') return 'Initial comment for Criterion 1 (Trip History)';
        if (c.id === 'offline_memory') return 'Initial comment for Criterion 10 (Offline Memory)';
        return `Observation for ${c.id}`;
      });
      const recomputedV1 = recomputeScores(breakdownV1);

      const saveRes1 = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName,
          deviceModel,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown: breakdownV1,
          sectionAScore: recomputedV1.sectionAScore,
          sectionBScore: recomputedV1.sectionBScore,
          totalScore: recomputedV1.totalScore
        })
      });

      assert.equal(saveRes1.statusCode, 200);
      const evalId = JSON.parse(saveRes1.body).id;
      createdEvalIds.push(evalId);

      // Step 2: Reload assessment via lookupHandler (simulating assessor reloading page)
      const reloadRes1 = await lookupHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${assessorToken}` },
        queryStringParameters: { id: String(evalId) }
      });
      assert.equal(reloadRes1.statusCode, 200);
      const loadedDoc1 = JSON.parse(reloadRes1.body).data[0];
      assert.ok(Array.isArray(loadedDoc1.breakdown));
      const c1Item = loadedDoc1.breakdown.find(b => b.id === 'trip_history');
      const c10Item = loadedDoc1.breakdown.find(b => b.id === 'offline_memory');
      assert.equal(c1Item.comment, 'Initial comment for Criterion 1 (Trip History)');
      assert.equal(c10Item.comment, 'Initial comment for Criterion 10 (Offline Memory)');

      // Step 3: Assessor edits comments
      const updatedBreakdown = loadedDoc1.breakdown.map(item => {
        if (item.id === 'trip_history') {
          return { ...item, comment: 'Updated comment for Criterion 1 after firmware audit' };
        }
        if (item.id === 'offline_memory') {
          return { ...item, comment: 'Updated comment for Criterion 10 after memory chip check' };
        }
        return item;
      });
      const recomputedV2 = recomputeScores(updatedBreakdown);

      // Step 4: Save again (as resubmission / version revision)
      const saveRes2 = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          resubmitRecordId: String(evalId),
          companyName,
          deviceModel,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown: updatedBreakdown,
          sectionAScore: recomputedV2.sectionAScore,
          sectionBScore: recomputedV2.sectionBScore,
          totalScore: recomputedV2.totalScore,
          changeReason: 'Updated criteria technical observations after retesting'
        })
      });
      assert.equal(saveRes2.statusCode, 200);

      // Step 5: Reload again and verify updated comments persisted in latest record
      const reloadRes2 = await lookupHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${assessorToken}` },
        queryStringParameters: { id: String(evalId) }
      });
      assert.equal(reloadRes2.statusCode, 200);
      const loadedDoc2 = JSON.parse(reloadRes2.body).data[0];
      const c1Updated = loadedDoc2.breakdown.find(b => b.id === 'trip_history');
      const c10Updated = loadedDoc2.breakdown.find(b => b.id === 'offline_memory');
      assert.equal(c1Updated.comment, 'Updated comment for Criterion 1 after firmware audit');
      assert.equal(c10Updated.comment, 'Updated comment for Criterion 10 after memory chip check');

      // Step 6: Manager can retrieve Version 1 (original comments) and Version 2 (updated comments)
      const mgrV1Res = await getVersionHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${managerToken}` },
        queryStringParameters: { evaluationId: String(evalId), version: '1' }
      });
      assert.equal(mgrV1Res.statusCode, 200);
      const v1Data = JSON.parse(mgrV1Res.body).version;
      const v1C1 = v1Data.breakdown.find(b => b.id === 'trip_history');
      assert.equal(v1C1.comment, 'Initial comment for Criterion 1 (Trip History)');

      const mgrV2Res = await getVersionHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${managerToken}` },
        queryStringParameters: { evaluationId: String(evalId), version: '2' }
      });
      assert.equal(mgrV2Res.statusCode, 200);
      const v2Data = JSON.parse(mgrV2Res.body).version;
      const v2C1 = v2Data.breakdown.find(b => b.id === 'trip_history');
      assert.equal(v2C1.comment, 'Updated comment for Criterion 1 after firmware audit');
    });
  });

  describe('4. Multiple Criteria Mapping Precision (1, 2, 10, 20, 33)', () => {
    it('should accurately preserve exact 1-to-1 mapping on criteria 1, 2, 10, 20, and 33 without shifting', async () => {
      const timestamp = Date.now();
      const companyName = `Comment Test Fleet Corp Mapping ${timestamp}`;
      const deviceModel = `TG-MAP-${timestamp}`;

      const distinctComments = {
        trip_history: 'TEST-COMMENT-01-TRIP',
        realtime_tracking: 'TEST-COMMENT-02-REALTIME',
        offline_memory: 'TEST-COMMENT-10-OFFLINE-MEMORY',
        data_interval: 'TEST-COMMENT-20-DATA-INTERVAL',
        tampered_alert: 'TEST-COMMENT-33-TAMPERALERT'
      };

      const breakdown = create33CriteriaBreakdown((c) => {
        return distinctComments[c.id] || `Observation for ${c.id}`;
      });
      const recomputed = recomputeScores(breakdown);

      const res = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName,
          deviceModel,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore
        })
      });

      assert.equal(res.statusCode, 200);
      const evalId = JSON.parse(res.body).id;
      createdEvalIds.push(evalId);

      const lookupRes = await lookupHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${assessorToken}` },
        queryStringParameters: { id: String(evalId) }
      });
      assert.equal(lookupRes.statusCode, 200);
      const loaded = JSON.parse(lookupRes.body).data[0];

      // Assert each specific criterion retains exact corresponding comment
      for (const [critId, expectedComment] of Object.entries(distinctComments)) {
        const item = loaded.breakdown.find(b => b.id === critId);
        assert.ok(item, `Criterion "${critId}" must exist in breakdown`);
        assert.equal(item.comment, expectedComment, `Comment on criterion "${critId}" must match expected value`);
      }
    });
  });

  describe('5. Legacy Record Backward Compatibility', () => {
    it('should gracefully handle legacy records without comment property and allow comment addition', async () => {
      const timestamp = Date.now();
      const companyName = `Comment Test Fleet Corp Legacy ${timestamp}`;
      const deviceModel = `TG-LEGACY-${timestamp}`;

      // Simulate a legacy breakdown without any comment property
      const legacyBreakdown = create33CriteriaBreakdown(() => undefined);
      legacyBreakdown.forEach(item => {
        delete item.comment;
      });

      const recomputed = recomputeScores(legacyBreakdown);

      const res = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName,
          deviceModel,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown: legacyBreakdown,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore
        })
      });

      assert.equal(res.statusCode, 200);
      const evalId = JSON.parse(res.body).id;
      createdEvalIds.push(evalId);

      const lookupRes = await lookupHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${assessorToken}` },
        queryStringParameters: { id: String(evalId) }
      });
      assert.equal(lookupRes.statusCode, 200);
      const loaded = JSON.parse(lookupRes.body).data[0];

      // Legacy record should have normalized comments to empty string
      assert.equal(loaded.breakdown[0].comment, '');

      // Now add a comment to this legacy record and resubmit
      loaded.breakdown[0].comment = 'Added observation to legacy assessment';
      const recomputed2 = recomputeScores(loaded.breakdown);

      const updateRes = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          resubmitRecordId: String(evalId),
          companyName,
          deviceModel,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown: loaded.breakdown,
          sectionAScore: recomputed2.sectionAScore,
          sectionBScore: recomputed2.sectionBScore,
          totalScore: recomputed2.totalScore,
          changeReason: 'Assessor attached observation notes to legacy record'
        })
      });

      assert.equal(updateRes.statusCode, 200);

      // Verify comment now exists
      const verifyRes = await lookupHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${assessorToken}` },
        queryStringParameters: { id: String(evalId) }
      });
      const verified = JSON.parse(verifyRes.body).data[0];
      assert.equal(verified.breakdown[0].comment, 'Added observation to legacy assessment');
    });
  });

  describe('6. RBAC & Vendor Confidentiality Isolation', () => {
    it('should strip assessor comments when retrieved by a vendor role in get-assessment-version', async () => {
      const timestamp = Date.now();
      const companyName = `Comment Test Fleet Corp Vendor Isolation ${timestamp}`;
      const breakdown = create33CriteriaBreakdown((c) => `INTERNAL SENSITIVE OBSERVATION: ${c.id}`);
      const recomputed = recomputeScores(breakdown);

      const res = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName,
          deviceModel: `TG-VENDOR-ISOLATION-${timestamp}`,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore
        })
      });

      assert.equal(res.statusCode, 200);
      const evalId = JSON.parse(res.body).id;
      createdEvalIds.push(evalId);

      // Generate vendor token linked to this evaluation
      const vendorToken = generateToken({
        role: ROLE_VENDOR,
        companyName,
        email: `vendor-${timestamp}@commenttest.com`,
        linkedRegistrationIds: [String(evalId)]
      });

      // A. Query as Vendor
      const vendorRes = await getVersionHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${vendorToken}` },
        queryStringParameters: {
          evaluationId: String(evalId),
          version: '1'
        }
      });

      assert.equal(vendorRes.statusCode, 200);
      const vendorVersion = JSON.parse(vendorRes.body).version;
      assert.ok(Array.isArray(vendorVersion.breakdown), 'Vendor should receive breakdown array');

      // Crucial assertion: Vendor must NOT have comment field on any criterion
      vendorVersion.breakdown.forEach((item, idx) => {
        assert.equal(
          item.comment,
          undefined,
          `Criterion ${idx + 1} (${item.id}) must not contain comment field for vendor`
        );
      });

      // B. Query as Manager
      const managerRes = await getVersionHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${managerToken}` },
        queryStringParameters: {
          evaluationId: String(evalId),
          version: '1'
        }
      });

      assert.equal(managerRes.statusCode, 200);
      const managerVersion = JSON.parse(managerRes.body).version;

      // Manager must receive full assessor comments
      managerVersion.breakdown.forEach((item) => {
        assert.ok(
          item.comment && item.comment.startsWith('INTERNAL SENSITIVE OBSERVATION'),
          `Manager should see full assessor comments`
        );
      });
    });
  });

  describe('7. XSS Safety in Criterion Comments', () => {
    it('should safely store HTML/script tags as plain text without execution or distortion', async () => {
      const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      const breakdown = create33CriteriaBreakdown((c, idx) => idx === 0 ? xssPayload : 'Normal observation');
      const recomputed = recomputeScores(breakdown);

      const timestamp = Date.now();
      const res = await saveEvaluationHandler({
        httpMethod: 'POST',
        headers: {
          authorization: `Bearer ${assessorToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          companyName: `Comment Test Fleet Corp XSS ${timestamp}`,
          deviceModel: `TG-XSS-${timestamp}`,
          packageName: 'Comprehensive',
          assessorName: 'Lead Assessor',
          assessorId: 'MKA 9006',
          assessmentDate: '2026-03-30',
          breakdown,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore
        })
      });

      assert.equal(res.statusCode, 200);
      const evalId = JSON.parse(res.body).id;
      createdEvalIds.push(evalId);

      const mgrRes = await getVersionHandler({
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${managerToken}` },
        queryStringParameters: {
          evaluationId: String(evalId),
          version: '1'
        }
      });

      assert.equal(mgrRes.statusCode, 200);
      const v = JSON.parse(mgrRes.body).version;
      // Stored as pristine string (safe against XSS, escaped by escapeHtml on render)
      assert.equal(v.breakdown[0].comment, xssPayload);
    });
  });
});
