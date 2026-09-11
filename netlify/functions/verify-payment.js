/**
 * Netlify Serverless Function: verify-payment
 * Allows managers to verify customer payment for the selected telematics package.
 * Moves status to: 'payment_confirmed'
 * Updates invoice and payment sub-documents.
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
      amountReceived,
      paymentMethod = 'Bank Transfer / DuitNow',
      referenceNumber = '',
      paymentDate = '',
      notes = '',
      override = false,
      isOverride = false,
      overrideReason = '',
      reason = '',
      skipPreFinal = false
    } = body;

    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Record ID is required.' })
      };
    }

    const hasOverride = Boolean(override || isOverride);
    const cleanOverrideReason = (overrideReason || reason || notes || '').trim();

    if (hasOverride && !cleanOverrideReason) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Manager override requires a mandatory justification reason field.'
        })
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

    // 1. Manager Override or Normal Flow Status Guard
    if (!hasOverride) {
      // 2. Normal Flow: Enforce lifecycle status prerequisite
      // Must currently be at pre_final_sent (or pending_review if pre-final was skipped)
      const curStatus = (existing.status || 'pending_review').toLowerCase();
      const isPreFinalSent = curStatus === 'pre_final_sent';
      const isPendingSkipped = (curStatus === 'pending_review' || curStatus === 'submitted') &&
        (existing.preFinalSkipped === true || existing.preFinalResult?.isSkipped === true || Boolean(skipPreFinal));

      if (!isPreFinalSent && !isPendingSkipped) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Cannot verify payment. Record must currently be at "pre_final_sent" (or "pending_review" if the pre-final stage was skipped). Current status is "${existing.status}".`
          })
        };
      }
    }

    const defaultAmount = existing.invoice?.amount || existing.packageDetails?.price || 4500;
    const parsedAmount = amountReceived !== undefined && amountReceived !== null && amountReceived !== ''
      ? parseFloat(amountReceived)
      : defaultAmount;

    if (!hasOverride && (isNaN(parsedAmount) || parsedAmount <= 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Valid positive amount received is required for payment verification.' })
      };
    }

    const nowIso = new Date().toISOString();
    const oldStatus = existing.status || 'pending_review';
    const newStatus = 'payment_confirmed';
    const payDate = paymentDate ? new Date(paymentDate).toISOString() : nowIso;

    // Payment sub-object: { status: "unpaid" | "invoiced" | "paid", amountReceived, paymentDate, paymentMethod, verifiedBy }
    const paymentDoc = hasOverride ? {
      status: body.paymentStatus || existing.payment?.status || (existing.invoice && !existing.invoice.isDraftStub ? 'invoiced' : 'unpaid'),
      amountReceived: isNaN(parsedAmount) ? 0 : parsedAmount,
      paymentDate: paymentDate ? new Date(paymentDate).toISOString() : null,
      paymentMethod: paymentMethod.trim() || 'Manager Override Waiver',
      verifiedBy: managerName,
      overridden: true,
      overrideReason: cleanOverrideReason,
      overriddenAt: nowIso,
      referenceNumber: referenceNumber.trim(),
      notes: notes.trim()
    } : {
      status: 'paid',
      amountReceived: parsedAmount,
      currency: 'MYR',
      paymentDate: payDate,
      paymentMethod: paymentMethod.trim() || 'Bank Transfer / DuitNow',
      verifiedBy: managerName,
      overridden: false,
      referenceNumber: referenceNumber.trim(),
      verifiedAt: nowIso,
      notes: notes.trim()
    };

    const invoiceDoc = existing.invoice ? {
      ...existing.invoice,
      status: hasOverride ? (existing.invoice.status || 'invoiced') : 'paid',
      paidDate: hasOverride ? (existing.invoice.paidDate || null) : payDate,
      isDraftStub: false,
      isConfirmed: true
    } : {
      invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      amount: parsedAmount || 4500,
      status: hasOverride ? 'invoiced' : 'paid',
      paidDate: hasOverride ? null : payDate,
      isDraftStub: false,
      isConfirmed: true
    };

    const historyEntry = hasOverride ? {
      status: newStatus,
      timestamp: nowIso,
      actor: managerName,
      changedBy: managerName,
      overridden: true,
      overrideReason: cleanOverrideReason,
      note: `Manager override: Force-advanced past payment verification without confirmed payment. Reason: ${cleanOverrideReason}`
    } : {
      status: newStatus,
      timestamp: nowIso,
      actor: managerName,
      changedBy: managerName,
      overridden: false,
      note: `Payment of RM ${parsedAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} verified via ${paymentMethod.trim()}.${referenceNumber ? ` Ref: ${referenceNumber.trim()}.` : ''}`
    };

    const updateFields = {
      status: newStatus,
      statusChangedAt: nowIso,
      payment: paymentDoc,
      invoice: invoiceDoc
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
          $set: updateFields,
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
      note: hasOverride
        ? `Manager override: payment confirmation waived (${cleanOverrideReason})`
        : `Payment verified (RM ${parsedAmount.toLocaleString()})`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Payment of RM ${parsedAmount.toLocaleString()} verified successfully.`,
        status: newStatus,
        payment: paymentDoc,
        invoice: invoiceDoc
      })
    };
  } catch (error) {
    console.error('[VERIFY-PAYMENT-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error verifying payment.' })
    };
  }
};

export default { handler };
