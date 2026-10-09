import fs from 'fs';

const text = fs.readFileSync('dashboard.html', 'utf8');
const lines = text.split('\n');
const missing = ['modal-download-pdf', 'btn-open-register-modal', 'btn-refresh-registered', 'reg-modal-close', 'reg-modal-cancel', 'schedule-modal-close', 'schedule-modal-cancel', 'inv-modal-close', 'inv-modal-cancel'];

for (const id of missing) {
  lines.forEach((l, i) => {
    if (l.includes(id)) {
      console.log(`${id} at line ${i + 1}: ${l.trim()}`);
    }
  });
}
