/**
 * Netlify Serverless Function: login
 * Unified authentication endpoint for:
 * - Managers (redirects to /dashboard.html)
 * - Assessors (redirects to /index.html)
 * - External Vendors (redirects to /vendor-portal.html)
 *
 * Issues signed JWT bearer tokens for secure, session-less authorization.
 */

import bcrypt from 'bcryptjs';
import { connectToDatabase, findUserByEmail, findVendorByEmail } from './db.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from './auth.js';

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

    const cleanInput = String(email || '').trim();
    const cleanEmail = cleanInput.toLowerCase();
    const cleanPassword = String(password || '').trim();

    const connection = await connectToDatabase();

    // 1. Check internal users (Manager or Assessor by Email or Assessor ID)
    const user = await findUserByEmail(connection, cleanInput);
    if (user && user.passwordHash) {
      const isMatch = bcrypt.compareSync(cleanPassword, user.passwordHash);

      if (isMatch) {
        const payload = {
          userId: user._id,
          email: user.email,
          name: user.name || 'User',
          role: user.role || ROLE_ASSESSOR,
          assessorId: user.assessorId || null
        };
        const token = generateToken(payload, '24h');
        const redirectUrl = user.role === ROLE_MANAGER ? '/dashboard.html' : '/index.html';

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            token,
            role: user.role,
            redirectUrl,
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
              role: user.role,
              assessorId: user.assessorId || null
            }
          })
        };
      }
    }

    // 2. Check external vendors
    const vendor = await findVendorByEmail(connection, cleanEmail);
    if (vendor && vendor.passwordHash) {
      const isMatch = bcrypt.compareSync(cleanPassword, vendor.passwordHash);

      if (isMatch) {
        if (vendor.isActive === false) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: 'Vendor account has been deactivated. Please contact TrackScore admin.' })
          };
        }

        const payload = {
          vendorId: vendor._id,
          email: vendor.contactEmail,
          companyName: vendor.companyName,
          role: ROLE_VENDOR,
          linkedRegistrationIds: vendor.linkedRegistrationIds || []
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
            user: {
              id: vendor._id,
              email: vendor.contactEmail,
              companyName: vendor.companyName,
              role: ROLE_VENDOR,
              linkedRegistrationIds: vendor.linkedRegistrationIds || []
            }
          })
        };
      }
    }

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid email address or password. Please try again.' })
    };
  } catch (error) {
    console.error('[AUTH-LOGIN-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Internal server authentication error' })
    };
  }
};

export default { handler };
