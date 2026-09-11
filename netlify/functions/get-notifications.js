/**
 * Netlify Serverless Function: get-notifications
 * Polling-based notification check for assessors to receive real-time status changes (Approved / Rejected)
 * on their evaluation submissions.
 */
import { connectToDatabase, COLLECTION_NAME } from './db.js';
import { getRecentStatusEvents } from './status-bus.js';
import { validateRole, authErrorResponse } from './auth.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Use GET.' })
    };
  }

  const roleCheck = validateRole(event);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  try {
    const params = event.queryStringParameters || {};
    const assessorId = (params.assessorName || params.assessorId || params.query || '').trim();
    const since = params.since || null;

    // Check in-memory event bus first for any fresh status change events
    const busEvents = getRecentStatusEvents(assessorId, since);

    // Also check database records
    const connection = await connectToDatabase();
    let records = [];

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const query = {
        deletedAt: { $exists: false },
        status: { $in: ['approved', 'rejected'] }
      };

      if (assessorId) {
        query.$or = [
          { assessorId: { $regex: new RegExp(`^${assessorId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { assessorName: { $regex: new RegExp(assessorId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
        ];
      }

      records = await collection
        .find(query)
        .sort({ statusChangedAt: -1, updatedAt: -1, createdAt: -1 })
        .limit(20)
        .toArray();
    } else {
      const all = await connection.getEvaluations(false);
      records = all.filter(r => {
        if (r.deletedAt) return false;
        if (r.status !== 'approved' && r.status !== 'rejected') return false;
        if (!assessorId) return true;
        const aid = assessorId.toLowerCase();
        const rId = String(r.assessorId || '').toLowerCase();
        const rName = String(r.assessorName || '').toLowerCase();
        return rId === aid || rName.includes(aid);
      });
      records.sort((a, b) => new Date(b.statusChangedAt || b.updatedAt || 0) - new Date(a.statusChangedAt || a.updatedAt || 0));
      records = records.slice(0, 20);
    }

    // Merge database state into unified notification list
    const notifications = records.map(r => ({
      evaluationId: r._id || r.id,
      companyName: r.companyName || 'Untitled Company',
      deviceModel: r.deviceModel || 'Unspecified Model',
      assessorId: r.assessorId || '',
      assessorName: r.assessorName || '',
      status: r.status,
      rejectionReason: r.rejectionReason || null,
      approvedBy: r.approvedBy || null,
      approvedAt: r.approvedAt || null,
      rejectedBy: r.rejectedBy || null,
      rejectedAt: r.rejectedAt || null,
      totalScore: typeof r.totalScore === 'number' ? r.totalScore : (parseFloat(r.totalScore) || 0),
      starsCount: r.starsCount || 0,
      ratingLabel: r.ratingLabel || '',
      createdAt: r.createdAt || null,
      statusChangedAt: r.statusChangedAt || r.updatedAt || r.createdAt
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        recentLiveEvents: busEvents,
        notifications
      })
    };
  } catch (error) {
    console.error('get-notifications error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to check notifications' })
    };
  }
};
