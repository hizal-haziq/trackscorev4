/**
 * MongoDB Atlas connection helper for Netlify Serverless Functions
 * Provides connection pooling/caching across warm serverless invocations.
 * Includes local fallback storage when MONGODB_URI is not yet configured.
 */

import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

let cachedClient = null;
let cachedDb = null;
let lastAtlasAttemptTime = 0;
let lastAtlasErrorMessage = null;
let isIpWhitelistBlocked = false;
let hasLoggedNotice = false;
const ATLAS_RETRY_COOLDOWN_MS = 60000; // 60s cooldown before retrying Atlas

export const DB_NAME = 'trackscore';
export const COLLECTION_NAME = 'evaluations';
export const COLLECTION_USERS = 'users';
export const COLLECTION_VENDORS = 'vendors';
export const COLLECTION_INQUIRIES = 'inquiries';
export const COLLECTION_VERSIONS = 'assessment_versions';
export const COLLECTION_RISK = 'assessment_risk';

const FALLBACK_DIR = path.join(process.cwd(), '.data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'evaluations.json');
const USERS_FILE = path.join(FALLBACK_DIR, 'users.json');
const VENDORS_FILE = path.join(FALLBACK_DIR, 'vendors.json');
const INQUIRIES_FILE = path.join(FALLBACK_DIR, 'inquiries.json');
const VERSIONS_FILE = path.join(FALLBACK_DIR, 'assessment_versions.json');
const RISK_FILE = path.join(FALLBACK_DIR, 'assessment_risk.json');

let fallbackStoreEnsured = false;
const isProductionEnvironment = process.env.NODE_ENV === 'production' || process.env.CONTEXT === 'production';

class DatabaseUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.code = 'DATABASE_UNAVAILABLE';
  }
}

