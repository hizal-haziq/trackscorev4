/**
 * Netlify Serverless Function: assign-assessor
 * Allows Managers to assign any registered customer, scheduled assessment,
 * or evaluation task to any chosen assessor.
 *
 * Features:
 * - Select assessor from registered staff directory
 * - Set or update scheduled inspection date
 * - Add manager briefing instructions/notes
 * - Integrates SLA target tracking & deadline calculation
 * - Updates status from 'registered' to 'scheduled'
 * - Records audit trail in statusHistory
 * - Emits real-time SSE notification for the assessor
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';
import { resolveSlaDurationDays, computeSlaDeadline, calculateAssessmentSla } from './sla.js';
import { DEFAULT_ASSESSOR_CAPACITY } from './get-assessor-workload.js';

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
      assessorId = '',
      assessorName = '',
      assessorEmail = '',
      scheduledDate = '',
      deviceModel = '',
      notes = '',
      instructions = '',
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

    const chosenAssessorName = (assessorName || '').trim();
    if (!chosenAssessorName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Please choose an assessor to assign this task.' })
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
          !r.deletedAt
        );
      }
    }

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Assessment registration record not found.' })
      };
    }

    const recordId = String(existing._id || id);
    const nowIso = new Date().toISOString();
    const oldStatus = existing.status || 'registered';
    // Promote registered to scheduled when assigned; otherwise keep existing status
    const newStatus = oldStatus === 'registered' ? 'scheduled' : oldStatus;
    const taskBriefing = (instructions || notes || '').trim();

    // SLA Calculation
    const effectiveSlaDays = Number(slaDays || slaDurationDays || customSlaDays) || resolveSlaDurationDays(existing);
    const slaStartAt = existing.slaStartAt || nowIso;
    const slaDeadline = computeSlaDeadline(existing, slaStartAt, effectiveSlaDays);

    const historyEntry = {
      status: newStatus,
      changedAt: nowIso,
      changedBy: managerName,
      timestamp: nowIso,
      actor: managerName,
      note: `Task assigned to assessor ${chosenAssessorName}${assessorId ? ` (${assessorId})` : ''} by ${managerName}.${scheduledDate ? ` Scheduled inspection date: ${scheduledDate.trim()}.` : ''} SLA Target: ${effectiveSlaDays} days (Deadline: ${new Date(slaDeadline).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}).${taskBriefing ? ` Instructions: ${taskBriefing}` : ''}`
    };

    const updateFields = {
      assignedAssessor: chosenAssessorName,
      assignedAssessorName: chosenAssessorName,
      assignedAssessorId: (assessorId || '').trim(),
      assignedAssessorEmail: (assessorEmail || '').trim(),
      assignedAt: nowIso,
      assignedBy: managerName,
      status: newStatus,
      statusChangedAt: nowIso,
      slaStartAt,
      slaDeadline,
      slaDurationDays: effectiveSlaDays
    };

    if (scheduledDate && scheduledDate.trim()) {
      updateFields.scheduledDate = scheduledDate.trim();
      updateFields.scheduledBy = managerName;
      updateFields.scheduledAt = nowIso;
    }

    if (deviceModel && deviceModel.trim()) {
      updateFields.deviceModel = deviceModel.trim();
    }

    if (taskBriefing) {
      updateFields.schedulingNotes = taskBriefing;
      updateFields.assignmentInstructions = taskBriefing;
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

    // Broadcast SSE notification to assessor and management
    recordStatusEvent({
      evaluationId: recordId,
      id: recordId,
      companyName: existing.companyName,
      deviceModel: updateFields.deviceModel || existing.deviceModel,
      packageName: existing.packageName || '',
      assessorId: updateFields.assignedAssessorId || undefined,
      assessorName: chosenAssessorName,
      assignedAssessor: chosenAssessorName,
      assignedAssessorId: updateFields.assignedAssessorId || undefined,
      assignedAssessorEmail: updateFields.assignedAssessorEmail || undefined,
      oldStatus,
      newStatus,
      status: newStatus,
      eventType: 'ASSIGNMENT',
      scheduledDate: updateFields.scheduledDate || existing.scheduledDate || null,
      assignmentInstructions: taskBriefing || null,
      actor: managerName,
      assignedBy: managerName,
      assignedAt: nowIso,
      slaDeadline,
      slaDurationDays: effectiveSlaDays,
      slaStatus: slaSnapshot.status,
      note: `Task assigned to ${chosenAssessorName} - SLA Deadline: ${slaSnapshot.remainingFormatted}`
    });

    let activeTasksCount = 1;
    if (connection.isMongoAtlas) {
      const assessorFilters = [{ assignedAssessor: chosenAssessorName }, { assignedAssessorName: chosenAssessorName }];
      if (updateFields.assignedAssessorId) {
        assessorFilters.push({ assignedAssessorId: updateFields.assignedAssessorId });
      }
      activeTasksCount = await collection.countDocuments({
        deletedAt: { $exists: false },
        status: { $nin: ['completed', 'approved', 'cancelled', 'inquiry'] },
        $or: assessorFilters
      });
    } else {
      const allActive = await connection.getEvaluations(false);
      activeTasksCount = allActive.filter(d => 
        !d.deletedAt && d.status !== 'inquiry' && d.status !== 'completed' && d.status !== 'approved' && d.status !== 'cancelled' &&
        (d.assignedAssessorId === updateFields.assignedAssessorId || d.assignedAssessor === chosenAssessorName || d.assignedAssessorName === chosenAssessorName)
      ).length;
    }

    const isOverCapacity = activeTasksCount > DEFAULT_ASSESSOR_CAPACITY;
    const capacityWarning = isOverCapacity ? {
      isOverCapacity: true,
      activeCount: activeTasksCount,
      capacityLimit: DEFAULT_ASSESSOR_CAPACITY,
      message: `Assessor ${chosenAssessorName} currently has ${activeTasksCount} active assessments (Recommended capacity: ${DEFAULT_ASSESSOR_CAPACITY}).`
    } : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: recordId,
        message: `Task successfully assigned to ${chosenAssessorName} (SLA: ${effectiveSlaDays} days)`,
        status: newStatus,
        assignedAssessor: chosenAssessorName,
        assignedAssessorId: updateFields.assignedAssessorId,
        assignedAssessorEmail: updateFields.assignedAssessorEmail,
        scheduledDate: updateFields.scheduledDate || existing.scheduledDate || null,
        deviceModel: updateFields.deviceModel || existing.deviceModel,
        sla: slaSnapshot,
        capacityWarning
      })
    };
  } catch (error) {
    console.error('[ASSIGN-ASSESSOR-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Error assigning assessor.' })
    };
  }
};

export default { handler };
