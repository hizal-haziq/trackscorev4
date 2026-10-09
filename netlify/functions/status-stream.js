/**
 * Netlify Serverless Function: status-stream
 * Implements Server-Sent Events (SSE) for evaluation status change notifications.
 * Supports:
 * - Manager: Global status changes
 * - Assessor: Scoped to their assigned/authored assessments
 * - Vendor: Strictly scoped to their linked registration evaluations (sanitized data only)
 */
import { getRecentStatusEvents } from './status-bus.js';
import {
  validateRole,
  ROLE_ASSESSOR,
  ROLE_MANAGER,
  ROLE_VENDOR,
  authErrorResponse
} from './auth.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, X-Api-Key, X-API-KEY',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // EventSource cannot set Authorization headers, so query tokens are accepted only here.
  const roleCheck = validateRole(event, undefined, { allowQuery: true });
  if (!roleCheck.authorized || ![ROLE_ASSESSOR, ROLE_MANAGER, ROLE_VENDOR].includes(roleCheck.role)) {
    return authErrorResponse(
      headers,
      roleCheck.authorized ? 403 : roleCheck.statusCode,
      roleCheck.authorized
        ? 'Forbidden: Status streams are restricted to authorized vendor, manager, and assessor accounts.'
        : roleCheck.error
    );
  }

  const params = event.queryStringParameters || {};
  let recentEvents = [];

  if (roleCheck.role === ROLE_VENDOR) {
    const linkedIds = Array.isArray(roleCheck.user?.linkedRegistrationIds)
      ? roleCheck.user.linkedRegistrationIds.map(String)
      : [];
    const allRecent = getRecentStatusEvents();
    recentEvents = allRecent
      .filter(e => linkedIds.includes(String(e.evaluationId || e.id)))
      .map(e => ({
        id: e.id,
        evaluationId: e.evaluationId,
        companyName: e.companyName,
        deviceModel: e.deviceModel,
        status: e.status || e.newStatus,
        newStatus: e.newStatus,
        note: e.note,
        timestamp: e.timestamp,
        slaDeadline: e.slaDeadline,
        slaStatus: e.slaStatus
      }));
  } else if (roleCheck.role === ROLE_ASSESSOR) {
    const tokenAssessorId = String(roleCheck.user?.assessorId || '').trim();
    if (!tokenAssessorId) {
      return authErrorResponse(headers, 403, 'Forbidden: Assessor identity is missing from the token.');
    }
    const requestedAssessorId = (params.assessorName || params.assessorId || '').trim();
    if (requestedAssessorId && requestedAssessorId.toLowerCase() !== tokenAssessorId.toLowerCase()) {
      return authErrorResponse(headers, 403, 'Forbidden: Assessors may only access their own status stream.');
    }
    recentEvents = getRecentStatusEvents(tokenAssessorId);
  } else {
    // Manager: full status stream
    const requestedAssessorId = (params.assessorName || params.assessorId || '').trim();
    recentEvents = getRecentStatusEvents(requestedAssessorId || null);
  }

  const dataPayload = recentEvents.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const responseBody = `: connected\n\n${dataPayload}`;

  return {
    statusCode: 200,
    headers,
    body: responseBody
  };
};

export default { handler };
