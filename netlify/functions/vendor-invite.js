/**
 * Netlify Serverless Function: vendor-invite
 * Manager-initiated vendor account invitation and one-time setup link provisioning.
 *
 * Requirements:
 * - Generates a secure one-time setup-link token tied to a specific registration record.
 * - No raw password is ever transmitted by the manager or across the network.
 * - Vendors use the setup link to choose and set their own password securely.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  connectToDatabase,
  findVendorByEmail,
  createVendorRecord,
  updateVendorRecord,
  buildMongoIdFilter,
  COLLECTION_NAME,
  COLLECTION_VENDORS
} from './db.js';
import { validateRole, generateToken, ROLE_MANAGER, ROLE_VENDOR, authErrorResponse } from './auth.js';

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

  // Handle GET for setup token validation
  if (event.httpMethod === 'GET') {
    const setupToken = (event.queryStringParameters?.setupToken || '').trim();
    if (!setupToken) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Setup token parameter is required.' })
      };
    }

    try {
      const connection = await connectToDatabase();
      const vendor = await findVendorBySetupToken(connection, setupToken);
      if (!vendor) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Invalid or expired setup link token.' })
        };
      }

      if (vendor.setupTokenExpiresAt && new Date() > new Date(vendor.setupTokenExpiresAt)) {
        return {
          statusCode: 410,
          headers,
          body: JSON.stringify({ success: false, error: 'Setup link has expired. Please request a new invitation.' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          companyName: vendor.companyName,
          email: vendor.contactEmail
        })
      };
    } catch (err) {
      console.error('[VENDOR-INVITE-VERIFY-ERROR]', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Internal server error validating setup token.' })
      };
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed.' })
    };
  }

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

  // 1. Completion Flow (Vendor sets their own password using setupToken)
  if (body.action === 'complete_setup') {
    const { setupToken, password } = body;
    if (!setupToken || !password || password.trim().length < 6) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Setup token and a password of at least 6 characters are required.' })
      };
    }

    try {
      const connection = await connectToDatabase();
      const vendor = await findVendorBySetupToken(connection, setupToken.trim());
      if (!vendor) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Invalid or expired setup token.' })
        };
      }

      if (vendor.setupTokenExpiresAt && new Date() > new Date(vendor.setupTokenExpiresAt)) {
        return {
          statusCode: 410,
          headers,
          body: JSON.stringify({ success: false, error: 'Setup link has expired. Please request a new invitation.' })
        };
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password.trim(), salt);

      await updateVendorRecord(connection, vendor._id, {
        passwordHash,
        setupToken: null,
        setupTokenExpiresAt: null,
        isActive: true,
        setupCompletedAt: new Date().toISOString()
      });

      const linkedRegistrationIds = Array.isArray(vendor.linkedRegistrationIds) ? vendor.linkedRegistrationIds.map(String) : [];

      const tokenPayload = {
        vendorId: String(vendor._id),
        email: vendor.contactEmail,
        companyName: vendor.companyName,
        role: ROLE_VENDOR,
        linkedRegistrationIds
      };
      const token = generateToken(tokenPayload, '24h');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Password set successfully. Welcome to your Vendor Portal!',
          token,
          role: ROLE_VENDOR,
          redirectUrl: '/vendor-portal.html',
          vendor: {
            id: String(vendor._id),
            email: vendor.contactEmail,
            companyName: vendor.companyName,
            role: ROLE_VENDOR
          }
        })
      };
    } catch (err) {
      console.error('[VENDOR-COMPLETE-SETUP-ERROR]', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Error completing account setup.' })
      };
    }
  }

  // 2. Manager-Initiated Invite Flow
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const managerName = roleCheck.user?.name || 'Operations Manager';

  try {
    const {
      evaluationId,
      registrationId,
      contactEmail,
      companyName,
      contactPhone = ''
    } = body;
    const targetId = evaluationId || registrationId;

    if (!contactEmail || !contactEmail.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Vendor contact email address is required.' })
      };
    }

    const cleanEmail = contactEmail.trim().toLowerCase();
    const cleanCompany = (companyName || '').trim();

    const connection = await connectToDatabase();

    // Verify evaluation exists if targetId passed
    let evaluation = null;
    if (targetId) {
      if (connection.isMongoAtlas) {
        evaluation = await connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(targetId));
      } else {
        evaluation = await connection.getEvaluationById(targetId);
      }
    }

    const finalCompanyName = cleanCompany || evaluation?.companyName || 'Registered Vendor';
    const existingVendor = await findVendorByEmail(connection, cleanEmail);

    // Generate secure one-time setup-link token (no raw password ever transmitted)
    const setupToken = crypto.randomBytes(24).toString('hex');
    const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Determine public origin for full setup URL
    const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'localhost:3000';
    const proto = event.headers?.['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const fullSetupUrl = `${proto}://${host}/login.html?setupToken=${setupToken}`;

    if (existingVendor) {
      const linked = Array.isArray(existingVendor.linkedRegistrationIds) ? [...existingVendor.linkedRegistrationIds] : [];
      if (targetId && !linked.includes(String(targetId))) {
        linked.push(String(targetId));
      }

      await updateVendorRecord(connection, existingVendor._id, {
        companyName: finalCompanyName,
        linkedRegistrationIds: linked,
        setupToken,
        setupTokenExpiresAt,
        isActive: true,
        lastInvitedAt: new Date().toISOString(),
        lastInvitedBy: managerName
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Generated invitation setup link for ${cleanEmail}.`,
          isExistingAccount: true,
          setupToken,
          setupLink: `/login.html?setupToken=${setupToken}`,
          fullSetupUrl,
          vendor: {
            email: cleanEmail,
            companyName: finalCompanyName,
            linkedRegistrationIds: linked
          }
        })
      };
    }

    // Create fresh vendor record with setupToken and no password
    const newVendorDoc = {
      companyName: finalCompanyName,
      contactEmail: cleanEmail,
      contactPhone: contactPhone.trim(),
      passwordHash: null,
      setupToken,
      setupTokenExpiresAt,
      linkedRegistrationIds: targetId ? [String(targetId)] : [],
      isActive: true,
      invitedBy: managerName,
      invitedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const created = await createVendorRecord(connection, newVendorDoc);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Vendor account created and setup link generated for ${cleanEmail}.`,
        isExistingAccount: false,
        setupToken,
        setupLink: `/login.html?setupToken=${setupToken}`,
        fullSetupUrl,
        vendor: {
          id: String(created._id),
          email: cleanEmail,
          companyName: finalCompanyName,
          linkedRegistrationIds: newVendorDoc.linkedRegistrationIds
        }
      })
    };
  } catch (error) {
    console.error('[VENDOR-INVITE-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error creating vendor invitation.' })
    };
  }
};

async function findVendorBySetupToken(connection, setupToken) {
  if (!setupToken) return null;
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VENDORS).findOne({ setupToken });
  }
  const all = await connection.getVendors();
  return all.find(v => v.setupToken === setupToken) || null;
}

export default { handler };
