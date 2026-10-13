import crypto from 'node:crypto';
import {secureHandler, logSecurityFailure} from './security.js';
/**
 * Netlify Serverless Function: register-customer
 * Allows Managers to register a new customer/device before formal assessment.
 * Features:
 * - Selects Package 1 (RM 4,500) or Package 2 (RM 6,000)
 * - Auto-generates initial Invoice stub
 * - Sets initial status: 'registered'
 * - Initializes SLA duration and target deadline based on selected package
 * - Optionally provisions or links an external Vendor account (Manager-initiated Option B)
 * - Emits real-time status event to SSE stream
 */

import bcrypt from 'bcryptjs';
import {
  connectToDatabase,
  findVendorByEmail,
  createVendorRecord,
  updateVendorRecord,
  COLLECTION_NAME,
  buildMongoIdFilter
} from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';
import { getPackageDetails } from './packages.js';
import { recordStatusEvent } from './status-bus.js';
import { computeSlaDeadline, calculateAssessmentSla } from './sla.js';

const rawHandler = async (event) => {
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
      officeAddress = '',
      state = '',
      deviceModel = '',
      requestedPackage,
      package: selectedPackageId,
      contactPerson = '',
      contactEmail = '',
      contactPhone = '',
      scheduledDate = '',
      assignedAssessor = '',
      assignedAssessorId = '',
      assignedAssessorName = '',
      assignedAssessorEmail = '',
      notes = '',
      inviteVendor = false,
      vendorPassword = '',
      slaDays,
      slaDurationDays,
      customSlaDays
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

    // SLA Initialization
    const effectiveSlaDays = Number(slaDays || slaDurationDays || customSlaDays) || packageInfo.slaDays || 7;
    const slaStartAt = nowIso;
    const slaDeadline = computeSlaDeadline({ package: packageKey }, slaStartAt, effectiveSlaDays);

    const registrationDoc = {
      recordType: 'registration',
      companyName: companyName.trim(),
      officeAddress: officeAddress.trim(),
      state: state.trim(),
      deviceModel: deviceModel.trim(),
      contactPerson: contactPerson.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      package: packageInfo.id,
      packageName: packageInfo.name,
      packageDetails: {
        packageId: packageInfo.id,
        name: packageInfo.name,
        price: packageInfo.price,
        currency: packageInfo.currency,
        formattedPrice: packageInfo.formattedPrice,
        validityYears: packageInfo.validityYears,
        freeReassessments: packageInfo.freeReassessments,
        slaDays: effectiveSlaDays
      },
      scheduledDate: scheduledDate ? scheduledDate.trim() : null,
      notes: notes.trim(),
      status: scheduledDate ? 'scheduled' : 'registered',
      statusChangedAt: nowIso,
      slaStartAt,
      slaDeadline,
      slaDurationDays: effectiveSlaDays,
      invoice: {
        invoiceNumber,
        amount: packageInfo.price,
        issuedDate: issuedDateStr,
        dueDate: dueDateStr,
        status: 'draft',
        isConfirmed: false,
        isDraftStub: true
      },
      statusHistory: [
        {
          status: 'registered',
          changedAt: nowIso,
          changedBy: managerName,
          timestamp: nowIso,
          actor: managerName,
          note: `Customer registered for ${packageInfo.name} (SLA: ${effectiveSlaDays} days, Deadline: ${new Date(slaDeadline).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}). Draft invoice stub ${invoiceNumber} generated.`
        }
      ],
      createdAt: nowIso
    };

    const chosenAssessor = (assignedAssessorName || assignedAssessor || '').trim();
    if (chosenAssessor) {
      registrationDoc.assignedAssessor = chosenAssessor;
      registrationDoc.assignedAssessorName = chosenAssessor;
      registrationDoc.assignedAssessorId = (assignedAssessorId || '').trim();
      registrationDoc.assignedAssessorEmail = (assignedAssessorEmail || '').trim();
      registrationDoc.assignedAt = nowIso;
      registrationDoc.assignedBy = managerName;
      if (scheduledDate) {
        registrationDoc.status = 'scheduled';
      }
    }

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

    // Check for an existing evaluation first using registrationId/evaluationId OR case-insensitive companyName + deviceModel
    let existingDoc = null;
    const targetLookupId = (body.registrationId || body.evaluationId || body.id || '').trim();
    if (connection.isMongoAtlas) {
      const col = connection.db.collection(COLLECTION_NAME);
      if (targetLookupId) {
        existingDoc = await col.findOne(buildMongoIdFilter(targetLookupId));
      }
      if (!existingDoc && companyName && deviceModel) {
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        existingDoc = await col.findOne({
          companyName: { $regex: new RegExp(`^${escapeRegex(companyName.trim())}$`, 'i') },
          deviceModel: { $regex: new RegExp(`^${escapeRegex(deviceModel.trim())}$`, 'i') },
          status: { $nin: ['approved', 'completed', 'certified'] },
          deletedAt: null
        });
      }
    } else {
      if (targetLookupId) {
        existingDoc = await connection.getEvaluationById(targetLookupId);
      }
      if (!existingDoc && companyName && deviceModel) {
        const all = await connection.getEvaluations();
        existingDoc = all.find(r =>
          String(r.companyName || '').toLowerCase() === companyName.trim().toLowerCase() &&
          String(r.deviceModel || '').toLowerCase() === deviceModel.trim().toLowerCase() &&
          !['approved', 'completed', 'certified'].includes(r.status) &&
          !r.deletedAt
        );
      }
    }

    if (existingDoc) {
      savedId = String(existingDoc._id || existingDoc.id);
      const updateFields = {
        officeAddress: officeAddress.trim() || existingDoc.officeAddress || '',
        state: state.trim() || existingDoc.state || '',
        contactPerson: contactPerson.trim() || existingDoc.contactPerson || '',
        contactEmail: contactEmail.trim() || existingDoc.contactEmail || '',
        contactPhone: contactPhone.trim() || existingDoc.contactPhone || '',
        package: packageInfo.id,
        packageName: packageInfo.name,
        packageDetails: {
          packageId: packageInfo.id,
          name: packageInfo.name,
          price: packageInfo.price,
          currency: packageInfo.currency,
          formattedPrice: packageInfo.formattedPrice,
          validityYears: packageInfo.validityYears,
          freeReassessments: packageInfo.freeReassessments,
          slaDays: effectiveSlaDays
        },
        notes: notes.trim() || existingDoc.notes || '',
        linkedRegistrationId: savedId,
        registrationReferenceId: savedId,
        updatedAt: nowIso
      };

      if (scheduledDate) {
        updateFields.scheduledDate = scheduledDate.trim();
        updateFields.scheduledAt = nowIso;
        updateFields.scheduledBy = managerName;
      }
      if (chosenAssessor) {
        updateFields.assignedAssessor = chosenAssessor;
        updateFields.assignedAssessorName = chosenAssessor;
        updateFields.assignedAssessorId = (assignedAssessorId || '').trim();
        updateFields.assignedAssessorEmail = (assignedAssessorEmail || '').trim();
        updateFields.assignedAt = nowIso;
        updateFields.assignedBy = managerName;
      }

      // Preserve existing invoice if already confirmed; otherwise set draft stub
      if (!existingDoc.invoice || existingDoc.invoice.isDraftStub) {
        updateFields.invoice = { ...existingDoc.invoice, ...registrationDoc.invoice };
      }
      const mergedStatusHistory = Array.isArray(existingDoc.statusHistory) ? [...existingDoc.statusHistory] : [];
      mergedStatusHistory.push({
        status: existingDoc.status || 'registered',
        changedAt: nowIso,
        changedBy: managerName,
        timestamp: nowIso,
        actor: managerName,
        note: `Registration data linked and synchronized with package ${packageInfo.name}.`
      });
      updateFields.statusHistory = mergedStatusHistory;

      if (connection.isMongoAtlas) {
        const col = connection.db.collection(COLLECTION_NAME);
        await col.updateOne(buildMongoIdFilter(savedId), { $set: updateFields });
      } else {
        await connection.updateEvaluation(savedId, updateFields);
      }
      registrationDoc._id = savedId;
    } else {
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
    }

    // Manager-Initiated Option B: Explicit Vendor Account Provisioning
    let vendorAccountCreated = false;
    let vendorCredentials = null;

    if (inviteVendor && contactEmail && contactEmail.trim()) {
      const cleanVendorEmail = contactEmail.trim().toLowerCase();
      const existingVendor = await findVendorByEmail(connection, cleanVendorEmail);

      const generatedPassword = vendorPassword && vendorPassword.trim().length >= 8
        ? vendorPassword.trim()
        : `Vendor-${crypto.randomBytes(16).toString('base64url')}!`;

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(generatedPassword, salt);

      if (existingVendor) {
        // Link new registration ID
        const linked = Array.isArray(existingVendor.linkedRegistrationIds) ? [...existingVendor.linkedRegistrationIds] : [];
        if (!linked.includes(savedId)) {
          linked.push(savedId);
          await updateVendorRecord(connection, existingVendor._id, {
            linkedRegistrationIds: linked,
            isActive: true
          });
        }
        vendorAccountCreated = false;
        vendorCredentials = {
          email: existingVendor.loginEmail || existingVendor.contactEmail,
          password: '(existing password preserved)',
          isExisting: true
        };
      } else {
        const vendorDoc = {
          companyName: companyName.trim(),
          contactEmail: cleanVendorEmail,
          loginEmail: cleanVendorEmail,
          contactPhone: contactPhone.trim(),
          passwordHash,
          linkedRegistrationIds: [savedId],
          isActive: true,
          invitedBy: managerName,
          invitedAt: nowIso,
          createdAt: nowIso
        };
        const createdVendor = await createVendorRecord(connection, vendorDoc);
        vendorAccountCreated = true;
        vendorCredentials = {
          email: cleanVendorEmail,
          password: generatedPassword,
          isExisting: false,
          vendorId: String(createdVendor._id)
        };
      }
    }

    const slaSnapshot = calculateAssessmentSla(registrationDoc);
    registrationDoc.sla = slaSnapshot;

    // Emit real-time status event
    recordStatusEvent({
      evaluationId: savedId,
      id: savedId,
      companyName: registrationDoc.companyName,
      deviceModel: registrationDoc.deviceModel,
      packageName: registrationDoc.packageName,
      assessorId: registrationDoc.assignedAssessorId || undefined,
      assessorName: registrationDoc.assignedAssessor || undefined,
      assignedAssessor: registrationDoc.assignedAssessor || undefined,
      assignedAssessorId: registrationDoc.assignedAssessorId || undefined,
      assignedAssessorEmail: registrationDoc.assignedAssessorEmail || undefined,
      oldStatus: null,
      newStatus: registrationDoc.status,
      status: registrationDoc.status,
      eventType: registrationDoc.assignedAssessor ? 'ASSIGNMENT' : 'REGISTRATION',
      scheduledDate: registrationDoc.scheduledDate || null,
      actor: managerName,
      assignedBy: registrationDoc.assignedAssessor ? managerName : null,
      assignedAt: registrationDoc.assignedAssessor ? nowIso : null,
      slaDeadline,
      slaDurationDays: effectiveSlaDays,
      slaStatus: slaSnapshot.status,
      note: registrationDoc.assignedAssessor
        ? `New assessment assigned: ${registrationDoc.companyName} (${registrationDoc.deviceModel || 'Unspecified'}) assigned to ${registrationDoc.assignedAssessor} - Target SLA: ${effectiveSlaDays} days`
        : `New customer registered (${registrationDoc.packageName}) - Target SLA: ${effectiveSlaDays} days`
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
        sla: slaSnapshot,
        message: `Customer ${registrationDoc.companyName} registered successfully.`,
        vendorAccountCreated,
        vendorCredentials
      })
    };
  } catch (error) {
    logSecurityFailure('register-customer');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Error registering customer.' })
    };
  }
};

export const handler = secureHandler(rawHandler, 'register-customer');

export default { handler };
