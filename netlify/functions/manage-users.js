/**
 * Netlify Serverless Function: manage-users
 * Allows managers to list and create Assessor and Manager accounts.
 * Admin-created accounts only; self-registration is not allowed.
 */

import bcrypt from 'bcryptjs';
import {
  connectToDatabase,
  findUserByEmail,
  listUsers,
  listVendors,
  COLLECTION_USERS
} from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // Manager-only endpoint
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const connection = await connectToDatabase();

  if (event.httpMethod === 'GET') {
    try {
      const users = await listUsers(connection);
      const vendors = await listVendors(connection);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          users,
          vendors
        })
      };
    } catch (error) {
      console.error('[MANAGE-USERS-GET-ERROR]', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: error.message || 'Failed to list users.' })
      };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
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

      const { name, email, password, role = 'assessor', assessorId = '' } = body;

      if (!name || !name.trim()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Full name is required.' })
        };
      }

      if (!email || !email.trim()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Email address is required.' })
        };
      }

      if (!password || password.trim().length < 6) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Password must be at least 6 characters.' })
        };
      }

      const cleanEmail = email.trim().toLowerCase();
      const existing = await findUserByEmail(connection, cleanEmail);
      if (existing) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ success: false, error: `An account with email "${cleanEmail}" already exists.` })
        };
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password.trim(), salt);

      const userDoc = {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: role === 'manager' ? 'manager' : 'assessor',
        assessorId: role === 'assessor' ? (assessorId.trim() || `AS-${Math.floor(1000 + Math.random() * 9000)}`) : null,
        createdBy: roleCheck.user?.name || 'Manager',
        createdAt: new Date().toISOString()
      };

      let createdUser = null;
      if (connection.isMongoAtlas) {
        const res = await connection.db.collection(COLLECTION_USERS).insertOne(userDoc);
        createdUser = { _id: res.insertedId, ...userDoc };
      } else {
        createdUser = await connection.createUser(userDoc);
      }

      // Safe return without passwordHash
      const { passwordHash: _, ...safeUser } = createdUser;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          message: `User account for "${name}" created successfully with role "${userDoc.role}".`,
          user: safeUser
        })
      };
    } catch (error) {
      console.error('[MANAGE-USERS-POST-ERROR]', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: error.message || 'Failed to create user account.' })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use GET or POST.' })
  };
};

export default { handler };
