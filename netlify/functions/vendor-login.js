/**
 * Netlify Serverless Function: vendor-login
 * Dedicated vendor authentication endpoint issuing a signed JWT with role: "vendor".
 *
 * Validates vendor credentials against the `vendors` collection:
 * - Implements sliding-window IP rate limiting (10 attempts per 15 minutes)
 * - Timing-attack normalized response against vendor account enumeration
 * - Rejects inactive vendor accounts with 403
 * - Issues JWT containing vendorId, contactEmail, companyName, role: "vendor", and linkedRegistrationIds
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { connectToDatabase, findVendorByEmail } from './db.js';
import { generateToken, ROLE_VENDOR } from './auth.js';

// In-memory sliding window rate limiter for failed login attempts per client IP
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

  const clientIp = getClientIp(event);

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

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const connection = await connectToDatabase();
    const vendor = await findVendorByEmail(connection, cleanEmail);

    if (!vendor || !vendor.passwordHash) {
      // Normalize timing to prevent vendor enumeration
      bcrypt.compareSync(cleanPassword, '$2a$10$e8w.y8GgO0V8V.Zk1c2Tte9J7iM8N6Z2Zk6A0p8p5k4r2m1t0l8hG');
      recordFailedAttempt(clientIp);
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
      recordFailedAttempt(clientIp);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid vendor email or password.' })
      };
    }

    clearFailedAttempts(clientIp);

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
      body: JSON.stringify({ success: false, error: 'Internal Server Error during vendor sign-in.' })
    };
  }
};

export default { handler };
