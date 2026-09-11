/**
 * One-time bootstrap script to create the first Manager account in TrackScore.
 * Run manually via CLI:
 *   node scripts/create-first-manager.js [email] [password] [name]
 *
 * Example:
 *   node scripts/create-first-manager.js admin@trackscore.my Manager@2026! "Chief Operations Manager"
 */

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ override: true });
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<username>')) {
  dotenv.config({ path: path.join(process.cwd(), '.env.example'), override: true });
}

import {
  connectToDatabase,
  closeDatabaseConnection,
  findUserByEmail,
  COLLECTION_USERS
} from '../netlify/functions/db.js';
import { ROLE_MANAGER } from '../netlify/functions/auth.js';

async function bootstrapFirstManager() {
  const args = process.argv.slice(2);
  const email = (args[0] || process.env.FIRST_MANAGER_EMAIL || 'admin@trackscore.my').trim().toLowerCase();
  const password = (args[1] || process.env.FIRST_MANAGER_PASSWORD || 'Manager@2026!').trim();
  const name = (args[2] || process.env.FIRST_MANAGER_NAME || 'MIROS Lead Manager').trim();

  if (!email || !password) {
    console.error('Usage: node scripts/create-first-manager.js <email> <password> [name]');
    process.exit(1);
  }

  console.log(`[BOOTSTRAP] Connecting to database...`);
  const connection = await connectToDatabase();
  console.log(`[BOOTSTRAP] Connected. Backend mode: ${connection.isMongoAtlas ? 'MongoDB Atlas' : 'Local File Persistence'}`);

  try {
    const existing = await findUserByEmail(connection, email);
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    if (existing) {
      console.log(`[BOOTSTRAP] Account with email "${email}" already exists. Updating role to manager and resetting credentials...`);
      if (connection.isMongoAtlas) {
        await connection.db.collection(COLLECTION_USERS).updateOne(
          { _id: existing._id },
          {
            $set: {
              name,
              role: ROLE_MANAGER,
              passwordHash,
              updatedAt: new Date().toISOString()
            }
          }
        );
      } else {
        existing.name = name;
        existing.role = ROLE_MANAGER;
        existing.passwordHash = passwordHash;
        existing.updatedAt = new Date().toISOString();
        await connection.saveUser(existing);
      }
      console.log(`[BOOTSTRAP] Successfully updated manager account "${email}".`);
    } else {
      const userDoc = {
        name,
        email,
        passwordHash,
        role: ROLE_MANAGER,
        assessorId: null,
        createdBy: 'System Bootstrap',
        createdAt: new Date().toISOString()
      };

      if (connection.isMongoAtlas) {
        const result = await connection.db.collection(COLLECTION_USERS).insertOne(userDoc);
        console.log(`[BOOTSTRAP] Successfully created first manager account in MongoDB Atlas.`);
        console.log(`[BOOTSTRAP] User ID: ${result.insertedId}`);
      } else {
        const created = await connection.createUser(userDoc);
        console.log(`[BOOTSTRAP] Successfully created first manager account in Local Storage.`);
        console.log(`[BOOTSTRAP] User ID: ${created._id}`);
      }
    }

    console.log(`--------------------------------------------------`);
    console.log(`Manager Email   : ${email}`);
    console.log(`Manager Role    : ${ROLE_MANAGER}`);
    console.log(`Manager Name    : ${name}`);
    console.log(`Password Status : Encrypted with bcrypt`);
    console.log(`--------------------------------------------------`);
  } catch (err) {
    console.error(`[BOOTSTRAP] Error creating manager:`, err);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
    process.exit(0);
  }
}

bootstrapFirstManager();
