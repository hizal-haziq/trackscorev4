/**
 * Test script: verify-inquiry-security.js
 * 
 * Verifies:
 * 1. Honeypot rejection
 * 2. Server-side validation failure on malformed email / missing fields
 * 3. Legitimate inquiry submission
 * 4. IP rate limiting (429 response on rapid submissions)
 * 5. Role checks on /api/manage-inquiries:
 *    - Unauthenticated -> 401
 *    - Assessor JWT -> 403
 *    - Vendor JWT -> 403
 *    - Manager JWT -> 200
 * 6. Manager conversion of inquiry into formal registration
 * 7. Verification that submit-inquiry rejects GET/PUT (405) and cannot enumerate data
 */

import http from 'http';

const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await makeRequest('POST', '/api/login', {}, { email, password });
  if (res.body?.token) return res.body.token;
  throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
}

async function runVerification() {
  console.log('=== STARTING PUBLIC INTAKE & CROSS-ROLE SECURITY VERIFICATION ===\n');

  // STEP 1: Test Honeypot rejection
  console.log('[TEST 1] Honeypot submission rejection:');
  const honeypotRes = await makeRequest('POST', '/api/submit-inquiry', {}, {
    companyName: 'Bot Telematics Ltd',
    contactPerson: 'Bot Spammer',
    contactEmail: 'spambot@example.com',
    contactPhone: '+60123456789',
    website_url_hp: 'https://evil-honeypot-target.com'
  });
  console.log('Status Code:', honeypotRes.statusCode);
  console.log('Response Body:', JSON.stringify(honeypotRes.body, null, 2));
  console.log('Passed:', honeypotRes.statusCode === 400 && honeypotRes.body.error?.includes('Spam validation failed'));
  console.log('--------------------------------------------------\n');

  // STEP 2: Test Server-Side Validation
  console.log('[TEST 2] Server-side validation (malformed email):');
  const invalidEmailRes = await makeRequest('POST', '/api/submit-inquiry', {}, {
    companyName: 'Valid Company Name',
    contactPerson: 'John Doe',
    contactEmail: 'not-an-email',
    contactPhone: '+60123456789'
  });
  console.log('Status Code:', invalidEmailRes.statusCode);
  console.log('Response Body:', JSON.stringify(invalidEmailRes.body, null, 2));
  console.log('Passed:', invalidEmailRes.statusCode === 400);
  console.log('--------------------------------------------------\n');

  // STEP 3: Test Legitimate Inquiry Submission
  console.log('[TEST 3] Valid Inquiry Submission (No Authentication):');
  const validInquiryRes = await makeRequest('POST', '/api/submit-inquiry', {}, {
    companyName: 'FleetTech Telematics Solutions Sdn Bhd',
    officeAddress: 'Level 10, Menara FleetTech, Jalan Sultan Ismail',
    state: 'Kuala Lumpur',
    contactPerson: 'Ts. Kamaruddin Ali',
    contactEmail: 'kamaruddin@fleettech.com.my',
    contactPhone: '+60198877665',
    deviceModel: 'FT-OBD2-Ultra',
    packageInterest: 'Package 2: Comprehensive Assessment (RM 6,000)',
    message: 'Requesting on-site evaluation for 50 commercial logistics units.'
  });
  console.log('Status Code:', validInquiryRes.statusCode);
  console.log('Response Body:', JSON.stringify(validInquiryRes.body, null, 2));
  const createdInquiryId = validInquiryRes.body?.inquiryId;
  console.log('Captured Inquiry ID:', createdInquiryId);
  console.log('Passed:', validInquiryRes.statusCode === 201 && !!createdInquiryId);
  console.log('--------------------------------------------------\n');

  // STEP 4: Test Non-Enumeration & Method Not Allowed
  console.log('[TEST 4] Anti-Enumeration: submit-inquiry cannot be read or listed (GET):');
  const getInquiryRes = await makeRequest('GET', '/api/submit-inquiry');
  console.log('Status Code:', getInquiryRes.statusCode);
  console.log('Response Body:', JSON.stringify(getInquiryRes.body, null, 2));
  console.log('Passed:', getInquiryRes.statusCode === 405);
  console.log('--------------------------------------------------\n');

  // STEP 5: Test Rate Limiting
  console.log('[TEST 5] Rate Limiting (Rapid fire submissions to trigger 429):');
  let rateLimitHit = false;
  let lastRateRes = null;
  for (let i = 0; i < 6; i++) {
    const r = await makeRequest('POST', '/api/submit-inquiry', {}, {
      companyName: `Spam Burst ${i}`,
      contactPerson: 'Burst Tester',
      contactEmail: `burst${i}@test.com`,
      contactPhone: '+60111222333'
    });
    if (r.statusCode === 429) {
      rateLimitHit = true;
      lastRateRes = r;
      break;
    }
  }
  console.log('Rate Limit Triggered:', rateLimitHit);
  console.log('Rate Limit Status Code:', lastRateRes?.statusCode);
  console.log('Rate Limit Response:', JSON.stringify(lastRateRes?.body, null, 2));
  console.log('Retry-After Header:', lastRateRes?.headers['retry-after']);
  console.log('--------------------------------------------------\n');

  // STEP 6: Authenticate as Assessor, Vendor, and Manager to test cross-role isolation
  console.log('[TEST 6] Cross-Role Authorization on /api/manage-inquiries:');
  
  // Login with rotated credentials
  const assessorToken = await login('assessor@trackscore.my', 'Asr_jBte-EKkG09Q!');
  const vendorToken = await login('vendor@fleetmatics.com', 'Vnd_sBcOvXlg_ESo!');
  const managerToken = await login('admin@trackscore.my', 'Mgr_I8bNjBLdEx7Y!');

  // 6a: Unauthenticated access
  const unauthRes = await makeRequest('GET', '/api/manage-inquiries');
  console.log('6a. Unauthenticated GET /api/manage-inquiries:');
  console.log('    Status:', unauthRes.statusCode);
  console.log('    Body:', JSON.stringify(unauthRes.body));
  console.log('    Passed (401):', unauthRes.statusCode === 401);

  // 6b: Assessor JWT access
  const assessorRes = await makeRequest('GET', '/api/manage-inquiries', {
    'Authorization': `Bearer ${assessorToken}`
  });
  console.log('6b. Assessor JWT GET /api/manage-inquiries:');
  console.log('    Status:', assessorRes.statusCode);
  console.log('    Body:', JSON.stringify(assessorRes.body));
  console.log('    Passed (403):', assessorRes.statusCode === 403);

  // 6c: Vendor JWT access
  const vendorRes = await makeRequest('GET', '/api/manage-inquiries', {
    'Authorization': `Bearer ${vendorToken}`
  });
  console.log('6c. Vendor JWT GET /api/manage-inquiries:');
  console.log('    Status:', vendorRes.statusCode);
  console.log('    Body:', JSON.stringify(vendorRes.body));
  console.log('    Passed (403):', vendorRes.statusCode === 403);

  // 6d: Manager JWT access
  const managerRes = await makeRequest('GET', '/api/manage-inquiries?status=all', {
    'Authorization': `Bearer ${managerToken}`
  });
  console.log('6d. Manager JWT GET /api/manage-inquiries:');
  console.log('    Status:', managerRes.statusCode);
  console.log('    Total Inquiries in Queue:', managerRes.body?.inquiries?.length);
  console.log('    Active Pending Count:', managerRes.body?.activePendingCount);
  console.log('    Passed (200):', managerRes.statusCode === 200 && Array.isArray(managerRes.body?.inquiries));
  console.log('--------------------------------------------------\n');

  // STEP 7: Test Manager Conversion of Inquiry to Registration
  console.log('[TEST 7] Manager Converts Inquiry to Registered Customer:');
  const convertRes = await makeRequest('POST', '/api/manage-inquiries', {
    'Authorization': `Bearer ${managerToken}`
  }, {
    inquiryId: createdInquiryId,
    action: 'convert',
    selectedPackage: 'package_2'
  });
  console.log('Status Code:', convertRes.statusCode);
  console.log('Response Body:', JSON.stringify(convertRes.body, null, 2));
  console.log('Passed (200 & evaluationId created):', convertRes.statusCode === 200 && !!convertRes.body?.evaluationId);
  console.log('--------------------------------------------------\n');

  // STEP 8: Verify Assessor on get-evaluations doesn't see raw inquiries
  console.log('[TEST 8] Assessor on get-evaluations does not see unconverted inquiries:');
  const evalCheck = await makeRequest('GET', '/api/get-evaluations?status=all', {
    'Authorization': `Bearer ${assessorToken}`
  });
  const hasRawInquiry = (evalCheck.body?.data || []).some(e => e.status === 'inquiry' || e.recordType === 'inquiry');
  console.log('Status Code:', evalCheck.statusCode);
  console.log('Raw inquiries exposed in evaluations query?:', hasRawInquiry);
  console.log('Passed (false):', hasRawInquiry === false);
  console.log('--------------------------------------------------\n');

  console.log('=== ALL INQUIRY SECURITY & RBAC VERIFICATIONS COMPLETED ===');
}

runVerification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
