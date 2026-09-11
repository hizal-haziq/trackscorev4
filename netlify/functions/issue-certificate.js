/**
 * Netlify Serverless Function: issue-certificate
 * Allows managers to advance the certificate lifecycle steps:
 * 1. Mark "prepared" (generates/logs certificateNumber, sets preparedDate) — only allowed once payment.status === 'paid' (or payment_confirmed / waived)
 * 2. Mark "printed" (sets printedDate) — requires preparedDate
 * 3. Record DGO signature (sets signedBy, signedDate) — requires printedDate and explicit signedBy signatory name -> moves status to 'certificate_issued'
 * 4. Mark "sent to customer" (sets sentToCustomerDate) — requires signedDate -> moves status to 'completed'
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

    const {
      id,
      step, // 'prepare' | 'print' | 'sign' | 'deliver' | 'sent_to_customer'
      action, // alternate alias for step
      certificateNumber = '',
      signedBy = '',
      dgoName = '',
      deliveryMethod = 'Email & Physical Dispatch',
      paymentOverride = false,
      overrideReason = '',
      notes = ''
    } = body;

    const requestedStep = String(step || action || '').trim().toLowerCase();

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

    const nowIso = new Date().toISOString();
    const oldStatus = existing.status || 'pending_review';
    let newStatus = oldStatus;

    // Check payment status
    const isPaymentPaid = (existing.payment?.status === 'paid') ||
      existing.status === 'payment_confirmed' ||
      existing.status === 'certificate_issued' ||
      existing.status === 'completed' ||
      Boolean(existing.payment?.overridden);

    const currentCert = existing.certificate || {};

    // Standard sub-object schema: { certificateNumber, preparedDate, printedDate, signedBy, signedDate, sentToCustomerDate }
    let updatedCert = {
      certificateNumber: currentCert.certificateNumber || null,
      preparedDate: currentCert.preparedDate || null,
      printedDate: currentCert.printedDate || null,
      signedBy: currentCert.signedBy || null,
      signedDate: currentCert.signedDate || null,
      sentToCustomerDate: currentCert.sentToCustomerDate || null,
      ...(currentCert.deliveryMethod ? { deliveryMethod: currentCert.deliveryMethod } : {}),
      ...(currentCert.deliveredBy ? { deliveredBy: currentCert.deliveredBy } : {})
    };

    let noteText = '';
    const intermediateHistory = [];

    // --- STEP 1: PREPARE ---
    if (requestedStep === 'prepare' || requestedStep === 'prepared' || requestedStep === 'mark_prepared') {
      // Rule 1: Only allowed once payment.status === 'paid' (i.e. record is at payment_confirmed or later)
      if (!isPaymentPaid) {
        if (!paymentOverride) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              paymentBlocked: true,
              error: 'Certificate preparation is locked: Payment has not been confirmed for this evaluation (payment.status === "paid" required). Please verify payment first.'
            })
          };
        }
        if (!overrideReason || !overrideReason.trim()) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Manager override reason is required when preparing a certificate before payment confirmation.'
            })
          };
        }
      }

      // Generate or preserve certificate number
      const autoCertNum = (certificateNumber && certificateNumber.trim()) ||
        currentCert.certificateNumber ||
        `TS-CERT-${new Date().getFullYear()}-${existing._id ? String(existing._id).slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000)}`;

      updatedCert.certificateNumber = autoCertNum;
      updatedCert.preparedDate = body.preparedDate ? new Date(body.preparedDate).toISOString() : (currentCert.preparedDate || nowIso);
      updatedCert.preparedBy = managerName;

      noteText = `Certificate ${autoCertNum} marked as prepared on ${new Date(updatedCert.preparedDate).toLocaleDateString('en-MY')}.${paymentOverride ? ` (Payment override: ${overrideReason.trim()})` : ''}`;
    }

    // --- STEP 2: PRINT ---
    else if (requestedStep === 'print' || requestedStep === 'printed' || requestedStep === 'mark_printed') {
      // Sequential check: cannot mark printed before prepared
      if (!currentCert.preparedDate || !currentCert.certificateNumber) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Sequential error: Cannot mark certificate as printed. Certificate must first be marked as "prepared" with an assigned certificate number.'
          })
        };
      }

      updatedCert.printedDate = body.printedDate ? new Date(body.printedDate).toISOString() : (currentCert.printedDate || nowIso);
      updatedCert.printedBy = managerName;

      noteText = `Certificate ${updatedCert.certificateNumber} marked as printed and routed to Director General Office (DGO).`;
    }

    // --- STEP 3: SIGN (DGO SIGNATURE) ---
    else if (requestedStep === 'sign' || requestedStep === 'signed' || requestedStep === 'record_signature') {
      // Sequential check: cannot sign before printed
      if (!currentCert.printedDate) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Sequential error: Cannot record DGO signature. Certificate must be marked as "printed" before obtaining signature.'
          })
        };
      }

      // Signatory check: Manager must type or select real signatory name
      const signatoryName = (signedBy || dgoName || '').trim();
      if (!signatoryName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'DGO signatory name is required to record official certificate signature.'
          })
        };
      }

      const signDate = body.signedDate ? new Date(body.signedDate).toISOString() : nowIso;
      updatedCert.signedBy = signatoryName;
      updatedCert.signedDate = signDate;
      newStatus = 'certificate_issued';

      noteText = `Certificate ${updatedCert.certificateNumber} officially signed by ${signatoryName} on ${new Date(signDate).toLocaleDateString('en-MY')}. Overall status moved to "certificate_issued".`;
    }

    // --- STEP 4: DELIVER / SENT TO CUSTOMER ---
    else if (requestedStep === 'deliver' || requestedStep === 'delivered' || requestedStep === 'sent' || requestedStep === 'sent_to_customer' || requestedStep === 'mark_sent') {
      // Sequential check: cannot deliver before signed
      if (!currentCert.signedDate || !currentCert.signedBy) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Sequential error: Cannot mark certificate as sent to customer. Certificate must first be signed and endorsed by the Director General Office (DGO).'
          })
        };
      }

      const sentDate = body.sentToCustomerDate ? new Date(body.sentToCustomerDate).toISOString() : nowIso;
      updatedCert.sentToCustomerDate = sentDate;
      updatedCert.deliveryMethod = (deliveryMethod || '').trim() || 'Email & Physical Dispatch';
      updatedCert.deliveredBy = managerName;

      // Final action moves overall status to certificate_issued then completed
      if (oldStatus !== 'certificate_issued') {
        intermediateHistory.push({
          status: 'certificate_issued',
          timestamp: currentCert.signedDate || nowIso,
          actor: currentCert.signedBy || managerName,
          note: `Certificate ${updatedCert.certificateNumber} issued.`
        });
      }

      newStatus = 'completed';
      noteText = `Certificate ${updatedCert.certificateNumber} dispatched to customer via ${updatedCert.deliveryMethod}. Evaluation lifecycle completed.`;
    }

    // --- BATCH / COMPATIBILITY: COMPLETE ALL (Manager Fast-Track if Paid) ---
    else if (requestedStep === 'complete_all') {
      if (!isPaymentPaid && !paymentOverride) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            paymentBlocked: true,
            error: 'Certificate issuance is locked: Payment must be confirmed before issuing certificates.'
          })
        };
      }

      const signatoryName = (signedBy || dgoName || 'Director General Office (DGO)').trim();
      const autoCertNum = (certificateNumber && certificateNumber.trim()) ||
        currentCert.certificateNumber ||
        `TS-CERT-${new Date().getFullYear()}-${existing._id ? String(existing._id).slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000)}`;

      updatedCert = {
        certificateNumber: autoCertNum,
        preparedDate: currentCert.preparedDate || nowIso,
        printedDate: currentCert.printedDate || nowIso,
        signedBy: signatoryName,
        signedDate: currentCert.signedDate || nowIso,
        sentToCustomerDate: nowIso,
        deliveryMethod: (deliveryMethod || '').trim() || 'Email & Physical Dispatch',
        deliveredBy: managerName
      };

      newStatus = 'completed';
      noteText = `Full certificate lifecycle completed for ${autoCertNum} (Signed by ${signatoryName}).`;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Invalid action "${requestedStep}". Permitted steps: prepare, print, sign, sent_to_customer.`
        })
      };
    }

    const historyEntry = {
      status: newStatus,
      timestamp: nowIso,
      actor: managerName,
      note: noteText
    };

    const allHistoryEntries = [...intermediateHistory, historyEntry];

    const updateFields = {
      certificate: updatedCert,
      status: newStatus,
      statusChangedAt: nowIso
    };

    if (connection.isMongoAtlas) {
      await collection.updateOne(filter, {
        $set: updateFields,
        $push: { statusHistory: { $each: allHistoryEntries } }
      });

      // Synchronize linked registration if exists
      const linkedRegId = existing.linkedRegistrationId || existing.registrationReferenceId;
      if (linkedRegId) {
        await collection.updateOne(buildMongoIdFilter(linkedRegId), {
          $set: updateFields,
          $push: { statusHistory: { $each: allHistoryEntries } }
        });
      }
    } else {
      for (const h of allHistoryEntries) {
        await connection.updateEvaluation(id, updateFields, h);
      }
    }

    recordStatusEvent({
      evaluationId: id,
      companyName: existing.companyName,
      deviceModel: existing.deviceModel,
      oldStatus,
      newStatus,
      actor: managerName,
      note: noteText
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: noteText,
        status: newStatus,
        certificate: updatedCert
      })
    };
  } catch (error) {
    console.error('[ISSUE-CERTIFICATE-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error processing certificate action.' })
    };
  }
};

export default { handler };

