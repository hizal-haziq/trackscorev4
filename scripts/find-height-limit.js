import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const CDP_PORT = 9229;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
  const chromeProcess = spawn(CHROME_PATH, [
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
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) break;
    } catch (e) {}
  }

  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const list = await res.json();
  const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || list[0];
  if (!page) {
    console.log('No page target');
    return;
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  
  let msgId = 1;
  const send = (method, params) => new Promise((resolve) => {
    const id = msgId++;
    const handler = (m) => {
      const d = JSON.parse(m.toString());
      if (d.id === id) { ws.off('message', handler); resolve(d.result?.result?.value); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const { generateToken, ROLE_MANAGER } = await import('../netlify/functions/auth.js');
  const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Lead Manager', username: 'manager@trackscore.my' });

  await send('Page.navigate', { url: `http://localhost:3000/login.html` });
  await new Promise(r => setTimeout(r, 1000));

  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('trackscore_token', '${managerToken}');
      localStorage.setItem('trackscore_user_role', 'manager');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Lead Manager', role: 'manager' }));
      localStorage.setItem('token', '${managerToken}');
    `
  });

  await send('Page.navigate', { url: `http://localhost:3000/dashboard.html` });
  await new Promise(r => setTimeout(r, 3000));

  for (const h of [800, 900, 950, 1000, 1050, 1080, 1100, 1120, 1122, 1123]) {
    const r = await send('Runtime.evaluate', {
      expression: `(async () => {
        await loadHtml2Pdf();
        const el = document.createElement("div");
        el.style.width = "794px";
        el.style.height = "${h}px";
        el.style.background = "#fff";
        document.body.appendChild(el);
        const worker = window.html2pdf().set({
          margin: 0,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, scrollX: 0 },
          jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] }
        }).from(el);
        const pdf = await worker.toPdf().get("pdf");
        const p = pdf.internal.getNumberOfPages();
        el.remove();
        return { h: ${h}, pages: p };
      })()`,
      returnByValue: true,
      awaitPromise: true
    });
    console.log(r);
  }
  ws.close();
  chromeProcess.kill();
}

test().catch(console.error);
