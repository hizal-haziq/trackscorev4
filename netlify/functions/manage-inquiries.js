/**
 * Netlify Serverless Function: manage-inquiries
 * 
 * Manager-Only endpoint to view, review, convert, and dismiss vendor inquiries.
 * Strict Role Requirement: ROLE_MANAGER only.
 * Assessors and Vendors are strictly forbidden (403 Forbidden).
 */

import {
  connectToDatabase,
  listInquiries,
  findInquiryById,
  updateInquiryRecord,
  COLLECTION_NAME
} from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { getPackageDetails } from './packages.js';
import { recordStatusEvent } from './status-bus.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // 1. Strict Manager Authentication & Authorization
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const managerName = roleCheck.user?.name || 'Operations Manager';
  const connection = await connectToDatabase();

  // 2. GET: List inquiries
  if (event.httpMethod === 'GET') {
    try {
      const statusParam = (event.queryStringParameters?.status || 'inquiry').trim().toLowerCase();
      const filter = statusParam === 'all' ? {} : { status: statusParam };

      const inquiries = await listInquiries(connection, filter);

      // Count active pending inquiries for manager badge
      const allInquiries = await listInquiries(connection, {});
      const activePendingCount = allInquiries.filter(i => i.status === 'inquiry').length;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          inquiries,
          activePendingCount,
          total: inquiries.length
        })
      };
    } catch (err) {
      console.error('[MANAGE-INQUIRIES-GET-ERROR]', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Failed to retrieve inquiries.' })
      };
    }
  }

  // 3. POST: Actions (convert | dismiss)
  if (event.httpMethod === 'POST') {
    try {
      let body = {};
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
      } catch {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Malformed JSON payload.' })
        };
      }

      const {
        inquiryId,
        action,
        selectedPackage,
        scheduledDate,
        notes,
        assignedAssessor,
        assignedAssessorId,
        assignedAssessorName,
        assignedAssessorEmail
      } = body;

      if (!inquiryId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Inquiry ID is required.' })
        };
      }

      const inquiry = await findInquiryById(connection, inquiryId);
      if (!inquiry) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Inquiry record not found.' })
        };
      }

      const nowIso = new Date().toISOString();

      // ACTION: CONVERT TO REGISTRATION
      if (action === 'convert') {
        if (inquiry.status !== 'inquiry') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: `Inquiry is already in "${inquiry.status}" state and cannot be converted.`
            })
          };
        }

        // Package selection fallback
        const pkgKey = selectedPackage || (inquiry.packageInterest?.toLowerCase().includes('comprehensive') ? 'package_2' : 'package_1');
        const packageInfo = getPackageDetails(pkgKey);
        const currentYear = new Date().getFullYear();
        const randomSeq = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV-${currentYear}-${randomSeq}`;

        // Create initial evaluation record with status: "registered"
        const initialStatusHistory = [
          ...(inquiry.statusHistory || []),
          {
            status: 'registered',
            changedAt: nowIso,
            changedBy: managerName,
            notes: `Converted from public inquiry (${inquiry._id}) by ${managerName}. ${notes ? `Notes: ${notes}` : ''}`.trim()
          }
        ];

        const evaluationDoc = {
          recordType: 'evaluation',
          companyName: inquiry.companyName,
          officeAddress: inquiry.officeAddress || '',
          state: inquiry.state || '',
          deviceModel: inquiry.deviceModel || 'Pending Specification',
          contactPerson: inquiry.contactPerson,
          contactEmail: inquiry.contactEmail,
          contactPhone: inquiry.contactPhone,
          package: pkgKey,
          packageName: packageInfo.name,
          packageDetails: packageInfo,
          scheduledDate: scheduledDate || null,
          status: 'registered',
          registeredAt: nowIso,
          statusChangedAt: nowIso,
          statusHistory: initialStatusHistory,
          inquiryId: String(inquiry._id),
          invoice: {
            invoiceNumber,
            amount: packageInfo.price,
            issuedAt: nowIso,
            paymentStatus: 'unpaid',
            verifiedAt: null
          },
          payment: {
            status: 'unpaid',
            receiptNumber: null,
            verifiedBy: null,
            verifiedAt: null
          },
          certificate: null,
          preFinalResult: null,
          totalScore: 0,
          starsCount: 0,
          ratingLabel: 'Pending Assessment',
          createdAt: nowIso,
          updatedAt: nowIso
        };

        const chosenAssessor = (assignedAssessorName || assignedAssessor || '').trim();
        if (chosenAssessor) {
          evaluationDoc.assignedAssessor = chosenAssessor;
          evaluationDoc.assignedAssessorName = chosenAssessor;
          evaluationDoc.assignedAssessorId = (assignedAssessorId || '').trim();
          evaluationDoc.assignedAssessorEmail = (assignedAssessorEmail || '').trim();
          evaluationDoc.assignedAt = nowIso;
          evaluationDoc.assignedBy = managerName;
          if (scheduledDate) {
            evaluationDoc.status = 'scheduled';
          }
        }

        let newEvalId = null;
        if (connection.isMongoAtlas) {
          const insertRes = await connection.db.collection(COLLECTION_NAME).insertOne(evaluationDoc);
          newEvalId = insertRes.insertedId;
        } else {
          const createdEval = await connection.createEvaluation(evaluationDoc);
          newEvalId = createdEval._id;
        }

        // Update inquiry state to converted
        const updatedInquiryHistory = [
          ...(inquiry.statusHistory || []),
          {
            status: 'converted',
            changedAt: nowIso,
            changedBy: managerName,
            notes: `Promoted to registered evaluation record: ${newEvalId}`
          }
        ];

        await updateInquiryRecord(connection, inquiryId, {
          status: 'converted',
          convertedAt: nowIso,
          convertedRegistrationId: String(newEvalId),
          statusHistory: updatedInquiryHistory
        });

        // Emit SSE event
        try {
          recordStatusEvent({
            evaluationId: String(newEvalId),
            companyName: inquiry.companyName,
            status: 'registered',
            previousStatus: 'inquiry',
            changedBy: managerName,
            changedAt: nowIso,
            notes: `Promoted from inquiry to registered evaluation (${packageInfo.name})`
          });
        } catch {
          // Non-blocking SSE notice
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Inquiry successfully converted to registration for ${inquiry.companyName}.`,
            evaluationId: String(newEvalId),
            invoiceNumber
          })
        };
      }

      // ACTION: DISMISS
      if (action === 'dismiss') {
        const dismissReason = body.reason || 'Dismissed by manager review (spam or out of scope).';
        const updatedHistory = [
          ...(inquiry.statusHistory || []),
          {
            status: 'dismissed',
            changedAt: nowIso,
            changedBy: managerName,
            notes: dismissReason
          }
        ];

        await updateInquiryRecord(connection, inquiryId, {
          status: 'dismissed',
          dismissedAt: nowIso,
          dismissReason,
          statusHistory: updatedHistory
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Inquiry for ${inquiry.companyName} has been dismissed.`
          })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: `Invalid action "${action}". Expected "convert" or "dismiss".` })
      };

    } catch (err) {
      console.error('[MANAGE-INQUIRIES-POST-ERROR]', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'An error occurred while updating the inquiry.' })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method Not Allowed.' })
  };
};
