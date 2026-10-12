import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {apiRequest, apiUrl, ApiError} from '../src/services/api.ts';
import {AUTH_KEYS, AUTH_CHANGED, readSession, saveSession, clearSession} from '../src/services/auth.ts';
import {parseManagerOverview, getManagerOverview} from '../src/services/assessments.ts';
import {statusLabel, statusTone} from '../src/utils/status.ts';
import {formatDate, formatTime} from '../src/utils/format.ts';
import {summarizeManagerDashboard} from '../netlify/functions/manager-overview.js';
import {handler as overviewHandler} from '../netlify/functions/get-evaluations.js';

const originalFetch = globalThis.fetch;
class Storage {
  values = new Map();
  getItem(key) {return this.values.get(key) ?? null;}
  setItem(key, value) {this.values.set(key, String(value));}
  removeItem(key) {this.values.delete(key);}
}
const token = (extra = {}) => jwt.sign({role: 'manager', name: 'QA Manager', email: 'manager@react.test', ...extra}, process.env.JWT_SECRET, extra.exp === undefined ? {expiresIn: '1h'} : {});
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const signIn = (extra = {}) => saveSession({success: true, token: token(extra), role: extra.role || 'manager', user: {name: 'Legacy profile'}});
beforeEach(() => {const events = new EventTarget(); globalThis.window = {localStorage: new Storage(), sessionStorage: new Storage(), dispatchEvent: event => events.dispatchEvent(event), addEventListener: (...args) => events.addEventListener(...args)};});
afterEach(() => {globalThis.fetch = originalFetch; delete globalThis.window;});

