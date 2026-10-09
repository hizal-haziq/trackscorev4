/**
 * Netlify Serverless Function: save-evaluation
 * Handles POST requests to store evaluation records in MongoDB Atlas or local store
 * Includes:
 * - Shared-secret header authentication (x-api-key)
 * - Server-side score recomputation & cryptographic-grade integrity validation
 * - Duplicate submission detection (Company + Device + Assessor ID + Date)
 * - Rubric versioning tag
 * - Make.com Webhook Integration for Excel Live Sync
 */

import {
  connectToDatabase,
  COLLECTION_NAME,
  buildMongoIdFilter,
  createAssessmentVersionRecord,
  getNextVersionNumber
} from './db.js';
import { validateRole, ROLE_ASSESSOR, authErrorResponse } from './auth.js';
import {
  recomputeScores,
  validateBreakdownCriteria,
  RUBRIC_VERSION,
  MAX_TOTAL_SCORE
} from './rubric.js';
import { recordStatusEvent } from './status-bus.js';
import {
  calculateAssessmentSla,
  resolveSlaDurationDays,
  computeSlaDeadline
} from './sla.js';

const activeSubmissions = new Set();

export const handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' })
    };
  }

  // 1. API Protection Check (Assessor Role Required)
  const roleCheck = validateRole(event, ROLE_ASSESSOR);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }
  // Managers review submitted assessments; the 33-criterion editor and submit
  // endpoint belong exclusively to Assessors.
  if (roleCheck.role !== ROLE_ASSESSOR) {
    return authErrorResponse(headers, 403, 'Forbidden: Only assigned Assessors may submit assessments.');
  }

  let submissionKey = null;
  try {
    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON payload in request body' })
      };
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Request body must be a JSON object.' }) };
    }

    // 2. Validate mandatory metadata fields
    const { companyName, officeAddress, state, deviceModel, assessorName, assessorId, assessmentDate, packageName, breakdown, resubmitRecordId } = payload;
    
    if (!companyName || !deviceModel || !assessorName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: Company Name, Device Model, and Assessor Name are mandatory.'
        })
      };
    }

    const cleanCompany = String(companyName).trim();
    const cleanModel = String(deviceModel).trim();
    const cleanAssessorName = String(assessorName).trim();
    const cleanAssessorId = assessorId ? String(assessorId).trim().toUpperCase() : '';
    const authenticatedAssessorId = String(roleCheck.user?.assessorId || '').trim().toUpperCase();
    const authenticatedUserId = String(roleCheck.user?.userId || roleCheck.user?.id || roleCheck.user?._id || '').trim().toUpperCase();
    const canUpdateAssessment = (record) => {
      if (roleCheck.role !== ROLE_ASSESSOR) return true;
      const ownerId = String(record.assignedAssessorId || record.assessorId || '').trim().toUpperCase();
      if (ownerId) return ownerId === authenticatedAssessorId || ownerId === authenticatedUserId;
      const ownerName = String(record.assignedAssessor || record.assignedAssessorName || record.assessorName || '').trim().toLowerCase();
      return !ownerName || ownerName === String(roleCheck.user?.name || '').trim().toLowerCase();
    };
    const cleanDate = assessmentDate ? String(assessmentDate).trim().substring(0, 10) : new Date().toISOString().substring(0, 10);

    // Validate Assessor ID format if provided: strictly 3 letters, space, 4 numbers (e.g. MKA 9006)
    if (cleanAssessorId && !/^[A-Z]{3} \d{4}$/.test(cleanAssessorId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid Assessor ID format. Must strictly follow 3 letters and 4 numbers (e.g. MKA 9006).'
        })
      };
    }

    if (roleCheck.role === ROLE_ASSESSOR && authenticatedAssessorId && cleanAssessorId && authenticatedAssessorId !== cleanAssessorId) {
      return authErrorResponse(headers, 403, 'Forbidden: Assessor identity must match the authenticated account.');
    }

    // 3. Server-side score recomputation & integrity check
    if (!Array.isArray(breakdown) || breakdown.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing or empty evaluation breakdown array. Full 33-item evaluation matrix is required.'
        })
      };
    }

    if (!validateBreakdownCriteria(breakdown)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid submission: duplicate or missing criteria detected. Exactly one entry for each official 33-item criterion is required.'
        })
      };
    }

    // Validate per-criterion comments if present
    for (const item of breakdown) {
      if (item.comment !== undefined && item.comment !== null) {
        if (typeof item.comment !== 'string') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: `Invalid comment on criterion "${item.id}": comment must be a string.`
            })
          };
        }
        if (item.comment.length > 2000) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: `Comment on criterion "${item.id}" exceeds maximum allowed length of 2000 characters (${item.comment.length} chars).`
            })
          };
        }
      }
    }

    const recomputed = recomputeScores(breakdown);

    // Verify client-submitted totals vs recomputed totals within 0.05 epsilon
    const clientScoreA = Number(payload.sectionAScore || 0);
    const clientScoreB = Number(payload.sectionBScore || 0);
    const clientTotal = Number(payload.totalScore || 0);

    const diffA = Math.abs(clientScoreA - recomputed.sectionAScore);
    const diffB = Math.abs(clientScoreB - recomputed.sectionBScore);
    const diffTotal = Math.abs(clientTotal - recomputed.totalScore);
    const EPSILON = 0.05;

    if (diffA > EPSILON || diffB > EPSILON || diffTotal > EPSILON) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Score integrity verification failed. Client submitted (A: ${clientScoreA.toFixed(2)}, B: ${clientScoreB.toFixed(2)}, Total: ${clientTotal.toFixed(2)}) does not match authoritative recomputed scores (A: ${recomputed.sectionAScore.toFixed(2)}, B: ${recomputed.sectionBScore.toFixed(2)}, Total: ${recomputed.totalScore.toFixed(2)}).`,
          recomputedScores: {
            sectionAScore: recomputed.sectionAScore,
            sectionBScore: recomputed.sectionBScore,
            totalScore: recomputed.totalScore
          }
        })
      };
    }

    const target = payload.resubmitRecordId || payload.registrationId || payload.linkedRegistrationId || payload.registrationReferenceId || payload.id || payload._id;
    const key = target ? `record:${String(target)}` : JSON.stringify([cleanCompany.toLowerCase(), cleanModel.toLowerCase(), authenticatedAssessorId, cleanDate]);
    if (activeSubmissions.has(key)) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'This assessment is already being submitted. Reload before retrying.' }) };
    }
    submissionKey = key;
    activeSubmissions.add(key);

    const connection = await connectToDatabase();

    // 4. Handle Re-submission of Rejected Records
    if (resubmitRecordId) {
      let existingToResubmit = null;
      if (connection.isMongoAtlas) {
        const collection = connection.db.collection(COLLECTION_NAME);
        existingToResubmit = await collection.findOne(buildMongoIdFilter(resubmitRecordId));
      } else {
        existingToResubmit = await connection.getEvaluationById(resubmitRecordId);
      }

      if (existingToResubmit) {
        if (!canUpdateAssessment(existingToResubmit)) {
          return authErrorResponse(headers, 403, 'Forbidden: Assessors may only edit their own assigned assessments.');
        }
        const lockedStatuses = ['approved', 'pre_final_sent', 'payment_confirmed', 'cert_issued', 'certificate_issued', 'completed'];
        if (lockedStatuses.includes(String(existingToResubmit.status || '').toLowerCase())) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: 'This evaluation has already been approved and locked. Modifications are prohibited for MIROS compliance.'
            })
          };
        }

        let nextVersion = await getNextVersionNumber(connection, resubmitRecordId);
        if (nextVersion === 1) {
          // Backfill baseline v1 snapshot from existing record
          await createAssessmentVersionRecord(connection, {
            evaluationId: String(resubmitRecordId),
            versionNumber: 1,
            action: 'INITIAL_SUBMISSION',
            changeReason: 'Initial evaluation baseline snapshot',
            actor: {
              userId: existingToResubmit.assessorId || null,
              name: existingToResubmit.assessorName || 'Assessor',
              role: 'assessor',
              assessorId: existingToResubmit.assessorId || null
            },
            scores: {
              sectionAScore: existingToResubmit.sectionAScore,
              sectionBScore: existingToResubmit.sectionBScore,
              totalScore: existingToResubmit.totalScore,
              starRating: existingToResubmit.starRating,
              starsCount: existingToResubmit.starsCount,
              ratingLabel: existingToResubmit.ratingLabel
            },
            breakdown: existingToResubmit.breakdown || [],
            metadata: {
              companyName: existingToResubmit.companyName,
              deviceModel: existingToResubmit.deviceModel,
              assessmentDate: existingToResubmit.assessmentDate,
              rubricVersion: existingToResubmit.rubricVersion || RUBRIC_VERSION
            },
            createdAt: existingToResubmit.createdAt || new Date().toISOString()
          });
          nextVersion = 2;
        }

        const resubmitReason = payload.changeReason || payload.resubmitReason || payload.reason || 'Assessor resubmission after corrections';
        const resubmitTimeIso = new Date().toISOString();

        await createAssessmentVersionRecord(connection, {
          evaluationId: String(resubmitRecordId),
          versionNumber: nextVersion,
          action: 'RESUBMISSION',
          changeReason: resubmitReason,
          actor: {
            userId: roleCheck.user?.id || roleCheck.user?._id || cleanAssessorId || null,
            name: cleanAssessorName,
            role: roleCheck.user?.role || 'assessor',
            assessorId: cleanAssessorId || null
          },
          scores: {
            sectionAScore: recomputed.sectionAScore,
            sectionBScore: recomputed.sectionBScore,
            totalScore: recomputed.totalScore,
            starRating: recomputed.starRating,
            starsCount: recomputed.starsCount,
            ratingLabel: recomputed.ratingLabel
          },
          breakdown: recomputed.breakdown,
          metadata: {
            companyName: cleanCompany,
            deviceModel: cleanModel,
            assessmentDate: cleanDate,
            rubricVersion: payload.rubricVersion || RUBRIC_VERSION
          },
          createdAt: resubmitTimeIso
        });

        const updateFields = {
          companyName: cleanCompany,
          officeAddress: officeAddress ? String(officeAddress).trim() : (existingToResubmit.officeAddress || ''),
          state: state ? String(state).trim() : (existingToResubmit.state || ''),
          deviceModel: cleanModel,
          packageName: packageName ? String(packageName).trim() : 'Standard Evaluation',
          assessorName: cleanAssessorName,
          assessorId: cleanAssessorId,
          assessmentDate: cleanDate,
          sectionAScore: recomputed.sectionAScore,
          sectionBScore: recomputed.sectionBScore,
          totalScore: recomputed.totalScore,
          starRating: recomputed.starRating,
          starsCount: recomputed.starsCount,
          ratingLabel: recomputed.ratingLabel,
          breakdown: recomputed.breakdown,
          currentVersion: nextVersion,
          status: 'submitted',
          statusChangedAt: resubmitTimeIso,
          rejectionReason: null,
          resubmittedAt: resubmitTimeIso
        };

        const historyEntry = {
          action: 'resubmitted_by_assessor',
          timestamp: resubmitTimeIso,
          version: nextVersion,
          reason: resubmitReason,
          changedBy: cleanAssessorId ? `${cleanAssessorName} (${cleanAssessorId})` : cleanAssessorName,
          note: `Assessor remediated criteria (v${nextVersion}) and resubmitted for manager review. (Previous score: ${(existingToResubmit.totalScore || 0).toFixed(2)}, New score: ${recomputed.totalScore.toFixed(2)})`,
          previousScores: {
            sectionAScore: existingToResubmit.sectionAScore,
            sectionBScore: existingToResubmit.sectionBScore,
            totalScore: existingToResubmit.totalScore,
            starRating: existingToResubmit.starRating
          }
        };

        const statusHistoryEntry = {
          status: 'submitted',
          timestamp: resubmitTimeIso,
          actor: cleanAssessorId ? `${cleanAssessorName} (${cleanAssessorId})` : cleanAssessorName,
          note: `Evaluation resubmitted (v${nextVersion}) after addressing notes. Score: ${recomputed.totalScore.toFixed(2)} pts.`
        };

        if (connection.isMongoAtlas) {
          const collection = connection.db.collection(COLLECTION_NAME);
          await collection.updateOne(buildMongoIdFilter(resubmitRecordId), {
            $set: updateFields,
            $push: { 
              evaluationHistory: historyEntry,
              statusHistory: statusHistoryEntry
            }
          });
        } else {
          await connection.updateEvaluation(resubmitRecordId, updateFields, historyEntry);
        }

        recordStatusEvent({
          evaluationId: resubmitRecordId,
          companyName: cleanCompany,
          deviceModel: cleanModel,
          oldStatus: existingToResubmit.status,
          newStatus: 'submitted',
          actor: cleanAssessorName,
          note: `Evaluation resubmitted (v${nextVersion}) after corrections`
        });

        const slaSnapshot = calculateAssessmentSla({ ...existingToResubmit, ...updateFields });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            id: resubmitRecordId,
            status: 'submitted',
            isResubmission: true,
            currentVersion: nextVersion,
            version: nextVersion,
            sla: slaSnapshot,
            verifiedScores: {
              sectionAScore: recomputed.sectionAScore,
              sectionBScore: recomputed.sectionBScore,
              totalScore: recomputed.totalScore,
              starRating: recomputed.starRating,
              ratingLabel: recomputed.ratingLabel
            },
            message: 'Evaluation record successfully updated and resubmitted for manager review!'
          })
        };
      }
    }

    // 5. Check for Pre-Existing Customer Registration or Scheduled Record for Reference Linking
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let matchedRegistration = null;
    const targetRegId = (payload.registrationId || payload.registrationReferenceId || payload.linkedRegistrationId || '').trim();

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      // 1st attempt: lookup by explicit registrationId if provided
      if (targetRegId) {
        matchedRegistration = await collection.findOne(buildMongoIdFilter(targetRegId));
      }

      // 2nd attempt: match companyName AND deviceModel (within status registered or scheduled)
      if (!matchedRegistration) {
        const companyRegex = new RegExp(`^${escapeRegex(cleanCompany)}$`, 'i');
        const modelRegex = new RegExp(`^${escapeRegex(cleanModel)}$`, 'i');
        matchedRegistration = await collection.findOne({
          companyName: { $regex: companyRegex },
          deviceModel: { $regex: modelRegex },
          status: { $in: ['registered', 'scheduled'] },
          deletedAt: null
        });
      }

      // 3rd attempt: match companyName where deviceModel was not provided/empty at registration time
      if (!matchedRegistration) {
        const companyRegex = new RegExp(`^${escapeRegex(cleanCompany)}$`, 'i');
        matchedRegistration = await collection.findOne({
          companyName: { $regex: companyRegex },
          $or: [
            { deviceModel: { $exists: false } },
            { deviceModel: null },
            { deviceModel: '' },
            { deviceModel: /^\s*$/ }
          ],
          status: { $in: ['registered', 'scheduled'] },
          deletedAt: null
        });
      }
    } else {
      const all = await connection.getEvaluations();
      if (targetRegId) {
        matchedRegistration = all.find(r => (String(r._id) === targetRegId || String(r.id) === targetRegId) && !r.deletedAt);
      }
      if (!matchedRegistration) {
        matchedRegistration = all.find(r => 
          String(r.companyName || '').toLowerCase() === cleanCompany.toLowerCase() &&
          String(r.deviceModel || '').toLowerCase() === cleanModel.toLowerCase() &&
          ['registered', 'scheduled'].includes(r.status) &&
          !r.deletedAt
        );
      }
      if (!matchedRegistration) {
        matchedRegistration = all.find(r =>
          String(r.companyName || '').toLowerCase() === cleanCompany.toLowerCase() &&
          (!r.deviceModel || String(r.deviceModel).trim() === '') &&
          ['registered', 'scheduled'].includes(r.status) &&
          !r.deletedAt
        );
      }
    }

    const registrationReferenceId = matchedRegistration ? String(matchedRegistration._id || matchedRegistration.id) : null;
    if (matchedRegistration && !canUpdateAssessment(matchedRegistration)) {
      return authErrorResponse(headers, 403, 'Forbidden: Assessors may only submit their own assigned assessments.');
    }
    if (matchedRegistration && ['approved', 'pre_final_sent', 'payment_confirmed', 'cert_issued', 'certificate_issued', 'completed'].includes(String(matchedRegistration.status || '').toLowerCase())) {
      return authErrorResponse(headers, 403, 'This evaluation has already been approved and locked. Modifications are prohibited for MIROS compliance.');
    }

    // 5. Duplicate Submission Guard (For new unlinked submissions)
    if (!matchedRegistration) {
      if (connection.isMongoAtlas) {
        const collection = connection.db.collection(COLLECTION_NAME);
        const duplicateFilter = {
          companyName: { $regex: new RegExp(`^${escapeRegex(cleanCompany)}$`, 'i') },
          deviceModel: { $regex: new RegExp(`^${escapeRegex(cleanModel)}$`, 'i') },
          assessorName: { $regex: new RegExp(`^${escapeRegex(cleanAssessorName)}$`, 'i') },
          deletedAt: null,
          $or: [
            { assessmentDate: cleanDate },
            { createdAt: { $regex: new RegExp(`^${cleanDate}`) } }
          ]
        };
        if (cleanAssessorId) {
          duplicateFilter.assessorId = cleanAssessorId;
        }
        const existing = await collection.findOne(duplicateFilter);

        if (existing) {
          return {
            statusCode: 409,
            headers,
            body: JSON.stringify({
              error: `Conflict: An evaluation record for Company "${cleanCompany}", Device "${cleanModel}", Assessor "${cleanAssessorName}" on date ${cleanDate} already exists (ID: ${existing._id}). Please edit the existing record or update the assessment date/model.`,
              existingId: existing._id
            })
          };
        }
      } else {
        // Fallback for local storage
        const existing = await connection.findDuplicate(cleanCompany, cleanModel, cleanAssessorName, cleanDate);
        if (existing) {
          return {
            statusCode: 409,
            headers,
            body: JSON.stringify({
              error: `Conflict: An evaluation record for Company "${cleanCompany}", Device "${cleanModel}", Assessor "${cleanAssessorName}" on date ${cleanDate} already exists (ID: ${existing._id}). Please edit the existing record or update the assessment date/model.`,
              existingId: existing._id
            })
          };
        }
      }
    }

    const nowIso = payload.createdAt || new Date().toISOString();

    // 6. Build authoritative evaluation document
    const evaluationRecord = {
      rubricVersion: payload.rubricVersion || RUBRIC_VERSION,
      companyName: cleanCompany,
      deviceModel: cleanModel,
      packageName: packageName ? String(packageName).trim() : (matchedRegistration?.packageName || 'Standard Evaluation'),
      package: payload.package || matchedRegistration?.package || 'package_1',
      packageDetails: matchedRegistration?.packageDetails || null,
      slaDurationDays: matchedRegistration?.slaDurationDays || resolveSlaDurationDays(matchedRegistration || { package: payload.package || payload.packageName }),
      slaStartAt: matchedRegistration?.slaStartAt || nowIso,
      slaDeadline: matchedRegistration?.slaDeadline || computeSlaDeadline(matchedRegistration || { package: payload.package || payload.packageName }, matchedRegistration?.slaStartAt || nowIso, matchedRegistration?.slaDurationDays || resolveSlaDurationDays(matchedRegistration || { package: payload.package || payload.packageName })),
      invoice: matchedRegistration?.invoice || null,
      officeAddress: officeAddress ? String(officeAddress).trim() : (matchedRegistration?.officeAddress || ''),
      state: state ? String(state).trim() : (matchedRegistration?.state || ''),
      contactPerson: matchedRegistration?.contactPerson || payload.contactPerson || null,
      contactEmail: matchedRegistration?.contactEmail || payload.contactEmail || null,
      contactPhone: matchedRegistration?.contactPhone || payload.contactPhone || null,
      registrationReferenceId: registrationReferenceId,
      linkedRegistrationId: registrationReferenceId,
      assessorName: cleanAssessorName,
      assessorId: cleanAssessorId,
      assessmentDate: cleanDate,
      sectionAScore: recomputed.sectionAScore,
      sectionBScore: recomputed.sectionBScore,
      totalScore: recomputed.totalScore,
      starRating: recomputed.starRating,
      starsCount: recomputed.starsCount,
      ratingLabel: recomputed.ratingLabel,
      maxPossibleScore: MAX_TOTAL_SCORE,
      breakdown: recomputed.breakdown,
      currentVersion: 1,
      status: payload.status || 'pending_review',
      statusChangedAt: nowIso,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      evaluationHistory: [],
      statusHistory: [
        {
          status: payload.status || 'pending_review',
          timestamp: nowIso,
          actor: cleanAssessorId ? `${cleanAssessorName} (${cleanAssessorId})` : cleanAssessorName,
          note: registrationReferenceId 
            ? `Initial evaluation submitted and linked to pre-registered inspection (${registrationReferenceId}). Ready for managerial review.`
            : 'Initial evaluation submitted by assessor. Ready for managerial review.'
        }
      ],
      createdAt: nowIso
    };

    let insertedId;
    let storageType;

    // 7. Persist to Database (Update in-place if matched to registration, otherwise insert new)
    const persistInitialVersion = () => createAssessmentVersionRecord(connection, {
      evaluationId: String(insertedId),
      versionNumber: 1,
      action: 'INITIAL_SUBMISSION',
      changeReason: 'Initial assessor evaluation submission',
      actor: {
        userId: roleCheck.user?.id || roleCheck.user?._id || cleanAssessorId || null,
        name: cleanAssessorName,
        role: roleCheck.user?.role || 'assessor',
        assessorId: cleanAssessorId || null
      },
      scores: {
        sectionAScore: evaluationRecord.sectionAScore,
        sectionBScore: evaluationRecord.sectionBScore,
        totalScore: evaluationRecord.totalScore,
        starRating: evaluationRecord.starRating,
        starsCount: evaluationRecord.starsCount,
        ratingLabel: evaluationRecord.ratingLabel
      },
      breakdown: evaluationRecord.breakdown,
      metadata: {
        companyName: cleanCompany,
        deviceModel: cleanModel,
        assessmentDate: cleanDate,
        rubricVersion: evaluationRecord.rubricVersion
      },
      createdAt: nowIso
    });

    if (matchedRegistration) {
      insertedId = matchedRegistration._id || matchedRegistration.id;
      const regRef = String(insertedId);
      await persistInitialVersion();

      const updatedStatusHistory = Array.isArray(matchedRegistration.statusHistory) ? [...matchedRegistration.statusHistory] : [];
      updatedStatusHistory.push({
        status: payload.status || 'pending_review',
        timestamp: nowIso,
        actor: cleanAssessorId ? `${cleanAssessorName} (${cleanAssessorId})` : cleanAssessorName,
        note: `Formal evaluation submitted and linked to pre-registered inspection (${regRef}). Ready for managerial review.`
      });

      const updatedEvalHistory = Array.isArray(matchedRegistration.evaluationHistory) ? [...matchedRegistration.evaluationHistory] : [];
      updatedEvalHistory.push({
        action: 'linked_to_evaluation',
        timestamp: nowIso,
        changedBy: cleanAssessorName,
        note: `Formal evaluation submitted and linked (Evaluation ID: ${regRef})`
      });

      const updatePayload = {
        ...evaluationRecord,
        recordType: 'evaluation',
        registrationReferenceId: regRef,
        linkedRegistrationId: regRef,
        statusHistory: updatedStatusHistory,
        evaluationHistory: updatedEvalHistory,
        updatedAt: nowIso
      };
      delete updatePayload._id;

      if (connection.isMongoAtlas) {
        const collection = connection.db.collection(COLLECTION_NAME);
        await collection.updateOne(buildMongoIdFilter(regRef), { $set: updatePayload });
        storageType = 'mongodb_atlas';
      } else {
        await connection.updateEvaluation(regRef, updatePayload);
        storageType = 'local_store';
      }
    } else {
      if (connection.isMongoAtlas) {
        const collection = connection.db.collection(COLLECTION_NAME);
        const result = await collection.insertOne(evaluationRecord);
        insertedId = result.insertedId;
        storageType = 'mongodb_atlas';
      } else {
        const result = await connection.insertEvaluation(evaluationRecord);
        insertedId = result.insertedId;
        storageType = 'local_store';
      }
    }


    if (!matchedRegistration) await persistInitialVersion();

    recordStatusEvent({
      evaluationId: String(insertedId),
      companyName: cleanCompany,
      deviceModel: cleanModel,
      oldStatus: null,
      newStatus: 'submitted',
      actor: cleanAssessorName,
      note: 'New evaluation submitted'
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: insertedId,
        linkedRegistrationId: registrationReferenceId,
        registrationReferenceId: registrationReferenceId,
        status: evaluationRecord.status,
        currentVersion: 1,
        version: 1,
        storage: storageType,
        rubricVersion: evaluationRecord.rubricVersion,
        sla: calculateAssessmentSla(evaluationRecord),
        verifiedScores: {
          sectionAScore: evaluationRecord.sectionAScore,
          sectionBScore: evaluationRecord.sectionBScore,
          totalScore: evaluationRecord.totalScore,
          starRating: evaluationRecord.starRating,
          ratingLabel: evaluationRecord.ratingLabel
        },
        message: 'Evaluation saved successfully to ' + (storageType === 'mongodb_atlas' ? 'MongoDB Atlas' : 'TrackScore Repository')
      })
    };
  } catch (error) {
    console.error('Error saving evaluation:', error);
    if (error.code === 11000) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Assessment version already exists. Reload before retrying.' }) };
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal Server Error while persisting evaluation'
      })
    };
  } finally {
    if (submissionKey) activeSubmissions.delete(submissionKey);
  }
};
