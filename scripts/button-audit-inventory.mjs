import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const { parseHTML } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/linkedom/esm/index.js')));
const root = path.resolve(import.meta.dirname, '..');
const pages = ['landing.html', 'login.html', 'change-password.html', 'request-assessment.html', 'verify-certificate.html', 'index.html', 'dashboard.html', 'vendor-portal.html'];
const selector = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [contenteditable=true], [onclick]:not(button):not(a):not(input):not(select):not(textarea)';
const entries = [], findings = [];
const text = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const { document } = parseHTML(html);
  const scripts = [];
  for (const script of document.querySelectorAll('script')) {
    const src = script.getAttribute('src');
    if (!src) scripts.push({ file: page, code: script.textContent });
    else {
      const local = path.join(root, src.replace(/^\//, '').split('?')[0]);
      if (fs.existsSync(local)) scripts.push({ file: path.relative(root, local), code: fs.readFileSync(local, 'utf8') });
    }
  }
  const combined = scripts.map(s => s.code).join('\n');
  const definitions = new Map();
  for (const script of scripts) {
    const ast = ts.createSourceFile(script.file, script.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name) definitions.set(node.name.text, node.getText(ast));
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) definitions.set(node.name.text, node.initializer.getText(ast));
      if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(ast) === 'window') definitions.set(node.left.name.text, node.right.getText(ast));
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  function addControls(doc, file, kind, sourceLine = 1) {
    for (const el of doc.querySelectorAll(selector)) {
      if (el.closest('script, style')) continue;
      const id = el.id || '';
      const inline = [...el.attributes].filter(a => /^on/.test(a.name)).map(a => a.value).join('; ');
      const handlerNames = [...inline.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]).filter(n => !['if', 'encodeURIComponent', 'setTimeout'].includes(n));
      const missing = [...new Set(handlerNames)].filter(n => !definitions.has(n) && !['alert', 'confirm', 'print', 'open', 'getElementById', 'remove', 'reload', 'stopPropagation', 'preventDefault'].includes(n));
      const form = el.closest('form')?.id || el.getAttribute('form') || '';
      const references = id ? [...combined.matchAll(new RegExp(`[^\\n]*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^\\n]*`, 'g'))].map(m => text(m[0])).slice(0, 12) : [];
      const endpoints = new Set();
      const visited = new Set();
      function trace(name, depth = 0) {
        if (visited.has(name) || depth > 5) return;
        visited.add(name);
        const code = definitions.get(name) || '';
        for (const m of code.matchAll(/\/(?:\.netlify\/functions|api)\/[\w-]+/g)) endpoints.add(m[0]);
        for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) if (definitions.has(m[1])) trace(m[1], depth + 1);
      }
      handlerNames.forEach(name => trace(name));
      const entry = {
        key: `${page}:${entries.filter(e => e.page === page).length + 1}`, page, role: page === 'dashboard.html' ? 'Manager' : page === 'index.html' ? 'Assessor' : page === 'vendor-portal.html' ? 'Vendor' : 'Public / account',
        file, sourceLine, kind, tag: el.localName, id, className: el.className || '', action: el.getAttribute('data-action') || '', name: el.getAttribute('name') || '', label: text(el.textContent) || text(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || el.type),
        type: el.getAttribute('type') || '', href: el.getAttribute('href') || '', inline, form, handlerNames: [...new Set(handlerNames)], references, endpoints: [...endpoints], missing,
        decision: 'Keep — existing workflow control; no removal justified by inventory alone', testStatus: 'Source inspected; browser/API coverage recorded separately'
      };
      entries.push(entry);
      if (missing.length) findings.push({ key: entry.key, issue: 'unresolved inline call', names: missing });
    }
  }
  addControls(document, page, 'static');
  for (const script of scripts) {
    const ast = ts.createSourceFile(script.file, script.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function templates(node) {
      if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isStringLiteral(node)) {
        const snippet = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => '__DYNAMIC__' + span.literal.text).join('') : node.text;
        if (/<(?:button|a|input|select|textarea|summary)\b|onclick=/i.test(snippet)) {
          addControls(parseHTML(snippet).document, script.file, 'dynamic source template', ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1);
        }
        if (ts.isTemplateExpression(node)) for (const span of node.templateSpans) templates(span.expression);
        return;
      }
      ts.forEachChild(node, templates);
    }
    templates(ast);
  }
}
const byPage = Object.fromEntries(pages.map(page => [page, {
  controls: entries.filter(e => e.page === page).length,
  static: entries.filter(e => e.page === page && e.kind === 'static').length,
  dynamic: entries.filter(e => e.page === page && e.kind !== 'static').length,
  buttons: entries.filter(e => e.page === page && e.tag === 'button').length
}]));
fs.writeFileSync(path.join(root, 'qa/button-control-inventory.json'), JSON.stringify({ generatedAt: new Date().toISOString(), countDefinition: 'Source control definitions across eight canonical pages, including linked-script templates; excludes hidden inputs and duplicate public copies. Dynamic loop instances are not multiplied.', total: entries.length, byPage, findings, controls: entries }, null, 2));
fs.writeFileSync(path.join(root, 'qa/button-control-inventory.csv'), ['Key,Page,Role,Kind,Tag,ID,Label,Inline handler,Form,API,Decision,Test status', ...entries.map(e => [e.key, e.page, e.role, e.kind, e.tag, e.id, e.label, e.inline, e.form, e.endpoints.join(' | '), e.decision, e.testStatus].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n'));
console.log(JSON.stringify({ total: entries.length, byPage, findings }, null, 2));
