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
import crypto from 'crypto';
import { connectToDatabase, findUserByEmail, findVendorByEmail } from './db.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from './auth.js';

// In-memory sliding window rate limiter for failed login attempts per client IP
// Map<ipHash, Array<timestampMs>>
const failedLoginMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS_PER_WINDOW = 10;

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ipHash, timestamps] of failedLoginMap.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      failedLoginMap.delete(ipHash);
    } else {
      failedLoginMap.set(ipHash, valid);
    }
  }
}, 5 * 60 * 1000).unref();

function getClientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return headers['client-ip'] || headers['x-real-ip'] || '127.0.0.1';
}

function recordFailedAttempt(clientIp) {
  const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex');
  const now = Date.now();
  const timestamps = failedLoginMap.get(ipHash) || [];
  const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  valid.push(now);
  failedLoginMap.set(ipHash, valid);
}

function clearFailedAttempts(clientIp) {
  const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex');
  failedLoginMap.delete(ipHash);
}

function isRateLimited(clientIp) {
  const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex');
  const timestamps = failedLoginMap.get(ipHash) || [];
  const now = Date.now();
  const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  return valid.length >= MAX_FAILED_ATTEMPTS_PER_WINDOW;
}

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

  const clientIp = getClientIp(event);

  // Check rate limit on failed attempts
  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Too many failed sign-in attempts. For security reasons, please wait 15 minutes before trying again.'
      })
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
      const isMatch = bcrypt.compareSync(cleanPassword, user.passwordHash) ||
                      bcrypt.compareSync(String(password || ''), user.passwordHash);

      if (isMatch) {
        clearFailedAttempts(clientIp);
        const mustChange = user.mustChangePassword === true;
        const payload = {
          userId: user._id,
          email: user.email,
          name: user.name || 'User',
          role: user.role || ROLE_ASSESSOR,
          assessorId: user.assessorId || null,
          mustChangePassword: mustChange
        };
        const token = generateToken(payload, '24h');
        const defaultRedirect = user.role === ROLE_MANAGER ? '/dashboard.html' : '/index.html';
        const redirectUrl = mustChange ? '/change-password.html' : defaultRedirect;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            token,
            role: user.role,
            mustChangePassword: mustChange,
            redirectUrl,
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
              role: user.role,
              assessorId: user.assessorId || null,
              mustChangePassword: mustChange
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

        clearFailedAttempts(clientIp);
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

    // Constant dummy bcrypt compare to normalize response timing against user enumeration
    // when account doesn't exist
    if (!user && !vendor) {
      bcrypt.compareSync(cleanPassword, '$2a$10$e8w.y8GgO0V8V.Zk1c2Tte9J7iM8N6Z2Zk6A0p8p5k4r2m1t0l8hG');
    }

    // Record failure against IP rate limiter
    recordFailedAttempt(clientIp);

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
