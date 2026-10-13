import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import {
  prepareCertificate,
  markPrintedCertificate,
  recordSignature,
  deliverCertificate,
  requireManager,
  ensureCertificatePdfLoaded,
  downloadCertificatePdf
} from '../src/services/certificateActions.ts';
import { connectToDatabase, createAssessmentVersionRecord } from '../netlify/functions/db.js';
import { handler as issueHandler } from '../netlify/functions/issue-certificate.js';
import { handler as verifyHandler } from '../netlify/functions/verify-certificate.js';

const originalFetch = globalThis.fetch;
const prefix = 'phased-unit-';

const criteria33 = Array.from({ length: 33 }, (_, i) => ({
  id: `c-${i + 1}`,
  name: `Criterion ${i + 1}`,
  section: i < 15 ? 'A' : 'B',
  points: 1,
  selectedOption: 'Yes',
  comment: `Verified evidence ${i + 1}`
}));

function session(role = 'manager') {
  const token = jwt.sign(
    { role, name: 'Unit Phase D Manager', assessorId: 'MGR-01' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
  const values = new Map([
    ['trackscore_token', token],
    ['trackscore_user_role', role],
    ['trackscore_user', JSON.stringify({ name: 'Unit Phase D Manager', role })]
  ]);
  const target = new EventTarget();
  globalThis.window = {
    localStorage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k)
    },
    sessionStorage: { removeItem() {} },
    dispatchEvent: (e) => target.dispatchEvent(e)
  };
  return token;
}

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

beforeEach(() => session());
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.window;
});

after(async () => {
  for (const name of ['evaluations', 'assessment_versions', 'assessment_risk']) {
    const path = '.data/' + name + '.json';
    if (fs.existsSync(path)) {
      try {
        const rows = JSON.parse(fs.readFileSync(path, 'utf8'));
        fs.writeFileSync(
          path,
          JSON.stringify(
            rows.filter(
              (r) =>
                !String(r._id || '').startsWith(prefix) &&
                !String(r.evaluationId || '').startsWith(prefix)
            )
          )
        );
      } catch {}
    }
  }
});

// ==========================================
// 1. Client Service RBAC & Validation Tests
// ==========================================

test('requireManager allows Manager and throws 403 for Assessor and Vendor', () => {
  session('manager');
  assert.equal(requireManager().user.role, 'manager');

  session('assessor');
  assert.throws(() => requireManager(), (e) => e.status === 403);

  session('vendor');
  assert.throws(() => requireManager(), (e) => e.status === 403);
});

test('prepareCertificate sends valid payload and handles response', async () => {
  session('manager');
  let capturedBody = null;
  globalThis.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return response({
      success: true,
      message: 'Certificate prepared.',
      status: 'approved',
      certificate: {
        certificateNumber: 'TS-CERT-2026-TEST',
        preparedDate: '2026-10-12',
        certifiedVersion: 1
      }
    });
  };

  const result = await prepareCertificate({
    id: 'eval-123',
    certificateNumber: 'TS-CERT-2026-TEST',
    preparedDate: '2026-10-12'
  });

  assert.equal(result.success, true);
  assert.equal(capturedBody.id, 'eval-123');
  assert.equal(capturedBody.step, 'prepare');
  assert.equal(capturedBody.certificateNumber, 'TS-CERT-2026-TEST');
  assert.equal(capturedBody.preparedDate, '2026-10-12');
});

test('markPrintedCertificate sends valid payload and handles response', async () => {
  session('manager');
  let capturedBody = null;
  globalThis.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return response({
      success: true,
      message: 'Certificate printed.',
      status: 'approved',
      certificate: { printedDate: '2026-10-12' }
    });
  };

  const result = await markPrintedCertificate({
    id: 'eval-123',
    printedDate: '2026-10-12'
  });

  assert.equal(result.success, true);
  assert.equal(capturedBody.id, 'eval-123');
  assert.equal(capturedBody.step, 'print');
  assert.equal(capturedBody.printedDate, '2026-10-12');
});

