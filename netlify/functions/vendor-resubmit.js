/**
 * Netlify Serverless Function: vendor-resubmit
 * Allows vendors to respond to revision/rejection requests and resubmit their assessment.
 *
 * Requirements & Architecture Integration:
 * - Requires valid JWT with role: 'vendor'
 * - Verifies evaluation ownership via vendor.linkedRegistrationIds (prevents IDOR)
 * - Verifies evaluation is in 'rejected' status or has pending revision requests
 * - Authoritatively computes next version number via getNextVersionNumber()
 * - Creates version snapshot in `assessment_versions` collection
 * - Transitions status back to 'submitted' for assessor/manager re-evaluation
 * - Clears current rejectionReason, archives revision notes to history
 * - Emits real-time status event and maintains full audit history
 */

import {
  connectToDatabase,
  findVendorById,
  findVendorByEmail,
  COLLECTION_NAME,
  buildMongoIdFilter,
  getNextVersionNumber,
  createAssessmentVersionRecord
} from './db.js';
import { verifyToken, getBearerToken, ROLE_VENDOR } from './auth.js';
import { recordStatusEvent } from './status-bus.js';
import { calculateAssessmentSla } from './sla.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' })
    };
  }

  // 1. Authenticate Vendor JWT
  const token = getBearerToken(event);
  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Unauthorized: Missing Authorization Bearer token.' })
    };
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== ROLE_VENDOR) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: 'Forbidden: Access restricted to authorized vendor accounts.' })
    };
  }

  try {
    let body = {};
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload.' })
      };
    }

    const {
      evaluationId,
      id,
      notes,
      responseNotes,
      remediationNote,
      deviceModel
    } = body;

    const targetEvalId = String(evaluationId || id || '').trim();
    const cleanNotes = String(responseNotes || remediationNote || notes || '').trim();

    if (!targetEvalId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Evaluation ID is required.' })
      };
    }

    if (!cleanNotes) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Revision response explanation is required.' })
      };
    }

    const connection = await connectToDatabase();

    // 2. Authoritative Vendor Verification & Ownership Check
    let vendor = null;
    if (decoded.vendorId) {
      vendor = await findVendorById(connection, decoded.vendorId);
    }
    if (!vendor && decoded.email) {
      vendor = await findVendorByEmail(connection, decoded.email);
    }

    if (!vendor || vendor.isActive === false) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: 'Vendor account not found or deactivated.' })
      };
    }

    const linkedIds = Array.isArray(vendor.linkedRegistrationIds)
      ? vendor.linkedRegistrationIds.map(String)
      : [];

    if (!linkedIds.includes(targetEvalId)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: 'Forbidden: You do not have ownership of this evaluation.' })
      };
    }

    // 3. Retrieve Evaluation
    let evalDoc = null;
    if (connection.isMongoAtlas) {
      evalDoc = await connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(targetEvalId));
    } else {
      evalDoc = await connection.getEvaluationById(targetEvalId);
    }

    if (!evalDoc) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Evaluation record not found.' })
      };
    }

    // Verify evaluation is in an eligible revision state
    const currentStatus = String(evalDoc.status || '').toLowerCase();
    const isEligible = currentStatus === 'rejected' ||
                       currentStatus === 'pending_review' ||
                       Boolean(evalDoc.rejectionReason);

    if (!isEligible) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Resubmission not allowed for current status "${evalDoc.status}". Resubmission is only permitted when revision or corrections are requested.`
        })
      };
    }

    const nowIso = new Date().toISOString();
    const versionFromDb = await getNextVersionNumber(connection, targetEvalId);
    const nextVersion = Math.max(versionFromDb, Number(evalDoc.currentVersion || 1) + 1);

    // 4. Create authoritative version snapshot
    const versionDoc = {
      evaluationId: targetEvalId,
      versionNumber: nextVersion,
      action: 'RESUBMISSION_BY_VENDOR',
      changeReason: cleanNotes,
      actor: {
        name: vendor.companyName || 'Vendor',
        role: 'vendor',
        vendorId: String(vendor._id)
      },
      scores: {
        sectionAScore: evalDoc.sectionAScore || 0,
        sectionBScore: evalDoc.sectionBScore || 0,
        totalScore: evalDoc.totalScore || 0,
        starRating: evalDoc.starRating || 0,
        starsCount: evalDoc.starsCount || 0,
        ratingLabel: evalDoc.ratingLabel || ''
      },
      breakdown: Array.isArray(evalDoc.breakdown) ? evalDoc.breakdown : [],
      metadata: {
        companyName: evalDoc.companyName,
        deviceModel: deviceModel ? String(deviceModel).trim() : evalDoc.deviceModel,
        remediationNotes: cleanNotes
      },
      createdAt: nowIso
    };

    await createAssessmentVersionRecord(connection, versionDoc);

    // 5. Update Evaluation record
    const statusHistory = Array.isArray(evalDoc.statusHistory) ? [...evalDoc.statusHistory] : [];
    statusHistory.push({
      status: 'submitted',
      timestamp: nowIso,
      actor: `Vendor (${vendor.companyName})`,
      note: `Vendor submitted revision response (v${nextVersion}): ${cleanNotes.substring(0, 200)}`
    });

    const evalHistory = Array.isArray(evalDoc.evaluationHistory) ? [...evalDoc.evaluationHistory] : [];
    evalHistory.push({
      action: 'resubmitted_by_vendor',
      timestamp: nowIso,
      version: nextVersion,
      reason: cleanNotes,
      changedBy: `Vendor (${vendor.companyName})`,
      note: `Vendor addressed corrections and resubmitted assessment for evaluation.`
    });

    const updateFields = {
      status: 'submitted',
      statusChangedAt: nowIso,
      currentVersion: nextVersion,
      resubmittedAt: nowIso,
      previousRejectionReason: evalDoc.rejectionReason || null,
      rejectionReason: null,
      vendorRevisionResponse: {
        notes: cleanNotes,
        submittedAt: nowIso,
        version: nextVersion
      },
      statusHistory,
      evaluationHistory: evalHistory,
      updatedAt: nowIso
    };

    if (deviceModel && String(deviceModel).trim()) {
      updateFields.deviceModel = String(deviceModel).trim();
    }

    if (connection.isMongoAtlas) {
      await connection.db.collection(COLLECTION_NAME).updateOne(
        buildMongoIdFilter(targetEvalId),
        { $set: updateFields }
      );
    } else {
      await connection.updateEvaluation(targetEvalId, updateFields);
    }

    // 6. Real-time notification
    recordStatusEvent({
      evaluationId: targetEvalId,
      companyName: evalDoc.companyName,
      deviceModel: updateFields.deviceModel || evalDoc.deviceModel,
      status: 'submitted',
      newStatus: 'submitted',
      oldStatus: evalDoc.status,
      actor: vendor.companyName,
      eventType: 'RESUBMISSION',
      note: `Vendor resubmitted evaluation (v${nextVersion}): ${cleanNotes.substring(0, 100)}`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Assessment successfully resubmitted as version ${nextVersion}. Queued for inspection.`,
        version: nextVersion,
        status: 'submitted'
      })
    };
  } catch (error) {
    console.error('[VENDOR-RESUBMIT-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error while processing resubmission.' })
    };
  }
};

export default { handler };
