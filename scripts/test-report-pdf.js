import { spawn } from 'child_process';
import fs from 'fs';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9226;
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

async function testReportPdf() {
  try {
    await startServerIfNeeded();

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
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const text = (data.params.args || []).map(a => a.value || a.description || '').join(' ');
        console.log('[Browser Console]', text);
      } else if (data.method === 'Runtime.exceptionThrown') {
        console.error('[Browser Exception]', data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text);
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
    await wait(3500);

    const debugInfo = await evalInBrowser(`({
      url: window.location.href,
      role: localStorage.getItem('trackscore_user_role'),
      token: Boolean(localStorage.getItem('trackscore_token')),
      hasViewEvalReport: typeof window.viewEvaluationReport,
      hasLoadHtml2Pdf: typeof window.loadHtml2Pdf
    })`);
    console.log('[Debug Info]:', debugInfo);
    const reportOpened = await evalInBrowser(`(async () => {
      await window.viewEvaluationReport('6ab9c4576125a16f619c7849');
      const modal = document.getElementById('report-modal');
      const wrapper = document.getElementById('report-document-wrapper');
      return {
        isModalActive: modal?.classList.contains('active'),
        hasContent: Boolean(wrapper?.innerHTML?.length > 100),
        contentLength: wrapper?.innerHTML?.length || 0,
        wrapperHeight: wrapper?.offsetHeight,
        wrapperWidth: wrapper?.offsetWidth
      };
    })()`);
    console.log('[Report Opened Result]:', reportOpened);

    console.log('[Test] Triggering download via #btn-download-pdf-modal click...');
    await wait(1000);
    const downloadStatus = await evalInBrowser(`(async () => {
      const btn = document.getElementById('btn-download-pdf-modal');
      if (!btn) return { error: 'No download button found' };
      btn.click();
      
      // Wait for generation to complete (isGeneratingReportPdf back to false)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const statusBadge = document.getElementById('report-status-badge')?.textContent;
        const btnText = document.getElementById('btn-download-modal-text')?.textContent;
        if (statusBadge?.includes('downloaded') || btnText?.includes('Download')) {
          return { success: true, statusBadge, btnText };
        }
      }
      return { timeout: true, statusBadge: document.getElementById('report-status-badge')?.textContent };
    })()`);
    console.log('[Download Status]:', downloadStatus);

    console.log('[Test] Testing report PDF compilation with exact report options...');
    const pdfResult = await evalInBrowser(`(async () => {
      await loadHtml2Pdf();
      const element = document.getElementById('report-document-wrapper');
      
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: "TrackScore_Evaluation_Report_Test.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          scrollY: 0,
          windowHeight: element ? element.scrollHeight : undefined
        },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      const worker = window.html2pdf().set(opt).from(element);
      const pdf = await worker.toPdf().get('pdf');
      const numPages = pdf.internal.getNumberOfPages();
      const pageSize = pdf.internal.pageSize;
      const pdfBase64 = pdf.output('datauristring');

      return {
        numPages,
        pageWidth: pageSize.getWidth(),
        pageHeight: pageSize.getHeight(),
        pdfBase64Length: pdfBase64.length,
        pdfDataUri: pdfBase64
      };
    })()`);

    console.log('[Report PDF Result]', {
      numPages: pdfResult.numPages,
      pageWidth: pdfResult.pageWidth,
      pageHeight: pdfResult.pageHeight,
      pdfBase64Length: pdfResult.pdfBase64Length
    });

    const base64Data = pdfResult.pdfDataUri.split(',')[1];
    fs.writeFileSync('tested_report.pdf', Buffer.from(base64Data, 'base64'));
    console.log('[Saved] tested_report.pdf saved! Size:', fs.statSync('tested_report.pdf').size, 'bytes');

  } catch (err) {
    console.error('Error testing report PDF:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (serverProcess) serverProcess.kill();
    process.exit(0);
  }
}

testReportPdf();
