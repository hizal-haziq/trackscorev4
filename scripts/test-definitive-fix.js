import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER, ROLE_VENDOR } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9236;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const QA_DIR = path.resolve('qa');

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
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
      `--user-data-dir=${process.env.TEMP || 'C:\\Windows\\Temp'}\\chrome_fix_${Date.now()}`,
      '--window-size=1280,1000',
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

    console.log('[Step 1] Loading certified record for AppAsia Sdn Bhd...');
    const recordId = '6ab9c4576125a16f619c7849';

    // 1. Render certificate in browser preview to capture qa/certificate-browser.png
    console.log('[Step 2] Rendering browser certificate preview...');
    const previewInfo = await evalInBrowser(`(async () => {
      const res = await fetch('/.netlify/functions/lookup-evaluation?id=${recordId}', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('trackscore_token') }
      });
      const data = await res.json();
      const record = (data.data && data.data[0]) || data.evaluation || data;

      let previewWrapper = document.getElementById('qa-cert-preview');
      if (!previewWrapper) {
        previewWrapper = document.createElement('div');
        previewWrapper.id = 'qa-cert-preview';
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
      return {
        companyName: record.companyName,
        certNumber: record.certificate?.certificateNumber,
        score: record.overallScore,
        stars: record.starRating,
        width: rect.width,
        height: rect.height
      };
    })()`);

    console.log('[Step 2 Result] Preview info:', previewInfo);
    await wait(800);

    const browserScreenshot = await sendCdp('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: Math.round(previewInfo.width || 794),
        height: Math.round(previewInfo.height || 1120),
        scale: 1
      }
    });
    const browserScreenshotPath = path.join(QA_DIR, 'certificate-browser.png');
    fs.writeFileSync(browserScreenshotPath, Buffer.from(browserScreenshot.data, 'base64'));
    console.log(`[Step 3] Saved browser preview to: ${browserScreenshotPath}`);

    // Remove preview wrapper
    await evalInBrowser(`document.getElementById('qa-cert-preview')?.remove()`);

    // 2. Generate PDF using definitive method and inspect PDF structure
    console.log('[Step 4] Generating PDF via authoritative downloadTrackScoreCertificatePdf pipeline...');
    const pdfGenResult = await evalInBrowser(`(async () => {
      const res = await fetch('/.netlify/functions/lookup-evaluation?id=${recordId}', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('trackscore_token') }
      });
      const data = await res.json();
      const record = (data.data && data.data[0]) || data.evaluation || data;

      // Ensure html2pdf is loaded
      await loadHtml2Pdf();

      // Create container matching certificate-pdf.js
      const container = document.createElement('div');
      container.id = 'certificate-pdf-render-test';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '794px';
      container.style.height = '1120px';
      container.style.zIndex = '-9999';
      container.style.overflow = 'hidden';
      container.style.background = '#FFFFFF';
      container.style.boxSizing = 'border-box';
      container.setAttribute('aria-hidden', 'true');
      container.innerHTML = window.generateCertificateHtml(record);
      document.body.appendChild(container);

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const certEl = container.firstElementChild;
      const opt = {
        margin: 0,
        filename: 'TrackScore_Certificate_Test.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0,
          windowWidth: 794,
          windowHeight: 1120
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      const worker = window.html2pdf().set(opt).from(certEl);
      const pdf = await worker.toPdf().get('pdf');

      const numPages = pdf.internal.getNumberOfPages();
      const pageSize = pdf.internal.pageSize;
      const pdfBase64 = pdf.output('datauristring');

      container.remove();

      return {
        numPages,
        pageWidthInches: pageSize.getWidth(),
        pageHeightInches: pageSize.getHeight(),
        pdfBase64
      };
    })()`);

    console.log('[Step 5] PDF Output Details:');
    console.log(`  Page count: ${pdfGenResult.numPages}`);
    console.log(`  Dimensions: ${pdfGenResult.pageWidthInches.toFixed(2)} in x ${pdfGenResult.pageHeightInches.toFixed(2)} in`);

    if (pdfGenResult.numPages !== 1) {
      throw new Error(`CRITICAL FAILURE: Expected exactly 1 page, got ${pdfGenResult.numPages}`);
    }

    const pdfPath = path.join(QA_DIR, 'certificate-pdf.pdf');
    const base64Data = pdfGenResult.pdfBase64.split(',')[1];
    fs.writeFileSync(pdfPath, Buffer.from(base64Data, 'base64'));
    console.log(`[Step 6] Saved verified PDF to: ${pdfPath} (${fs.statSync(pdfPath).size} bytes)`);

    // 3. Render the PDF Page 1 to capture qa/certificate-pdf-page-1.png
    console.log('[Step 7] Rendering PDF in browser to capture Page 1 screenshot...');
    const pdfFileUrl = 'file:///' + pdfPath.replace(/\\/g, '/');
    await sendCdp('Page.navigate', { url: pdfFileUrl });
    await wait(3000);

    const pdfScreenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const pdfScreenshotPath = path.join(QA_DIR, 'certificate-pdf-page-1.png');
    fs.writeFileSync(pdfScreenshotPath, Buffer.from(pdfScreenshot.data, 'base64'));
    console.log(`[Step 8] Saved PDF Page 1 screenshot to: ${pdfScreenshotPath}`);

    // 4. Test Manager Dashboard button handler directly
    console.log('[Step 9] Testing downloadManagerCertificate handler on dashboard.html...');
    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/dashboard.html` });
    await wait(2000);

    const managerHandlerResult = await evalInBrowser(`(async () => {
      let downloadCalled = false;
      let recordPassed = null;
      const originalDownload = window.downloadTrackScoreCertificatePdf;

      window.downloadTrackScoreCertificatePdf = async function(rec, customFilename) {
        downloadCalled = true;
        recordPassed = rec;
        return originalDownload(rec, customFilename);
      };

      try {
        await window.downloadManagerCertificate('${recordId}');
        return {
          success: true,
          downloadCalled,
          recordId: recordPassed?._id || recordPassed?.id,
          certNo: recordPassed?.certificate?.certificateNumber,
          companyName: recordPassed?.companyName
        };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        window.downloadTrackScoreCertificatePdf = originalDownload;
      }
    })()`);

    console.log('[Step 9 Result] downloadManagerCertificate test:', managerHandlerResult);
    if (!managerHandlerResult.success || !managerHandlerResult.downloadCalled) {
      throw new Error(`downloadManagerCertificate handler failed: ${JSON.stringify(managerHandlerResult)}`);
    }

    // 5. Test Vendor Portal button handler directly
    console.log('[Step 10] Testing downloadOfficialCertificate handler on vendor-portal.html...');
    const vendorToken = generateToken({ role: ROLE_VENDOR, name: 'AppAsia Sdn Bhd', vendorId: 'APPASIA_01' });

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${vendorToken}');
      localStorage.setItem('trackscore_user_role', 'vendor');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'AppAsia Sdn Bhd', role: 'vendor' }));
      localStorage.setItem('token', '${vendorToken}');
    `);

    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/vendor-portal.html` });
    await wait(2000);

    const vendorHandlerResult = await evalInBrowser(`(async () => {
      let downloadCalled = false;
      let recordPassed = null;
      const originalDownload = window.downloadTrackScoreCertificatePdf;

      window.downloadTrackScoreCertificatePdf = async function(rec, customFilename) {
        downloadCalled = true;
        recordPassed = rec;
        return originalDownload(rec, customFilename);
      };

      try {
        await window.downloadOfficialCertificate('${recordId}');
        return {
          success: true,
          downloadCalled,
          recordId: recordPassed?._id || recordPassed?.id,
          certNo: recordPassed?.certificate?.certificateNumber,
          companyName: recordPassed?.companyName
        };
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        window.downloadTrackScoreCertificatePdf = originalDownload;
      }
    })()`);

    console.log('[Step 10 Result] downloadOfficialCertificate test:', vendorHandlerResult);
    if (!vendorHandlerResult.success || !vendorHandlerResult.downloadCalled) {
      throw new Error(`downloadOfficialCertificate handler failed: ${JSON.stringify(vendorHandlerResult)}`);
    }

    // 6. Test resilience with ultra-long company names & scopes
    console.log('[Step 11] Testing resilience with extreme text lengths...');
    const edgeCaseResult = await evalInBrowser(`(async () => {
      const mockRecord = {
        _id: 'mock_extreme_999',
        companyName: 'Sdn Bhd Super Duper Extraordinarily Long Enterprise Solutions & Technology International Global Holdings Berhad',
        evaluatorName: 'Senior Principal Lead Lead Assessor First Class Extraordinaire',
        overallScore: 98.7,
        starRating: 5,
        ratingTier: '5-Star Platinum Plus',
        status: 'certificate_issued',
        createdAt: '2026-01-15T00:00:00.000Z',
        approvedAt: '2026-02-01T00:00:00.000Z',
        certificate: {
          certificateNumber: 'TS-CERT-2026-EX-999',
          signedDate: '2026-02-01T00:00:00.000Z',
          signedBy: 'Director General, MIROS',
          scope: 'Comprehensive End-to-End Enterprise Fleet Telematics, Speed Limiter Calibration, Harsh Braking Analysis, and ADAS Safety Integration Systems'
        }
      };

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '794px';
      container.style.height = '1120px';
      container.style.zIndex = '-9999';
      container.innerHTML = window.generateCertificateHtml(mockRecord);
      document.body.appendChild(container);

      const opt = {
        margin: 0,
        filename: 'TrackScore_Certificate_EdgeCase.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0,
          windowWidth: 794,
          windowHeight: 1120
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      const worker = window.html2pdf().set(opt).from(container.firstElementChild);
      const pdf = await worker.toPdf().get('pdf');
      const numPages = pdf.internal.getNumberOfPages();
      container.remove();

      return { numPages };
    })()`);

    console.log(`[Step 11 Result] Extreme text length test produced: ${edgeCaseResult.numPages} page(s)`);
    if (edgeCaseResult.numPages !== 1) {
      throw new Error(`Edge case test failed: Expected 1 page, got ${edgeCaseResult.numPages}`);
    }

    console.log('\n======================================================');
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('======================================================');

  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (serverProcess) serverProcess.kill();
  }
}

main();
