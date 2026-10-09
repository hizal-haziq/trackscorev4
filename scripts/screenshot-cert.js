import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const CDP_PORT = 9233;
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

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function renderPdfScreenshot(pdfFilename, outPng) {
  chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1000,1400',
    'about:blank'
  ]);

  for (let i = 0; i < 20; i++) {
    await wait(400);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list[0];
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
  const fullPath = path.resolve(pdfFilename).replace(/\\/g, '/');
  console.log('Navigating to file:///' + fullPath);
  await sendCdp('Page.navigate', { url: 'file:///' + fullPath });
  await wait(2500);

  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved screenshot ${outPng} (${fs.statSync(outPng).size} bytes)`);

  ws.close();
  chromeProcess.kill();
}

renderPdfScreenshot('cert_suite_standard.pdf', 'cert_preview_standard.png').catch(console.error);
