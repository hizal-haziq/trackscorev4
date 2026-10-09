import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../certificate-pdf.js', import.meta.url), 'utf8');

function setup({ viewport = 1280, failure, images = [] } = {}) {
  const overlay = { style: {}, removed: false, remove() { this.removed = true; } };
  const copy = { style: { left: '0', right: '0', margin: 'auto' }, parentElement: overlay, querySelectorAll: () => images };
  const body = {
    appendChild(element) { element.parentNode = this; },
    removeChild(element) { element.parentNode = null; }
  };
  let target, options, saved = false;
  const worker = {
    set(value) { options = value; return this; },
    from() { return this; },
    toContainer() { return this; },
    async get(key) { assert.equal(key, 'container'); return copy; },
    async save() {
      // html2canvas measures in the real viewport, then renders in windowWidth.
      // Centering would measure (viewport - 794) / 2, shifting the crop.
      const measuredLeft = copy.style.margin === 'auto' ? (viewport - 794) / 2 : Number.parseFloat(copy.style.left);
      assert.equal(measuredLeft, 0);
      assert.equal(copy.style.width, '794px');
      assert.equal(copy.style.height, '1120px');
      assert.equal(overlay.style.width, '794px');
      assert.equal(options.html2canvas.windowWidth, 794);
      assert.equal(options.html2canvas.windowHeight, 1120);
      assert.equal(options.jsPDF.orientation, 'portrait');
      assert.equal(options.margin, 0);
      if (failure) throw failure;
      saved = true;
    }
  };
  const window = { html2pdf: () => worker, location: { origin: 'https://trackscore.test' } };
  const document = {
    body, fonts: { ready: Promise.resolve() },
    createElement() { target = { style: {}, setAttribute() {}, firstElementChild: {} }; return target; }
  };
  vm.runInNewContext(source, { window, document });
  return { window, overlay, get target() { return target; }, get saved() { return saved; } };
}

for (const viewport of [375, 794, 1280, 1920]) {
  test(`certificate copy stays at the capture origin in a ${viewport}px viewport`, async () => {
    const state = setup({ viewport });
    await state.window.downloadTrackScoreCertificatePdf({ companyName: 'ABC Sdn. Bhd.' });
    assert.equal(state.saved, true);
    assert.equal(state.target.parentNode, null);
    assert.equal(state.overlay.removed, true);
  });
}

test('failed PDF generation removes both temporary containers', async () => {
  const state = setup({ failure: new Error('renderer failed') });
  await assert.rejects(state.window.downloadTrackScoreCertificatePdf({}), /renderer failed/);
  assert.equal(state.target.parentNode, null);
  assert.equal(state.overlay.removed, true);
});

test('broken certificate images fail explicitly and clean up', async () => {
  const state = setup({ images: [{ complete: true, naturalWidth: 0 }] });
  await assert.rejects(state.window.downloadTrackScoreCertificatePdf({}), /image could not be loaded/);
  assert.equal(state.saved, false);
  assert.equal(state.target.parentNode, null);
  assert.equal(state.overlay.removed, true);
});

test('root and public certificate implementations match', () => {
  assert.equal(source, readFileSync(new URL('../public/certificate-pdf.js', import.meta.url), 'utf8'));
});

test('missing certificate details remain missing rather than becoming endorsements', () => {
  const state = setup();
  const record = { _id: 'legacy-approved', approvedAt: '2026-01-01', certificate: { preparedDate: '2026-02-01' } };
  const html = state.window.generateCertificateHtml(record);
  assert.ok(html.includes('Not recorded'));
  assert.ok(html.includes('Not assigned'));
  assert.ok(!html.includes('Director General, MIROS'));
  assert.ok(!html.includes('TS-CERT-'));
  assert.deepEqual(record.certificate, { preparedDate: '2026-02-01' });
});