test('recordSignature enforces non-empty signatory name client-side', async () => {
  session('manager');
  await assert.rejects(
    async () => recordSignature({ id: 'eval-123', signedBy: '' }),
    (err) => err.message.includes('Signatory name is required')
  );

  await assert.rejects(
    async () => recordSignature({ id: 'eval-123', signedBy: '   ' }),
    (err) => err.message.includes('Signatory name is required')
  );
});

test('recordSignature sends valid payload and handles response', async () => {
  session('manager');
  let capturedBody = null;
  globalThis.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return response({
      success: true,
      message: 'Signature recorded.',
      status: 'certificate_issued',
      certificate: { signedBy: 'Dato Ts. Dr. Siti', signedDate: '2026-10-12' }
    });
  };

  const result = await recordSignature({
    id: 'eval-123',
    signedBy: 'Dato Ts. Dr. Siti',
    signedDate: '2026-10-12'
  });

  assert.equal(result.success, true);
  assert.equal(capturedBody.id, 'eval-123');
  assert.equal(capturedBody.step, 'sign');
  assert.equal(capturedBody.signedBy, 'Dato Ts. Dr. Siti');
  assert.equal(capturedBody.signedDate, '2026-10-12');
});

test('deliverCertificate validates notes length client-side', async () => {
  session('manager');
  const longNotes = 'a'.repeat(2001);
  await assert.rejects(
    async () => deliverCertificate({ id: 'eval-123', notes: longNotes }),
    (err) => err.message.includes('2000 characters')
  );
});

test('deliverCertificate sends valid payload and handles response', async () => {
  session('manager');
  let capturedBody = null;
  globalThis.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return response({
      success: true,
      message: 'Delivered to customer.',
      status: 'completed',
      certificate: { sentToCustomerDate: '2026-10-12' }
    });
  };

  const result = await deliverCertificate({
    id: 'eval-123',
    deliveryMethod: 'Official Email & Physical Courier',
    sentToCustomerDate: '2026-10-12',
    notes: 'Tracking #MY998877'
  });

  assert.equal(result.success, true);
  assert.equal(capturedBody.id, 'eval-123');
  assert.equal(capturedBody.step, 'deliver');
  assert.equal(capturedBody.deliveryMethod, 'Official Email & Physical Courier');
  assert.equal(capturedBody.notes, 'Tracking #MY998877');
});

// ==========================================
// 2. Full Server-Side Lifecycle Integration
// ==========================================

