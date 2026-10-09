/**
 * Netlify Serverless Function: get-assessor-workload
 * Authoritative Server-Side Assessor Workload Aggregation
 *
 * RBAC:
 * - MANAGER only (403 Forbidden for Assessor and Vendor roles)
 *
 * Capabilities:
 * - Aggregates active, due-soon, overdue, and completed evaluations per registered assessor
 * - Always includes registered assessors with 0 tasks (available capacity)
 * - Consumes authoritative SLA engine from sla.js (no duplicate SLA math)
 * - Identifies unassigned pending inspections
 * - Applies centralized capacity thresholds (DEFAULT_ASSESSOR_CAPACITY = 5)
 */

import {
  connectToDatabase,
  listUsers,
  COLLECTION_NAME,
  COLLECTION_USERS
} from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { attachSlaToRecord, SLA_STATUS } from './sla.js';

export const DEFAULT_ASSESSOR_CAPACITY = parseInt(process.env.DEFAULT_ASSESSOR_CAPACITY || '5', 10);

/**
 * Normalizes name strings to match variations like "Ts. Mohd Farhan" vs "Mohd Farhan",
 * or "Hizal Haziq" vs "Hizal Hazreen Haziq".
 */
export function isFuzzyNameMatch(nameA, nameB) {
  if (!nameA || !nameB) return false;
  const cleanA = String(nameA).toLowerCase().replace(/^(ts\.|ir\.|dr\.|mr\.|mrs\.|ms\.)\s+/i, '').trim();
  const cleanB = String(nameB).toLowerCase().replace(/^(ts\.|ir\.|dr\.|mr\.|mrs\.|ms\.)\s+/i, '').trim();
  if (cleanA === cleanB) return true;

  const wordsA = cleanA.split(/\s+/).filter(w => w.length >= 2);
  const wordsB = cleanB.split(/\s+/).filter(w => w.length >= 2);

  if (wordsA.length >= 2 && wordsB.length >= 2) {
    if (wordsA.every(w => wordsB.includes(w)) || wordsB.every(w => wordsA.includes(w))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether an evaluation document belongs to a specific assessor.
 */
export function matchesAssessor(evalDoc, assessor) {
  if (!evalDoc || !assessor) return false;

  const aId = String(assessor.assessorId || assessor.id || assessor._id || '').trim().toLowerCase();
  const aName = String(assessor.name || '').trim().toLowerCase();
  const aEmail = String(assessor.email || '').trim().toLowerCase();

  // 1. Direct ID match
  const eAssignedId = String(evalDoc.assignedAssessorId || '').trim().toLowerCase();
  const eAssessorId = String(evalDoc.assessorId || '').trim().toLowerCase();
  if (aId && (eAssignedId === aId || eAssessorId === aId)) return true;

  // 2. Email match
  const eAssignedEmail = String(evalDoc.assignedAssessorEmail || '').trim().toLowerCase();
  if (aEmail && eAssignedEmail && eAssignedEmail === aEmail) return true;

  // 3. Name match
  const eAssignedName = String(evalDoc.assignedAssessorName || evalDoc.assignedAssessor || '').trim().toLowerCase();
  const eAssessorName = String(evalDoc.assessorName || '').trim().toLowerCase();

  if (aName) {
    if (eAssignedName && (eAssignedName === aName || isFuzzyNameMatch(eAssignedName, aName))) return true;
    if (eAssessorName && (eAssessorName === aName || isFuzzyNameMatch(eAssessorName, aName))) return true;
  }

  return false;
}

/**
 * Pure calculation function for testing and serverless handlers.
 */
export function calculateAssessorWorkloads(assessors = [], rawEvaluations = [], capacityLimit = DEFAULT_ASSESSOR_CAPACITY) {
  // Ensure every evaluation has authoritative SLA attached
  const evaluations = rawEvaluations.map(e => e.sla ? e : attachSlaToRecord(e));

  // Filter out deleted records and raw inquiry items
  const validEvaluations = evaluations.filter(e => !e.deletedAt && e.status !== 'inquiry' && e.recordType !== 'inquiry');

  // Track which evaluations were matched to registered assessors
  const matchedEvalIds = new Set();

  const assessorWorkloads = assessors.map(assessor => {
    const aId = assessor.assessorId || assessor._id || assessor.id || '';
    const aName = assessor.name || 'Assessor';
    const aEmail = assessor.email || '';
    const aPhone = assessor.phone || '';

    let activeCount = 0;
    let completedCount = 0;
    let dueSoonCount = 0;
    let overdueCount = 0;
    let onTrackCount = 0;
    const activeTasks = [];
    const completedTasks = [];

    validEvaluations.forEach(evalDoc => {
      if (matchesAssessor(evalDoc, assessor)) {
        const evalId = String(evalDoc._id || evalDoc.id);
        matchedEvalIds.add(evalId);

        const status = String(evalDoc.status || 'pending_review').toLowerCase();
        const isCompleted = status === 'completed' || status === 'approved';
        const isCancelled = status === 'cancelled';

        if (isCompleted) {
          completedCount++;
          completedTasks.push({
            id: evalId,
            companyName: evalDoc.companyName || 'Unknown Company',
            deviceModel: evalDoc.deviceModel || 'N/A',
            status: evalDoc.status,
            completedAt: evalDoc.completedAt || evalDoc.approvedAt || null,
            slaStatus: evalDoc.sla?.status || SLA_STATUS.COMPLETED_ON_TIME
          });
        } else if (!isCancelled) {
          activeCount++;
          const slaStatus = evalDoc.sla?.status || SLA_STATUS.ON_TRACK;

          if (slaStatus === SLA_STATUS.OVERDUE) {
            overdueCount++;
          } else if (slaStatus === SLA_STATUS.DUE_SOON) {
            dueSoonCount++;
          } else {
            onTrackCount++;
          }

          activeTasks.push({
            id: evalId,
            companyName: evalDoc.companyName || 'Unknown Company',
            deviceModel: evalDoc.deviceModel || 'N/A',
            status: evalDoc.status || 'pending_review',
            scheduledDate: evalDoc.scheduledDate || null,
            assignedAt: evalDoc.assignedAt || evalDoc.scheduledAt || evalDoc.createdAt,
            sla: {
              status: slaStatus,
              deadline: evalDoc.sla?.deadline || null,
              remainingFormatted: evalDoc.sla?.remainingFormatted || 'N/A',
              overdueFormatted: evalDoc.sla?.overdueFormatted || 'None'
            }
          });
        }
      }
    });

    const isAtCapacity = activeCount >= capacityLimit;
    const isOverCapacity = activeCount > capacityLimit;
    const utilizationPercent = capacityLimit > 0 ? Math.round((activeCount / capacityLimit) * 100) : 0;

    let operationalStatus = 'AVAILABLE';
    if (isOverCapacity) {
      operationalStatus = 'OVERLOADED';
    } else if (isAtCapacity) {
      operationalStatus = 'AT_CAPACITY';
    } else if (activeCount > 0) {
      operationalStatus = 'OPTIMAL';
    }

    return {
      id: String(assessor._id || assessor.id || aId),
      assessorId: aId,
      name: aName,
      email: aEmail,
      phone: aPhone,
      workload: {
        active: activeCount,
        dueSoon: dueSoonCount,
        overdue: overdueCount,
        onTrack: onTrackCount,
        completed: completedCount,
        total: activeCount + completedCount,
        capacity: capacityLimit,
        capacityLimit,
        isAtCapacity,
        isOverCapacity,
        utilizationPercent,
        status: operationalStatus,
        capacityStatus: operationalStatus
      },
      activeTasks,
      completedTasksCount: completedCount
    };
  });

  // Calculate unassigned active evaluations
  const unassignedActiveTasks = validEvaluations
    .filter(e => {
      const evalId = String(e._id || e.id);
      if (matchedEvalIds.has(evalId)) return false;
      const status = String(e.status || '').toLowerCase();
      return status !== 'completed' && status !== 'approved' && status !== 'cancelled';
    })
    .map(e => ({
      id: String(e._id || e.id),
      companyName: e.companyName || 'Unassigned Customer',
      deviceModel: e.deviceModel || 'N/A',
      status: e.status || 'registered',
      scheduledDate: e.scheduledDate || null,
      createdAt: e.createdAt,
      sla: {
        status: e.sla?.status || SLA_STATUS.ON_TRACK,
        deadline: e.sla?.deadline || null,
        remainingFormatted: e.sla?.remainingFormatted || 'N/A',
        overdueFormatted: e.sla?.overdueFormatted || 'None'
      }
    }));

  const totalAssessors = assessorWorkloads.length;
  const availableAssessors = assessorWorkloads.filter(a => a.workload.active === 0).length;
  const activeAssessors = assessorWorkloads.filter(a => a.workload.active > 0).length;
  const optimalAssessors = assessorWorkloads.filter(a => a.workload.status === 'OPTIMAL').length;
  const atCapacityAssessors = assessorWorkloads.filter(a => a.workload.status === 'AT_CAPACITY').length;
  const overloadedAssessors = assessorWorkloads.filter(a => a.workload.isOverCapacity).length;

  const totalActiveAssignments = assessorWorkloads.reduce((acc, a) => acc + a.workload.active, 0);
  const totalDueSoon = assessorWorkloads.reduce((acc, a) => acc + a.workload.dueSoon, 0);
  const totalOverdue = assessorWorkloads.reduce((acc, a) => acc + a.workload.overdue, 0);
  const totalCompleted = assessorWorkloads.reduce((acc, a) => acc + a.workload.completed, 0);

  return {
    capacityLimit,
    summary: {
      totalAssessors,
      totalRegisteredAssessors: totalAssessors,
      availableAssessors,
      activeAssessors,
      optimalAssessors,
      atCapacityAssessors,
      overloadedAssessors,
      totalActiveAssignments,
      totalDueSoon,
      totalOverdue,
      totalCompleted,
      unassignedCount: unassignedActiveTasks.length,
      unassignedActiveEvaluations: unassignedActiveTasks.length
    },
    assessors: assessorWorkloads,
    unassignedTasks: unassignedActiveTasks
  };
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use GET.' })
    };
  }

  // RBAC: Manager-only endpoint
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  try {
    const connection = await connectToDatabase();

    // 1. Retrieve all registered assessors
    let assessors = [];
    if (connection.isMongoAtlas) {
      assessors = await connection.db
        .collection(COLLECTION_USERS)
        .find({ role: 'assessor' }, { projection: { passwordHash: 0 } })
        .toArray();
    } else {
      const allUsers = await listUsers(connection);
      assessors = allUsers.filter(u => u.role === 'assessor');
    }

    // 2. Retrieve all active non-deleted evaluation records
    let evaluations = [];
    if (connection.isMongoAtlas) {
      evaluations = await connection.db
        .collection(COLLECTION_NAME)
        .find({ deletedAt: { $exists: false }, status: { $ne: 'inquiry' } })
        .toArray();
    } else {
      const allRecords = await connection.getEvaluations(false);
      evaluations = allRecords.filter(r => !r.deletedAt && r.status !== 'inquiry');
    }

    // 3. Compute authoritative workload aggregation
    const result = calculateAssessorWorkloads(assessors, evaluations, DEFAULT_ASSESSOR_CAPACITY);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...result
      })
    };
  } catch (error) {
    console.error('[GET-ASSESSOR-WORKLOAD-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to calculate assessor workload.'
      })
    };
  }
};

export default { handler };
