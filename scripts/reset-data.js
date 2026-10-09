/**
 * TrackScore Safe Application Data Reset Script
 *
 * This script wipes application records from MongoDB Atlas and/or the local
 * JSON fallback store to achieve a pristine, clean-slate state.
 *
 * SAFETY GUARANTEES:
 * 1. Collections and indexes are preserved (uses deleteMany({}), never dropDatabase or drop()).
 * 2. User accounts are reset to 0 (no automatic re-seeding).
 * 3. Requires explicit confirmation (--confirm flag or typing 'RESET' when interactive).
 * 4. Logs before/after document counts for full auditability.
 * 5. Sanitizes database connection URIs so credentials are never logged.
 *
 * Usage:
 *   node scripts/reset-data.js --confirm
 *   or:
 *   npm run reset-data -- --confirm
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import {
  DB_NAME,
  COLLECTION_NAME,
  COLLECTION_USERS,
  COLLECTION_VENDORS,
  COLLECTION_INQUIRIES,
  COLLECTION_VERSIONS,
  COLLECTION_RISK,
  ensureDatabaseIndexes
} from '../netlify/functions/db.js';

// Load environment variables
dotenv.config({ override: true });
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<username>')) {
  dotenv.config({ path: path.join(process.cwd(), '.env.example'), override: true });
}

const FALLBACK_DIR = path.join(process.cwd(), '.data');
const LOCAL_STORES = [
  { name: 'evaluations', file: path.join(FALLBACK_DIR, 'evaluations.json') },
  { name: 'users', file: path.join(FALLBACK_DIR, 'users.json') },
  { name: 'vendors', file: path.join(FALLBACK_DIR, 'vendors.json') },
  { name: 'inquiries', file: path.join(FALLBACK_DIR, 'inquiries.json') },
  { name: 'assessment_versions', file: path.join(FALLBACK_DIR, 'assessment_versions.json') },
  { name: 'assessment_risk', file: path.join(FALLBACK_DIR, 'assessment_risk.json') }
];

const MONGO_COLLECTIONS = [
  COLLECTION_NAME,
  COLLECTION_USERS,
  COLLECTION_VENDORS,
  COLLECTION_INQUIRIES,
  COLLECTION_VERSIONS,
  COLLECTION_RISK
];

/**
 * Redacts credentials from a MongoDB connection string
 */
function sanitizeMongoUri(rawUri) {
  if (!rawUri) return 'None (Local Storage Only)';
  try {
    return rawUri.replace(/\/\/[^:]+:[^@]+@/, '//****:****@');
  } catch {
    return 'Redacted MongoDB URI';
  }
}

/**
 * Reads record count from local JSON file
 */
function readLocalCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Prompts user for interactive confirmation if flag not provided
 */
async function promptConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: You are about to permanently delete all TrackScore application records.\n' +
      'Type "RESET" to confirm: ',
      (answer) => {
        rl.close();
        resolve(answer.trim() === 'RESET');
      }
    );
  });
}

