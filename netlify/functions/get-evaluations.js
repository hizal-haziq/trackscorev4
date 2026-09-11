/**
 * Netlify Serverless Function: get-evaluations
 * Handles GET requests to retrieve historical evaluations sorted by date descending.
 * Features:
 * - Shared-secret header authentication (x-api-key)
 * - Server-side pagination via ?page=&limit= query parameters (default limit: 20)
 */

import { connectToDatabase, COLLECTION_NAME } from './db.js';
import { validateRole, ROLE_MANAGER, ROLE_ASSESSOR, authErrorResponse } from './auth.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Use GET.' })
    };
  }

  // 1. API Protection Check (Manager Role Required; Assessor or Vendor Forbidden from Global List)
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const isAssessorOnly = roleCheck.role === 'assessor';
  const authenticatedAssessorId = roleCheck.user?.assessorId;
  const authenticatedAssessorName = roleCheck.user?.name;

  try {
    const params = event.queryStringParameters || {};
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit, 10) || 20));
    const includeDeleted = params.includeDeleted === 'true' || params.includeDeleted === '1';
    const statusFilter = (params.status || '').trim().toLowerCase();
    const sortBy = params.sortBy === 'statusChangedAt' ? 'statusChangedAt' : 'createdAt';
    const includeBreakdown = params.includeBreakdown === 'true';
    const searchQuery = (params.q || '').trim().toLowerCase();

    const connection = await connectToDatabase();
    let evaluations = [];
    let total = 0;

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const queryFilter = includeDeleted ? {} : { deletedAt: { $exists: false } };
      
      // Strict role scoping for assessors
      if (isAssessorOnly) {
        const assessorConditions = [];
        if (authenticatedAssessorId) {
          assessorConditions.push({ assessorId: authenticatedAssessorId });
        }
        if (authenticatedAssessorName) {
          assessorConditions.push({ assessorName: authenticatedAssessorName });
        }
        if (assessorConditions.length > 0) {
          queryFilter.$or = assessorConditions;
        }
      } else if (params.assessor) {
        const aParam = params.assessor.trim();
        queryFilter.$or = [
          { assessorId: aParam },
          { assessorName: { $regex: aParam, $options: 'i' } }
        ];
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'completed') {
          queryFilter.status = { $in: ['completed', 'approved'] };
        } else if (statusFilter === 'registrations' || statusFilter.includes(',')) {
          const list = statusFilter === 'registrations' ? ['registered', 'scheduled'] : statusFilter.split(',').map(s => s.trim().toLowerCase());
          queryFilter.status = { $in: list };
        } else {
          queryFilter.status = statusFilter;
        }
      } else {
        queryFilter.status = { $ne: 'inquiry' };
      }

      if (searchQuery) {
        const sRegex = { $regex: searchQuery, $options: 'i' };
        queryFilter.$and = queryFilter.$and || [];
        queryFilter.$and.push({
          $or: [
            { companyName: sRegex },
            { deviceModel: sRegex },
            { assessorName: sRegex },
            { 'invoice.invoiceNumber': sRegex },
            { 'certificate.certificateNumber': sRegex }
          ]
        });
      }

      total = await collection.countDocuments(queryFilter);
      const sortDoc = {};
      sortDoc[sortBy] = -1;
      const projectionDoc = includeBreakdown ? {} : { breakdown: 0 };
      evaluations = await collection
        .find(queryFilter, { projection: projectionDoc })
        .sort(sortDoc)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
    } else {
      let allEvaluations = await connection.getEvaluations(includeDeleted);

      // Strict role scoping for assessors in local fallback
      if (isAssessorOnly) {
        allEvaluations = allEvaluations.filter(d => {
          const matchId = authenticatedAssessorId && String(d.assessorId || '') === authenticatedAssessorId;
          const matchName = authenticatedAssessorName && String(d.assessorName || '').toLowerCase().includes(authenticatedAssessorName.toLowerCase());
          return matchId || matchName;
        });
      } else if (params.assessor) {
        const aParam = params.assessor.trim().toLowerCase();
        allEvaluations = allEvaluations.filter(d => 
          String(d.assessorId || '').toLowerCase() === aParam ||
          String(d.assessorName || '').toLowerCase().includes(aParam)
        );
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'completed') {
          allEvaluations = allEvaluations.filter(d => {
            const s = (d.status || 'pending_review').toLowerCase();
            return s === 'completed' || s === 'approved';
          });
        } else if (statusFilter === 'registrations' || statusFilter.includes(',')) {
          const list = statusFilter === 'registrations' ? ['registered', 'scheduled'] : statusFilter.split(',').map(s => s.trim().toLowerCase());
          allEvaluations = allEvaluations.filter(d => list.includes((d.status || '').toLowerCase()));
        } else {
          allEvaluations = allEvaluations.filter(d => (d.status || 'pending_review').toLowerCase() === statusFilter);
        }
      } else {
        allEvaluations = allEvaluations.filter(d => (d.status || '').toLowerCase() !== 'inquiry' && d.recordType !== 'inquiry');
      }

      if (searchQuery) {
        allEvaluations = allEvaluations.filter(d => {
          const c = String(d.companyName || '').toLowerCase();
          const m = String(d.deviceModel || '').toLowerCase();
          const a = String(d.assessorName || '').toLowerCase();
          const inv = String(d.invoice?.invoiceNumber || '').toLowerCase();
          const cert = String(d.certificate?.certificateNumber || '').toLowerCase();
          return c.includes(searchQuery) || m.includes(searchQuery) || a.includes(searchQuery) || inv.includes(searchQuery) || cert.includes(searchQuery);
        });
      }

      if (sortBy === 'statusChangedAt') {
        allEvaluations.sort((a, b) => new Date(b.statusChangedAt || b.createdAt) - new Date(a.statusChangedAt || a.createdAt));
      }
      total = allEvaluations.length;
      evaluations = allEvaluations.slice((page - 1) * limit, page * limit);
      if (!includeBreakdown) {
        evaluations = evaluations.map(({ breakdown, ...rest }) => rest);
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: evaluations.length,
        total,
        page,
        limit,
        totalPages,
        includeDeleted,
        isMongoAtlas: connection.isMongoAtlas,
        atlasDiagnostic: connection.atlasDiagnostic || null,
        data: evaluations
      })
    };
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal Server Error while retrieving evaluations'
      })
    };
  }
};

export default { handler };
