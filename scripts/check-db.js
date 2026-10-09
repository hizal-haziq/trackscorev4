import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ override: true });
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<username>')) {
  dotenv.config({ path: path.join(process.cwd(), '.env.example'), override: true });
}
import {
  connectToDatabase,
  COLLECTION_NAME,
  COLLECTION_USERS,
  COLLECTION_VENDORS,
  COLLECTION_INQUIRIES
} from '../netlify/functions/db.js';

async function check() {
  const conn = await connectToDatabase();
  console.log('Mode:', conn.isMongoAtlas ? 'MongoDB Atlas' : 'Local File Persistence');
  if (conn.isMongoAtlas) {
    const evals = await conn.db.collection(COLLECTION_NAME).countDocuments();
    const users = await conn.db.collection(COLLECTION_USERS).countDocuments();
    const vendors = await conn.db.collection(COLLECTION_VENDORS).countDocuments();
    const inquiries = await conn.db.collection(COLLECTION_INQUIRIES).countDocuments();
    console.log({ evals, users, vendors, inquiries });

    if (users > 0) {
      const uList = await conn.db.collection(COLLECTION_USERS).find({}).project({ passwordHash: 0 }).toArray();
      console.log('Users in DB:', uList);
    }
    if (evals > 0) {
      const eList = await conn.db.collection(COLLECTION_NAME).find({}).limit(5).project({ companyName: 1, status: 1 }).toArray();
      console.log('Evals in DB:', eList);
    }
  }
  process.exit(0);
}
check().catch(err => {
  console.error(err);
  process.exit(1);
});
