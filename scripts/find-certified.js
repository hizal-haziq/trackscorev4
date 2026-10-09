import { connectToDatabase, closeDatabaseConnection } from '../netlify/functions/db.js';

async function main() {
  const { db } = await connectToDatabase();
  const certs = await db.collection('evaluations').find({
    status: { $in: ['certificate_issued', 'completed'] }
  }).toArray();
  console.log('Found certified evaluations:', certs.length);
  for (const c of certs) {
    console.log({
      id: c._id,
      company: c.companyName,
      status: c.status,
      certNum: c.certificate?.certificateNumber,
      signedBy: c.certificate?.signedBy,
      signedDate: c.certificate?.signedDate
    });
  }
  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
