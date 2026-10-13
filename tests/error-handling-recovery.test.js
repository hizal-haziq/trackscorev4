/**
 * TrackScore Centralized Error Handling & Recovery UX Test Suite
 *
 * Verifies:
 * 1. normalizeError mapping for all required HTTP statuses (400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 500, 502, 503, 504, network, unknown)
 * 2. Security sanitization: Strict prevention of raw stack traces, Mongo errors, filesystem paths, JWTs, and secrets leaking into user UI
 * 3. Role-isolated navigation (getRoleHome) preventing cross-role portal redirects
 * 4. ApiError and apiRequest network failure classification and cancellation preservation
 * 5. Route 404 classification across Manager and Vendor routers
 * 6. React error components (ErrorPage, RequestState) rendering accessible alerts and recovery actions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { normalizeError, isSensitive, sanitizeMessage } from '../src/utils/errors.ts';
import { getRoleHome } from '../src/utils/navigation.ts';
import { ApiError, apiRequest } from '../src/services/api.ts';
import { managerLocation } from '../src/app/managerRoutes.ts';
import { parseVendorLocation } from '../src/app/vendorRoutes.ts';
import { ErrorPage } from '../src/components/common/ErrorPage.tsx';
import { RequestState } from '../src/components/common/RequestState.tsx';

describe('TrackScore Centralized Error Handling & Recovery Matrix', () => {

  describe('HTTP Status Code Mapping & Normalization', () => {
    it('maps 400 Bad Request to safe Invalid Request', () => {
      const err = normalizeError({ status: 400, message: 'Invalid device parameters provided.' });
      assert.equal(err.status, 400);
      assert.equal(err.title, 'Invalid Request');
      assert.equal(err.message, 'Invalid device parameters provided.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'none');
    });

    it('maps 401 Unauthorized to Session Expired with login action', () => {
      const err = normalizeError({ status: 401, message: 'jwt expired' });
      assert.equal(err.status, 401);
      assert.equal(err.title, 'Session Expired');
      assert.equal(err.message, 'Please log in again to continue.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'login');
    });

    it('maps 403 Forbidden to Access Denied with dashboard recovery', () => {
      const err = normalizeError({ status: 403, message: 'Manager access required.' });
      assert.equal(err.status, 403);
      assert.equal(err.title, 'Access Denied');
      assert.equal(err.message, 'You do not have permission to access this page or action.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'dashboard');
    });

    it('maps 404 Not Found to Not Found with back recovery', () => {
      const err = normalizeError({ status: 404, message: 'Assessment record does not exist.' });
      assert.equal(err.status, 404);
      assert.equal(err.title, 'Not Found');
      assert.equal(err.message, 'The requested page or record could not be found.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'back');
    });

    it('maps 409 Conflict to Information Changed with retryable action', () => {
      const err = normalizeError({ status: 409, message: 'Document version conflict detected.' });
      assert.equal(err.status, 409);
      assert.equal(err.title, 'Information Changed');
      assert.equal(err.message, 'This information was updated elsewhere. Refresh and try again.');
      assert.equal(err.retryable, true);
      assert.equal(err.action, 'retry');
    });

    it('maps 410 Gone to Feature No Longer Available preserving payment retirement', () => {
      const err = normalizeError({ status: 410, message: 'Payment workflows are permanently retired.' });
      assert.equal(err.status, 410);
      assert.equal(err.title, 'Feature No Longer Available');
      assert.equal(err.message, 'This workflow is no longer used in TrackScore.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'dashboard');
    });

    it('maps 413 Payload Too Large to File Too Large', () => {
      const err = normalizeError({ status: 413, message: 'Payload exceeds limit' });
      assert.equal(err.status, 413);
      assert.equal(err.title, 'File Too Large');
      assert.equal(err.message, 'The selected file exceeds the allowed size.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'none');
    });

    it('maps 415 Unsupported Media Type to Unsupported File Type', () => {
      const err = normalizeError({ status: 415, message: 'Unsupported mimetype application/x-msdownload' });
      assert.equal(err.status, 415);
      assert.equal(err.title, 'Unsupported File Type');
      assert.equal(err.message, 'Please choose a supported file type.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'none');
    });

    it('maps 422 Unprocessable Entity to Validation Error with safe message', () => {
      const err = normalizeError({ status: 422, message: 'Invalid device serial number format.' });
      assert.equal(err.status, 422);
      assert.equal(err.title, 'Validation Error');
      assert.equal(err.message, 'Invalid device serial number format.');
      assert.equal(err.retryable, false);
      assert.equal(err.action, 'none');
    });

    it('maps 429 Too Many Requests to retryable rate limit message', () => {
      const err = normalizeError({ status: 429, message: 'Rate limit exceeded' });
      assert.equal(err.status, 429);
      assert.equal(err.title, 'Too Many Requests');
      assert.equal(err.message, 'Please wait a moment and try again.');
      assert.equal(err.retryable, true);
      assert.equal(err.action, 'retry');
    });

    it('maps 500 Internal Server Error to safe generic Server Error', () => {
      const err = normalizeError({ status: 500, message: 'Unhandled database exception' });
      assert.equal(err.status, 500);
      assert.equal(err.title, 'Server Error');
      assert.equal(err.message, 'TrackScore could not complete your request.');
      assert.equal(err.retryable, true);
      assert.equal(err.action, 'retry');
    });

    it('maps 502, 503, 504 Gateway & Service Unavailable errors to retryable downtime message', () => {
      for (const status of [502, 503, 504]) {
        const err = normalizeError({ status, message: 'Service Unavailable' });
        assert.equal(err.status, status);
        assert.equal(err.title, 'Service Temporarily Unavailable');
        assert.equal(err.message, 'Please try again shortly.');
        assert.equal(err.retryable, true);
        assert.equal(err.action, 'retry');
      }
    });

    it('maps network and connectivity failures to Connection Problem', () => {
      const fetchError = normalizeError(new TypeError('Failed to fetch'));
      assert.equal(fetchError.status, 0);
      assert.equal(fetchError.title, 'Connection Problem');
      assert.equal(fetchError.message, 'TrackScore could not connect to the server.');
      assert.equal(fetchError.retryable, true);
      assert.equal(fetchError.action, 'retry');

      const networkError = normalizeError({ kind: 'network', message: 'NetworkError when attempting to fetch resource.' });
      assert.equal(networkError.status, 0);
      assert.equal(networkError.title, 'Connection Problem');
      assert.equal(networkError.retryable, true);
    });

    it('maps unknown errors to safe generic fallback', () => {
      const err = normalizeError(new Error('Unknown client state issue'));
      assert.equal(err.title, 'Something Went Wrong');
      assert.equal(err.message, 'Unknown client state issue');
      assert.equal(err.retryable, true);
    });
  });

  describe('Security Sanitization & Anti-Disclosure Defense', () => {
    it('detects and redacts MongoDB connection strings', () => {
      const raw = 'Failed to connect to mongodb+srv://db_admin:P@ssw0rd123@cluster0.miros.net/trackscore';
      assert.equal(isSensitive(raw), true);
      assert.equal(sanitizeMessage(raw), '');
      const normalized = normalizeError({ status: 500, message: raw });
      assert.ok(!normalized.message.includes('mongodb'));
      assert.ok(!normalized.message.includes('db_admin'));
      assert.equal(normalized.message, 'TrackScore could not complete your request.');
    });

    it('detects and redacts JWT tokens and secrets', () => {
      const raw = 'Auth error for Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoibWFuYWdlciJ9.signature123';
      assert.equal(isSensitive(raw), true);
      assert.equal(sanitizeMessage(raw), '');
      const normalized = normalizeError({ status: 401, message: raw });
      assert.ok(!normalized.message.includes('Bearer'));
      assert.ok(!normalized.message.includes('eyJhbGciOi'));
      assert.equal(normalized.message, 'Please log in again to continue.');
    });

    it('detects and redacts internal server filesystem paths', () => {
      const raw = 'Unhandled exception in /home/hizalhaziq/Coding/trackscorev4/server.ts:42';
      assert.equal(isSensitive(raw), true);
      assert.equal(sanitizeMessage(raw), '');
      const normalized = normalizeError({ status: 400, message: raw });
      assert.ok(!normalized.message.includes('/home/'));
      assert.equal(normalized.message, 'Please check the information and try again.');
    });

    it('detects and redacts stack traces and node_modules references', () => {
      const raw = 'Error: connection lost\n  at Database.query (/app/node_modules/mongodb/lib/db.js:142:12)';
      assert.equal(isSensitive(raw), true);
      assert.equal(sanitizeMessage(raw), '');
      const normalized = normalizeError(raw);
      assert.ok(!normalized.message.includes('node_modules'));
      assert.ok(!normalized.message.includes('at Database.query'));
      assert.equal(normalized.title, 'Something Went Wrong');
      assert.equal(normalized.message, 'Please try again.');
    });

    it('detects and redacts Mongo driver error classes', () => {
      const raw = 'MongoServerSelectionError: Server selection timed out after 30000 ms';
      assert.equal(sanitizeMessage(raw), '');
      const normalized = normalizeError({ status: 500, message: raw });
      assert.ok(!normalized.message.includes('MongoServerSelectionError'));
    });
  });

  describe('Strict Role-Isolated Navigation Boundaries', () => {
    it('resolves manager role strictly to Manager portal', () => {
      assert.equal(getRoleHome('manager'), '/react/manager.html');
      assert.equal(getRoleHome('Manager'), '/react/manager.html');
      assert.equal(getRoleHome(' MANAGER '), '/react/manager.html');
    });

    it('resolves assessor role strictly to Assessor portal', () => {
      assert.equal(getRoleHome('assessor'), '/react/assessor.html');
      assert.equal(getRoleHome('Assessor'), '/react/assessor.html');
    });

    it('resolves vendor role strictly to Vendor portal', () => {
      assert.equal(getRoleHome('vendor'), '/react/vendor.html');
      assert.equal(getRoleHome('Vendor'), '/react/vendor.html');
    });

    it('resolves unauthenticated or unknown roles to login page', () => {
      assert.equal(getRoleHome(null), '/login.html');
      assert.equal(getRoleHome(undefined), '/login.html');
      assert.equal(getRoleHome(''), '/login.html');
      assert.equal(getRoleHome('attacker'), '/login.html');
      assert.equal(getRoleHome('admin'), '/login.html');
    });
  });

  describe('API Client Network Error & Cancellation Integrity', () => {
    const originalFetch = globalThis.fetch;

    it('creates ApiError with accurate status, kind, and message', () => {
      const err = new ApiError('Conflict occurred', 409, 'http');
      assert.equal(err.status, 409);
      assert.equal(err.kind, 'http');
      assert.equal(err.message, 'Conflict occurred');
      assert.equal(err.name, 'ApiError');
    });

    it('apiRequest catches network disconnects and throws network ApiError', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      try {
        await apiRequest('status');
        assert.fail('Should have thrown network error');
      } catch (err) {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 0);
        assert.equal(err.kind, 'network');
        assert.equal(err.message, 'TrackScore could not connect to the server.');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('apiRequest preserves AbortError without converting to generic error', async () => {
      globalThis.fetch = async () => {
        const domErr = new DOMException('The user aborted a request.', 'AbortError');
        throw domErr;
      };

      try {
        await apiRequest('status');
        assert.fail('Should have thrown AbortError');
      } catch (err) {
        assert.equal(err.name, 'AbortError');
        assert.ok(!(err instanceof ApiError));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('apiRequest sanitizes incoming sensitive server error messages', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Database connection failed at mongodb+srv://secret@cluster'
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        await apiRequest('test-endpoint');
        assert.fail('Should have thrown ApiError');
      } catch (err) {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 500);
        assert.ok(!err.message.includes('mongodb'));
        assert.equal(err.message, 'The request could not be completed. Please try again.');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

  });

  describe('Route 404 Disambiguation', () => {
    it('classifies unknown manager hash as missing route', () => {
      assert.deepEqual(managerLocation('#/invalid-hash-route'), { page: 'missing' });
      assert.deepEqual(managerLocation('#/unknown/subpath'), { page: 'missing' });
      assert.deepEqual(managerLocation('#/assessments'), { page: 'assessments' });
      assert.deepEqual(managerLocation('#/'), { page: 'dashboard' });
    });

    it('classifies unknown vendor hash as missing route', () => {
      assert.deepEqual(parseVendorLocation('#/invalid-vendor-route'), { page: 'missing' });
      assert.deepEqual(parseVendorLocation('#/unknown/deep/path'), { page: 'missing' });
      assert.deepEqual(parseVendorLocation('#/assessments'), { page: 'assessments' });
      assert.deepEqual(parseVendorLocation('#/dashboard'), { page: 'dashboard' });
      assert.deepEqual(parseVendorLocation(''), { page: 'dashboard' });
    });
  });

  describe('Error UI Components Accessible Rendering', () => {
    it('ErrorPage renders semantic main alert with accessible heading and status pill', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorPage, {
          status: 404,
          title: 'Page Not Found',
          message: 'The requested manager page could not be found.',
          action: 'dashboard'
        })
      );

      assert.match(html, /role="alert"/);
      assert.match(html, /<h1[^>]*>Page Not Found<\/h1>/);
      assert.match(html, /HTTP 404/);
      assert.match(html, /The requested manager page could not be found\./);
      assert.match(html, /Go to My Dashboard/);
    });

    it('ErrorPage renders Log In action button for 401 Session Expired', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorPage, {
          status: 401,
          title: 'Session Expired',
          message: 'Please log in again to continue.',
          action: 'login'
        })
      );

      assert.match(html, /href="\/login\.html"/);
      assert.match(html, /Log In/);
      assert.doesNotMatch(html, /Go to My Dashboard/);
    });

    it('ErrorPage renders Try Again action button for retryable 500 error', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorPage, {
          status: 500,
          title: 'Server Error',
          message: 'TrackScore could not complete your request.',
          action: 'retry'
        })
      );

      assert.match(html, /Try Again/);
      assert.match(html, /Go to My Dashboard/);
    });

    it('RequestState renders scoped alert with sanitized title, message and retry', () => {
      const html = renderToStaticMarkup(
        React.createElement(RequestState, {
          loading: false,
          error: {
            status: 503,
            title: 'Service Temporarily Unavailable',
            message: 'Please try again shortly.',
            retryable: true
          },
          retry: () => {},
          hasData: false,
          subject: 'assessment'
        })
      );

      assert.match(html, /role="alert"/);
      assert.match(html, /Service Temporarily Unavailable/);
      assert.match(html, /Please try again shortly\./);
      assert.match(html, /Try again/);
    });

    it('RequestState provides return link for record 404 when no cached data exists', () => {
      const html = renderToStaticMarkup(
        React.createElement(RequestState, {
          loading: false,
          error: {
            status: 404,
            title: 'Not Found',
            message: 'The requested page or record could not be found.',
            retryable: false
          },
          retry: () => {},
          hasData: false,
          subject: 'assessment'
        })
      );

      assert.match(html, /role="alert"/);
      assert.match(html, /Return to assessments/);
      assert.doesNotMatch(html, /Try again/);
    });
  });
});
