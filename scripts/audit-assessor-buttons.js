import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');

const buttonIds = [
  'nav-eval-form',
  'nav-my-submissions',
  'nav-peer-review',
  'btn-my-drafts',
  'btn-nav-notifications',
  'tab-btn-matrix',
  'tab-btn-submissions',
  'tab-btn-peer-review',
  'tab-btn-notifications',
  'btn-start-new-eval',
  'btn-save-draft-top',
  'btn-my-drafts-top',
  'btn-demo-data',
  'btn-reset-form',
  'btn-save-draft',
  'btn-save-evaluation',
  'btn-execute-submit',
  'btn-cancel-submit-confirm',
  'btn-pdf-report',
  'btn-lookup-rejections',
  'btn-export-drafts',
  'btn-import-drafts'
];

console.log('=== AUDITING ASSESSOR PORTAL (INDEX.HTML + APP.JS) BUTTONS ===\n');

for (const id of buttonIds) {
  const inHtml = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  const inJs = js.includes(id);

  // Check how it is wired
  const wiredListener = js.includes(`document.getElementById("${id}")`) || js.includes(`document.getElementById('${id}')`);
  const htmlTag = html.match(new RegExp(`<button[^>]*id=["']${id}["'][^>]*>`, 'i'))?.[0] || '';
  const inlineOnclick = htmlTag.match(/onclick=["']([^"']+)["']/i)?.[1] || null;

  console.log(`Button #${id}:`);
  console.log(`  In HTML: ${inHtml}`);
  console.log(`  Wired in JS: ${wiredListener}`);
  console.log(`  Inline onclick: ${inlineOnclick}`);
  if (!wiredListener && !inlineOnclick) {
    console.log(`  [ALERT] Button #${id} HAS NO LISTENER OR ONCLICK!`);
  }
}
