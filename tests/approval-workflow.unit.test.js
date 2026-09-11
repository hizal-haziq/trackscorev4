import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handler as approveHandler } from '../netlify/functions/approve-evaluation.js';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR } from '../netlify/functions/auth.js';

describe('Approval & Review Workflow Unit Tests', () => {
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Assessor' });

  it('should reject Assessor role attempting to approve or reject with 403 Forbidden', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assessorToken}`
      },
      body: JSON.stringify({
        id: 'rec-123',
        action: 'approve'
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.error, /manager/i);
  });

  it('should reject invalid action with 400 Bad Request', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: 'rec-123',
        action: 'invalid_action'
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /Invalid status or action/i);
  });

  it('should reject rejection action when reason is missing with 400 Bad Request', async () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        id: 'rec-123',
        action: 'reject',
        reason: '   ' // empty whitespace
      })
    };

    const res = await approveHandler(event, {});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /Rejection reason is required/i);
  });
});
