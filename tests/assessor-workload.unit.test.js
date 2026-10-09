/**
 * Unit & Integration Tests: Assessor Workload Management
 *
 * Verifies:
 * - calculateAssessorWorkloads accurately counts active, due-soon, overdue, and completed evaluations
 * - Includes assessors with 0 tasks (available capacity)
 * - Identifies unassigned tasks
 * - Applies capacity threshold warning (DEFAULT_ASSESSOR_CAPACITY = 5)
 * - RBAC protection: Manager 200, Assessor 403, Vendor 403
 * - Workload updates upon assignment and reassignment
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAssessorWorkloads,
  isFuzzyNameMatch,
  matchesAssessor,
  DEFAULT_ASSESSOR_CAPACITY,
  handler as workloadHandler
} from '../netlify/functions/get-assessor-workload.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from '../netlify/functions/auth.js';
import { SLA_STATUS } from '../netlify/functions/sla.js';
import { closeDatabaseConnection } from '../netlify/functions/db.js';

describe('Assessor Workload Management Engine & RBAC Tests', () => {
  after(async () => {
    await closeDatabaseConnection();
  });
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Operations Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Ahmad Farhan' });
  const vendorToken = generateToken({ role: ROLE_VENDOR, vendorId: 'vendor-01', email: 'vendor@telematics.com' });

  it('1. isFuzzyNameMatch should correctly handle title variations and multi-word names', () => {
    assert.equal(isFuzzyNameMatch('Ts. Mohd Farhan', 'Mohd Farhan'), true);
    assert.equal(isFuzzyNameMatch('Dr. Ahmad Farhan', 'Ahmad Farhan'), true);
    assert.equal(isFuzzyNameMatch('Hizal Haziq', 'Hizal Hazreen Haziq'), true);
    assert.equal(isFuzzyNameMatch('John Doe', 'Jane Smith'), false);
  });

  it('2. matchesAssessor should match by ID, Name, or Email accurately', () => {
    const assessor = {
      _id: 'user_01',
      assessorId: 'MKA 9006',
      name: 'Ahmad Farhan',
      email: 'ahmad@trackscore.my'
    };

    assert.equal(matchesAssessor({ assignedAssessorId: 'MKA 9006' }, assessor), true);
    assert.equal(matchesAssessor({ assessorId: 'MKA 9006' }, assessor), true);
    assert.equal(matchesAssessor({ assignedAssessorName: 'Ahmad Farhan' }, assessor), true);
    assert.equal(matchesAssessor({ assignedAssessor: 'Ts. Ahmad Farhan' }, assessor), true);
    assert.equal(matchesAssessor({ assignedAssessorEmail: 'ahmad@trackscore.my' }, assessor), true);
    assert.equal(matchesAssessor({ assignedAssessorId: 'OTHER 123' }, assessor), false);
  });

  it('3. calculateAssessorWorkloads should include assessors with zero tasks', () => {
    const assessors = [
      { _id: 'u1', assessorId: 'AS-100', name: 'Free Assessor', email: 'free@trackscore.my' }
    ];
    const evaluations = [];

    const result = calculateAssessorWorkloads(assessors, evaluations, 5);
    assert.equal(result.assessors.length, 1);
    assert.equal(result.assessors[0].name, 'Free Assessor');
    assert.equal(result.assessors[0].workload.active, 0);
    assert.equal(result.assessors[0].workload.completed, 0);
    assert.equal(result.assessors[0].workload.status, 'AVAILABLE');
    assert.equal(result.summary.availableAssessors, 1);
    assert.equal(result.summary.totalActiveAssignments, 0);
  });

  it('4. calculateAssessorWorkloads should accurately tally active, dueSoon, overdue, and completed tasks', () => {
    const now = Date.now();
    const assessors = [
      { _id: 'u1', assessorId: 'AS-01', name: 'Active Assessor', email: 'active@trackscore.my' }
    ];

    const evaluations = [
      // Active - On Track (4 days in future)
      {
        _id: 'e1',
        assignedAssessorId: 'AS-01',
        status: 'scheduled',
        sla: { status: SLA_STATUS.ON_TRACK, deadline: new Date(now + 86400000 * 4).toISOString() }
      },
      // Active - Due Soon (12 hours in future)
      {
        _id: 'e2',
        assignedAssessorId: 'AS-01',
        status: 'submitted',
        sla: { status: SLA_STATUS.DUE_SOON, deadline: new Date(now + 3600000 * 12).toISOString() }
      },
      // Active - Overdue (2 days ago)
      {
        _id: 'e3',
        assignedAssessorId: 'AS-01',
        status: 'pending_review',
        sla: { status: SLA_STATUS.OVERDUE, deadline: new Date(now - 86400000 * 2).toISOString() }
      },
      // Completed - on time
      {
        _id: 'e4',
        assignedAssessorId: 'AS-01',
        status: 'completed',
        completedAt: new Date(now - 86400000).toISOString(),
        sla: { status: SLA_STATUS.COMPLETED_ON_TIME }
      }
    ];

    const result = calculateAssessorWorkloads(assessors, evaluations, 5);
    const wl = result.assessors[0].workload;

    assert.equal(wl.active, 3);
    assert.equal(wl.dueSoon, 1);
    assert.equal(wl.overdue, 1);
    assert.equal(wl.onTrack, 1);
    assert.equal(wl.completed, 1);
    assert.equal(wl.total, 4);
    assert.equal(wl.isAtCapacity, false);
    assert.equal(wl.isOverCapacity, false);
    assert.equal(wl.status, 'OPTIMAL');
  });

  it('5. calculateAssessorWorkloads should flag capacity warning when active tasks exceed limit', () => {
    const assessors = [
      { _id: 'u1', assessorId: 'AS-OVER', name: 'Busy Assessor', email: 'busy@trackscore.my' }
    ];

    // Create 6 active tasks (limit is 5)
    const evaluations = Array.from({ length: 6 }, (_, i) => ({
      _id: `eval-${i}`,
      assignedAssessorId: 'AS-OVER',
      status: 'scheduled',
      sla: { status: SLA_STATUS.ON_TRACK, deadline: new Date().toISOString() }
    }));

    const result = calculateAssessorWorkloads(assessors, evaluations, 5);
    const wl = result.assessors[0].workload;

    assert.equal(wl.active, 6);
    assert.equal(wl.capacity, 5);
    assert.equal(wl.isAtCapacity, true);
    assert.equal(wl.isOverCapacity, true);
    assert.equal(wl.status, 'OVERLOADED');
    assert.equal(wl.utilizationPercent, 120);
    assert.equal(result.summary.overloadedAssessors, 1);
  });

  it('6. calculateAssessorWorkloads should group unassigned active evaluations', () => {
    const assessors = [
      { _id: 'u1', assessorId: 'AS-01', name: 'Assessor One', email: 'one@trackscore.my' }
    ];
    const evaluations = [
      {
        _id: 'e-unassigned-1',
        companyName: 'Unassigned Fleet Corp',
        status: 'registered',
        sla: { status: SLA_STATUS.ON_TRACK }
      }
    ];

    const result = calculateAssessorWorkloads(assessors, evaluations, 5);
    assert.equal(result.summary.unassignedCount, 1);
    assert.equal(result.unassignedTasks.length, 1);
    assert.equal(result.unassignedTasks[0].companyName, 'Unassigned Fleet Corp');
  });

  it('7. get-assessor-workload handler should enforce RBAC (Manager 200, Assessor 403, Vendor 403)', async () => {
    // 7a. Assessor -> 403 Forbidden
    const assessorRes = await workloadHandler({
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${assessorToken}` }
    });
    assert.equal(assessorRes.statusCode, 403);
    const assessorBody = JSON.parse(assessorRes.body);
    assert.match(assessorBody.error, /Forbidden/i);

    // 7b. Vendor -> 403 Forbidden
    const vendorRes = await workloadHandler({
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${vendorToken}` }
    });
    assert.equal(vendorRes.statusCode, 403);

    // 7c. Missing Token -> 401 Unauthorized
    const noTokenRes = await workloadHandler({
      httpMethod: 'GET',
      headers: {}
    });
    assert.equal(noTokenRes.statusCode, 401);

    // 7d. Manager -> 200 OK
    const managerRes = await workloadHandler({
      httpMethod: 'GET',
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.equal(managerRes.statusCode, 200);
    const managerBody = JSON.parse(managerRes.body);
    assert.equal(managerBody.success, true);
    assert.ok(Array.isArray(managerBody.assessors));
    assert.ok(managerBody.summary);
    assert.ok(managerBody.capacityLimit >= 1);
  });

  it('8. reassignment should decrease old assessor workload and increase new assessor workload', () => {
    const assessors = [
      { _id: 'u1', assessorId: 'AS-01', name: 'Assessor Alpha', email: 'alpha@trackscore.my' },
      { _id: 'u2', assessorId: 'AS-02', name: 'Assessor Beta', email: 'beta@trackscore.my' }
    ];

    const initialEvaluations = [
      { _id: 'e1', assignedAssessorId: 'AS-01', status: 'scheduled' },
      { _id: 'e2', assignedAssessorId: 'AS-01', status: 'submitted' }
    ];

    // Initial state: Alpha has 2, Beta has 0
    const beforeReassign = calculateAssessorWorkloads(assessors, initialEvaluations, 5);
    assert.equal(beforeReassign.assessors[0].workload.active, 2);
    assert.equal(beforeReassign.assessors[1].workload.active, 0);

    // Reassign e2 to Beta (AS-02)
    const reassignedEvaluations = [
      { _id: 'e1', assignedAssessorId: 'AS-01', status: 'scheduled' },
      { _id: 'e2', assignedAssessorId: 'AS-02', assignedAssessorName: 'Assessor Beta', status: 'scheduled' }
    ];

    const afterReassign = calculateAssessorWorkloads(assessors, reassignedEvaluations, 5);
    // Alpha decreased from 2 to 1
    assert.equal(afterReassign.assessors[0].workload.active, 1);
    // Beta increased from 0 to 1
    assert.equal(afterReassign.assessors[1].workload.active, 1);
  });

  it('9. capacity warning produces warning flag without blocking assignment', async () => {
    const { handler: assignHandler } = await import('../netlify/functions/assign-assessor.js');
    const { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } = await import('../netlify/functions/db.js');

    const conn = await connectToDatabase();
    const testId = 'temp-cap-eval-' + Date.now();
    const testDoc = {
      _id: testId,
      companyName: 'Capacity Test Logistics',
      deviceModel: 'CAP-100',
      status: 'registered',
      createdAt: new Date().toISOString()
    };

    if (conn.isMongoAtlas) {
      await conn.db.collection(COLLECTION_NAME).insertOne(testDoc);
    } else {
      await conn.insertEvaluation(testDoc);
    }

    try {
      const res = await assignHandler({
        httpMethod: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`
        },
        body: JSON.stringify({
          id: testId,
          assessorName: 'Ahmad Farhan',
          assessorId: 'MKA 9006',
          assessorEmail: 'assessor@trackscore.my'
        })
      });

      assert.equal(res.statusCode, 200, 'Assignment must not be blocked by capacity');
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.assignedAssessor, 'Ahmad Farhan');
      assert.ok('capacityWarning' in body, 'Response must include capacityWarning property');
    } finally {
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_NAME).deleteOne(buildMongoIdFilter(testId));
      } else {
        await conn.deleteEvaluation(testId);
      }
    }
  });
});
