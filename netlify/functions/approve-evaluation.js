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

    const connection = await connectToDatabase();
    const nowIso = new Date().toISOString();
    const managerIdentifier = (payload.managerName || payload.approvedBy || payload.rejectedBy || roleCheck.user?.name || 'Operations Manager').trim();

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

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Evaluation record with ID "${id}" not found.` })
      };
    }

    const currentStatus = (existing.status || 'pending_review').toLowerCase();

    // Check if pre-final should be skipped
    const hasExplicitSkip = payload.preFinalSkipped !== undefined || payload.skipPreFinal !== undefined || payload.skip !== undefined;
    const isPreFinalSkipped = hasExplicitSkip
      ? Boolean(payload.preFinalSkipped || payload.skipPreFinal || payload.skip)
      : Boolean(existing.preFinalSkipped || existing.preFinalResult?.isSkipped);

    // Determine requested action: 'approved' | 'completed' | 'rejected' | or specific lifecycle status
    const rawAction = String(payload.action || payload.status || '').trim().toLowerCase();
    let targetStatus = payload.targetStatus || null;

    if (!targetStatus) {
      if (rawAction === 'approve' || rawAction === 'approved' || rawAction === '') {
        if (currentStatus === 'pending_review' || currentStatus === 'submitted') {
          // Approving assessor score advances pending_review/submitted records to 'pre_final_sent',
          // or maintains 'pending_review' if pre-final is flagged as skipped
          targetStatus = isPreFinalSkipped ? 'pending_review' : 'pre_final_sent';
        } else if (currentStatus === 'certificate_issued') {
          // If certificate is already issued and signed, approve can transition to completed
          targetStatus = 'completed';
        } else {
          targetStatus = currentStatus;
        }
      } else if (rawAction === 'completed') {
        // If current status is pending_review or submitted, it CANNOT jump directly to completed
        if (currentStatus === 'pending_review' || currentStatus === 'submitted') {
          targetStatus = isPreFinalSkipped ? 'pending_review' : 'pre_final_sent';
        } else {
          targetStatus = 'completed';
        }
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
    } else {
      // If targetStatus was explicitly provided but current status is pending_review or submitted and targetStatus is 'completed',
      // prevent the premature jump to 'completed' and transition to 'pre_final_sent' (or 'pending_review' if pre-final is skipped)
      if ((currentStatus === 'pending_review' || currentStatus === 'submitted') && targetStatus === 'completed') {
        targetStatus = isPreFinalSkipped ? 'pending_review' : 'pre_final_sent';
      }
    }

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
      // Enforce lifecycle rule: rejection is only reachable from pending_review or pre_final_sent
      if (currentStatus !== 'pending_review' && currentStatus !== 'pre_final_sent') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Rejection is only permitted for evaluations in "pending_review" or "pre_final_sent" status (current status: "${existing.status || 'pending_review'}").`
          })
        };
      }
    }

    // STRICT BACKEND GUARD: Prevent premature jump to 'completed'
    // An evaluation CANNOT be marked as completed unless:
    // 1. payment.status === 'paid' (or 'waived')
    // 2. certificate.signedDate exists
    // 3. certificate.signedBy exists
    if (targetStatus === 'completed') {
      const isPaid = existing.payment && (existing.payment.status === 'paid' || existing.payment.status === 'waived');
      const hasSignedCert = Boolean(
        existing.certificate &&
        existing.certificate.signedDate &&
        existing.certificate.signedBy
      );

      if (!isPaid || !hasSignedCert) {
        const missingReasons = [];
        if (!isPaid) {
          missingReasons.push(`payment must be verified as "paid" (current status: "${existing.payment?.status || 'unpaid'}")`);
        }
        if (!hasSignedCert) {
          if (!existing.certificate) {
            missingReasons.push('official certificate has not been prepared or issued');
          } else {
            if (!existing.certificate.signedDate) missingReasons.push('certificate lacks official signedDate');
            if (!existing.certificate.signedBy) missingReasons.push('certificate lacks authorized signatory (signedBy)');
          }
        }
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Cannot mark evaluation as completed: ${missingReasons.join(' and ')}.`
          })
        };
      }
    }

    // Build update document and audit history
    let updateFields = {};
    let historyEntry = {};
    let statusHistoryEntry = {};

    if (targetStatus !== 'rejected') {
      const isAdvanceToPreFinal = targetStatus === 'pre_final_sent';

      updateFields = {
        status: targetStatus,
        scoreApprovedBy: managerIdentifier,
        scoreApprovedAt: nowIso,
        approvedBy: managerIdentifier,
        approvedAt: nowIso,
        statusChangedAt: nowIso,
        preFinalSkipped: isPreFinalSkipped,
        rejectionReason: null,
        rejectedBy: null,
        rejectedAt: null
      };

      if (isAdvanceToPreFinal) {
        updateFields.preFinalResult = {
          sent: true,
          sentDate: nowIso,
          recipientEmail: (payload.recipientEmail || existing.contactEmail || 'customer@telematics.com').trim(),
          notes: payload.note || 'Assessor evaluation score approved by manager. Advanced to pre-final notification.',
          sentBy: managerIdentifier,
          isSkipped: false
        };
      } else if (isPreFinalSkipped) {
        updateFields.preFinalResult = {
          sent: false,
          sentDate: null,
          recipientEmail: (payload.recipientEmail || existing.contactEmail || 'customer@telematics.com').trim(),
          notes: payload.note || 'Pre-final result review skipped by manager.',
          sentBy: managerIdentifier,
          skippedBy: managerIdentifier,
          skippedAt: nowIso,
          isSkipped: true
        };
      }

      const defaultNote = isAdvanceToPreFinal
        ? 'Assessor evaluation score approved by manager. Advanced to pre-final stage (pre_final_sent).'
        : isPreFinalSkipped
          ? 'Assessor evaluation score approved by manager (pre-final skipped, ready for payment verification).'
          : (targetStatus === 'completed' ? 'Evaluation status moved to completed by manager.' : `Evaluation status moved to ${targetStatus} by manager.`);

      historyEntry = {
        action: targetStatus,
        timestamp: nowIso,
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

    // Apply update to persistent storage
    if (connection.isMongoAtlas) {
      await collection.updateOne(filter, {
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
            preFinalSkipped: updateFields.preFinalSkipped,
            preFinalResult: updateFields.preFinalResult,
            approvedBy: updateFields.approvedBy,
            approvedAt: updateFields.approvedAt,
            statusChangedAt: nowIso
          },
          $push: { statusHistory: statusHistoryEntry }
        });
      }
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
        preFinalSkipped: updateFields.preFinalSkipped,
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
        preFinalSkipped: updateFields.preFinalSkipped !== undefined ? updateFields.preFinalSkipped : isPreFinalSkipped,
        preFinalResult: updateFields.preFinalResult || existing.preFinalResult || null,
        approvedBy: updateFields.approvedBy || null,
        approvedAt: updateFields.approvedAt || null,
        rejectedBy: updateFields.rejectedBy || null,
        rejectedAt: updateFields.rejectedAt || null,
        rejectionReason: updateFields.rejectionReason || null,
        message: targetStatus === 'rejected'
          ? `Evaluation "${id}" rejected with reason recorded.`
          : (targetStatus === 'pre_final_sent'
            ? `Evaluation score for "${id}" approved successfully. Advanced to Pre-Final notification stage.`
            : (isPreFinalSkipped
              ? `Evaluation score for "${id}" approved with pre-final stage skipped. Ready for payment verification.`
              : (targetStatus === 'completed'
                ? `Evaluation "${id}" approved successfully and marked as completed.`
                : `Evaluation "${id}" status updated to "${targetStatus}".`)))
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
