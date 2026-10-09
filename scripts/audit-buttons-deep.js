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
  const lines = content.split('\n');

  console.log(`\n======================================================`);
  console.log(`PAGE: ${p}`);
  console.log(`======================================================`);

  const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  let count = 0;
  while ((match = btnRegex.exec(content)) !== null) {
    count++;
    const fullMatch = match[0];
    const attrs = match[1];
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : '';
    const onclickMatch = attrs.match(/\bonclick=["']([^"']+)["']/i);
    const onclick = onclickMatch ? onclickMatch[1] : '';
    const styleMatch = attrs.match(/\bstyle=["']([^"']+)["']/i);
    const style = styleMatch ? styleMatch[1] : '';

    // Calculate line number
    const sub = content.substring(0, match.index);
    const lineNum = sub.split('\n').length;

    console.log(`[#${count}] L${lineNum} | ID: "${id || '-'}" | Text: "${text.substring(0, 40)}" | Onclick: "${onclick.substring(0, 35)}"`);
  }
}
