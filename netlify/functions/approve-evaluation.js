import {guardedEvaluationUpdate} from './db.js';
import {secureHandler, logSecurityFailure} from './security.js';
/**
 * Netlify Serverless Function: approve-evaluation
 * Handles POST requests to approve or reject an evaluation record.
 * Requirements:
 * - Protected by MANAGER_API_KEY (role-based access)
 * - Approves: sets status='approved', approvedBy, approvedAt, statusChangedAt
 * - Rejects: sets status='rejected', rejectedBy, rejectedAt, rejectionReason (required), statusChangedAt
 * - Appends audit action to evaluationHistory
 */

import { connectToDatabase, COLLECTION_NAME, COLLECTION_VERSIONS, buildMongoIdFilter, findAssessmentVersion } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';
import { calculateAssessmentSla } from './sla.js';

const rawHandler = async (event, context) => {
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

    const submittedReviewComment = payload.managerReviewComment ?? payload.reviewComment;
    if (submittedReviewComment !== undefined && (typeof submittedReviewComment !== 'string' || submittedReviewComment.length > 2000)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Manager review comment must be text of at most 2000 characters.' })
      };
    }

    const connection = await connectToDatabase();
    const nowIso = new Date().toISOString();
    const managerIdentifier = String(roleCheck.user?.name || roleCheck.user?.email || 'Operations Manager').trim();

    // Fetch current document first
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

    if (!existing || existing.deletedAt) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Evaluation record with ID "${id}" not found.` })
      };
    }

    if(event.securityExpectedVersion!==undefined && Number(existing.currentVersion||0)!==event.securityExpectedVersion)return {statusCode:409,headers,body:JSON.stringify({success:false,error:'Information changed. Reload before retrying.'})};
    const currentStatus = (existing.status || 'pending_review').toLowerCase();

    const rawAction = String(payload.action || payload.status || 'approve').trim().toLowerCase();
    let targetStatus;
    if (['approve', 'approved'].includes(rawAction)) {
      if (!['pending_review', 'submitted'].includes(currentStatus)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only a submitted assessment awaiting review can be approved.' }) };
      }
      targetStatus = 'approved';
      const version = Number(existing.currentVersion);
      const snapshot = Number.isInteger(version) && version > 0
        ? await findAssessmentVersion(connection, id, version) : null;
      if (!snapshot || !Array.isArray(snapshot.breakdown) || snapshot.breakdown.length !== 33) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'A complete assessment version is required before approval.' }) };
      }
    } else if (['reject', 'rejected'].includes(rawAction)) targetStatus = 'rejected';
    else return { statusCode: 400, headers, body: JSON.stringify({ error: 'Use approve or reject. Certificate steps are managed separately.' }) };

    // Validate rejection reason when status is rejected
    const rejectionReason = (payload.rejectionReason || payload.reason || '').trim();
    if (targetStatus === 'rejected') {
      if (!rejectionReason) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Rejection reason is required when rejecting an evaluation.'
          })
        };
      }
      // Requests for changes apply to submitted assessments awaiting review.
      if (!['pending_review', 'submitted'].includes(currentStatus)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Rejection is only permitted for evaluations awaiting review (current status: "${existing.status}").`
          })
        };
      }
    }

    // Build update document and audit history
    let updateFields = {};
    let historyEntry = {};
    let statusHistoryEntry = {};

    if (targetStatus !== 'rejected') {
      const approvedVersionNumber = Number(existing.currentVersion);

      updateFields = {
        status: targetStatus,
        approvedVersion: approvedVersionNumber,
        scoreApprovedBy: managerIdentifier,
        scoreApprovedAt: nowIso,
        approvedBy: managerIdentifier,
        approvedAt: nowIso,
        statusChangedAt: nowIso,
        rejectionReason: null,
        rejectedBy: null,
        rejectedAt: null
      };

      const defaultNote = `Assessment version ${approvedVersionNumber} approved by Manager. Ready for certificate preparation.`;

      historyEntry = {
        action: targetStatus,
        timestamp: nowIso,
        version: approvedVersionNumber,
        changedBy: managerIdentifier,
        note: payload.note || defaultNote
      };

      statusHistoryEntry = {
        status: targetStatus,
        changedAt: nowIso,
        changedBy: managerIdentifier,
        timestamp: nowIso,
        actor: managerIdentifier,
        note: payload.note || defaultNote
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

    // Keep managerial review separate from the immutable technical assessment.
    // Vendor responses use explicit allowlists and do not expose this field.
    if (submittedReviewComment !== undefined) {
      updateFields.managerReviewComment = submittedReviewComment.trim();
      historyEntry.managerReviewComment = updateFields.managerReviewComment;
    }

    // Compute updated SLA state
    const mergedDoc = { ...existing, ...updateFields };
    const sla = calculateAssessmentSla(mergedDoc);
    updateFields.slaStatus = sla.status;
    updateFields.slaDeadline = existing.slaDeadline || sla.deadline;

    // Apply update to persistent storage
    if (connection.isMongoAtlas) {
      await guardedEvaluationUpdate(collection, existing, filter, {
        $set: updateFields,
        $push: { 
          evaluationHistory: historyEntry,
          statusHistory: statusHistoryEntry
        }
      });

      // Synchronize linked registration record if present
      const linkedRegId = existing.linkedRegistrationId || existing.registrationReferenceId;
      if (linkedRegId) {
        await collection.updateOne(buildMongoIdFilter(linkedRegId), {
          $set: {
            status: targetStatus,
            slaStatus: updateFields.slaStatus,
            slaDeadline: updateFields.slaDeadline,
            approvedBy: updateFields.approvedBy,
            approvedAt: updateFields.approvedAt,
            statusChangedAt: nowIso
          },
          $push: { statusHistory: statusHistoryEntry }
        });
      }
    } else {
      await connection.updateEvaluation(id, updateFields, historyEntry, statusHistoryEntry, existing);
    }

    if (targetStatus !== 'rejected' && updateFields.approvedVersion) {
      try {
        if (connection.isMongoAtlas) {
          await connection.db.collection(COLLECTION_VERSIONS).updateOne(
            { evaluationId: String(id), versionNumber: Number(updateFields.approvedVersion) },
            { $set: { isApprovedVersion: true, approvedAt: nowIso, approvedBy: managerIdentifier } }
          );
        } else {
          // If local store has versions
          const versions = await connection.getAssessmentVersions?.(id) || [];
          const targetV = versions.find(v => Number(v.versionNumber) === Number(updateFields.approvedVersion));
          if (targetV) {
            targetV.isApprovedVersion = true;
            targetV.approvedAt = nowIso;
            targetV.approvedBy = managerIdentifier;
          }
        }
      } catch (verErr) {
        console.warn('[approval] VERSION_TAG_UNAVAILABLE');
      }
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
        slaStatus: sla.status,
        sla: {
          status: sla.status,
          label: sla.label,
          deadline: sla.deadline,
          remainingFormatted: sla.remainingFormatted,
          isCompleted: sla.isCompleted
        },
        rejectionReason: updateFields.rejectionReason || null,
        approvedBy: updateFields.approvedBy || null,
        approvedAt: updateFields.approvedAt || null,
        approvedVersion: updateFields.approvedVersion || null,
        rejectedBy: updateFields.rejectedBy || null,
        rejectedAt: updateFields.rejectedAt || null,
        statusChangedAt: nowIso
      });
    } catch (evtErr) {
      logSecurityFailure('approve-evaluation');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id,
        status: targetStatus,
        approvedVersion: updateFields.approvedVersion || null,
        sla,
        statusChangedAt: nowIso,
        approvedBy: updateFields.approvedBy || null,
        approvedAt: updateFields.approvedAt || null,
        rejectedBy: updateFields.rejectedBy || null,
        rejectedAt: updateFields.rejectedAt || null,
        rejectionReason: updateFields.rejectionReason || null,
        message: targetStatus === 'rejected'
          ? 'Changes requested from the Assessor.'
          : 'Assessment approved. Ready for certificate preparation.'
      })
    };
  } catch (error) {
    if(error.code==='ASSESSMENT_CONFLICT')return {statusCode:409,headers,body:JSON.stringify({success:false,error:'Information changed. Reload before retrying.'})};
    logSecurityFailure('approve-evaluation');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal Server Error during evaluation status update'
      })
    };
  }
};

export const handler = secureHandler(rawHandler, 'approve-evaluation');

export default { handler };
