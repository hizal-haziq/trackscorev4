// Shared HTTP hardening for both direct Netlify invocation and Express adapters.
import crypto from "node:crypto";
import { validateRole, verifyToken, getBearerToken } from "./auth.js";
import {
  connectToDatabase,
  findVendorById,
  findVendorByEmail,
  buildMongoIdFilter,
  COLLECTION_NAME,
} from "./db.js";

const manager = ["manager"],
  staff = ["manager", "assessor"],
  vendor = ["vendor"],
  all = ["manager", "assessor", "vendor"];
export const ENDPOINT_SECURITY = {
  login: { methods: ["POST"], public: true },
  "vendor-login": { methods: ["POST"], public: true },
  "verify-certificate": { methods: ["GET", "POST"], public: true },
  "submit-inquiry": { methods: ["POST"], public: true },
  config: { methods: ["GET"], public: true },
  "send-pre-final": { methods: ["GET", "POST", "PUT", "DELETE"], public: true },
  "verify-payment": { methods: ["GET", "POST", "PUT", "DELETE"], public: true },
  "vendor-submit-payment": {
    methods: ["GET", "POST", "PUT", "DELETE"],
    public: true,
  },
  "change-password": {
    methods: ["POST"],
    roles: staff,
    allowPasswordChange: true,
  },
  "verify-session": { methods: ["GET"], roles: all, allowPasswordChange: true },
  "get-evaluations": { methods: ["GET"], roles: staff },
  "lookup-evaluation": { methods: ["GET"], roles: staff },
  "get-notifications": { methods: ["GET"], roles: staff },
  "get-assessment-history": { methods: ["GET"], roles: all },
  "get-assessment-version": { methods: ["GET"], roles: all },
  "get-assessment-risk": { methods: ["GET"], roles: staff },
  "status-stream": { methods: ["GET"], roles: all, queryToken: true },
  "add-comment": { methods: ["POST"], roles: staff },
  "save-evaluation": { methods: ["POST"], roles: ["assessor"] },
  "update-evaluation": { methods: ["PUT", "PATCH"], roles: manager },
  "delete-evaluation": { methods: ["DELETE"], roles: manager },
  "approve-evaluation": { methods: ["POST"], roles: manager },
  "assign-assessor": { methods: ["POST"], roles: manager },
  "schedule-assessment": { methods: ["POST"], roles: manager },
  "issue-certificate": { methods: ["POST"], roles: manager },
  "manage-invoice": { methods: ["POST"], roles: manager },
  "register-customer": { methods: ["POST"], roles: manager },
  "manage-inquiries": { methods: ["GET", "POST"], roles: manager },
  "manage-users": { methods: ["GET", "POST"], roles: manager },
  "export-evaluations": { methods: ["GET"], roles: manager },
  "get-assessor-workload": { methods: ["GET"], roles: manager },
  "vendor-invite": { methods: ["POST"], roles: manager },
  "vendor-profile": { methods: ["GET", "POST", "PUT"], roles: vendor },
  "vendor-resubmit": { methods: ["POST"], roles: vendor },
  "vendor-portal-data": { methods: ["GET"], roles: vendor },
  "vendor-documents": { methods: ["GET", "POST", "DELETE"], roles: all },
};
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
export function trustedClientIp(event) {
  return (
    event.clientIp ||
    event.requestContext?.identity?.sourceIp ||
    event.headers?.["x-nf-client-connection-ip"] ||
    "unknown"
  );
}
export function logSecurityFailure(endpoint, error) {
  const code = [
    "DATABASE_UNAVAILABLE",
    "ASSESSMENT_CONFLICT",
    11000,
    "ENOENT",
    "EACCES",
  ].includes(error?.code)
    ? error.code
    : "INTERNAL_ERROR";
  console.error(`[${endpoint}] ${code}`);
}
const limits = new Map(),
  locks = new Set();
