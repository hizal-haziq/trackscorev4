/**
 * One-time / Standalone Database Index Creation Script for TrackScore
 * Creates optimized indexes on MongoDB Atlas cluster to speed up:
 * - Status-based filtering (pending_review, approved, rejected)
 * - Assessor ID lookup and real-time notification streams
 * - Date-ordered pagination (createdAt, statusChangedAt)
 * - Duplicate submission validation
 * - Soft-deleted record exclusions
 *
 * Usage:
 *   node scripts/create-indexes.js
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const DB_NAME = 'trackscore';
const COLLECTION_NAME = 'evaluations';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI environment variable is not set.');
    console.error('Please configure MONGODB_URI in .env or your environment.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  const client = new MongoClient(uri, { tls: true });

  try {
    await client.connect();
    console.log('Connected successfully.');
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    console.log(`Creating performance indexes on ${DB_NAME}.${COLLECTION_NAME}...`);

    const indexes = [
      { key: { status: 1 }, name: 'idx_status' },
      { key: { assessorId: 1 }, name: 'idx_assessorId' },
      { key: { createdAt: -1 }, name: 'idx_createdAt_desc' },
      { key: { statusChangedAt: -1 }, name: 'idx_statusChangedAt_desc' },
      {
        key: { companyName: 1, deviceModel: 1, assessorName: 1, assessmentDate: 1 },
        name: 'idx_duplicate_check'
      },
      {
        key: { deletedAt: 1, status: 1, createdAt: -1 },
        name: 'idx_active_status_created'
      }
    ];

    for (const idx of indexes) {
      process.stdout.write(`Creating index ${idx.name}... `);
      const res = await collection.createIndex(idx.key, { name: idx.name, background: true });
      console.log(`[OK] (${res})`);
    }

    console.log('\nAll performance indexes verified and created successfully!');
  } catch (err) {
    console.error('Failed to create indexes:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
