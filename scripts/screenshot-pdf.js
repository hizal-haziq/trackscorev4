import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const CDP_PORT = 9225;
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

async function run() {
  chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1200,1600',
    'about:blank'
  ]);

  for (let i = 0; i < 20; i++) {
    await wait(400);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) break;
    } catch (e) {}
  }

  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const list = await listRes.json();
  const page = list[0];

  ws = new WebSocket(page.webSocketDebuggerUrl);
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
  const pdfPath = path.resolve('reproduced_cert.pdf').replace(/\\/g, '/');
  console.log('Navigating to file:///' + pdfPath);
  await sendCdp('Page.navigate', { url: 'file:///' + pdfPath });
  await wait(2500);

  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('reproduced_cert_screenshot.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved reproduced_cert_screenshot.png');

  ws.close();
  chromeProcess.kill();
}

run().catch(console.error);

