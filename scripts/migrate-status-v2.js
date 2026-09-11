/**
 * scripts/migrate-status-v2.js
 *
 * One-time manual migration script for TrackScore evaluation lifecycle v2.
 * - Maps existing evaluations with status: "approved" -> "completed"
 * - Existing status: "pending_review" and "rejected" stay as-is
 * - Pushes an entry to statusHistory: { status: "completed", changedAt, changedBy }
 * - Logs every record changed (old status -> new status) to console
 * - Non-destructive: does NOT overwrite other fields, does NOT drop data
 * - Can be run manually: node scripts/migrate-status-v2.js
 * - NOT an auto-run endpoint; must be triggered intentionally
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

// Load environment variables from .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const DB_NAME = 'trackscore';
const COLLECTION_NAME = 'evaluations';
const FALLBACK_DIR = path.join(process.cwd(), '.data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'evaluations.json');

async function migrateMongoAtlas(uri) {
  console.log('[MIGRATION-V2] Connecting to MongoDB Atlas...');
  const client = new MongoClient(uri, { tls: true, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  console.log('[MIGRATION-V2] Connected to MongoDB Atlas cluster.');

  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  const allRecords = await collection.find({}).toArray();
  console.log(`[MIGRATION-V2] Found ${allRecords.length} total evaluation record(s) in collection.`);

  let migratedCount = 0;
  let untouchedCount = 0;
  let otherCount = 0;
  const nowIso = new Date().toISOString();

  for (const doc of allRecords) {
    const recordId = String(doc._id);
    const company = doc.companyName || 'Unknown Company';
    const model = doc.deviceModel || 'Unknown Device';
    const currentStatus = doc.status || 'pending_review';

    if (currentStatus === 'approved') {
      const existingHistory = Array.isArray(doc.statusHistory) ? [...doc.statusHistory] : [];
      const newHistoryEntry = {
        status: 'completed',
        changedAt: nowIso,
        changedBy: 'scripts/migrate-status-v2.js (Manual Migration)'
      };
      existingHistory.push(newHistoryEntry);

      let filter;
      try {
        filter = { _id: new ObjectId(recordId) };
      } catch {
        filter = { _id: recordId };
      }

      await collection.updateOne(filter, {
        $set: {
          status: 'completed',
          statusHistory: existingHistory,
          statusChangedAt: nowIso,
          updatedAt: nowIso
        }
      });

      console.log(`[MIGRATED] Record ID: ${recordId} | Company: "${company}" | Model: "${model}" | Status: "approved" -> "completed"`);
      migratedCount++;
    } else if (currentStatus === 'pending_review' || currentStatus === 'rejected') {
      console.log(`[UNTOUCHED] Record ID: ${recordId} | Company: "${company}" | Status: "${currentStatus}" preserved as-is`);
      untouchedCount++;
    } else {
      console.log(`[EXISTING] Record ID: ${recordId} | Company: "${company}" | Status: "${currentStatus}" preserved`);
      otherCount++;
    }
  }

  await client.close();
  return { total: allRecords.length, migrated: migratedCount, untouched: untouchedCount, other: otherCount };
}

function migrateLocalFallbackStore() {
  console.log(`[MIGRATION-V2] Processing persistent local store at: ${FALLBACK_FILE}`);
  if (!fs.existsSync(FALLBACK_FILE)) {
    console.log('[MIGRATION-V2] No local fallback store file found. Nothing to migrate.');
    return { total: 0, migrated: 0, untouched: 0, other: 0 };
  }

  const raw = fs.readFileSync(FALLBACK_FILE, 'utf-8');
  let records = [];
  try {
    records = JSON.parse(raw);
  } catch (err) {
    console.error('[MIGRATION-V2] Error parsing local evaluations JSON:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(records)) {
    console.warn('[MIGRATION-V2] Fallback file does not contain a JSON array.');
    return { total: 0, migrated: 0, untouched: 0, other: 0 };
  }

  console.log(`[MIGRATION-V2] Found ${records.length} evaluation record(s) in local store.`);

  let migratedCount = 0;
  let untouchedCount = 0;
  let otherCount = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < records.length; i++) {
    const doc = records[i];
    const recordId = String(doc._id || `idx_${i}`);
    const company = doc.companyName || 'Unknown Company';
    const model = doc.deviceModel || 'Unknown Device';
    const currentStatus = doc.status || 'pending_review';

    if (currentStatus === 'approved') {
      if (!Array.isArray(doc.statusHistory)) {
        doc.statusHistory = [];
      }
      doc.statusHistory.push({
        status: 'completed',
        changedAt: nowIso,
        changedBy: 'scripts/migrate-status-v2.js (Manual Migration)'
      });
      doc.status = 'completed';
      doc.statusChangedAt = nowIso;
      doc.updatedAt = nowIso;

      console.log(`[MIGRATED] Record ID: ${recordId} | Company: "${company}" | Model: "${model}" | Status: "approved" -> "completed"`);
      migratedCount++;
    } else if (currentStatus === 'pending_review' || currentStatus === 'rejected') {
      console.log(`[UNTOUCHED] Record ID: ${recordId} | Company: "${company}" | Status: "${currentStatus}" preserved as-is`);
      untouchedCount++;
    } else {
      console.log(`[EXISTING] Record ID: ${recordId} | Company: "${company}" | Status: "${currentStatus}" preserved`);
      otherCount++;
    }
  }

  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(records, null, 2), 'utf-8');
  return { total: records.length, migrated: migratedCount, untouched: untouchedCount, other: otherCount };
}

async function main() {
  console.log('=====================================================');
  console.log(' TrackScore Manual Status Migration (v2 Lifecycle)');
  console.log(' Maps: "approved" -> "completed"');
  console.log(' Leaves: "pending_review" & "rejected" as-is');
  console.log(' Pushes: { status, changedAt, changedBy } to statusHistory');
  console.log('=====================================================\n');

  const uri = process.env.MONGODB_URI;
  let summary = null;

  if (uri && uri.trim().length > 0) {
    try {
      summary = await migrateMongoAtlas(uri);
    } catch (err) {
      console.warn(`[MIGRATION-V2] MongoDB Atlas connection failed (${err.message}). Falling back to local store.`);
      summary = migrateLocalFallbackStore();
    }
  } else {
    console.log('[MIGRATION-V2] No MONGODB_URI set; using local fallback store.');
    summary = migrateLocalFallbackStore();
  }

  console.log('\n=====================================================');
  console.log(' Migration Summary:');
  console.log(` Total evaluations examined   : ${summary.total}`);
  console.log(` Migrated ("approved" -> "completed") : ${summary.migrated}`);
  console.log(` Untouched ("pending_review" / "rejected") : ${summary.untouched}`);
  console.log(` Other statuses preserved      : ${summary.other}`);
  console.log(' Migration completed successfully.');
  console.log('=====================================================');
}

main().catch(err => {
  console.error('[MIGRATION-V2] Fatal migration error:', err);
  process.exit(1);
});
