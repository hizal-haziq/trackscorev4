import fs from 'fs';

const pages = [
  'vendor-portal.html',
  'index.html',
  'login.html',
  'change-password.html',
  'request-assessment.html',
  'verify-certificate.html'
];

for (const p of pages) {
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8');

  // Find all defined function names in script + external scripts loaded
  const definedFunctions = new Set();
  const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
  let sMatch;
  while ((sMatch = scriptRegex.exec(html)) !== null) {
    const scriptCode = sMatch[1];
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)|window\.([a-zA-Z0-9_$]+)\s*=)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(scriptCode)) !== null) {
      const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
      if (name) definedFunctions.add(name);
    }
  }

  // Load external scripts if referenced
  if (html.includes('app.js')) {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)|window\.([a-zA-Z0-9_$]+)\s*=)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(appJs)) !== null) {
      const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
      if (name) definedFunctions.add(name);
    }
  }

  // Find all onclick="foo(...)" occurrences
  const ocRegex = /onclick=["'`]([a-zA-Z0-9_$]+)\(/g;
  let match;
  const tested = new Set();
  const missingHandlers = [];

  while ((match = ocRegex.exec(html)) !== null) {
    const fn = match[1];
    if (tested.has(fn)) continue;
    tested.add(fn);

    if (!definedFunctions.has(fn)) {
      missingHandlers.push(fn);
    }
  }

  console.log(`\n=== ${p} ===`);
  console.log(`Unique onclick functions: ${tested.size}, Defined functions: ${definedFunctions.size}`);
  if (missingHandlers.length > 0) {
    console.log(`[CRITICAL] Missing handlers: ${missingHandlers.join(', ')}`);
  } else {
    console.log(`[ALL OK] All onclick functions defined.`);
  }
}
