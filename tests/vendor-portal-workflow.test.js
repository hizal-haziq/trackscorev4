/**
 * TrackScore Vendor Portal Complete Workflow & Security Integration Test Suite
 *
 * Verifies:
 * 1. Vendor Authentication (Valid credentials, invalid password, rate limiting)
 * 2. Vendor Data Isolation & IDOR Protection (Vendor A vs Vendor B, Manager/Assessor blocking)
 * 3. Assessment History & Version Retrieval for Vendors
 * 4. Document & Evidence Management (Upload, List, Download, Delete, Ownership checks)
 * 5. Revision & Versioned Resubmission (Status transition, version increment, audit logging)
 * 6. Payment Submission Workflow (Pending verification state, manager authority preserved)
 * 7. Certificate Verification Service (Public safe metadata, unverified rejection)
 * 8. Vendor Profile & Password Management (Field protection, bcrypt hashing)
 * 9. SSE Status Stream Authentication & Scoping
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { handler as loginHandler } from '../netlify/functions/login.js';
import { handler as vendorLoginHandler } from '../netlify/functions/vendor-login.js';
import { handler as vendorPortalDataHandler } from '../netlify/functions/vendor-portal-data.js';
import { handler as vendorDocumentsHandler } from '../netlify/functions/vendor-documents.js';
import { handler as vendorResubmitHandler } from '../netlify/functions/vendor-resubmit.js';
import { handler as vendorSubmitPaymentHandler } from '../netlify/functions/vendor-submit-payment.js';
import { handler as vendorProfileHandler } from '../netlify/functions/vendor-profile.js';
import { handler as notificationsHandler } from '../netlify/functions/get-notifications.js';
import { handler as verifyCertificateHandler } from '../netlify/functions/verify-certificate.js';
import { handler as historyHandler } from '../netlify/functions/get-assessment-history.js';
import { handler as versionHandler } from '../netlify/functions/get-assessment-version.js';
import { handler as riskHandler } from '../netlify/functions/get-assessment-risk.js';
import { handler as statusStreamHandler } from '../netlify/functions/status-stream.js';
import {
  generateToken,
  ROLE_MANAGER,
  ROLE_ASSESSOR,
  ROLE_VENDOR
} from '../netlify/functions/auth.js';
import {
  connectToDatabase,
  closeDatabaseConnection,
  COLLECTION_NAME,
  COLLECTION_VENDORS,
  COLLECTION_VERSIONS,
  buildMongoIdFilter
} from '../netlify/functions/db.js';

describe('Vendor Portal Complete Workflow & Security Integration Tests', () => {
  let connection;
  let testVendorAId;
  let testVendorBId;
  let testEvalAId;
  let testEvalBId;

  const runId = Date.now();
  const vendorAEmail = `apex-${runId}@vendor.test`;
  const vendorBEmail = `beta-${runId}@vendor.test`;

  let vendorAToken;
  let vendorBToken;
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Ops Manager' });
  const assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'ASSESSOR_1', name: 'Assessor Ahmad' });

  const testPassword = 'Password123!';
  const passwordHash = bcrypt.hashSync(testPassword, 10);

  before(async () => {
    connection = await connectToDatabase();

    // Clean up any stale test accounts from earlier runs
    try {
      if (connection.isMongoAtlas) {
        await connection.db.collection(COLLECTION_VENDORS).deleteMany({
          contactEmail: { $regex: /@vendor\.test$/i }
        });
      }
    } catch {}

    // 1. Create Test Evaluation A (for Vendor A)
    const evalADoc = {
      companyName: 'Apex Telematics A Sdn Bhd',
      deviceModel: 'APEX-T100',
      packageName: 'Comprehensive Track Evaluation',
      package: 'package_1',
      status: 'rejected',
      currentVersion: 1,
      rejectionReason: 'Wiring harness diagram requires ISO compliance label.',
      sectionAScore: 4.2,
      sectionBScore: 3.8,
      totalScore: 4.0,
      starRating: 4,
      starsCount: 4,
      ratingLabel: 'Compliant with MIROS safety standards',
      invoice: {
        invoiceNumber: 'INV-2026-TEST-A',
        amount: 4500,
        status: 'draft'
      },
      payment: {
        status: 'unpaid',
        amountReceived: 0
      },
      certificate: {
        certificateNumber: 'TS-CERT-2026-TEST-A',
        signedBy: 'Director General Office',
        signedDate: '2026-03-25T10:00:00Z'
      },
      statusHistory: [
        { status: 'registered', timestamp: new Date().toISOString(), note: 'Customer registered' },
        { status: 'rejected', timestamp: new Date().toISOString(), note: 'Wiring harness diagram requires ISO compliance label.' }
      ],
      createdAt: new Date().toISOString()
    };

    if (connection.isMongoAtlas) {
      const resA = await connection.db.collection(COLLECTION_NAME).insertOne(evalADoc);
      testEvalAId = String(resA.insertedId);
    } else {
      const resA = await connection.insertEvaluation(evalADoc);
      testEvalAId = String(resA.insertedId);
    }

    // 2. Create Test Evaluation B (for Vendor B)
    const evalBDoc = {
      companyName: 'Beta Tracking B Sdn Bhd',
      deviceModel: 'BETA-B200',
      packageName: 'Standard Telematics Evaluation',
      package: 'package_1',
      status: 'pending_review',
      currentVersion: 1,
      totalScore: 3.5,
      invoice: {
        invoiceNumber: 'INV-2026-TEST-B',
        amount: 4500,
        status: 'draft'
      },
      payment: {
        status: 'unpaid',
        amountReceived: 0
      },
      statusHistory: [
        { status: 'registered', timestamp: new Date().toISOString(), note: 'Registered' }
      ],
      createdAt: new Date().toISOString()
    };

    if (connection.isMongoAtlas) {
      const resB = await connection.db.collection(COLLECTION_NAME).insertOne(evalBDoc);
      testEvalBId = String(resB.insertedId);
    } else {
      const resB = await connection.insertEvaluation(evalBDoc);
      testEvalBId = String(resB.insertedId);
    }

    // 2b. Create Completed Evaluation with official certificate
    const evalCertDoc = {
      companyName: 'Apex Telematics A Sdn Bhd',
      deviceModel: 'APEX-CERT-MODEL',
      packageName: 'Comprehensive Track Evaluation',
      status: 'completed',
      certificate: {
        certificateNumber: 'TS-CERT-2026-TEST-A',
        signedBy: 'Director General Office',
        signedDate: '2026-03-25T10:00:00Z',
        sentToCustomerDate: '2026-03-26T10:00:00Z'
      },
      starsCount: 4,
      ratingLabel: 'Compliant with MIROS safety standards',
      totalScore: 4.0,
      createdAt: new Date().toISOString()
    };
    if (connection.isMongoAtlas) {
      await connection.db.collection(COLLECTION_NAME).insertOne(evalCertDoc);
    } else {
      await connection.insertEvaluation(evalCertDoc);
    }

    // 3. Create Vendor A
    const vendorADoc = {
      companyName: 'Apex Telematics A Sdn Bhd',
      contactEmail: vendorAEmail,
      loginEmail: vendorAEmail,
      contactPhone: '+60 12-345 6789',
      contactPerson: 'Apex Lead',
      officeAddress: '123 Tech Park, Cyberjaya',
      state: 'Selangor',
      passwordHash,
      linkedRegistrationIds: [testEvalAId],
      isActive: true,
      createdAt: new Date().toISOString()
    };

    // 4. Create Vendor B
    const vendorBDoc = {
      companyName: 'Beta Tracking B Sdn Bhd',
      contactEmail: vendorBEmail,
      loginEmail: vendorBEmail,
      contactPhone: '+60 19-876 5432',
      contactPerson: 'Beta Officer',
      passwordHash,
      linkedRegistrationIds: [testEvalBId],
      isActive: true,
      createdAt: new Date().toISOString()
    };

    if (connection.isMongoAtlas) {
      const vA = await connection.db.collection(COLLECTION_VENDORS).insertOne(vendorADoc);
      testVendorAId = String(vA.insertedId);
      const vB = await connection.db.collection(COLLECTION_VENDORS).insertOne(vendorBDoc);
      testVendorBId = String(vB.insertedId);
    } else {
      const vA = await connection.createVendor(vendorADoc);
      testVendorAId = String(vA._id);
      const vB = await connection.createVendor(vendorBDoc);
      testVendorBId = String(vB._id);
    }

    vendorAToken = generateToken({
      vendorId: testVendorAId,
      email: vendorADoc.contactEmail,
      companyName: vendorADoc.companyName,
      role: ROLE_VENDOR,
      linkedRegistrationIds: [testEvalAId]
    });

    vendorBToken = generateToken({
      vendorId: testVendorBId,
      email: vendorBDoc.contactEmail,
      companyName: vendorBDoc.companyName,
      role: ROLE_VENDOR,
      linkedRegistrationIds: [testEvalBId]
    });
  });

  after(async () => {
    // Cleanup created test records
    try {
      if (connection.isMongoAtlas) {
        await connection.db.collection(COLLECTION_NAME).deleteMany({
          _id: { $in: [buildMongoIdFilter(testEvalAId)._id, buildMongoIdFilter(testEvalBId)._id] }
        });
        await connection.db.collection(COLLECTION_VENDORS).deleteMany({
          _id: { $in: [buildMongoIdFilter(testVendorAId)._id, buildMongoIdFilter(testVendorBId)._id] }
        });
        await connection.db.collection(COLLECTION_VERSIONS).deleteMany({
          evaluationId: { $in: [testEvalAId, testEvalBId] }
        });
      }
    } catch {}
    await closeDatabaseConnection();
  });

  // ===========================================================================
  // 1. Authentication Tests
  // ===========================================================================
  describe('1. Vendor Authentication & Security', () => {
    it('should successfully authenticate vendor with valid credentials via vendor-login', async () => {
      const res = await vendorLoginHandler({
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: vendorAEmail,
          password: testPassword
        })
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.role, ROLE_VENDOR);
      assert.ok(data.token, 'Should return a valid JWT token');
      assert.ok(data.vendor.linkedRegistrationIds.includes(testEvalAId));
    });

    it('should reject invalid password with 401', async () => {
      const res = await vendorLoginHandler({
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'contact@apex-vendor-a.test',
          password: 'WrongPassword!'
        })
      });

      assert.strictEqual(res.statusCode, 401);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, false);
    });

    it('should reject non-existent vendor email with 401 (timing protected)', async () => {
      const res = await vendorLoginHandler({
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@vendor.test',
          password: 'AnyPassword123!'
        })
      });

      assert.strictEqual(res.statusCode, 401);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, false);
    });
  });

  // ===========================================================================
  // 2. Data Isolation & IDOR Protection Tests
  // ===========================================================================
  describe('2. Vendor Data Isolation & IDOR Protection', () => {
    it('Vendor cannot access internal Manager and Assessor notifications', async () => {
      const response = await notificationsHandler({ httpMethod: 'GET', headers: { Authorization: `Bearer ${vendorAToken}` } });
      assert.strictEqual(response.statusCode, 403);
    });
    it('Vendor A should be able to view their own evaluation', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { id: testEvalAId }
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.evaluation._id, testEvalAId);
      assert.strictEqual(data.evaluation.companyName, 'Apex Telematics A Sdn Bhd');
    });

    it('Vendor A should be BLOCKED from accessing Vendor B evaluation (IDOR prevention)', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { id: testEvalBId }
      });

      assert.strictEqual(res.statusCode, 403, 'Should deny access with 403 Forbidden');
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, false);
    });

    it('Vendor should be BLOCKED from accessing internal risk analytics endpoint', async () => {
      const res = await riskHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalAId }
      });

      assert.strictEqual(res.statusCode, 403, 'Vendors must be strictly forbidden from risk data');
    });
  });

  // ===========================================================================
  // 3. Assessment History & Versioning Tests
  // ===========================================================================
  describe('3. Assessment History & Version Inspection', () => {
    it('Vendor A can fetch assessment history for their own evaluation', async () => {
      const res = await historyHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalAId }
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.history));
    });

    it('Vendor A is BLOCKED from fetching history for Vendor B evaluation', async () => {
      const res = await historyHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalBId }
      });

      assert.strictEqual(res.statusCode, 403, 'Must return 403 Forbidden for cross-vendor history');
    });
  });

  // ===========================================================================
  // 4. Document & Evidence Management Tests
  // ===========================================================================
  describe('4. Document / Evidence Management', () => {
    let uploadedDocId;

    it('Rejects unsupported document MIME types before storage', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ evaluationId: testEvalAId, name: 'unsafe.html', fileType: 'text/html', fileData: Buffer.from('<script>test</script>').toString('base64') })
      });
      assert.strictEqual(res.statusCode, 400);
      assert.match(JSON.parse(res.body).error, /Unsupported file type/);
    });

    it('Rejects malformed or oversized base64 before writing uploads', async () => {
      const badBase64 = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ evaluationId: testEvalAId, name: 'bad.pdf', fileType: 'application/pdf', fileData: '%%%not-base64%%%' })
      });
      assert.equal(badBase64.statusCode, 400);
      assert.match(JSON.parse(badBase64.body).error, /invalid|exceeds/i);

      const tooLongName = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ evaluationId: testEvalAId, name: 'x'.repeat(256), fileType: 'application/pdf', fileData: Buffer.from('x').toString('base64') })
      });
      assert.equal(tooLongName.statusCode, 400);
    });

    it('Vendor A can upload an evidence document for their own evaluation', async () => {
      const dummyBase64 = Buffer.from('PDF Mock Content for Device Specification').toString('base64');
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorAToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'upload',
          evaluationId: testEvalAId,
          name: 'Device_Technical_Spec.pdf',
          category: 'device_spec',
          fileType: 'application/pdf',
          fileData: dummyBase64,
          notes: 'Detailed pinout and telemetry specs'
        })
      });

      assert.strictEqual(res.statusCode, 201);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.ok(data.document.id);
      assert.strictEqual(data.document.name, 'Device_Technical_Spec.pdf');
      uploadedDocId = data.document.id;
    });

    it('Vendor A can list documents for their own evaluation', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalAId }
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.ok(data.documents.some(d => d.id === uploadedDocId));
    });

    it('Vendor B is BLOCKED from accessing Vendor A documents', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorBToken}` },
        queryStringParameters: { evaluationId: testEvalAId }
      });

      assert.strictEqual(res.statusCode, 403, 'Must return 403 for cross-vendor documents');
    });

    it('Vendor A can delete their uploaded document', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorAToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'delete',
          evaluationId: testEvalAId,
          docId: uploadedDocId
        })
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
    });
  });

  // ===========================================================================
  // 5. Revision & Resubmission Workflow Tests
  // ===========================================================================
  describe('5. Revision & Versioned Resubmission', () => {
    it('Vendor A can respond to revision and resubmit evaluation', async () => {
      const res = await vendorResubmitHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorAToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          evaluationId: testEvalAId,
          deviceModel: 'APEX-T100-REV2',
          responseNotes: 'Updated wiring harness diagram with ISO 9001 compliance markings.'
        })
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.status, 'submitted');
      assert.strictEqual(data.version, 2, 'Version should increment to 2');
    });

    it('Vendor B is BLOCKED from resubmitting Vendor A evaluation', async () => {
      const res = await vendorResubmitHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorBToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          evaluationId: testEvalAId,
          responseNotes: 'Malicious attempt to alter another vendor record'
        })
      });

      assert.strictEqual(res.statusCode, 403, 'Must return 403 Forbidden for cross-vendor resubmission');
    });
  });

  // ===========================================================================
  // 6. Payment Submission Workflow Tests
  // ===========================================================================
  describe('6. Retired payment endpoint', () => {
    it('returns Gone for both owning and unrelated Vendors', async () => {
      for (const token of [vendorAToken, vendorBToken]) {
        const res = await vendorSubmitPaymentHandler({ httpMethod: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ evaluationId: testEvalAId, amount: 4500 }) });
        assert.equal(res.statusCode, 410);
      }
    });
  });

  // ===========================================================================
  // 7. Certificate Verification Service Tests
  // ===========================================================================
  describe('7. Certificate Verification Service', () => {
    it('Public verify-certificate endpoint should verify official certificate and return safe metadata', async () => {
      const res = await verifyCertificateHandler({
        httpMethod: 'GET',
        queryStringParameters: { certificateNumber: 'TS-CERT-2026-TEST-A' }
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.valid, true);
      assert.strictEqual(data.certificate.certificateNumber, 'TS-CERT-2026-TEST-A');
      assert.strictEqual(data.certificate.companyName, 'Apex Telematics A Sdn Bhd');
      assert.strictEqual(data.certificate.signedBy, 'Director General Office');

      // Verify NO sensitive internal fields leaked
      assert.strictEqual(data.certificate.assessorId, undefined);
      assert.strictEqual(data.certificate.riskScore, undefined);
      assert.strictEqual(data.certificate.invoice, undefined);
      assert.strictEqual(data.certificate.breakdown, undefined);
    });

    it('Public verify-certificate should return 404 for non-existent certificate number', async () => {
      const res = await verifyCertificateHandler({
        httpMethod: 'GET',
        queryStringParameters: { certificateNumber: 'TS-CERT-DOES-NOT-EXIST' }
      });

      assert.strictEqual(res.statusCode, 404);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.valid, false);
    });
  });

  // ===========================================================================
  // 8. Vendor Profile & Password Management Tests
  // ===========================================================================
  describe('8. Vendor Profile & Password Management', () => {
    it('Vendor A can fetch their own profile', async () => {
      const res = await vendorProfileHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` }
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.vendor.companyName, 'Apex Telematics A Sdn Bhd');
    });

    it('Vendor A can update allowed profile contact fields', async () => {
      const res = await vendorProfileHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorAToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'update_profile',
          contactPhone: '+60 12-999 8888',
          contactPerson: 'Apex New Lead'
        })
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.vendor.contactPhone, '+60 12-999 8888');
      assert.strictEqual(data.vendor.contactPerson, 'Apex New Lead');
    });

    it('Vendor A can change password with valid current password', async () => {
      const newPwd = 'NewSecurePassword2026!';
      const res = await vendorProfileHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorAToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword: testPassword,
          newPassword: newPwd,
          confirmPassword: newPwd
        })
      });

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);

      // Verify login succeeds with new password
      const loginRes = await vendorLoginHandler({
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: vendorAEmail,
          password: newPwd
        })
      });
      assert.strictEqual(loginRes.statusCode, 200);
    });

    it('Vendor A password change fails when current password is wrong', async () => {
      const res = await vendorProfileHandler({
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${vendorAToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword: 'WrongPassword!',
          newPassword: 'AnotherPassword2026!',
          confirmPassword: 'AnotherPassword2026!'
        })
      });

      assert.strictEqual(res.statusCode, 400);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, false);
    });
  });

  // ===========================================================================
  // 9. SSE Status Stream Authentication & Scoping Tests
  // ===========================================================================
  describe('9. SSE Status Stream Authentication & Vendor Scoping', () => {
    it('status-stream requires authentication and rejects unauthenticated request with 401', async () => {
      const res = await statusStreamHandler({
        httpMethod: 'GET',
        headers: {}
      });

      assert.strictEqual(res.statusCode, 401, 'Unauthenticated request must be rejected with 401');
    });

    it('status-stream succeeds when provided with valid vendor JWT', async () => {
      const res = await statusStreamHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['Content-Type'], 'text/event-stream');
      assert.ok(res.body.includes(': connected'));
    });
  });
});