// Ensure local development storage exists. User accounts must be created explicitly.
function ensureFallbackStore() {
  if (fallbackStoreEnsured && fs.existsSync(FALLBACK_FILE) && fs.existsSync(USERS_FILE) && fs.existsSync(VENDORS_FILE) && fs.existsSync(VERSIONS_FILE) && fs.existsSync(RISK_FILE)) {
    return;
  }
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }

  // 1. Evaluations Store
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  // 2. Users Store
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  // 3. Vendors Store (External Client Accounts)
  if (!fs.existsSync(VENDORS_FILE)) {
    fs.writeFileSync(VENDORS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  // 4. Inquiries Store
  if (!fs.existsSync(INQUIRIES_FILE)) {
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  // 5. Assessment Versions Store
  if (!fs.existsSync(VERSIONS_FILE)) {
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  // 6. Assessment Risk Store
  if (!fs.existsSync(RISK_FILE)) {
    fs.writeFileSync(RISK_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  fallbackStoreEnsured = true;
}

export function buildMongoIdFilter(id) {
  if (ObjectId.isValid(id)) {
    try {
      return { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] };
    } catch {
      return { _id: String(id) };
    }
  }
  return { _id: String(id) };
}

let indexesEnsured = false;
let migrationExecuted = false;

export async function runLifecycleMigration(db, isMongoAtlas) {
  if (migrationExecuted) return;
  migrationExecuted = true;

  try {
    const nowIso = new Date().toISOString();
    if (isMongoAtlas && db) {
      const col = db.collection(COLLECTION_NAME);
      const approvedDocs = await col.find({ status: 'approved', approvedVersion: { $exists: false } }).toArray();
      if (approvedDocs.length > 0) {
        console.log(`[LIFECYCLE-MIGRATION] Found ${approvedDocs.length} legacy "approved" records. Starting migration to "completed"...`);
        for (const doc of approvedDocs) {
          const statusHistory = Array.isArray(doc.statusHistory) ? [...doc.statusHistory] : [];
          statusHistory.push({
            status: 'completed',
            timestamp: doc.approvedAt || nowIso,
            actor: doc.approvedBy || 'System Migration',
            note: 'One-time migration: Transitioned legacy "approved" status to "completed" in full administrative lifecycle.'
          });


          await col.updateOne(
            { _id: doc._id },
            {
              $set: {
                status: 'completed',
                statusHistory,
                migratedFromApprovedAt: nowIso
              }
            }
          );
          console.log(`[LIFECYCLE-MIGRATION] Migrated evaluation ID: ${doc._id} (${doc.companyName || 'Unknown'}) to "completed".`);
        }
      }
    } else {
      // Local fallback migration
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      let modified = false;
      data.forEach(doc => {
        if (!Array.isArray(doc.statusHistory)) {
          doc.statusHistory = [];
        }
        if (doc.status === 'approved' && !doc.approvedVersion) {
          doc.status = 'completed';
          doc.statusHistory.push({
            status: 'completed',
            timestamp: doc.approvedAt || nowIso,
            actor: doc.approvedBy || 'System Migration',
            note: 'One-time migration: Transitioned legacy "approved" status to "completed" in full administrative lifecycle.'
          });
          doc.migratedFromApprovedAt = nowIso;
          modified = true;
          console.log(`[LIFECYCLE-MIGRATION] Migrated evaluation ID: ${doc._id} (${doc.companyName || 'Unknown'}) to "completed".`);
        }
      });
      if (modified) {
        fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.error('[LIFECYCLE-MIGRATION-ERROR]', err);
  }
}

export async function ensureDatabaseIndexes(db) {
  if (indexesEnsured || !db) return;
  try {
    const col = db.collection(COLLECTION_NAME);
    const usersCol = db.collection(COLLECTION_USERS);
    const vendorsCol = db.collection(COLLECTION_VENDORS);
    const versionsCol = db.collection(COLLECTION_VERSIONS);
    const riskCol = db.collection(COLLECTION_RISK);
    await Promise.allSettled([
      col.createIndex({ status: 1 }, { background: true }),
      col.createIndex({ assessorId: 1 }, { background: true }),
      col.createIndex({ assignedAssessorId: 1, status: 1 }, { background: true }),
      col.createIndex({ assignedAssessor: 1, status: 1 }, { background: true }),
      col.createIndex({ createdAt: -1 }, { background: true }),
      col.createIndex({ statusChangedAt: -1 }, { background: true }),
      col.createIndex({ companyName: 1, deviceModel: 1, assessorName: 1, assessmentDate: 1 }, { background: true }),
      col.createIndex({ deletedAt: 1, status: 1, createdAt: -1 }, { background: true }),
      usersCol.createIndex({ email: 1 }, { unique: true, background: true }),
      usersCol.createIndex({ role: 1 }, { background: true }),
      vendorsCol.createIndex({ contactEmail: 1 }, { unique: true, background: true }),
      versionsCol.createIndex({ evaluationId: 1, versionNumber: -1 }, { unique: true, background: true }),
      versionsCol.createIndex({ evaluationId: 1, createdAt: -1 }, { background: true }),
      riskCol.createIndex({ evaluationId: 1, versionNumber: -1 }, { background: true }),
      riskCol.createIndex({ riskLevel: 1 }, { background: true }),
      riskCol.createIndex({ generatedAt: -1 }, { background: true }),
      riskCol.createIndex({ assessorId: 1 }, { background: true })
    ]);
    indexesEnsured = true;
  } catch (err) {
    console.warn('[DB-INDEX] Non-blocking index creation note:', err.message);
  }
}

export async function connectToDatabase() {
  let uri = process.env.MONGODB_URI;
  if (!isProductionEnvironment && (!uri || uri.includes('<') || uri.includes('>'))) {
    try {
      const envPath = fs.existsSync(path.join(process.cwd(), '.env'))
        ? path.join(process.cwd(), '.env')
        : path.join(process.cwd(), '.env.example');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^MONGODB_URI[ \t]*=[ \t]*([^\r\n]*)/m);
        if (match && match[1]) {
          const candidate = match[1].trim().replace(/^['"]|['"]$/g, '');
          if (candidate && !candidate.includes('<') && !candidate.includes('>')) {
            uri = candidate;
            process.env.MONGODB_URI = candidate;
          }
        }
      }
    } catch {}
  }

  if (uri) {
    uri = uri.trim().split(/\s+/)[0];
  }

  const isRealAtlasUri = uri &&
    uri.trim().length > 0 &&
    !uri.includes('<') &&
    !uri.includes('>') &&
    !uri.includes('username:password');

  if (isRealAtlasUri) {
    if (cachedClient && cachedDb) {
      return { client: cachedClient, db: cachedDb, isMongoAtlas: true };
    }

    const now = Date.now();
    // Circuit breaker: If Atlas failed recently, bypass the 2.5s connection wait
    // and immediately serve via local fallback store with zero latency
    if (now - lastAtlasAttemptTime < ATLAS_RETRY_COOLDOWN_MS) {
      const fallback = createFallbackStoreInterface(true);
      return fallback;
    }

    lastAtlasAttemptTime = now;

    try {
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 3000,
        tls: true
      });
      await client.connect();
      const db = client.db(DB_NAME);
      cachedClient = client;
      cachedDb = db;
      ensureDatabaseIndexes(db).catch(() => {});
      lastAtlasErrorMessage = null;
      isIpWhitelistBlocked = false;
      console.log('Successfully established connection to MongoDB Atlas cluster.');
      return { client, db, isMongoAtlas: true };
    } catch (err) {
      lastAtlasErrorMessage = err.message || String(err);
      const isSslAlert = lastAtlasErrorMessage.includes('SSL alert number 80') ||
                         lastAtlasErrorMessage.includes('tlsv1 alert internal error') ||
                         err.cause?.message?.includes('SSL alert number 80');

      if (isSslAlert) {
        isIpWhitelistBlocked = true;
        if (!hasLoggedNotice) {
          hasLoggedNotice = true;
          console.info(
            '[MongoDB Atlas Notice] Atlas connection rejected during TLS handshake (SSL alert 80). ' +
            'This occurs when the current cloud IP address is not on the Atlas IP Access List. ' +
            'To resolve: In cloud.mongodb.com -> Network Access -> Add IP Address: 0.0.0.0/0 (Allow Access from Anywhere). ' +
            'TrackScore is operating normally using persistent local storage.'
          );
        }
      } else if (!hasLoggedNotice) {
        hasLoggedNotice = true;
        console.warn('MongoDB Atlas connection failed, falling back to local store:', err.message);
      }
    }
  }

  const fallback = createFallbackStoreInterface(!!uri);
  return fallback;
}

export async function closeDatabaseConnection() {
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch {
      // ignore
    }
    cachedClient = null;
    cachedDb = null;
  }
}

function createFallbackStoreInterface(hasAtlasUri = false) {
  if (isProductionEnvironment) throw new DatabaseUnavailableError('Database is unavailable. Local fallback is disabled in production.');
  ensureFallbackStore();
  return {
    isMongoAtlas: false,
    atlasDiagnostic: {
      configured: hasAtlasUri,
      isIpBlocked: isIpWhitelistBlocked,
      lastError: isIpWhitelistBlocked
        ? 'MongoDB Atlas rejected connection (SSL Alert 80: IP Access List). Whitelist 0.0.0.0/0 in Atlas Network Access to connect.'
        : lastAtlasErrorMessage
    },
    async insertEvaluation(doc) {
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      const newDoc = {
        _id: 'eval_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        ...doc,
        createdAt: doc.createdAt || new Date().toISOString()
      };
      data.unshift(newDoc);
      fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
      return { insertedId: newDoc._id };
    },
    async getEvaluationById(id) {
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      return data.find(d => String(d._id) === String(id)) || null;
    },
    async getEvaluations(includeDeleted = false) {
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      const records = includeDeleted ? data : data.filter(d => !d.deletedAt);
      return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    async updateEvaluation(id, updateDoc, historyEntry = null, statusHistoryEntry = null) {
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      const idx = data.findIndex(d => String(d._id) === String(id));
      if (idx === -1) {
        return { matchedCount: 0, modifiedCount: 0 };
      }

      const history = Array.isArray(data[idx].evaluationHistory)
        ? [...data[idx].evaluationHistory]
        : [];

      if (historyEntry) {
        history.push(historyEntry);
      }

      const statusHist = Array.isArray(data[idx].statusHistory)
        ? [...data[idx].statusHistory]
        : [];

      if (statusHistoryEntry) {
        statusHist.push(statusHistoryEntry);
      } else if (updateDoc.status && updateDoc.status !== data[idx].status) {
        statusHist.push({
          status: updateDoc.status,
          changedAt: new Date().toISOString(),
          changedBy: updateDoc.approvedBy || updateDoc.rejectedBy || 'System'
        });
      }

      data[idx] = {
        ...data[idx],
        ...updateDoc,
        evaluationHistory: history,
        statusHistory: statusHist,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
      return { matchedCount: 1, modifiedCount: 1, updatedDoc: data[idx] };
    },
    async deleteEvaluation(id, deletedBy = 'Manager') {
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      const idx = data.findIndex(d => String(d._id) === String(id));
      if (idx === -1) {
        return { deletedCount: 0, modifiedCount: 0 };
      }
      // Soft-delete: mark deletedAt and deletedBy for full audit trail
      const nowIso = new Date().toISOString();
      data[idx].deletedAt = nowIso;
      data[idx].deletedBy = deletedBy;
      if (!Array.isArray(data[idx].evaluationHistory)) {
        data[idx].evaluationHistory = [];
      }
      data[idx].evaluationHistory.push({
        action: 'soft_deleted',
        timestamp: nowIso,
        deletedBy,
        note: 'Evaluation record archived / soft-deleted for compliance'
      });
      fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
      return { deletedCount: 1, modifiedCount: 1, updatedDoc: data[idx] };
    },
    async findDuplicate(companyName, deviceModel, assessorName, assessmentDate, excludeId = null) {
      ensureFallbackStore();
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      const comp = String(companyName || '').trim().toLowerCase();
      const model = String(deviceModel || '').trim().toLowerCase();
      const assessor = String(assessorName || '').trim().toLowerCase();
      const date = String(assessmentDate || '').trim().substring(0, 10);

      return data.find(d => {
        if (d.deletedAt) return false;
        if (excludeId && String(d._id) === String(excludeId)) return false;
        const dComp = String(d.companyName || '').trim().toLowerCase();
        const dModel = String(d.deviceModel || '').trim().toLowerCase();
        const dAssessor = String(d.assessorName || '').trim().toLowerCase();
        const dDate = String(d.assessmentDate || d.createdAt || '').trim().substring(0, 10);
        return dComp === comp && dModel === model && dAssessor === assessor && dDate === date;
      });
    },

    // User Operations
    async getUserByEmail(email) {
      ensureFallbackStore();
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      const clean = String(email || '').trim().toLowerCase();
      return users.find(u => String(u.email || '').trim().toLowerCase() === clean) || null;
    },
    async getUserById(id) {
      ensureFallbackStore();
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      return users.find(u => String(u._id) === String(id)) || null;
    },
    async createUser(userDoc) {
      ensureFallbackStore();
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      const newUser = {
        _id: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        ...userDoc,
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
      return newUser;
    },
    async getUsers() {
      ensureFallbackStore();
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      return users.map(({ passwordHash, ...safe }) => safe);
    },
    async deleteUser(id) {
      ensureFallbackStore();
      let users = [];
      if (fs.existsSync(USERS_FILE)) {
        try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { users = []; }
      }
      const filtered = users.filter(u => String(u._id) !== String(id) && String(u.id || '') !== String(id));
      if (filtered.length !== users.length) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
        return true;
      }
      return false;
    },

    // Vendor Operations
    async getVendorByEmail(email) {
      ensureFallbackStore();
      const vendors = JSON.parse(fs.readFileSync(VENDORS_FILE, 'utf-8'));
      const clean = String(email || '').trim().toLowerCase();
      return vendors.find(v =>
        String(v.loginEmail || '').trim().toLowerCase() === clean ||
        String(v.contactEmail || '').trim().toLowerCase() === clean
      ) || null;
    },
    async getVendorById(id) {
      ensureFallbackStore();
      const vendors = JSON.parse(fs.readFileSync(VENDORS_FILE, 'utf-8'));
      return vendors.find(v => String(v._id) === String(id)) || null;
    },
    async createVendor(vendorDoc) {
      ensureFallbackStore();
      const vendors = JSON.parse(fs.readFileSync(VENDORS_FILE, 'utf-8'));
      const newVendor = {
        _id: 'vendor_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        ...vendorDoc,
        createdAt: new Date().toISOString()
      };
      vendors.push(newVendor);
      fs.writeFileSync(VENDORS_FILE, JSON.stringify(vendors, null, 2), 'utf-8');
      return newVendor;
    },
    async updateVendor(id, updateDoc) {
      ensureFallbackStore();
      const vendors = JSON.parse(fs.readFileSync(VENDORS_FILE, 'utf-8'));
      const idx = vendors.findIndex(v => String(v._id) === String(id));
      if (idx === -1) return null;
      vendors[idx] = {
        ...vendors[idx],
        ...updateDoc,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(VENDORS_FILE, JSON.stringify(vendors, null, 2), 'utf-8');
      return vendors[idx];
    },
    async getVendors() {
      ensureFallbackStore();
      const vendors = JSON.parse(fs.readFileSync(VENDORS_FILE, 'utf-8'));
      return vendors.map(({ passwordHash, ...safe }) => safe);
    },
    async insertAssessmentVersion(doc) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(VERSIONS_FILE)) {
        try { list = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf-8')); } catch { list = []; }
      }
      const isDuplicate = list.some(v => 
        String(v.evaluationId) === String(doc.evaluationId) && 
        Number(v.versionNumber) === Number(doc.versionNumber)
      );
      if (isDuplicate) {
        const err = new Error(`E11000 duplicate key error: assessment version ${doc.versionNumber} for evaluation ${doc.evaluationId} already exists.`);
        err.code = 11000;
        throw err;
      }
      const newDoc = {
        _id: 'ver_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        ...doc,
        createdAt: doc.createdAt || new Date().toISOString()
      };
      list.unshift(newDoc);
      fs.writeFileSync(VERSIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
      return { insertedId: newDoc._id, ...newDoc };
    },
    async getAssessmentVersions(evaluationId) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(VERSIONS_FILE)) {
        try { list = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf-8')); } catch { list = []; }
      }
      return list
        .filter(v => String(v.evaluationId) === String(evaluationId))
        .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    },
    async getAssessmentVersion(evaluationId, versionNumber) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(VERSIONS_FILE)) {
        try { list = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf-8')); } catch { list = []; }
      }
      return list.find(v => String(v.evaluationId) === String(evaluationId) && Number(v.versionNumber) === Number(versionNumber)) || null;
    },
    async insertAssessmentRisk(doc) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(RISK_FILE)) {
        try { list = JSON.parse(fs.readFileSync(RISK_FILE, 'utf-8')); } catch { list = []; }
      }
      const newDoc = {
        _id: 'risk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        ...doc,
        generatedAt: doc.generatedAt || new Date().toISOString()
      };
      const existingIdx = list.findIndex(r => 
        String(r.evaluationId) === String(doc.evaluationId) && 
        Number(r.versionNumber) === Number(doc.versionNumber)
      );
      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...newDoc };
      } else {
        list.unshift(newDoc);
      }
      fs.writeFileSync(RISK_FILE, JSON.stringify(list, null, 2), 'utf-8');
      return { insertedId: newDoc._id, ...newDoc };
    },
    async getAssessmentRisk(evaluationId, versionNumber) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(RISK_FILE)) {
        try { list = JSON.parse(fs.readFileSync(RISK_FILE, 'utf-8')); } catch { list = []; }
      }
      if (versionNumber !== undefined && versionNumber !== null) {
        return list.find(r => String(r.evaluationId) === String(evaluationId) && Number(r.versionNumber) === Number(versionNumber)) || null;
      }
      const forEval = list
        .filter(r => String(r.evaluationId) === String(evaluationId))
        .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0) || new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
      return forEval[0] || null;
    },
    async getAssessmentRisks(evaluationId) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(RISK_FILE)) {
        try { list = JSON.parse(fs.readFileSync(RISK_FILE, 'utf-8')); } catch { list = []; }
      }
      return list
        .filter(r => String(r.evaluationId) === String(evaluationId))
        .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    },
    async getAllAssessmentRisks(filter = {}) {
      ensureFallbackStore();
      let list = [];
      if (fs.existsSync(RISK_FILE)) {
        try { list = JSON.parse(fs.readFileSync(RISK_FILE, 'utf-8')); } catch { list = []; }
      }
      if (filter.riskLevel) {
        list = list.filter(r => r.riskLevel === filter.riskLevel);
      }
      return list;
    }
  };
}

