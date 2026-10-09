/**
 * Netlify Serverless Function: vendor-documents
 * Secure Document & Evidence Management for Vendor Self-Service Portal
 *
 * Security & Ownership Enforcement:
 * - JWT authentication required (Vendor, Manager, or Assessor)
 * - Strict ownership check: Vendors can only access/upload documents for evaluations
 *   in their own `linkedRegistrationIds` (prevents IDOR)
 * - Document files are stored in `.uploads/` using sanitized unique IDs (never public paths)
 * - Path traversal protection and strict MIME type validation
 * - Anti-tampering: Vendors cannot delete accepted/verified documents
 */

import fs from 'fs';
import path from 'path';
import {
  connectToDatabase,
  findVendorById,
  findVendorByEmail,
  COLLECTION_NAME,
  buildMongoIdFilter
} from './db.js';
import {
  verifyToken,
  getBearerToken,
  ROLE_VENDOR,
  ROLE_MANAGER,
  ROLE_ASSESSOR
} from './auth.js';
import { recordStatusEvent } from './status-bus.js';

const UPLOADS_DIR = path.join(process.cwd(), '.uploads');
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return 'document';
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
}

function isSafeDocumentId(id) {
  return typeof id === 'string' && /^doc_[0-9]{10,16}_[a-z0-9]{1,12}$/.test(id);
}

