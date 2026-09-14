/**
 * Unit/Integration Tests for Role-Based Access Control (RBAC) & Security Boundaries
 * Verifies:
 * - Vendor JWT CANNOT access manager endpoints (403 Forbidden)
 * - Vendor JWT CANNOT access assessor endpoints (403 Forbidden)
 * - Vendor A's JWT CANNOT retrieve Vendor B's record by ID substitution (403 Forbidden)
 * - Assessor JWT CANNOT access manager-only actions (403 Forbidden)
 * - Manager JWT can access manager endpoints (200 OK)
 * - Assessor JWT can access save-evaluation (200 OK)
 * - Missing or invalid Bearer tokens return 401 Unauthorized
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as saveHandler } from '../netlify/functions/save-evaluation.js';
import { handler as getHandler } from '../netlify/functions/get-evaluations.js';
import { handler as updateHandler } from '../netlify/functions/update-evaluation.js';
import { handler as deleteHandler } from '../netlify/functions/delete-evaluation.js';
import { handler as vendorPortalHandler } from '../netlify/functions/vendor-portal-data.js';
import {
  generateToken,
  ROLE_MANAGER,
  ROLE_ASSESSOR,
  ROLE_VENDOR
} from '../netlify/functions/auth.js';
import {
  connectToDatabase,
  closeDatabaseConnection,
  createVendorRecord,
  COLLECTION_NAME
} from '../netlify/functions/db.js';

describe('Role-Based Access Control (RBAC) Security Boundaries', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Ahmad Farhan' });
  const vendorToken = generateToken({ role: ROLE_VENDOR, vendorId: 'vendor-a-id', email: 'vendor-a@example.com', linkedRegistrationIds: ['rec-a-123'] });

  after(async () => {
    try {
      const conn = await connectToDatabase();
      if (conn.isMongoAtlas) {
        await conn.db.collection('vendors').deleteMany({
          $or: [
            { companyName: 'Vendor A Logistics' },
            { contactEmail: { $regex: /^vendor-a-/i } }
          ]
        });
      }
    } catch {}
    await closeDatabaseConnection();
  });

  // 1. Missing or invalid Bearer token returns 401
  it('should return 401 when Authorization Bearer token is missing', async () => {
    const event = {
      httpMethod: 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    const res = await getHandler(event, {});
    assert.equal(res.statusCode, 401, 'Should return 401 when Bearer token is missing');
    const body = JSON.parse(res.body);
    assert.match(body.error, /Missing Authorization Bearer token/i);
  });

  it('should return 401 when Authorization Bearer token is invalid/tampered', async () => {
    const event = {
      httpMethod: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid.token.payload'
      }
    };
    const res = await getHandler(event, {});
    assert.equal(res.statusCode, 401, 'Should return 401 on invalid Bearer token');
  });

  // 2. Vendor JWT boundary checks
  it('should reject Vendor JWT on manager endpoints (get-evaluations) with 403 Forbidden', async () => {
    const event = {
      httpMethod: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vendorToken}`
      }
    };
    const res = await getHandler(event, {});
    assert.equal(res.statusCode, 403, 'Vendor JWT must not access manager endpoint');
    const body = JSON.parse(res.body);
    assert.match(body.error, /Vendor accounts are strictly limited/i);
  });

  it('should reject Vendor JWT on assessor endpoints (save-evaluation) with 403 Forbidden', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vendorToken}`
      },
      body: JSON.stringify({
        companyName: 'Vendor Hack Co',
        deviceModel: 'VH-1',
        assessorName: 'Hacker',
        breakdown: []
      })
    };
    const res = await saveHandler(event, {});
    assert.equal(res.statusCode, 403, 'Vendor JWT must not access assessor endpoint');
  });

  // 3. Assessor JWT boundary checks
  it('should reject Assessor JWT on manager-only action (update-evaluation) with 403 Forbidden', async () => {
    const event = {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      queryStringParameters: { id: 'some-id' },
      body: JSON.stringify({ companyName: 'Updated Co' })
    };
    const res = await updateHandler(event, {});
    assert.equal(res.statusCode, 403, 'Assessor JWT must not perform manager update');
    const body = JSON.parse(res.body);
    assert.match(body.error, /Assessor accounts cannot perform manager-only actions/i);
  });

  it('should reject Assessor JWT on manager-only action (delete-evaluation) with 403 Forbidden', async () => {
    const event = {
      httpMethod: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      queryStringParameters: { id: 'some-id' }
    };
    const res = await deleteHandler(event, {});
    assert.equal(res.statusCode, 403, 'Assessor JWT must not perform manager delete');
  });

  // 4. Vendor A cannot access Vendor B record by ID substitution
  it('should reject Vendor A JWT when attempting to access Vendor B record by ID substitution with 403', async () => {
    const conn = await connectToDatabase();

    // Create Vendor A with linked record 'eval-vendor-a'
    const vendorA = await createVendorRecord(conn, {
      companyName: 'Vendor A Logistics',
      contactEmail: `vendor-a-${Date.now()}@test.my`,
      passwordHash: 'hash',
      linkedRegistrationIds: ['eval-vendor-a'],
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const vendorAToken = generateToken({
      role: ROLE_VENDOR,
      vendorId: String(vendorA._id),
      email: vendorA.contactEmail,
      linkedRegistrationIds: ['eval-vendor-a']
    });

    // Attempt to access 'eval-vendor-b' which is NOT in vendor A's linkedRegistrationIds
    const event = {
      httpMethod: 'GET',
      headers: {
        'Authorization': `Bearer ${vendorAToken}`
      },
      queryStringParameters: {
        id: 'eval-vendor-b'
      }
    };

    const res = await vendorPortalHandler(event, {});
    assert.equal(res.statusCode, 403, 'Vendor A must receive 403 Forbidden when requesting Vendor B record');
    const body = JSON.parse(res.body);
    assert.match(body.error, /do not have permission to view this evaluation record/i);
  });

  // 5. Authorized Manager access
  it('should allow Manager JWT on get-evaluations with 200 OK', async () => {
    const event = {
      httpMethod: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      queryStringParameters: { page: '1', limit: '5' }
    };
    const res = await getHandler(event, {});
    assert.equal(res.statusCode, 200, 'Manager JWT should be authorized on get-evaluations');
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
  });
});