test('Complete Certificate Lifecycle: Prepare -> Print -> Sign -> Deliver', async () => {
  const token = session('manager');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const evalId = `${prefix}lifecycle-eval`;
  const certNumber = 'TS-CERT-2026-9999';

  const connection = await connectToDatabase();
  await connection.insertEvaluation({
    _id: evalId,
    companyName: 'Phase D Transport Sdn Bhd',
    deviceModel: 'Tracker Pro V4',
    status: 'approved',
    currentVersion: 1,
    approvedVersion: 1,
    totalScore: 92,
    starsCount: 4,
    ratingLabel: 'Silver Star Telematics Standard',
    breakdown: criteria33,
    certificate: {}
  });

  await createAssessmentVersionRecord(connection, {
    evaluationId: evalId,
    versionNumber: 1,
    breakdown: criteria33,
    scores: { totalScore: 92, starsCount: 4 },
    action: 'manager_approved',
    isApprovedVersion: true
  });

  // Guardrail check: Cannot print or sign or deliver out of order before preparing
  const outOfOrderPrint = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({ id: evalId, step: 'print' })
  });
  assert.equal(outOfOrderPrint.statusCode, 400);
  assert.match(JSON.parse(outOfOrderPrint.body).error, /Sequential error/i);

  const outOfOrderSign = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({ id: evalId, step: 'sign', signedBy: 'Director' })
  });
  assert.equal(outOfOrderSign.statusCode, 400);
  assert.match(JSON.parse(outOfOrderSign.body).error, /Sequential error/i);

  // STEP 1: PREPARE
  const prepRes = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({
      id: evalId,
      step: 'prepare',
      certificateNumber: certNumber,
      preparedDate: '2026-10-12T08:00:00.000Z'
    })
  });
  assert.equal(prepRes.statusCode, 200);
  const prepData = JSON.parse(prepRes.body);
  assert.equal(prepData.success, true);
  assert.equal(prepData.status, 'approved'); // Status remains approved
  assert.equal(prepData.certificate.certificateNumber, certNumber);
  assert.equal(prepData.certificate.certifiedVersion, 1);
  assert.ok(prepData.certificate.preparedDate);

  // Public verification should NOT yet verify un-signed certificate
  const earlyVerify = await verifyHandler({
    httpMethod: 'GET',
    queryStringParameters: { cert: certNumber }
  });
  assert.equal(earlyVerify.statusCode, 404);

  // STEP 2: PRINT
  const printRes = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({
      id: evalId,
      step: 'print',
      printedDate: '2026-10-12T09:00:00.000Z'
    })
  });
  assert.equal(printRes.statusCode, 200);
  const printData = JSON.parse(printRes.body);
  assert.equal(printData.success, true);
  assert.equal(printData.status, 'approved'); // Status remains approved
  assert.ok(printData.certificate.printedDate);

  // STEP 3: SIGN
  // Try signing without signatory name -> 400
  const missingSignNameRes = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({ id: evalId, step: 'sign', signedBy: '' })
  });
  assert.equal(missingSignNameRes.statusCode, 400);

  // Valid sign
  const signRes = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({
      id: evalId,
      step: 'sign',
      signedBy: "Dato' Ts. Dr. Siti Zaharah Ishak",
      signedDate: '2026-10-12T10:00:00.000Z'
    })
  });
  assert.equal(signRes.statusCode, 200);
  const signData = JSON.parse(signRes.body);
  assert.equal(signData.success, true);
  assert.equal(signData.status, 'certificate_issued'); // Advances to certificate_issued!
  assert.equal(signData.certificate.signedBy, "Dato' Ts. Dr. Siti Zaharah Ishak");
  assert.ok(signData.certificate.signedDate);

  // Public verification check: Should NOW successfully verify!
  const publicVerify = await verifyHandler({
    httpMethod: 'GET',
    queryStringParameters: { cert: certNumber }
  });
  assert.equal(publicVerify.statusCode, 200);
  const verifyData = JSON.parse(publicVerify.body);
  assert.equal(verifyData.valid, true);
  assert.equal(verifyData.certificate.certificateNumber, certNumber);
  assert.equal(verifyData.certificate.companyName, 'Phase D Transport Sdn Bhd');
  assert.equal(verifyData.certificate.deviceModel, 'Tracker Pro V4');
  assert.equal(verifyData.certificate.signedBy, "Dato' Ts. Dr. Siti Zaharah Ishak");
  assert.equal(verifyData.certificate.starRating, 4);
  // Ensure private data is omitted
  assert.equal(verifyData.certificate.assessorId, undefined);
  assert.equal(verifyData.certificate.breakdown, undefined);
  assert.equal(verifyData.certificate.internalNotes, undefined);

  // STEP 4: DELIVER
  // Long notes check -> 400
  const longNotesRes = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({
      id: evalId,
      step: 'deliver',
      notes: 'x'.repeat(2001)
    })
  });
  assert.equal(longNotesRes.statusCode, 400);

  // Valid deliver
  const deliverRes = await issueHandler({
    httpMethod: 'POST',
    headers,
    body: JSON.stringify({
      id: evalId,
      step: 'deliver',
      deliveryMethod: 'Official Email & Physical Courier',
      sentToCustomerDate: '2026-10-12T11:00:00.000Z',
      notes: 'Handed over with tracking ref #CR-8899.'
    })
  });
  assert.equal(deliverRes.statusCode, 200);
  const deliverData = JSON.parse(deliverRes.body);
  assert.equal(deliverData.success, true);
  assert.equal(deliverData.status, 'completed'); // Advances to completed!
  assert.equal(deliverData.certificate.deliveryMethod, 'Official Email & Physical Courier');
  assert.equal(deliverData.certificate.notes, 'Handed over with tracking ref #CR-8899.');

  // Completed record must still be publicly verifiable
  const completedVerify = await verifyHandler({
    httpMethod: 'GET',
    queryStringParameters: { cert: certNumber }
  });
  assert.equal(completedVerify.statusCode, 200);
  assert.equal(JSON.parse(completedVerify.body).valid, true);
});
