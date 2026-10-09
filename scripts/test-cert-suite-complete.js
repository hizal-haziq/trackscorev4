import { spawn } from 'child_process';
import fs from 'fs';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9232;
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

// Standalone QR code generator function string to inject
const qrCodeGeneratorSource = `
function generateQrSvg(text, cellSize = 2) {
  const PAD0 = 0xEC;
  const PAD1 = 0x11;
  const RS_BLOCK_TABLE = [
    [1, 26, 19], [1, 26, 16],
    [1, 44, 34], [1, 44, 28],
    [1, 70, 55], [1, 70, 44],
    [1, 100, 80], [2, 50, 32],
    [1, 134, 108], [2, 67, 43],
    [2, 86, 68], [4, 43, 27],
    [2, 98, 78], [4, 49, 31],
    [2, 121, 97], [2, 60, 38, 2, 61, 39],
    [2, 146, 116], [3, 58, 36, 2, 59, 37],
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44]
  ];
  const QRMath = {
    glog: (n) => { if (n < 1) throw new Error("glog"); return QRMath.LOG_TABLE[n]; },
    gexp: (n) => { while (n < 0) n += 255; while (n >= 255) n -= 255; return QRMath.EXP_TABLE[n]; },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };
  for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

  function polynomial(num, shift) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    const _num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) _num[i] = num[i + offset];
    return {
      get: (i) => _num[i],
      getLength: () => _num.length,
      multiply: (e) => {
        const res = new Array(_num.length + e.getLength() - 1).fill(0);
        for (let i = 0; i < _num.length; i++) {
          for (let j = 0; j < e.getLength(); j++) {
            res[i + j] ^= QRMath.gexp(QRMath.glog(_num[i]) + QRMath.glog(e.get(j)));
          }
        }
        return polynomial(res, 0);
      },
      mod: (e) => {
        if (_num.length - e.getLength() < 0) return polynomial(_num, 0);
        const ratio = QRMath.glog(_num[0]) - QRMath.glog(e.get(0));
        const numCopy = [..._num];
        for (let i = 0; i < e.getLength(); i++) {
          numCopy[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        }
        return polynomial(numCopy, 0).mod(e);
      }
    };
  }

  function createBuffer() {
    const buffer = [];
    let length = 0;
    return {
      put: (num, len) => {
        for (let i = 0; i < len; i++) {
          const bit = ((num >>> (len - i - 1)) & 1) === 1;
          if (length === buffer.length * 8) buffer.push(0);
          if (bit) buffer[buffer.length - 1] |= (0x80 >>> (length % 8));
          length++;
        }
      },
      getLengthInBits: () => length,
      getBuffer: () => buffer
    };
  }

  const len = text.length;
  let type = 4;
  if (len > 55) type = 6;
  if (len > 95) type = 8;
  if (len > 140) type = 10;

  const rawBlocks = RS_BLOCK_TABLE[((type - 1) * 2)];
  const rsBlocks = [];
  for (let i = 0; i < rawBlocks.length; i += 3) {
    for (let j = 0; j < rawBlocks[i]; j++) {
      rsBlocks.push({ totalCount: rawBlocks[i + 1], dataCount: rawBlocks[i + 2] });
    }
  }

  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }

  const buffer = createBuffer();
  buffer.put(4, 4);
  buffer.put(bytes.length, 8);
  for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

  let totalDataCount = 0;
  for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 !== 0) buffer.put(0, 1);
  while (buffer.getLengthInBits() < totalDataCount * 8) {
    buffer.put(PAD0, 8);
    if (buffer.getLengthInBits() < totalDataCount * 8) buffer.put(PAD1, 8);
  }

  let offset = 0;
  let maxDcCount = 0;
  let maxEcCount = 0;
  const dcdata = new Array(rsBlocks.length);
  const ecdata = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount;
    const ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
    offset += dcCount;

    let rsPoly = polynomial([1], 0);
    for (let i = 0; i < ecCount; i++) rsPoly = rsPoly.multiply(polynomial([1, QRMath.gexp(i)], 0));
    const rawPoly = polynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i++) {
      const modIndex = i + modPoly.getLength() - ecdata[r].length;
      ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
    }
  }

  const finalData = [];
  for (let i = 0; i < maxDcCount; i++) {
    for (let r = 0; r < rsBlocks.length; r++) {
      if (i < dcdata[r].length) finalData.push(dcdata[r][i]);
    }
  }
  for (let i = 0; i < maxEcCount; i++) {
    for (let r = 0; r < rsBlocks.length; r++) {
      if (i < ecdata[r].length) finalData.push(ecdata[r][i]);
    }
  }

  const moduleCount = type * 4 + 17;
  const modules = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(null));

  function setPos(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || moduleCount <= col + c) continue;
        modules[row + r][col + c] = ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4));
      }
    }
  }
  setPos(0, 0);
  setPos(moduleCount - 7, 0);
  setPos(0, moduleCount - 7);

  const patternPositions = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]][type] || [];
  for (let i = 0; i < patternPositions.length; i++) {
    for (let j = 0; j < patternPositions.length; j++) {
      const row = patternPositions[i];
      const col = patternPositions[j];
      if (modules[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
        }
      }
    }
  }

  for (let r = 8; r < moduleCount - 8; r++) {
    if (modules[r][6] === null) modules[r][6] = (r % 2 === 0);
  }
  for (let c = 8; c < moduleCount - 8; c++) {
    if (modules[6][c] === null) modules[6][c] = (c % 2 === 0);
  }

  // Type info (EC L=1, mask=0)
  const d = 0x77c4; // (1 << 3 | 0) encoded with BCH and XOR mask
  for (let i = 0; i < 15; i++) {
    const mod = ((d >> i) & 1) === 1;
    if (i < 6) modules[i][8] = mod;
    else if (i < 8) modules[i + 1][8] = mod;
    else modules[moduleCount - 15 + i][8] = mod;
    if (i < 8) modules[8][moduleCount - i - 1] = mod;
    else if (i < 9) modules[8][15 - i] = mod;
    else modules[8][15 - i - 1] = mod;
  }
  modules[moduleCount - 8][8] = true;

  let inc = -1;
  let row = moduleCount - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = moduleCount - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        if (modules[row][col - c] === null) {
          let dark = false;
          if (byteIndex < finalData.length) {
            dark = (((finalData[byteIndex] >>> bitIndex) & 1) === 1);
          }
          if ((row + (col - c)) % 2 === 0) dark = !dark; // mask 0: (row + col) % 2 === 0
          modules[row][col - c] = dark;
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || moduleCount <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }

  const margin = 3;
  const size = moduleCount * cellSize + margin * 2;
  let rects = "";
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (modules[r][c]) {
        rects += '<rect x="' + (c * cellSize + margin) + '" y="' + (r * cellSize + margin) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#0F172A"/>';
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="100%" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#FFFFFF"/>' + rects + '</svg>';
}
`;

