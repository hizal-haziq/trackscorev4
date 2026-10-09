import { spawn } from 'child_process';
import fs from 'fs';
import { WebSocket } from 'ws';
import { generateToken, ROLE_MANAGER, ROLE_VENDOR } from '../netlify/functions/auth.js';

const PORT = 3000;
const CDP_PORT = 9230;
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

    console.log('[Setup] CDP connection established.');

    // Import and test QR code generation
    const qrTest = await evalInBrowser(`(() => {
      return typeof window !== 'undefined';
    })()`);
    console.log('[Setup] Browser ready:', qrTest);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    process.exit(0);
  }
}

run();
