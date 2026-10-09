import { spawn } from 'child_process';
import fs from 'fs';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9227;
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

async function testCertPipeline() {
  try {
    chromeProcess = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      `--user-data-dir=${process.env.TEMP || 'C:\\Windows\\Temp'}\\chrome_test_${Date.now()}`,
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

    const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager', username: 'manager@trackscore.my' });

    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/login.html` });
    await wait(1000);

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${managerToken}');
      localStorage.setItem('trackscore_user_role', 'manager');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Lead Manager', role: 'manager' }));
      localStorage.setItem('token', '${managerToken}');
    `);

    await sendCdp('Page.navigate', { url: `http://localhost:${PORT}/dashboard.html` });
    await wait(3000);

    // Scroll the dashboard down by 400px to simulate user scrolling down before clicking Download
    await evalInBrowser(`window.scrollTo(0, 450);`);
    const scrollY = await evalInBrowser(`window.scrollY`);
    console.log('[Test] Simulated page scrollY:', scrollY);

    const testRecords = [
      {
        name: 'Standard Company',
        record: {
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
            deliveryMethod: 'Official Email & Physical Courier'
          }
        }
      },
      {
        name: 'Long Company Name',
        record: {
          _id: '6ab9d0cba521994daba77101',
          companyName: 'Aegis Drive Commercial Fleet Telemetry & Safety Solutions (Malaysia) Sdn. Bhd.',
          deviceModel: 'Sentinel-V3 Enterprise Multi-Sensor Fleet Telematics Gateway',
          packageName: 'Enterprise Full Safety Assessment & Telematics Certification Package',
          totalScore: 4.92,
          starsCount: 5,
          ratingLabel: '5 Stars - Platinum Safety Accredited',
          certificate: {
            certificateNumber: 'TS-CERT-2026-7101',
            signedBy: 'Prof. Dr. Wong Shaw Voon (Chairman, MIROS Board of Directors)',
            signedDate: '2026-09-29T00:00:00.000Z',
            preparedDate: '2026-09-26T00:00:00.000Z',
            printedDate: '2026-09-27T00:00:00.000Z',
            sentToCustomerDate: '2026-09-29T00:00:00.000Z',
            deliveryMethod: 'Registered Diplomatic Courier & Official Digital Registry'
          }
        }
      }
    ];

    for (const testCase of testRecords) {
      console.log(`\n=== Testing Certificate: ${testCase.name} ===`);

      const result = await evalInBrowser(`(async () => {
        await loadHtml2Pdf();
        const record = ${JSON.stringify(testCase.record)};
        
        // Render into a clean render container using the working report PDF methodology
        const container = document.createElement('div');
        container.id = 'certificate-pdf-render-target';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '794px';
        container.style.height = '1123px';
        container.style.zIndex = '-9999';
        container.style.overflow = 'hidden';
        container.style.background = '#FFFFFF';
        container.style.boxSizing = 'border-box';
        container.innerHTML = window.generateCertificateHtml(record);

        document.body.appendChild(container);

        const certEl = container.firstElementChild;
        certEl.style.boxSizing = 'border-box';

        const rect = certEl.getBoundingClientRect();

        // Exact proven Report PDF options adapted for Certificate
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
            windowHeight: 1123
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
          measuredWidth: rect.width,
          measuredHeight: rect.height,
          numPages,
          pageWidth: pageSize.getWidth(),
          pageHeight: pageSize.getHeight(),
          pdfBase64Length: pdfBase64.length,
          pdfDataUri: pdfBase64
        };
      })()`);

      console.log('[Result]', {
        measuredWidth: result.measuredWidth,
        measuredHeight: result.measuredHeight,
        numPages: result.numPages,
        pageWidth: result.pageWidth,
        pageHeight: result.pageHeight,
        pdfBase64Length: result.pdfBase64Length
      });

      const safeName = testCase.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const base64Data = result.pdfDataUri.split(',')[1];
      fs.writeFileSync(`cert_test_${safeName}.pdf`, Buffer.from(base64Data, 'base64'));
      console.log(`Saved cert_test_${safeName}.pdf! Size:`, fs.statSync(`cert_test_${safeName}.pdf`).size, 'bytes');
    }

  } catch (err) {
    console.error('Error in testCertPipeline:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    process.exit(0);
  }
}

testCertPipeline();