export function checkRateLimit(
  key,
  maximum = 120,
  windowMs = 60_000,
  now = Date.now(),
) {
  if (limits.size >= 10_000)
    for (const [key, v] of limits) if (v.until <= now) limits.delete(key);
  let value = limits.get(key);
  if(!value && limits.size>=10_000)return false;
  if (!value || value.until <= now) {
    value = { count: 0, until: now + windowMs };
    limits.set(key, value);
  }
  value.count++;
  return value.count <= maximum;
}
const lower = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
export function assessorOwns(record, user) {
  const ids = [user.userId, user.id, user._id, user.assessorId]
    .filter(Boolean)
    .map(lower);
  const recordedIds = [record.assignedAssessorId, record.assessorId]
    .filter(Boolean)
    .map(lower);
  if (recordedIds.length) return recordedIds.some((id) => ids.includes(id));
  const email = lower(record.assignedAssessorEmail || record.createdBy);
  if (email) return !!user.email && email === lower(user.email);
  const names = [
    record.assignedAssessor,
    record.assignedAssessorName,
    record.assessorName,
  ]
    .filter(Boolean)
    .map(lower);
  return !!user.name && names.includes(lower(user.name));
}
export function assessorCanEdit(record, user) {
  // Reassignment controls writes even while an author can still read history.
  if(record.assignedAssessorId)return assessorOwns({assignedAssessorId:record.assignedAssessorId},user);
  if(record.assignedAssessorEmail)return assessorOwns({assignedAssessorEmail:record.assignedAssessorEmail},user);
  const assignedName=record.assignedAssessorName||record.assignedAssessor;
  if(assignedName)return assessorOwns({assignedAssessorName:assignedName},user);
  return assessorOwns(record,user);
}

export const peerEligible = (record) =>
  !record.deletedAt &&
  [
    "submitted",
    "pending_review",
    "approved",
    "pre_final_sent",
    "payment_confirmed",
    "certificate_issued",
    "completed",
  ].includes(lower(record.status));
