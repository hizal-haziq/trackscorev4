import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeManagerDashboard, requiresCertificateAction } from '../netlify/functions/manager-overview.js';
import { handler } from '../netlify/functions/get-evaluations.js';
import { generateToken } from '../netlify/functions/auth.js';
import { handler as lookup } from '../netlify/functions/lookup-evaluation.js';
import { connectToDatabase, closeDatabaseConnection } from '../netlify/functions/db.js';

test('empty Manager overview returns truthful zero metrics and no invented items', () => {
  const data = summarizeManagerDashboard([], []);
  assert.deepEqual(data.metrics, { active: 0, review: 0, dueSoon: 0, overdue: 0, unassigned: 0, certificates: 0, certificateReady: 0, certificateInProgress: 0 });
  assert.equal(data.slaSummary.complianceRate, '0%');
  for (const list of [data.attention, data.recent, data.schedule, data.workload.assessors]) assert.deepEqual(list, []);
});

test('overview totals use all records, independent of recent filters and eight-row display limit', () => {
  const records = Array.from({ length: 125 }, (_, i) => ({ _id: String(i), companyName: 'Company ' + i, status: 'pending_review' }));
  const data = summarizeManagerDashboard(records, [], { q: 'Company 124' });
  assert.equal(data.metrics.active, 125);
  assert.equal(data.metrics.review, 125);
  assert.equal(data.recentTotal, 1);
  assert.equal(data.recent[0]._id, '124');
  assert.equal(data.attentionTotal, 125);
  assert.equal(data.attention.length, 8);
});

test('simple review/revision filters include existing status variants without changing enums', () => {
  const records = ['submitted', 'pending_review', 'rejected', 'remediation_required', 'completed'].map((status, i) => ({ _id: String(i), status }));
  assert.deepEqual(summarizeManagerDashboard(records, [], { overviewStatus: 'review' }).recent.map(r => r.status), ['submitted', 'pending_review']);
  assert.deepEqual(summarizeManagerDashboard(records, [], { overviewStatus: 'revision' }).recent.map(r => r.status), ['rejected', 'remediation_required']);
});

test('certificate queue depends on approval rather than historical payment', () => {
  const data = summarizeManagerDashboard([
    { _id: 'pending', status: 'pending_review', payment: { status: 'paid' } },
    { _id: 'approved', status: 'approved', approvedVersion: 2 },
    { _id: 'legacy', status: 'payment_confirmed', approvedVersion: 1, payment: { status: 'unpaid' } },
    { _id: 'finished', status: 'completed', approvedVersion: 1, certificate: { sentToCustomerDate: '2026-01-01' } }
  ], []);
  assert.equal(data.metrics.payments, undefined);
  assert.equal(data.metrics.certificates, 2);
  assert.equal(requiresCertificateAction({ status: 'pending_review', payment: { status: 'paid' } }), false);
});

test('today schedule uses Malaysia dates, sorts time, and excludes finished appointments', () => {
  const data = summarizeManagerDashboard([
    { _id: 'later', status: 'scheduled', scheduledDate: '2026-10-01T03:00:00Z' },
    { _id: 'earlier', status: 'scheduled', scheduledDate: '2026-09-30T23:00:00Z' },
    { _id: 'yesterday', status: 'scheduled', scheduledDate: '2026-09-30T15:00:00Z' },
    { _id: 'invalid', status: 'scheduled', scheduledDate: 'bad date' },
    { _id: 'finished', status: 'completed', scheduledDate: '2026-10-01T01:00:00Z' }
  ], [], {}, new Date('2026-10-01T01:00:00Z'));
  assert.deepEqual(data.schedule.map(r => r._id), ['earlier', 'later']);
});

test('workload uses existing configured capacity and includes available registered Assessors', () => {
  const records = Array.from({ length: 6 }, (_, i) => ({ _id: String(i), companyName: 'Company ' + i, status: 'assigned', assignedAssessorId: 'A1' }));
  const data = summarizeManagerDashboard(records, [{ _id: 'user1', assessorId: 'A1', name: 'Busy Assessor' }, { _id: 'user2', assessorId: 'A2', name: 'Available Assessor' }]);
  assert.equal(data.workload.assessors[0].workload.active, 6);
  assert.equal(data.workload.assessors[0].workload.isOverCapacity, true);
  assert.equal(data.workload.assessors[1].workload.active, 0);
});

test('overdue review outranks other tasks and revisions remain active', () => {
  const now = Date.now();
  const data = summarizeManagerDashboard([
    { _id: 'payment', status: 'pre_final_sent', payment: { status: 'pending_verification' }, slaDeadline: new Date(now + 86400000 * 5).toISOString() },
    { _id: 'overdue', status: 'pending_review', slaDeadline: new Date(now - 86400000).toISOString() },
    { _id: 'revision', status: 'rejected', slaDeadline: new Date(now + 86400000 * 5).toISOString() }
  ], []);
  assert.equal(data.attention[0]._id, 'overdue');
  assert.equal(data.attention[0].action, 'Review');
  assert.equal(data.metrics.active, 3);
  assert.equal(data.metrics.overdue, 1);
});

test('Assessor and unauthenticated callers cannot access Manager overview', async () => {
  const token = generateToken({ id: 'assessor-fixture', name: 'Fixture', role: 'assessor', assessorId: 'A1' });
  assert.equal((await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer ' + token }, queryStringParameters: { view: 'overview' } })).statusCode, 403);
  assert.equal((await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { view: 'overview' } })).statusCode, 401);
});

test('Manager full-detail shortcuts preserve modal metadata without widening other roles', async () => {
  const connection = await connectToDatabase();
  assert.equal(connection.isMongoAtlas, false);
  const id = 'manager-overview-detail-' + Date.now();
  try {
    await connection.insertEvaluation({ _id: id, companyName: 'Isolated detail fixture', status: 'pending_review', assessorId: 'A1', preFinalSkipped: true, assignedAssessorName: 'Assigned fixture', contactEmail: 'fixture@audit.test', scheduledDate: '2026-10-01' });
    const request = role => lookup({ httpMethod: 'GET', headers: { authorization: 'Bearer ' + generateToken({ id: 'fixture-user', role, assessorId: 'A1' }) }, queryStringParameters: { id, fullDetails: 'true' } });
    const manager = await request('manager'); assert.equal(manager.statusCode, 200);
    const record = JSON.parse(manager.body).data[0];
    assert.equal(record.preFinalSkipped, undefined); assert.equal(record.contactEmail, 'fixture@audit.test'); assert.equal(record.assignedAssessorName, 'Assigned fixture');
    const assessor = await request('assessor'); assert.equal(assessor.statusCode, 200);
    assert.equal(JSON.parse(assessor.body).data[0].preFinalSkipped, undefined);
    assert.equal((await request('vendor')).statusCode, 403);
  } finally { await connection.deleteEvaluation(id); await closeDatabaseConnection(); }
});
