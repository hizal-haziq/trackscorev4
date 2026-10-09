import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ override: true });
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<username>')) {
  dotenv.config({ path: path.join(process.cwd(), '.env.example'), override: true });
}
import { connectToDatabase, COLLECTION_NAME } from '../netlify/functions/db.js';
import { deduplicateEvaluations } from '../netlify/functions/get-evaluations.js';

async function testQuery() {
  const conn = await connectToDatabase();
  const collection = conn.db.collection(COLLECTION_NAME);
  
  const queryFilter = { deletedAt: { $exists: false }, status: { $ne: 'inquiry' } };
  const allDocs = await collection.find(queryFilter).toArray();
  console.log('Total non-deleted docs in DB:', allDocs.length);
  console.log('Statuses of docs:', allDocs.map(d => ({ id: d._id, company: d.companyName, status: d.status, deletedAt: d.deletedAt })));

  const dedupedAll = deduplicateEvaluations(allDocs);
  console.log('Deduped count:', dedupedAll.length);
  for (const d of dedupedAll) {
    console.log('  ->', d.companyName, d.deviceModel, d.status);
  }
}
testQuery();
