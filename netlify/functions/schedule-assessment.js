/**
 * Netlify Serverless Function: schedule-assessment
 * Allows managers to schedule an inspection date for a registered customer.
 * Moves status: 'registered' -> 'scheduled' (or updates schedule if already scheduled).
 * Integrates SLA start and deadline tracking.
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';
import { resolveSlaDurationDays, computeSlaDeadline, calculateAssessmentSla } from './sla.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
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

  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const managerName = roleCheck.user?.name || 'Operations Manager';

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
      id,
      companyName,
      scheduledDate,
      notes = '',
      assignedAssessor = '',
      assignedAssessorId = '',
      assignedAssessorName = '',
      assignedAssessorEmail = '',
      deviceModel,
      slaDays,
      slaDurationDays,
      customSlaDays
    } = body;
    if (!id && !companyName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Record ID or Company Name is required.' })
      };
    }

    if (!scheduledDate || !scheduledDate.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Scheduled inspection date is required.' })
      };
    }

    const connection = await connectToDatabase();
    let existing = null;
    let collection = null;
    let filter = null;

    if (connection.isMongoAtlas) {
      collection = connection.db.collection(COLLECTION_NAME);
      if (id) {
        filter = buildMongoIdFilter(id);
        existing = await collection.findOne(filter);
      }
      if (!existing && companyName) {
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter = {
          companyName: { $regex: new RegExp(`^${escapeRegex(companyName.trim())}$`, 'i') },
          status: { $in: ['registered', 'scheduled'] },
          deletedAt: null
        };
        existing = await collection.findOne(filter);
      }
    } else {
      if (id) {
        existing = await connection.getEvaluationById(id);
      }
      if (!existing && companyName) {
        const all = await connection.getEvaluations();
        existing = all.find(r =>
          String(r.companyName || '').toLowerCase() === companyName.trim().toLowerCase() &&
          ['registered', 'scheduled'].includes(r.status) &&
          !r.deletedAt
        );
      }
    }

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Customer registration record not found.' })
      };
    }

    const recordId = String(existing._id || id);
    const nowIso = new Date().toISOString();
    const oldStatus = existing.status || 'registered';
    const newStatus = 'scheduled';

    // SLA Calculation
    const targetPackage = body.package || body.packageChoice || existing.package;
    const packageChanged = Boolean(body.package && body.package !== existing.package);
    const explicitDays = Number(slaDays || slaDurationDays || customSlaDays);
    const effectiveSlaDays = explicitDays > 0 
      ? explicitDays 
      : (packageChanged ? resolveSlaDurationDays({ package: targetPackage }) : resolveSlaDurationDays(existing));
    const slaStartAt = existing.slaStartAt || nowIso;
    const slaDeadline = computeSlaDeadline({ ...existing, slaDeadline: null, package: targetPackage }, slaStartAt, effectiveSlaDays);

    const chosenAssessor = (assignedAssessorName || assignedAssessor || '').trim();
    const historyEntry = {
      status: newStatus,
      changedAt: nowIso,
      changedBy: managerName,
      timestamp: nowIso,
      actor: managerName,
      note: `Inspection scheduled for ${scheduledDate.trim()}.${deviceModel ? ` Device Model: ${deviceModel.trim()}.` : ''}${chosenAssessor ? ` Assigned to: ${chosenAssessor}${assignedAssessorId ? ` (${assignedAssessorId})` : ''}.` : ''} SLA: ${effectiveSlaDays} days (Deadline: ${new Date(slaDeadline).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}). ${notes ? `Note: ${notes}` : ''}`
    };

    const updateFields = {
      scheduledDate: scheduledDate.trim(),
      status: newStatus,
      statusChangedAt: nowIso,
      scheduledBy: managerName,
      scheduledAt: nowIso,
      slaStartAt,
      slaDeadline,
      slaDurationDays: effectiveSlaDays
    };

    if (body.package) {
      updateFields.package = body.package;
    }

    if (deviceModel && deviceModel.trim()) {
      updateFields.deviceModel = deviceModel.trim();
    }
    if (chosenAssessor) {
      updateFields.assignedAssessor = chosenAssessor;
      updateFields.assignedAssessorName = chosenAssessor;
      updateFields.assignedAssessorId = (assignedAssessorId || '').trim();
      updateFields.assignedAssessorEmail = (assignedAssessorEmail || '').trim();
      updateFields.assignedAt = nowIso;
      updateFields.assignedBy = managerName;
    }
    if (notes) {
      updateFields.schedulingNotes = notes.trim();
    }

    if (connection.isMongoAtlas) {
      await collection.updateOne({ _id: existing._id }, {
        $set: updateFields,
        $push: { statusHistory: historyEntry }
      });
    } else {
      await connection.updateEvaluation(recordId, updateFields, historyEntry);
    }

    const updatedMerged = { ...existing, ...updateFields };
    const slaSnapshot = calculateAssessmentSla(updatedMerged);

    recordStatusEvent({
      evaluationId: recordId,
      id: recordId,
      companyName: existing.companyName,
      deviceModel: updateFields.deviceModel || existing.deviceModel,
      packageName: existing.packageName || '',
      assessorId: updateFields.assignedAssessorId || undefined,
      assessorName: chosenAssessor || undefined,
      assignedAssessor: chosenAssessor || undefined,
      assignedAssessorId: updateFields.assignedAssessorId || undefined,
      assignedAssessorEmail: updateFields.assignedAssessorEmail || undefined,
      oldStatus,
      newStatus,
      status: newStatus,
      eventType: chosenAssessor ? 'ASSIGNMENT' : 'SCHEDULE',
      scheduledDate: scheduledDate.trim(),
      assignmentInstructions: notes ? notes.trim() : null,
      actor: managerName,
      assignedBy: managerName,
      assignedAt: nowIso,
      slaDeadline,
      slaDurationDays: effectiveSlaDays,
      slaStatus: slaSnapshot.status,
      note: `Inspection scheduled for ${scheduledDate.trim()}${chosenAssessor ? ` (Assigned to ${chosenAssessor})` : ''} - Target SLA: ${effectiveSlaDays} days`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: recordId,
        message: `Inspection scheduled for ${scheduledDate.trim()}${chosenAssessor ? ` and assigned to ${chosenAssessor}` : ''}`,
        status: newStatus,
        scheduledDate: scheduledDate.trim(),
        assignedAssessor: chosenAssessor || null,
        deviceModel: updateFields.deviceModel || existing.deviceModel,
        sla: slaSnapshot
      })
    };
  } catch (error) {
    console.error('[SCHEDULE-ASSESSMENT-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Error scheduling assessment.' })
    };
  }
};

export default { handler };
