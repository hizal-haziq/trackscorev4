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

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_ASSESSOR, authErrorResponse } from './auth.js';
import { recomputeScores, RUBRIC_VERSION, MAX_TOTAL_SCORE } from './rubric.js';
import { recordStatusEvent } from './status-bus.js';

// === CONFIGURATION ===
// Paste your Make.com Webhook URL here
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/gayv3o78cvcz4cnu7gpyjp4c8udjrpig"; 

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

    // 2. Validate mandatory metadata fields
    const { companyName, deviceModel, assessorName, assessorId, assessmentDate, packageName, breakdown, resubmitRecordId } = payload;
    
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

    const connection = await connectToDatabase();

    // Helper Function: Send Data to Make.com
    const syncToWebhook = async (recordData, isResubmission = false) => {
      if (process.env.NODE_ENV === 'test') return;
      if (MAKE_WEBHOOK_URL && MAKE_WEBHOOK_URL !== "YOUR_MAKE_WEBHOOK_URL_HERE") {
        try {
          await fetch(MAKE_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify({
              companyName: recordData.companyName,
              deviceModel: recordData.deviceModel,
              assessorId: recordData.assessorId,
              assessorName: recordData.assessorName,
              score: recordData.totalScore,
              status: recordData.status,
              isResubmission: isResubmission,
              date: new Date().toISOString()
            })
          });
        } catch (webhookError) {
          console.error("Make.com Webhook Sync Failed:", webhookError.message || webhookError);
        }
      }
    };

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
        if (existingToResubmit.status === 'approved') {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: 'This evaluation has already been approved and locked. Modifications are prohibited for MIROS compliance.'
            })
          };
        }

        const updateFields = {
          companyName: cleanCompany,
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
          status: 'submitted',
          statusChangedAt: new Date().toISOString(),
          rejectionReason: null,
          resubmittedAt: new Date().toISOString()
        };

        const historyEntry = {
          action: 'resubmitted_by_assessor',
          timestamp: new Date().toISOString(),
          changedBy: cleanAssessorId ? `${cleanAssessorName} (${cleanAssessorId})` : cleanAssessorName,
          note: `Assessor remediated criteria and resubmitted for manager review. (Previous score: ${(existingToResubmit.totalScore || 0).toFixed(2)}, New score: ${recomputed.totalScore.toFixed(2)})`,
          previousScores: {
            sectionAScore: existingToResubmit.sectionAScore,
            sectionBScore: existingToResubmit.sectionBScore,
            totalScore: existingToResubmit.totalScore,
            starRating: existingToResubmit.starRating
          }
        };

        const statusHistoryEntry = {
          status: 'submitted',
          timestamp: new Date().toISOString(),
          actor: cleanAssessorId ? `${cleanAssessorName} (${cleanAssessorId})` : cleanAssessorName,
          note: `Evaluation resubmitted after addressing notes. Score: ${recomputed.totalScore.toFixed(2)} pts.`
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
          note: 'Evaluation resubmitted after corrections'
        });

        // Trigger Webhook for Resubmission
        await syncToWebhook(updateFields, true);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            id: resubmitRecordId,
            status: 'submitted',
            isResubmission: true,
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

    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const companyRegex = new RegExp(`^${escapeRegex(cleanCompany)}$`, 'i');
      const modelRegex = new RegExp(`^${escapeRegex(cleanModel)}$`, 'i');

      // 1st attempt: match companyName AND deviceModel
      matchedRegistration = await collection.findOne({
        companyName: { $regex: companyRegex },
        deviceModel: { $regex: modelRegex },
        status: { $in: ['registered', 'scheduled'] },
        deletedAt: null
      });

      // 2nd attempt: match companyName where deviceModel was not provided/empty at registration time
      if (!matchedRegistration) {
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
      // 1st attempt: match both company and device model
      matchedRegistration = all.find(r => 
        String(r.companyName || '').toLowerCase() === cleanCompany.toLowerCase() &&
        String(r.deviceModel || '').toLowerCase() === cleanModel.toLowerCase() &&
        ['registered', 'scheduled'].includes(r.status) &&
        !r.deletedAt
      );

      // 2nd attempt: match company where device model was empty at registration
      if (!matchedRegistration) {
        matchedRegistration = all.find(r =>
          String(r.companyName || '').toLowerCase() === cleanCompany.toLowerCase() &&
          (!r.deviceModel || String(r.deviceModel).trim() === '') &&
          ['registered', 'scheduled'].includes(r.status) &&
          !r.deletedAt
        );
      }
    }

    const registrationReferenceId = matchedRegistration ? String(matchedRegistration._id) : null;

    // 5. Duplicate Submission Guard (For new submissions)
    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      // Fallback for local storage (checks name instead of ID if local method isn't updated)
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

    const nowIso = payload.createdAt || new Date().toISOString();

    // 6. Build authoritative evaluation document
    const evaluationRecord = {
      rubricVersion: payload.rubricVersion || RUBRIC_VERSION,
      companyName: cleanCompany,
      deviceModel: cleanModel,
      packageName: packageName ? String(packageName).trim() : (matchedRegistration?.packageName || 'Standard Evaluation'),
      package: payload.package || matchedRegistration?.package || 'package_1',
      packageDetails: matchedRegistration?.packageDetails || null,
      invoice: matchedRegistration?.invoice || null,
      payment: matchedRegistration?.payment || {
        status: matchedRegistration?.invoice && !matchedRegistration.invoice.isDraftStub ? 'invoiced' : 'unpaid',
        amountReceived: 0,
        paymentDate: null,
        paymentMethod: null,
        verifiedBy: null
      },
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

    // 7. Persist to Database
    if (connection.isMongoAtlas) {
      const collection = connection.db.collection(COLLECTION_NAME);
      const result = await collection.insertOne(evaluationRecord);
      insertedId = result.insertedId;
      storageType = 'mongodb_atlas';

      // If matched with a pre-registered customer record, link back with reference ID without overwriting
      if (registrationReferenceId) {
        await collection.updateOne(buildMongoIdFilter(registrationReferenceId), {
          $set: {
            linkedEvaluationId: String(insertedId),
            evaluationReferenceId: String(insertedId)
          },
          $push: {
            evaluationHistory: {
              action: 'linked_to_evaluation',
              timestamp: nowIso,
              changedBy: cleanAssessorName,
              note: `Formal evaluation submitted and referenced (Evaluation ID: ${insertedId})`
            },
            statusHistory: {
              status: matchedRegistration.status,
              timestamp: nowIso,
              actor: cleanAssessorName,
              note: `Formal evaluation submitted and linked (Evaluation ID: ${insertedId})`
            }
          }
        });
      }
    } else {
      const result = await connection.insertEvaluation(evaluationRecord);
      insertedId = result.insertedId;
      storageType = 'local_store';

      if (registrationReferenceId) {
        await connection.updateEvaluation(
          registrationReferenceId,
          { linkedEvaluationId: String(insertedId), evaluationReferenceId: String(insertedId) },
          {
            action: 'linked_to_evaluation',
            timestamp: nowIso,
            changedBy: cleanAssessorName,
            note: `Formal evaluation submitted and referenced (Evaluation ID: ${insertedId})`
          }
        );
      }
    }

    recordStatusEvent({
      evaluationId: String(insertedId),
      companyName: cleanCompany,
      deviceModel: cleanModel,
      oldStatus: null,
      newStatus: 'submitted',
      actor: cleanAssessorName,
      note: 'New evaluation submitted'
    });

    // 8. Trigger Webhook for New Submission
    await syncToWebhook(evaluationRecord, false);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: insertedId,
        linkedRegistrationId: registrationReferenceId,
        registrationReferenceId: registrationReferenceId,
        status: evaluationRecord.status,
        storage: storageType,
        rubricVersion: evaluationRecord.rubricVersion,
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal Server Error while persisting evaluation'
      })
    };
  }
};