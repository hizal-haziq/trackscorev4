import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getBearerToken, generateToken, verifyToken } from '../netlify/functions/auth.js';

describe('Security hardening checks', () => {
  it('fails closed when production starts without a JWT secret', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./netlify/functions/auth.js')"], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', CONTEXT: '', JWT_SECRET: '' }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET must be configured in production/);
  });

  it('rejects short production JWT secrets', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./netlify/functions/auth.js')"], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', CONTEXT: '', JWT_SECRET: 'weak-secret' }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /at least 32 characters/);
  });

  it('accepts query-string bearer tokens only when explicitly enabled for EventSource', () => {
    const token = generateToken({ role: 'vendor' });
    const event = { headers: {}, queryStringParameters: { token } };
    assert.equal(getBearerToken(event), null);
    assert.equal(getBearerToken(event, { allowQuery: true }), token);
    assert.equal(verifyToken(token).role, 'vendor');
  });
});
