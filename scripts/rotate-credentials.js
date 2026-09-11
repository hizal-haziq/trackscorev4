/**
 * Script to rotate all seeded account passwords with cryptographically secure, high-entropy passwords.
 * Updates live MongoDB Atlas cluster and local fallback store.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<username>')) {
  dotenv.config({ path: path.join(process.cwd(), '.env.example'), override: true });
}

import {
  connectToDatabase,
  COLLECTION_USERS,
  COLLECTION_VENDORS
} from '../netlify/functions/db.js';

function generateSecurePassword(prefix = 'TS') {
  const randomChars = crypto.randomBytes(9).toString('base64url'); // 12 chars
  return `${prefix}_${randomChars}!`;
}

async function rotate() {
  console.log('[ROTATE] Connecting to database...');
  const conn = await connectToDatabase();
  console.log('[ROTATE] Connected. isMongoAtlas:', conn.isMongoAtlas);

  const rotations = [
    { email: 'admin@trackscore.my', type: 'user', newPass: generateSecurePassword('Mgr') },
    { email: 'manager@trackscore.my', type: 'user', newPass: generateSecurePassword('Mgr') },
    { email: 'haziq.hizal9006@gmail.com', type: 'user', newPass: generateSecurePassword('Lead') },
    { email: 'assessor@trackscore.my', type: 'user', newPass: generateSecurePassword('Asr') },
    { email: 'farhan@trackscore.my', type: 'user', newPass: generateSecurePassword('Asr') },
    { email: 'vendor@fleetmatics.com', type: 'vendor', newPass: generateSecurePassword('Vnd') },
    { email: 'vendor@apex.com', type: 'vendor', newPass: generateSecurePassword('Vnd') }
  ];

  const credentialsLog = [];

  for (const item of rotations) {
    const salt = bcrypt.genSaltSync(12);
    const passwordHash = bcrypt.hashSync(item.newPass, salt);

    if (item.type === 'user') {
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_USERS).updateOne(
          { email: item.email },
          { $set: { passwordHash, updatedAt: new Date().toISOString() } },
          { upsert: false }
        );
      }
    } else {
      if (conn.isMongoAtlas) {
        await conn.db.collection(COLLECTION_VENDORS).updateOne(
          { contactEmail: item.email },
          { $set: { passwordHash, updatedAt: new Date().toISOString() } },
          { upsert: false }
        );
      }
    }

    credentialsLog.push({
      email: item.email,
      role: item.type,
      newPassword: item.newPass
    });
  }

  // Also update local fallback store if files exist
  const usersFile = path.join(process.cwd(), '.data', 'users.json');
  if (fs.existsSync(usersFile)) {
    const localUsers = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    for (const u of localUsers) {
      const match = rotations.find(r => r.email === u.email);
      if (match) {
        u.passwordHash = bcrypt.hashSync(match.newPass, 12);
        u.updatedAt = new Date().toISOString();
      }
    }
    fs.writeFileSync(usersFile, JSON.stringify(localUsers, null, 2), 'utf-8');
  }

  const vendorsFile = path.join(process.cwd(), '.data', 'vendors.json');
  if (fs.existsSync(vendorsFile)) {
    const localVendors = JSON.parse(fs.readFileSync(vendorsFile, 'utf-8'));
    for (const v of localVendors) {
      const match = rotations.find(r => r.email === v.contactEmail);
      if (match) {
        v.passwordHash = bcrypt.hashSync(match.newPass, 12);
        v.updatedAt = new Date().toISOString();
      }
    }
    fs.writeFileSync(vendorsFile, JSON.stringify(localVendors, null, 2), 'utf-8');
  }

  // Save the rotated credentials to a secure runtime config file
  const credsOutputFile = path.join(process.cwd(), '.data', 'rotated-credentials.json');
  fs.writeFileSync(credsOutputFile, JSON.stringify(credentialsLog, null, 2), 'utf-8');

  console.log('[ROTATE] Successfully rotated all account passwords in live Atlas cluster and local store.');
  console.log('[ROTATE] Credentials summary:');
  console.log(JSON.stringify(credentialsLog, null, 2));

  process.exit(0);
}

rotate().catch(err => {
  console.error('[ROTATE-ERROR]', err);
  process.exit(1);
});