async function runReset() {
  const args = process.argv.slice(2);
  const isConfirmed = args.includes('--confirm') ||
                      args.includes('-y') ||
                      args.includes('--force') ||
                      process.env.CONFIRM_RESET === 'RESET';

  console.log('========================================================');
  console.log('          TRACKSCORE APPLICATION DATA RESET             ');
  console.log('========================================================');

  let rawUri = process.env.MONGODB_URI;
  if (rawUri) {
    rawUri = rawUri.trim().split(/\s+/)[0];
  }
  const isRealAtlas = rawUri &&
    !rawUri.includes('<') &&
    !rawUri.includes('>') &&
    !rawUri.includes('username:password');

  console.log(`Environment       : ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database Name     : ${DB_NAME}`);
  console.log(`Target MongoDB URI: ${sanitizeMongoUri(rawUri)}`);
  console.log(`Local Store Path  : ${FALLBACK_DIR}`);
  console.log('--------------------------------------------------------');

  if (!isConfirmed) {
    const confirmed = await promptConfirmation();
    if (!confirmed) {
      console.log('\n❌ Reset aborted. No changes were made.');
      process.exit(0);
    }
  }

  console.log('\n[1/4] Connecting and taking pre-reset snapshot...');

  let mongoClient = null;
  let mongoDb = null;
  const beforeCounts = { mongo: {}, local: {} };
  const afterCounts = { mongo: {}, local: {} };

  // Read Local Before Counts
  for (const store of LOCAL_STORES) {
    beforeCounts.local[store.name] = readLocalCount(store.file);
  }

  // Connect to MongoDB if available
  if (isRealAtlas) {
    try {
      mongoClient = new MongoClient(rawUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        tls: true
      });
      await mongoClient.connect();
      mongoDb = mongoClient.db(DB_NAME);
      console.log('  ✓ Connected to MongoDB Atlas cluster.');

      for (const colName of MONGO_COLLECTIONS) {
        beforeCounts.mongo[colName] = await mongoDb.collection(colName).countDocuments();
      }
    } catch (err) {
      console.warn(`  ⚠️  MongoDB Atlas connection failed: ${err.message}. Proceeding with local fallback store.`);
      mongoClient = null;
      mongoDb = null;
    }
  } else {
    console.log('  ℹ MongoDB Atlas not configured. Using local JSON store.');
  }

  console.log('\n[2/4] Executing safe data purge...');

  // Reset MongoDB Collections
  if (mongoDb) {
    for (const colName of MONGO_COLLECTIONS) {
      const col = mongoDb.collection(colName);
      const delResult = await col.deleteMany({});
      console.log(`  ✓ MongoDB [${colName}]: Deleted ${delResult.deletedCount} documents.`);
    }

    console.log('  ✓ Preserving & verifying indexes...');
    await ensureDatabaseIndexes(mongoDb);

    for (const colName of MONGO_COLLECTIONS) {
      const indexes = await mongoDb.collection(colName).indexes();
      const indexNames = indexes.map(idx => idx.name).join(', ');
      console.log(`    - [${colName}] Verified ${indexes.length} indexes: ${indexNames}`);
    }
  }

  // Reset Local JSON Stores
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }

  for (const store of LOCAL_STORES) {
    fs.writeFileSync(store.file, JSON.stringify([], null, 2), 'utf-8');
    console.log(`  ✓ Local Store [${store.name}.json]: Truncated to [] (0 records).`);
  }

  console.log('\n[3/4] Verifying clean-slate state...');

  // Read Local After Counts
  for (const store of LOCAL_STORES) {
    afterCounts.local[store.name] = readLocalCount(store.file);
  }

  // Read Mongo After Counts
  if (mongoDb) {
    for (const colName of MONGO_COLLECTIONS) {
      afterCounts.mongo[colName] = await mongoDb.collection(colName).countDocuments();
    }
  }

  console.log('\n[4/4] Summary & Audit Report:');
  console.log('--------------------------------------------------------------------------');
  console.log(
    'Target Collection / File'.padEnd(25) +
    'Store Type'.padEnd(16) +
    'Before'.padEnd(12) +
    'After'.padEnd(12) +
    'Status'
  );
  console.log('--------------------------------------------------------------------------');

  let allZero = true;

  if (mongoDb) {
    for (const col of MONGO_COLLECTIONS) {
      const b = beforeCounts.mongo[col] ?? 0;
      const a = afterCounts.mongo[col] ?? 0;
      if (a !== 0) allZero = false;
      const status = a === 0 ? '✓ CLEAN' : '❌ RESIDUAL';
      console.log(
        col.padEnd(25) +
        'MongoDB Atlas'.padEnd(16) +
        String(b).padEnd(12) +
        String(a).padEnd(12) +
        status
      );
    }
  }

  for (const store of LOCAL_STORES) {
    const b = beforeCounts.local[store.name] ?? 0;
    const a = afterCounts.local[store.name] ?? 0;
    if (a !== 0) allZero = false;
    const status = a === 0 ? '✓ CLEAN' : '❌ RESIDUAL';
    console.log(
      `${store.name}.json`.padEnd(25) +
      'Local JSON'.padEnd(16) +
      String(b).padEnd(12) +
      String(a).padEnd(12) +
      status
    );
  }
  console.log('--------------------------------------------------------------------------');

  if (mongoClient) {
    await mongoClient.close();
  }

  if (allZero) {
    console.log('\n🎉 SUCCESS: All application data has been completely and safely reset!');
    console.log('   All collections, schemas, indexes, and directory structures are preserved.');
    console.log('   User accounts are currently 0.');
    console.log('\nNEXT STEP (Creating Initial Manager):');
    console.log('   Run: node scripts/create-first-manager.js <email> <password> [name]');
    console.log('   Example: node scripts/create-first-manager.js admin@trackscore.my SuperSecret123! "Lead Operations Manager"\n');
  } else {
    console.error('\n❌ WARNING: Some records were not cleared. Please inspect output above.');
    process.exit(1);
  }
}

runReset().catch((err) => {
  console.error('\n❌ Reset failed with error:', err);
  process.exit(1);
});
