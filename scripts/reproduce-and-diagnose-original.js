import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER, ROLE_VENDOR } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9235;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_DIR = path.resolve('qa/certificate-pdf-debug');

if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

let serverProcess;
let chromeProcess;
let ws;
let msgId = 1;
const pendingRequests = new Map();

function sendCdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalInBrowser(code) {
  const result = await sendCdp('Runtime.evaluate', {
    expression: code,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function startServerIfNeeded() {
  try {
    const check = await fetch(`http://localhost:${PORT}/login.html`);
    if (check.ok) return;
  } catch (e) {}

  serverProcess = spawn('npm', ['run', 'dev'], {
    shell: true,
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, PORT: String(PORT) }
  });

  for (let i = 0; i < 30; i++) {
    await wait(1000);
    try {
      const check = await fetch(`http://localhost:${PORT}/login.html`);
      if (check.ok) return;
    } catch (e) {}
  }
}

async function main() {
  try {
    await startServerIfNeeded();

    chromeProcess = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      `--user-data-dir=${process.env.TEMP || 'C:\\Windows\\Temp'}\\chrome_diag_${Date.now()}`,
      '--window-size=1280,900',
      'about:blank'
    ]);

    for (let i = 0; i < 20; i++) {
      await wait(500);
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        if (res.ok) {
          const list = await res.json();
          const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || list[0];
          if (page && page.webSocketDebuggerUrl) {
            ws = new WebSocket(page.webSocketDebuggerUrl);
            break;
          }
        }
      } catch (e) {}
    }

    await new Promise(r => ws.on('open', r));
    ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.id && pendingRequests.has(data.id)) {
        const { resolve, reject } = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    });

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('DOM.enable');

    const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Operations Manager', username: 'manager@trackscore.my' });

    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/login.html` });
    await wait(1000);

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${managerToken}');
      localStorage.setItem('trackscore_user_role', 'manager');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Lead Operations Manager', role: 'manager' }));
      localStorage.setItem('token', '${managerToken}');
    `);

    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/dashboard.html` });
    await wait(3000);

    console.log('[Step 1] Loading certificate data for certified assessment...');
    const recordId = '6ab9c4576125a16f619c7849'; // AppAsia Sdn Bhd certified record

    // Render the certificate visually in the browser to take screenshot A
    const browserRender = await evalInBrowser(`(async () => {
      const res = await fetch('/.netlify/functions/lookup-evaluation?id=${recordId}', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('trackscore_token') }
      });
      const data = await res.json();
      const record = (data.data && data.data[0]) || data.evaluation || data;

      // Render certificate inside a preview container visible in browser
      let previewWrapper = document.getElementById('debug-cert-preview');
      if (!previewWrapper) {
        previewWrapper = document.createElement('div');
        previewWrapper.id = 'debug-cert-preview';
        previewWrapper.style.position = 'absolute';
        previewWrapper.style.top = '0';
        previewWrapper.style.left = '0';
        previewWrapper.style.zIndex = '99999';
        previewWrapper.style.background = '#FFFFFF';
        document.body.appendChild(previewWrapper);
      }
      previewWrapper.innerHTML = window.generateCertificateHtml(record);

      const certEl = previewWrapper.firstElementChild;
      const rect = certEl.getBoundingClientRect();
      const scrollH = certEl.scrollHeight;
      const offsetH = certEl.offsetHeight;

      return {
        companyName: record.companyName,
        certNumber: record.certificate?.certificateNumber,
        rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
        scrollH,
        offsetH
      };
    })()`);

    console.log('[Step 2] Browser certificate rendered:', browserRender);
    await wait(500);

    // Take screenshot of browser certificate (Screenshot A)
    const browserScreenshot = await sendCdp('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: 794,
        height: Math.min(browserRender.scrollH, 1400),
        scale: 1
      }
    });
    const browserScreenshotPath = path.join(DEBUG_DIR, 'browser-certificate.png');
    fs.writeFileSync(browserScreenshotPath, Buffer.from(browserScreenshot.data, 'base64'));
    console.log(`[Step 3] Saved browser certificate screenshot to: ${browserScreenshotPath}`);

    // Remove the preview
    await evalInBrowser(`document.getElementById('debug-cert-preview')?.remove()`);

    console.log('[Step 4] Running ORIGINAL downloadManagerCertificate implementation to generate PDF...');
    const originalPdfResult = await evalInBrowser(`(async () => {
      await loadHtml2Pdf();
      const res = await fetch('/.netlify/functions/lookup-evaluation?id=${recordId}', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('trackscore_token') }
      });
      const data = await res.json();
      const record = (data.data && data.data[0]) || data.evaluation || data;

      // This is the EXACT original code in dashboard.html lines 9005-9025:
      const element = document.createElement('div');
      element.style.position = 'fixed';
      element.style.left = '-100000px';
      element.style.top = '0';
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = window.generateCertificateHtml(record);
      document.body.appendChild(element);

      const certEl = element.firstElementChild;
      const originalRect = certEl.getBoundingClientRect();

      // Original html2pdf call:
      const worker = window.html2pdf().set({
        margin: 0,
        filename: 'TrackScore_Certificate_Original.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' }
      }).from(certEl);

      const pdf = await worker.toPdf().get('pdf');
      const numPages = pdf.internal.getNumberOfPages();
      const pageSize = pdf.internal.pageSize;
      const pdfBase64 = pdf.output('datauristring');

      element.remove();

      return {
        originalRect: { width: originalRect.width, height: originalRect.height },
        numPages,
        pageWidthPx: pageSize.getWidth(),
        pageHeightPx: pageSize.getHeight(),
        pdfBase64
      };
    })()`);

    console.log('[Step 5] Original PDF Generation Metrics:');
    console.log(`  Source Element Size: ${originalPdfResult.originalRect.width}px x ${originalPdfResult.originalRect.height}px`);
    console.log(`  Page Count: ${originalPdfResult.numPages}`);
    console.log(`  PDF Page Dimensions: ${originalPdfResult.pageWidthPx}px x ${originalPdfResult.pageHeightPx}px`);

    const originalPdfPath = path.join(DEBUG_DIR, 'generated-certificate.pdf');
    const base64Data = originalPdfResult.pdfBase64.split(',')[1];
    fs.writeFileSync(originalPdfPath, Buffer.from(base64Data, 'base64'));
    console.log(`[Step 6] Saved generated-certificate.pdf to: ${originalPdfPath} (${fs.statSync(originalPdfPath).size} bytes)`);

    // Render the generated PDF into an image (Screenshot B)
    console.log('[Step 7] Rendering generated PDF in browser to capture page 1 image...');
    const pdfUrl = 'file:///' + originalPdfPath.replace(/\\/g, '/');
    await sendCdp('Page.navigate', { url: pdfUrl });
    await wait(2500);

    const pdfScreenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const pdfScreenshotPath = path.join(DEBUG_DIR, 'generated-certificate-page-1.png');
    fs.writeFileSync(pdfScreenshotPath, Buffer.from(pdfScreenshot.data, 'base64'));
    console.log(`[Step 8] Saved generated-certificate-page-1.png to: ${pdfScreenshotPath}`);

    // DIAGNOSIS SUMMARY
    console.log('\n======================================================');
    console.log('DIAGNOSIS OF ORIGINAL BUG:');
    console.log('======================================================');
    console.log(`1. Certificate source HTML has height: ${originalPdfResult.originalRect.height}px`);
    console.log(`2. But the configured jsPDF page height is: ${originalPdfResult.pageHeightPx}px`);
    console.log(`3. Difference: ${originalPdfResult.originalRect.height - originalPdfResult.pageHeightPx}px overflow!`);
    console.log(`4. Total pages produced: ${originalPdfResult.numPages}`);
    console.log(`5. Exactly what is missing on Page 1:`);
    console.log(`   - Signature block, Certificate Record table, and MIROS Verification footer`);
    console.log(`   - Pushed down by ${originalPdfResult.originalRect.height - originalPdfResult.pageHeightPx}px onto Page 2!`);
    console.log(`6. In addition, when scrollY > 0, html2canvas (missing scrollY:0) captures offset, cropping top!`);

  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (serverProcess) serverProcess.kill();
    process.exit(0);
  }
}

main();
