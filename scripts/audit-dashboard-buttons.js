import fs from 'fs';

const content = fs.readFileSync('dashboard.html', 'utf8');
const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
let m, count = 0;
const results = [];
while ((m = btnRegex.exec(content)) !== null) {
  count++;
  const attrs = m[1];
  const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
  const id = idMatch ? idMatch[1] : '';
  const onclickMatch = attrs.match(/\bonclick=["']([^"']+)["']/i);
  const onclick = onclickMatch ? onclickMatch[1] : '';
  const styleMatch = attrs.match(/\bstyle=["']([^"']+)["']/i);
  const style = styleMatch ? styleMatch[1] : '';
  const titleMatch = attrs.match(/\btitle=["']([^"']+)["']/i);
  const title = titleMatch ? titleMatch[1] : '';
  const line = content.substring(0, m.index).split('\n').length;
  results.push({ count, line, id, text, onclick, title, style });
}

console.log('Total dashboard buttons:', results.length);
results.slice(0, 97).forEach(r => {
  console.log(`#${r.count} L${r.line} [ID: ${r.id || '-'}] "${r.text.substring(0, 30)}" | click: ${r.onclick ? r.onclick.substring(0, 30) : '-'} | title: ${r.title.substring(0, 30)}`);
});
