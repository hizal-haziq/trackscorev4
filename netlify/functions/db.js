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

const FALLBACK_DIR = path.join(process.cwd(), '.data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'evaluations.json');
const USERS_FILE = path.join(FALLBACK_DIR, 'users.json');
const VENDORS_FILE = path.join(FALLBACK_DIR, 'vendors.json');
const INQUIRIES_FILE = path.join(FALLBACK_DIR, 'inquiries.json');

let fallbackStoreEnsured = false;

// Ensure fallback store & seed initial accounts if empty
function ensureFallbackStore() {
  if (fallbackStoreEnsured && fs.existsSync(FALLBACK_FILE) && fs.existsSync(USERS_FILE) && fs.existsSync(VENDORS_FILE)) {
    return;
  }
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }

  // 1. Evaluations Store
  if (!fs.existsSync(FALLBACK_FILE)) {
    // Seed with sample realistic evaluations for immediate review
    const sampleData = [
      {
        _id: 'seed-eval-001',
        rubricVersion: '1.0',
        companyName: 'Apex Telematics Sdn Bhd',
        deviceModel: 'FleetGuard Pro 400',
        packageName: 'Enterprise Fleet Tracker',
        package: 'package_2',
        assessorName: 'Ts. Mohd Farhan (AS-8812)',
        assessorId: 'AS-8812',
        assessmentDate: '2026-09-06',
        sectionAScore: 30.5,
        sectionBScore: 8.75,
        totalScore: 39.25,
        starRating: 4.56,
        starsCount: 5,
        ratingLabel: '5 Stars - Outstanding (MIROS Grade A)',
        breakdown: [
          { section: 'A', id: 'trip_history', name: 'Trip History Data', selectedOption: '>1 year', points: 1.5 },
          { section: 'A', id: 'realtime_tracking', name: 'Real-time Tracking', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'map_source', name: 'Map Source', selectedOption: 'Open updated', points: 1.5 },
          { section: 'A', id: 'geofence', name: 'Geofence', selectedOption: 'Polygon', points: 1.25 },
          { section: 'A', id: 'geofence_alert', name: 'Geofence Alert', selectedOption: 'Push', points: 1.5 },
          { section: 'A', id: 'vehicle_status', name: 'Vehicle Status', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'engine_status', name: 'Engine ON/OFF', selectedOption: 'Report', points: 1.25 },
          { section: 'A', id: 'overspeed_detection', name: 'Overspeed Detection', selectedOption: 'Configurable', points: 1.5 },
          { section: 'A', id: 'overspeed_alert', name: 'Overspeed Alert', selectedOption: 'Push', points: 1.5 },
          { section: 'A', id: 'offline_memory', name: 'Offline Memory', selectedOption: '>60m', points: 1.5 },
          { section: 'A', id: 'backup_battery', name: 'Backup Battery', selectedOption: '>24h', points: 1.5 },
          { section: 'A', id: 'sim_network', name: 'SIM Network', selectedOption: 'Roaming', points: 1.5 },
          { section: 'A', id: 'connectivity', name: 'Connectivity', selectedOption: '4G', points: 1.0 },
          { section: 'A', id: 'multilingual', name: 'Multilingual', selectedOption: 'Other', points: 1.25 },
          { section: 'A', id: 'user_manual', name: 'User Manual', selectedOption: 'Other', points: 1.25 },
          { section: 'A', id: 'warranty', name: 'Warranty', selectedOption: '>12m', points: 1.25 },
          { section: 'A', id: 'customer_service', name: 'Customer Service', selectedOption: 'Control Centre', points: 1.5 },
          { section: 'A', id: 'os_compatibility', name: 'OS Compatibility', selectedOption: 'Mobile', points: 1.5 },
          { section: 'A', id: 'trip_report', name: 'Trip Report', selectedOption: 'Duration', points: 1.25 },
          { section: 'A', id: 'data_interval', name: 'Data Interval', selectedOption: '<30s', points: 1.5 },
          { section: 'A', id: 'harsh_accel', name: 'Harsh Acceleration', selectedOption: 'Config', points: 1.5 },
          { section: 'A', id: 'harsh_accel_alert', name: 'Harsh Accel Alert', selectedOption: 'Push', points: 1.5 },
          { section: 'A', id: 'harsh_braking', name: 'Harsh Braking', selectedOption: 'Config', points: 1.5 },
          { section: 'A', id: 'harsh_braking_alert', name: 'Harsh Braking Alert', selectedOption: 'Push', points: 1.5 },
          { section: 'B', id: 'tow_detection', name: 'Tow Detection', selectedOption: 'Available', points: 1.0 },
          { section: 'B', id: 'panic_button', name: 'Panic Button', selectedOption: 'SMS', points: 1.25 },
          { section: 'B', id: 'mfa', name: 'MFA', selectedOption: 'OTP', points: 1.0 },
          { section: 'B', id: 'sop_tech_problems', name: 'SOP Tech Problems', selectedOption: '3 days', points: 1.0 },
          { section: 'B', id: 'service_records', name: 'Service Records', selectedOption: 'Available', points: 1.0 },
          { section: 'B', id: 'driver_id', name: 'Driver ID', selectedOption: 'Report', points: 1.25 },
          { section: 'B', id: 'certification', name: 'Certification', selectedOption: 'SIRIM/CE', points: 1.0 },
          { section: 'B', id: 'immobilizer', name: 'Immobilizer', selectedOption: 'Available', points: 1.0 },
          { section: 'B', id: 'tampered_alert', name: 'Tamper Detection & Power Disconnect Alert', selectedOption: 'SMS', points: 1.25 }
        ],
        status: 'completed',
        approvedBy: 'Lead Manager',
        approvedAt: '2026-09-06T06:00:00.000Z',
        statusChangedAt: '2026-09-06T06:00:00.000Z',
        packageDetails: {
          packageId: 'package_2',
          price: 6000,
          validityYears: 3,
          freeReassessments: 2
        },
        invoice: {
          invoiceNumber: 'INV-2026-0041',
          amount: 6000,
          issuedDate: '2026-09-05T08:00:00.000Z',
          dueDate: '2026-09-20'
        },
        payment: {
          status: 'paid',
          amountReceived: 6000,
          paymentDate: '2026-09-06T04:30:00.000Z',
          paymentMethod: 'Bank Transfer / DuitNow',
          verifiedBy: 'Finance & Compliance Team'
        },
        certificate: {
          certificateNumber: 'TS-CERT-2026-0041',
          preparedDate: '2026-09-06T05:00:00.000Z',
          printedDate: '2026-09-06T05:15:00.000Z',
          signedBy: 'Director General Office (DGO)',
          signedDate: '2026-09-06T05:30:00.000Z',
          sentToCustomerDate: '2026-09-06T06:00:00.000Z'
        },
        statusHistory: [
          { status: 'registered', timestamp: '2026-09-01T09:00:00.000Z', actor: 'Operations Manager', note: 'Customer registered for Package 2.' },
          { status: 'scheduled', timestamp: '2026-09-02T10:00:00.000Z', actor: 'Operations Manager', note: 'Assessment session scheduled for 2026-09-06.' },
          { status: 'submitted', timestamp: '2026-09-06T04:00:00.000Z', actor: 'Ts. Mohd Farhan (AS-8812)', note: 'Evaluation submitted for manager review.' },
          { status: 'pending_review', timestamp: '2026-09-06T04:10:00.000Z', actor: 'Operations Manager', note: 'Score audited and confirmed at 39.25 pts (5 Stars).' },
          { status: 'pre_final_sent', timestamp: '2026-09-06T04:15:00.000Z', actor: 'Operations Manager', note: 'Preliminary result dispatched to Apex Telematics.' },
          { status: 'payment_confirmed', timestamp: '2026-09-06T04:30:00.000Z', actor: 'Lead Manager', note: 'Full RM 6,000 payment received and verified.' },
          { status: 'certificate_issued', timestamp: '2026-09-06T05:30:00.000Z', actor: 'Lead Manager', note: 'Certificate TS-CERT-2026-0041 endorsed by DGO.' },
          { status: 'completed', timestamp: '2026-09-06T06:00:00.000Z', actor: 'Lead Manager', note: 'Final certificate package delivered to vendor.' }
        ],
        evaluationHistory: [
          {
            action: 'approved',
            timestamp: '2026-09-06T06:00:00.000Z',
            changedBy: 'Lead Manager',
            note: 'Evaluation approved and certified.'
          }
        ],
        createdAt: '2026-09-06T04:56:17.982Z'
      },
      {
        _id: 'seed-eval-002',
        rubricVersion: '1.0',
        companyName: 'OmniTrack Mobility Solutions',
        deviceModel: 'OT-Lite 200 GPS',
        packageName: 'Basic Commercial Standard',
        package: 'package_1',
        assessorName: 'Engr. Sarah Wong (AS-7741)',
        assessmentDate: '2026-09-03',
        sectionAScore: 24.25,
        sectionBScore: 5.25,
        totalScore: 29.5,
        starRating: 3.43,
        starsCount: 3,
        ratingLabel: '3 Stars - Satisfactory (MIROS Grade C)',
        breakdown: [
          { section: 'A', id: 'trip_history', name: 'Trip History Data', selectedOption: '>3m-1y', points: 1.25 },
          { section: 'A', id: 'realtime_tracking', name: 'Real-time Tracking', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'map_source', name: 'Map Source', selectedOption: 'Open', points: 1.25 },
          { section: 'A', id: 'geofence', name: 'Geofence', selectedOption: 'Radius', points: 1.0 },
          { section: 'A', id: 'geofence_alert', name: 'Geofence Alert', selectedOption: 'System', points: 1.0 },
          { section: 'A', id: 'vehicle_status', name: 'Vehicle Status', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'engine_status', name: 'Engine ON/OFF', selectedOption: 'System', points: 1.0 },
          { section: 'A', id: 'overspeed_detection', name: 'Overspeed Detection', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'overspeed_alert', name: 'Overspeed Alert', selectedOption: 'System', points: 1.0 },
          { section: 'A', id: 'offline_memory', name: 'Offline Memory', selectedOption: '15-60m', points: 1.25 },
          { section: 'A', id: 'backup_battery', name: 'Backup Battery', selectedOption: '1-24h', points: 1.25 },
          { section: 'A', id: 'sim_network', name: 'SIM Network', selectedOption: '4G fallback', points: 1.25 },
          { section: 'A', id: 'connectivity', name: 'Connectivity', selectedOption: '4G', points: 1.0 },
          { section: 'A', id: 'multilingual', name: 'Multilingual', selectedOption: 'English', points: 1.0 },
          { section: 'A', id: 'user_manual', name: 'User Manual', selectedOption: 'English', points: 1.0 },
          { section: 'A', id: 'warranty', name: 'Warranty', selectedOption: '12m', points: 1.0 },
          { section: 'A', id: 'customer_service', name: 'Customer Service', selectedOption: '09-19', points: 1.0 },
          { section: 'A', id: 'os_compatibility', name: 'OS Compatibility', selectedOption: 'Web', points: 1.0 },
          { section: 'A', id: 'trip_report', name: 'Trip Report', selectedOption: 'Coords', points: 1.0 },
          { section: 'A', id: 'data_interval', name: 'Data Interval', selectedOption: '1m', points: 1.0 },
          { section: 'A', id: 'harsh_accel', name: 'Harsh Acceleration', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'harsh_accel_alert', name: 'Harsh Accel Alert', selectedOption: 'System', points: 1.0 },
          { section: 'A', id: 'harsh_braking', name: 'Harsh Braking', selectedOption: 'Available', points: 1.0 },
          { section: 'A', id: 'harsh_braking_alert', name: 'Harsh Braking Alert', selectedOption: 'System', points: 1.0 },
          { section: 'B', id: 'tow_detection', name: 'Tow Detection', selectedOption: 'None (0)', points: 0.0 },
          { section: 'B', id: 'panic_button', name: 'Panic Button', selectedOption: 'Available', points: 1.0 },
          { section: 'B', id: 'mfa', name: 'MFA', selectedOption: 'OTP', points: 1.0 },
          { section: 'B', id: 'sop_tech_problems', name: 'SOP Tech Problems', selectedOption: '3 days', points: 1.0 },
          { section: 'B', id: 'service_records', name: 'Service Records', selectedOption: 'Available', points: 1.0 },
          { section: 'B', id: 'driver_id', name: 'Driver ID', selectedOption: 'None (0)', points: 0.0 },
          { section: 'B', id: 'certification', name: 'Certification', selectedOption: 'SIRIM/CE', points: 1.0 },
          { section: 'B', id: 'immobilizer', name: 'Immobilizer', selectedOption: 'None (0)', points: 0.0 },
          { section: 'B', id: 'tampered_alert', name: 'Tamper Detection & Power Disconnect Alert', selectedOption: 'None (0)', points: 0.0 }
        ],
        status: 'pending_review',
        statusChangedAt: '2026-09-03T04:56:17.982Z',
        statusHistory: [
          { status: 'submitted', timestamp: '2026-09-03T04:56:17.982Z', actor: 'Engr. Sarah Wong (AS-7741)', note: 'Initial evaluation submitted.' }
        ],
        evaluationHistory: [],
        createdAt: '2026-09-03T04:56:17.982Z'
      }
    ];
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(sampleData, null, 2), 'utf-8');
  }

  // 2. Users Store (Manager & Assessor Accounts)
  if (!fs.existsSync(USERS_FILE)) {
    const salt = bcrypt.genSaltSync(10);
    const initialUsers = [
      {
        _id: 'user_manager_001',
        email: 'manager@trackscore.my',
        passwordHash: bcrypt.hashSync('Manager2026!', salt),
        name: 'Lead Operations Manager',
        role: 'manager',
        createdAt: new Date().toISOString()
      },
      {
        _id: 'user_manager_002',
        email: 'admin@trackscore.my',
        passwordHash: bcrypt.hashSync('Manager@2026!', salt),
        name: 'System Admin Manager',
        role: 'manager',
        createdAt: new Date().toISOString()
      },
      {
        _id: 'user_assessor_001',
        email: 'farhan@trackscore.my',
        passwordHash: bcrypt.hashSync('Assessor2026!', salt),
        name: 'Ts. Mohd Farhan',
        role: 'assessor',
        assessorId: 'AS-8812',
        createdAt: new Date().toISOString()
      },
      {
        _id: 'user_assessor_002',
        email: 'assessor@trackscore.my',
        passwordHash: bcrypt.hashSync('Assessor@2026!', salt),
        name: 'Certified Assessor',
        role: 'assessor',
        assessorId: 'AS-9001',
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
  }

  // 3. Vendors Store (External Client Accounts)
  if (!fs.existsSync(VENDORS_FILE)) {
    const salt = bcrypt.genSaltSync(10);
    const initialVendors = [
      {
        _id: 'vendor_001',
        companyName: 'Apex Telematics Sdn Bhd',
        contactEmail: 'vendor@apex.com',
        contactPhone: '+603-8888 1234',
        passwordHash: bcrypt.hashSync('Vendor2026!', salt),
        linkedRegistrationIds: ['seed-eval-001'],
        isActive: true,
        createdAt: new Date().toISOString()
      },
      {
        _id: 'vendor_002',
        companyName: 'Fleetmatics Global Ltd',
        contactEmail: 'vendor@fleetmatics.com',
        contactPhone: '+603-7777 9999',
        passwordHash: bcrypt.hashSync('Vendor@2026!', salt),
        linkedRegistrationIds: [],
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(VENDORS_FILE, JSON.stringify(initialVendors, null, 2), 'utf-8');
  }

  fallbackStoreEnsured = true;
}

export async function seedAtlasUsersAndVendors(db) {
  if (!db) return;
  try {
    const generateBootstrapPassword = () => crypto.randomBytes(16).toString('base64url') + '!';
    const initialUsers = [
      {
        email: 'manager@trackscore.my',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        name: 'Lead Operations Manager',
        role: 'manager',
        assessorId: null,
        createdBy: 'System Bootstrap',
        createdAt: new Date().toISOString()
      },
      {
        email: 'admin@trackscore.my',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        name: 'Lead Operations Manager',
        role: 'manager',
        assessorId: null,
        createdBy: 'System Bootstrap',
        createdAt: new Date().toISOString()
      },
      {
        email: 'haziq.hizal9006@gmail.com',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        name: 'Haziq Hizal (Lead Manager)',
        role: 'manager',
        assessorId: 'MKA 9006',
        createdBy: 'System Bootstrap',
        createdAt: new Date().toISOString()
      },
      {
        email: 'assessor@trackscore.my',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        name: 'Ahmad Farhan',
        role: 'assessor',
        assessorId: 'MKA 9006',
        createdBy: 'System Bootstrap',
        createdAt: new Date().toISOString()
      },
      {
        email: 'farhan@trackscore.my',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        name: 'Ts. Mohd Farhan',
        role: 'assessor',
        assessorId: 'AS-8812',
        createdBy: 'System Bootstrap',
        createdAt: new Date().toISOString()
      }
    ];

    const initialVendors = [
      {
        companyName: 'Fleetmatics Global Ltd',
        contactEmail: 'vendor@fleetmatics.com',
        contactPhone: '+603-7777 9999',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        linkedRegistrationIds: [],
        isActive: true,
        createdAt: new Date().toISOString()
      },
      {
        companyName: 'Apex Telematics Sdn Bhd',
        contactEmail: 'vendor@apex.com',
        contactPhone: '+603-8888 1234',
        passwordHash: bcrypt.hashSync(generateBootstrapPassword(), 12),
        linkedRegistrationIds: ['seed-eval-001'],
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ];

    const usersCol = db.collection(COLLECTION_USERS);
    const vendorsCol = db.collection(COLLECTION_VENDORS);

    for (const u of initialUsers) {
      await usersCol.updateOne(
        { email: u.email },
        {
          $setOnInsert: {
            email: u.email,
            passwordHash: u.passwordHash,
            name: u.name,
            role: u.role,
            assessorId: u.assessorId,
            createdBy: u.createdBy,
            createdAt: u.createdAt
          }
        },
        { upsert: true }
      );
    }

    for (const v of initialVendors) {
      await vendorsCol.updateOne(
        { contactEmail: v.contactEmail },
        {
          $setOnInsert: {
            companyName: v.companyName,
            contactEmail: v.contactEmail,
            contactPhone: v.contactPhone,
            passwordHash: v.passwordHash,
            linkedRegistrationIds: v.linkedRegistrationIds,
            isActive: v.isActive,
            createdAt: v.createdAt
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn('[SEED-ATLAS-WARN]', err.message);
  }
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
      const approvedDocs = await col.find({ status: 'approved' }).toArray();
      if (approvedDocs.length > 0) {
        console.log(`[LIFECYCLE-MIGRATION] Found ${approvedDocs.length} legacy "approved" records. Starting migration to "completed"...`);
        for (const doc of approvedDocs) {
          const statusHistory = Array.isArray(doc.statusHistory) ? [...doc.statusHistory] : [];
          if (statusHistory.length === 0 && doc.createdAt) {
            statusHistory.push({
              status: 'submitted',
              timestamp: doc.createdAt,
              actor: doc.assessorName || 'Assessor',
              note: 'Initial evaluation submitted.'
            });
          }
          statusHistory.push({
            status: 'completed',
            timestamp: doc.approvedAt || nowIso,
            actor: doc.approvedBy || 'System Migration',
            note: 'One-time migration: Transitioned legacy "approved" status to "completed" in full administrative lifecycle.'
          });

          const certificate = doc.certificate || {
            certificateNumber: 'TS-CERT-' + (doc.assessmentDate ? doc.assessmentDate.replace(/-/g, '') : '2026') + '-' + Math.floor(1000 + Math.random() * 9000),
            preparedDate: doc.approvedAt || doc.createdAt,
            printedDate: doc.approvedAt || doc.createdAt,
            signedBy: 'Director General Office (DGO)',
            signedDate: doc.approvedAt || doc.createdAt,
            sentToCustomerDate: doc.approvedAt || doc.createdAt
          };

          await col.updateOne(
            { _id: doc._id },
            {
              $set: {
                status: 'completed',
                package: doc.package || 'package_1',
                certificate,
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
          if (doc.createdAt) {
            doc.statusHistory.push({
              status: 'submitted',
              timestamp: doc.createdAt,
              actor: doc.assessorName || 'Assessor',
              note: 'Initial evaluation submitted.'
            });
          }
        }
        if (doc.status === 'approved') {
          doc.status = 'completed';
          doc.package = doc.package || 'package_1';
          if (!doc.certificate) {
            doc.certificate = {
              certificateNumber: 'TS-CERT-' + (doc.assessmentDate ? doc.assessmentDate.replace(/-/g, '') : '2026') + '-' + Math.floor(1000 + Math.random() * 9000),
              preparedDate: doc.approvedAt || doc.createdAt,
              printedDate: doc.approvedAt || doc.createdAt,
              signedBy: 'Director General Office (DGO)',
              signedDate: doc.approvedAt || doc.createdAt,
              sentToCustomerDate: doc.approvedAt || doc.createdAt
            };
          }
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
    await Promise.allSettled([
      col.createIndex({ status: 1 }, { background: true }),
      col.createIndex({ assessorId: 1 }, { background: true }),
      col.createIndex({ createdAt: -1 }, { background: true }),
      col.createIndex({ statusChangedAt: -1 }, { background: true }),
      col.createIndex({ companyName: 1, deviceModel: 1, assessorName: 1, assessmentDate: 1 }, { background: true }),
      col.createIndex({ deletedAt: 1, status: 1, createdAt: -1 }, { background: true }),
      usersCol.createIndex({ email: 1 }, { unique: true, background: true }),
      vendorsCol.createIndex({ contactEmail: 1 }, { unique: true, background: true })
    ]);
    indexesEnsured = true;
  } catch (err) {
    console.warn('[DB-INDEX] Non-blocking index creation note:', err.message);
  }
}

export async function connectToDatabase() {
  let uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    try {
      const envPath = fs.existsSync(path.join(process.cwd(), '.env'))
        ? path.join(process.cwd(), '.env')
        : path.join(process.cwd(), '.env.example');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/MONGODB_URI\s*=\s*([^\r\n]+)/);
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
      seedAtlasUsersAndVendors(db).catch(() => {});
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

    // Vendor Operations
    async getVendorByEmail(email) {
      ensureFallbackStore();
      const vendors = JSON.parse(fs.readFileSync(VENDORS_FILE, 'utf-8'));
      const clean = String(email || '').trim().toLowerCase();
      return vendors.find(v => String(v.contactEmail || '').trim().toLowerCase() === clean) || null;
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
    // 1. Direct email match (case-insensitive)
    let user = await col.findOne({ email: cleanEmail });
    if (user) return user;

    // 2. Direct assessor ID match (case-insensitive regex)
    const escaped = raw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    user = await col.findOne({
      assessorId: { $regex: new RegExp(`^${escaped}$`, 'i') }
    });
    if (user) return user;

    // 3. Stripped assessor ID comparison across users
    const allUsers = await col.find({ assessorId: { $exists: true, $ne: null } }).toArray();
    user = allUsers.find(u => {
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

export async function findUserByEmail(connection, email) {
  return findUserByEmailOrIdentifier(connection, email);
}

export async function findVendorByEmail(connection, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (connection.isMongoAtlas) {
    return connection.db.collection(COLLECTION_VENDORS).findOne({ contactEmail: cleanEmail });
  }
  return connection.getVendorByEmail(cleanEmail);
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

export default {
  connectToDatabase,
  buildMongoIdFilter,
  findUserByEmail,
  findVendorByEmail,
  findVendorById,
  createVendorRecord,
  updateVendorRecord,
  listVendors,
  listUsers,
  createInquiryRecord,
  listInquiries,
  findInquiryById,
  updateInquiryRecord,
  DB_NAME,
  COLLECTION_NAME,
  COLLECTION_USERS,
  COLLECTION_VENDORS,
  COLLECTION_INQUIRIES
};
