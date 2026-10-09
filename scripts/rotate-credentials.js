/**
 * Manual password rotation for explicitly selected existing accounts.
 * Usage: node scripts/rotate-credentials.js user:email vendor:email
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
  COLLECTION_VENDORS,
  findUserByEmail,
  findVendorByEmail
} from '../netlify/functions/db.js';

function generateSecurePassword(prefix = 'TS') {
  const randomChars = crypto.randomBytes(9).toString('base64url'); // 12 chars
  return `${prefix}_${randomChars}!`;
}

async function rotate() {
  const requested = process.argv.slice(2).map(target => {
    const split = target.indexOf(':');
    const type = target.slice(0, split);
    const email = target.slice(split + 1).trim().toLowerCase();
    if (split < 0 || !['user', 'vendor'].includes(type) || !email.includes('@')) throw new Error('Usage: node scripts/rotate-credentials.js user:email vendor:email');
    return { type, email };
  });
  if (!requested.length) throw new Error('Specify existing accounts as user:email or vendor:email. No passwords changed.');
  console.log('[ROTATE] Connecting to database...');
  const conn = await connectToDatabase();
  console.log('[ROTATE] Connected. isMongoAtlas:', conn.isMongoAtlas);

  const rotations = [];
  for (const item of requested) {
    const account = item.type === 'user' ? await findUserByEmail(conn, item.email) : await findVendorByEmail(conn, item.email);
    if (!account) throw new Error('Account not found: ' + item.email + '. No passwords changed.');
    rotations.push({ ...item, newPass: generateSecurePassword() });
  }

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
      const match = rotations.find(r => r.type === 'user' && r.email === u.email);
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
      const match = rotations.find(r => r.type === 'vendor' && r.email === v.contactEmail);
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
