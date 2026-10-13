import {secureHandler, logSecurityFailure} from './security.js';
/**
 * Netlify Serverless Function: verify-certificate
 * Public Certificate Verification Service for MIROS TrackScore
 *
 * Privacy & Security Rules:
 * - Publicly accessible without authentication
 * - Queries strictly by official certificateNumber
 * - Exposes ONLY public certificate endorsement metadata (companyName, deviceModel, package, starRating, signedBy, signedDate)
 * - Strictly OMITS: assessor identities, private contact emails, internal risk scores, invoices, bank payments, audit histories
 */

import { connectToDatabase, COLLECTION_NAME } from './db.js';

const rawHandler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  let certNumber = '';
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    certNumber = params.certificateNumber || params.certNumber || params.cert || params.number || '';
  } else if (event.httpMethod === 'POST') {
    let body = {};
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: 'Invalid JSON request payload.' })
      };
    }
    certNumber = body.certificateNumber || body.certNumber || body.cert || body.number || '';
  }

  const cleanCert = String(certNumber).trim();
  if (!cleanCert) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        valid: false,
        error: 'Certificate number is required for verification.'
      })
    };
  }

  try {
    const connection = await connectToDatabase();
    let record = null;

    if (connection.isMongoAtlas) {
      const col = connection.db.collection(COLLECTION_NAME);
      // Case-insensitive regex match for certificateNumber
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      record = await col.findOne({
        'certificate.certificateNumber': { $regex: new RegExp(`^${escapeRegex(cleanCert)}$`, 'i') },
        'certificate.signedDate': { $exists: true, $ne: null },
        status: { $in: ['certificate_issued', 'completed'] },
        deletedAt: null
      });
    } else {
      const all = await connection.getEvaluations();
      record = all.find(r =>
        r.certificate &&
        String(r.certificate.certificateNumber || '').trim().toLowerCase() === cleanCert.toLowerCase() &&
        r.certificate.signedDate &&
        ['certificate_issued', 'completed'].includes(r.status) &&
        !r.deletedAt
      );
    }

    if (!record || !record.certificate) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          valid: false,
          certificateNumber: cleanCert,
          message: 'Certificate not found or has not yet been endorsed by the Director General Office (DGO).'
        })
      };
    }

    const cert = record.certificate;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        certificate: {
          certificateNumber: cert.certificateNumber,
          status: 'OFFICIALLY VERIFIED & ACTIVE',
          companyName: record.companyName,
          deviceModel: record.deviceModel || 'N/A',
          packageName: record.packageName || 'Commercial Telematics Evaluation',
          starRating: record.starsCount || 0,
          ratingLabel: record.ratingLabel || 'Compliant with MIROS Telematics Safety Standards',
          totalScore: record.totalScore !== undefined ? record.totalScore : null,
          signedBy: cert.signedBy || 'Director General Office (DGO)',
          signedDate: cert.signedDate,
          deliveryDate: cert.sentToCustomerDate || cert.signedDate,
          issuingAuthority: 'Malaysian Institute of Road Safety Research (MIROS)'
        }
      })
    };
  } catch (err) {
    logSecurityFailure('verify-certificate');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: 'Internal server error verifying certificate.' })
    };
  }
};

export const handler = secureHandler(rawHandler, 'verify-certificate');

export default { handler };
