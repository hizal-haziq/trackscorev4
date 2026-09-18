/**
 * Netlify Serverless Function: get-notifications
 * Polling-based notification check for assessors to receive real-time status changes (Approved / Rejected)
 * on their evaluation submissions.
 */
import { connectToDatabase, COLLECTION_NAME } from './db.js';
import { getRecentStatusEvents } from './status-bus.js';
import {
  validateRole,
  ROLE_ASSESSOR,
  authErrorResponse
} from './auth.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      body: JSON.stringify({ error: 'Method Not Allowed. Use GET.' })
    };
  }

  const roleCheck = validateRole(event);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  try {
    const params = event.queryStringParameters || {};
    const requestedAssessorId = (params.assessorName || params.assessorId || params.query || '').trim();
    let assessorId = requestedAssessorId;
    const since = params.since || null;

    if (roleCheck.role === ROLE_ASSESSOR) {
      assessorId = String(roleCheck.user?.assessorId || '').trim();
      if (!assessorId) {
        return authErrorResponse(headers, 403, 'Forbidden: Assessor identity is missing from the token.');
      }
    }

    // Check in-memory event bus first for any fresh status change events
    const busEvents = getRecentStatusEvents(assessorId, since);

    // Also check database records
    const connection = await connectToDatabase();
    let records = [];

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const query = {
        deletedAt: { $exists: false }
      };

      if (assessorId) {
        const regexAssessor = new RegExp(assessorId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const exactAssessorId = new RegExp(`^${assessorId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        query.$or = [
          // 1. Approved / Rejected submissions for this assessor
          {
            status: { $in: ['approved', 'rejected', 'remediation_required'] },
            $or: [
              { assessorId: exactAssessorId },
              { assessorName: regexAssessor },
              { assignedAssessorId: exactAssessorId },
              { assignedAssessor: regexAssessor }
            ]
          },
          // 2. Newly assigned or scheduled evaluations for this assessor
          {
            status: { $in: ['assigned', 'scheduled', 'registered'] },
            $or: [
              { assignedAssessorId: exactAssessorId },
              { assignedAssessor: regexAssessor },
              { assignedAssessorName: regexAssessor },
              { assignedAssessorEmail: regexAssessor },
              { assessorId: exactAssessorId },
              { assessorName: regexAssessor }
            ]
          }
        ];
      } else {
        query.status = { $in: ['approved', 'rejected', 'remediation_required', 'assigned', 'scheduled'] };
      }

      records = await collection
        .find(query)
        .sort({ assignedAt: -1, statusChangedAt: -1, updatedAt: -1, createdAt: -1 })
        .limit(30)
        .toArray();
    } else {
      const all = await connection.getEvaluations(false);
      records = all.filter(r => {
        if (r.deletedAt) return false;
        const s = (r.status || '').toLowerCase();
        const isApprovedOrRejected = s === 'approved' || s === 'rejected' || s === 'remediation_required';
        const isAssigned = s === 'assigned' || s === 'scheduled' || (s === 'registered' && (r.assignedAssessor || r.assignedAssessorId));
        if (!isApprovedOrRejected && !isAssigned) return false;
        if (!assessorId) return true;

        const aid = assessorId.toLowerCase();
        if (isApprovedOrRejected) {
          const rId = String(r.assessorId || r.assignedAssessorId || '').toLowerCase();
          const rName = String(r.assessorName || r.assignedAssessor || '').toLowerCase();
          return rId === aid || rName.includes(aid) || aid.includes(rName);
        }
        if (isAssigned) {
          const aId = String(r.assignedAssessorId || r.assessorId || '').toLowerCase();
          const aName = String(r.assignedAssessor || r.assignedAssessorName || r.assessorName || '').toLowerCase();
          const aEmail = String(r.assignedAssessorEmail || '').toLowerCase();
          return aId === aid || aName.includes(aid) || aid.includes(aName) || aEmail === aid;
        }
        return false;
      });
      records.sort((a, b) => new Date(b.assignedAt || b.statusChangedAt || b.updatedAt || 0) - new Date(a.assignedAt || a.statusChangedAt || a.updatedAt || 0));
      records = records.slice(0, 30);
    }

    // Merge database state into unified notification list
    const notifications = records.map(r => {
      const s = (r.status || '').toLowerCase();
      const isAssigned = s === 'assigned' || s === 'scheduled' || (s === 'registered' && (r.assignedAssessor || r.assignedAssessorId));
      const isApproved = s === 'approved';
      const isRejected = s === 'rejected' || s === 'remediation_required';

      return {
        evaluationId: r._id || r.id,
        id: r._id || r.id,
        companyName: r.companyName || 'Untitled Company',
        deviceModel: r.deviceModel || 'Unspecified Model',
        packageName: r.packageName || 'Package 2: Comprehensive Assessment (RM 6,000)',
        assessorId: r.assignedAssessorId || r.assessorId || '',
        assessorName: r.assignedAssessor || r.assignedAssessorName || r.assessorName || '',
        assignedAssessor: r.assignedAssessor || r.assignedAssessorName || '',
        assignedAssessorId: r.assignedAssessorId || '',
        assignedBy: r.assignedBy || r.scheduledBy || null,
        assignedAt: r.assignedAt || r.scheduledAt || null,
        scheduledDate: r.scheduledDate || null,
        assignmentInstructions: r.assignmentInstructions || r.schedulingNotes || null,
        status: isAssigned ? 'assigned' : (isApproved ? 'approved' : (isRejected ? 'rejected' : r.status)),
        originalStatus: r.status,
        eventType: isAssigned ? 'ASSIGNMENT' : (isApproved ? 'APPROVAL' : 'REMEDIATION'),
        rejectionReason: r.rejectionReason || null,
        approvedBy: r.approvedBy || null,
        approvedAt: r.approvedAt || null,
        rejectedBy: r.rejectedBy || null,
        rejectedAt: r.rejectedAt || null,
        totalScore: typeof r.totalScore === 'number' ? r.totalScore : (parseFloat(r.totalScore) || 0),
        starsCount: r.starsCount || 0,
        ratingLabel: r.ratingLabel || '',
        rubricVersion: r.rubricVersion || '2.0',
        createdAt: r.createdAt || null,
        statusChangedAt: r.assignedAt || r.scheduledAt || r.statusChangedAt || r.updatedAt || r.createdAt
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        recentLiveEvents: busEvents,
        notifications
      })
    };
  } catch (error) {
    console.error('get-notifications error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to check notifications' })
    };
  }
};