// Universal abstraction helpers for User & Vendor entities
export async function findUserByEmailOrIdentifier(connection, identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  const cleanEmail = raw.toLowerCase();
  const strippedId = raw.replace(/[\s\-_]/g, '').toLowerCase();

  if (connection.isMongoAtlas) {
    const col = connection.db.collection(COLLECTION_USERS);
    // 1. Direct email match (case-insensitive with regex fallback)
    const escapedEmail = cleanEmail.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    let user = await col.findOne({
      $or: [
        { email: cleanEmail },
        { email: { $regex: new RegExp(`^\\s*${escapedEmail}\\s*$`, 'i') } }
      ]
    });
    if (user) return user;

    // 2. Direct assessor ID match (case-insensitive regex)
    const escaped = raw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    user = await col.findOne({
      assessorId: { $regex: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }
    });
    if (user) return user;

    // 3. Stripped assessor ID comparison across users
    const allUsers = await col.find({}).toArray();
    user = allUsers.find(u => {
      const uEmail = String(u.email || '').trim().toLowerCase();
      if (uEmail === cleanEmail) return true;
      const uId = String(u.assessorId || '').replace(/[\s\-_]/g, '').toLowerCase();
      return uId && (uId === strippedId || uId.includes(strippedId) || strippedId.includes(uId));
    });
    if (user) return user;

    return null;
  }

  // Fallback store
  const allUsers = await connection.getUsers();
  let user = allUsers.find(u => String(u.email || '').trim().toLowerCase() === cleanEmail);
  if (user) {
    return connection.getUserByEmail(cleanEmail);
  }
  user = allUsers.find(u => {
    const uId = String(u.assessorId || '').trim();
    if (!uId) return false;
    if (uId.toLowerCase() === cleanEmail) return true;
    const sId = uId.replace(/[\s\-_]/g, '').toLowerCase();
    return sId === strippedId || sId.includes(strippedId) || strippedId.includes(sId);
  });
  if (user) {
    return connection.getUserById(user._id);
  }
  return null;
}

