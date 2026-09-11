/**
 * Netlify Serverless Function: status-stream
 * Implements Server-Sent Events (SSE) for assessor evaluation status change notifications.
 */
import { getRecentStatusEvents } from './status-bus.js';

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

  const params = event.queryStringParameters || {};
  const assessorId = (params.assessorName || params.assessorId || '').trim();

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
