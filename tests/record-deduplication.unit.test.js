/**
 * Assessment Record Deduplication & In-Place Linking Unit Tests
 *
 * Verifies:
 * 1. deduplicateEvaluations consolidates duplicate registration + evaluation pairs
 * 2. Canonical record selection keeps "Linked to Registration" and full package details
 * 3. Audit trail (comments, statusHistory, evaluationHistory) is preserved and merged without loss
 * 4. save-evaluation updates existing pre-registration in-place rather than inserting a duplicate row
 * 5. register-customer updates existing evaluation in-place rather than inserting a duplicate row
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateEvaluations } from '../netlify/functions/get-evaluations.js';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { handler as registerHandler } from '../netlify/functions/register-customer.js';
import { handler as getEvaluationsHandler } from '../netlify/functions/get-evaluations.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR } from '../netlify/functions/auth.js';
import { connectToDatabase, closeDatabaseConnection, COLLECTION_NAME, buildMongoIdFilter } from '../netlify/functions/db.js';
import { SECTION_A_CRITERIA, SECTION_B_CRITERIA } from '../netlify/functions/rubric.js';

describe('Assessment Record Deduplication & Linking Unit Tests', () => {
  const managerToken = generateToken({ id: 'mgr_01', role: ROLE_MANAGER, name: 'Lead Manager', email: 'manager@trackscore.my' });
  const assessorToken = generateToken({ id: 'asr_01', role: ROLE_ASSESSOR, assessorId: 'KUL 8820', name: 'Ts. Mohd Farhan', email: 'farhan@trackscore.my' });

  const testIdsToCleanup = [];

  function buildSampleBreakdown() {
    return [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({
      id: c.id,
      selectedOption: c.options[0].label,
      points: c.options[0].points
    }));
  }

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        const col = conn.db.collection(COLLECTION_NAME);
        for (const id of testIdsToCleanup) {
          if (id) await col.deleteOne(buildMongoIdFilter(String(id)));
        }
        await col.deleteMany({ companyName: 'Unique Dedup Fleet Logistics' });
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
    await closeDatabaseConnection();
  });

  it('1. deduplicateEvaluations groups duplicate registration + evaluation pairs and keeps canonical linked record', () => {
    const olderRegistrationDoc = {
      _id: 'reg_abc_001',
      id: 'reg_abc_001',
      companyName: 'Apex Telematics Sdn Bhd',
      deviceModel: 'AT-900',
      packageName: 'Package 1',
      package: 'package_1',
      status: 'registered',
      createdAt: '2026-09-25T08:00:00.000Z',
      statusHistory: [
        {
          status: 'registered',
          timestamp: '2026-09-25T08:00:00.000Z',
          note: 'Customer registered for Package 1'
        }
      ]
    };

    const laterEvaluationDoc = {
      _id: 'eval_xyz_002',
      id: 'eval_xyz_002',
      companyName: 'Apex Telematics Sdn Bhd',
      deviceModel: 'AT-900',
      packageName: 'Package 1: Standard Assessment (RM 4,500)',
      package: 'package_1',
      status: 'pending_review',
      registrationReferenceId: 'reg_abc_001',
      linkedRegistrationId: 'reg_abc_001',
      totalScore: 4.85,
      createdAt: '2026-09-25T08:05:00.000Z',
      statusHistory: [
        {
          status: 'pending_review',
          timestamp: '2026-09-25T08:05:00.000Z',
          note: 'Formal evaluation submitted and linked to pre-registered inspection'
        }
      ],
      comments: [
        {
          commentId: 'cmt_001',
          text: 'Technical criteria verified.',
          authorName: 'Peer Assessor'
        }
      ]
    };

    const inputRecords = [olderRegistrationDoc, laterEvaluationDoc];
    const deduped = deduplicateEvaluations(inputRecords);

    assert.equal(deduped.length, 1, 'Should consolidate duplicate pair into 1 canonical record');
    const canonical = deduped[0];

    // Canonical record is the linked evaluation with full package details
    assert.equal(canonical._id, 'eval_xyz_002');
    assert.equal(canonical.packageName, 'Package 1: Standard Assessment (RM 4,500)');
    assert.equal(canonical.status, 'pending_review');
    assert.ok(canonical.linkedRegistrationId);

    // Audit trail merged without loss
    assert.equal(canonical.statusHistory.length, 2, 'Should preserve both registration and evaluation statusHistory');
    assert.equal(canonical.statusHistory[0].status, 'registered');
    assert.equal(canonical.statusHistory[1].status, 'pending_review');
    assert.equal(canonical.comments.length, 1);
  });

  it('2. save-evaluation updates pre-existing customer registration in-place without creating a duplicate document', async () => {
    // A. Register customer first
    const regEvent = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        companyName: 'Unique Dedup Fleet Logistics',
        deviceModel: 'UDF-PRO-X9',
        package: 'package_1',
        contactPerson: 'Zul Ariffin',
        contactEmail: 'zul@uniquededup.my',
        contactPhone: '+60123456789'
      })
    };

    const regRes = await registerHandler(regEvent, {});
    assert.equal(regRes.statusCode, 201);
    const regBody = JSON.parse(regRes.body);
    const registrationId = regBody.id || regBody.evaluation?.id || regBody.registration?._id;
    testIdsToCleanup.push(registrationId);

    // Assign the registration before the Assessor submits it.
    await (await connectToDatabase()).updateEvaluation(registrationId,{assignedAssessorId:'KUL 8820',assignedAssessorName:'Ts. Mohd Farhan'});
    // B. Assessor submits evaluation for the same company + deviceModel
    const saveEvent = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        companyName: 'Unique Dedup Fleet Logistics',
        deviceModel: 'UDF-PRO-X9',
        packageName: 'Package 1: Standard Assessment (RM 4,500)',
        assessmentDate: '2026-09-25',
        assessorName: 'Ts. Mohd Farhan',
        assessorId: 'KUL 8820',
        breakdown: buildSampleBreakdown()
      })
    };

    const saveRes = await saveHandler(saveEvent, {});
    assert.equal(saveRes.statusCode, 200);
    const saveBody = JSON.parse(saveRes.body);

    // C. Verify the evaluation updated the registration in-place (same record ID)
    assert.equal(saveBody.id, registrationId, 'Should update the existing registration record in-place');
    assert.equal(saveBody.status, 'pending_review');

    // D. Query database to confirm NO duplicate record exists
    const conn = await connectToDatabase();
    if (conn.isMongoAtlas) {
      const col = conn.db.collection(COLLECTION_NAME);
      const docs = await col.find({
        companyName: 'Unique Dedup Fleet Logistics',
        deviceModel: 'UDF-PRO-X9',
        deletedAt: null
      }).toArray();

      assert.equal(docs.length, 1, 'Database must contain exactly 1 document for the assessment');
      assert.equal(docs[0].packageName, 'Package 1: Standard Assessment (RM 4,500)');
      assert.equal(docs[0].contactEmail, 'zul@uniquededup.my');
      assert.ok(docs[0].totalScore !== undefined);
      assert.ok(docs[0].statusHistory.length >= 2, 'Should have preserved both registration and submission history');
    }
  });

  it('3. get-evaluations returns deduplicated evaluations for dashboard consumption', async () => {
    const event = {
      httpMethod: 'GET',
      headers: {
        Authorization: `Bearer ${managerToken}`
      },
      queryStringParameters: {
        q: 'Unique Dedup Fleet Logistics'
      }
    };

    const res = await getEvaluationsHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    // Exactly 1 record returned, not two
    assert.equal(body.data.length, 1, 'Dashboard API must return exactly 1 row without duplicates');
    assert.equal(body.data[0].companyName, 'Unique Dedup Fleet Logistics');
    assert.equal(body.data[0].packageName, 'Package 1: Standard Assessment (RM 4,500)');
  });
});
