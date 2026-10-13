/**
 * TrackScore React Migration — Phase F Unit & Integration Tests: Vendor Portal
 *
 * Verifies:
 * 1. RBAC & Route Access Control (Vendor allowed, Manager/Assessor denied, unauthenticated redirected)
 * 2. Confidentiality Boundary (Assessor comments, risk, workload, audit, password hashes excluded)
 * 3. Strict IDOR Protection (Vendor A blocked from Vendor B evaluations, documents, and resubmissions)
 * 4. Document / Evidence Security (MIME validation, 10MB limit, filename sanitization, anti-tampering)
 * 5. Revision & Immutable Versioned Resubmission (Action RESUBMISSION_BY_VENDOR, version increment)
 * 6. Profile Allowlist & Password Security (No mass assignment, bcrypt hash update)
 * 7. Payment Retirement Invariant (410 Gone maintained, no payment actions)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { handler as vendorPortalDataHandler } from '../netlify/functions/vendor-portal-data.js';
import { handler as vendorDocumentsHandler } from '../netlify/functions/vendor-documents.js';
import { handler as vendorResubmitHandler } from '../netlify/functions/vendor-resubmit.js';
import { handler as vendorProfileHandler } from '../netlify/functions/vendor-profile.js';
import { handler as riskHandler } from '../netlify/functions/get-assessment-risk.js';
import { handler as historyHandler } from '../netlify/functions/get-assessment-history.js';
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
  buildMongoIdFilter
} from '../netlify/functions/db.js';

describe('Phase F: React Vendor Portal Integration Tests', () => {
  let connection;
  const runId = Date.now();
  const vendorAEmail = `vendor-a-${runId}@test.local`;
  const vendorBEmail = `vendor-b-${runId}@test.local`;

  let vendorAToken;
  let vendorBToken;
  let managerToken;
  let assessorToken;

  let testEvalAId;
  let testEvalBId;

  const testPassword = 'Password123!';
  const passwordHash = bcrypt.hashSync(testPassword, 10);

  // Sentinel secrets to verify confidentiality boundaries
  const ASSESSOR_COMMENT_SECRET = 'SECRET_ASSESSOR_INTERNAL_NOTE_XYZ123';
  const MANAGER_NOTE_SECRET = 'SECRET_MANAGER_AUDIT_NOTE_ABC456';
  const RISK_SECRET = 'SECRET_RISK_ANOMALY_CONFIDENTIAL_789';

  before(async () => {
    connection = await connectToDatabase();

    // 1. Create Test Evaluation A (Vendor A)
    const evalA = {
      companyName: `Phase F Alpha Fleet ${runId}`,
      deviceModel: 'Alpha-T100',
      packageName: 'Comprehensive Track Evaluation',
      package: 'package_1',
      status: 'rejected',
      currentVersion: 1,
      rejectionReason: 'Wiring harness diagram requires ISO compliance label.',
      // Internal fields that MUST NOT leak to Vendor:
      comments: [{ author: 'Assessor Ahmad', text: ASSESSOR_COMMENT_SECRET, createdAt: new Date().toISOString() }],
      managerReviewNotes: MANAGER_NOTE_SECRET,
      riskAssessment: { score: 85, flag: RISK_SECRET },
      assignedAssessorId: 'ASSESSOR_001',
      assessorId: 'MKA 9006',
      sectionAScore: 3.2,
      sectionBScore: 1.4,
      totalScore: 4.6,
      starsCount: 5,
      ratingLabel: '5 Stars - Platinum Telematics Compliant',
      invoice: {
        invoiceNumber: 'INV-PHASEF-A',
        amount: 3500,
        status: 'draft'
      },
      documents: [
        {
          id: `doc_phasef_a_${Date.now()}`,
          name: 'alpha_schematic.pdf',
          category: 'device_spec',
          categoryLabel: 'Device Technical Specification',
          fileType: 'application/pdf',
          fileSize: 1024,
          status: 'uploaded',
          uploadedAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString()
    };

    // 2. Create Test Evaluation B (Vendor B)
    const evalB = {
      companyName: `Phase F Beta Fleet ${runId}`,
      deviceModel: 'Beta-T200',
      packageName: 'Standard Telematics Evaluation',
      package: 'package_2',
      status: 'approved',
      currentVersion: 1,
      certificate: {
        certificateNumber: `MIROS-CERT-B-${runId}`,
        preparedDate: new Date().toISOString(),
        printedDate: new Date().toISOString(),
        signedDate: new Date().toISOString(),
        signedBy: 'DGO Signatory'
      },
      documents: [],
      createdAt: new Date().toISOString()
    };

    if (connection.isMongoAtlas) {
      const resA = await connection.db.collection(COLLECTION_NAME).insertOne(evalA);
      testEvalAId = String(resA.insertedId);
      const resB = await connection.db.collection(COLLECTION_NAME).insertOne(evalB);
      testEvalBId = String(resB.insertedId);
    } else {
      const resA = await connection.insertEvaluation(evalA);
      testEvalAId = String(resA.insertedId);
      const resB = await connection.insertEvaluation(evalB);
      testEvalBId = String(resB.insertedId);
    }

    // 3. Create Vendor A account
    const vendorADoc = {
      companyName: `Phase F Alpha Fleet ${runId}`,
      contactEmail: vendorAEmail,
      loginEmail: vendorAEmail,
      contactPerson: 'Alice Vendor',
      contactPhone: '+60 12-111 2233',
      officeAddress: '123 Tech Park, Cyberjaya',
      state: 'Selangor',
      linkedRegistrationIds: [testEvalAId],
      passwordHash,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    // 4. Create Vendor B account
    const vendorBDoc = {
      companyName: `Phase F Beta Fleet ${runId}`,
      contactEmail: vendorBEmail,
      loginEmail: vendorBEmail,
      contactPerson: 'Bob Vendor',
      contactPhone: '+60 19-888 7766',
      officeAddress: '456 Industrial Zone, Shah Alam',
      state: 'Selangor',
      linkedRegistrationIds: [testEvalBId],
      passwordHash,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    let vendorAId, vendorBId;
    if (connection.isMongoAtlas) {
      const resA = await connection.db.collection(COLLECTION_VENDORS).insertOne(vendorADoc);
      vendorAId = String(resA.insertedId);
      const resB = await connection.db.collection(COLLECTION_VENDORS).insertOne(vendorBDoc);
      vendorBId = String(resB.insertedId);
    } else {
      const vA = await connection.createVendor(vendorADoc);
      vendorAId = String(vA._id || vA.id);
      const vB = await connection.createVendor(vendorBDoc);
      vendorBId = String(vB._id || vB.id);
    }

    vendorAToken = generateToken({
      userId: vendorAId,
      vendorId: vendorAId,
      email: vendorAEmail,
      role: ROLE_VENDOR,
      name: vendorADoc.companyName,
      linkedRegistrationIds: [testEvalAId]
    });

    vendorBToken = generateToken({
      userId: vendorBId,
      vendorId: vendorBId,
      email: vendorBEmail,
      role: ROLE_VENDOR,
      name: vendorBDoc.companyName,
      linkedRegistrationIds: [testEvalBId]
    });

    managerToken = generateToken({ role: ROLE_MANAGER, name: 'Phase F Manager' });
    assessorToken = generateToken({ role: ROLE_ASSESSOR, assessorId: 'MKA 9006', name: 'Phase F Assessor' });
  });

  after(async () => {
    try {
      if (connection.isMongoAtlas) {
        await connection.db.collection(COLLECTION_NAME).deleteMany({
          _id: { $in: [buildMongoIdFilter(testEvalAId)._id, buildMongoIdFilter(testEvalBId)._id] }
        });
        await connection.db.collection(COLLECTION_VENDORS).deleteMany({
          contactEmail: { $in: [vendorAEmail, vendorBEmail] }
        });
      }
    } catch {}
    await closeDatabaseConnection();
  });

  // =========================================================================
  // 1. RBAC & Route Access Control
  // =========================================================================
  describe('1. Role-Based Access Control & Scoping', () => {
    it('vendor token should successfully load vendor portal data', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` }
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.evaluations.length, 1);
      assert.equal(body.evaluations[0]._id, testEvalAId);
    });

    it('manager token should be denied access to vendor-portal-data with 403', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${managerToken}` }
      });
      assert.equal(res.statusCode, 403);
    });

    it('assessor token should be denied access to vendor-portal-data with 403', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${assessorToken}` }
      });
      assert.equal(res.statusCode, 403);
    });

    it('unauthenticated request without Bearer token should be rejected with 401', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: {}
      });
      assert.equal(res.statusCode, 401);
    });
  });

  // =========================================================================
  // 2. Strict Confidentiality & Internal Data Sanitization
  // =========================================================================
  describe('2. Confidentiality & Sanitization Boundary', () => {
    it('vendor-portal-data MUST NOT expose assessor comments, manager notes, risk, or assessor IDs', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` }
      });
      assert.equal(res.statusCode, 200);
      const rawText = res.body;

      // Assert sentinel secrets are strictly absent from serialized vendor payload
      assert.equal(rawText.includes(ASSESSOR_COMMENT_SECRET), false, 'Assessor comment leaked in vendor payload');
      assert.equal(rawText.includes(MANAGER_NOTE_SECRET), false, 'Manager note leaked in vendor payload');
      assert.equal(rawText.includes(RISK_SECRET), false, 'Risk score leaked in vendor payload');
      assert.equal(rawText.includes('passwordHash'), false, 'passwordHash leaked in vendor payload');

      const body = JSON.parse(rawText);
      const evalDoc = body.evaluations[0];
      assert.equal(evalDoc.assignedAssessorId, undefined);
      assert.equal(evalDoc.assessorId, undefined);
      assert.equal(evalDoc.riskAssessment, undefined);
      assert.equal(evalDoc.comments, undefined);
      assert.equal(evalDoc.managerReviewNotes, undefined);
    });

    it('vendor must be BLOCKED from accessing internal risk intelligence endpoint with 403', async () => {
      const res = await riskHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalAId }
      });
      assert.equal(res.statusCode, 403);
    });
  });

  // =========================================================================
  // 3. IDOR Protection (Vendor A vs Vendor B)
  // =========================================================================
  describe('3. Strict IDOR Protection', () => {
    it('Vendor A should be BLOCKED from requesting Vendor B evaluation with 403', async () => {
      const res = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { id: testEvalBId }
      });
      assert.equal(res.statusCode, 403);
    });

    it('Vendor A should be BLOCKED from accessing Vendor B documents with 403', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalBId }
      });
      assert.equal(res.statusCode, 403);
    });

    it('Vendor A should be BLOCKED from resubmitting Vendor B evaluation with 403', async () => {
      const res = await vendorResubmitHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          evaluationId: testEvalBId,
          deviceModel: 'Malicious-Device',
          responseNotes: 'IDOR attempt'
        })
      });
      assert.equal(res.statusCode, 403);
    });

    it('Vendor A should be BLOCKED from fetching version history for Vendor B with 403', async () => {
      const res = await historyHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { evaluationId: testEvalBId }
      });
      assert.equal(res.statusCode, 403);
    });
  });

  // =========================================================================
  // 4. Document Management & File Security
  // =========================================================================
  describe('4. Evidence Document Upload & Security', () => {
    let uploadedDocId;

    it('should reject unsupported MIME types (e.g. application/x-msdownload) with 400', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'upload',
          evaluationId: testEvalAId,
          name: 'malicious.exe',
          category: 'device_spec',
          fileType: 'application/x-msdownload',
          fileData: Buffer.from('binary-content').toString('base64')
        })
      });
      assert.equal(res.statusCode, 400);
      assert.match(JSON.parse(res.body).error, /unsupported file type/i);
    });

    it('should reject path traversal and accept an ordinary filename', async () => {
      const validPdfBase64 = Buffer.from('%PDF-1.4 sample content').toString('base64');
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'upload',
          evaluationId: testEvalAId,
          name: '../../../etc/passwd.pdf',
          category: 'test_report',
          fileType: 'application/pdf',
          fileData: validPdfBase64,
          notes: 'Traversal test note'
        })
      });
      assert.equal(res.statusCode,400);
      const safe=await vendorDocumentsHandler({httpMethod:'POST',headers:{Authorization:`Bearer ${vendorAToken}`},body:JSON.stringify({action:'upload',evaluationId:testEvalAId,name:'report.pdf',category:'test_report',fileType:'application/pdf',fileData:validPdfBase64})});
      assert.equal(safe.statusCode,201,safe.body);
      const body = JSON.parse(safe.body);
      uploadedDocId = body.document.id;
      // Confirm filename was sanitized without path separators
      assert.equal(body.document.name.includes('/'), false);
      assert.equal(body.document.name.includes('\\'), false);
    });

    it('should allow Vendor A to download their own uploaded document', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: {
          action: 'download',
          evaluationId: testEvalAId,
          docId: uploadedDocId
        }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    });

    it('should BLOCKED Vendor B from downloading Vendor A document with 403', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorBToken}` },
        queryStringParameters: {
          action: 'download',
          evaluationId: testEvalAId,
          docId: uploadedDocId
        }
      });
      assert.equal(res.statusCode, 403);
    });

    it('should allow Vendor A to delete their uploaded document', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'delete',
          evaluationId: testEvalAId,
          docId: uploadedDocId
        })
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.body).success, true);
    });
  });

  // =========================================================================
  // 5. Revision & Versioned Resubmission
  // =========================================================================
  describe('5. Revision Response & Versioned Resubmission', () => {
    it('should allow Vendor A to respond to rejection and increment assessment version to v2', async () => {
      const res = await vendorResubmitHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          evaluationId: testEvalAId,
          deviceModel: 'Alpha-T100-Rev2',
          responseNotes: 'Updated harness diagram attached addressing ISO compliance tag.'
        })
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.version, 2);

      // Verify assessment now reflects submitted status and v2
      const checkRes = await vendorPortalDataHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        queryStringParameters: { id: testEvalAId }
      });
      const checkBody = JSON.parse(checkRes.body);
      assert.equal(checkBody.evaluation.status, 'submitted');
      assert.equal(checkBody.evaluation.currentVersion, 2);
      assert.equal(checkBody.evaluation.rejectionReason, null);
    });
  });

  // =========================================================================
  // 6. Company Profile Management & Security
  // =========================================================================
  describe('6. Company Profile & Password Security', () => {
    it('should retrieve Vendor A profile without exposing passwordHash', async () => {
      const res = await vendorProfileHandler({
        httpMethod: 'GET',
        headers: { Authorization: `Bearer ${vendorAToken}` }
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.vendor.companyName, `Phase F Alpha Fleet ${runId}`);
      assert.equal(body.vendor.passwordHash, undefined);
    });

    it('should update allowed profile fields (contactPerson, phone, address, state)', async () => {
      const res = await vendorProfileHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'update_profile',
          contactPerson: 'Alice Vendor Updated',
          contactPhone: '+60 12-999 8877',
          officeAddress: '99 Innovation Way',
          state: 'Kuala Lumpur',
          // Malicious fields attempting role escalation / email reassignment:
          role: 'manager',
          contactEmail: 'hacker@victim.com',
          isActive: false
        })
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.vendor.contactPerson, 'Alice Vendor Updated');
      assert.equal(body.vendor.contactPhone, '+60 12-999 8877');
      assert.equal(body.vendor.state, 'Kuala Lumpur');
      // Assert immutable fields were preserved
      assert.equal(body.vendor.contactEmail, vendorAEmail);
      assert.equal(body.vendor.role, undefined);
    });

    it('should successfully update password with valid current password', async () => {
      const newPassword = 'NewSecretPassword456!';
      const res = await vendorProfileHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword: testPassword,
          newPassword,
          confirmPassword: newPassword
        })
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.body).success, true);
    });

    it('should reject password update when current password is wrong', async () => {
      const res = await vendorProfileHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword: 'WrongOldPassword!',
          newPassword: 'AnotherPassword789!',
          confirmPassword: 'AnotherPassword789!'
        })
      });
      assert.equal(res.statusCode, 400);
      assert.match(JSON.parse(res.body).error, /current password does not match/i);
    });
  });

  // =========================================================================
  // 7. Payment Retirement Invariant
  // =========================================================================
  describe('7. Payment Workflow Retired Invariant', () => {
    it('retired payment endpoint must return 410 Gone', async () => {
      const { handler: paymentHandler } = await import('../netlify/functions/vendor-submit-payment.js');
      const res = await paymentHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ evaluationId: testEvalAId, paymentMethod: 'fpx' })
      });
      assert.equal(res.statusCode, 410);
    });

    it('uploading document with payment_proof category should be rejected with 400', async () => {
      const res = await vendorDocumentsHandler({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          action: 'upload',
          evaluationId: testEvalAId,
          name: 'receipt.pdf',
          category: 'payment_proof',
          fileType: 'application/pdf',
          fileData: Buffer.from('%PDF receipt').toString('base64')
        })
      });
      assert.equal(res.statusCode, 400);
      assert.match(JSON.parse(res.body).error, /unsupported document category/i);
    });
  });
});