export async function findUserById(connection, id) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_USERS).findOne(buildMongoIdFilter(id));
  }
  return connection.getUserById(id);
}

export async function updateUserRecord(connection, id, updates) {
  if (connection.isMongoAtlas) {
    await connection.db.collection(COLLECTION_USERS).updateOne(
      buildMongoIdFilter(id),
      { $set: { ...updates, updatedAt: new Date().toISOString() } }
    );
    return findUserById(connection, id);
  }

  ensureFallbackStore();
  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { users = []; }
  }
  const idx = users.findIndex(u => String(u._id) === String(id));
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    return users[idx];
  }
  return null;
}

export async function deleteUserRecord(connection, id) {
  if (connection.isMongoAtlas && connection.db) {
    const res = await connection.db.collection(COLLECTION_USERS).deleteOne(buildMongoIdFilter(id));
    return res.deletedCount > 0;
  }

  if (typeof connection.deleteUser === 'function') {
    return connection.deleteUser(id);
  }

  ensureFallbackStore();
  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { users = []; }
  }
  const filtered = users.filter(u => String(u._id) !== String(id) && String(u.id || '') !== String(id));
  if (filtered.length !== users.length) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    return true;
  }
  return false;
}

export async function findUserByEmail(connection, email) {
  return findUserByEmailOrIdentifier(connection, email);
}

