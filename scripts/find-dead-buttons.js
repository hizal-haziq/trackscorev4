import fs from 'fs';

const pages = [
  'index.html',
  'dashboard.html',
  'vendor-portal.html',
  'login.html',
  'change-password.html',
  'request-assessment.html',
  'verify-certificate.html'
];

for (const p of pages) {
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf8');

  // Extract all IDs referenced in addEventListener or getElementById
  const listenerIds = new Set();
  const getElRegex = /(?:getElementById|querySelector)\(['"]#?([a-zA-Z0-9_-]+)['"]\)/g;
  let gm;
  while ((gm = getElRegex.exec(content)) !== null) {
    listenerIds.add(gm[1]);
  }

  // Also match script files included
  const scriptRegex = /<script\s+src=['"]([^'"]+)['"]/g;
  let sm;
  while ((sm = scriptRegex.exec(content)) !== null) {
    const src = sm[1].replace(/^\//, '');
    if (fs.existsSync(src)) {
      const jsContent = fs.readFileSync(src, 'utf8');
      while ((gm = getElRegex.exec(jsContent)) !== null) {
        listenerIds.add(gm[1]);
      }
    }
  }

  const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  let bm;
  const deadButtons = [];
  while ((bm = btnRegex.exec(content)) !== null) {
    const attrs = bm[1];
    const text = bm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const id = (attrs.match(/\bid=["']([^"']+)["']/i) || [])[1] || '';
    const onclick = (attrs.match(/\bonclick=["']([^"']+)["']/i) || [])[1] || '';
    const type = (attrs.match(/\btype=["']([^"']+)["']/i) || [])[1] || 'submit';
    const line = content.substring(0, bm.index).split('\n').length;

    const hasListener = id && listenerIds.has(id);
    const hasClick = Boolean(onclick);
    const isSubmitInForm = type === 'submit';

    if (!hasClick && !hasListener && !isSubmitInForm) {
      deadButtons.push({ line, id, text, type });
    }
  }

  console.log(`\n=== ${p}: ${deadButtons.length} potentially unhandled buttons ===`);
  deadButtons.forEach(b => {
    console.log(`  L${b.line} [${b.id || 'NO-ID'}] "${b.text.substring(0, 40)}" (type: ${b.type})`);
  });
}
