import {secureHandler, logSecurityFailure} from './security.js';
/**
 * Netlify Serverless Function: vendor-profile
 * Secure Profile & Password Management for Vendor Self-Service Portal
 *
 * Security Guarantees:
 * - Requires valid JWT with role: 'vendor'
 * - Vendors can only view and update their own profile (identified from JWT)
 * - Protected fields cannot be changed by vendor: role, email, loginEmail, linkedRegistrationIds, isActive
 * - Secure password change with current password verification, bcrypt hashing, and complexity checks
 */

import bcrypt from 'bcryptjs';
import {
  connectToDatabase,
  findVendorById,
  findVendorByEmail,
  updateVendorRecord
} from './db.js';
import { verifyToken, getBearerToken, ROLE_VENDOR } from './auth.js';

const rawHandler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // 1. Authenticate Vendor JWT
  const token = getBearerToken(event);
  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Unauthorized: Missing Authorization Bearer token.' })
    };
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== ROLE_VENDOR) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: 'Forbidden: Access restricted to authorized vendor accounts.' })
    };
  }

  try {
    const connection = await connectToDatabase();

    // 2. Fetch authoritative vendor account
    let vendor = null;
    if (decoded.vendorId) {
      vendor = await findVendorById(connection, decoded.vendorId);
    }
    if (!vendor && decoded.email) {
      vendor = await findVendorByEmail(connection, decoded.email);
    }

    if (!vendor || vendor.isActive === false) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: 'Vendor account not found or deactivated.' })
      };
    }

    const vendorId = vendor._id;

    // =========================================================================
    // GET: Retrieve Profile
    // =========================================================================
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          vendor: {
            id: String(vendor._id),
            companyName: vendor.companyName,
            contactEmail: vendor.contactEmail,
            loginEmail: vendor.loginEmail || vendor.contactEmail,
            contactPhone: vendor.contactPhone || '',
            contactPerson: vendor.contactPerson || '',
            officeAddress: vendor.officeAddress || '',
            state: vendor.state || '',
            registrationNumber: vendor.registrationNumber || '',
            createdAt: vendor.createdAt,
            linkedEvaluationsCount: Array.isArray(vendor.linkedRegistrationIds) ? vendor.linkedRegistrationIds.length : 0
          }
        })
      };
    }

    // =========================================================================
    // POST / PUT: Update Profile or Change Password
    // =========================================================================
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

    const action = String(body.action || 'update_profile').toLowerCase();

    // -------------------------------------------------------------------------
    // Password Change Flow
    // -------------------------------------------------------------------------
    if (action === 'change_password') {
      const currentPassword = String(body.currentPassword || '').trim();
      const newPassword = String(body.newPassword || '').trim();
      const confirmPassword = String(body.confirmPassword || '').trim();

      if (!currentPassword || !newPassword) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Current password and new password are required.' })
        };
      }

      if (newPassword.length < 8) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'New password must be at least 8 characters long.' })
        };
      }

      if (confirmPassword && newPassword !== confirmPassword) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'New password and confirmation do not match.' })
        };
      }

      if (!vendor.passwordHash || !bcrypt.compareSync(currentPassword, vendor.passwordHash)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Current password does not match. Please verify and try again.' })
        };
      }

      const salt = bcrypt.genSaltSync(10);
      const newHash = bcrypt.hashSync(newPassword, salt);
      const nowIso = new Date().toISOString();

      await updateVendorRecord(connection, vendorId, {
        passwordHash: newHash,
        passwordUpdatedAt: nowIso
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Password changed successfully. Please use your new password for future sign-ins.'
        })
      };
    }

    // -------------------------------------------------------------------------
    // Update Profile Flow
    // -------------------------------------------------------------------------
    const allowedUpdates = {};
    if (body.contactPhone !== undefined) allowedUpdates.contactPhone = String(body.contactPhone).trim();
    if (body.contactPerson !== undefined) allowedUpdates.contactPerson = String(body.contactPerson).trim();
    if (body.officeAddress !== undefined) allowedUpdates.officeAddress = String(body.officeAddress).trim();
    if (body.state !== undefined) allowedUpdates.state = String(body.state).trim();
    if (body.registrationNumber !== undefined) allowedUpdates.registrationNumber = String(body.registrationNumber).trim();

    allowedUpdates.updatedAt = new Date().toISOString();

    const updated = await updateVendorRecord(connection, vendorId, allowedUpdates);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Profile updated successfully.',
        vendor: {
          id: String(updated._id),
          companyName: updated.companyName,
          contactEmail: updated.contactEmail,
          loginEmail: updated.loginEmail || updated.contactEmail,
          contactPhone: updated.contactPhone || '',
          contactPerson: updated.contactPerson || '',
          officeAddress: updated.officeAddress || '',
          state: updated.state || '',
          registrationNumber: updated.registrationNumber || '',
          updatedAt: updated.updatedAt
        }
      })
    };
  } catch (error) {
    logSecurityFailure('vendor-profile');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error processing profile request.' })
    };
  }
};

export const handler = secureHandler(rawHandler, 'vendor-profile');

export default { handler };
