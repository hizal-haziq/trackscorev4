/**
 * Unit Tests for User Management with Manual Password & Immediate Login
 * Verifies:
 * - Manager can create new staff account with manager-entered password
 * - New account has mustChangePassword: false
 * - Assessor can log in immediately with the assigned password
 * - Manager can update/reset staff password
 * - Assessor can immediately log in with updated password
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as manageUsersHandler } from '../netlify/functions/manage-users.js';
import { handler as loginHandler } from '../netlify/functions/login.js';
import { generateToken, ROLE_MANAGER } from '../netlify/functions/auth.js';
import {
  connectToDatabase,
  closeDatabaseConnection,
  COLLECTION_USERS
} from '../netlify/functions/db.js';

describe('User Management: Manual Password & Immediate Login', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager' });
  const testEmail = `test.assessor.${Date.now()}@miros.gov.my`;
  const initialPassword = 'Secure@Pass2026!';
  const updatedPassword = 'NewSecret@9988!';
  let createdUserId = null;

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_USERS).deleteMany({
          email: { $regex: /^test\.assessor\./i }
        });
      } else {
        const users = await conn.listUsers();
        for (const u of users) {
          if (u.email && u.email.startsWith('test.assessor.')) {
            await conn.deleteUser(u.id || u._id);
          }
        }
      }
    } catch {}
    await closeDatabaseConnection();
  });

  it('should allow manager to create an assessor with a custom password', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create',
        name: 'Unit Test Assessor',
        email: testEmail,
        role: 'assessor',
        assessorId: 'MKA 7788',
        password: initialPassword,
        phone: '0123456789'
      })
    };

    const res = await manageUsersHandler(event);
    assert.equal(res.statusCode, 201, 'Should return 201 Created');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.mustChangePassword, false, 'Should NOT force temporary password change');
    assert.equal(body.password, initialPassword, 'Returns assigned password for sharing');
    assert.equal(body.user.email, testEmail.toLowerCase());
    assert.equal(body.user.assessorId, 'MKA 7788');

    createdUserId = body.user._id || body.user.id;
  });

  it('should allow newly created assessor to sign in immediately with the assigned password', async () => {
    const event = {
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: initialPassword
      })
    };

    const res = await loginHandler(event);
    assert.equal(res.statusCode, 200, 'Should authenticate successfully');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.mustChangePassword, false);
    assert.equal(body.redirectUrl, '/index.html', 'Assessor should redirect to evaluation form /index.html');
    assert.ok(body.token, 'Should return valid JWT');
  });

  it('should allow manager to reset assessor password', async () => {
    assert.ok(createdUserId, 'User ID must exist from creation');

    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'reset-password',
        userId: createdUserId,
        password: updatedPassword,
        phone: '0198765432'
      })
    };

    const res = await manageUsersHandler(event);
    assert.equal(res.statusCode, 200, 'Should return 200 OK');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.password, updatedPassword);
  });

  it('should allow assessor to log in with the new updated password', async () => {
    const event = {
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: updatedPassword
      })
    };

    const res = await loginHandler(event);
    assert.equal(res.statusCode, 200, 'Should authenticate successfully with new password');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.mustChangePassword, false);
  });

  it('should prevent manager from deleting their own active account', async () => {
    // Current manager's token has no specific ID or uses manager ID
    const selfToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager', userId: 'manager_self_123', email: 'manager@test.com' });
    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${selfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'delete-user',
        userId: 'manager_self_123'
      })
    };

    const res = await manageUsersHandler(event);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.match(body.error, /cannot delete your own/i);
  });

  it('should allow manager to delete the created assessor account', async () => {
    assert.ok(createdUserId, 'User ID must exist from creation');

    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'delete-user',
        userId: createdUserId
      })
    };

    const res = await manageUsersHandler(event);
    assert.equal(res.statusCode, 200, 'Should return 200 OK on deletion');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.match(body.message, /removed successfully/i);
  });

  it('should prevent deleted assessor from logging in', async () => {
    const event = {
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: updatedPassword
      })
    };

    const res = await loginHandler(event);
    assert.equal(res.statusCode, 401, 'Deleted user should receive 401 Unauthorized');
  });

  it('should return 404 when trying to delete non-existent or already removed user', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'delete-user',
        userId: createdUserId
      })
    };

    const res = await manageUsersHandler(event);
    assert.equal(res.statusCode, 404, 'Should return 404 for deleted user');
  });
});