test('legacy login keys remain compatible and JWT role takes precedence over storage hints', () => {
  signIn({role: 'assessor', assessorId: 'QA 001'}); window.localStorage.setItem(AUTH_KEYS.role, 'manager');
  assert.equal(readSession().user.role, 'assessor'); assert.equal(readSession().user.name, 'QA Manager'); assert.equal(readSession().user.assessorId, 'QA 001');
});
test('malformed and expired tokens cannot create a React session', () => {
  for (const value of ['bad', 'one.bad.three', token({exp: 1})]) {window.localStorage.setItem(AUTH_KEYS.token, value); assert.equal(readSession(), null);}
});
test('invalid profile JSON does not invalidate the token role', () => {signIn(); window.localStorage.setItem(AUTH_KEYS.user, '{bad'); assert.equal(readSession().user.role, 'manager');});
test('required password change is preserved from token and legacy profile', () => {
  signIn({mustChangePassword: true}); assert.equal(readSession().user.mustChangePassword, true);
  signIn(); window.localStorage.setItem(AUTH_KEYS.user, JSON.stringify({mustChangePassword: true})); assert.equal(readSession().user.mustChangePassword, true);
});
test('logout removes authentication only, preserves drafts and announces changes', () => {
  signIn(); window.localStorage.setItem('trackscore_drafts', 'keep'); let changed = 0; window.addEventListener(AUTH_CHANGED, () => changed++); clearSession();
  for (const key of Object.values(AUTH_KEYS)) assert.equal(window.localStorage.getItem(key), null);
  assert.equal(window.sessionStorage.getItem('manager_authenticated'), null); assert.equal(window.localStorage.getItem('trackscore_drafts'), 'keep'); assert.equal(changed, 1);
});
test('sign-in response role inconsistent with its token is rejected', () => {assert.throws(() => saveSession({success: true, token: token({role: 'vendor'}), role: 'manager'}), /Invalid sign-in/);});
test('both same-origin API prefixes work and external endpoints/prefixes are rejected', () => {
  assert.equal(apiUrl('get-evaluations?view=overview', '/api'), '/api/get-evaluations?view=overview'); assert.equal(apiUrl('get-evaluations'), '/.netlify/functions/get-evaluations');
  for (const url of ['https://example.test', '//example.test', '../.env', 'get-evaluations\r\nHeader:bad']) assert.throws(() => apiUrl(url)); assert.throws(() => apiUrl('login', 'https://example.test'));
});
test('API sends bearer token, JSON and caller AbortSignal', async () => {
  signIn(); const controller = new AbortController(); globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/example'); assert.equal(init.headers.get('Authorization'), `Bearer ${readSession().token}`); assert.equal(init.headers.get('Content-Type'), 'application/json'); assert.equal(init.body, '{"value":1}'); assert.equal(init.signal, controller.signal); return json({success: true, version: {number: 1}});
  }; assert.deepEqual(await apiRequest('example', {prefix: '/api', method: 'POST', body: {value: 1}, signal: controller.signal}), {success: true, version: {number: 1}});
});
test('public calls omit authentication', async () => {signIn(); globalThis.fetch = async (_, init) => {assert.equal(init.headers.has('Authorization'), false); return json({valid: true});}; assert.deepEqual(await apiRequest('verify-certificate', {authenticated: false}), {valid: true});});
test('endpoint-specific overview/history/version/evaluations/base64 JSON remains intact', async () => {
  for (const body of [{success: true, overview: {}}, {success: true, history: []}, {success: true, version: 1}, {success: true, evaluations: []}, {success: true, data: 'JVBERi0=', filename: 'certificate.pdf'}, {valid: true}]) {globalThis.fetch = async () => json(body); assert.deepEqual(await apiRequest('example'), body);}
});
test('binary downloads return Blob without JSON assumptions', async () => {globalThis.fetch = async () => new Response('%PDF-QA', {headers: {'Content-Type': 'application/pdf'}}); const blob = await apiRequest('export-evaluations', {responseType: 'blob'}); assert.ok(blob instanceof Blob); assert.equal(await blob.text(), '%PDF-QA');});
test('text stream responses remain readable', async () => {globalThis.fetch = async () => new Response('data: {"status":"submitted"}\n\n', {headers: {'Content-Type': 'text/event-stream'}}); assert.match(await apiRequest('status-stream', {responseType: 'text'}), /^data:/);});
test('401 clears session and yields an unauthenticated error', async () => {
  signIn(); globalThis.fetch = async () => json({success: false, error: 'Unauthorized'}, 401); await assert.rejects(apiRequest('example'), e => e instanceof ApiError && e.status === 401 && e.kind === 'unauthenticated'); assert.equal(readSession(), null);
});
test('ordinary 403 preserves the authenticated session', async () => {
  signIn(); const before = readSession().token; globalThis.fetch = async () => json({success: false, error: 'Forbidden'}, 403); await assert.rejects(apiRequest('example'), e => e.status === 403 && e.kind === 'forbidden'); assert.equal(readSession().token, before); assert.equal(readSession().user.mustChangePassword, false);
});
test('password-change-required 403 retains token and marks the session', async () => {
  signIn(); globalThis.fetch = async () => json({success: false, error: 'Password change required: update temporary password'}, 403); await assert.rejects(apiRequest('example'), e => e.kind === 'password-change'); assert.equal(readSession().user.mustChangePassword, true);
});
test('download requests process JSON authentication failures', async () => {signIn(); globalThis.fetch = async () => json({success: false}, 401); await assert.rejects(apiRequest('example', {responseType: 'blob'}), e => e.kind === 'unauthenticated'); assert.equal(readSession(), null);});
test('failed mutations never retry against an alternate prefix', async () => {
  let calls = 0; globalThis.fetch = async () => {calls++; return json({success: false, error: 'Unavailable'}, 503);}; for (const method of ['POST','PUT','DELETE']) await assert.rejects(apiRequest('example', {method}), /Unavailable/); assert.equal(calls, 3);
});
test('fetch cancellation propagates without retry or logout', async () => {
  signIn(); let calls = 0; globalThis.fetch = (_, init) => {calls++; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));}; const controller = new AbortController(); const result = apiRequest('example', {signal: controller.signal}); controller.abort(); await assert.rejects(result, e => e.name === 'AbortError'); assert.equal(calls, 1); assert.ok(readSession());
});
test('body-read cancellation propagates and cannot clear authentication', async () => {
  signIn(); globalThis.fetch = async () => ({status: 401, headers: new Headers({'Content-Type': 'application/json'}), json: async () => {throw new DOMException('Aborted', 'AbortError');}}); await assert.rejects(apiRequest('example'), e => e.name === 'AbortError'); assert.ok(readSession());
});
test('invalid JSON/non-JSON success fails without exposing HTML diagnostics', async () => {
  for (const response of [new Response('<script>private diagnostic</script>'), new Response('{broken', {headers: {'Content-Type': 'application/json'}})]) {globalThis.fetch = async () => response; await assert.rejects(apiRequest('example'), e => e.kind === 'invalid-response' && !e.message.includes('private diagnostic'));}
});
test('success=false JSON and JSON in place of a binary file are errors', async () => {globalThis.fetch = async () => json({success: false, error: 'Rejected'}); await assert.rejects(apiRequest('example'), /Rejected/); globalThis.fetch = async () => json({success: true}); await assert.rejects(apiRequest('example', {responseType: 'blob'}), e => e.kind === 'invalid-response');});
test('real backend empty overview is accepted without invented items', () => {const overview = summarizeManagerDashboard([], []); assert.deepEqual(parseManagerOverview({success: true, overview}), overview);});
test('real populated backend overview preserves true totals and eight-row sample limit', () => {
  const records = Array.from({length: 12}, (_, i) => ({_id: String(i), companyName: `QA ${i}`, status: i % 2 ? 'rejected' : 'pending_review', createdAt: new Date().toISOString()})); const overview = summarizeManagerDashboard(records, [{_id: 'qa-assessor', name: 'QA Assessor', role: 'assessor', assessorId: 'QA 001'}]); const result = parseManagerOverview({success: true, overview}); assert.equal(result.total, 12); assert.equal(result.recent.length, 8); assert.equal(result.metrics.review, 6); assert.equal(result.workload.assessors.length, 1);
});
test('malformed overview fields are rejected rather than shown as invented zeros', () => {
  const valid = summarizeManagerDashboard([], []); for (const overview of [{}, {...valid, metrics: {...valid.metrics, active: '1'}}, {...valid, recent: [{}]}, {...valid, workload: {assessors: [{}]}}]) assert.throws(() => parseManagerOverview({success: true, overview}), /incomplete/);
});
test('overview query preserves actual names/encoding and cancellation', async () => {
  const controller = new AbortController(); globalThis.fetch = async (url, init) => {const query = new URL(url, 'https://local.test').searchParams; assert.equal(query.get('view'), 'overview'); assert.equal(query.get('q'), 'QA & Fleet'); assert.equal(query.get('overviewStatus'), 'revision'); assert.equal(query.get('overviewSla'), 'OVERDUE'); assert.equal(init.signal, controller.signal); return json({success: true, overview: summarizeManagerDashboard([], [])});}; await getManagerOverview({q: 'QA & Fleet', status: 'revision', sla: 'OVERDUE'}, controller.signal);
});
test('status mapping preserves changes requested/review and approved historical compatibility', () => {
  assert.equal(statusLabel('rejected'), 'Changes Requested'); assert.equal(statusLabel('remediation_required'), 'Changes Requested'); assert.equal(statusLabel('submitted'), 'Waiting Review'); assert.equal(statusLabel('pending_review'), 'Waiting Review'); for (const status of ['approved','pre_final_sent','payment_confirmed']) assert.equal(statusLabel(status), 'Approved'); assert.equal(statusTone('OVERDUE'), 'danger'); assert.equal(statusLabel(null), 'Not recorded'); assert.equal(statusLabel('future_state'), 'future state');
});
test('Malaysia date helpers handle missing, invalid and date-only values honestly', () => {assert.equal(formatDate('invalid'), 'Not recorded'); assert.equal(formatDate(null), 'Not recorded'); assert.equal(formatTime('2026-10-12'), 'Time not recorded'); assert.equal(formatTime('invalid'), 'Time not recorded'); assert.match(formatDate('2026-10-11T18:00:00Z'), /^12 Oct 2026$/);});
test('existing overview handler denies Assessor and Vendor before database access', async () => {
  for (const role of ['assessor','vendor']) {const r = await overviewHandler({httpMethod: 'GET', headers: {authorization: `Bearer ${token({role})}`}, queryStringParameters: {view: 'overview'}}); assert.equal(r.statusCode, 403);}
});
test('existing overview handler refuses expired and invalid signatures', async () => {
  for (const value of [token({exp: 1}), jwt.sign({role: 'manager'}, 'a-different-fake-secret-with-32-chars')]) {const r = await overviewHandler({httpMethod: 'GET', headers: {authorization: `Bearer ${value}`}, queryStringParameters: {view: 'overview'}}); assert.equal(r.statusCode, 401);}
});
