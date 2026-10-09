import fs from 'fs';

function auditOnclicks(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const onclickRegex = /\bonclick=["']([a-zA-Z0-9_$]+)\s*\(/g;
  let match;
  const onclicks = new Set();
  while ((match = onclickRegex.exec(html)) !== null) {
    onclicks.add(match[1]);
  }

  // Also extract onclicks generated inside templates / innerHTML
  const templateOnclickRegex = /onclick=\\?["']([a-zA-Z0-9_$]+)\s*\\?\(/g;
  while ((match = templateOnclickRegex.exec(html)) !== null) {
    onclicks.add(match[1]);
  }

  const missing = [];
  for (const fn of onclicks) {
    // Check if defined in html or in linked scripts
    let found = false;
    const defRegex = new RegExp('(?:function\\s+' + fn + '\\b|window\\.' + fn + '\\s*=|\\b(?:const|let|var)\\s+' + fn + '\\s*=)', 'g');
    if (defRegex.test(html)) {
      found = true;
    } else {
      // Check in peer-comments.js, certificate-pdf.js, app.js
      if (html.includes('peer-comments.js') && fs.existsSync('peer-comments.js')) {
        const pc = fs.readFileSync('peer-comments.js', 'utf8');
        if (defRegex.test(pc)) found = true;
      }
      if (html.includes('certificate-pdf.js') && fs.existsSync('certificate-pdf.js')) {
        const cp = fs.readFileSync('certificate-pdf.js', 'utf8');
        if (defRegex.test(cp)) found = true;
      }
      if (html.includes('app.js') && fs.existsSync('app.js')) {
        const ap = fs.readFileSync('app.js', 'utf8');
        if (defRegex.test(ap)) found = true;
      }
    }

    if (!found) {
      missing.push(fn);
    }
  }

  console.log(`[${htmlPath}] Total distinct onclick functions: ${onclicks.size}`);
  if (missing.length > 0) {
    console.error(`[${htmlPath}] ❌ MISSING FUNCTIONS: ${missing.join(', ')}`);
    return false;
  } else {
    console.log(`[${htmlPath}] ✅ ALL ${onclicks.size} onclick functions are verified!`);
    return true;
  }
}

console.log('=== COMPREHENSIVE ONCLICK AUDIT ===\n');
const pages = [
  'dashboard.html',
  'vendor-portal.html',
  'index.html',
  'login.html',
  'request-assessment.html',
  'change-password.html',
  'verify-certificate.html'
];

let allPassed = true;
for (const p of pages) {
  const ok = auditOnclicks(p);
  if (!ok) allPassed = false;
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log('\n🎉 ALL PAGES PASSED ONCLICK AUDIT!');
}
