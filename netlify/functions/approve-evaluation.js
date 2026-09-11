/**
 * Netlify Serverless Function: approve-evaluation
 * Handles POST requests to approve or reject an evaluation record.
 * Requirements:
 * - Protected by MANAGER_API_KEY (role-based access)
 * - Approves: sets status='approved', approvedBy, approvedAt, statusChangedAt
 * - Rejects: sets status='rejected', rejectedBy, rejectedAt, rejectionReason (required), statusChangedAt
 * - Appends audit action to evaluationHistory
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' })
    };
  }

  // 1. Validate Manager privileges
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  try {
    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON payload in request body' })
      };
    }

    const id = event.queryStringParameters?.id || payload?._id || payload?.id;
    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing evaluation ID (_id or id required)' })
      };
    }

    // Determine requested action: 'approved' | 'completed' | 'rejected' | or specific lifecycle status
    const rawAction = String(payload.action || payload.status || '').trim().toLowerCase();
    let targetStatus = null;
    if (rawAction === 'approve' || rawAction === 'approved' || rawAction === 'completed') {
      targetStatus = payload.targetStatus || 'completed';
    } else if (rawAction === 'reject' || rawAction === 'rejected') {
      targetStatus = 'rejected';
    } else if (['registered', 'scheduled', 'submitted', 'pending_review', 'pre_final_sent', 'payment_confirmed', 'certificate_issued', 'completed'].includes(rawAction)) {
      targetStatus = rawAction;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Invalid status or action "${rawAction}". Permitted values: "approved", "rejected", or a valid lifecycle stage.`
        })
      };
    }

    // Validate rejection reason when status is rejected
    const rejectionReason = (payload.rejectionReason || payload.reason || '').trim();
    if (targetStatus === 'rejected' && !rejectionReason) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Rejection reason is required when rejecting an evaluation.'
        })
      };
    }

    const connection = await connectToDatabase();
    const nowIso = new Date().toISOString();
    const managerIdentifier = (payload.managerName || payload.approvedBy || payload.rejectedBy || roleCheck.user?.name || 'Operations Manager').trim();

    // Fetch current document
    let existing = null;
    let collection = null;
    let filter = null;

    if (connection.isMongoAtlas) {
      collection = connection.db.collection(COLLECTION_NAME);
      filter = buildMongoIdFilter(id);
      existing = await collection.findOne(filter);
    } else {
      existing = await connection.getEvaluationById(id);
    }

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Evaluation record with ID "${id}" not found.` })
      };
    }

    // Enforce lifecycle rule: rejection is only reachable from pending_review or pre_final_sent
    if (targetStatus === 'rejected') {
      const current = (existing.status || 'pending_review').toLowerCase();
      if (current !== 'pending_review' && current !== 'pre_final_sent') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Rejection is only permitted for evaluations in "pending_review" or "pre_final_sent" status (current status: "${existing.status || 'pending_review'}").`
          })
        };
      }
    }

    // Build update document and audit history
    let updateFields = {};
    let historyEntry = {};
    let statusHistoryEntry = {};

    if (targetStatus !== 'rejected') {
      updateFields = {
        status: targetStatus,
        approvedBy: managerIdentifier,
        approvedAt: nowIso,
        statusChangedAt: nowIso,
        rejectionReason: null,
        rejectedBy: null,
        rejectedAt: null
      };

      historyEntry = {
        action: targetStatus,
        timestamp: nowIso,
        changedBy: managerIdentifier,
        note: payload.note || `Evaluation status moved to ${targetStatus} by manager`
      };

      statusHistoryEntry = {
        status: targetStatus,
        changedAt: nowIso,
        changedBy: managerIdentifier,
        timestamp: nowIso,
        actor: managerIdentifier,
        note: payload.note || `Evaluation status transitioned to ${targetStatus}`
      };
    } else {
      updateFields = {
        status: 'rejected',
        rejectedBy: managerIdentifier,
        rejectedAt: nowIso,
        rejectionReason,
        statusChangedAt: nowIso
      };

      historyEntry = {
        action: 'rejected',
        timestamp: nowIso,
        changedBy: managerIdentifier,
        rejectionReason,
        note: `Evaluation rejected: ${rejectionReason}`
      };

      statusHistoryEntry = {
        status: 'rejected',
        changedAt: nowIso,
        changedBy: managerIdentifier,
        timestamp: nowIso,
        actor: managerIdentifier,
        reason: rejectionReason,
        note: `Evaluation returned for corrections: ${rejectionReason}`
      };
    }

    // Apply update to persistent storage
    if (connection.isMongoAtlas) {
      await collection.updateOne(filter, {
        $set: updateFields,
        $push: { 
          evaluationHistory: historyEntry,
          statusHistory: statusHistoryEntry
        }
      });
    } else {
      await connection.updateEvaluation(id, updateFields, historyEntry, statusHistoryEntry);
    }

    // Broadcast status change event for SSE streams and polling listeners
    try {
      recordStatusEvent({
        evaluationId: id,
        assessorId: existing.assessorId || '',
        assessorName: existing.assessorName || '',
        companyName: existing.companyName || '',
        deviceModel: existing.deviceModel || '',
        totalScore: typeof existing.totalScore === 'number' ? existing.totalScore : (parseFloat(existing.totalScore) || 0),
        starsCount: existing.starsCount || 0,
        ratingLabel: existing.ratingLabel || '',
        createdAt: existing.createdAt || null,
        status: targetStatus,
        rejectionReason: updateFields.rejectionReason || null,
        approvedBy: updateFields.approvedBy || null,
        approvedAt: updateFields.approvedAt || null,
        rejectedBy: updateFields.rejectedBy || null,
        rejectedAt: updateFields.rejectedAt || null,
        statusChangedAt: nowIso
      });
    } catch (evtErr) {
      console.error('Failed to broadcast status change event:', evtErr);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id,
        status: targetStatus,
        statusChangedAt: nowIso,
        approvedBy: updateFields.approvedBy || null,
        approvedAt: updateFields.approvedAt || null,
        rejectedBy: updateFields.rejectedBy || null,
        rejectedAt: updateFields.rejectedAt || null,
        rejectionReason: updateFields.rejectionReason || null,
        message: targetStatus === 'approved'
          ? `Evaluation "${id}" approved successfully and locked against edits.`
          : `Evaluation "${id}" rejected with reason recorded.`
      })
    };
  } catch (error) {
    console.error('Error approving/rejecting evaluation:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal Server Error during evaluation status update'
      })
    };
  }
};

export default { handler };
