import {secureHandler, logSecurityFailure, assessorOwns, assessorMongoScope} from './security.js';
/**
 * Netlify Serverless Function: get-evaluations
 * Handles GET requests to retrieve historical evaluations sorted by date descending.
 * Features:
 * - Shared-secret header authentication (x-api-key)
 * - Server-side pagination via ?page=&limit= query parameters (default limit: 20)
 */

import { connectToDatabase, COLLECTION_NAME, listUsers } from './db.js';
import { omitRetiredWorkflow } from './retired-workflow.js';
import { summarizeManagerDashboard, requiresCertificateAction } from './manager-overview.js';
import { validateRole, ROLE_MANAGER, ROLE_ASSESSOR, authErrorResponse } from './auth.js';
import { attachSlaToRecord, computeSlaAggregateSummary } from './sla.js';
import { analyzeAssessmentRisk, computeRiskAggregateOverview } from './assessment-risk.js';

function attachRiskToRecord(doc, peerEvals) {
  const analyzed = analyzeAssessmentRisk(doc, { allEvaluations: peerEvals });
  return {
    riskLevel: analyzed.riskLevel,
    riskScore: analyzed.riskScore,
    dataConfidence: analyzed.dataConfidence,
    signalsCount: analyzed.signals.length,
    signals: analyzed.signals.map(s => ({
      type: s.type,
      name: s.name,
      score: s.score,
      weight: s.weight,
      observed: s.observed,
      explanation: s.explanation
    }))
  };
}