async function run() {
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

    // Inject the QR code generator function into the page
    await evalInBrowser(qrCodeGeneratorSource);

    // Now test building the complete, pixel-perfect single-page A4 certificate
    const testCases = [
      {
        id: 'cert_suite_standard',
        name: 'Standard Certificate (1920x1080, scrollY=0)',
        viewport: [1920, 1080],
        scrollY: 0,
        record: {
          _id: '6ab9c4576125a16f619c7849',
          companyName: 'AppAsia Sdn Bhd',
          deviceModel: 'FleetTrack 4G Pro Model X',
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
        }
      },
      {
        id: 'cert_suite_long_company',
        name: 'Very Long Company Name (1366x768, scrollY=600)',
        viewport: [1366, 768],
        scrollY: 600,
        record: {
          _id: '6ab9d0cba521994daba77101',
          companyName: 'Aegis Drive Commercial Fleet Telemetry & Safety Solutions (Malaysia) Sdn. Bhd.',
          deviceModel: 'Sentinel-V3 Enterprise Multi-Sensor Fleet Telematics Gateway',
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
            deliveryMethod: 'Registered Courier'
          }
        }
      },
      {
        id: 'cert_suite_compact_laptop',
        name: 'Compact Laptop Viewport (1024x768, scrollY=350)',
        viewport: [1024, 768],
        scrollY: 350,
        record: {
          _id: '6ab9b9e8626271fe398e838e',
          companyName: 'Astro Sdn Bhd',
          deviceModel: 'ASTRO-NAV 2026',
          totalScore: 4.60,
          starsCount: 5,
          ratingLabel: '5 Stars - Gold Safety Accredited',
          certificate: {
            certificateNumber: 'TS-CERT-2026-838E',
            signedBy: 'Lead Assessor / DGO Representative',
            signedDate: '2026-09-28T00:00:00.000Z',
            preparedDate: '2026-09-26T00:00:00.000Z',
            printedDate: '2026-09-27T00:00:00.000Z',
            sentToCustomerDate: '2026-09-28T00:00:00.000Z',
            deliveryMethod: 'Physical Handover'
          }
        }
      }
    ];

    for (const tc of testCases) {
      console.log(`\nTesting: ${tc.name}...`);
      await sendCdp('Emulation.setDeviceMetricsOverride', {
        width: tc.viewport[0],
        height: tc.viewport[1],
        deviceScaleFactor: 1,
        mobile: false
      });

      await evalInBrowser(`window.scrollTo(0, ${tc.scrollY});`);
      const currentScrollY = await evalInBrowser(`window.scrollY`);

      const testResult = await evalInBrowser(`(async () => {
        await loadHtml2Pdf();
        const record = ${JSON.stringify(tc.record)};
        const certNo = record.certificate?.certificateNumber || 'TS-CERT-2026-0001';
        const verifyUrl = 'https://trackscore.my/verify-certificate.html?cert=' + encodeURIComponent(certNo);
        const qrSvg = generateQrSvg(verifyUrl, 2);

        const company = record.companyName || 'Telematics Customer';
        const companyFontSize = company.length > 60 ? '19px' : (company.length > 35 ? '22px' : '26px');

        const certHtml = \`
          <div id="trackscore-certificate-document" style="
            width: 794px;
            height: 1120px;
            max-height: 1120px;
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
              height: 1072px;
              max-height: 1072px;
              box-sizing: border-box;
              background: #FFFFFF;
              border: 1px solid #CBD5E1;
              position: relative;
              overflow: hidden;
            ">
              <!-- TOP ACCENT BAR -->
              <div style="height: 6px; width: 100%; background: #F58220;"></div>

              <!-- DECORATIVE CORNERS -->
              <div style="position: absolute; top: 20px; left: 20px; width: 45px; height: 45px; border-top: 3px solid #F58220; border-left: 3px solid #F58220;"></div>
              <div style="position: absolute; top: 20px; right: 20px; width: 45px; height: 45px; border-top: 3px solid #F58220; border-right: 3px solid #F58220;"></div>
              <div style="position: absolute; bottom: 20px; left: 20px; width: 45px; height: 45px; border-bottom: 3px solid #F58220; border-left: 3px solid #F58220;"></div>
              <div style="position: absolute; bottom: 20px; right: 20px; width: 45px; height: 45px; border-bottom: 3px solid #F58220; border-right: 3px solid #F58220;"></div>

              <!-- HEADER -->
              <div style="text-align: center; padding: 36px 60px 14px;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2.5px; color: #F58220; text-transform: uppercase;">
                  Malaysian Institute of Road Safety Research
                </div>
                <div style="font-size: 38px; font-weight: 900; letter-spacing: 4px; color: #0F172A; margin-top: 5px;">
                  MIROS
                </div>
                <div style="width: 60px; height: 3px; background: #F58220; margin: 9px auto;"></div>
                <div style="font-size: 10.5px; font-weight: 700; letter-spacing: 2px; color: #64748B; text-transform: uppercase;">
                  TrackScore Digital Evaluation System
                </div>
              </div>

              <!-- CERTIFICATE TITLE -->
              <div style="text-align: center; padding: 12px 60px 0;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 3.5px; color: #64748B; text-transform: uppercase;">
                  Official Certificate
                </div>
                <div style="font-size: 31px; font-weight: 900; letter-spacing: 1px; color: #0F172A; margin-top: 5px;">
                  CERTIFICATE OF EVALUATION
                </div>
                <div style="margin: 10px auto 0; display: inline-block; padding: 5px 18px; border: 1px solid #CBD5E1; background: #F8FAFC; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #475569;">
                  NO. \${certNo}
                </div>
              </div>

              <!-- MAIN CERTIFICATION TEXT -->
              <div style="text-align: center; padding: 26px 60px 16px;">
                <div style="font-size: 14.5px; color: #64748B; letter-spacing: 0.3px;">
                  This is to certify that
                </div>
                <div style="font-size: \${companyFontSize}; font-weight: 900; color: #0F172A; margin: 8px 0 6px; line-height: 1.25;">
                  \${company}
                </div>
                <div style="width: 80px; height: 2px; background: #F58220; margin: 9px auto 11px;"></div>
                <div style="font-size: 13.5px; color: #475569; line-height: 1.55;">
                  has successfully completed the official <strong style="color:#0F172A;">TrackScore</strong> telematics device evaluation for
                </div>
                <div style="font-size: 18px; font-weight: 800; color: #1E293B; margin-top: 7px;">
                  \${record.deviceModel || 'Fleet Telematics Gateway'}
                </div>
              </div>

              <!-- SCORE SECTION -->
              <div style="margin: 4px 60px 20px; display: grid; grid-template-columns: 1.15fr 0.85fr; border: 1px solid #CBD5E1; background: #FFFFFF;">
                <!-- SCORE -->
                <div style="padding: 14px 20px; border-right: 1px solid #E2E8F0;">
                  <div style="font-size: 9px; font-weight: 800; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase;">
                    Evaluation Score
                  </div>
                  <div style="margin-top: 5px; font-size: 25px; font-weight: 900; color: #0F172A;">
                    \${record.totalScore !== undefined ? Number(record.totalScore).toFixed(2) : '4.85'} <span style="font-size: 13px; color: #94A3B8; font-weight: 600;">/ 5.00</span>
                  </div>
                  <div style="margin-top: 3px; font-size: 17px; letter-spacing: 2.5px; color: #F58220;">
                    \${'★'.repeat(record.starsCount || 5)}
                  </div>
                </div>

                <!-- RATING -->
                <div style="padding: 14px 20px;">
                  <div style="font-size: 9px; font-weight: 800; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase;">
                    Evaluation Rating
                  </div>
                  <div style="margin-top: 5px; font-size: 15px; font-weight: 900; color: #166534;">
                    \${record.ratingLabel || '5 Stars - Platinum Safety Accredited'}
                  </div>
                  <div style="margin-top: 5px; font-size: 10px; color: #64748B;">Issued</div>
                  <div style="margin-top: 2px; font-size: 11px; font-weight: 700; color: #334155;">28 September 2026</div>
                </div>
              </div>

              <!-- DESCRIPTION -->
              <div style="margin: 0 65px; padding: 0 0 16px; text-align: center;">
                <div style="font-size: 10px; line-height: 1.55; color: #64748B;">
                  This certificate records the official TrackScore evaluation outcome and is issued subject to verification and endorsement by the Director General Office (DGO).
                </div>
              </div>

              <!-- SIGNATURE & RECORD & QR SECTION (3-PART BALANCED LAYOUT) -->
              <div style="margin: 0 60px; padding-top: 16px; border-top: 1px solid #CBD5E1; display: grid; grid-template-columns: 1.15fr 0.95fr 0.7fr; gap: 20px; align-items: start;">
                <!-- SIGNATURE -->
                <div>
                  <div style="height: 36px; border-bottom: 1px solid #475569; margin-bottom: 7px;"></div>
                  <div style="font-size: 11.5px; font-weight: 900; color: #0F172A; line-height: 1.25;">
                    \${record.certificate?.signedBy || 'Director General, MIROS'}
                  </div>
                  <div style="margin-top: 2px; font-size: 10px; font-weight: 600; color: #64748B;">
                    Director General Office (DGO)
                  </div>
                  <div style="margin-top: 3px; font-size: 9px; color: #94A3B8;">
                    Signed: 28 September 2026
                  </div>
                </div>

                <!-- RECORD -->
                <div>
                  <div style="font-size: 9px; font-weight: 800; color: #64748B; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 7px;">
                    Certificate Record
                  </div>
                  <div style="display: grid; grid-template-columns: 55px 1fr; row-gap: 4px; font-size: 9px;">
                    <div style="color:#94A3B8;">Prepared</div>
                    <div style="font-weight:700;color:#334155;">25 September 2026</div>
                    <div style="color:#94A3B8;">Printed</div>
                    <div style="font-weight:700;color:#334155;">26 September 2026</div>
                    <div style="color:#94A3B8;">Delivered</div>
                    <div style="font-weight:700;color:#334155;">28 September 2026</div>
                    <div style="color:#94A3B8;">Method</div>
                    <div style="font-weight:700;color:#334155;">\${record.certificate?.deliveryMethod || 'Official Email & Courier'}</div>
                  </div>
                </div>

                <!-- QR CODE VERIFICATION BOX -->
                <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                  <div style="width: 68px; height: 68px; padding: 3px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    \${qrSvg}
                  </div>
                  <div style="font-size: 7.5px; font-weight: 800; color: #F58220; margin-top: 3px; letter-spacing: 0.8px; text-transform: uppercase;">
                    Scan to Verify
                  </div>
                  <div style="font-size: 7px; color: #64748B;">
                    Official MIROS Registry
                  </div>
                </div>
              </div>

              <!-- FOOTER -->
              <div style="
                position: absolute;
                left: 60px;
                right: 60px;
                bottom: 18px;
                padding-top: 7px;
                border-top: 1px solid #E2E8F0;
                text-align: center;
                font-size: 7.5px;
                letter-spacing: 1px;
                color: #94A3B8;
                text-transform: uppercase;
              ">
                TrackScore Digital Assessor Matrix &nbsp; • &nbsp; Official MIROS Verification Record
              </div>
            </div>
          </div>
        \`;

        // Render into dedicated container
        const container = document.createElement('div');
        container.id = 'certificate-pdf-render-target';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '794px';
        container.style.height = '1120px';
        container.style.zIndex = '-9999';
        container.style.overflow = 'hidden';
        container.style.background = '#FFFFFF';
        container.style.boxSizing = 'border-box';
        container.innerHTML = certHtml;

        document.body.appendChild(container);
        const certEl = container.firstElementChild;
        const rect = certEl.getBoundingClientRect();

        const opt = {
          margin: 0,
          filename: '${tc.id}.pdf',
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
          measuredWidth: rect.width,
          measuredHeight: rect.height,
          numPages,
          pageWidthInches: pageSize.getWidth(),
          pageHeightInches: pageSize.getHeight(),
          pdfBytes: pdfBase64.length,
          pdfDataUri: pdfBase64
        };
      })()`);

      console.log(`    Result: ${testResult.numPages} Page(s) [${testResult.numPages === 1 ? 'PASS ✅' : 'FAIL ❌'}]`);
      console.log(`    Element Dimensions: ${testResult.measuredWidth}px x ${testResult.measuredHeight}px`);
      console.log(`    PDF Page Dimensions: ${testResult.pageWidthInches.toFixed(3)}in x ${testResult.pageHeightInches.toFixed(3)}in`);

      const base64Data = testResult.pdfDataUri.split(',')[1];
      fs.writeFileSync(`${tc.id}.pdf`, Buffer.from(base64Data, 'base64'));
      console.log(`    PDF saved: ${tc.id}.pdf (${fs.statSync(`${tc.id}.pdf`).size} bytes)`);
    }

  } catch (err) {
    console.error('Error running test suite:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    process.exit(0);
  }
}

run();