export async function findVendorByEmail(connection, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VENDORS).findOne({
      $or: [{ loginEmail: cleanEmail }, { contactEmail: cleanEmail }]
    });
  }
  return connection.getVendorByEmail(cleanEmail);
}

export async function findVendorByLoginEmail(connection, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VENDORS).findOne({ loginEmail: cleanEmail });
  }
  const vendors = await connection.getVendors();
  return vendors.find(v => String(v.loginEmail || '').trim().toLowerCase() === cleanEmail) || null;
}

export async function findVendorById(connection, id) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VENDORS).findOne(buildMongoIdFilter(id));
  }
  return connection.getVendorById(id);
}

export async function createVendorRecord(connection, vendorDoc) {
  if (connection.isMongoAtlas) {
    const res = await connection.db.collection(COLLECTION_VENDORS).insertOne({
      ...vendorDoc,
      createdAt: new Date().toISOString()
    });
    return { _id: res.insertedId, ...vendorDoc };
  }
  return connection.createVendor(vendorDoc);
}

export async function updateVendorRecord(connection, id, updates) {
  if (connection.isMongoAtlas) {
    await connection.db.collection(COLLECTION_VENDORS).updateOne(
      buildMongoIdFilter(id),
      { $set: { ...updates, updatedAt: new Date().toISOString() } }
    );
    return findVendorById(connection, id);
  }
  return connection.updateVendor(id, updates);
}

