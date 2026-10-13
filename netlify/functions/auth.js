/**
 * Role-Based Authentication Middleware for Netlify Serverless Functions & Express API
 * Supports three distinct roles:
 * - MANAGER: Full managerial review, registration, invoicing, certificate issuance
 * - ASSESSOR: Can submit evaluations, manage own drafts, and view own submissions
 * - VENDOR: External, read-only self-service access to own lifecycle stage, invoice, and certificate
 *
 * Supports both standard JWT Bearer tokens (Authorization: Bearer <token>) and legacy x-api-key headers.
 */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

export const ROLE_ASSESSOR = 'assessor';
export const ROLE_MANAGER = 'manager';
export const ROLE_VENDOR = 'vendor';

const DEVELOPMENT_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const MIN_JWT_SECRET_LENGTH = 32;

function getConfiguredJwtSecret() {
  const configured = typeof process.env.JWT_SECRET === 'string' ? process.env.JWT_SECRET.trim() : '';
  const production = process.env.NODE_ENV === 'production' || process.env.CONTEXT === 'production';
  if (!configured) {
    if (production) throw new Error('JWT_SECRET must be configured in production.');
    return DEVELOPMENT_JWT_SECRET;
  }
  if (configured.length < MIN_JWT_SECRET_LENGTH) {
    if (production) throw new Error('JWT_SECRET must be at least 32 characters in production.');
    return configured.padEnd(MIN_JWT_SECRET_LENGTH, '0');
  }
  return configured;
}

export const JWT_SECRET = getConfiguredJwtSecret();

export function generateToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, getConfiguredJwtSecret(), { expiresIn, algorithm: 'HS256' });
}

export function verifyToken(token) {
  const secret = getConfiguredJwtSecret();

  try {
    const decoded = jwt.verify(token, secret, {algorithms: ['HS256']});
    return decoded && typeof decoded === 'object' && [ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR].includes(decoded.role) && Number.isFinite(decoded.exp) ? decoded : null;
  } catch (err) {
    return null;
  }
}

export function getBearerToken(event, { allowQuery = false } = {}) {
  const headers = event?.headers || {};
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (!allowQuery) return null;
  const queryToken = event?.queryStringParameters?.token || event?.queryStringParameters?.auth;
  if (queryToken && typeof queryToken === 'string') {
    return queryToken.trim();
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

export function validateRole(event, requiredRole, options) {
  // Pure JWT Bearer token validation - no dual auth system
  const bearerToken = getBearerToken(event, options);
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
  if (decoded.mustChangePassword === true && options?.allowPasswordChange !== true) {
    return {
      authorized: false,
      statusCode: 403,
      mustChangePassword: true,
      error: 'Password change required: You must change your temporary password before accessing system functions.'
    };
  }

  // Strict Role Isolation:
  // If requiredRole is specified, enforce strictly. Supports a single role string or array of allowed roles.
  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowedRoles.includes(userRole)) {
      if (userRole === ROLE_VENDOR) {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Forbidden: Vendor accounts are strictly limited to the external vendor portal.'
        };
      }
      if (userRole === ROLE_ASSESSOR) {
        if (allowedRoles.includes(ROLE_MANAGER)) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Assessor accounts cannot perform manager-only actions.'
          };
        }
        if (allowedRoles.includes(ROLE_VENDOR)) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Assessor accounts cannot access external vendor portal endpoints.'
          };
        }
        return {
          authorized: false,
          statusCode: 403,
          error: `Forbidden: Assessor accounts do not have required role: ${allowedRoles.join(' or ')}.`
        };
      }
      if (userRole === ROLE_MANAGER) {
        if (allowedRoles.includes(ROLE_VENDOR)) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Vendor endpoints require authorized vendor credentials.'
          };
        }
        if (allowedRoles.includes(ROLE_ASSESSOR)) {
          return {
            authorized: false,
            statusCode: 403,
            error: 'Forbidden: Only assigned Assessors may perform this action.'
          };
        }
        return {
          authorized: false,
          statusCode: 403,
          error: `Forbidden: Manager accounts do not have required role: ${allowedRoles.join(' or ')}.`
        };
      }
      return {
        authorized: false,
        statusCode: 403,
        error: `Forbidden: Insufficient privileges. Required role: ${allowedRoles.join(' or ')}.`
      };
    }
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
  getClientApiKey,
  validateRole,
  authErrorResponse
};