export function assessorMongoScope(user) {
  const exact = (value) =>
    new RegExp(
      "^" + String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
      "i",
    );
  const ids = [user.userId, user.id, user._id, user.assessorId]
    .filter(Boolean)
    .map(exact);
  const absent = {
    $and: [
      { assessorId: { $in: [null, ""] } },
      { assignedAssessorId: { $in: [null, ""] } },
    ],
  };
  const noAssignedEmail = { assignedAssessorEmail: { $in: [null, ""] } };
  const noCreatorEmail = { createdBy: { $in: [null, ""] } };
  const fallback = [];
  if (user.email)
    fallback.push(
      { assignedAssessorEmail: exact(user.email) },
      { $and: [noAssignedEmail, { createdBy: exact(user.email) }] },
    );
  if (user.name)
    fallback.push({
      $and: [
        noAssignedEmail,
        noCreatorEmail,
        {
          $or: [
            { assessorName: exact(user.name) },
            { assignedAssessor: exact(user.name) },
            { assignedAssessorName: exact(user.name) },
          ],
        },
      ],
    });
  return {
    $and: [
      {
        $or: [
          ...(ids.length
            ? [
                { assessorId: { $in: ids } },
                { assignedAssessorId: { $in: ids } },
              ]
            : []),
          ...(fallback.length ? [{ $and: [absent, { $or: fallback }] }] : []),
          { _id: "__NO_AUTHORIZED_RECORD__" },
        ],
      },
    ],
  };
}
export function projectStatusEvent(event, user, account) {
  if (
    user.role === "vendor" &&
    !vendorOwns(
      {
        _id: event.evaluationId || event.id,
        registrationReferenceId:
          event.registrationReferenceId || event.linkedRegistrationId,
      },
      account,
    )
  )
    return null;
  if (user.role === "assessor" && !assessorOwns(event, user)) return null;
  return pick(event, [
    "id",
    "evaluationId",
    "companyName",
    "deviceModel",
    "status",
    "newStatus",
    "oldStatus",
    "timestamp",
    "slaDeadline",
    "slaStatus",
    "assessorId",
    "assignedAssessorId",
    "action",
  ]);
}
export async function authoritativeVendor(user) {
  const db = await connectToDatabase();
  let account = user.vendorId ? await findVendorById(db, user.vendorId) : null;
  if (!account && user.email) account = await findVendorByEmail(db, user.email);
  return account && account.isActive !== false ? account : null;
}
export function vendorOwns(record, account) {
  const ids = (account?.linkedRegistrationIds || []).map(String);
  return (
    ids.includes(String(record._id || record.id)) ||
    ids.includes(
      String(
        record.registrationReferenceId || record.linkedRegistrationId || "",
      ),
    )
  );
}
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
function validateTree(value, depth = 0) {
  if (depth > 12) throw new Error("Invalid nested input.");
  if (typeof value === "string" && value.length > 15_000_000)
    throw new Error("Input exceeds size limit.");
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new Error("Input exceeds size limit.");
    for (const v of value) validateTree(v, depth + 1);
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    if (forbiddenKeys.has(key) || key.startsWith("$"))
      throw new Error("Invalid input field.");
    validateTree(v, depth + 1);
  }
}
function validateInput(event) {
  const q = event.queryStringParameters || {};
  for (const [key, value] of Object.entries(q)) {
    if (typeof value !== "string" || value.length > (["token","auth"].includes(key)?16_384:2000))
      throw new Error("Invalid query parameter.");
    if (
      ["version", "versionNumber", "page", "limit"].includes(key) &&
      !/^\d+$/.test(value)
    )
      throw new Error("Invalid numeric parameter.");
  }
  let body =
    typeof event.body === "string"
      ? JSON.parse(event.body || "{}")
      : event.body || {};
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Request body must be a JSON object.");
  validateTree(body);
  validateTree(q);
  for (const key of [
    "id",
    "_id",
    "evaluationId",
    "registrationId",
    "resubmitRecordId",
    "linkedRegistrationId",
    "registrationReferenceId",
    "userId",
    "docId",
    "documentId",
  ])
    for (const input of [body, q])
      if (
        input[key] !== undefined &&
        input[key] !== null &&
        (typeof input[key] !== "string" ||
          input[key].length > 128 ||
          /[\x00-\x1f/\\]/.test(input[key]))
      )
        throw new Error("Invalid resource identifier.");
  for (const key of [
    "email",
    "password",
    "newPassword",
    "currentPassword",
    "confirmPassword",
    "companyName",
    "contactPerson",
    "contactEmail",
    "contactPhone",
    "officeAddress",
    "state",
    "registrationNumber",
    "notes",
    "responseNotes",
    "remediationNote",
    "managerReviewComment",
    "reviewComment",
    "instructions",
    "deviceModel",
    "certificateNumber",
    "signedBy",
    "assessorName",
    "action",
    "status",
    "reason",
    "changeReason",
    "resubmitReason",
    "rejectionReason",
    "assessorId",
    "assessorEmail",
    "managerName",
    "name",
    "fileName",
    "step",
    "dgoName",
    "deliveryMethod",
  ])
    if (
      body[key] !== undefined &&
      body[key] !== null &&
      (typeof body[key] !== "string" || body[key].length > 5000)
    )
      throw new Error("Invalid field value.");
  for (const key of [
    "password",
    "newPassword",
    "currentPassword",
    "confirmPassword",
    "vendorPassword",
  ])
    if (
      body[key] !== undefined &&
      (typeof body[key] !== "string" ||
        Buffer.byteLength(body[key], "utf8") > 72)
    )
      throw new Error("Password exceeds supported length.");
  for (const [key, value] of Object.entries(body))
    if (
      /Date$/.test(key) &&
      value !== null &&
      value !== undefined &&
      value !== "" &&
      (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    )
      throw new Error("Invalid date.");
  if (
    body.expectedVersion !== undefined &&
    (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 0)
  )
    throw new Error("Invalid expected version.");
  return body;
}
function pick(value, fields) {
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    fields.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]),
  );
}
const certificateFields = [
  "certificateNumber",
  "certifiedVersion",
  "preparedDate",
  "printedDate",
  "signedBy",
  "signedDate",
  "sentToCustomerDate",
  "deliveryMethod",
];
const docFields = [
  "id",
  "name",
  "fileName",
  "filename",
  "category",
  "categoryLabel",
  "fileType",
  "fileSize",
  "status",
  "statusNote",
  "uploadedAt",
  "uploadedByRole",
  "notes",
];
export function minimizeOutput(
  value,
  role,
  endpoint,
  path = [],
  allowIssuedPassword = false,
) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((v) =>
      minimizeOutput(v, role, endpoint, path, allowIssuedPassword),
    );
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    const authToken =
      key === "token" &&
      path.length === 0 &&
      ["login", "vendor-login", "change-password"].includes(endpoint);
    const issuedPassword =
      allowIssuedPassword &&
      key === "password" &&
      (path.length === 0 ||
        (path.length === 1 &&
          ["credentials", "vendorCredentials"].includes(path[0]))) &&
      role === "manager";
    if (
      !authToken &&
      !issuedPassword &&
      key !== "mustChangePassword" &&
      (/password|secret|token|authorization|private.*path|filePath|serverPath|disk.*path|mongo.*uri/i.test(
        key,
      ) ||
        key === "fileData" ||
        key === "atlasDiagnostic")
    )
      continue;
    if (
      role === "vendor" &&
      [
        "risk",
        "workload",
        "audit",
        "internalNotes",
        "managerReviewComment",
        "reviewComment",
        "comments",
        "commentsOverallSummary",
        "evaluationHistory",
        "changeReason",
      ].includes(key)
    )
      continue;
    if (
      role === "assessor" &&
      [
        "managerReviewComment",
        "reviewComment",
        "workload",
        "internalNotes",
        "audit",
        "managerNotes",
      ].includes(key)
    )
      continue;
    if (role === "vendor" && key === "scores") {
      out[key] = pick(v, [
        "sectionAScore",
        "sectionBScore",
        "totalScore",
        "starRating",
        "starsCount",
        "ratingLabel",
        "maxPossibleScore",
      ]);
      continue;
    }
    if (role === "vendor" && key === "breakdown" && Array.isArray(v)) {
      out[key] = v.map((row) =>
        pick(row, [
          "id",
          "title",
          "section",
          "selectedOption",
          "points",
          "rawPoints",
          "maxPoints",
          "weight",
        ]),
      );
      continue;
    }
    if (role === "assessor" && key === "statusHistory" && Array.isArray(v)) {
      out[key] = v.map((row) =>
        pick(row, ["status", "changedAt", "timestamp", "reason", "action"]),
      );
      continue;
    }
    if (role === "vendor" && key === "statusHistory" && Array.isArray(v)) {
      out[key] = v.map((row) =>
        pick(row, ["status", "changedAt", "timestamp"]),
      );
      continue;
    }
    if (role === "vendor" && key === "version") {
      out[key] = minimizeOutput(
        pick(v, [
          "evaluationId",
          "versionNumber",
          "action",
          "actor",
          "scores",
          "breakdown",
          "metadata",
          "isApprovedVersion",
          "isCertifiedVersion",
          "createdAt",
          "rubricVersion",
        ]),
        role,
        endpoint,
        [...path, key],
        allowIssuedPassword,
      );
      continue;
    }
    if (role === "vendor" && key === "certificate") {
      out[key] = minimizeOutput(
        pick(v, certificateFields),
        role,
        endpoint,
        [...path, key],
        allowIssuedPassword,
      );
      continue;
    }
    if (key === "documents" && Array.isArray(v)) {
      out[key] = v
        .filter((d) => d?.category !== "payment_proof")
        .map((d) =>
          minimizeOutput(
            pick(d, docFields),
            role,
            endpoint,
            [...path, key],
            allowIssuedPassword,
          ),
        );
      continue;
    }
    if (role === "vendor" && key === "metadata") {
      out[key] = pick(v, [
        "companyName",
        "deviceModel",
        "assessmentDate",
        "rubricVersion",
      ]);
      continue;
    }
    if (role === "vendor" && key === "actor") {
      out[key] = pick(v, ["name", "role"]);
      continue;
    }
    out[key] = minimizeOutput(
      v,
      role,
      endpoint,
      [...path, key],
      allowIssuedPassword,
    );
  }
  return out;
}
export function headersFor(event, policy) {
  const h = {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": policy.methods.concat("OPTIONS").join(", "),
    Vary: "Origin",
  };
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CONTEXT === "production"
  )
    h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  const origin = event.headers?.origin || event.headers?.Origin;
  if (origin) {
    const allowed = (process.env.TRACKSCORE_ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const configured = [process.env.URL, process.env.DEPLOY_PRIME_URL].filter(
      Boolean,
    );
    const host = event.headers?.host;
    let same = false;
    try {
      const url = new URL(origin);
      same =
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.host === host;
    } catch {}
    if (!same && !allowed.concat(configured).includes(origin)) return null;
    h["Access-Control-Allow-Origin"] = origin;
  }
  return h;
}
export function secureHandler(handler, endpoint) {
  const policy = ENDPOINT_SECURITY[endpoint];
  if (!policy) throw new Error("Missing endpoint security policy.");
  return async (event, context) => {
    const headers = headersFor(event, policy);
    const reply = (status, error) => ({
      statusCode: status,
      headers: headers || {
        ...SECURITY_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ success: false, error }),
    });
    if (!headers) return reply(403, "Access denied for this origin.");
    if (event.httpMethod === "OPTIONS")
      return { statusCode: 204, headers, body: "" };
    if (!policy.methods.includes(event.httpMethod))
      return reply(405, "Method not allowed.");
    let user = null;
    if (!policy.public) {
      const auth = validateRole(event, policy.roles, {
        allowQuery: policy.queryToken,
        allowPasswordChange: policy.allowPasswordChange,
      });
      if (!auth.authorized) return reply(auth.statusCode, auth.error);
      user = auth.user;
    }
    let body;
    try {
      body = validateInput(event);
    } catch {
      return reply(400, "Invalid request input.");
    }
    const principal = user
      ? [
          user.role,
          user.userId ||
            user.vendorId ||
            user.assessorId ||
            user.email ||
            "session",
        ].join(":")
      : trustedClientIp(event);
    const key = crypto
      .createHash("sha256")
      .update(endpoint + ":" + principal)
      .digest("hex");
    if (!checkRateLimit(key, event.httpMethod === "GET" ? 600 : 300, 600_000))
      return reply(429, "Too many requests. Please try again later.");
    const id =
      body.id ||
      body._id ||
      body.evaluationId ||
      body.resubmitRecordId ||
      body.registrationId ||
      body.linkedRegistrationId ||
      body.registrationReferenceId ||
      event.queryStringParameters?.id;
    const mutation =
      !["GET", "OPTIONS"].includes(event.httpMethod) &&
      !["login", "vendor-login"].includes(endpoint);
    const lockKey = mutation
      ? id
        ? "assessment:" + id
        : endpoint +
          ":" +
          principal +
          ":" +
          (body.companyName || body.userId || "")
      : null;
    if (lockKey && locks.has(lockKey))
      return reply(
        409,
        "Information changed or action is already running. Reload before retrying.",
      );
    if (lockKey) locks.add(lockKey);
    try {
      const cleanEvent = { ...event, securityExpectedVersion: body.expectedVersion };
      if (
        user?.role === "vendor" &&
        [
          "get-assessment-history",
          "get-assessment-version",
          "status-stream",
        ].includes(endpoint)
      ) {
        const account = await authoritativeVendor(user);
        if (!account)
          return reply(403, "Access denied. Vendor account is unavailable.");
        cleanEvent.securityVendor = account;
      }
      if (body.expectedVersion !== undefined && id) {
        const db = await connectToDatabase();
        const record = db.isMongoAtlas
          ? await db.db
              .collection(COLLECTION_NAME)
              .findOne(buildMongoIdFilter(id))
          : await db.getEvaluationById(id);
        if (
          record &&
          Number(record.currentVersion || 0) !== body.expectedVersion
        )
          return reply(
            409,
            "Information changed. Reload the assessment before retrying.",
          );
      }
      const result = await handler(cleanEvent, context);
      if (!result) return reply(500, "Internal Server Error.");
      if (result.statusCode >= 500)
        return reply(
          result.statusCode,
          "Internal Server Error. Please try again later.",
        );
      const safeHeaders = { ...(result.headers || {}), ...headers };
      safeHeaders["Content-Type"] =
        result.headers?.["Content-Type"] || headers["Content-Type"];
      delete safeHeaders["Access-Control-Allow-Origin"];
      if (headers["Access-Control-Allow-Origin"])
        safeHeaders["Access-Control-Allow-Origin"] =
          headers["Access-Control-Allow-Origin"];
      let output = result.body;
      if (
        !result.isBase64Encoded &&
        (safeHeaders["Content-Type"] || "").includes("json") &&
        typeof output === "string"
      ) {
        try {
          output = JSON.stringify(
            minimizeOutput(
              JSON.parse(output),
              user?.role,
              endpoint,
              [],
              event.httpMethod === "POST" &&
                ["manage-users", "vendor-invite", "register-customer"].includes(
                  endpoint,
                ),
            ),
          );
        } catch {
          return reply(500, "Internal Server Error.");
        }
      }
      return { ...result, headers: safeHeaders, body: output };
    } catch (error) {
      logSecurityFailure(endpoint, error);
      return reply(
        error?.code === "ASSESSMENT_CONFLICT"
          ? 409
          : error?.code === "DATABASE_UNAVAILABLE"
            ? 503
            : 500,
        error?.code === "ASSESSMENT_CONFLICT"
          ? "Information changed. Reload before retrying."
          : "Internal Server Error. Please try again later.",
      );
    } finally {
      if (lockKey) locks.delete(lockKey);
    }
  };
}
