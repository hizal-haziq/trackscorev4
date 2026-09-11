/**
 * Netlify Serverless Function: update-evaluation
 * Handles PUT / PATCH requests to update an existing evaluation record by _id.
 * Features:
 * - Shared-secret header authentication (x-api-key)
 * - Automatic score recomputation if breakdown is updated
 * - Updates in MongoDB Atlas or local fallback storage
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recomputeScores } from './rubric.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'PUT, PATCH, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  if (event.httpMethod !== 'PUT' && event.httpMethod !== 'PATCH') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Use PUT or PATCH.' })
    };
  }

  // 1. API Protection Check (Manager Role Required)
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
        body: JSON.stringify({ error: 'Missing evaluation ID (_id or ?id= parameter required)' })
      };
    }

    const connection = await connectToDatabase();

    // 2. Fetch existing document to create audit snapshot
    let existingRecord = null;
    let filter = null;
    let collection = null;

    if (connection.isMongoAtlas) {
      collection = connection.db.collection(COLLECTION_NAME);
      filter = buildMongoIdFilter(id);
      existingRecord = await collection.findOne(filter);
    } else {
      existingRecord = await connection.getEvaluationById(id);
    }

    if (!existingRecord) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Evaluation record not found for ID: ${id}` })
      };
    }

    // 3. Immutability Enforcement: Approved/Completed evaluations are locked and cannot be edited
    if (existingRecord.status === 'approved' || existingRecord.status === 'completed') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: 'Completed/Approved evaluations are locked and cannot be edited. Contact a manager to reject and resubmit if a correction is needed.'
        })
      };
    }

    const VALID_LIFECYCLE_STATUSES = [
      'registered',
      'scheduled',
      'submitted',
      'pending_review',
      'pre_final_sent',
      'payment_confirmed',
      'certificate_issued',
      'completed',
      'rejected'
    ];

    const updateFields = {};
    let statusHistoryEntry = null;
    if (payload.status !== undefined && payload.status !== null && String(payload.status).trim() !== '') {
      const targetStatus = String(payload.status).trim().toLowerCase();
      if (!VALID_LIFECYCLE_STATUSES.includes(targetStatus)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Invalid status "${payload.status}". Valid statuses: ${VALID_LIFECYCLE_STATUSES.join(', ')}`
          })
        };
      }

      if (targetStatus !== (existingRecord.status || 'pending_review').toLowerCase()) {
        const changedBy = (
          payload.changedBy ||
          payload.updatedBy ||
          payload.editedBy ||
          roleCheck?.user?.name ||
          roleCheck?.user?.email ||
          payload.assessorName ||
          'Assessor'
        ).trim();

        const nowIso = new Date().toISOString();
        updateFields.status = targetStatus;
        updateFields.statusChangedAt = nowIso;
        statusHistoryEntry = {
          status: targetStatus,
          changedAt: nowIso,
          changedBy: changedBy
        };
      }
    }

    // 4. Prepare audit trail snapshot
    const historySnapshot = {
      editedAt: new Date().toISOString(),
      editedBy: payload.editedBy || payload.assessorName || 'Manager',
      previousScores: {
        sectionAScore: existingRecord.sectionAScore ?? 0,
        sectionBScore: existingRecord.sectionBScore ?? 0,
        totalScore: existingRecord.totalScore ?? 0,
        starRating: existingRecord.starRating ?? 0,
        starsCount: existingRecord.starsCount ?? 1,
        ratingLabel: existingRecord.ratingLabel ?? 'Unrated'
      },
      previousBreakdown: Array.isArray(existingRecord.breakdown) ? [...existingRecord.breakdown] : []
    };

    if (payload.companyName) updateFields.companyName = String(payload.companyName).trim();
    if (payload.deviceModel) updateFields.deviceModel = String(payload.deviceModel).trim();
    if (payload.packageName) updateFields.packageName = String(payload.packageName).trim();
    if (payload.assessorName) updateFields.assessorName = String(payload.assessorName).trim();
    if (payload.assessorId !== undefined) {
      const cleanAssessorId = String(payload.assessorId).trim().toUpperCase();
      if (cleanAssessorId && !/^[A-Z]{3} \d{4}$/.test(cleanAssessorId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid Assessor ID format. Must strictly follow 3 letters and 4 numbers (e.g. MKA 9006).' })
        };
      }
      updateFields.assessorId = cleanAssessorId;
    }
    if (payload.assessmentDate) updateFields.assessmentDate = String(payload.assessmentDate).trim();
    if (payload.scheduledDate !== undefined) updateFields.scheduledDate = payload.scheduledDate ? String(payload.scheduledDate).trim() : null;
    if (payload.requestedPackage) updateFields.requestedPackage = String(payload.requestedPackage).trim();
    if (payload.contactPerson !== undefined) updateFields.contactPerson = String(payload.contactPerson).trim();
    if (payload.contactEmail !== undefined) updateFields.contactEmail = String(payload.contactEmail).trim();
    if (payload.contactPhone !== undefined) updateFields.contactPhone = String(payload.contactPhone).trim();
    if (payload.invoice && typeof payload.invoice === 'object') {
      updateFields.invoice = {
        invoiceNumber: String(payload.invoice.invoiceNumber || '').trim(),
        amount: Number(payload.invoice.amount || 0),
        issuedDate: String(payload.invoice.issuedDate || '').trim(),
        dueDate: String(payload.invoice.dueDate || '').trim()
      };
    }

    // If breakdown array provided, recompute scores server-side
    if (Array.isArray(payload.breakdown) && payload.breakdown.length > 0) {
      const recomputed = recomputeScores(payload.breakdown);
      updateFields.breakdown = recomputed.breakdown;
      updateFields.sectionAScore = recomputed.sectionAScore;
      updateFields.sectionBScore = recomputed.sectionBScore;
      updateFields.totalScore = recomputed.totalScore;
      updateFields.starRating = recomputed.starRating;
      updateFields.starsCount = recomputed.starsCount;
      updateFields.ratingLabel = recomputed.ratingLabel;
      updateFields.rubricVersion = recomputed.rubricVersion;
    }

    updateFields.updatedAt = new Date().toISOString();

    const pushOps = { evaluationHistory: historySnapshot };
    if (statusHistoryEntry) {
      pushOps.statusHistory = statusHistoryEntry;
    }

    if (connection.isMongoAtlas) {
      const result = await collection.updateOne(filter, {
        $set: updateFields,
        $push: pushOps
      });

      if (result.matchedCount === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Evaluation record not found for ID: ${id}` })
        };
      }

      const updatedRecord = await collection.findOne(filter);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Evaluation updated successfully with audit trail snapshot in MongoDB Atlas',
          id,
          status: updateFields.status || existingRecord.status,
          updatedFields: Object.keys(updateFields),
          auditSnapshot: historySnapshot,
          statusHistoryEntry: statusHistoryEntry || null,
          data: updatedRecord
        })
      };
    } else {
      const result = await connection.updateEvaluation(id, updateFields, historySnapshot, statusHistoryEntry);
      if (result.matchedCount === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Evaluation record not found for ID: ${id}` })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Evaluation updated successfully with audit trail snapshot in local store',
          id,
          status: updateFields.status || existingRecord.status,
          updatedFields: Object.keys(updateFields),
          auditSnapshot: historySnapshot,
          data: result.updatedDoc
        })
      };
    }
  } catch (error) {
    console.error('Error updating evaluation:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal Server Error while updating evaluation'
      })
    };
  }
};

export default { handler };
