/**
 * Netlify Serverless Function: lookup-evaluation
 * Allows assessors to view their own submissions ("My Submissions" view)
 * and managers to search across evaluations.
 *
 * Security & Access Rules:
 * - When invoked by an Assessor, records MUST be strictly filtered to assessorId === their own ID.
 * - Assessors must NOT see other assessors' submissions.
 * - Surfaces status, history, rejection reasons, certificate issuance stage
 *   for the assessor's own records.
 */

import { omitRetiredWorkflow } from './retired-workflow.js';
import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_ASSESSOR, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { calculateAssessmentSla } from './sla.js';

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

    const isPeerReview = params.peerReview === 'true' || params.peer === 'true' || params.forPeer === 'true';

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);

      if (idQuery) {
        const filter = buildMongoIdFilter(idQuery);
        const single = await collection.findOne(filter);
        if (single) {
          if (isAssessor && !isPeerReview) {
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

        if (isAssessor && !isPeerReview) {
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
        } else if (isAssessor && isPeerReview) {
          // Exclude own evaluations so assessor only sees peers
          const ownConditions = [];
          if (ownAssessorId) {
            ownConditions.push({ assessorId: new RegExp(`^${escapeRegex(ownAssessorId)}$`, 'i') });
            ownConditions.push({ assignedAssessorId: new RegExp(`^${escapeRegex(ownAssessorId)}$`, 'i') });
          }
          if (ownAssessorName) {
            ownConditions.push({ assessorName: new RegExp(`^${escapeRegex(ownAssessorName)}$`, 'i') });
          }
          if (ownConditions.length > 0) {
            filter.$nor = ownConditions;
          }
          if (requestedAssessorQuery) {
            const regex = new RegExp(escapeRegex(requestedAssessorQuery), 'i');
            filter.$and = [
              { $or: [{ assessorId: regex }, { assessorName: regex }, { companyName: regex }, { deviceModel: regex }] }
            ];
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
          if (isAssessor && !isPeerReview) {
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
          const docAssessorId = String(d.assessorId || '').trim().toLowerCase();
          const docAssessorName = String(d.assessorName || '').trim().toLowerCase();
          const isOwn = (ownAssessorId && docAssessorId === ownAssessorId) ||
                        (ownAssessorName && docAssessorName === ownAssessorName);

          if (isAssessor) {
            if (!isPeerReview) {
              return isOwn;
            } else {
              // Peer review: must NOT be own evaluation
              if (isOwn) return false;
            }
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
        data: records.map(r => {
          r = omitRetiredWorkflow(r);
          const sla = calculateAssessmentSla(r);
          // Overview shortcuts need the same metadata as repository modals.
          // This explicit full-record mode is restricted to Managers.
          if (isManager && params.fullDetails === 'true') {
            return { ...omitRetiredWorkflow(r), _id: String(r._id || r.id), sla, slaStatus: sla.status };
          }
          return {
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
            slaStatus: sla.status,
            sla,
            statusChangedAt: r.statusChangedAt || r.createdAt,
            rejectionReason: r.rejectionReason || null,
            rejectedBy: r.rejectedBy || null,
            rejectedAt: r.rejectedAt || null,
            approvedBy: r.approvedBy || null,
            approvedAt: r.approvedAt || null,
            currentVersion: r.currentVersion || null,
            approvedVersion: r.approvedVersion || null,
            invoice: r.invoice || null,
            certificate: r.certificate || null,
            statusHistory: r.statusHistory || [],
            breakdown: r.breakdown || [],
            evaluationHistory: r.evaluationHistory || [],
            comments: r.comments || [],
            commentsOverallSummary: r.commentsOverallSummary || null,
            createdAt: r.createdAt
          };
        })
      })
    };
  } catch (error) {
    console.error('Error during evaluation lookup:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal Server Error during evaluation lookup'
      })
    };
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default { handler };
