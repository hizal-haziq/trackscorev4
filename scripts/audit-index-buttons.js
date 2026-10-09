import fs from 'fs';

const content = fs.readFileSync('index.html', 'utf8');
const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
let m, count = 0;
while ((m = btnRegex.exec(content)) !== null) {
  count++;
  const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const idMatch = m[1].match(/\bid=["']([^"']+)["']/i);
  const id = idMatch ? idMatch[1] : '';
  const onclickMatch = m[1].match(/\bonclick=["']([^"']+)["']/i);
  const onclick = onclickMatch ? onclickMatch[1] : '';
  const line = content.substring(0, m.index).split('\n').length;
  console.log(`#${count} L${line} [${id || '-'}] "${text.substring(0, 30)}" | ${onclick.substring(0, 35)}`);
}
