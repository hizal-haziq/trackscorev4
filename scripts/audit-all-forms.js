import fs from 'fs';

function auditForms(filename) {
  console.log(`\n=== FORMS IN ${filename} ===`);
  const html = fs.readFileSync(filename, 'utf8');
  const formRegex = /<form([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  let count = 0;
  while ((match = formRegex.exec(html)) !== null) {
    count++;
    const attrs = match[1];
    const body = match[2];
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] || '(no id)';
    const onsubmit = attrs.match(/\bonsubmit=["']([^"']+)["']/i)?.[1] || '(no onsubmit)';

    // Check submit buttons inside this form
    const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
    let bMatch;
    const buttons = [];
    while ((bMatch = btnRegex.exec(body)) !== null) {
      const bAttrs = bMatch[1];
      const bText = bMatch[2].replace(/<[^>]+>/g, '').trim();
      const bType = bAttrs.match(/\btype=["']([^"']+)["']/i)?.[1] || '(default/submit)';
      const bId = bAttrs.match(/\bid=["']([^"']+)["']/i)?.[1] || '(no id)';
      const bOnclick = bAttrs.match(/\bonclick=["']([^"']+)["']/i)?.[1] || '(no onclick)';
      buttons.push({ text: bText, type: bType, id: bId, onclick: bOnclick });
    }

    console.log(`Form #${count} id="${id}" onsubmit="${onsubmit}"`);
    buttons.forEach(b => {
      console.log(`  Button: "${b.text}" | type="${b.type}" | id="${b.id}" | onclick="${b.onclick}"`);
    });
  }
}

auditForms('dashboard.html');
auditForms('vendor-portal.html');
auditForms('index.html');
