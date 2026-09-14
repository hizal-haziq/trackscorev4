/**
 * Netlify Serverless Function: submit-inquiry
 * 
 * Public intake endpoint for vendors/clients to submit an assessment inquiry.
 * This is the ONLY unauthenticated endpoint in the TrackScore system.
 * 
 * Abuse Prevention:
 * 1. IP Rate Limiting: Max 5 submissions per IP per 1-hour window.
 * 2. Honeypot check: Hidden field (website_url_hp / hp) must be strictly empty.
 * 3. Strict Server-Side Validation: Pattern checks, required field enforcement, length caps.
 * 4. Write-Only / Zero Data Leakage: Accepts ONLY POST; never lists, reads, or enumerates records.
 */

import { connectToDatabase, createInquiryRecord } from './db.js';
import crypto from 'crypto';

// In-memory sliding window for IP rate limiting
// Map<ipHash, Array<timestampMs>>
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SUBMISSIONS_PER_WINDOW = 5;

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ipHash, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitMap.delete(ipHash);
    } else {
      rateLimitMap.set(ipHash, valid);
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

function sanitizeString(str, maxLen) {
  if (typeof str !== 'string') return '';
  // Strip HTML tags and trim
  return str.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLen);
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // 1. Method Restriction (Write-only: Only POST allowed)
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method Not Allowed. This public endpoint only accepts POST inquiries.'
      })
    };
  }

  // 2. IP Rate Limiting
  const clientIp = getClientIp(event);
  const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex').slice(0, 16);
  const now = Date.now();
  const existingTimestamps = (rateLimitMap.get(ipHash) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (existingTimestamps.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    return {
      statusCode: 429,
      headers: {
        ...headers,
        'Retry-After': '3600'
      },
      body: JSON.stringify({
        success: false,
        error: 'Rate limit exceeded: You have reached the maximum allowed inquiry submissions (5 per hour). Please try again later.'
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
        body: JSON.stringify({ success: false, error: 'Malformed JSON payload.' })
      };
    }

    // 3. Honeypot check (Bots fill hidden fields)
    const honeypot = body.website_url_hp || body.hp || body.faxNumber;
    if (honeypot && String(honeypot).trim().length > 0) {
      // Reject spam submission silently or with clean error
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Spam validation failed: Hidden honeypot field must be empty.'
        })
      };
    }

    // 4. Server-side validation
    const companyName = sanitizeString(body.companyName, 120);
    const officeAddress = sanitizeString(body.officeAddress, 250);
    const state = sanitizeString(body.state, 80);
    const contactPerson = sanitizeString(body.contactPerson, 100);
    const contactEmail = sanitizeString(body.contactEmail, 120).toLowerCase();
    const contactPhone = sanitizeString(body.contactPhone, 30);
    const deviceModel = sanitizeString(body.deviceModel, 80);
    const packageInterest = sanitizeString(body.packageInterest, 100);
    const message = sanitizeString(body.message, 1000);

    // Required fields check
    if (!companyName || companyName.length < 2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Valid Company Name is required (minimum 2 characters).' })
      };
    }

    if (!officeAddress || officeAddress.length < 2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Valid Office Address is required.' })
      };
    }

    if (!state) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Please select a valid Malaysian State or Federal Territory.' })
      };
    }

    if (!contactPerson || contactPerson.length < 2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Valid Contact Person name is required.' })
      };
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactEmail || !emailRegex.test(contactEmail)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'A valid email address is required.' })
      };
    }

    // Phone validation
    if (!contactPhone || contactPhone.length < 6) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'A valid Contact Phone number is required (minimum 6 digits).' })
      };
    }

    // 5. Connect and insert inquiry record into database
    const connection = await connectToDatabase();
    const inquiryDoc = {
      recordType: 'inquiry',
      status: 'inquiry',
      companyName,
      officeAddress,
      state,
      contactPerson,
      contactEmail,
      contactPhone,
      deviceModel: deviceModel || 'Not Specified',
      packageInterest: packageInterest || 'General Assessment',
      message: message || '',
      sourceIpHash: ipHash,
      createdAt: new Date().toISOString(),
      statusHistory: [
        {
          status: 'inquiry',
          changedAt: new Date().toISOString(),
          changedBy: 'Public Web Intake',
          notes: 'Public assessment request submitted by client'
        }
      ]
    };

    const created = await createInquiryRecord(connection, inquiryDoc);

    // Register IP submission for rate limiting
    existingTimestamps.push(now);
    rateLimitMap.set(ipHash, existingTimestamps);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        inquiryId: created._id,
        message: 'Your telematics assessment inquiry has been received. A MIROS Operations Manager will review your submission and contact you.'
      })
    };

  } catch (err) {
    console.error('[SUBMIT-INQUIRY-ERROR]', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'An unexpected error occurred while processing your inquiry.' })
    };
  }
};
