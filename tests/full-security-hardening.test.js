// Adversarial fixtures run only inside scripts/run-tests-isolated.mjs.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { generateToken, verifyToken } from "../netlify/functions/auth.js";
import {
  connectToDatabase,
  createVendorRecord,
  createAssessmentVersionRecord,
  findAssessmentVersion,
  updateVendorRecord,
  guardedEvaluationUpdate,
} from "../netlify/functions/db.js";
import {
  ENDPOINT_SECURITY,
  secureHandler,
  assessorOwns,
  projectStatusEvent,
  trustedClientIp,
  checkRateLimit,
} from "../netlify/functions/security.js";
import {
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  recomputeScores,
} from "../netlify/functions/rubric.js";
import { recordStatusEvent } from "../netlify/functions/status-bus.js";
const handlers = {};
for (const endpoint of Object.keys(ENDPOINT_SECURITY))
  handlers[endpoint] = (
    await import("../netlify/functions/" + endpoint + ".js")
  ).handler;
const matrix = [];
const accounts = {
  manager: {
    role: "manager",
    userId: "security-manager",
    name: "Security Manager",
    email: "security-manager@example.test",
  },
  assessor: {
    role: "assessor",
    userId: "security-assessor",
    assessorId: "SEC 1001",
    name: "Security Assessor",
    email: "security-assessor@example.test",
  },
  vendor_a: {
    role: "vendor",
    vendorId: "security-vendor-a",
    email: "security-a@example.test",
    linkedRegistrationIds: ["security-a", "security-b"],
  },
  vendor_b: {
    role: "vendor",
    vendorId: "security-vendor-b",
    email: "security-b@example.test",
    linkedRegistrationIds: ["security-b"],
  },
};
const tokens = Object.fromEntries(
  Object.entries(accounts).map(([k, v]) => [k, generateToken(v)]),
);
const breakdown = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map((c) => ({
  id: c.id,
  selectedOption: c.options[0].label,
  points: c.options[0].points,
  comment: "ASSESSOR_SECRET",
}));
const scores = recomputeScores(breakdown),
  xss = '<img src=x onerror="window.__securityXss=true">';
const submission = (overrides = {}) => ({
  companyName: "Security submission " + Math.random(),
  deviceModel: "Security Device",
  assessorName: "Forged actor",
  assessorId: "SEC 1001",
  assessmentDate: "2026-10-13",
  breakdown,
  ...scores,
  ...overrides,
});
const call = (
  endpoint,
  account = "manager",
  body = {},
  query = {},
  method = Object.keys(body).length &&
  ENDPOINT_SECURITY[endpoint].methods.includes("POST")
    ? "POST"
    : ENDPOINT_SECURITY[endpoint].methods[0],
) =>
  handlers[endpoint]({
    httpMethod: method,
    headers: account ? { authorization: "Bearer " + tokens[account] } : {},
    clientIp: "security-fixture-" + (account || "anonymous"),
    body: JSON.stringify(body),
    queryStringParameters: query,
  });
