import fs from 'fs';

const html = fs.readFileSync('dashboard.html', 'utf8');

// 1. Find all buttons
const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
let match;
const buttons = [];
while ((match = btnRegex.exec(html)) !== null) {
  const attrs = match[1];
  const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] || null;
  const onclick = attrs.match(/\bonclick=["']([^"']+)["']/i)?.[1] || null;
  const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1] || null;
  buttons.push({ text, id, onclick, type });
}

console.log(`Total buttons in dashboard.html: ${buttons.length}`);

// 2. Find all dynamically generated buttons in JS template literals
const dynamicBtnRegex = /<button(?:\s+type=[^>]+)?(?:\s+class=[^>]+)?(?:\s+onclick=[\`'"]([^(\`'"]+)\([^)\`'"]*\)[\`'"])?[^>]*>([\s\S]*?)<\/button>/gi;
const dynamicButtons = [];
while ((match = dynamicBtnRegex.exec(html)) !== null) {
  if (match[1]) {
    dynamicButtons.push({ fn: match[1], snippet: match[0].slice(0, 100) });
  }
}
console.log(`Dynamic buttons with onclick: ${dynamicButtons.length}`);

// 3. Find all event listeners attached in DOMContentLoaded or elsewhere
const listenerRegex = /document\.getElementById\(\s*["']([^"']+)["']\s*\)\??\.addEventListener\(\s*["']([^"']+)["']\s*,\s*([^)]+)\)/g;
const listeners = [];
while ((match = listenerRegex.exec(html)) !== null) {
  listeners.push({ id: match[1], event: match[2], handler: match[3].trim() });
}
console.log(`Explicit addEventListener calls: ${listeners.length}`);

console.log('\n--- Event Listeners attached to elements ---');
listeners.forEach(l => {
  const elExists = html.includes(`id="${l.id}"`) || html.includes(`id='${l.id}'`);
  console.log(`  [${elExists ? 'FOUND' : 'MISSING'}] #${l.id} -> on${l.event} : ${l.handler.slice(0, 50)}`);
});
