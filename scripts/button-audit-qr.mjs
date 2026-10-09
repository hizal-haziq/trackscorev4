import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(path.join(os.tmpdir(), 'trackscore-audit-tools/package.json'));
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), 'trackscore-audit-tools/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3008/landing.html');
  await page.addScriptTag({ url: 'http://127.0.0.1:3008/certificate-pdf.js' });
  await page.evaluate(() => { document.body.innerHTML = generateCertificateHtml({ certificate: { certificateNumber: 'TS-CERT-AUDIT-2026' } }); const img = document.querySelector('img'); document.body.replaceChildren(img); img.style.cssText = 'width:500px;height:500px;margin:100px;'; });
  const image = await page.locator('img').screenshot({ path: 'qa/button-audit-qr-source.png' });
  const png = PNG.sync.read(image);
  console.log(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data || 'SOURCE QR NOT DECODED');
} finally { await browser.close(); }
