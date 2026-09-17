/**
 * Netlify Serverless Function: assign-assessor
 * Allows Managers to assign any registered customer, scheduled assessment,
 * or evaluation task to any chosen assessor.
 *
 * Features:
 * - Select assessor from registered staff directory
 * - Set or update scheduled inspection date
 * - Add manager briefing instructions/notes
 * - Updates status from 'registered' to 'scheduled'
 * - Records audit trail in statusHistory
 * - Emits real-time SSE notification for the assessor
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';

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
      instructions = ''
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

    const historyEntry = {
      status: newStatus,
      changedAt: nowIso,
      changedBy: managerName,
      timestamp: nowIso,
      actor: managerName,
      note: `Task assigned to assessor ${chosenAssessorName}${assessorId ? ` (${assessorId})` : ''} by ${managerName}.${scheduledDate ? ` Scheduled inspection date: ${scheduledDate.trim()}.` : ''}${taskBriefing ? ` Instructions: ${taskBriefing}` : ''}`
    };

    const updateFields = {
      assignedAssessor: chosenAssessorName,
      assignedAssessorName: chosenAssessorName,
      assignedAssessorId: (assessorId || '').trim(),
      assignedAssessorEmail: (assessorEmail || '').trim(),
      assignedAt: nowIso,
      assignedBy: managerName,
      status: newStatus,
      statusChangedAt: nowIso
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

    // Broadcast SSE notification to assessor and management
    recordStatusEvent({
      evaluationId: recordId,
      id: recordId,
      companyName: existing.companyName,
      deviceModel: updateFields.deviceModel || existing.deviceModel,
      packageName: existing.packageName || '',
      assessorId: updateFields.assignedAssessorId,
      assessorName: chosenAssessorName,
      assignedAssessor: chosenAssessorName,
      assignedAssessorId: updateFields.assignedAssessorId,
      assignedAssessorEmail: updateFields.assignedAssessorEmail,
      oldStatus,
      newStatus,
      status: newStatus,
      eventType: 'ASSIGNMENT',
      scheduledDate: updateFields.scheduledDate || existing.scheduledDate || null,
      assignmentInstructions: updateFields.assignmentInstructions || null,
      actor: managerName,
      assignedBy: managerName,
      assignedAt: nowIso,
      note: `New task assigned: ${existing.companyName} assigned to ${chosenAssessorName}`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: recordId,
        message: `Task successfully assigned to ${chosenAssessorName}.`,
        assignedAssessor: chosenAssessorName,
        assignedAssessorId: updateFields.assignedAssessorId,
        status: newStatus,
        scheduledDate: updateFields.scheduledDate || existing.scheduledDate || null
      })
    };

  } catch (error) {
    console.error('[ASSIGN-ASSESSOR-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error assigning assessor.' })
    };
  }
};

export default { handler };