function getStoredDocumentPath(id) {
  if (!isSafeDocumentId(id)) return null;
  const root = path.resolve(UPLOADS_DIR);
  const target = path.resolve(root, `${id}.bin`);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // 1. Authenticate JWT
  const token = getBearerToken(event);
  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Unauthorized: Missing Authorization Bearer token.' })
    };
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.role) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Unauthorized: Invalid or expired token.' })
    };
  }

  const userRole = decoded.role;
  const isVendor = userRole === ROLE_VENDOR;
  const isManager = userRole === ROLE_MANAGER;
  const isAssessor = userRole === ROLE_ASSESSOR;

  if (!isVendor && !isManager && !isAssessor) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: 'Forbidden: Insufficient privileges.' })
    };
  }

  try {
    const connection = await connectToDatabase();

    // Authoritative vendor verification
    let vendor = null;
    let linkedIds = [];
    if (isVendor) {
      if (decoded.vendorId) {
        vendor = await findVendorById(connection, decoded.vendorId);
      }
      if (!vendor && decoded.email) {
        vendor = await findVendorByEmail(connection, decoded.email);
      }
      if (!vendor || vendor.isActive === false) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, error: 'Forbidden: Vendor account not found or deactivated.' })
        };
      }
      linkedIds = Array.isArray(vendor.linkedRegistrationIds)
        ? vendor.linkedRegistrationIds.map(String)
        : [];
    }

    // Helper to fetch and verify evaluation document
    const getEvaluationWithOwnershipCheck = async (evalId) => {
      const cleanId = String(evalId || '').trim();
      if (!cleanId) return { error: 'Missing evaluation ID parameter', status: 400 };

      if (isVendor && !linkedIds.includes(cleanId)) {
        return { error: 'Forbidden: You do not have ownership of this evaluation.', status: 403 };
      }

      let evalDoc = null;
      if (connection.isMongoAtlas) {
        evalDoc = await connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(cleanId));
      } else {
        evalDoc = await connection.getEvaluationById(cleanId);
      }

      if (!evalDoc) {
        return { error: 'Evaluation record not found.', status: 404 };
      }

      // Check assessor scoping if role is assessor
      if (isAssessor) {
        const assessorId = String(decoded.assessorId || '').toLowerCase();
        const docAssessorId = String(evalDoc.assessorId || evalDoc.assignedAssessorId || '').toLowerCase();
        if (assessorId && docAssessorId && docAssessorId !== assessorId) {
          return { error: 'Forbidden: Assessors can only view documents for their assigned evaluations.', status: 403 };
        }
      }

      return { evalDoc };
    };

    // =========================================================================
    // GET: List Documents or Download File
    // =========================================================================
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const evalId = params.evaluationId || params.id;
      const docId = params.docId || params.documentId;
      const isDownload = params.action === 'download' || params.download === 'true';

      const check = await getEvaluationWithOwnershipCheck(evalId);
      if (check.error) {
        return {
          statusCode: check.status,
          headers,
          body: JSON.stringify({ success: false, error: check.error })
        };
      }

      const evalDoc = check.evalDoc;
      const documents = Array.isArray(evalDoc.documents) ? evalDoc.documents.filter(d => d.category !== 'payment_proof') : [];

      // Download specific document
      if (docId && isDownload) {
        const targetDoc = documents.find(d => String(d.id) === String(docId));
        if (!targetDoc) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ success: false, error: 'Document not found.' })
          };
        }

        const filePath = getStoredDocumentPath(String(targetDoc.id));
        if (!filePath) {
          return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Document not found.' }) };
        }
        if (!fs.existsSync(filePath)) {
          // If stored inline as base64
          if (targetDoc.fileData) {
            const buffer = Buffer.from(targetDoc.fileData, 'base64');
            return {
              statusCode: 200,
              headers: {
                ...headers,
                'Content-Type': targetDoc.fileType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${targetDoc.name}"`,
                'X-Content-Type-Options': 'nosniff'
              },
              isBase64Encoded: true,
              body: buffer.toString('base64')
            };
          }
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ success: false, error: 'Physical document file not found on disk.' })
          };
        }

        const fileBuffer = fs.readFileSync(filePath);
        return {
          statusCode: 200,
          headers: {
            ...headers,
            'Content-Type': targetDoc.fileType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${targetDoc.name}"`,
            'X-Content-Type-Options': 'nosniff'
          },
          isBase64Encoded: true,
          body: fileBuffer.toString('base64')
        };
      }

      // Return list of document metadata
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          evaluationId: String(evalDoc._id || evalDoc.id),
          companyName: evalDoc.companyName,
          documents: documents.map(({ fileData, ...meta }) => meta)
        })
      };
    }

    // =========================================================================
    // POST / DELETE: Upload or Delete Document
    // =========================================================================
    let body = {};
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON body.' })
      };
    }

    const action = String(body.action || (event.httpMethod === 'DELETE' ? 'delete' : 'upload')).toLowerCase();
    const evalId = body.evaluationId || body.id;

    const check = await getEvaluationWithOwnershipCheck(evalId);
    if (check.error) {
      return {
        statusCode: check.status,
        headers,
        body: JSON.stringify({ success: false, error: check.error })
      };
    }

    const evalDoc = check.evalDoc;
    const existingDocs = Array.isArray(evalDoc.documents) ? [...evalDoc.documents] : [];
    const nowIso = new Date().toISOString();
    const uploaderName = isVendor ? (vendor.companyName || 'Vendor') : (decoded.name || 'Staff');

    // -------------------------------------------------------------------------
    // Upload Document
    // -------------------------------------------------------------------------
    if (action === 'upload') {
      const rawName = String(body.name || body.fileName || '').trim();
      const category = String(body.category || 'other').trim();
      if (category.toLowerCase() === 'payment_proof') return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Unsupported document category.' }) };
      const rawBase64 = String(body.fileData || body.content || '').trim();
      const fileType = String(body.fileType || 'application/pdf').trim().toLowerCase();
      const notes = String(body.notes || '').trim();

      if (!ALLOWED_MIME_TYPES.includes(fileType)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Unsupported file type. Upload a PDF, image, Word document, or text file.' })
        };
      }

      if (!rawName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'File name is required.' })
        };
      }

      if (rawName.length > 255 || notes.length > 2000 || category.length > 50) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Document details exceed the allowed length.' }) };
      }

      if (!rawBase64) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'File content (base64) is required.' })
        };
      }

      // Strip data URL header if present (e.g. data:application/pdf;base64,...)
      const base64Data = rawBase64.replace(/^data:[^;]+;base64,/, '');
      if (base64Data.length > Math.ceil(MAX_FILE_SIZE_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64Data)) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'File content is invalid or exceeds the 10MB limit.' }) };
      }
      const fileBuffer = Buffer.from(base64Data, 'base64');

      if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'File size exceeds maximum limit of 10MB.' })
        };
      }

      const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const safeName = sanitizeFileName(rawName);

      ensureUploadsDir();
      const diskFilePath = getStoredDocumentPath(docId);
      if (!diskFilePath) throw new Error('Generated document identifier is invalid.');
      fs.writeFileSync(diskFilePath, fileBuffer);

      const categoryLabels = {
        device_spec: 'Device Technical Specification',
        test_report: 'Lab / Calibration Test Report',
        compliance_cert: 'Declaration of Conformity / Cert',
        installation_guide: 'Installation & Wiring Manual',
        other: 'Supporting Document'
      };

      const newDoc = {
        id: docId,
        name: safeName,
        category,
        categoryLabel: categoryLabels[category] || 'Supporting Evidence',
        fileType,
        fileSize: fileBuffer.length,
        status: 'uploaded',
        statusNote: 'Document submitted and queued for assessor review.',
        uploadedBy: uploaderName,
        uploadedByRole: userRole,
        uploadedAt: nowIso,
        notes
      };

      existingDocs.push(newDoc);

      const statusHistory = Array.isArray(evalDoc.statusHistory) ? [...evalDoc.statusHistory] : [];
      statusHistory.push({
        status: evalDoc.status || 'registered',
        timestamp: nowIso,
        actor: uploaderName,
        note: `Uploaded evidence document: "${safeName}" (${categoryLabels[category] || category})`
      });

      const updateData = {
        documents: existingDocs,
        statusHistory,
        updatedAt: nowIso
      };

      if (connection.isMongoAtlas) {
        await connection.db.collection(COLLECTION_NAME).updateOne(
          buildMongoIdFilter(evalDoc._id),
          { $set: updateData }
        );
      } else {
        await connection.updateEvaluation(String(evalDoc._id || evalDoc.id), updateData);
      }

      recordStatusEvent({
        evaluationId: String(evalDoc._id || evalDoc.id),
        companyName: evalDoc.companyName,
        deviceModel: evalDoc.deviceModel,
        status: evalDoc.status,
        newStatus: evalDoc.status,
        actor: uploaderName,
        note: `New document uploaded: ${safeName}`
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Document uploaded successfully.',
          document: newDoc
        })
      };
    }

    // -------------------------------------------------------------------------
    // Delete Document
    // -------------------------------------------------------------------------
    if (action === 'delete') {
      const docId = String(body.docId || body.documentId || '').trim();
      if (!docId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Document ID is required for deletion.' })
        };
      }

      const docIndex = existingDocs.findIndex(d => String(d.id) === docId);
      if (docIndex === -1) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Document not found in this evaluation record.' })
        };
      }

      const targetDoc = existingDocs[docIndex];
      if (targetDoc.category === 'payment_proof') {
        return { statusCode: 410, headers, body: JSON.stringify({ success: false, error: 'This document action is no longer available.' }) };
      }
      // Anti-tampering: Vendors cannot delete accepted/verified documents
      if (isVendor && targetDoc.status === 'accepted') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, error: 'Accepted documents cannot be deleted. Contact your manager if replacement is needed.' })
        };
      }

      // Remove from list
      existingDocs.splice(docIndex, 1);

      // Remove physical file from disk if present
      const diskFilePath = getStoredDocumentPath(docId);
      if (diskFilePath && fs.existsSync(diskFilePath)) {
        try {
          fs.unlinkSync(diskFilePath);
        } catch {}
      }

      const statusHistory = Array.isArray(evalDoc.statusHistory) ? [...evalDoc.statusHistory] : [];
      statusHistory.push({
        status: evalDoc.status || 'registered',
        timestamp: nowIso,
        actor: uploaderName,
        note: `Removed evidence document: "${targetDoc.name}"`
      });

      const updateData = {
        documents: existingDocs,
        statusHistory,
        updatedAt: nowIso
      };

      if (connection.isMongoAtlas) {
        await connection.db.collection(COLLECTION_NAME).updateOne(
          buildMongoIdFilter(evalDoc._id),
          { $set: updateData }
        );
      } else {
        await connection.updateEvaluation(String(evalDoc._id || evalDoc.id), updateData);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Document deleted successfully.'
        })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid action. Supported actions: "upload", "delete".' })
    };
  } catch (err) {
    console.error('[VENDOR-DOCUMENTS-ERROR]', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error processing document request.' })
    };
  }
};

export default { handler };