export async function listVendors(connection) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VENDORS).find({}, { projection: { passwordHash: 0 } }).toArray();
  }
  return connection.getVendors();
}

export async function listUsers(connection) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_USERS).find({}, { projection: { passwordHash: 0 } }).toArray();
  }
  return connection.getUsers();
}

export async function createInquiryRecord(connection, inquiryDoc) {
  const docToInsert = {
    ...inquiryDoc,
    recordType: 'inquiry',
    status: inquiryDoc.status || 'inquiry',
    createdAt: inquiryDoc.createdAt || new Date().toISOString(),
    statusHistory: inquiryDoc.statusHistory || [
      {
        status: 'inquiry',
        changedAt: new Date().toISOString(),
        changedBy: 'Public Web Intake',
        notes: 'Inquiry received via public assessment request form'
      }
    ]
  };

  if (connection.isMongoAtlas) {
    const res = await connection.db.collection(COLLECTION_INQUIRIES).insertOne(docToInsert);
    return { _id: res.insertedId, ...docToInsert };
  }

  ensureFallbackStore();
  let list = [];
  if (fs.existsSync(INQUIRIES_FILE)) {
    try { list = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8')); } catch { list = []; }
  }
  const fallbackId = 'inq_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const created = { _id: fallbackId, ...docToInsert };
  list.unshift(created);
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  return created;
}

export async function listInquiries(connection, filter = {}) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_INQUIRIES).find(filter).sort({ createdAt: -1 }).toArray();
  }

  ensureFallbackStore();
  let list = [];
  if (fs.existsSync(INQUIRIES_FILE)) {
    try { list = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8')); } catch { list = []; }
  }
  if (filter.status) {
    list = list.filter(item => item.status === filter.status);
  }
  return list;
}

