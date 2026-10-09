import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR } from '../netlify/functions/auth.js';

async function testApi() {
  console.log('Testing without token:');
  try {
    const res1 = await fetch('http://localhost:3000/.netlify/functions/get-evaluations');
    console.log('Status no token:', res1.status);
    const body1 = await res1.json().catch(() => null);
    console.log('Body no token:', body1);
  } catch (e) {
    console.error('Error no token:', e.message);
  }

  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Operations Manager', email: 'admin@trackscore.my' });
  console.log('\nTesting with Manager token:');
  try {
    const res2 = await fetch('http://localhost:3000/.netlify/functions/get-evaluations?page=1&limit=10', {
      headers: {
        'Authorization': `Bearer ${managerToken}`
      }
    });
    console.log('Status with token:', res2.status);
    const body2 = await res2.json().catch(() => null);
    console.log('Success:', body2?.success, 'Total records:', body2?.total, 'Records returned:', body2?.data?.length);
  } catch (e) {
    console.error('Error with token:', e.message);
  }
}
testApi();
