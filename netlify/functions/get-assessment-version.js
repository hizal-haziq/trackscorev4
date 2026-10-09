/**
 * Netlify Serverless Function: get-assessment-version
 * Retrieves the full snapshot of a specific assessment version, including the 33 criteria breakdown.
 * 
 * RBAC:
 * - Managers: Full access to any version.
 * - Assessors: Scoped to their own assigned or authored evaluations.
 * - Vendors: Scoped to evaluations linked to their client registrations.
 * - Unauthenticated: 401 Unauthorized.
 */

import {
  connectToDatabase,
  COLLECTION_NAME,
  buildMongoIdFilter,
  findAssessmentVersion
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
                       event.queryStringParameters?.id;
  const versionParam = event.queryStringParameters?.version ||
                       event.queryStringParameters?.versionNumber;

  if (!evaluationId || versionParam === undefined) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Missing required query parameters: evaluationId and version are required.'
      })
    };
  }

  const versionNumber = parseInt(versionParam, 10);
  if (isNaN(versionNumber) || versionNumber < 1) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Invalid version number parameter. Must be a positive integer.'
      })
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
            error: 'Forbidden: Assessors can only view versions for their own assigned evaluations.'
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
            error: 'Forbidden: Vendors can only access versions for their own registered submissions.'
          })
        };
      }
    }

    // Fetch version document
    let versionDoc = await findAssessmentVersion(connection, evaluationId, versionNumber);

    const approvedVer = evaluation.approvedVersion || (evaluation.status === 'completed' || evaluation.status === 'pre_final_sent' ? (evaluation.currentVersion || 1) : null);
    const certifiedVer = evaluation.certificate?.certifiedVersion || (evaluation.certificate?.signedDate ? approvedVer : null);

    if (!versionDoc && versionNumber === 1) {
      // Legacy fallback
      versionDoc = {
        evaluationId: String(evaluation._id || evaluationId),
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
        breakdown: evaluation.breakdown || [],
        metadata: {
          companyName: evaluation.companyName || '',
          deviceModel: evaluation.deviceModel || '',
          assessmentDate: evaluation.assessmentDate || '',
          rubricVersion: evaluation.rubricVersion || '1.0'
        },
        isApprovedVersion: Boolean(approvedVer && Number(approvedVer) === 1),
        isCertifiedVersion: Boolean(certifiedVer && Number(certifiedVer) === 1),
        createdAt: evaluation.createdAt || new Date().toISOString()
      };
    }

    if (!versionDoc) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Version ${versionNumber} not found for evaluation "${evaluationId}".`
        })
      };
    }

    let finalBreakdown = Array.isArray(versionDoc.breakdown) ? versionDoc.breakdown : [];
    if (userRole === 'vendor') {
      finalBreakdown = finalBreakdown.map(item => {
        const { comment, ...rest } = item;
        return rest;
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        evaluationId: String(evaluation._id || evaluationId),
        companyName: evaluation.companyName || '',
        deviceModel: evaluation.deviceModel || '',
        version: {
          ...versionDoc,
          breakdown: finalBreakdown,
          isApprovedVersion: Boolean(versionDoc.isApprovedVersion || (approvedVer && Number(versionDoc.versionNumber) === Number(approvedVer))),
          isCertifiedVersion: Boolean(certifiedVer && Number(versionDoc.versionNumber) === Number(certifiedVer))
        }
      })
    };
  } catch (error) {
    console.error('[GET-ASSESSMENT-VERSION-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error while fetching assessment version snapshot.'
      })
    };
  }
};
