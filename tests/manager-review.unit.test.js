import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handler as approve } from '../netlify/functions/approve-evaluation.js';
import { handler as vendorPortal } from '../netlify/functions/vendor-portal-data.js';
import { generateToken, ROLE_MANAGER, ROLE_VENDOR } from '../netlify/functions/auth.js';
import { connectToDatabase, closeDatabaseConnection, createVendorRecord, COLLECTION_NAME, buildMongoIdFilter } from '../netlify/functions/db.js';

describe('Manager review comment persistence and privacy', () => {
  const id = `review-audit-${Date.now()}`;
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Audit Reviewer' });
  let connection, vendor;
  before(async () => {
    connection = await connectToDatabase();
    const doc = { _id: id, companyName: 'Review Audit Fleet', status: 'pending_review', currentVersion: 1, breakdown: Array.from({ length: 33 }, (_, i) => ({ id: String(i), raw: 1, comment: 'Internal assessor evidence' })), createdAt: new Date().toISOString() };
    if (connection.isMongoAtlas) await connection.db.collection(COLLECTION_NAME).insertOne(doc);
    else await connection.insertEvaluation(doc);
    await connection.insertAssessmentVersion({ evaluationId: id, versionNumber: 1, breakdown: doc.breakdown });
    vendor = await createVendorRecord(connection, { companyName: doc.companyName, contactEmail: `${id}@audit.test`, isActive: true, linkedRegistrationIds: [id] });
  });
  after(async () => {
    if (connection?.isMongoAtlas) {
      await connection.db.collection(COLLECTION_NAME).deleteOne(buildMongoIdFilter(id));
      await connection.db.collection('vendors').deleteOne(buildMongoIdFilter(String(vendor._id)));
    } else if (connection) await connection.deleteEvaluation(id);
    await closeDatabaseConnection();
  });
  const submit = payload => approve({ httpMethod: 'POST', headers: { authorization: `Bearer ${managerToken}` }, body: JSON.stringify({ id, action: 'approve', ...payload }) });
  async function readRecord() {
    return connection.isMongoAtlas ? connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(id)) : connection.getEvaluationById(id);
  }
  it('rejects non-text or oversized review comments without advancing status', async () => {
    for (const managerReviewComment of [{ unexpected: true }, 'x'.repeat(2001)]) assert.equal((await submit({ managerReviewComment })).statusCode, 400);
    assert.equal((await readRecord()).status, 'pending_review');
  });
  it('approval stores the comment and audit entry without changing assessor evidence', async () => {
    const before = await readRecord();
    const response = await submit({ managerReviewComment: '  Review completed <internal>  ' });
    assert.equal(response.statusCode, 200, response.body);
    const saved = await readRecord();
    assert.equal(saved.managerReviewComment, 'Review completed <internal>');
    assert.equal(saved.evaluationHistory.at(-1).managerReviewComment, saved.managerReviewComment);
    assert.deepEqual(saved.breakdown, before.breakdown);
  });
  it('Vendor APIs omit manager review comments and assessor evidence', async () => {
    const token = generateToken({ role: ROLE_VENDOR, vendorId: String(vendor._id), email: vendor.contactEmail, linkedRegistrationIds: [id] });
    const response = await vendorPortal({ httpMethod: 'GET', headers: { authorization: `Bearer ${token}` }, queryStringParameters: { id } });
    assert.equal(response.statusCode, 200, response.body);
    const body = JSON.parse(response.body);
    assert.equal(body.evaluation.managerReviewComment, undefined);
    assert.equal(body.evaluation.breakdown, undefined);
    assert.ok(!response.body.includes('Review completed'));
  });
});
