/**
 * Netlify Serverless Function: get-assessment-history
 * Retrieves the version history list for a specific evaluation.
 * 
 * RBAC:
 * - Managers: Full access to any evaluation's history.
 * - Assessors: Scoped to their own assigned or authored evaluations.
 * - Vendors: Scoped to evaluations linked to their client registrations.
 * - Unauthenticated: 401 Unauthorized.
 */

import {
  connectToDatabase,
  COLLECTION_NAME,
  buildMongoIdFilter,
  listAssessmentVersions
} from './db.js';
import {
  validateRole,
  ROLE_VENDOR,
  authErrorResponse
} from './auth.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
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
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use GET.' })
    };
  }

  // Authorize user (Manager, Assessor, or Vendor)
  const auth = validateRole(event);
  if (!auth.authorized) {
    return authErrorResponse(headers, auth.statusCode, auth.error);
  }

  const evaluationId = event.queryStringParameters?.evaluationId ||
                       event.queryStringParameters?.id ||
                       event.queryStringParameters?._id;

  if (!evaluationId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Missing required query parameter: evaluationId' })
    };
  }

  try {
    const connection = await connectToDatabase();
    let evaluation = null;

    if (connection.isMongoAtlas) {
      evaluation = await connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(evaluationId));
    } else {
      evaluation = await connection.getEvaluationById(evaluationId);
    }

    if (!evaluation) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: `Evaluation "${evaluationId}" not found.` })
      };
    }

    // Role-based access control scoping
    const userRole = (auth.role || auth.user?.role || '').toLowerCase();
    const currentUserId = auth.user?.id || auth.user?._id;
    const currentAssessorId = auth.user?.assessorId;
    const currentUserName = auth.user?.name;

    if (userRole === 'assessor') {
      const isAssigned = (currentAssessorId && evaluation.assignedAssessorId === currentAssessorId) ||
                         (currentAssessorId && evaluation.assessorId === currentAssessorId) ||
                         (currentUserName && evaluation.assessorName === currentUserName) ||
                         (currentUserName && evaluation.assignedAssessor === currentUserName);
      if (!isAssigned) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Forbidden: Assessors can only view version history for their own assigned evaluations.'
          })
        };
      }
    } else if (userRole === 'vendor') {
      const linkedIds = Array.isArray(auth.user?.linkedRegistrationIds) ? auth.user.linkedRegistrationIds.map(String) : [];
      const evalIdStr = String(evaluation._id || evaluation.id || evaluationId);
      const regRef = String(evaluation.registrationReferenceId || evaluation.linkedRegistrationId || '');
      const isOwner = linkedIds.includes(evalIdStr) || (regRef && linkedIds.includes(regRef));
      if (!isOwner) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Forbidden: Vendors can only access history for their own registered submissions.'
          })
        };
      }
    }

    // Fetch version documents
    const rawVersions = await listAssessmentVersions(connection, evaluationId);

    const approvedVer = evaluation.approvedVersion || (evaluation.status === 'completed' || evaluation.status === 'pre_final_sent' ? (evaluation.currentVersion || 1) : null);
    const certifiedVer = evaluation.certificate?.certifiedVersion || (evaluation.certificate?.signedDate ? approvedVer : null);

    let historyList = [];

    if (rawVersions && rawVersions.length > 0) {
      historyList = rawVersions.map(v => {
        const vNum = Number(v.versionNumber);
        return {
          _id: v._id,
          versionNumber: vNum,
          action: v.action || (vNum === 1 ? 'INITIAL_SUBMISSION' : 'RESUBMISSION'),
          changeReason: v.changeReason || '',
          actor: {
            name: v.actor?.name || 'Assessor',
            role: v.actor?.role || 'assessor',
            assessorId: v.actor?.assessorId || null
          },
          scores: v.scores || {
            sectionAScore: v.sectionAScore || 0,
            sectionBScore: v.sectionBScore || 0,
            totalScore: v.totalScore || 0,
            starRating: v.starRating || 0,
            starsCount: v.starsCount || 0,
            ratingLabel: v.ratingLabel || ''
          },
          isApprovedVersion: Boolean(v.isApprovedVersion || (approvedVer && vNum === Number(approvedVer))),
          isCertifiedVersion: Boolean(certifiedVer && vNum === Number(certifiedVer)),
          createdAt: v.createdAt || evaluation.createdAt
        };
      });
    } else {
      // Synthetic fallback for legacy evaluation records with no prior snapshots
      historyList = [{
        versionNumber: 1,
        action: 'INITIAL_SUBMISSION',
        changeReason: 'Initial baseline evaluation',
        actor: {
          name: evaluation.assessorName || 'Assessor',
          role: 'assessor',
          assessorId: evaluation.assessorId || null
        },
        scores: {
          sectionAScore: evaluation.sectionAScore || 0,
          sectionBScore: evaluation.sectionBScore || 0,
          totalScore: evaluation.totalScore || 0,
          starRating: evaluation.starRating || 0,
          starsCount: evaluation.starsCount || 0,
          ratingLabel: evaluation.ratingLabel || ''
        },
        isApprovedVersion: Boolean(approvedVer && Number(approvedVer) === 1),
        isCertifiedVersion: Boolean(certifiedVer && Number(certifiedVer) === 1),
        createdAt: evaluation.createdAt || new Date().toISOString()
      }];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        evaluationId: String(evaluation._id || evaluationId),
        companyName: evaluation.companyName || '',
        deviceModel: evaluation.deviceModel || '',
        currentVersion: evaluation.currentVersion || (historyList[0]?.versionNumber || 1),
        approvedVersion: approvedVer,
        certifiedVersion: certifiedVer,
        totalVersions: historyList.length,
        history: historyList
      })
    };
  } catch (error) {
    console.error('[GET-ASSESSMENT-HISTORY-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error while fetching assessment history.'
      })
    };
  }
};
