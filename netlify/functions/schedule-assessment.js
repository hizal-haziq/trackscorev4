/**
 * Netlify Serverless Function: schedule-assessment
 * Allows managers to schedule an inspection date for a registered customer.
 * Moves status: 'registered' -> 'scheduled' (or updates schedule if already scheduled).
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

    const { id, companyName, scheduledDate, notes = '', assignedAssessor = '', deviceModel } = body;
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

    const historyEntry = {
      status: newStatus,
      changedAt: nowIso,
      changedBy: managerName,
      timestamp: nowIso,
      actor: managerName,
      note: `Inspection scheduled for ${scheduledDate.trim()}.${deviceModel ? ` Device Model: ${deviceModel.trim()}.` : ''}${assignedAssessor ? ` Assigned to: ${assignedAssessor}.` : ''} ${notes ? `Note: ${notes}` : ''}`
    };

    const updateFields = {
      scheduledDate: scheduledDate.trim(),
      status: newStatus,
      statusChangedAt: nowIso,
      scheduledBy: managerName,
      scheduledAt: nowIso
    };

    if (deviceModel && deviceModel.trim()) {
      updateFields.deviceModel = deviceModel.trim();
    }
    if (assignedAssessor) {
      updateFields.assignedAssessor = assignedAssessor.trim();
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

    recordStatusEvent({
      evaluationId: recordId,
      companyName: existing.companyName,
      deviceModel: updateFields.deviceModel || existing.deviceModel,
      oldStatus,
      newStatus,
      actor: managerName,
      note: `Inspection scheduled for ${scheduledDate.trim()}`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: recordId,
        message: `Inspection scheduled for ${scheduledDate.trim()}`,
        status: newStatus,
        scheduledDate: scheduledDate.trim(),
        deviceModel: updateFields.deviceModel || existing.deviceModel
      })
    };
  } catch (error) {
    console.error('[SCHEDULE-ASSESSMENT-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error scheduling assessment.' })
    };
  }
};

export default { handler };