export async function findInquiryById(connection, id) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_INQUIRIES).findOne(buildMongoIdFilter(id));
  }

  ensureFallbackStore();
  let list = [];
  if (fs.existsSync(INQUIRIES_FILE)) {
    try { list = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8')); } catch { list = []; }
  }
  return list.find(item => String(item._id) === String(id)) || null;
}

export async function updateInquiryRecord(connection, id, updates) {
  if (connection.isMongoAtlas) {
    await connection.db.collection(COLLECTION_INQUIRIES).updateOne(
      buildMongoIdFilter(id),
      { $set: { ...updates, updatedAt: new Date().toISOString() } }
    );
    return findInquiryById(connection, id);
  }

  ensureFallbackStore();
  let list = [];
  if (fs.existsSync(INQUIRIES_FILE)) {
    try { list = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8')); } catch { list = []; }
  }
  const idx = list.findIndex(item => String(item._id) === String(id));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2), 'utf-8');
    return list[idx];
  }
  return null;
}

export async function createAssessmentVersionRecord(connection, versionDoc) {
  const docToInsert = {
    ...versionDoc,
    evaluationId: String(versionDoc.evaluationId),
    versionNumber: Number(versionDoc.versionNumber),
    createdAt: versionDoc.createdAt || new Date().toISOString()
  };

  if (connection.isMongoAtlas) {
    const res = await connection.db.collection(COLLECTION_VERSIONS).insertOne(docToInsert);
    return { _id: res.insertedId, ...docToInsert };
  }

  return connection.insertAssessmentVersion(docToInsert);
}

