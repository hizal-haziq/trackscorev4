/**
 * Netlify Serverless Function: vendor-portal-data
 * Vendor-facing endpoint providing self-service read-only access to their own evaluation records.
 *
 * Security & Data Isolation Mandate:
 * - Requires valid JWT with role: 'vendor'
 * - Every vendor-facing endpoint must verify both the JWT AND that the requested record's
 *   linkedRegistrationIds actually includes that vendor's account — reject with 403 otherwise,
 *   even with a valid JWT.
 * - Prevents ID substitution attacks between vendors.
 * - Strips all internal assessment criteria/rubric details, exposing only client-facing
 *   lifecycle, package, invoice, payment, and certificate data.
 */

import {
  connectToDatabase,
  findVendorById,
  findVendorByEmail,
  COLLECTION_NAME,
  buildMongoIdFilter
} from './db.js';
import { verifyToken, getBearerToken, ROLE_VENDOR } from './auth.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed. Use GET.' })
    };
  }

  // 1. Authenticate Vendor JWT
  const token = getBearerToken(event);
  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Unauthorized: Missing Bearer token. Please log in.' })
    };
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== ROLE_VENDOR) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: 'Forbidden: Access restricted to authorized vendor accounts.' })
    };
  }

  try {
    const connection = await connectToDatabase();

    // Re-verify vendor in database to get authoritative linked IDs
    let vendor = null;
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
        body: JSON.stringify({ success: false, error: 'Vendor account not found or deactivated.' })
      };
    }

    const linkedIds = Array.isArray(vendor.linkedRegistrationIds)
      ? vendor.linkedRegistrationIds.map(id => String(id).trim())
      : [];

    // Check if requesting a specific evaluation ID (e.g. ?id=xxx)
    const requestedId = event.queryStringParameters?.id;
    if (requestedId) {
      const cleanRequestedId = String(requestedId).trim();

      // STRICT CHECK: The requested ID must be explicitly present in vendor.linkedRegistrationIds
      if (!linkedIds.includes(cleanRequestedId)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Forbidden: You do not have permission to view this evaluation record.'
          })
        };
      }

      let targetDoc = null;
      if (connection.isMongoAtlas) {
        targetDoc = await connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(cleanRequestedId));
      } else {
        targetDoc = await connection.getEvaluationById(cleanRequestedId);
      }

      if (!targetDoc) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Evaluation record not found.' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          evaluation: sanitizeVendorRecord(targetDoc)
        })
      };
    }

    // If no linked IDs exist, return empty list immediately
    if (linkedIds.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          vendor: {
            id: String(vendor._id),
            companyName: vendor.companyName,
            contactEmail: vendor.contactEmail,
            contactPhone: vendor.contactPhone
          },
          evaluations: []
        })
      };
    }

    // Fetch all evaluations strictly owned by this vendor
    let records = [];
    if (connection.isMongoAtlas) {
      const col = connection.db.collection(COLLECTION_NAME);
      const mongoFilters = linkedIds.map(id => {
        try {
          return buildMongoIdFilter(id)._id;
        } catch {
          return id;
        }
      });
      records = await col.find({
        _id: { $in: mongoFilters },
        deletedAt: { $exists: false }
      }).sort({ createdAt: -1 }).toArray();
    } else {
      const all = await connection.getEvaluations(false);
      records = all.filter(r => linkedIds.includes(String(r._id || r.id)));
    }

    const sanitized = records.map(sanitizeVendorRecord);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        vendor: {
          id: String(vendor._id),
          companyName: vendor.companyName,
          contactEmail: vendor.contactEmail,
          contactPhone: vendor.contactPhone
        },
        evaluations: sanitized
      })
    };
  } catch (error) {
    console.error('[VENDOR-PORTAL-DATA-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error fetching vendor portal data.' })
    };
  }
};

// Strips out internal assessor scoring rubrics and returns clean vendor presentation data
function sanitizeVendorRecord(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id || doc.id),
    companyName: doc.companyName,
    deviceModel: doc.deviceModel,
    package: doc.package || 'package_1',
    packageName: doc.packageName || 'Standard Assessment',
    packageDetails: doc.packageDetails || null,
    status: doc.status || 'registered',
    scheduledDate: doc.scheduledDate || null,
    assessmentDate: doc.assessmentDate || null,
    totalScore: doc.totalScore !== undefined ? doc.totalScore : null,
    starsCount: doc.starsCount !== undefined ? doc.starsCount : null,
    ratingLabel: doc.ratingLabel || null,
    invoice: doc.invoice || null,
    payment: doc.payment || null,
    certificate: doc.certificate || null,
    preFinalResult: doc.preFinalResult ? {
      sentDate: doc.preFinalResult.sentDate,
      notes: doc.preFinalResult.notes
    } : null,
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory.map(h => ({
      status: h.status,
      timestamp: h.timestamp,
      note: h.note
    })) : [],
    createdAt: doc.createdAt,
    statusChangedAt: doc.statusChangedAt
  };
}

export default { handler };
