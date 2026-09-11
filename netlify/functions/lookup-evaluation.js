/**
 * Netlify Serverless Function: lookup-evaluation
 * Allows assessors to view their own submissions ("My Submissions" view)
 * and managers to search across evaluations.
 *
 * Security & Access Rules:
 * - When invoked by an Assessor, records MUST be strictly filtered to assessorId === their own ID.
 * - Assessors must NOT see other assessors' submissions.
 * - Surfaces status, history, rejection reasons, payment status, and certificate issuance stage
 *   for the assessor's own records.
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_ASSESSOR, ROLE_MANAGER, authErrorResponse } from './auth.js';

export const handler = async (event) => {
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

  // Check auth - must be either Assessor or Manager
  const authCheck = validateRole(event);
  if (!authCheck.authorized) {
    return authErrorResponse(headers, authCheck.statusCode, authCheck.error);
  }

  const currentUser = authCheck.user || {};
  const isManager = authCheck.role === ROLE_MANAGER;
  const isAssessor = authCheck.role === ROLE_ASSESSOR;

  if (!isManager && !isAssessor) {
    return authErrorResponse(headers, 403, 'Forbidden: Insufficient role permissions.');
  }

  try {
    const params = event.queryStringParameters || {};
    const requestedAssessorQuery = (params.assessorName || params.assessorId || params.query || '').trim().toLowerCase();
    const idQuery = (params.id || '').trim();

    const connection = await connectToDatabase();
    let records = [];

    // ASSESSOR SCOPING: Assessor can ONLY see their own records
    const ownAssessorId = (currentUser.assessorId || '').trim().toLowerCase();
    const ownAssessorName = (currentUser.name || '').trim().toLowerCase();
    const ownAssessorEmail = (currentUser.email || '').trim().toLowerCase();

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);

      if (idQuery) {
        const filter = buildMongoIdFilter(idQuery);
        const single = await collection.findOne(filter);
        if (single) {
          if (isAssessor) {
            // Confirm ownership
            const docAssessorId = String(single.assessorId || '').trim().toLowerCase();
            const docAssessorName = String(single.assessorName || '').trim().toLowerCase();
            const docCreatedBy = String(single.createdBy || '').trim().toLowerCase();
            const isMatch = (ownAssessorId && docAssessorId === ownAssessorId) ||
                            (ownAssessorName && docAssessorName === ownAssessorName) ||
                            (ownAssessorEmail && docCreatedBy === ownAssessorEmail);
            if (!isMatch) {
              return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ success: false, error: "Forbidden: You cannot access other assessors' submissions." })
              };
            }
          }
          records = [single];
        }
      } else {
        const filter = { deletedAt: { $exists: false } };

        if (isAssessor) {
          // Strictly force own identifier
          const assessorConditions = [];
          if (ownAssessorId) {
            assessorConditions.push({ assessorId: new RegExp(`^${escapeRegex(ownAssessorId)}$`, 'i') });
          }
          if (ownAssessorName) {
            assessorConditions.push({ assessorName: new RegExp(`^${escapeRegex(ownAssessorName)}$`, 'i') });
          }
          if (ownAssessorEmail) {
            assessorConditions.push({ createdBy: ownAssessorEmail });
          }

          if (assessorConditions.length > 0) {
            filter.$or = assessorConditions;
          } else {
            filter.assessorId = '__NONE__';
          }
        } else if (requestedAssessorQuery) {
          // Manager searching
          const regex = new RegExp(escapeRegex(requestedAssessorQuery), 'i');
          filter.$or = [
            { assessorId: regex },
            { assessorName: regex },
            { companyName: regex },
            { deviceModel: regex }
          ];
        }

        records = await collection.find(filter).sort({ createdAt: -1 }).limit(50).toArray();
      }
    } else {
      // Local fallback
      const all = await connection.getEvaluations(false);
      if (idQuery) {
        const single = all.find(d => String(d._id) === idQuery || String(d.id) === idQuery);
        if (single) {
          if (isAssessor) {
            const docAssessorId = String(single.assessorId || '').trim().toLowerCase();
            const docAssessorName = String(single.assessorName || '').trim().toLowerCase();
            const isMatch = (ownAssessorId && docAssessorId === ownAssessorId) ||
                            (ownAssessorName && docAssessorName === ownAssessorName);
            if (!isMatch) {
              return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ success: false, error: "Forbidden: You cannot access other assessors' submissions." })
              };
            }
          }
          records = [single];
        }
      } else {
        records = all.filter(d => {
          if (isAssessor) {
            const docAssessorId = String(d.assessorId || '').trim().toLowerCase();
            const docAssessorName = String(d.assessorName || '').trim().toLowerCase();
            return (ownAssessorId && docAssessorId === ownAssessorId) ||
                   (ownAssessorName && docAssessorName === ownAssessorName);
          }
          if (requestedAssessorQuery) {
            const a = String(d.assessorName || '').toLowerCase();
            const aid = String(d.assessorId || '').toLowerCase();
            const c = String(d.companyName || '').toLowerCase();
            const m = String(d.deviceModel || '').toLowerCase();
            return aid.includes(requestedAssessorQuery) || a.includes(requestedAssessorQuery) || c.includes(requestedAssessorQuery) || m.includes(requestedAssessorQuery);
          }
          return true;
        }).slice(0, 50);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: records.length,
        data: records.map(r => ({
          _id: String(r._id || r.id),
          companyName: r.companyName,
          deviceModel: r.deviceModel,
          packageName: r.packageName,
          assessorName: r.assessorName,
          assessorId: r.assessorId || null,
          assessmentDate: r.assessmentDate,
          totalScore: r.totalScore,
          sectionAScore: r.sectionAScore,
          sectionBScore: r.sectionBScore,
          starRating: r.starRating,
          starsCount: r.starsCount,
          ratingLabel: r.ratingLabel,
          status: r.status || 'pending_review',
          statusChangedAt: r.statusChangedAt || r.createdAt,
          rejectionReason: r.rejectionReason || null,
          rejectedBy: r.rejectedBy || null,
          rejectedAt: r.rejectedAt || null,
          approvedBy: r.approvedBy || null,
          approvedAt: r.approvedAt || null,
          invoice: r.invoice || null,
          payment: r.payment || null,
          certificate: r.certificate || null,
          statusHistory: r.statusHistory || [],
          breakdown: r.breakdown || [],
          evaluationHistory: r.evaluationHistory || [],
          createdAt: r.createdAt
        }))
      })
    };
  } catch (error) {
    console.error('Error during evaluation lookup:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal Server Error during evaluation lookup'
      })
    };
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default { handler };