export async function listAssessmentVersions(connection, evaluationId) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VERSIONS)
      .find({ evaluationId: String(evaluationId) })
      .sort({ versionNumber: -1 })
      .toArray();
  }

  return connection.getAssessmentVersions(evaluationId);
}

export async function findAssessmentVersion(connection, evaluationId, versionNumber) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VERSIONS).findOne({
      evaluationId: String(evaluationId),
      versionNumber: Number(versionNumber)
    });
  }

  return connection.getAssessmentVersion(evaluationId, versionNumber);
}

export async function getNextVersionNumber(connection, evaluationId) {
  if (connection.isMongoAtlas) {
    const latest = await connection.db.collection(COLLECTION_VERSIONS).findOne(
      { evaluationId: String(evaluationId) },
      { sort: { versionNumber: -1 }, projection: { versionNumber: 1 } }
    );
    return (latest?.versionNumber || 0) + 1;
  }

  const versions = await connection.getAssessmentVersions(evaluationId);
  return (versions[0]?.versionNumber || 0) + 1;
}

export async function saveAssessmentRiskRecord(connection, riskDoc) {
  const docToInsert = {
    ...riskDoc,
    evaluationId: String(riskDoc.evaluationId),
    versionNumber: Number(riskDoc.versionNumber || 1),
    generatedAt: riskDoc.generatedAt || new Date().toISOString()
  };

  if (connection.isMongoAtlas) {
    const col = connection.db.collection(COLLECTION_RISK);
    await col.updateOne(
      { evaluationId: docToInsert.evaluationId, versionNumber: docToInsert.versionNumber },
      { $set: docToInsert },
      { upsert: true }
    );
    return findAssessmentRisk(connection, docToInsert.evaluationId, docToInsert.versionNumber);
  }

  return connection.insertAssessmentRisk(docToInsert);
}

export async function findAssessmentRisk(connection, evaluationId, versionNumber) {
  if (connection.isMongoAtlas) {
    const query = { evaluationId: String(evaluationId) };
    if (versionNumber !== undefined && versionNumber !== null) {
      query.versionNumber = Number(versionNumber);
      return connection.db.collection(COLLECTION_RISK).findOne(query);
    }
    const docs = await connection.db.collection(COLLECTION_RISK)
      .find(query)
      .sort({ versionNumber: -1, generatedAt: -1 })
      .limit(1)
      .toArray();
    return docs[0] || null;
  }

  return connection.getAssessmentRisk(evaluationId, versionNumber);
}

export async function listAssessmentRisks(connection, evaluationId) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_RISK)
      .find({ evaluationId: String(evaluationId) })
      .sort({ versionNumber: -1 })
      .toArray();
  }

  return connection.getAssessmentRisks(evaluationId);
}

export async function listAllAssessmentRisks(connection, filter = {}) {
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_RISK)
      .find(filter)
      .sort({ generatedAt: -1 })
      .toArray();
  }

  return connection.getAllAssessmentRisks(filter);
}

export default {
  connectToDatabase,
  buildMongoIdFilter,
  findUserByEmail,
  findUserById,
  updateUserRecord,
  deleteUserRecord,
  findVendorByEmail,
  findVendorByLoginEmail,
  findVendorById,
  createVendorRecord,
  updateVendorRecord,
  listVendors,
  listUsers,
  createInquiryRecord,
  listInquiries,
  findInquiryById,
  updateInquiryRecord,
  createAssessmentVersionRecord,
  listAssessmentVersions,
  findAssessmentVersion,
  getNextVersionNumber,
  saveAssessmentRiskRecord,
  findAssessmentRisk,
  listAssessmentRisks,
  listAllAssessmentRisks,
  DB_NAME,
  COLLECTION_NAME,
  COLLECTION_USERS,
  COLLECTION_VENDORS,
  COLLECTION_INQUIRIES,
  COLLECTION_VERSIONS,
  COLLECTION_RISK
};
