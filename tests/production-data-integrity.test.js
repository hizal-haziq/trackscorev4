import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectToDatabase, closeDatabaseConnection, runLifecycleMigration } from '../netlify/functions/db.js';
import { computeSlaAggregateSummary } from '../netlify/functions/sla.js';
import { handler as submitInquiry } from '../netlify/functions/submit-inquiry.js';
import { handler as manageInquiry } from '../netlify/functions/manage-inquiries.js';
import { generateToken } from '../netlify/functions/auth.js';

test('empty SLA data has zero completed records and zero compliance', () => {
  const summary = computeSlaAggregateSummary([]);
  assert.equal(summary.totalEvaluations, 0);
  assert.equal(summary.totalCompleted, 0);
  assert.equal(summary.complianceRate, '0%');
});

test('legacy migration preserves real certificates and does not invent absent certificates', async () => {
  const connection = await connectToDatabase();
  assert.equal(connection.isMongoAtlas, false, 'Run through npm test isolated storage');
  const ids = [`migration-missing-${Date.now()}`, `migration-real-${Date.now()}`];
  const certificate = { certificateNumber: 'TEST-MIGRATION-EXISTING', signedBy: 'Test signatory', signedDate: '2026-01-01' };
  try {
    await connection.insertEvaluation({ _id: ids[0], status: 'approved', companyName: 'Migration test fixture' });
    await connection.insertEvaluation({ _id: ids[1], status: 'approved', companyName: 'Migration test fixture', certificate });
    await runLifecycleMigration(null, false);
    const missing = await connection.getEvaluationById(ids[0]);
    assert.equal(missing.status, 'completed');
    assert.equal(missing.certificate, undefined);
    assert.equal(missing.package, undefined);
    assert.deepEqual((await connection.getEvaluationById(ids[1])).certificate, certificate);
  } finally {
    for (const id of ids) await connection.deleteEvaluation(id);
    await closeDatabaseConnection();
  }
});

test('public inquiry converts to an actual registration using JSON storage', async () => {
  try {
    const created = await submitInquiry({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ companyName: 'Isolated conversion fixture', officeAddress: 'Fixture address', state: 'Selangor', contactPerson: 'Fixture contact', contactEmail: `conversion-${Date.now()}@audit.test`, contactPhone: '0123456789', deviceModel: 'Fixture model' }) });
    assert.equal(created.statusCode, 201, created.body);
    const inquiry = JSON.parse(created.body);
    const response = await manageInquiry({ httpMethod: 'POST', headers: { authorization: `Bearer ${generateToken({ role: 'manager', name: 'Fixture reviewer' })}` }, body: JSON.stringify({ action: 'convert', inquiryId: inquiry.inquiryId || inquiry.id || inquiry.inquiry?._id, selectedPackage: 'package_1' }) });
    assert.equal(response.statusCode, 200, response.body);
    const connection = await connectToDatabase();
    const record = (await connection.getEvaluations()).find(r => r.companyName === 'Isolated conversion fixture');
    assert.ok(record); assert.equal(record.status, 'registered'); assert.equal(record.certificate, null);
  } finally { await closeDatabaseConnection(); }
});