const forbiddenSentinels = [
  "MANAGER_SECRET",
  "VENDOR_B_SECRET",
  "RISK_SECRET",
  "WORKLOAD_SECRET",
  "AUDIT_SECRET",
  "PASSWORD_HASH_SECRET",
  "JWT_SECRET_VALUE",
  "SERVER_PATH_SECRET",
];
let db, snapshot;
describe("Full security hardening: adversarial API matrix and resource integrity", () => {
  before(async () => {
    db = await connectToDatabase();
    assert.equal(db.isMongoAtlas, false, "Security suite must never use Atlas");
    snapshot = new Map(
      fs
        .readdirSync(".data")
        .map((name) => [name, fs.readFileSync(path.join(".data", name))]),
    );
    for (const [key, owner] of [
      ["a", "SEC 1001"],
      ["b", "SEC 1002"],
      ["unassigned", null],
    ])
      await db.insertEvaluation({
        _id: "security-" + key,
        companyName: key === "a" ? xss : "VENDOR_B_SECRET",
        deviceModel: "SEC",
        status: "pending_review",
        assessorId: owner,
        assessorName: owner ? "Security Assessor" : "",
        currentVersion: 1,
        breakdown,
        slaDeadline: "2026-12-01",
        documents: [],
        managerReviewComment: "MANAGER_SECRET",
        internalNotes: "MANAGER_SECRET",
        risk: { note: "RISK_SECRET" },
        workload: "WORKLOAD_SECRET",
        audit: "AUDIT_SECRET",
        passwordHash: "PASSWORD_HASH_SECRET",
        jwtSecret: "JWT_SECRET_VALUE",
        serverPath: "SERVER_PATH_SECRET",
        createdAt: new Date().toISOString(),
        statusHistory: [{ status: "pending_review", note: "MANAGER_SECRET" }],
      });
    for (const key of ["a", "b"]) {
      await createAssessmentVersionRecord(db, {
        evaluationId: "security-" + key,
        versionNumber: 1,
        actor: {
          name: "Security Assessor",
          role: "assessor",
          email: "ASSESSOR_SECRET",
        },
        scores,
        breakdown,
        metadata: {
          companyName: xss,
          deviceModel: "SEC",
          managerReviewComment: "MANAGER_SECRET",
          audit: "AUDIT_SECRET",
          jwtSecret: "JWT_SECRET_VALUE",
        },
        privatePath: "SERVER_PATH_SECRET",
        internalNotes: "MANAGER_SECRET",
        changeReason: "ASSESSOR_SECRET",
      });
      await createVendorRecord(db, {
        _id: "security-vendor-" + key,
        companyName: "VENDOR_" + key.toUpperCase() + "_SECRET",
        contactEmail: "security-" + key + "@example.test",
        loginEmail: "security-" + key + "@example.test",
        linkedRegistrationIds: ["security-" + key],
        isActive: true,
        passwordHash: bcrypt.hashSync("SecurityPass1!", 4),
        officeAddress: xss,
      });
    }
  });
  after(async () => {
    for (const name of fs.readdirSync(".data"))
      if (!snapshot.has(name)) fs.unlinkSync(path.join(".data", name));
    for (const [name, value] of snapshot)
      fs.writeFileSync(path.join(".data", name), value);
    if (process.env.TRACKSCORE_SECURITY_EVIDENCE)
      fs.writeFileSync(
        process.env.TRACKSCORE_SECURITY_EVIDENCE,
        JSON.stringify(matrix, null, 2),
      );
  });
  for (const [endpoint, policy] of Object.entries(ENDPOINT_SECURITY).filter(
    ([, p]) => !p.public,
  ))
    for (const account of [...Object.keys(accounts), null]) {
      it(`${endpoint}: ${account || "unauthenticated"} enforces the declared role independently`, async () => {
        const role = accounts[account]?.role,
          expected = !account ? 401 : policy.roles.includes(role) ? null : 403;
        const result = await call(endpoint, account, {}, {}, policy.methods[0]);
        matrix.push({
          endpoint,
          method: policy.methods[0],
          account: account || "unauthenticated",
          status: result.statusCode,
          expectedRole:
            expected === null
              ? "allowed; payload/resource rules still apply"
              : "denied",
        });
        if (expected) assert.equal(result.statusCode, expected, result.body);
        else assert.notEqual(result.statusCode, 401, result.body);
        if (expected)
          assert.ok(
            !forbiddenSentinels.some((s) => String(result.body).includes(s)),
          );
      });
    }
  it("JWT role edits without re-signing, alternate algorithms, missing expiry and unknown roles fail", () => {
    for (const role of ["manager", "vendor"]) {
      const parts = tokens.assessor.split(".");
      const p = JSON.parse(Buffer.from(parts[1], "base64url"));
      parts[1] = Buffer.from(JSON.stringify({ ...p, role })).toString(
        "base64url",
      );
      assert.equal(verifyToken(parts.join(".")), null);
    }
    for (const payload of [
      { role: "root" },
      { role: "manager", exp: 1 },
      { role: "manager" },
    ]) {
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        algorithm: "HS512",
      });
      assert.equal(verifyToken(token), null);
    }
    assert.equal(
      verifyToken(
        jwt.sign({ role: "manager" }, process.env.JWT_SECRET, {
          algorithm: "HS256",
          noTimestamp: true,
        }),
      ),
      null,
    );
  });
  it("forced password-change tokens cannot read, submit, upload, or stream", async () => {
    for (const endpoint of [
      "get-evaluations",
      "save-evaluation",
      "vendor-documents",
      "status-stream",
    ]) {
      const result = await handlers[endpoint]({
        httpMethod: ENDPOINT_SECURITY[endpoint].methods[0],
        headers: {
          authorization:
            "Bearer " +
            generateToken({ ...accounts.assessor, mustChangePassword: true }),
        },
        body: "{}",
      });
      assert.equal(result.statusCode, 403, result.body);
    }
  });
  for (const endpoint of [
    "get-assessment-history",
    "get-assessment-version",
    "vendor-documents",
  ]) {
    it(`${endpoint}: Vendor ownership comes from current account, rejecting stale JWT links`, async () => {
      const query = { evaluationId: "security-b", version: "1" };
      assert.equal(
        (await call(endpoint, "vendor_a", {}, query)).statusCode,
        403,
      );
      const own = await call(
        endpoint,
        "vendor_a",
        {},
        { ...query, evaluationId: "security-a" },
      );
      assert.equal(own.statusCode, 200, own.body);
      for (const sentinel of forbiddenSentinels.concat("ASSESSOR_SECRET"))
        assert.ok(!own.body.includes(sentinel), sentinel + " leaked");
    });
    it(`${endpoint}: conflicting Assessor name cannot override another assigned ID`, async () => {
      assert.equal(
        (
          await call(
            endpoint,
            "assessor",
            {},
            { evaluationId: "security-b", version: "1" },
          )
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await call(
            endpoint,
            "assessor",
            {},
            { evaluationId: "security-unassigned", version: "1" },
          )
        ).statusCode,
        403,
      );
    });
  }
  it("Assessor repository is exactly scoped even with full-details/include-deleted flags", async () => {
    const result = await call(
      "get-evaluations",
      "assessor",
      {},
      { includeFullDetails: "true", includeDeleted: "true", limit: "100" },
    );
    assert.equal(result.statusCode, 200, result.body);
    const data = JSON.parse(result.body);
    const rows = data.evaluations || data.data;
    assert.ok(rows.some((r) => r._id === "security-a"));
    assert.ok(
      !rows.some((r) => ["security-b", "security-unassigned"].includes(r._id)),
    );
    assert.ok(!result.body.includes("MANAGER_SECRET"));
  });
  it("peer review accepts eligible peer work but hides unpublished and Manager internals", async () => {
    assert.equal(
      (
        await call(
          "lookup-evaluation",
          "assessor",
          {},
          { id: "security-b", peerReview: "true" },
        )
      ).statusCode,
      200,
    );
    await db.updateEvaluation("security-b", { status: "registered" });
    assert.equal(
      (
        await call(
          "lookup-evaluation",
          "assessor",
          {},
          { id: "security-b", peerReview: "true" },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await call("add-comment", "assessor", {
          evaluationId: "security-b",
          text: "Unauthorized peer",
        })
      ).statusCode,
      403,
    );
    await db.updateEvaluation("security-b", { status: "pending_review" });
  });
  it("upload rejects traversal, extensions, executable disguises, empty content and invalid Base64", async () => {
    for (const overrides of [
      { name: "../escape.pdf" },
      { name: "evil.html" },
      { name: "evil.exe.pdf" },
      { fileType: "text/html" },
      { fileData: "%%%bad" },
      { fileData: "" },
    ]) {
      const result = await call("vendor-documents", "vendor_a", {
        action: "upload",
        evaluationId: "security-a",
        category: "test_report",
        name: "report.pdf",
        fileType: "application/pdf",
        fileData: Buffer.from("%PDF-test").toString("base64"),
        ...overrides,
      });
      assert.equal(result.statusCode, 400, result.body);
    }
  });
  it("oversize upload is rejected and wrong-owner uploads do not create documents", async () => {
    const payload = {
      action: "upload",
      evaluationId: "security-a",
      category: "test_report",
      name: "report.pdf",
      fileType: "application/pdf",
      fileData: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"),
    };
    assert.equal(
      (await call("vendor-documents", "vendor_a", payload)).statusCode,
      400,
    );
    assert.equal(
      (
        await call("vendor-documents", "vendor_b", {
          ...payload,
          fileData: Buffer.from("%PDF-test").toString("base64"),
        })
      ).statusCode,
      403,
    );
  });
  it("private downloads allow owner, deny other Vendor/Assessor/anonymous, force attachment and safe metadata", async () => {
    const uploaded = await call("vendor-documents", "vendor_a", {
      action: "upload",
      evaluationId: "security-a",
      category: "test_report",
      name: "report.pdf",
      fileType: "application/pdf",
      fileData: Buffer.from("%PDF-test").toString("base64"),
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const id = JSON.parse(uploaded.body).document.id;
    for (const [account, status] of [
      ["vendor_a", 200],
      ["vendor_b", 403],
      ["assessor", 200],
      [null, 401],
    ]) {
      const result = await call(
        "vendor-documents",
        account,
        {},
        { action: "download", evaluationId: "security-a", docId: id },
      );
      assert.equal(result.statusCode, status, result.body);
      if (status === 200) {
        assert.match(result.headers["Content-Disposition"], /^attachment;/);
        assert.equal(result.headers["X-Content-Type-Options"], "nosniff");
      }
    }
    assert.equal(
      (
        await call(
          "vendor-documents",
          "assessor",
          { action: "delete", evaluationId: "security-a", docId: id },
          {},
          "POST",
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await call(
          "vendor-documents",
          "vendor_a",
          { action: "delete", evaluationId: "security-a", docId: id },
          {},
          "POST",
        )
      ).statusCode,
      200,
    );
  });
  it("profile mass assignment cannot change role, account ID, ownership, active state or certificate", async () => {
    const result = await call(
      "vendor-profile",
      "vendor_a",
      {
        action: "update_profile",
        id: "security-vendor-b",
        vendorId: "security-vendor-b",
        role: "manager",
        linkedRegistrationIds: ["security-b"],
        isActive: false,
        certificate: { signedBy: "attacker" },
        contactPerson: xss,
      },
      {},
      "PUT",
    );
    assert.equal(result.statusCode, 200, result.body);
    const a = await db.getVendorById("security-vendor-a"),
      b = await db.getVendorById("security-vendor-b");
    assert.deepEqual(a.linkedRegistrationIds, ["security-a"]);
    assert.equal(a.isActive, true);
    assert.equal(a.role, undefined);
    assert.equal(a.certificate, undefined);
    assert.equal(b.contactPerson, undefined);
    assert.equal(a.contactPerson, xss);
  });
  for (const tamper of [
    { totalScore: 99999 },
    { sectionAScore: "NaN" },
    { status: "approved" },
    {
      breakdown: breakdown.map((b, i) =>
        i ? b : { ...b, selectedOption: "invented option", points: 99999 },
      ),
    },
  ])
    it(
      "submission rejects score/status/option manipulation " +
        Object.keys(tamper).join(","),
      async () => {
        const result = await call(
          "save-evaluation",
          "assessor",
          submission(tamper),
        );
        assert.equal(result.statusCode, 400, result.body);
      },
    );
  it("points are recomputed, actor/timestamp/history/certificate injections are ignored, versions stay immutable", async () => {
    const payload = submission({
      breakdown: breakdown.map((b) => ({ ...b, points: 9999 })),
      createdAt: "1999-01-01",
      certificate: { signedDate: "1999-01-01" },
      statusHistory: [{ changedBy: "attacker" }],
    });
    const result = await call("save-evaluation", "assessor", payload);
    assert.equal(result.statusCode, 200, result.body);
    const id = JSON.parse(result.body).id,
      record = await db.getEvaluationById(id);
    assert.equal(record.assessorName, accounts.assessor.name);
    assert.equal(record.totalScore, scores.totalScore);
    assert.ok(!record.createdAt.startsWith("1999"));
    assert.ok(!record.certificate?.signedDate);
    assert.ok(!JSON.stringify(record.statusHistory).includes("attacker"));
    const old = await findAssessmentVersion(db, id, 1),
      immutable = JSON.stringify(old.breakdown);
    const resubmit = await call("save-evaluation", "assessor", {
      ...payload,
      resubmitRecordId: id,
    });
    assert.equal(resubmit.statusCode, 200, resubmit.body);
    assert.equal(
      JSON.stringify((await findAssessmentVersion(db, id, 1)).breakdown),
      immutable,
    );
    assert.equal((await db.getEvaluationById(id)).currentVersion, 2);
    assert.equal(
      (
        await call("approve-evaluation", "manager", {
          id,
          action: "approve",
          expectedVersion: 1,
        })
      ).statusCode,
      409,
    );
    await db.deleteEvaluation(id);
  });
  it("unassigned and wrong-assessor resources cannot be claimed by a resubmission", async () => {
    for (const id of ["security-b", "security-unassigned"])
      assert.equal(
        (
          await call(
            "save-evaluation",
            "assessor",
            submission({ resubmitRecordId: id }),
          )
        ).statusCode,
        403,
      );
  });
  it('reassignment blocks the old author from appending a new version',async()=>{
    await db.updateEvaluation('security-a',{assignedAssessorId:'security-other-account'});
    assert.equal((await call('save-evaluation','assessor',submission({resubmitRecordId:'security-a'}))).statusCode,403);
    await db.updateEvaluation('security-a',{assignedAssessorId:null});
  });
  it("certificate steps are bound to approved version, ordered and cannot be rewritten by replay", async () => {
    const r = await call("save-evaluation", "assessor", submission());
    assert.equal(r.statusCode, 200, r.body);
    const id = JSON.parse(r.body).id;
    assert.equal(
      (await call("issue-certificate", "manager", { id, step: "prepare" }))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await call("approve-evaluation", "manager", {
          id,
          action: "approve",
          managerName: "Forged Manager",
        expectedVersion:1,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await call("issue-certificate", "manager", {
          id,
          step: "sign",
          signedBy: "DGO",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call("issue-certificate", "manager", {
          id,
          step: "prepare",
          certificateNumber: "SEC-CERT",
          certifiedVersion: 99,
        })
      ).statusCode,
      200,
    );
    const prepared = await db.getEvaluationById(id);
    assert.equal(prepared.certificate.certifiedVersion, 1);
    assert.equal(prepared.approvedBy, "Security Manager");
    assert.equal(
      (
        await call("issue-certificate", "manager", {
          id,
          step: "prepare",
          certificateNumber: "ATTACK",
        })
      ).statusCode,
      409,
    );
    for (const body of [
      { step: "print" },
      { step: "sign", signedBy: "DGO" },
      { step: "deliver" },
    ])
      assert.equal(
        (await call("issue-certificate", "manager", { id, ...body }))
          .statusCode,
        200,
      );
    const publicResult = await call(
      "verify-certificate",
      null,
      {},
      { certificateNumber: "SEC-CERT" },
    );
    assert.equal(publicResult.statusCode, 200, publicResult.body);
    for (const sentinel of forbiddenSentinels.concat("ASSESSOR_SECRET"))
      assert.ok(!publicResult.body.includes(sentinel));
    await db.deleteEvaluation(id);
  });
  it("SSE strips secret notes, respects exact Assessor identity and current Vendor links", async () => {
    for (const id of ["security-a", "security-b"])
      recordStatusEvent({
        evaluationId: id,
        assessorId: id.endsWith("a") ? "SEC 1001" : "SEC 1002",
        assessorName: "Security Assessor",
        newStatus: "approved",
        note: "MANAGER_SECRET",
        risk: "RISK_SECRET",
        token: "JWT_SECRET_VALUE",
      });
    for (const role of ["assessor", "vendor_a", "vendor_b", "manager"]) {
      const result = await call("status-stream", role);
      assert.equal(result.statusCode, 200, result.body);
      for (const sentinel of forbiddenSentinels)
        assert.ok(!result.body.includes(sentinel));
      if (["assessor", "vendor_a"].includes(role)) {
        assert.ok(result.body.includes("security-a"));
        assert.ok(!result.body.includes("security-b"));
      }
    }
    await updateVendorRecord(db, "security-vendor-a", {
      linkedRegistrationIds: [],
    });
    assert.ok(
      !(await call("status-stream", "vendor_a")).body.includes("security-a"),
    );
    await updateVendorRecord(db, "security-vendor-a", {
      linkedRegistrationIds: ["security-a"],
    });
    const largeToken=generateToken({...accounts.vendor_a,linkedRegistrationIds:Array.from({length:200},(_,i)=>'legacy-registration-'+i)});
    const largeStream=await handlers['status-stream']({httpMethod:'GET',headers:{},queryStringParameters:{token:largeToken}});
    assert.equal(largeStream.statusCode,200,largeStream.body);
  });
  it("safe errors and logging never include exception, DB URI, auth token or disk path", async () => {
    const logged = [],
      original = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
      const safe = secureHandler(async () => {
        throw new Error(
          "JWT_SECRET_VALUE SERVER_PATH_SECRET mongodb://PASSWORD_HASH_SECRET",
        );
      }, "get-evaluations");
      const result = await safe({
        httpMethod: "GET",
        headers: { authorization: "Bearer " + tokens.manager },
        queryStringParameters: {},
      });
      assert.equal(result.statusCode, 500);
      for (const sentinel of forbiddenSentinels)
        assert.ok(![result.body, ...logged].join(" ").includes(sentinel));
      assert.match(logged[0], /INTERNAL_ERROR/);
    } finally {
      console.error = original;
    }
  });
  it("Mongo operator/prototype keys, object queries, bad IDs, excessive depth and password bytes are rejected", async () => {
    const inputs = [
      { id: { $ne: null } },
      { id: "../a" },
      { role: { $gt: "" } },
      { notes: "a".repeat(5001) },
      { password: "a".repeat(73) },
      JSON.parse('{"__proto__":{"role":"manager"}}'),
    ];
    for (const body of inputs)
      assert.equal(
        (await call("vendor-profile", "vendor_a", body, {}, "PUT")).statusCode,
        400,
      );
    assert.equal(
      (
        await handlers["get-evaluations"]({
          httpMethod: "GET",
          headers: { authorization: "Bearer " + tokens.manager },
          queryStringParameters: { q: { $ne: null } },
        })
      ).statusCode,
      400,
    );
  });
  it("same-origin CORS allows own origin, rejects foreign origin, never emits wildcard and returns security headers", async () => {
    for (const [origin, status] of [
      ["http://local.test", 200],
      ["https://evil.test", 403],
    ]) {
      const result = await handlers["verify-session"]({
        httpMethod: "GET",
        headers: {
          authorization: "Bearer " + tokens.manager,
          host: "local.test",
          origin,
        },
      });
      assert.equal(result.statusCode, status);
      assert.notEqual(result.headers["Access-Control-Allow-Origin"], "*");
      assert.equal(result.headers["Cache-Control"], "no-store");
      assert.equal(result.headers["X-Frame-Options"], "DENY");
    }
  });
  it("rate limits use trusted connection identity and enforce the configured window", () => {
    assert.equal(
      trustedClientIp({
        clientIp: "trusted",
        headers: { "x-forwarded-for": "attacker" },
      }),
      "trusted",
    );
    const key = "security-window-" + Date.now();
    assert.equal(checkRateLimit(key, 2, 1000, 1000), true);
    assert.equal(checkRateLimit(key, 2, 1000, 1001), true);
    assert.equal(checkRateLimit(key, 2, 1000, 1002), false);
    assert.equal(checkRateLimit(key, 2, 1000, 2001), true);
  });
  it("simultaneous mutations are rejected, and Mongo compare-and-set rejects a lost race", async () => {
    let release, entered;
    const pending = new Promise((r) => {
      release = r;
    });
    const started = new Promise((r) => {
      entered = r;
    });
    const guarded = secureHandler(async () => {
      entered();
      await pending;
      return { statusCode: 200, body: '{"success":true}' };
    }, "approve-evaluation");
    const event = {
      httpMethod: "POST",
      headers: { authorization: "Bearer " + tokens.manager },
      body: '{"id":"security-a"}',
    };
    const first = guarded(event);
    await started;
    assert.equal((await guarded(event)).statusCode, 409);
    release();
    assert.equal((await first).statusCode, 200);
    const captured = [];
    await assert.rejects(
      guardedEvaluationUpdate(
        {
          updateOne: async (...args) => {
            captured.push(args);
            return { matchedCount: 0 };
          },
        },
        { _id: "security-a", status: "pending_review", currentVersion: 1 },
        { _id: "security-a" },
        { $set: { status: "approved" } },
      ),
      (e) => e.code === "ASSESSMENT_CONFLICT",
    );
    assert.equal(captured[0][0].$and[1].currentVersion, 1);
  });
  it("ordinary password changes require the current password; forced setup accepts only flagged accounts", async () => {
    const user = await db.createUser({
      _id: "security-manager",
      name: "Security Manager",
      email: "security-manager@example.test",
      role: "manager",
      passwordHash: bcrypt.hashSync("CurrentPass1!", 4),
      mustChangePassword: false,
    });
    assert.ok(user);
    for (const current of [undefined, "wrong"])
      assert.equal(
        (
          await call("change-password", "manager", {
            newPassword: "Replacement1!",
            confirmPassword: "Replacement1!",
            currentPassword: current,
          })
        ).statusCode,
        403,
      );
    const changed = await call("change-password", "manager", {
      newPassword: "Replacement1!",
      confirmPassword: "Replacement1!",
      currentPassword: "CurrentPass1!",
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.ok(!changed.body.includes("passwordHash"));
  });
  it('public endpoint applies a real 429 rate limit without touching storage',async()=>{
    let response;for(let n=0;n<601;n++)response=await handlers['verify-certificate']({httpMethod:'GET',clientIp:'security-limiter-only',headers:{},queryStringParameters:{}});
    assert.equal(response.statusCode,429);assert.match(response.body,/Too many requests/);
  });
  it('first password setup is allowed only while both account and token require it',async()=>{
    await db.createUser({_id:'security-password-setup',role:'assessor',name:'Security setup',assessorId:'SEC 1003',email:'security-setup@example.test',passwordHash:bcrypt.hashSync('Temporary1!',4),mustChangePassword:true});
    const token=generateToken({role:'assessor',userId:'security-password-setup',assessorId:'SEC 1003',mustChangePassword:true});
    const event={httpMethod:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({newPassword:'Permanent1!',confirmPassword:'Permanent1!'})};
    assert.equal((await handlers['change-password'](event)).statusCode,200);
    assert.equal((await handlers['change-password'](event)).statusCode,403);
  });
  it("ExcelJS keeps CommonJS UUID support and exports/reopens a workbook after dependency patches", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Security").addRow(["Safe export"]);
    const bytes = await wb.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(bytes);
    assert.equal(
      restored.getWorksheet("Security").getCell("A1").value,
      "Safe export",
    );
  });
});
