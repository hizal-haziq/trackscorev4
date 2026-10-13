import {assessorOwns} from './security.js';
import {secureHandler, logSecurityFailure} from './security.js';
/**
 * Netlify Serverless Function: get-assessment-risk
 * Provides on-demand and cached assessment risk and anomaly intelligence.
 * 
 * RBAC:
 * - Managers: Full access to any evaluation's risk analysis and managerial aggregate overview.
 * - Assessors: Scoped to their own assigned or authored evaluations. Forbidden from global overview.
 * - Vendors: Strictly 403 Forbidden (no internal risk analytics or assessor benchmarking exposed).
 * - Unauthenticated: 401 Unauthorized.
 */

import {
  connectToDatabase,
  COLLECTION_NAME,
  buildMongoIdFilter,
  listAssessmentVersions,
  findAssessmentRisk,
  saveAssessmentRiskRecord,
  listAllAssessmentRisks
} from './db.js';
import {
  validateRole,
  ROLE_MANAGER,
  ROLE_ASSESSOR,
  ROLE_VENDOR,
  authErrorResponse
} from './auth.js';
import {
  analyzeAssessmentRisk,
  computeRiskAggregateOverview,
  RISK_LEVELS
} from './assessment-risk.js';

const rawHandler = async (event) => {
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

  // 1. Authentication & Role Validation
  const auth = validateRole(event);
  if (!auth.authorized) {
    return authErrorResponse(headers, auth.statusCode, auth.error);
  }

  const userRole = (auth.role || auth.user?.role || '').toLowerCase();
  const currentAssessorId = auth.user?.assessorId;
  const currentUserName = auth.user?.name;

  // Strict Vendor Prohibition
  if (userRole === ROLE_VENDOR) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Forbidden: Risk analytics and internal anomaly indicators are restricted to operations managers and authorized assessors.'
      })
    };
  }

  const queryParams = event.queryStringParameters || {};
  const isOverview = queryParams.overview === 'true' || queryParams.summary === 'true';
  const evaluationId = queryParams.evaluationId || queryParams.id || queryParams._id;
  const requestedVersion = queryParams.version ? parseInt(queryParams.version, 10) : null;
  const recalculate = queryParams.recalculate === 'true' || queryParams.refresh === 'true';

  try {
    const connection = await connectToDatabase();

    // =========================================================================
    // Manager Overview Mode (?overview=true)
    // =========================================================================
    if (isOverview) {
      if (userRole !== ROLE_MANAGER) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Forbidden: Global assessment risk overview is restricted to managers.'
          })
        };
      }

      let allEvaluations = [];
      if (connection.isMongoAtlas) {
        allEvaluations = await connection.db.collection(COLLECTION_NAME)
          .find({ deletedAt: { $exists: false } }, { projection: { evaluationHistory: 0, comments: 0 } })
          .toArray();
      } else {
        allEvaluations = await connection.getEvaluations();
      }

      const allRiskRecords = await listAllAssessmentRisks(connection);
      const overview = computeRiskAggregateOverview(allEvaluations, allRiskRecords);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          overview
        })
      };
    }

    // =========================================================================
    // Single Assessment Risk Analysis Mode (?evaluationId=...)
    // =========================================================================
    if (!evaluationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required query parameter: evaluationId or overview=true'
        })
      };
    }

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
        body: JSON.stringify({
          success: false,
          error: `Evaluation "${evaluationId}" not found.`
        })
      };
    }

    // Assessor Scope Check: Assessors can only view their own assigned or authored evaluations
    if (userRole === ROLE_ASSESSOR) {
      const docAssessorId = evaluation.assessorId || evaluation.assignedAssessorId;
      const docAssessorName = evaluation.assessorName || evaluation.assignedAssessor;

      const isMatch = assessorOwns(evaluation, auth.user);
      if (!isMatch) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Forbidden: Assessors can only inspect assessment risk for their own assigned or authored evaluations.'
          })
        };
      }
    }

    const targetVersion = requestedVersion || Number(evaluation.currentVersion || 1);

    // Check cached snapshot unless recalculate is explicitly requested
    if (!recalculate) {
      const existingRiskSnapshot = await findAssessmentRisk(connection, evaluationId, targetVersion);
      if (existingRiskSnapshot) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            isCached: true,
            risk: existingRiskSnapshot
          })
        };
      }
    }

    // Compute fresh risk analysis
    const historyVersions = await listAssessmentVersions(connection, evaluationId);

    let allEvaluations = [];
    if (connection.isMongoAtlas) {
      allEvaluations = await connection.db.collection(COLLECTION_NAME)
        .find({ deletedAt: { $exists: false } })
        .toArray();
    } else {
      allEvaluations = await connection.getEvaluations();
    }

    const riskAnalysis = analyzeAssessmentRisk(evaluation, {
      historyVersions,
      allEvaluations
    });

    // Save snapshot to assessment_risk collection for historical auditing
    await saveAssessmentRiskRecord(connection, riskAnalysis);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        isCached: false,
        risk: riskAnalysis
      })
    };

  } catch (err) {
    logSecurityFailure('get-assessment-risk');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error processing assessment risk analysis.'
      })
    };
  }
};

export const handler = secureHandler(rawHandler, 'get-assessment-risk');
