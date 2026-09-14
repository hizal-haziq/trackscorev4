/**
 * Role-Based Authentication Middleware for Netlify Serverless Functions & Express API
 * Supports three distinct roles:
 * - MANAGER: Full managerial review, registration, invoicing, payment verification, certificate issuance
 * - ASSESSOR: Can submit evaluations, manage own drafts, and view own submissions
 * - VENDOR: External, read-only self-service access to own lifecycle stage, invoice, and certificate
 *
 * Supports both standard JWT Bearer tokens (Authorization: Bearer <token>) and legacy x-api-key headers.
 */

import jwt from 'jsonwebtoken';

export const ROLE_ASSESSOR = 'assessor';
export const ROLE_MANAGER = 'manager';
export const ROLE_VENDOR = 'vendor';

export const JWT_SECRET = process.env.JWT_SECRET || 'trackscore-miros-jwt-secret-key-2026-production';

export const DEFAULT_ASSESSOR_KEY = 'trackscore-assessor-key-2026';
export const DEFAULT_MANAGER_KEY = 'trackscore-manager-key-2026';
export const DEFAULT_LEGACY_KEY = 'trackscore-secret-key-2026';

export function generateToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export function getBearerToken(event) {
  const headers = event?.headers || {};
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

export function getClientApiKey(event) {
  const headers = event?.headers || {};
  // Check exact keys first
  if (headers['x-api-key']) return headers['x-api-key'];
  if (headers['X-Api-Key']) return headers['X-Api-Key'];
  if (headers['X-API-KEY']) return headers['X-API-KEY'];
  if (headers['x-api-token']) return headers['x-api-token'];

  // Fallback to case-insensitive header scan
  for (const [key, val] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'x-api-key' || lower === 'x-api-token') {
      return val;
    }
  }
  return null;
}

export function validateRole(event, requiredRole) {
  // Pure JWT Bearer token validation - no dual auth system
  const bearerToken = getBearerToken(event);
  if (!bearerToken) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Unauthorized: Missing Authorization Bearer token. Please log in.'
    };
  }

  const decoded = verifyToken(bearerToken);
  if (!decoded) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Unauthorized: Invalid or expired Bearer token. Please log in again.'
    };
  }

  const userRole = decoded.role;

  // Block access to protected endpoints if password change is required
  if (decoded.mustChangePassword === true) {
    return {
      authorized: false,
      statusCode: 403,
      mustChangePassword: true,
      error: 'Password change required: You must change your temporary password before accessing system functions.'
    };
  }

  // Strict Role Isolation:
  // 1. Vendor JWT can NEVER access manager or assessor endpoints
  if (userRole === ROLE_VENDOR) {
    if (requiredRole && requiredRole !== ROLE_VENDOR) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: Vendor accounts are strictly limited to the external vendor portal.'
      };
    }
    return { authorized: true, user: decoded, role: ROLE_VENDOR };
  }

  // 2. Assessor JWT cannot access manager-only actions
  if (userRole === ROLE_ASSESSOR) {
    if (requiredRole === ROLE_MANAGER) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: Assessor accounts cannot perform manager-only actions.'
      };
    }
    if (requiredRole === ROLE_VENDOR) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: Assessor accounts cannot access external vendor portal endpoints.'
      };
    }
    return { authorized: true, user: decoded, role: ROLE_ASSESSOR };
  }

  // 3. Manager role has access to manager and assessor endpoints
  if (userRole === ROLE_MANAGER) {
    if (requiredRole === ROLE_VENDOR) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: Vendor endpoints require authorized vendor credentials.'
      };
    }
    return { authorized: true, user: decoded, role: ROLE_MANAGER };
  }

  // Role mismatch fallback
  if (requiredRole && userRole !== requiredRole) {
    return {
      authorized: false,
      statusCode: 403,
      error: `Forbidden: Insufficient privileges. Required role: ${requiredRole}.`
    };
  }

  return { authorized: true, user: decoded, role: userRole };
}

export function authErrorResponse(corsHeaders, statusCode = 401, customMessage = null) {
  const defaultMsg = statusCode === 403
    ? 'Forbidden: Insufficient privileges for this endpoint.'
    : 'Unauthorized: Missing or invalid Authorization Bearer token.';

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    },
    body: JSON.stringify({
      success: false,
      error: customMessage || defaultMsg
    })
  };
}

export default {
  ROLE_ASSESSOR,
  ROLE_MANAGER,
  ROLE_VENDOR,
  JWT_SECRET,
  generateToken,
  verifyToken,
  getBearerToken,
  DEFAULT_ASSESSOR_KEY,
  DEFAULT_MANAGER_KEY,
  DEFAULT_LEGACY_KEY,
  getClientApiKey,
  validateRole,
  authErrorResponse
};

