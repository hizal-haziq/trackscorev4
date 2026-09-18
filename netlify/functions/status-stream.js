/**
 * Netlify Serverless Function: status-stream
 * Implements Server-Sent Events (SSE) for assessor evaluation status change notifications.
 */
import { getRecentStatusEvents } from './status-bus.js';
import {
  validateRole,
  ROLE_ASSESSOR,
  ROLE_MANAGER,
  authErrorResponse
} from './auth.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, X-Api-Key, X-API-KEY',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const roleCheck = validateRole(event);
  if (!roleCheck.authorized || ![ROLE_ASSESSOR, ROLE_MANAGER].includes(roleCheck.role)) {
    return authErrorResponse(
      headers,
      roleCheck.authorized ? 403 : roleCheck.statusCode,
      roleCheck.authorized
        ? 'Forbidden: Status streams are restricted to manager and assessor accounts.'
        : roleCheck.error
    );
  }

  const params = event.queryStringParameters || {};
  const requestedAssessorId = (params.assessorName || params.assessorId || '').trim();
  let assessorId = requestedAssessorId;

  if (roleCheck.role === ROLE_ASSESSOR) {
    const tokenAssessorId = String(roleCheck.user?.assessorId || '').trim();
    if (!tokenAssessorId) {
      return authErrorResponse(headers, 403, 'Forbidden: Assessor identity is missing from the token.');
    }
    if (requestedAssessorId && requestedAssessorId.toLowerCase() !== tokenAssessorId.toLowerCase()) {
      return authErrorResponse(headers, 403, 'Forbidden: Assessors may only access their own status stream.');
    }
    assessorId = tokenAssessorId;
  }

  // Return connected comment plus recent notifications for this assessor
  const recentEvents = getRecentStatusEvents(assessorId);
  const dataPayload = recentEvents.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const responseBody = `: connected\n\n${dataPayload}`;

  return {
    statusCode: 200,
    headers,
    body: responseBody
  };
};
