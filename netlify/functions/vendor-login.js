/**
 * Netlify Serverless Function: vendor-login
 * Dedicated vendor authentication endpoint issuing a signed JWT with role: "vendor".
 *
 * Validates vendor credentials against the `vendors` collection:
 * - Rejects inactive vendor accounts with 403
 * - Issues JWT containing vendorId, contactEmail, companyName, role: "vendor", and linkedRegistrationIds
 */

import bcrypt from 'bcryptjs';
import { connectToDatabase, findVendorByEmail } from './db.js';
import { generateToken, ROLE_VENDOR } from './auth.js';

export const handler = async (event) => {
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
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' })
    };
  }

  try {
    let body = {};
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON body.' })
      };
    }

    const { email, password } = body;
    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Email and password are required.' })
      };
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const connection = await connectToDatabase();
    const vendor = await findVendorByEmail(connection, cleanEmail);

    if (!vendor || !vendor.passwordHash) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid vendor email or password.' })
      };
    }

    if (vendor.isActive === false) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: 'Vendor account has been deactivated. Please contact TrackScore admin.' })
      };
    }

    const isMatch = bcrypt.compareSync(cleanPassword, vendor.passwordHash);
    if (!isMatch) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid vendor email or password.' })
      };
    }

    const linkedRegistrationIds = Array.isArray(vendor.linkedRegistrationIds) ? vendor.linkedRegistrationIds.map(String) : [];

    const payload = {
      vendorId: String(vendor._id),
      email: vendor.contactEmail,
      companyName: vendor.companyName,
      role: ROLE_VENDOR,
      linkedRegistrationIds
    };

    const token = generateToken(payload, '24h');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token,
        role: ROLE_VENDOR,
        redirectUrl: '/vendor-portal.html',
        vendor: {
          id: String(vendor._id),
          email: vendor.contactEmail,
          companyName: vendor.companyName,
          role: ROLE_VENDOR,
          linkedRegistrationIds
        }
      })
    };
  } catch (error) {
    console.error('[VENDOR-LOGIN-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Internal Server Error during vendor sign-in.' })
    };
  }
};

export default { handler };
