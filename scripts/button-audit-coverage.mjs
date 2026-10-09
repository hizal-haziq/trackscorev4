import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'qa', name)));
const inventory = read('button-control-inventory.json');
const browser = read('button-browser-results.json');
const sweep = read('button-click-sweep.json');
const fields = read('button-field-probes.json');
const extra = read('button-extra-workflows.json');
const dynamic = read('button-dynamic-probes.json');
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
const patternMatches = (source, value) => {
  if (!source) return false;
  const expression = source.split('__DYNAMIC__').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expression}$`).test(value || '');
};
for (const control of inventory.controls) {
  const probes = sweep.results.filter(r => r.key === control.key);
  const interactions = browser.interactions.filter(event => event.page === `/${control.page}` && event.tag === control.tag && (
    control.id ? patternMatches(control.id, event.id) : control.inline ? patternMatches(control.inline, event.inline) : control.href ? patternMatches(control.href, event.href) : normalize(control.label) && normalize(control.label) === normalize(event.label)
  ));
  control.browserEvents = [...new Set(interactions.map(event => event.type))];
  control.clickProbe = probes[0]?.status || '';
  control.fieldProbe = fields.results.find(r => r.key === control.key)?.status || '';
  control.dynamicProbe = dynamic.results.find(r => r.key === control.key)?.status || '';
  control.extraWorkflow = ['peer-comment-input', 'btn-submit-peer-comment'].includes(control.id) && extra.results.every(r => r.passed) ? 'Peer comment native input/post and persistence checked in additional role workflows' : '';
  control.purpose = control.handlerNames.length ? `Existing ${control.role} action: ${control.handlerNames.join(', ')}` : control.form ? `Input or submission for ${control.form}` : control.href ? `Navigate to ${control.href}` : `Existing ${control.role} ${control.tag}: ${control.label || control.id}`;
  control.testStatus = interactions.length ? 'Native interaction observed during asserted workflow run; inspect workflow results for outcome' : control.extraWorkflow || (control.clickProbe ? `${control.clickProbe}; synthetic visibility/empty-form validation, not a complete workflow assertion` : control.fieldProbe ? `${control.fieldProbe}; field/link probe, not a complete workflow assertion` : control.dynamicProbe ? `${control.dynamicProbe}; conditional template probe, not a complete workflow assertion` : 'Source inspected; no individual native interaction matched in captured workflow run');
}
const summary = {
  sourceDefinitionsBefore: inventory.total + 1, remainingSourceDefinitions: inventory.total,
  remainingButtons: inventory.controls.filter(c => c.tag === 'button').length,
  controlsWithCapturedNativeInteraction: inventory.controls.filter(c => c.browserEvents.length).length,
  staticButtonProbes: sweep.results.length, failedProbes: sweep.results.filter(r => r.status !== 'native click probe passed'),
  workflowAssertionsPassed: browser.results.filter(r => r.passed).length,
  workflowAssertionsFailed: browser.results.filter(r => !r.passed),
  extraWorkflowAssertionsPassed: extra.results.filter(r => r.passed).length,
  extraWorkflowAssertionsFailed: extra.results.filter(r => !r.passed),
  fieldAndLinkProbeCounts: fields.results.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}),
  fieldAndLinkProbeFailures: fields.results.filter(r => r.status === 'probe failed'),
  dynamicProbeCounts: dynamic.results.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}),
  dynamicProbeFailures: dynamic.results.filter(r => ['probe failed', 'exception'].includes(r.status)),
  noIndividualProbeCaptured: inventory.controls.filter(c => !c.browserEvents.length && !c.clickProbe && !c.fieldProbe && !c.extraWorkflow && c.dynamicProbe !== 'native dynamic click probe passed').map(c => c.key)
};
inventory.coverage = summary;
fs.writeFileSync(path.join(root, 'qa/button-control-inventory.json'), JSON.stringify(inventory, null, 2));
const columns = ['key', 'page', 'role', 'kind', 'tag', 'id', 'label', 'purpose', 'form', 'inline', 'endpoints', 'decision', 'testStatus'];
fs.writeFileSync(path.join(root, 'qa/button-control-inventory.csv'), [columns.join(','), ...inventory.controls.map(c => columns.map(field => `"${String(Array.isArray(c[field]) ? c[field].join(' | ') : c[field] || '').replaceAll('"', '""')}"`).join(','))].join('\n'));
fs.writeFileSync(path.join(root, 'qa/button-audit-coverage.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
