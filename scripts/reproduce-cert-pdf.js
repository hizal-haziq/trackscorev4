import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const PORT = 3000;
const CDP_PORT = 9224;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
    if (check.ok) {
      console.log(`[Setup] TrackScore server is already UP on port ${PORT}!`);
      return;
    }
  } catch (e) {}

  console.log(`[Setup] Starting TrackScore server on port ${PORT}...`);
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
      if (check.ok) {
        console.log(`[Setup] Server is ready on port ${PORT}!`);
        return;
      }
    } catch (e) {}
  }
  throw new Error('Failed to start TrackScore server');
}

async function launchChrome() {
  console.log('[Setup] Launching Chrome...');
  chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,800',
    'about:blank'
  ]);

  for (let i = 0; i < 20; i++) {
    await wait(500);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        console.log('[Setup] Chrome CDP ready:', data.webSocketDebuggerUrl);
        return data.webSocketDebuggerUrl;
      }
    } catch (e) {}
  }
  throw new Error('Failed to connect to Chrome CDP');
}

async function run() {
  try {
    await startServerIfNeeded();
    const wsUrl = await launchChrome();

    ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.id && pendingRequests.has(data.id)) {
        const { resolve, reject } = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    });

    // Create target page
    const target = await sendCdp('Target.createTarget', { url: `http://localhost:${PORT}/dashboard.html` });
    const targetWsUrl = `ws://127.0.0.1:${CDP_PORT}/devtools/page/${target.targetId}`;
    
    ws.close();
    ws = new WebSocket(targetWsUrl);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

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

    console.log('[Page] Setting manager auth tokens...');
    const { generateToken, ROLE_MANAGER } = await import('../netlify/functions/auth.js');
    const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Audit Manager', username: 'manager@trackscore.my' });

    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/login.html` });
    await wait(1000);

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${managerToken}');
      localStorage.setItem('trackscore_user_role', 'manager');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Audit Manager', role: 'manager' }));
      localStorage.setItem('token', '${managerToken}');
    `);

    console.log('[Page] Navigating to dashboard...');
    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/dashboard.html` });
    await wait(2500);

    // Check if html2pdf and generateCertificateHtml are available
    const checkLibs = await evalInBrowser(`({
      hasGenerateCert: typeof window.generateCertificateHtml === 'function',
      hasLoadHtml2Pdf: typeof loadHtml2Pdf === 'function'
    })`);
    console.log('[Check Libs]', checkLibs);

    // Let's create a test record with certificate info
    const testRecord = {
      _id: '6ab9c4576125a16f619c7849',
      companyName: 'AppAsia Sdn Bhd',
      deviceModel: 'FleetTrack 4G Pro Model X',
      packageName: 'Comprehensive Telematics Safety Evaluation',
      totalScore: 4.85,
      starsCount: 5,
      ratingLabel: '5 Stars - Platinum Safety Accredited',
      certificate: {
        certificateNumber: 'TS-CERT-2026-7849',
        signedBy: 'Datuk Ir. Ts. Dr. Khairil Anwar Abu Kassim (Director General)',
        signedDate: '2026-09-28T00:00:00.000Z',
        preparedDate: '2026-09-25T00:00:00.000Z',
        printedDate: '2026-09-26T00:00:00.000Z',
        sentToCustomerDate: '2026-09-28T00:00:00.000Z',
        deliveryMethod: 'Official Email & Courier'
      }
    };

    console.log('[Test] Simulating certificate generation and PDF output...');
    const result = await evalInBrowser(`(async () => {
      await loadHtml2Pdf();
      const record = ${JSON.stringify(testRecord)};
      
      // Let's see what dashboard.html currently does:
      const element = document.createElement('div');
      element.style.position = 'fixed';
      element.style.left = '-100000px';
      element.style.top = '0';
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = window.generateCertificateHtml(record);
      document.body.appendChild(element);

      const certEl = element.firstElementChild;
      const rect = certEl.getBoundingClientRect();
      const scrollHeight = certEl.scrollHeight;
      const clientHeight = certEl.clientHeight;
      const offsetHeight = certEl.offsetHeight;

      // Now run html2pdf exactly as currently configured in dashboard.html:
      const worker = window.html2pdf().set({
        margin: 0,
        filename: 'test-cert.pdf',
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
        rect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
        scrollHeight,
        clientHeight,
        offsetHeight,
        numPages,
        pageWidth: pageSize.getWidth(),
        pageHeight: pageSize.getHeight(),
        pdfBase64Length: pdfBase64.length,
        pdfBase64Prefix: pdfBase64.substring(0, 100),
        pdfDataUri: pdfBase64
      };
    })()`);

    console.log('[Result]', {
      rect: result.rect,
      scrollHeight: result.scrollHeight,
      clientHeight: result.clientHeight,
      offsetHeight: result.offsetHeight,
      numPages: result.numPages,
      pageWidth: result.pageWidth,
      pageHeight: result.pageHeight,
      pdfBase64Length: result.pdfBase64Length
    });

    // Save the PDF
    const base64Data = result.pdfDataUri.split(',')[1];
    fs.writeFileSync('reproduced_cert.pdf', Buffer.from(base64Data, 'base64'));
    console.log('[Saved] reproduced_cert.pdf saved successfully! Size:', fs.statSync('reproduced_cert.pdf').size, 'bytes');

  } catch (err) {
    console.error('Error in reproduce script:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (serverProcess) serverProcess.kill();
    process.exit(0);
  }
}

run();
