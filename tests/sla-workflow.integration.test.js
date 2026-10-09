import { handler as certificateHandler } from '../netlify/functions/issue-certificate.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as registerHandler } from '../netlify/functions/register-customer.js';
import { handler as scheduleHandler } from '../netlify/functions/schedule-assessment.js';
import { handler as assignHandler } from '../netlify/functions/assign-assessor.js';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { handler as approveHandler } from '../netlify/functions/approve-evaluation.js';
import { handler as getEvaluationsHandler } from '../netlify/functions/get-evaluations.js';
import { handler as vendorPortalHandler } from '../netlify/functions/vendor-portal-data.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from '../netlify/functions/auth.js';
import { connectToDatabase, closeDatabaseConnection, COLLECTION_NAME, buildMongoIdFilter } from '../netlify/functions/db.js';
import { SLA_STATUS } from '../netlify/functions/sla.js';
import { SECTION_A_CRITERIA, SECTION_B_CRITERIA, recomputeScores } from '../netlify/functions/rubric.js';

describe('Assessment SLA & Deadline Workflow Integration Tests', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Senior Operations Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Ts. Mohd Farhan' });
  
  let registeredId = null;
  let savedEvalId = null;
  const testVendorId = 'test-sla-vendor-001';
  const testVendorEmail = 'sla_vendor@telematics.com';
  const vendorToken = generateToken({ role: ROLE_VENDOR, vendorId: testVendorId, email: testVendorEmail });

  before(async () => {
    const conn = await connectToDatabase();
    
    // Seed vendor record
    const vendorDoc = {
      _id: testVendorId,
      companyName: 'SLA Telematics Corp',
      contactEmail: testVendorEmail,
      contactPhone: '+60123456789',
      linkedRegistrationIds: [],
      isActive: true,
      createdAt: new Date().toISOString()
    };

    if (conn.isMongoAtlas) {
      await conn.db.collection('vendors').updateOne(
        { _id: testVendorId },
        { $set: vendorDoc },
        { upsert: true }
      );
    } else {
      const existing = await conn.getVendorById(testVendorId);
      if (existing) await conn.updateVendor(testVendorId, vendorDoc);
      else await conn.createVendor(vendorDoc);
    }
  });

  after(async () => {
    try {
      const conn = await connectToDatabase();
      const idsToDelete = [registeredId, savedEvalId].filter(Boolean);
      if (conn.isMongoAtlas) {
        if (idsToDelete.length > 0) {
          const filters = idsToDelete.flatMap(id => {
            const f = buildMongoIdFilter(id);
            return Array.isArray(f.$or) ? f.$or : [f];
          });
          await conn.db.collection(COLLECTION_NAME).deleteMany({ $or: filters });
        }
        await conn.db.collection('vendors').deleteOne({ _id: testVendorId });
      } else {
        if (registeredId) await conn.deleteEvaluation(registeredId);
        if (savedEvalId) await conn.deleteEvaluation(savedEvalId);
      }
    } catch (e) {
      // ignore cleanup errors
    }
    await closeDatabaseConnection();
  });

  it('1. register-customer should initialize package-specific SLA deadline (7 days for Package 1)', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        companyName: 'SLA Telematics Corp',
        contactEmail: testVendorEmail,
        contactPerson: 'Director Dan',
        contactPhone: '+60123456789',
        deviceModel: 'Tracker Pro V4',
        package: 'package_1',
        packageName: 'Package 1: Standard Assessment'
      })
    };

    const res = await registerHandler(event, {});
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.id);
    registeredId = body.id;
    assert.ok(body.sla);
    assert.equal(body.sla.durationDays, 7);
    assert.equal(body.sla.status, SLA_STATUS.ON_TRACK);
    assert.ok(body.sla.deadline);
  });

  it('2. schedule-assessment should recalculate SLA deadline based on scheduled date and package (Package 2 = 5 days)', async () => {
    assert.ok(registeredId);
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: registeredId,
        scheduledDate: futureDate,
        package: 'package_2',
        sessionNotes: 'Priority MIROS track testing scheduled'
      })
    };

    const res = await scheduleHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.status, 'scheduled');
    assert.ok(body.sla);
    assert.equal(body.sla.durationDays, 5); // Package 2 priority SLA is 5 days
    assert.ok(body.sla.deadline);
  });

  it('3. assign-assessor should preserve SLA deadline and support manager custom SLA days override', async () => {
    assert.ok(registeredId);
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: registeredId,
        assessorId: 'MKA 9006',
        assessorName: 'Ts. Mohd Farhan',
        slaDays: 4 // Manager override: 4 days expedited
      })
    };

    const res = await assignHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.sla);
    assert.equal(body.sla.durationDays, 4);
    assert.equal(body.sla.status, SLA_STATUS.ON_TRACK);
  });

  it('4. save-evaluation should preserve existing SLA deadline on assessor submission', async () => {
    assert.ok(registeredId);
    const breakdown = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({
      id: c.id,
      selectedOption: c.options[0].label,
      points: c.options[0].points
    }));
    const recomputed = recomputeScores(breakdown);

    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        companyName: 'SLA Telematics Corp',
        deviceModel: 'Tracker Pro V4',
        packageName: 'Package 2: Comprehensive Assessment (RM 6,000)',
        assessorName: 'Ts. Mohd Farhan',
        assessorId: 'MKA 9006',
        breakdown,
        sectionAScore: recomputed.sectionAScore,
        sectionBScore: recomputed.sectionBScore,
        totalScore: recomputed.totalScore,
        linkedRegistrationId: registeredId
      })
    };

    const res = await saveHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    savedEvalId = body.id;
    assert.ok(body.sla);
    assert.ok(body.sla.deadline);
    assert.equal(body.sla.isCompleted, false);
  });

  it('5. certificate delivery completes the approved workflow within SLA', async () => {
    const conn = await connectToDatabase();
    await conn.updateEvaluation(savedEvalId, { slaDeadline: new Date(Date.now() + 86400000 * 3).toISOString() });
    const headers = { Authorization: 'Bearer ' + managerToken };
    const approval = await approveHandler({ httpMethod: 'POST', headers, body: JSON.stringify({ id: savedEvalId, action: 'approve' }) });
    assert.equal(approval.statusCode, 200, approval.body);
    let res;
    for (const step of ['prepare', 'print', 'sign', 'deliver']) {
      res = await certificateHandler({ httpMethod: 'POST', headers, body: JSON.stringify({ id: savedEvalId, step, signedBy: 'DGO Endorser' }) });
      assert.equal(res.statusCode, 200, res.body);
    }
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'completed');
    assert.equal(body.sla.isCompleted, true);
    assert.equal(body.sla.status, SLA_STATUS.COMPLETED_ON_TIME);
  });

  it('6. get-evaluations should return SLA metrics summary and filter by slaStatus', async () => {
    const event = {
      httpMethod: 'GET',
      headers: {
        'Authorization': `Bearer ${managerToken}`
      },
      queryStringParameters: {
        q: 'SLA Telematics Corp',
        slaStatus: 'COMPLETED_ON_TIME'
      }
    };

    const res = await getEvaluationsHandler(event, {});
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.slaSummary);
    assert.ok(body.slaSummary.totalActive !== undefined);
    assert.ok(body.slaSummary.complianceRate);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.equal(body.data[0].sla.status, SLA_STATUS.COMPLETED_ON_TIME);
  });

  it('7. vendor-portal-data should provide sanitized SLA status without leaking internal assessor metrics', async () => {
    assert.ok(savedEvalId);
    const conn = await connectToDatabase();
    if (conn.isMongoAtlas) {
      await conn.db.collection('vendors').updateOne(
        { _id: testVendorId },
        { $set: { linkedRegistrationIds: [registeredId, savedEvalId] } }
      );
    } else {
      await conn.updateVendor(testVendorId, { linkedRegistrationIds: [registeredId, savedEvalId] });
    }

    const event = {
      httpMethod: 'GET',
      headers: {
        'Authorization': `Bearer ${vendorToken}`
      },
      queryStringParameters: {
        id: savedEvalId
      }
    };

    const res = await vendorPortalHandler(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.evaluation);
    assert.ok(body.evaluation.sla);
    assert.equal(body.evaluation.sla.isCompleted, true);
    // Assessor breakdown criteria should NOT be present in vendor presentation
    assert.equal(body.evaluation.breakdown, undefined);
  });
});
