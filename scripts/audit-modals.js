import fs from 'fs';

const html = fs.readFileSync('dashboard.html', 'utf8');

const modalIds = [
  'report-modal',
  'details-modal',
  'assessment-history-modal',
  'version-detail-modal',
  'version-diff-modal',
  'risk-modal',
  'edit-modal',
  'archive-modal',
  'rejection-reason-modal',
  'convert-inquiry-modal',
  'dismiss-inquiry-modal',
  'register-customer-modal',
  'schedule-assessment-modal',
  'assign-task-modal',
  'assessor-detail-modal',
  'manage-invoice-modal',
  'vendor-invite-modal',
  'send-pre-final-modal',
  'verify-payment-modal',
  'pre-final-email-view-modal',
  'manage-certificate-modal',
  'user-management-modal',
  'reset-password-modal',
  'delete-user-modal'
];

console.log('=== MODAL OPEN/CLOSE AUDIT ===\n');

for (const mId of modalIds) {
  // Find lines where mId is manipulated
  const openRegex = new RegExp(`(?:classList\\.add\\(["']active["']\\)|style\\.display\\s*=\\s*["']flex["']|setAttribute\\(["']aria-hidden["'],\\s*["']false["']\\))[\\s\\S]{0,100}?${mId}|${mId}[\\s\\S]{0,100}?(?:classList\\.add\\(["']active["']\\)|style\\.display\\s*=\\s*["']flex["']|setAttribute\\(["']aria-hidden["'],\\s*["']false["']\\))`, 'g');
  const closeRegex = new RegExp(`(?:classList\\.remove\\(["']active["']\\)|style\\.display\\s*=\\s*["']none["']|setAttribute\\(["']aria-hidden["'],\\s*["']true["']\\))[\\s\\S]{0,100}?${mId}|${mId}[\\s\\S]{0,100}?(?:classList\\.remove\\(["']active["']\\)|style\\.display\\s*=\\s*["']none["']|setAttribute\\(["']aria-hidden["'],\\s*["']true["']\\))`, 'g');

  const hasOpen = openRegex.test(html);
  const hasClose = closeRegex.test(html);

  // Also check buttons inside this modal
  const modalBlockRegex = new RegExp(`<div[^>]*id=["']${mId}["'][\\s\\S]*?</div>\\s*<!--\\s*(?:End|\\d+)`, 'i');
  const blockMatch = html.match(modalBlockRegex);

  console.log(`Modal: #${mId}`);
  console.log(`  Has Open Handler: ${hasOpen}`);
  console.log(`  Has Close Handler: ${hasClose}`);
}
