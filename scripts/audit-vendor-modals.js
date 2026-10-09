import fs from 'fs';

const html = fs.readFileSync('vendor-portal.html', 'utf8');

const modals = [
  'documents-modal',
  'resubmit-modal',
  'payment-modal',
  'profile-modal',
  'history-modal',
  'notifications-modal'
];

console.log('=== VENDOR PORTAL MODAL AUDIT ===\n');

for (const m of modals) {
  const exists = html.includes(`id="${m}"`);
  const openFn = html.match(new RegExp(`function\\s+(open[a-zA-Z0-9_$]*Modal)[\\s\\S]*?${m}`, 'i'))?.[1] || null;
  console.log(`Modal: #${m} (exists: ${exists})`);
}
