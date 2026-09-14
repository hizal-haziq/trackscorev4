/**
 * Netlify Serverless Function: change-password
 * Allows an authenticated manager or assessor to set a new password
 * and clear the mustChangePassword flag.
 */

import bcrypt from 'bcryptjs';
import { connectToDatabase, findUserById, updateUserRecord } from './db.js';
import { getBearerToken, verifyToken, generateToken, authErrorResponse } from './auth.js';

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

  // Verify Bearer token (issued at login, even if mustChangePassword is true)
  const bearerToken = getBearerToken(event);
  if (!bearerToken) {
    return authErrorResponse(headers, 401, 'Unauthorized: Missing Authorization Bearer token.');
  }

  const decoded = verifyToken(bearerToken);
  if (!decoded || !decoded.userId) {
    return authErrorResponse(headers, 401, 'Unauthorized: Invalid or expired session token.');
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

  const { newPassword, confirmPassword } = body;

  if (!newPassword || newPassword.trim().length < 8) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'New password must be at least 8 characters in length.' })
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Passwords do not match. Please verify your entries.' })
    };
  }

  try {
    const connection = await connectToDatabase();
    const user = await findUserById(connection, decoded.userId);

    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'User account not found.' })
      };
    }

    // Hash the new password with bcrypt
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPassword.trim(), salt);

    // Update user record: set new password hash and clear mustChangePassword
    await updateUserRecord(connection, user._id, {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date().toISOString()
    });

    // Issue refreshed JWT token without mustChangePassword flag
    const newPayload = {
      userId: user._id,
      email: user.email,
      name: user.name || 'User',
      role: user.role,
      assessorId: user.assessorId || null,
      mustChangePassword: false
    };
    const freshToken = generateToken(newPayload, '24h');
    const redirectUrl = user.role === 'manager' ? '/dashboard.html' : '/index.html';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Password updated successfully. Access has been unlocked.',
        token: freshToken,
        role: user.role,
        redirectUrl,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          assessorId: user.assessorId || null,
          mustChangePassword: false
        }
      })
    };
  } catch (error) {
    console.error('[CHANGE-PASSWORD-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Failed to update password.' })
    };
  }
};

export default { handler };
