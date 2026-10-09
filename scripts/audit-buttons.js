import fs from 'fs';
import path from 'path';

const PAGES = [
  'dashboard.html',
  'vendor-portal.html',
  'index.html',
  'login.html',
  'change-password.html',
  'request-assessment.html',
  'verify-certificate.html'
];

console.log('=== STARTING TRACKSCORE FRONTEND BUTTON & LISTENER AUDIT ===\n');

for (const page of PAGES) {
  if (!fs.existsSync(page)) {
    console.log(`[SKIP] ${page} does not exist.`);
    continue;
  }
  console.log(`\n==================================================`);
  console.log(`ANALYZING: ${page}`);
  console.log(`==================================================`);

  const html = fs.readFileSync(page, 'utf8');

  // Find all defined function names in scripts on this page
  const definedFunctions = new Set();
  const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
  let sMatch;
  while ((sMatch = scriptRegex.exec(html)) !== null) {
    const scriptCode = sMatch[1];
    // Match function foo(...)
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)|window\.([a-zA-Z0-9_$]+)\s*=)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(scriptCode)) !== null) {
      const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
      if (name) definedFunctions.add(name);
    }
  }

  // If page loads external scripts, inspect them too
  if (html.includes('app.js')) {
    const appJs = fs.readFileSync('app.js', 'utf8');
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)|window\.([a-zA-Z0-9_$]+)\s*=)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(appJs)) !== null) {
      const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
      if (name) definedFunctions.add(name);
    }
  }
  if (html.includes('peer-comments.js')) {
    const pcJs = fs.readFileSync('peer-comments.js', 'utf8');
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)|window\.([a-zA-Z0-9_$]+)\s*=)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(pcJs)) !== null) {
      const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
      if (name) definedFunctions.add(name);
    }
  }
  if (html.includes('certificate-pdf.js')) {
    const cPdf = fs.readFileSync('certificate-pdf.js', 'utf8');
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)|window\.([a-zA-Z0-9_$]+)\s*=)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(cPdf)) !== null) {
      const name = fnMatch[1] || fnMatch[2] || fnMatch[3];
      if (name) definedFunctions.add(name);
    }
  }

  // 1. Find all DOM elements with id="..."
  const allIds = new Set();
  const idRegex = /\bid=["']([^"']+)["']/g;
  let idMatch;
  while ((idMatch = idRegex.exec(html)) !== null) {
    allIds.add(idMatch[1]);
  }

  // 2. Find all document.getElementById('...') in scripts
  const getElRegex = /document\.getElementById\(\s*["']([^"']+)["']\s*\)(\.|\?\.)([a-zA-Z0-9_$]+)/g;
  let elMatch;
  const missingElements = [];
  const dangerousNulls = [];
  while ((elMatch = getElRegex.exec(html)) !== null) {
    const id = elMatch[1];
    const op = elMatch[2]; // '.' or '?.'
    const prop = elMatch[3];
    if (!allIds.has(id)) {
      missingElements.push({ id, op, prop });
      if (op === '.') {
        dangerousNulls.push({ id, prop });
      }
    }
  }

  if (dangerousNulls.length > 0) {
    console.log(`\n  [CRITICAL BUG] Unprotected document.getElementById without '?.' on non-existent element:`);
    dangerousNulls.forEach(d => console.log(`    - ID: "${d.id}" -> .${d.prop}() WILL THROW TypeError and abort script!`));
  }
  if (missingElements.length > 0) {
    console.log(`\n  [WARNING] Element IDs queried in scripts but NOT found in HTML:`);
    const uniqueMissing = [...new Set(missingElements.map(m => m.id))];
    uniqueMissing.forEach(id => console.log(`    - "${id}"`));
  }

  // 3. Find all onclick="..." handlers in HTML
  const onclickRegex = /\bonclick=["']([^"']+)["']/g;
  let ocMatch;
  const brokenOnclicks = [];
  while ((ocMatch = onclickRegex.exec(html)) !== null) {
    const fullHandler = ocMatch[1].trim();
    // Extract root function name if format is foo(...) or foo()
    const fnNameMatch = fullHandler.match(/^([a-zA-Z0-9_$]+)\s*\(/);
    if (fnNameMatch) {
      const fnName = fnNameMatch[1];
      if (!definedFunctions.has(fnName)) {
        brokenOnclicks.push({ handler: fullHandler, fn: fnName });
      }
    }
  }

  if (brokenOnclicks.length > 0) {
    console.log(`\n  [CRITICAL BUG] onclick handlers calling UNDEFINED functions:`);
    brokenOnclicks.forEach(b => console.log(`    - onclick="${b.handler}" -> "${b.fn}" is NOT defined!`));
  } else {
    console.log(`  [OK] All onclick handlers resolve to defined functions.`);
  }

  // 4. Find all <button> elements inside <form> lacking type="button"
  const formRegex = /<form[\s\S]*?<\/form>/gi;
  let formMatch;
  let formIndex = 0;
  const unintendedSubmits = [];
  while ((formMatch = formRegex.exec(html)) !== null) {
    formIndex++;
    const formHtml = formMatch[0];
    const btnRegex = /<button(?:\s+[^>]*)?>/gi;
    let btnMatch;
    while ((btnMatch = btnRegex.exec(formHtml)) !== null) {
      const btnTag = btnMatch[0];
      const hasType = /\btype=["']([^"']+)["']/i.exec(btnTag);
      if (!hasType) {
        unintendedSubmits.push({ form: formIndex, tag: btnTag });
      } else if (hasType[1] !== 'button' && hasType[1] !== 'submit' && hasType[1] !== 'reset') {
        unintendedSubmits.push({ form: formIndex, tag: btnTag });
      }
    }
  }

  if (unintendedSubmits.length > 0) {
    console.log(`\n  [WARNING] <button> inside <form> missing explicit type="button" (defaults to submit!):`);
    unintendedSubmits.forEach(u => console.log(`    - Form #${u.form}: ${u.tag}`));
  } else {
    console.log(`  [OK] All buttons inside forms have explicit type.`);
  }

  // 5. Check fetch calls on this page
  const fetchRegex = /fetch\(\s*[`"']([^`"']+)`["']/g;
  let fMatch;
  const fetchEndpoints = new Set();
  while ((fMatch = fetchRegex.exec(html)) !== null) {
    let url = fMatch[1];
    // Strip query parameters
    url = url.split('?')[0];
    fetchEndpoints.add(url);
  }
  console.log(`\n  Endpoints called via fetch():`, Array.from(fetchEndpoints));
}