const rawHandler = async (event, context) => {
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

  // 1. API Protection Check (Assessor or Manager Role Required; Vendors Forbidden)
  const roleCheck = validateRole(event, [ROLE_ASSESSOR, ROLE_MANAGER]);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const isAssessorOnly = roleCheck.role === 'assessor';
  const authenticatedAssessorId = roleCheck.user?.assessorId;
  const authenticatedAssessorName = roleCheck.user?.name;

  try {
    const params = event.queryStringParameters || {};
    if (params.view === 'overview' && roleCheck.role !== ROLE_MANAGER) {
      return authErrorResponse(headers, 403, 'Manager access required.');
    }
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit, 10) || 25));
    const includeDeleted = !isAssessorOnly && (params.includeDeleted === 'true' || params.includeDeleted === '1');
    const statusFilter = (params.status || '').trim().toLowerCase();
    const slaStatusParam = (params.slaStatus || params.sla || '').trim().toUpperCase();
    const riskStatusParam = (params.riskLevel || params.risk || '').trim().toUpperCase();
    const sortBy = params.sortBy || 'createdAt';
    const includeBreakdown = params.includeBreakdown === 'true';
    const includeFullDetails = params.includeFullDetails === 'true' || params.fullDetails === 'true';
    const searchQuery = (params.q || '').trim().toLowerCase();

    const connection = await connectToDatabase();
    if (params.view === 'overview') {
      const [records, users] = await Promise.all([
        connection.isMongoAtlas
          ? connection.db.collection(COLLECTION_NAME).find({ deletedAt: { $exists: false }, status: { $ne: 'inquiry' } }, { projection: { breakdown: 0, comments: 0, evaluationHistory: 0, statusHistory: 0 } }).toArray()
          : connection.getEvaluations(false),
        listUsers(connection)
      ]);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, isMongoAtlas: connection.isMongoAtlas, overview: summarizeManagerDashboard(deduplicateEvaluations(records), users.filter(u => u.role === 'assessor' && !u.deletedAt), params) }) };
    }
    let evaluations = [];
    let total = 0;
    let slaSummary = null;
    let riskSummary = null;

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const queryFilter = includeDeleted ? {} : { deletedAt: { $exists: false } };
      if (params.queue === 'certificates') {
        queryFilter['certificate.sentToCustomerDate'] = { $in: [null, ''] };
        queryFilter.$and = [{ approvedVersion: { $gt: 0 } }, { status: { $in: ['approved', 'pre_final_sent', 'payment_confirmed', 'certificate_issued'] } }];
      }
      
      // Strict role scoping for assessors
      if (isAssessorOnly) {
        const assessorConditions = [];
        if (authenticatedAssessorId) {
          assessorConditions.push({ assessorId: authenticatedAssessorId });
          assessorConditions.push({ assignedAssessorId: authenticatedAssessorId });
        }
        if (authenticatedAssessorName) {
          assessorConditions.push({ assessorName: authenticatedAssessorName });
          assessorConditions.push({ assignedAssessor: { $regex: authenticatedAssessorName, $options: 'i' } });
          assessorConditions.push({ assignedAssessorName: { $regex: authenticatedAssessorName, $options: 'i' } });
        }
        if (roleCheck.user?.email) {
          assessorConditions.push({ assignedAssessorEmail: { $regex: roleCheck.user.email, $options: 'i' } });
        }
        if (assessorConditions.length > 0) {
          Object.assign(queryFilter, assessorMongoScope(roleCheck.user));
        } else { queryFilter._id = '__NO_AUTHORIZED_RECORD__'; }
      } else if (params.assessor) {
        const aParam = params.assessor.trim();
        queryFilter.$or = [
          { assessorId: aParam },
          { assignedAssessorId: aParam },
          { assessorName: { $regex: aParam, $options: 'i' } },
          { assignedAssessor: { $regex: aParam, $options: 'i' } },
          { assignedAssessorName: { $regex: aParam, $options: 'i' } }
        ];
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'completed') {
          queryFilter.status = 'completed';
        } else if (statusFilter === 'approved') {
          queryFilter.status = { $in: ['approved', 'pre_final_sent', 'payment_confirmed'] };
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
        const sRegex = { $regex: searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
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

      // Projection: Exclude heavy nested history arrays and full comment threads for lightweight list payloads
      const projectionDoc = includeFullDetails ? {} : {
        evaluationHistory: 0,
        statusHistory: 0,
        comments: 0
      };
      if (!includeFullDetails && !includeBreakdown) {
        projectionDoc.breakdown = 0;
      }

      let sortDoc = { createdAt: -1 };
      if (sortBy === 'statusChangedAt') {
        sortDoc = { statusChangedAt: -1, createdAt: -1 };
      }

      const requiresCompute = (slaStatusParam && slaStatusParam !== 'ALL') ||
                              (riskStatusParam && riskStatusParam !== 'ALL') ||
                              sortBy === 'nearest_deadline' ||
                              sortBy === 'oldest_overdue';

      if (!requiresCompute) {
        // True server-side database-level pagination
        total = await collection.countDocuments(queryFilter);
        const cursor = collection
          .find(queryFilter, { projection: projectionDoc })
          .sort(sortDoc)
          .skip((page - 1) * limit)
          .limit(limit);

        const pageRecords = await cursor.toArray();
        const deduped = deduplicateEvaluations(pageRecords);
        evaluations = deduped.map(r => {
          const withSla = attachSlaToRecord(r);
          withSla.risk = attachRiskToRecord(withSla, deduped);
          return withSla;
        });
        slaSummary = computeSlaAggregateSummary(evaluations, { includeDeleted });
        riskSummary = computeRiskAggregateOverview(evaluations);
      } else {
        const rawRecords = await collection
          .find(queryFilter, { projection: projectionDoc })
          .sort(sortDoc)
          .toArray();

        // Deduplicate records that share the same registration / company + product + date
        const dedupedRaw = deduplicateEvaluations(rawRecords);

        let candidateRecords = dedupedRaw.map(r => attachSlaToRecord(r));
        candidateRecords.forEach(r => {
          r.risk = attachRiskToRecord(r, candidateRecords);
        });
        slaSummary = computeSlaAggregateSummary(candidateRecords, { includeDeleted });
        riskSummary = computeRiskAggregateOverview(candidateRecords);

        if (slaStatusParam && slaStatusParam !== 'ALL') {
          candidateRecords = candidateRecords.filter(d => d.sla?.status === slaStatusParam);
        }
        if (riskStatusParam && riskStatusParam !== 'ALL') {
          candidateRecords = candidateRecords.filter(d => d.risk?.riskLevel === riskStatusParam);
        }

        if (sortBy === 'nearest_deadline') {
          candidateRecords.sort((a, b) => {
            if (a.sla?.isCompleted && !b.sla?.isCompleted) return 1;
            if (!a.sla?.isCompleted && b.sla?.isCompleted) return -1;
            return new Date(a.sla?.deadline || a.createdAt) - new Date(b.sla?.deadline || b.createdAt);
          });
        } else if (sortBy === 'oldest_overdue') {
          candidateRecords.sort((a, b) => {
            return new Date(a.sla?.deadline || a.createdAt) - new Date(b.sla?.deadline || b.createdAt);
          });
        }

        total = candidateRecords.length;
        evaluations = candidateRecords.slice((page - 1) * limit, page * limit);
      }
    } else {
      let allEvaluations = await connection.getEvaluations(includeDeleted);

      // Strict role scoping for assessors in local fallback
      if (isAssessorOnly) {
        allEvaluations = allEvaluations.filter(d => assessorOwns(d, roleCheck.user));
      } else if (params.assessor) {
        const aParam = params.assessor.trim().toLowerCase();
        allEvaluations = allEvaluations.filter(d => 
          String(d.assessorId || '').toLowerCase() === aParam ||
          String(d.assignedAssessorId || '').toLowerCase() === aParam ||
          String(d.assessorName || '').toLowerCase().includes(aParam) ||
          String(d.assignedAssessor || '').toLowerCase().includes(aParam) ||
          String(d.assignedAssessorName || '').toLowerCase().includes(aParam)
        );
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'completed') {
          allEvaluations = allEvaluations.filter(d => {
            const s = (d.status || 'pending_review').toLowerCase();
            return s === 'completed';
          });
        } else if (statusFilter === 'approved') {
          allEvaluations = allEvaluations.filter(d => ['approved', 'pre_final_sent', 'payment_confirmed'].includes(d.status));
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

      // Deduplicate records that share the same registration / company + product + date
      const dedupedAll = deduplicateEvaluations(allEvaluations);

      let candidateRecords = dedupedAll.map(r => attachSlaToRecord(r));
      if (params.queue === 'certificates') candidateRecords = candidateRecords.filter(requiresCertificateAction);
      candidateRecords.forEach(r => {
        r.risk = attachRiskToRecord(r, candidateRecords);
      });
      slaSummary = computeSlaAggregateSummary(candidateRecords, { includeDeleted });
      riskSummary = computeRiskAggregateOverview(candidateRecords);

      if (slaStatusParam && slaStatusParam !== 'ALL') {
        candidateRecords = candidateRecords.filter(d => d.sla?.status === slaStatusParam);
      }
      if (riskStatusParam && riskStatusParam !== 'ALL') {
        candidateRecords = candidateRecords.filter(d => d.risk?.riskLevel === riskStatusParam);
      }

      if (sortBy === 'nearest_deadline') {
        candidateRecords.sort((a, b) => {
          if (a.sla?.isCompleted && !b.sla?.isCompleted) return 1;
          if (!a.sla?.isCompleted && b.sla?.isCompleted) return -1;
          return new Date(a.sla?.deadline || a.createdAt) - new Date(b.sla?.deadline || b.createdAt);
        });
      } else if (sortBy === 'oldest_overdue') {
        candidateRecords.sort((a, b) => {
          return new Date(a.sla?.deadline || a.createdAt) - new Date(b.sla?.deadline || b.createdAt);
        });
      } else if (sortBy === 'statusChangedAt') {
        candidateRecords.sort((a, b) => new Date(b.statusChangedAt || b.createdAt) - new Date(a.statusChangedAt || a.createdAt));
      } else {
        candidateRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      total = candidateRecords.length;
      evaluations = candidateRecords.slice((page - 1) * limit, page * limit);
      if (!includeFullDetails) {
        evaluations = evaluations.map(doc => {
          const { evaluationHistory, statusHistory, comments, breakdown, ...lightweight } = doc;
          return includeBreakdown ? { ...lightweight, breakdown } : lightweight;
        });
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
        slaSummary,
        riskSummary,
        isMongoAtlas: connection.isMongoAtlas,
        atlasDiagnostic: connection.atlasDiagnostic || null,
        data: evaluations.map(omitRetiredWorkflow)
      })
    };
  } catch (error) {
    logSecurityFailure('get-evaluations');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal Server Error while retrieving evaluations'
      })
    };
  }
};

