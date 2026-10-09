import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectToDatabase, closeDatabaseConnection } from '../netlify/functions/db.js';
import { generateToken } from '../netlify/functions/auth.js';
import { handler as issue } from '../netlify/functions/issue-certificate.js';
import { handler as approve } from '../netlify/functions/approve-evaluation.js';
import { handler as verify } from '../netlify/functions/verify-payment.js';
import { handler as submit } from '../netlify/functions/vendor-submit-payment.js';
import { handler as notice } from '../netlify/functions/send-pre-final.js';
import { omitRetiredWorkflow } from '../netlify/functions/retired-workflow.js';
import { handler as evaluations } from '../netlify/functions/get-evaluations.js';
import { handler as documents } from '../netlify/functions/vendor-documents.js';

test('approval replaces payment gate and preserves approved version, RBAC and sequential certificate processing', async () => {
  const db = await connectToDatabase(); assert.equal(db.isMongoAtlas, false);
  const id = 'certificate-approval-' + Date.now();
  const historical = { status: 'unpaid', referenceNumber: 'historical-only' };
  const call = (handler, body, role = 'manager') => handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + generateToken({ role, name: 'Isolated Reviewer', assessorId: 'AAA 1234' }) }, body: JSON.stringify({ id, ...body }) });
  try {
    await db.insertEvaluation({ _id: id, companyName: 'Isolated workflow', deviceModel: 'Test device', currentVersion: 2, status: 'pending_review', payment: historical });
    await db.insertAssessmentVersion({ evaluationId: id, versionNumber: 2, breakdown: Array.from({ length: 33 }, (_, i) => ({ id: String(i), points: 0 })) });
    assert.equal((await call(issue, { step: 'prepare', paymentOverride: true, overrideReason: 'Must not bypass approval' })).statusCode, 400);
    assert.equal((await call(approve, { action: 'approve' })).statusCode, 200);
    assert.equal((await db.getEvaluationById(id)).status, 'approved');
    for (const role of ['assessor', 'vendor']) for (const step of ['prepare', 'print', 'sign', 'deliver']) assert.equal((await call(issue, { step, signedBy: 'Signatory' }, role)).statusCode, 403);
    for (const step of ['print', 'sign', 'deliver', 'complete_all']) assert.equal((await call(issue, { step, signedBy: 'Signatory' })).statusCode, 400);
    for (const step of ['prepare', 'print', 'sign', 'deliver']) {
      const res = await call(issue, { step, signedBy: 'Signatory' }); assert.equal(res.statusCode, 200, res.body);
      assert.equal(JSON.parse(res.body).certificate.certifiedVersion, 2);
      assert.deepEqual((await db.getEvaluationById(id)).payment, historical);
    }
    assert.equal((await db.getEvaluationById(id)).status, 'completed');
    assert.equal((await call(issue, { step: 'prepare' })).statusCode, 400);
    const before = await db.getEvaluationById(id);
    for (const handler of [verify, submit, notice]) assert.equal((await call(handler, { evaluationId: id, amount: 4500 })).statusCode, 410);
    assert.deepEqual(await db.getEvaluationById(id), before);
  } finally { await db.deleteEvaluation(id); await closeDatabaseConnection(); }
});

test('historical stages require real approved version and missing certificate details fail safely', async () => {
  const db = await connectToDatabase(), id = 'certificate-legacy-' + Date.now();
  const call = () => issue({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + generateToken({ role: 'manager' }) }, body: JSON.stringify({ id, step: 'prepare' }) });
  try {
    await db.insertEvaluation({ _id: id, status: 'payment_confirmed', payment: { status: 'paid' } });
    assert.equal((await call()).statusCode, 400);
    await db.updateEvaluation(id, { approvedVersion: 1, companyName: 'Legacy', deviceModel: 'Device' });
    assert.equal((await call()).statusCode, 400);
    await db.insertAssessmentVersion({ evaluationId: id, versionNumber: 1, breakdown: Array.from({ length: 33 }, (_, i) => ({ id: String(i) })) });
    assert.equal((await call()).statusCode, 200);
    assert.equal((await db.getEvaluationById(id)).status, 'payment_confirmed');
  } finally { await db.deleteEvaluation(id); await closeDatabaseConnection(); }
});

test('retired fields and historical payment proof are omitted without mutating source data', () => {
  const source = { payment: { status: 'paid' }, invoice: { invoiceNumber: 'REF', paymentStatus: 'paid', verifiedAt: 'old' }, documents: [{ category: 'payment_proof' }, { category: 'device_spec' }], statusHistory: [{ status: 'payment_confirmed', note: 'Payment verified' }, { status: 'approved', note: 'Approved' }] };
  const saved = structuredClone(source), active = omitRetiredWorkflow(source);
  assert.equal(active.payment, undefined); assert.deepEqual(active.invoice, { invoiceNumber: 'REF' });
  assert.equal(active.documents.length, 1); assert.equal(active.statusHistory.length, 1); assert.deepEqual(source, saved);
});

test('approved records stay separate from completed records and historical proof cannot be accessed or deleted', async () => {
  const db = await connectToDatabase(), id = 'retired-proof-' + Date.now();
  const headers = { authorization: 'Bearer ' + generateToken({ role: 'manager' }) };
  const stored = { _id: id, companyName: id, status: 'payment_confirmed', approvedVersion: 1, payment: { status: 'paid' }, documents: [{ id: 'historical-proof', name: 'receipt.pdf', category: 'payment_proof' }] };
  try {
    await db.insertEvaluation(stored);
    const list = async status => JSON.parse((await evaluations({ httpMethod: 'GET', headers, queryStringParameters: { q: id, status } })).body);
    assert.equal((await list('approved')).data.length, 1);
    assert.equal((await list('completed')).data.length, 0);
    const active = (await list('approved')).data[0]; assert.equal(active.payment, undefined); assert.deepEqual(active.documents, []);
    const queryStringParameters = { evaluationId: id };
    const listed = await documents({ httpMethod: 'GET', headers, queryStringParameters });
    assert.deepEqual(JSON.parse(listed.body).documents, []);
    assert.equal((await documents({ httpMethod: 'GET', headers, queryStringParameters: { ...queryStringParameters, docId: 'historical-proof', action: 'download' } })).statusCode, 404);
    assert.equal((await documents({ httpMethod: 'POST', headers, body: JSON.stringify({ evaluationId: id, action: 'delete', docId: 'historical-proof' }) })).statusCode, 410);
    for (const category of ['payment_proof', ' Payment_Proof ']) {
      assert.equal((await documents({ httpMethod: 'POST', headers, body: JSON.stringify({ evaluationId: id, category, name: 'receipt.pdf', fileType: 'application/pdf', fileData: Buffer.from('unused').toString('base64') }) })).statusCode, 400);
    }
    assert.deepEqual((await db.getEvaluationById(id)).documents, stored.documents);
    assert.deepEqual((await db.getEvaluationById(id)).payment, stored.payment);
  } finally { await db.deleteEvaluation(id); await closeDatabaseConnection(); }
});
