import { spawn } from 'child_process';
import fs from 'fs';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9228;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

async function testSinglePageA4() {
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

    const testCases = [
      {
        name: 'Standard Company',
        company: 'AppAsia Sdn Bhd',
        device: 'FleetTrack 4G Pro Model X',
        certNo: 'TS-CERT-2026-7849',
        score: '4.85',
        stars: 5,
        rating: '5 Stars - Platinum Safety Accredited',
        signedBy: 'Datuk Ir. Ts. Dr. Khairil Anwar Abu Kassim (Director General)',
        signedDate: '2026-09-28T00:00:00.000Z'
      },
      {
        name: 'Very Long Company Name',
        company: 'Aegis Drive Commercial Fleet Telemetry & Safety Solutions (Malaysia) Sdn. Bhd.',
        device: 'Sentinel-V3 Enterprise Multi-Sensor Fleet Telematics Gateway Extended Edition',
        certNo: 'TS-CERT-2026-7101',
        score: '4.92',
        stars: 5,
        rating: '5 Stars - Platinum Safety Accredited',
        signedBy: 'Prof. Dr. Wong Shaw Voon (Chairman, MIROS Board of Directors)',
        signedDate: '2026-09-29T00:00:00.000Z'
      }
    ];

    for (const tc of testCases) {
      console.log(`\nTesting: ${tc.name}...`);
      const res = await evalInBrowser(`(async () => {
        await loadHtml2Pdf();

        // Build a balanced single-page A4 certificate container
        const certHtml = \`
          <div id="trackscore-certificate-document" style="
            width: 794px;
            height: 1123px;
            max-height: 1123px;
            box-sizing: border-box;
            padding: 24px;
            background: #F8FAFC;
            color: #0F172A;
            font-family: Arial, Helvetica, sans-serif;
            position: relative;
            overflow: hidden;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          ">
            <!-- OUTER FRAME -->
            <div style="
              width: 100%;
              height: 1075px;
              max-height: 1075px;
              box-sizing: border-box;
              background: #FFFFFF;
              border: 1px solid #CBD5E1;
              position: relative;
              overflow: hidden;
            ">
              <!-- TOP ACCENT BAR -->
              <div style="height: 6px; width: 100%; background: #F58220;"></div>

              <!-- DECORATIVE CORNERS -->
              <div style="position: absolute; top: 22px; left: 22px; width: 45px; height: 45px; border-top: 3px solid #F58220; border-left: 3px solid #F58220;"></div>
              <div style="position: absolute; top: 22px; right: 22px; width: 45px; height: 45px; border-top: 3px solid #F58220; border-right: 3px solid #F58220;"></div>
              <div style="position: absolute; bottom: 22px; left: 22px; width: 45px; height: 45px; border-bottom: 3px solid #F58220; border-left: 3px solid #F58220;"></div>
              <div style="position: absolute; bottom: 22px; right: 22px; width: 45px; height: 45px; border-bottom: 3px solid #F58220; border-right: 3px solid #F58220;"></div>

              <!-- HEADER -->
              <div style="text-align: center; padding: 40px 60px 16px;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2.5px; color: #F58220; text-transform: uppercase;">
                  Malaysian Institute of Road Safety Research
                </div>
                <div style="font-size: 38px; font-weight: 900; letter-spacing: 4px; color: #0F172A; margin-top: 6px;">
                  MIROS
                </div>
                <div style="width: 60px; height: 3px; background: #F58220; margin: 10px auto;"></div>
                <div style="font-size: 10.5px; font-weight: 700; letter-spacing: 2px; color: #64748B; text-transform: uppercase;">
                  TrackScore Digital Evaluation System
                </div>
              </div>

              <!-- CERTIFICATE TITLE -->
              <div style="text-align: center; padding: 14px 60px 0;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 3.5px; color: #64748B; text-transform: uppercase;">
                  Official Certificate
                </div>
                <div style="font-size: 32px; font-weight: 900; letter-spacing: 1px; color: #0F172A; margin-top: 6px;">
                  CERTIFICATE OF EVALUATION
                </div>
                <div style="margin: 12px auto 0; display: inline-block; padding: 6px 20px; border: 1px solid #CBD5E1; background: #F8FAFC; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #475569;">
                  NO. ${tc.certNo}
                </div>
              </div>

              <!-- MAIN CERTIFICATION TEXT -->
              <div style="text-align: center; padding: 30px 60px 18px;">
                <div style="font-size: 15px; color: #64748B; letter-spacing: 0.3px;">
                  This is to certify that
                </div>
                <div style="font-size: 26px; font-weight: 900; color: #0F172A; margin: 10px 0 6px; line-height: 1.25;">
                  ${tc.company}
                </div>
                <div style="width: 80px; height: 2px; background: #F58220; margin: 10px auto 12px;"></div>
                <div style="font-size: 14px; color: #475569; line-height: 1.6;">
                  has successfully completed the official <strong style="color:#0F172A;">TrackScore</strong> telematics device evaluation for
                </div>
                <div style="font-size: 19px; font-weight: 800; color: #1E293B; margin-top: 8px;">
                  ${tc.device}
                </div>
              </div>

              <!-- SCORE SECTION -->
              <div style="margin: 6px 60px 22px; display: grid; grid-template-columns: 1.15fr 0.85fr; border: 1px solid #CBD5E1; background: #FFFFFF;">
                <!-- SCORE -->
                <div style="padding: 16px 20px; border-right: 1px solid #E2E8F0;">
                  <div style="font-size: 9.5px; font-weight: 800; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase;">
                    Evaluation Score
                  </div>
                  <div style="margin-top: 6px; font-size: 26px; font-weight: 900; color: #0F172A;">
                    ${tc.score} <span style="font-size: 13px; color: #94A3B8; font-weight: 600;">/ 5.00</span>
                  </div>
                  <div style="margin-top: 4px; font-size: 18px; letter-spacing: 2.5px; color: #F58220;">
                    ${'★'.repeat(tc.stars)}
                  </div>
                </div>

                <!-- RATING -->
                <div style="padding: 16px 20px;">
                  <div style="font-size: 9.5px; font-weight: 800; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase;">
                    Evaluation Rating
                  </div>
                  <div style="margin-top: 6px; font-size: 16px; font-weight: 900; color: #166534;">
                    ${tc.rating}
                  </div>
                  <div style="margin-top: 6px; font-size: 10.5px; color: #64748B;">Issued</div>
                  <div style="margin-top: 2px; font-size: 11px; font-weight: 700; color: #334155;">28 September 2026</div>
                </div>
              </div>

              <!-- DESCRIPTION -->
              <div style="margin: 0 65px; padding: 0 0 20px; text-align: center;">
                <div style="font-size: 10.5px; line-height: 1.6; color: #64748B;">
                  This certificate records the official TrackScore evaluation outcome and is issued subject to verification and endorsement by the Director General Office (DGO).
                </div>
              </div>

              <!-- SIGNATURE & RECORD & QR SECTION -->
              <div style="margin: 0 60px; padding-top: 18px; border-top: 1px solid #CBD5E1; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 30px;">
                <!-- SIGNATURE -->
                <div>
                  <div style="height: 38px; border-bottom: 1px solid #475569; margin-bottom: 8px;"></div>
                  <div style="font-size: 12px; font-weight: 900; color: #0F172A;">
                    ${tc.signedBy}
                  </div>
                  <div style="margin-top: 2px; font-size: 10.5px; font-weight: 600; color: #64748B;">
                    Director General Office (DGO)
                  </div>
                  <div style="margin-top: 4px; font-size: 9.5px; color: #94A3B8;">
                    Signed: 28 September 2026
                  </div>
                </div>

                <!-- RECORD & VERIFICATION -->
                <div>
                  <div style="font-size: 9.5px; font-weight: 800; color: #64748B; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 8px;">
                    Certificate Record & Verification
                  </div>
                  <div style="display: grid; grid-template-columns: 60px 1fr; row-gap: 5px; font-size: 9.5px;">
                    <div style="color:#94A3B8;">Prepared</div>
                    <div style="font-weight:700;color:#334155;">25 September 2026</div>
                    <div style="color:#94A3B8;">Printed</div>
                    <div style="font-weight:700;color:#334155;">26 September 2026</div>
                    <div style="color:#94A3B8;">Status</div>
                    <div style="font-weight:700;color:#166534;">Verified & Endorsed</div>
                    <div style="color:#94A3B8;">Registry</div>
                    <div style="font-weight:700;color:#0284C7;">MIROS Official Directory</div>
                  </div>
                </div>
              </div>

              <!-- FOOTER -->
              <div style="
                position: absolute;
                left: 60px;
                right: 60px;
                bottom: 22px;
                padding-top: 8px;
                border-top: 1px solid #E2E8F0;
                text-align: center;
                font-size: 8px;
                letter-spacing: 1px;
                color: #94A3B8;
                text-transform: uppercase;
              ">
                TrackScore Digital Assessor Matrix &nbsp; • &nbsp; Official MIROS Verification Record
              </div>
            </div>
          </div>
        \`;

        // Render into hidden container
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '794px';
        container.style.height = '1123px';
        container.style.zIndex = '-9999';
        container.style.overflow = 'hidden';
        container.style.background = '#FFFFFF';
        container.style.boxSizing = 'border-box';
        container.innerHTML = certHtml;

        document.body.appendChild(container);
        const certEl = container.firstElementChild;
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

      console.log(`[Result for ${tc.name}]:`, {
        measuredWidth: res.measuredWidth,
        measuredHeight: res.measuredHeight,
        numPages: res.numPages,
        pageWidth: res.pageWidth,
        pageHeight: res.pageHeight,
        pdfBase64Length: res.pdfBase64Length
      });

      const safeName = tc.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const base64Data = res.pdfDataUri.split(',')[1];
      fs.writeFileSync(`cert_single_page_${safeName}.pdf`, Buffer.from(base64Data, 'base64'));
      console.log(`Saved cert_single_page_${safeName}.pdf! Size:`, fs.statSync(`cert_single_page_${safeName}.pdf`).size, 'bytes');
    }

  } catch (err) {
    console.error('Error in testSinglePageA4:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    process.exit(0);
  }
}

testSinglePageA4();

