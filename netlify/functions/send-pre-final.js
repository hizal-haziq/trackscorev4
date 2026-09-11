/**
 * Netlify Serverless Function: send-pre-final
 * Allows managers to send/log pre-final evaluation results to the vendor.
 * Moves status to: 'pre_final_sent'
 * Can also be marked as skipped if jumping straight to invoicing/payment.
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { recordStatusEvent } from './status-bus.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
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
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' })
    };
  }

  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const managerName = roleCheck.user?.name || 'Operations Manager';

  try {
    let body = {};
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload.' })
      };
    }

    const { id, recipientEmail, notes = '', skip = false } = body;
    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Record ID is required.' })
      };
    }

    const connection = await connectToDatabase();
    let existing = null;
    let collection = null;
    let filter = null;

    if (connection.isMongoAtlas) {
      collection = connection.db.collection(COLLECTION_NAME);
      filter = buildMongoIdFilter(id);
      existing = await collection.findOne(filter);
    } else {
      existing = await connection.getEvaluationById(id);
    }

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Evaluation record not found.' })
      };
    }

    const curStatus = (existing.status || 'pending_review').toLowerCase();
    if (curStatus !== 'pending_review' && curStatus !== 'submitted') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Cannot send pre-final results. Record must currently be in "pending_review" status (current status: "${existing.status}").`
        })
      };
    }

    const nowIso = new Date().toISOString();
    const oldStatus = existing.status || 'pending_review';
    const isSkipped = Boolean(skip || body.skipPreFinal);
    const newStatus = isSkipped ? 'pending_review' : 'pre_final_sent';
    const sendEmail = (recipientEmail || existing.contactEmail || 'customer@telematics.com').trim();

    // Prepare simulated email content
    const emailSubject = `[MIROS TrackScore] Pre-Final Evaluation Result - ${existing.companyName} (${existing.deviceModel})`;
    const emailBody = [
      `OFFICIAL TELEMATICS ASSESSMENT PRE-FINAL NOTIFICATION`,
      `-------------------------------------------------------`,
      `Date: ${new Date(nowIso).toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      `Recipient: ${existing.contactPerson ? `${existing.contactPerson} (${sendEmail})` : sendEmail}`,
      `Company: ${existing.companyName}`,
      `Device Model: ${existing.deviceModel}`,
      `Package: ${existing.packageName || existing.package || 'TrackScore Standard'}`,
      ``,
      `PRELIMINARY RESULTS SUMMARY:`,
      `Section A Score (Core Telematics): ${(existing.sectionAScore || 0).toFixed(2)} / 3.50`,
      `Section B Score (Extended Safety): ${(existing.sectionBScore || 0).toFixed(2)} / 1.50`,
      `Total Overall Score: ${(existing.totalScore || 0).toFixed(2)} / 5.00`,
      `Preliminary Rating: ${existing.starsCount || 0} Stars (${existing.starRating || existing.ratingLabel || 'Compliant'})`,
      ``,
      notes ? `Manager Notes & Remarks:\n${notes.trim()}\n` : '',
      `NEXT STEPS:`,
      `1. Please review this preliminary result notification.`,
      `2. Invoicing and payment verification will be performed by MIROS Operations.`,
      `3. Official Certificate and Final Evaluation Report will be issued upon payment confirmation.`,
      ``,
      `Operations Management Division`,
      `Malaysian Institute of Road Safety Research (MIROS)`
    ].filter(Boolean).join('\n');

    if (!isSkipped) {
      console.log('====================================================');
      console.log('[WOULD-BE EMAIL DISPATCHED TO VENDOR]');
      console.log(`To: ${sendEmail}`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Content:\n${emailBody}`);
      console.log('====================================================');
    }

    const historyEntry = {
      status: newStatus,
      timestamp: nowIso,
      actor: managerName,
      changedBy: managerName,
      preFinalSkipped: isSkipped,
      note: isSkipped
        ? `Pre-final result stage skipped by manager (${managerName}). Record is ready for payment verification.`
        : `Pre-final results dispatched to ${sendEmail}. Score: ${(existing.totalScore || 0).toFixed(2)} pts (${existing.starsCount || 0} Stars). ${notes ? `Note: ${notes.trim()}` : ''}`
    };

    const updateFields = {
      status: newStatus,
      statusChangedAt: nowIso,
      preFinalSkipped: isSkipped,
      preFinalResult: isSkipped ? {
        sentDate: null,
        recipientEmail: sendEmail,
        notes: notes.trim() || 'Pre-final result review skipped by manager.',
        sentBy: managerName,
        skippedBy: managerName,
        skippedAt: nowIso,
        isSkipped: true
      } : {
        sentDate: nowIso,
        recipientEmail: sendEmail,
        notes: notes.trim(),
        sentBy: managerName,
        isSkipped: false,
        emailSubject,
        emailBody
      }
    };

    if (connection.isMongoAtlas) {
      await collection.updateOne(filter, {
        $set: updateFields,
        $push: { statusHistory: historyEntry }
      });

      // Synchronize linked registration record if present
      const linkedRegId = existing.linkedRegistrationId || existing.registrationReferenceId;
      if (linkedRegId) {
        await collection.updateOne(buildMongoIdFilter(linkedRegId), {
          $set: {
            status: newStatus,
            preFinalSkipped: isSkipped,
            preFinalResult: updateFields.preFinalResult
          },
          $push: { statusHistory: historyEntry }
        });
      }
    } else {
      await connection.updateEvaluation(id, updateFields, historyEntry);
    }

    recordStatusEvent({
      evaluationId: id,
      companyName: existing.companyName,
      deviceModel: existing.deviceModel,
      oldStatus,
      newStatus,
      actor: managerName,
      note: isSkipped ? 'Pre-final skipped by manager' : `Pre-final results sent to ${sendEmail}`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: isSkipped
          ? 'Pre-final stage bypassed successfully. Record is ready for payment verification.'
          : `Pre-final results marked as sent to ${sendEmail}.`,
        status: newStatus,
        preFinalSkipped: isSkipped,
        preFinalResult: updateFields.preFinalResult,
        simulatedEmail: isSkipped ? null : {
          to: sendEmail,
          subject: emailSubject,
          body: emailBody
        }
      })
    };
  } catch (error) {
    console.error('[SEND-PRE-FINAL-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error sending pre-final results.' })
    };
  }
};

export default { handler };
