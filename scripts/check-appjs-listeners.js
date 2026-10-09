import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');

// Find all IDs in index.html
const allIds = new Set();
const idRegex = /\bid=["']([^"']+)["']/g;
let idMatch;
while ((idMatch = idRegex.exec(html)) !== null) {
  allIds.add(idMatch[1]);
}

// Find all document.getElementById in app.js
const listenerRegex = /document\.getElementById\(\s*["']([^"']+)["']\s*\)(\.|\?\.)addEventListener\(\s*["']([^"']+)["']/g;
let match;
const listeners = [];
while ((match = listenerRegex.exec(js)) !== null) {
  listeners.push({ id: match[1], op: match[2], event: match[3] });
}

console.log(`Total addEventListener in app.js: ${listeners.length}`);
listeners.forEach(l => {
  const exists = allIds.has(l.id);
  console.log(`  [${exists ? 'FOUND' : 'MISSING'}] #${l.id}${l.op}addEventListener('${l.event}')`);
});
