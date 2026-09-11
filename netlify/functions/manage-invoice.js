/**
 * Netlify Serverless Function: manage-invoice
 * Manager action to confirm package and log invoice details on a registered/scheduled record.
 * Tracks invoice sub-object: { invoiceNumber, amount, issuedDate, dueDate }.
 * Does NOT move status forward past "scheduled".
 */

import { connectToDatabase, COLLECTION_NAME, buildMongoIdFilter } from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { getPackageDetails } from './packages.js';
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

    const { id, companyName } = body;
    if (!id && !companyName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Record ID or Company Name is required.' })
      };
    }

    const connection = await connectToDatabase();
    let existing = null;
    let collection = null;
    let filter = null;

    if (connection.isMongoAtlas) {
      collection = connection.db.collection(COLLECTION_NAME);
      if (id) {
        filter = buildMongoIdFilter(id);
        existing = await collection.findOne(filter);
      }
      if (!existing && companyName) {
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter = {
          companyName: { $regex: new RegExp(`^${escapeRegex(companyName.trim())}$`, 'i') },
          deletedAt: null
        };
        existing = await collection.findOne(filter);
      }
    } else {
      if (id) {
        existing = await connection.getEvaluationById(id);
      }
      if (!existing && companyName) {
        const all = await connection.getEvaluations();
        existing = all.find(r =>
          String(r.companyName || '').toLowerCase() === companyName.trim().toLowerCase() &&
          !r.deletedAt
        );
      }
    }

    if (!existing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Evaluation or customer registration record not found.' })
      };
    }

    const recordId = String(existing._id || id);

    // Resolve confirmed package
    const packageKey = body.package || body.requestedPackage || body.packageName || existing.package || existing.requestedPackage || 'package_1';
    const packageInfo = getPackageDetails(packageKey);

    // Resolve invoice sub-object fields
    const nowIso = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    const defaultSeq = Math.floor(1000 + Math.random() * 9000);
    const defaultInvNumber = `INV-${currentYear}-${defaultSeq}`;

    const rawInvoice = body.invoice || {};
    const invoiceNumber = String(rawInvoice.invoiceNumber || body.invoiceNumber || existing.invoice?.invoiceNumber || defaultInvNumber).trim();
    const amount = Number(rawInvoice.amount ?? body.amount ?? existing.invoice?.amount ?? packageInfo.price);
    
    // Default dates if missing
    const todayStr = nowIso.split('T')[0];
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + 14);
    const defaultDueDateStr = dueDateObj.toISOString().split('T')[0];

    const issuedDate = String(rawInvoice.issuedDate || body.issuedDate || existing.invoice?.issuedDate || todayStr).trim();
    const dueDate = String(rawInvoice.dueDate || body.dueDate || existing.invoice?.dueDate || defaultDueDateStr).trim();

    const invoiceSubObject = {
      invoiceNumber,
      amount,
      issuedDate,
      dueDate,
      status: 'confirmed',
      isConfirmed: true,
      isDraftStub: false,
      confirmedAt: nowIso,
      confirmedBy: managerName
    };

    const updateFields = {
      invoice: invoiceSubObject,
      package: packageInfo.id,
      packageName: packageInfo.name,
      requestedPackage: packageInfo.name,
      packageDetails: {
        packageId: packageInfo.id,
        name: packageInfo.name,
        price: packageInfo.price,
        currency: packageInfo.currency,
        formattedPrice: packageInfo.formattedPrice,
        validityYears: packageInfo.validityYears,
        freeReassessments: packageInfo.freeReassessments
      }
    };

    const historyEntry = {
      action: 'invoice_logged',
      status: existing.status || 'registered',
      changedAt: nowIso,
      changedBy: managerName,
      timestamp: nowIso,
      actor: managerName,
      note: `Package confirmed: ${packageInfo.name}. Official Invoice ${invoiceNumber} (RM ${amount.toLocaleString()}) confirmed & finalized by manager. Due date: ${dueDate}.`
    };

    if (connection.isMongoAtlas) {
      await collection.updateOne({ _id: existing._id }, {
        $set: updateFields,
        $push: { statusHistory: historyEntry }
      });
    } else {
      await connection.updateEvaluation(recordId, updateFields, historyEntry);
    }

    recordStatusEvent({
      evaluationId: recordId,
      companyName: existing.companyName,
      deviceModel: existing.deviceModel,
      oldStatus: existing.status,
      newStatus: existing.status,
      actor: managerName,
      note: `Invoice ${invoiceNumber} logged for ${packageInfo.name}`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: recordId,
        message: `Package confirmed as ${packageInfo.name} and invoice ${invoiceNumber} logged.`,
        invoice: invoiceSubObject,
        package: packageInfo,
        status: existing.status
      })
    };
  } catch (error) {
    console.error('[MANAGE-INVOICE-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error updating invoice details.' })
    };
  }
};

export default { handler };
