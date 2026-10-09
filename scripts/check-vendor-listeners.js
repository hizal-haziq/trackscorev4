import fs from 'fs';

const html = fs.readFileSync('vendor-portal.html', 'utf8');

const allIds = new Set();
const idRegex = /\bid=["']([^"']+)["']/g;
let idMatch;
while ((idMatch = idRegex.exec(html)) !== null) {
  allIds.add(idMatch[1]);
}

const listenerRegex = /document\.getElementById\(\s*["']([^"']+)["']\s*\)(\.|\?\.)addEventListener\(\s*["']([^"']+)["']/g;
let match;
const listeners = [];
while ((match = listenerRegex.exec(html)) !== null) {
  listeners.push({ id: match[1], op: match[2], event: match[3] });
}

console.log(`Total addEventListener in vendor-portal.html: ${listeners.length}`);
listeners.forEach(l => {
  const exists = allIds.has(l.id);
  console.log(`  [${exists ? 'FOUND' : 'MISSING'}] #${l.id}${l.op}addEventListener('${l.event}')`);
});