/**
 * Deduplicates records sharing normalized companyName + productName (deviceModel) + submission date,
 * or linked via registrationReferenceId / linkedRegistrationId / linkedEvaluationId.
 * Keeps the canonical record (Linked to Registration / full package details / latest timestamp)
 * and merges audit trails (comments, statusHistory, evaluationHistory).
 */
export function deduplicateEvaluations(records) {
  if (!Array.isArray(records) || records.length <= 1) return records || [];

  const groups = new Map();
  const idToGroupMap = new Map();

  const normalizeStr = (s) => String(s || '').trim().toLowerCase();

  const extractDate = (doc) => {
    if (doc.assessmentDate && typeof doc.assessmentDate === 'string') {
      return doc.assessmentDate.trim().substring(0, 10);
    }
    if (doc.createdAt && typeof doc.createdAt === 'string') {
      return doc.createdAt.trim().substring(0, 10);
    }
    if (doc.scheduledDate && typeof doc.scheduledDate === 'string') {
      return doc.scheduledDate.trim().substring(0, 10);
    }
    return '';
  };

  const getCanonicalScore = (doc) => {
    let score = 0;
    const isLinked = Boolean(
      doc.linkedRegistrationId ||
      doc.registrationReferenceId ||
      doc.registrationId ||
      (doc.recordType === 'evaluation' && doc.linkedEvaluationId)
    );
    if (isLinked) score += 100;

    const pkgName = String(doc.packageName || '');
    if (pkgName.includes(':') || pkgName.includes('(') || pkgName.length > 15) {
      score += 50;
    }
    if (doc.packageDetails && typeof doc.packageDetails === 'object') {
      score += 20;
    }

    const status = normalizeStr(doc.status);
    if (['pending_review', 'completed', 'approved', 'pre_final_sent'].includes(status)) {
      score += 40;
    }
    if (doc.totalScore !== undefined && doc.totalScore !== null && Number(doc.totalScore) > 0) {
      score += 20;
    }
    if (Array.isArray(doc.breakdown) && doc.breakdown.length > 0) {
      score += 20;
    }

    return score;
  };

  for (const doc of records) {
    const docId = String(doc._id || doc.id || '');
    const comp = normalizeStr(doc.companyName);
    const prod = normalizeStr(doc.deviceModel || doc.productName);
    const dateStr = extractDate(doc);

    const linkedRef = String(doc.linkedRegistrationId || doc.registrationReferenceId || doc.linkedEvaluationId || doc.registrationId || '');
    let matchedGroupKey = null;

    if (linkedRef && idToGroupMap.has(linkedRef)) {
      matchedGroupKey = idToGroupMap.get(linkedRef);
    } else if (docId && idToGroupMap.has(docId)) {
      matchedGroupKey = idToGroupMap.get(docId);
    } else if (comp && prod) {
      const naturalKey = `${comp}:::${prod}:::${dateStr}`;
      if (groups.has(naturalKey)) {
        matchedGroupKey = naturalKey;
      } else {
        matchedGroupKey = naturalKey;
      }
    } else {
      matchedGroupKey = docId || Math.random().toString();
    }

    if (!groups.has(matchedGroupKey)) {
      groups.set(matchedGroupKey, []);
    }
    groups.get(matchedGroupKey).push(doc);

    if (docId) idToGroupMap.set(docId, matchedGroupKey);
    if (linkedRef) idToGroupMap.set(linkedRef, matchedGroupKey);
  }

  const result = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort to determine canonical record: highest score first, then latest timestamp
    group.sort((a, b) => {
      const scoreDiff = getCanonicalScore(b) - getCanonicalScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      const timeB = new Date(b.updatedAt || b.statusChangedAt || b.createdAt || 0).getTime();
      const timeA = new Date(a.updatedAt || a.statusChangedAt || a.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const canonical = { ...group[0] };
    const olderRecords = group.slice(1);

    const allComments = Array.isArray(canonical.comments) ? [...canonical.comments] : [];
    const seenCommentKeys = new Set(allComments.map(c => c.commentId || `${c.text}_${c.authorId || c.authorName}`));

    const allStatusHistory = Array.isArray(canonical.statusHistory) ? [...canonical.statusHistory] : [];
    const seenStatusKeys = new Set(allStatusHistory.map(h => `${h.status}_${h.timestamp || h.changedAt}`));

    const allEvalHistory = Array.isArray(canonical.evaluationHistory) ? [...canonical.evaluationHistory] : [];
    const seenEvalKeys = new Set(allEvalHistory.map(h => `${h.action || h.versionNumber}_${h.timestamp}`));

    for (const older of olderRecords) {
      // Merge comments
      if (Array.isArray(older.comments)) {
        for (const c of older.comments) {
          const key = c.commentId || `${c.text}_${c.authorId || c.authorName}`;
          if (!seenCommentKeys.has(key)) {
            seenCommentKeys.add(key);
            allComments.push(c);
          }
        }
      }

      // Merge statusHistory
      if (Array.isArray(older.statusHistory)) {
        for (const h of older.statusHistory) {
          const key = `${h.status}_${h.timestamp || h.changedAt}`;
          if (!seenStatusKeys.has(key)) {
            seenStatusKeys.add(key);
            allStatusHistory.push(h);
          }
        }
      }

      // Merge evaluationHistory
      if (Array.isArray(older.evaluationHistory)) {
        for (const h of older.evaluationHistory) {
          const key = `${h.action || h.versionNumber}_${h.timestamp}`;
          if (!seenEvalKeys.has(key)) {
            seenEvalKeys.add(key);
            allEvalHistory.push(h);
          }
        }
      }

      // Preserve commentsOverallSummary if canonical is missing one
      if (!canonical.commentsOverallSummary && older.commentsOverallSummary) {
        canonical.commentsOverallSummary = older.commentsOverallSummary;
      }

      // Preserve invoice if canonical has stub and older has real data
      if ((!canonical.invoice || canonical.invoice.isDraftStub) && older.invoice && !older.invoice.isDraftStub) {
        canonical.invoice = older.invoice;
      }


      // Preserve registration link
      if (!canonical.linkedRegistrationId && (older.linkedRegistrationId || older.registrationReferenceId || older._id)) {
        canonical.linkedRegistrationId = older.linkedRegistrationId || older.registrationReferenceId || String(older._id || older.id);
        canonical.registrationReferenceId = canonical.linkedRegistrationId;
      }
    }

    allStatusHistory.sort((a, b) => new Date(a.timestamp || a.changedAt || 0) - new Date(b.timestamp || b.changedAt || 0));
    allEvalHistory.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    allComments.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    canonical.comments = allComments;
    canonical.statusHistory = allStatusHistory;
    canonical.evaluationHistory = allEvalHistory;

    result.push(canonical);
  }

  return result;
}

export const handler = secureHandler(rawHandler, 'get-evaluations');

export default { handler, deduplicateEvaluations };
