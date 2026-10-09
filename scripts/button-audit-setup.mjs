import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SECTION_A_CRITERIA, SECTION_B_CRITERIA, recomputeScores } from '../netlify/functions/rubric.js';

const root = path.resolve(import.meta.dirname, '..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'trackscore-button-audit-'));
for (const folder of ['public', 'netlify', 'tests', 'dist', 'build']) fs.cpSync(path.join(root, folder), path.join(sandbox, folder), { recursive: true });
for (const name of fs.readdirSync(root).filter(name => /\.(html|js|css|svg|json)$/.test(name))) {
  if (fs.statSync(path.join(root, name)).isFile()) fs.copyFileSync(path.join(root, name), path.join(sandbox, name));
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction');
fs.mkdirSync(path.join(sandbox, '.data'));
fs.writeFileSync(path.join(sandbox, '.env'), `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}\nMONGODB_URI=mongodb://127.0.0.1:1\nPORT=3008\n`);
const hash = bcrypt.hashSync('AuditPassword42!', 10);
const id = n => n.toString(16).padStart(24, '0');
const users = ['manager', 'assessor'].map((role, i) => ({ _id: id(i + 1), role, email: `${role}@audit.test`, name: `Audit ${role}`, passwordHash: hash, assessorId: role === 'assessor' ? 'AUD 0001' : null }));
const vendors = [{ _id: id(3), companyName: 'ABC Sdn. Bhd.', contactEmail: 'vendor@audit.test', passwordHash: hash, contactName: 'Audit Vendor', phone: '0123456789', linkedRegistrationIds: [id(10), id(11), id(12)], mustChangePassword: false }];
const breakdown = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map(c => ({ id: c.id, selectedOption: c.options.at(-1).label, raw: Math.max(...c.options.map(option => option.points)), comment: `Internal audit comment for ${c.id}` }));
const scores = recomputeScores(breakdown);
const evaluations = ['pending_review', 'pre_final_sent', 'completed', 'registered', 'rejected'].map((status, i) => ({
  _id: id(10 + i), companyName: 'ABC Sdn. Bhd.', contactEmail: 'vendor@audit.test', contactName: 'Audit Vendor', phone: '0123456789',
  deviceModel: `Audit Gateway ${i + 1}`, packageName: 'Package 1', package: 'package_1', status,
  assessorId: 'AUD 0001', assessorName: 'Audit assessor', assignedAssessorId: 'AUD 0001', assignedAssessor: 'Audit assessor',
  assessmentDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z', currentVersion: 1, breakdown, ...scores,
  invoice: { invoiceNumber: `AUDIT-INV-${i}`, amount: 500, status: 'issued' },
  payment: { status: i === 2 ? 'verified' : 'pending', verified: i === 2 },
  certificate: i === 2 ? { certificateNumber: 'TS-CERT-AUDIT-2026', signedBy: 'Audit Director General', signedDate: '2026-10-01', preparedDate: '2026-09-29', printedDate: '2026-09-30', sentToCustomerDate: '2026-10-01' } : undefined,
  statusHistory: [], evaluationHistory: []
}));
const versions = evaluations.slice(0, 3).map(doc => ({ ...doc, _id: id(Number.parseInt(doc._id, 16) + 100), evaluationId: doc._id, versionNumber: 1 }));
for (const [name, data] of Object.entries({ users, vendors, evaluations, assessment_versions: versions, assessment_risk: [], inquiries: [] })) fs.writeFileSync(path.join(sandbox, '.data', `${name}.json`), JSON.stringify(data, null, 2));
const state = { sandbox, port: 3008, createdAt: new Date().toISOString() };
fs.writeFileSync(path.join(root, 'qa', process.argv[2] || 'button-audit-state.json'), JSON.stringify(state, null, 2));
console.log(JSON.stringify(state));
