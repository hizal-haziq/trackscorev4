import {createVendorRecord,connectToDatabase} from '../netlify/functions/db.js';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabaseConnection } from '../netlify/functions/db.js';
import { handler as saveEvaluationHandler } from '../netlify/functions/save-evaluation.js';
import { handler as lookupHandler } from '../netlify/functions/lookup-evaluation.js';
import { handler as getVersionHandler } from '../netlify/functions/get-assessment-version.js';
import {
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  recomputeScores
} from '../netlify/functions/rubric.js';
import {
  generateToken,
  ROLE_ASSESSOR,
  ROLE_MANAGER,
  ROLE_VENDOR
} from '../netlify/functions/auth.js';

describe('End-to-End Assessor Comment Persistence & UI Workflow', () => {
  after(async () => { await closeDatabaseConnection(); });
  const assessorToken = generateToken({
    role: ROLE_ASSESSOR,
    assessorId: 'MKA 9006',
    name: 'Lead Assessor'
  });

  const managerToken = generateToken({
    role: ROLE_MANAGER,
    id: 'MGR-001',
    name: 'Quality Assurance Manager'
  });

  it('Step 1 -> Assessor creates evaluation with comments on criteria 1 and 10 and saves', async () => {
    const timestamp = Date.now();
    const companyName = `Comment Persistence Fleet ${timestamp}`;
    const deviceModel = `TG-PERF-${timestamp}`;

    const allCriteria = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA];
    const breakdown = allCriteria.map((c, idx) => {
      let comment = '';
      if (c.id === 'trip_history') comment = 'Initial comment on Trip History compliance';
      if (c.id === 'offline_memory') comment = 'Initial comment on Offline Memory flash capacity';
      return {
        id: c.id,
        name: c.name,
        section: c.section,
        selectedOption: c.options[0].label,
        points: c.options[0].points,
        comment
      };
    });

    const recomputed = recomputeScores(breakdown);

    // Save initial evaluation
    const saveRes = await saveEvaluationHandler({
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${assessorToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        companyName,
        deviceModel,
        packageName: 'Comprehensive',
        assessorName: 'Lead Assessor',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-30',
        breakdown,
        sectionAScore: recomputed.sectionAScore,
        sectionBScore: recomputed.sectionBScore,
        totalScore: recomputed.totalScore
      })
    });

    assert.equal(saveRes.statusCode, 200);
    const saveBody = JSON.parse(saveRes.body);
    const evalId = saveBody.id;
    assert.ok(evalId);

    // Step 2 -> Reload assessment: comments must persist
    const reloadRes = await lookupHandler({
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${assessorToken}` },
      queryStringParameters: { id: String(evalId) }
    });
    assert.equal(reloadRes.statusCode, 200);
    const loadedDoc = JSON.parse(reloadRes.body).data[0];
    const c1 = loadedDoc.breakdown.find(b => b.id === 'trip_history');
    const c10 = loadedDoc.breakdown.find(b => b.id === 'offline_memory');
    assert.equal(c1.comment, 'Initial comment on Trip History compliance');
    assert.equal(c10.comment, 'Initial comment on Offline Memory flash capacity');

    // Step 3 -> Edit comments and save revision
    const editedBreakdown = loadedDoc.breakdown.map(item => {
      if (item.id === 'trip_history') {
        return { ...item, comment: 'UPDATED: 6-month buffer verified via CAN bus logs' };
      }
      if (item.id === 'offline_memory') {
        return { ...item, comment: 'UPDATED: Flash endurance tested with 24h disconnection' };
      }
      return item;
    });

    const recomputedV2 = recomputeScores(editedBreakdown);

    const resubmitRes = await saveEvaluationHandler({
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${assessorToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        resubmitRecordId: String(evalId),
        companyName,
        deviceModel,
        packageName: 'Comprehensive',
        assessorName: 'Lead Assessor',
        assessorId: 'MKA 9006',
        assessmentDate: '2026-03-30',
        breakdown: editedBreakdown,
        sectionAScore: recomputedV2.sectionAScore,
        sectionBScore: recomputedV2.sectionBScore,
        totalScore: recomputedV2.totalScore,
        changeReason: 'Updated technical audit comments'
      })
    });
    assert.equal(resubmitRes.statusCode, 200);

    // Step 4 -> Reload again: updated comments must persist in latest record
    const reload2 = await lookupHandler({
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${assessorToken}` },
      queryStringParameters: { id: String(evalId) }
    });
    assert.equal(reload2.statusCode, 200);
    const loaded2 = JSON.parse(reload2.body).data[0];
    const c1Updated = loaded2.breakdown.find(b => b.id === 'trip_history');
    const c10Updated = loaded2.breakdown.find(b => b.id === 'offline_memory');
    assert.equal(c1Updated.comment, 'UPDATED: 6-month buffer verified via CAN bus logs');
    assert.equal(c10Updated.comment, 'UPDATED: Flash endurance tested with 24h disconnection');

    // Step 5 -> Manager view version history: Version 1 has initial comment, Version 2 has updated comment
    const v1Res = await getVersionHandler({
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: String(evalId), version: '1' }
    });
    assert.equal(v1Res.statusCode, 200);
    const v1Doc = JSON.parse(v1Res.body).version;
    const v1c1 = v1Doc.breakdown.find(b => b.id === 'trip_history');
    assert.equal(v1c1.comment, 'Initial comment on Trip History compliance');

    const v2Res = await getVersionHandler({
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${managerToken}` },
      queryStringParameters: { evaluationId: String(evalId), version: '2' }
    });
    assert.equal(v2Res.statusCode, 200);
    const v2Doc = JSON.parse(v2Res.body).version;
    const v2c1 = v2Doc.breakdown.find(b => b.id === 'trip_history');
    assert.equal(v2c1.comment, 'UPDATED: 6-month buffer verified via CAN bus logs');

    // Step 6 -> Vendor role security isolation: Vendor CANNOT view comments
    await createVendorRecord(await connectToDatabase(), {contactEmail:`vendor-${timestamp}@fleet.com`,loginEmail:`vendor-${timestamp}@fleet.com`,companyName,isActive:true,linkedRegistrationIds:[String(evalId)]});
    const vendorToken = generateToken({
      role: ROLE_VENDOR,
      companyName,
      email: `vendor-${timestamp}@fleet.com`,
      linkedRegistrationIds: [String(evalId)]
    });

    const vendorRes = await getVersionHandler({
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${vendorToken}` },
      queryStringParameters: { evaluationId: String(evalId), version: '2' }
    });
    assert.equal(vendorRes.statusCode, 200);
    const vendorVersion = JSON.parse(vendorRes.body).version;
    vendorVersion.breakdown.forEach(item => {
      assert.equal(item.comment, undefined, 'Assessor comment must be stripped for vendor');
    });
  });
});
