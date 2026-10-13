import {secureHandler, logSecurityFailure, assessorOwns, peerEligible} from './security.js';
/**
 * Netlify Serverless Function: add-comment
 * Adds an append-only peer comment to an evaluation document with browser-based AI summarization.
 *
 * Rules:
 * - Requires JWT authentication (Assessor or Manager).
 * - Assessors CANNOT comment on their own evaluations (403 Forbidden).
 * - Managers can comment on any evaluation.
 * - Text max 1000 characters. aiSummary max 300 characters. commentsOverallSummary max 600 characters.
 * - Author info is strictly taken from JWT, never client payload.
 * - Append-only: comments cannot be modified or deleted.
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_ASSESSOR, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';

const rawHandler = async (event) => {
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

  // Authenticate user
  const authCheck = validateRole(event);
  if (!authCheck.authorized) {
    return authErrorResponse(headers, authCheck.statusCode, authCheck.error);
  }

  const currentUser = authCheck.user || {};
  const isManager = authCheck.role === ROLE_MANAGER;
  const isAssessor = authCheck.role === ROLE_ASSESSOR;

  if (!isManager && !isAssessor) {
    return authErrorResponse(headers, 403, 'Forbidden: Only assessors and managers can add peer comments.');
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid JSON body.' })
    };
  }

  const evaluationId = (body.evaluationId || body.id || '').trim();
  if (!evaluationId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Evaluation ID is required.' })
    };
  }

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!rawText) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Comment text is required.' })
    };
  }
  if (rawText.length > 1000) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Comment text cannot exceed 1000 characters.' })
    };
  }

  let cleanAiSummary = null;
  if (body.aiSummary && typeof body.aiSummary === 'string' && body.aiSummary.trim()) {
    cleanAiSummary = body.aiSummary.trim().slice(0, 300);
  }

  let cleanOverallSummary = undefined;
  if (body.commentsOverallSummary !== undefined) {
    if (body.commentsOverallSummary === null) {
      cleanOverallSummary = null;
    } else if (typeof body.commentsOverallSummary === 'string') {
      cleanOverallSummary = body.commentsOverallSummary.trim().slice(0, 600);
    }
  }

  try {
    const connection = await connectToDatabase();
    let evalDoc = null;
    let mongoFilter = null;

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      mongoFilter = buildMongoIdFilter(evaluationId);
      evalDoc = await collection.findOne(mongoFilter);
    } else {
      evalDoc = await connection.getEvaluationById(evaluationId);
      if (!evalDoc) {
        const all = await connection.getEvaluations(true);
        evalDoc = all.find(d => String(d._id) === evaluationId || String(d.id) === evaluationId) || null;
      }
    }

    if (!evalDoc) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Evaluation record not found.' })
      };
    }

    if (isAssessor && !peerEligible(evalDoc)) return authErrorResponse(headers,403,'Access denied for this peer assessment.');
    // Assessor Self-Comment Restriction
    if (isAssessor) {
      const callerAssessorId = String(currentUser.assessorId || '').trim().toLowerCase();
      const callerName = String(currentUser.name || '').trim().toLowerCase();
      const callerEmail = String(currentUser.email || '').trim().toLowerCase();

      const docAssessorId = String(evalDoc.assessorId || '').trim().toLowerCase();
      const docAssignedAssessorId = String(evalDoc.assignedAssessorId || '').trim().toLowerCase();
      const docAssessorName = String(evalDoc.assessorName || '').trim().toLowerCase();
      const docAssignedAssessor = String(evalDoc.assignedAssessor || evalDoc.assignedAssessorName || '').trim().toLowerCase();
      const docCreatedBy = String(evalDoc.createdBy || '').trim().toLowerCase();

      const isOwnEvaluation = (callerAssessorId && (docAssessorId === callerAssessorId || docAssignedAssessorId === callerAssessorId)) ||
                              (callerName && (docAssessorName === callerName || docAssignedAssessor === callerName)) ||
                              (callerEmail && docCreatedBy === callerEmail);

      if (isOwnEvaluation) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Assessors cannot comment on their own evaluations'
          })
        };
      }
    }

    // Generate append-only comment object
    const comment = {
      commentId: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      authorName: currentUser.name || currentUser.email || (isManager ? 'Manager' : 'Assessor'),
      authorId: String(currentUser.id || currentUser._id || currentUser.assessorId || currentUser.email || 'user'),
      authorRole: authCheck.role,
      text: rawText,
      aiSummary: cleanAiSummary,
      createdAt: new Date().toISOString()
    };

    const nowIso = new Date().toISOString();

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const updateFields = {
        updatedAt: nowIso
      };
      if (cleanOverallSummary !== undefined) {
        updateFields.commentsOverallSummary = cleanOverallSummary;
      }
      await collection.updateOne(mongoFilter, {
        $push: { comments: comment },
        $set: updateFields
      });
    } else {
      const existingComments = Array.isArray(evalDoc.comments) ? [...evalDoc.comments] : [];
      existingComments.push(comment);

      const updatePayload = {
        comments: existingComments,
        updatedAt: nowIso
      };
      if (cleanOverallSummary !== undefined) {
        updatePayload.commentsOverallSummary = cleanOverallSummary;
      }

      await connection.updateEvaluation(String(evalDoc._id || evalDoc.id), updatePayload);
    }

    // Record notification/bus event
    recordStatusEvent({
      type: 'peer_comment',
      evaluationId: String(evalDoc._id || evalDoc.id),
      companyName: evalDoc.companyName,
      assessorId: evalDoc.assessorId,
      assessorName: evalDoc.assessorName,
      commentAuthor: comment.authorName,
      commentAuthorRole: comment.authorRole
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        comment,
        commentsOverallSummary: cleanOverallSummary !== undefined ? cleanOverallSummary : (evalDoc.commentsOverallSummary || null)
      })
    };
  } catch (error) {
    logSecurityFailure('add-comment');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal Server Error while posting comment.'
      })
    };
  }
};

export const handler = secureHandler(rawHandler, 'add-comment');

export default { handler };
