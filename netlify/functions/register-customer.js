/**
 * Netlify Serverless Function: register-customer
 * Allows Managers to register a new customer/device before formal assessment.
 * Features:
 * - Selects Package 1 (RM 4,500) or Package 2 (RM 6,000)
 * - Auto-generates initial Invoice stub
 * - Sets initial status: 'registered'
 * - Optionally provisions or links an external Vendor account (Manager-initiated Option B)
 * - Emits real-time status event to SSE stream
 */

import bcrypt from 'bcryptjs';
import {
  connectToDatabase,
  findVendorByEmail,
  createVendorRecord,
  updateVendorRecord,
  COLLECTION_NAME
} from './db.js';
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

  // Manager privilege check
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
      companyName,
      deviceModel = '',
      requestedPackage,
      package: selectedPackageId,
      contactPerson = '',
      contactEmail = '',
      contactPhone = '',
      scheduledDate = '',
      notes = '',
      inviteVendor = false,
      vendorPassword = ''
    } = body;

    if (!companyName || !companyName.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Company Name is required.' })
      };
    }

    const packageKey = requestedPackage || selectedPackageId || 'package_1';
    const packageInfo = getPackageDetails(packageKey);
    const nowIso = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${currentYear}-${randomSeq}`;

    // Due date: 14 days from registration
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + 14);
    const dueDateStr = dueDateObj.toISOString().split('T')[0];
    const issuedDateStr = nowIso.split('T')[0];

    const cleanModel = deviceModel ? deviceModel.trim() : '';

    const registrationDoc = {
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      requestedPackage: packageInfo.name,
      registeredAt: nowIso,
      registeredBy: managerName,
      deviceModel: cleanModel,
      package: packageInfo.id,
      packageName: packageInfo.name,
      packageDetails: {
        packageId: packageInfo.id,
        name: packageInfo.name,
        price: packageInfo.price,
        currency: packageInfo.currency,
        formattedPrice: packageInfo.formattedPrice,
        validityYears: packageInfo.validityYears,
        freeReassessments: packageInfo.freeReassessments
      },
      scheduledDate: scheduledDate ? scheduledDate.trim() : null,
      notes: notes.trim(),
      status: scheduledDate ? 'scheduled' : 'registered',
      statusChangedAt: nowIso,
      invoice: {
        invoiceNumber,
        amount: packageInfo.price,
        issuedDate: issuedDateStr,
        dueDate: dueDateStr,
        status: 'draft',
        isConfirmed: false,
        isDraftStub: true
      },
      payment: {
        status: 'unpaid',
        amountReceived: 0,
        paymentDate: null,
        paymentMethod: null,
        verifiedBy: null
      },
      statusHistory: [
        {
          status: 'registered',
          changedAt: nowIso,
          changedBy: managerName,
          timestamp: nowIso,
          actor: managerName,
          note: `Customer registered for ${packageInfo.name}. Provisional draft invoice stub ${invoiceNumber} generated for manager review.`
        }
      ],
      createdAt: nowIso
    };

    if (scheduledDate) {
      registrationDoc.scheduledAt = nowIso;
      registrationDoc.scheduledBy = managerName;
      registrationDoc.statusHistory.push({
        status: 'scheduled',
        changedAt: nowIso,
        changedBy: managerName,
        timestamp: nowIso,
        actor: managerName,
        note: `Evaluation scheduled for ${scheduledDate}.`
      });
    }

    const connection = await connectToDatabase();
    let savedId = null;

    if (connection.isMongoAtlas) {
      const col = connection.db.collection(COLLECTION_NAME);
      const res = await col.insertOne(registrationDoc);
      savedId = String(res.insertedId);
      registrationDoc._id = savedId;
    } else {
      const res = await connection.insertEvaluation(registrationDoc);
      savedId = String(res.insertedId);
      registrationDoc._id = savedId;
    }

    // Manager-Initiated Option B: Explicit Vendor Account Provisioning
    let vendorAccountCreated = false;
    let vendorCredentials = null;

    if (inviteVendor && contactEmail && contactEmail.trim()) {
      const cleanVendorEmail = contactEmail.trim().toLowerCase();
      const existingVendor = await findVendorByEmail(connection, cleanVendorEmail);

      const generatedPassword = vendorPassword && vendorPassword.trim().length >= 6
        ? vendorPassword.trim()
        : `Vendor-${Math.random().toString(36).substring(2, 8)}!`;

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(generatedPassword, salt);

      if (existingVendor) {
        // Link new registration ID
        const linked = Array.isArray(existingVendor.linkedRegistrationIds) ? [...existingVendor.linkedRegistrationIds] : [];
        if (!linked.includes(savedId)) {
          linked.push(savedId);
        }
        await updateVendorRecord(connection, existingVendor._id, {
          companyName: companyName.trim(),
          contactPhone: contactPhone.trim() || existingVendor.contactPhone,
          linkedRegistrationIds: linked
        });
        vendorAccountCreated = true;
        vendorCredentials = {
          email: cleanVendorEmail,
          isExistingAccount: true,
          companyName: existingVendor.companyName,
          note: 'Linked new evaluation to existing vendor account.'
        };
      } else {
        // Create new vendor
        const newVendorDoc = {
          companyName: companyName.trim(),
          contactEmail: cleanVendorEmail,
          contactPhone: contactPhone.trim(),
          passwordHash,
          linkedRegistrationIds: [savedId],
          isActive: true,
          createdViaRegistration: true,
          invitedBy: managerName
        };
        const createdVendor = await createVendorRecord(connection, newVendorDoc);
        vendorAccountCreated = true;
        vendorCredentials = {
          email: cleanVendorEmail,
          password: generatedPassword,
          isExistingAccount: false,
          vendorId: createdVendor._id,
          loginUrl: '/login.html'
        };
      }
    }

    // Real-time broadcast
    recordStatusEvent({
      evaluationId: savedId,
      companyName: registrationDoc.companyName,
      deviceModel: registrationDoc.deviceModel,
      oldStatus: null,
      newStatus: registrationDoc.status,
      actor: managerName,
      note: `New customer registered (${registrationDoc.packageName})`
    });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        id: savedId,
        registration: registrationDoc,
        data: registrationDoc,
        record: registrationDoc,
        evaluation: registrationDoc,
        status: registrationDoc.status,
        message: `Customer ${registrationDoc.companyName} registered successfully.`,
        vendorAccountCreated,
        vendorCredentials
      })
    };
  } catch (error) {
    console.error('[REGISTER-CUSTOMER-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error registering customer.' })
    };
  }
};

export default { handler };
