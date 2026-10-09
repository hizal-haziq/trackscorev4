const fs = require('fs');

for (const p of ['dashboard.html', 'vendor-portal.html', 'index.html', 'login.html', 'app.js', 'peer-comments.js']) {
  const content = fs.readFileSync(p, 'utf8');
  const matches = [...content.matchAll(/localStorage\.(?:getItem|setItem)\(['"]([^'"]+)['"]/g)];
  console.log(p, 'keys:', Array.from(new Set(matches.map(m => m[1]))));
}
