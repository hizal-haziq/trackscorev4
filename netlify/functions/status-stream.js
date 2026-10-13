import {secureHandler, logSecurityFailure, projectStatusEvent} from './security.js';
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

const rawHandler = async (event, context) => {
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

  if (roleCheck.role === ROLE_ASSESSOR) {
    const requested=(params.assessorName||params.assessorId||'').trim().toLowerCase();
    if(requested && requested!==String(roleCheck.user.assessorId||'').toLowerCase()) return authErrorResponse(headers,403,'Access denied for this status stream.');
  }
  recentEvents=getRecentStatusEvents().map(e=>projectStatusEvent(e,roleCheck.user,event.securityVendor)).filter(Boolean);

  const dataPayload = recentEvents.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const responseBody = `: connected\n\n${dataPayload}`;

  return {
    statusCode: 200,
    headers,
    body: responseBody
  };
};

export const handler = secureHandler(rawHandler, 'status-stream');

export default { handler };
