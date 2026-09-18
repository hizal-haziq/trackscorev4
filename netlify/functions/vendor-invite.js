/**
 * Netlify Serverless Function: vendor-invite
 * Manager-initiated vendor credential generation.
 *
 * Requirements:
 * - Generates a unique login email and immediately usable random password.
 * - Stores only the bcrypt password hash; plaintext is returned once to the manager.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  connectToDatabase,
  findVendorByEmail,
  findVendorByLoginEmail,
  createVendorRecord,
  updateVendorRecord,
  buildMongoIdFilter,
  COLLECTION_NAME,
  COLLECTION_VENDORS
} from './db.js';
import { validateRole, ROLE_MANAGER, authErrorResponse } from './auth.js';

const LOGIN_EMAIL_DOMAIN = 'trackscore-vendor.my';
const PASSWORD_WORDS = [
  'Falcon', 'River', 'Cedar', 'Meadow', 'Harbor', 'Summit', 'Orbit', 'Willow',
  'Comet', 'Maple', 'Anchor', 'Breeze', 'Canyon', 'Mango', 'Pioneer', 'Quartz',
  'Rocket', 'Silver', 'Tiger', 'Valley', 'Voyage', 'Forest', 'Lantern', 'Nimbus'
];

function makeCompanySlug(companyName) {
  return String(companyName || 'vendor')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'vendor';
}

function generateVendorPassword() {
  const first = PASSWORD_WORDS[crypto.randomInt(PASSWORD_WORDS.length)];
  let second = PASSWORD_WORDS[crypto.randomInt(PASSWORD_WORDS.length)];
  while (second === first) {
    second = PASSWORD_WORDS[crypto.randomInt(PASSWORD_WORDS.length)];
  }
  return `${first}-${second}-${String(crypto.randomInt(100)).padStart(2, '0')}`;
}

async function generateUniqueLoginEmail(connection, companyName, existingVendor = null) {
  const slug = makeCompanySlug(companyName);
  let suffix = 1;
  while (true) {
    const candidate = `${slug}${suffix === 1 ? '' : suffix}@${LOGIN_EMAIL_DOMAIN}`;
    const collision = await findVendorByLoginEmail(connection, candidate);
    if (!collision || (existingVendor && String(collision._id) === String(existingVendor._id))) {
      return candidate;
    }
    suffix += 1;
  }
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed.' })
    };
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid JSON payload.' })
    };
  }

  // Manager-only credential generation flow
  const roleCheck = validateRole(event, ROLE_MANAGER);
  if (!roleCheck.authorized) {
    return authErrorResponse(headers, roleCheck.statusCode, roleCheck.error);
  }

  const managerName = roleCheck.user?.name || 'Operations Manager';

  try {
    const {
      evaluationId,
      registrationId,
      contactEmail,
      companyName,
      contactPhone = ''
    } = body;
    const targetId = evaluationId || registrationId;

    if (!contactEmail || !contactEmail.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Vendor contact email address is required.' })
      };
    }

    const cleanEmail = contactEmail.trim().toLowerCase();
    const cleanCompany = (companyName || '').trim();

    const connection = await connectToDatabase();

    // Verify evaluation exists if targetId passed
    let evaluation = null;
    if (targetId) {
      if (connection.isMongoAtlas) {
        evaluation = await connection.db.collection(COLLECTION_NAME).findOne(buildMongoIdFilter(targetId));
      } else {
        evaluation = await connection.getEvaluationById(targetId);
      }
    }

    const finalCompanyName = cleanCompany || evaluation?.companyName || 'Registered Vendor';
    const existingVendor = await findVendorByEmail(connection, cleanEmail);

    const loginEmail = await generateUniqueLoginEmail(connection, finalCompanyName, existingVendor);
    const generatedPassword = generateVendorPassword();
    const passwordHash = bcrypt.hashSync(generatedPassword, bcrypt.genSaltSync(10));

    if (existingVendor) {
      const linked = Array.isArray(existingVendor.linkedRegistrationIds) ? [...existingVendor.linkedRegistrationIds] : [];
      if (targetId && !linked.includes(String(targetId))) {
        linked.push(String(targetId));
      }

      await updateVendorRecord(connection, existingVendor._id, {
        companyName: finalCompanyName,
        linkedRegistrationIds: linked,
        loginEmail,
        passwordHash,
        contactPhone: contactPhone.trim(),
        isActive: true,
        lastInvitedAt: new Date().toISOString(),
        lastInvitedBy: managerName
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Generated active vendor credentials for ${finalCompanyName}.`,
          isExistingAccount: true,
          vendor: {
            email: loginEmail,
            loginEmail,
            contactEmail: cleanEmail,
            contactPhone: contactPhone.trim(),
            password: generatedPassword,
            companyName: finalCompanyName,
            linkedRegistrationIds: linked
          }
        })
      };
    }

    // Create fresh vendor record with immediately usable credentials
    const newVendorDoc = {
      companyName: finalCompanyName,
      contactEmail: cleanEmail,
      loginEmail,
      contactPhone: contactPhone.trim(),
      passwordHash,
      linkedRegistrationIds: targetId ? [String(targetId)] : [],
      isActive: true,
      invitedBy: managerName,
      invitedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const created = await createVendorRecord(connection, newVendorDoc);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Vendor account created with active credentials for ${finalCompanyName}.`,
        isExistingAccount: false,
        vendor: {
          id: String(created._id),
          email: loginEmail,
          loginEmail,
          contactEmail: cleanEmail,
          contactPhone: contactPhone.trim(),
          password: generatedPassword,
          companyName: finalCompanyName,
          linkedRegistrationIds: newVendorDoc.linkedRegistrationIds
        }
      })
    };
  } catch (error) {
    console.error('[VENDOR-INVITE-ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Error creating vendor invitation.' })
    };
  }
};

export default { handler };
