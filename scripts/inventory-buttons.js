import fs from 'fs';

const pages = [
  'dashboard.html',
  'vendor-portal.html',
  'index.html',
  'login.html',
  'change-password.html',
  'request-assessment.html',
  'verify-certificate.html'
];

const inventory = [];

for (const p of pages) {
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf8');

  // Match all <button ...>...</button>
  const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = btnRegex.exec(content)) !== null) {
    const attrs = match[1];
    const rawText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : '(none)';

    const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1] : '(default/submit)';

    const onclickMatch = attrs.match(/\bonclick=["']([^"']+)["']/i);
    const onclick = onclickMatch ? onclickMatch[1] : '(none)';

    const titleMatch = attrs.match(/\btitle=["']([^"']+)["']/i);
    const title = titleMatch ? titleMatch[1] : '';

    inventory.push({
      page: p,
      text: rawText || title || '(icon)',
      id,
      type,
      onclick
    });
  }
}

console.log(`Total buttons found across all pages: ${inventory.length}`);

// Group by page
const byPage = {};
for (const item of inventory) {
  if (!byPage[item.page]) byPage[item.page] = [];
  byPage[item.page].push(item);
}

for (const [page, items] of Object.entries(byPage)) {
  console.log(`\n=== ${page} (${items.length} buttons) ===`);
  items.slice(0, 15).forEach((b, i) => {
    console.log(`  [${i + 1}] text: "${b.text}" | id: "${b.id}" | type: "${b.type}" | onclick: "${b.onclick}"`);
  });
  if (items.length > 15) {
    console.log(`  ... and ${items.length - 15} more buttons`);
  }
}
