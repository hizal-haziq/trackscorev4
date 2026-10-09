import { spawn } from 'child_process';
import http from 'http';
import { generateToken, ROLE_MANAGER, ROLE_ASSESSOR, ROLE_VENDOR } from '../netlify/functions/auth.js';

const PORT = process.env.PORT || 3000;
const CDP_PORT = 9223;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let serverProcess;
let chromeProcess;
let ws;
let msgId = 1;
const pendingRequests = new Map();
const consoleErrors = [];
const uncaughtExceptions = [];

function sendCdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalInBrowser(code) {
  const trimmed = code.trim();
  const hasReturn = /\breturn\b/.test(trimmed);

  let wrapped;
  if (/^\s*\(\s*\(\s*\)\s*=>/.test(trimmed)) {
    wrapped = trimmed;
  } else if (hasReturn) {
    wrapped = `(() => {\n${trimmed}\n})()`;
  } else {
    wrapped = `(() => {\n  return eval(${JSON.stringify(trimmed)});\n})()`;
  }

  const result = await sendCdp('Runtime.evaluate', {
    expression: wrapped,
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

async function startServer() {
  try {
    const check = await fetch(`http://localhost:${PORT}/login.html`);
    if (check.ok) {
      console.log(`[Setup] TrackScore server is already UP on port ${PORT}!`);
      return;
    }
  } catch (e) {}

  console.log('[Setup] Starting TrackScore server on port ' + PORT + '...');
  serverProcess = spawn('node', ['dist/server.cjs'], {
    env: { ...process.env, PORT: String(PORT) },
    shell: true,
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', () => {});
  serverProcess.stderr.on('data', () => {});

  for (let i = 0; i < 30; i++) {
    await wait(500);
    try {
      const res = await fetch(`http://localhost:${PORT}/login.html`);
      if (res.ok) {
        console.log('[Setup] TrackScore server is UP and responding!');
        return;
      }
    } catch (e) {}
  }
  throw new Error('Failed to start TrackScore server on port ' + PORT);
}

async function startChrome() {
  console.log('[Setup] Launching headless Google Chrome with CDP on port ' + CDP_PORT + '...');
  chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    `--user-data-dir=${process.env.TEMP || 'C:\\Windows\\Temp'}\\chrome_test_${Date.now()}`,
  ], { detached: false, shell: false });

  for (let i = 0; i < 30; i++) {
    await wait(400);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || list[0];
        if (page && page.webSocketDebuggerUrl) {
          const wsUrl = page.webSocketDebuggerUrl;
          console.log('[Setup] Found Chrome target WebSocket URL:', wsUrl);
          ws = new WebSocket(wsUrl);
          await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
          });
          console.log('[Setup] Connected to Chrome CDP WebSocket!');

          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.id && pendingRequests.has(data.id)) {
              const { resolve, reject } = pendingRequests.get(data.id);
              pendingRequests.delete(data.id);
              if (data.error) reject(new Error(data.error.message));
              else resolve(data.result);
            } else if (data.method === 'Runtime.consoleAPICalled') {
              if (data.params.type === 'error') {
                const args = data.params.args.map(a => a.value || a.description || '').join(' ');
                consoleErrors.push(args);
                console.log('   [Browser Console Error]:', args);
              }
            } else if (data.method === 'Runtime.exceptionThrown') {
              const text = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
              uncaughtExceptions.push(text);
              console.error('   ❌ [Browser Uncaught Exception]:', text);
            }
          };

          await sendCdp('Page.enable');
          await sendCdp('Runtime.enable');
          await sendCdp('DOM.enable');
          return;
        }
      }
    } catch (e) {}
  }
  throw new Error('Failed to connect to headless Chrome on port ' + CDP_PORT);
}

async function navigateTo(url) {
  console.log(`\n--> Navigating to ${url}...`);
  await sendCdp('Page.navigate', { url });
  await wait(1200);
}

async function cleanup() {
  console.log('\n[Teardown] Cleaning up processes...');
  if (ws) {
    try { ws.close(); } catch (e) {}
  }
  if (chromeProcess) {
    try {
      chromeProcess.kill('SIGTERM');
      spawn('taskkill', ['/pid', String(chromeProcess.pid), '/f', '/t'], { shell: true });
    } catch (e) {}
  }
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
    } catch (e) {}
  }
}

async function runRealBrowserVerification() {
  const testResults = [];

  function recordTest(suite, name, passed, details = '') {
    testResults.push({ suite, name, passed, details });
    const mark = passed ? '✅' : '❌';
    console.log(`  ${mark} [${suite}] ${name} ${details ? `(${details})` : ''}`);
  }

  try {
    await startServer();
    await startChrome();

    const managerToken = generateToken({ role: ROLE_MANAGER, name: 'Audit Manager', username: 'manager@trackscore.my' });
    const vendorToken = generateToken({ role: ROLE_VENDOR, name: 'Audit Vendor', email: 'vendor@audit.test', companyName: 'Audit Telematics Sdn Bhd' });
    const assessorToken = generateToken({ role: ROLE_ASSESSOR, name: 'Audit Assessor', username: 'assessor@trackscore.my', assessorId: 'ASSESSOR_1' });

    // =========================================================================
    // TEST SUITE 1: Login Page (/login.html)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST SUITE 1: Login Page UI & Button Audit');
    console.log('========================================');
    await navigateTo(`http://localhost:${PORT}/login.html`);

    // 1.1 Role tabs: Assessor, Manager, Vendor
    const initialActiveRole = await evalInBrowser(`document.querySelector('.role-tab.active')?.dataset?.role`);
    recordTest('Login Page', 'Default active role tab is assessor', initialActiveRole === 'assessor', `role: ${initialActiveRole}`);

    // Click manager tab
    await evalInBrowser(`document.getElementById('tab-manager')?.click()`);
    await wait(200);
    const managerTabActive = await evalInBrowser(`document.getElementById('tab-manager')?.classList.contains('active')`);
    recordTest('Login Page', 'Manager tab click switches active role', managerTabActive);

    // Click vendor tab
    await evalInBrowser(`document.getElementById('tab-vendor')?.click()`);
    await wait(200);
    const vendorTabActive = await evalInBrowser(`document.getElementById('tab-vendor')?.classList.contains('active')`);
    recordTest('Login Page', 'Vendor tab click switches active role', vendorTabActive);

    // Click back to assessor tab
    await evalInBrowser(`document.getElementById('tab-assessor')?.click()`);
    await wait(200);
    const assessorTabActive = await evalInBrowser(`document.getElementById('tab-assessor')?.classList.contains('active')`);
    recordTest('Login Page', 'Assessor tab click switches back', assessorTabActive);

    // 1.2 Password visibility toggle button
    const pwInitialType = await evalInBrowser(`document.getElementById('login-password')?.type`);
    await evalInBrowser(`document.querySelector('#btn-toggle-password, .password-toggle-btn')?.click()`);
    const pwToggledType = await evalInBrowser(`document.getElementById('login-password')?.type`);
    await evalInBrowser(`document.querySelector('#btn-toggle-password, .password-toggle-btn')?.click()`);
    const pwRevertedType = await evalInBrowser(`document.getElementById('login-password')?.type`);
    recordTest('Login Page', 'Password visibility toggle button toggles visibility', pwInitialType === 'password' && pwToggledType === 'text' && pwRevertedType === 'password');

    // 1.3 Login submit button present in DOM
    const loginSubmitBtn = await evalInBrowser(`Boolean(document.getElementById('btn-login-submit'))`);
    recordTest('Login Page', 'Login submit button (#btn-login-submit) present in DOM', loginSubmitBtn);

    // =========================================================================
    // TEST SUITE 2: Manager Dashboard (/dashboard.html)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST SUITE 2: Manager Dashboard UI & Button Audit');
    console.log('========================================');

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${managerToken}');
      localStorage.setItem('trackscore_user_role', 'manager');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Audit Manager', role: 'manager' }));
      localStorage.setItem('token', '${managerToken}');
      localStorage.setItem('role', 'manager');
    `);
    await navigateTo(`http://localhost:${PORT}/dashboard.html`);
    await wait(1500);

    // 2.1 Navigation Tabs: Evaluations, Registered Customers, Inquiries, Workload
    const navTabs = [
      { key: 'evaluations', btnId: 'tab-btn-evaluations', panelId: 'evaluations-tab-content' },
      { key: 'registered', btnId: 'tab-btn-registered', panelId: 'registered-customers-tab-content' },
      { key: 'inquiries', btnId: 'tab-btn-inquiries', panelId: 'inquiries-tab-content' },
      { key: 'workload', btnId: 'tab-btn-workload', panelId: 'workload-tab-content' }
    ];
    for (const tab of navTabs) {
      const clicked = await evalInBrowser(`
        const btn = document.getElementById('${tab.btnId}') || document.querySelector('.tab-button[data-tab="${tab.key}"]');
        if (btn) { btn.click(); true; } else false;
      `);
      await wait(300);
      const isVisible = await evalInBrowser(`
        const panel = document.getElementById('${tab.panelId}') || document.getElementById('tab-${tab.key}');
        Boolean(panel && (panel.style.display !== 'none' || panel.classList.contains('active')));
      `);
      recordTest('Dashboard Tabs', `Switch to tab: ${tab.key}`, clicked && isVisible);
    }

    // Switch back to Registered Customers tab
    await evalInBrowser(`(document.getElementById('tab-btn-registered') || document.querySelector('.tab-button[data-tab="registered"]'))?.click()`);
    await wait(200);

    // 2.2 Registered Customers: Refresh button (#btn-refresh-registered)
    const refreshBtnWorks = await evalInBrowser(`
      const btn = document.getElementById('btn-refresh-registered');
      if (btn) { btn.click(); true; } else false;
    `);
    recordTest('Registered Customers', 'Refresh button (#btn-refresh-registered) clickable', refreshBtnWorks);

    // 2.3 Registered Customers: Register Customer button (#btn-open-register-modal) and Modal
    const openRegModal = await evalInBrowser(`
      const btn = document.getElementById('btn-open-register-modal');
      if (btn) { btn.click(); true; } else false;
    `);
    await wait(200);
    const regModalOpened = await evalInBrowser(`
      const modal = document.getElementById('register-customer-modal');
      modal && (modal.classList.contains('active') || modal.style.display !== 'none' || modal.getAttribute('aria-hidden') === 'false');
    `);
    recordTest('Registered Modal', 'Open Register Customer modal via #btn-open-register-modal', openRegModal && regModalOpened);

    // Close via #reg-modal-close
    const closeRegBtn = await evalInBrowser(`
      const btn = document.getElementById('reg-modal-close');
      if (btn) { btn.click(); true; } else false;
    `);
    await wait(200);
    const regModalClosed1 = await evalInBrowser(`
      const modal = document.getElementById('register-customer-modal');
      modal && (!modal.classList.contains('active') || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true');
    `);
    recordTest('Registered Modal', 'Close modal via #reg-modal-close button', closeRegBtn && regModalClosed1);

    // Open again, then close via #reg-modal-cancel
    await evalInBrowser(`document.getElementById('btn-open-register-modal')?.click()`);
    await wait(100);
    const cancelRegBtn = await evalInBrowser(`
      const btn = document.getElementById('reg-modal-cancel');
      if (btn) { btn.click(); true; } else false;
    `);
    await wait(200);
    const regModalClosed2 = await evalInBrowser(`
      const modal = document.getElementById('register-customer-modal');
      modal && (!modal.classList.contains('active') || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true');
    `);
    recordTest('Registered Modal', 'Close modal via #reg-modal-cancel button', cancelRegBtn && regModalClosed2);

    // 2.4 Schedule Assessment Modal buttons
    await evalInBrowser(`
      if (typeof openScheduleModal === 'function') {
        openScheduleModal('test-rec-1', 'Test Corp Sdn Bhd');
      }
    `);
    await wait(200);
    const schedModalOpen = await evalInBrowser(`
      const modal = document.getElementById('schedule-assessment-modal');
      modal && (modal.classList.contains('active') || modal.style.display !== 'none' || modal.getAttribute('aria-hidden') === 'false');
    `);
    recordTest('Schedule Modal', 'Open Schedule modal via openScheduleModal()', schedModalOpen);

    // Close via #schedule-modal-close
    await evalInBrowser(`document.getElementById('schedule-modal-close')?.click()`);
    await wait(200);
    const schedClosed1 = await evalInBrowser(`
      const modal = document.getElementById('schedule-assessment-modal');
      modal && (!modal.classList.contains('active') || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true');
    `);
    recordTest('Schedule Modal', 'Close Schedule modal via #schedule-modal-close', schedClosed1);

    // Open again and close via #schedule-modal-cancel
    await evalInBrowser(`openScheduleModal('test-rec-1', 'Test Corp Sdn Bhd')`);
    await wait(100);
    await evalInBrowser(`document.getElementById('schedule-modal-cancel')?.click()`);
    await wait(200);
    const schedClosed2 = await evalInBrowser(`
      const modal = document.getElementById('schedule-assessment-modal');
      modal && (!modal.classList.contains('active') || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true');
    `);
    recordTest('Schedule Modal', 'Close Schedule modal via #schedule-modal-cancel', schedClosed2);

    // 2.5 Manage Invoice Modal buttons
    await evalInBrowser(`
      if (typeof openManageInvoiceModal === 'function') {
        openManageInvoiceModal('test-rec-1', 'Test Corp Sdn Bhd', { package: 'package_1', invoiceAmount: 4500 });
      }
    `);
    await wait(200);
    const invModalOpen = await evalInBrowser(`
      const modal = document.getElementById('manage-invoice-modal');
      modal && (modal.classList.contains('active') || modal.style.display !== 'none' || modal.getAttribute('aria-hidden') === 'false');
    `);
    recordTest('Invoice Modal', 'Open Manage Invoice modal via openManageInvoiceModal()', invModalOpen);

    // Close via #inv-modal-close
    await evalInBrowser(`document.getElementById('inv-modal-close')?.click()`);
    await wait(200);
    const invClosed1 = await evalInBrowser(`
      const modal = document.getElementById('manage-invoice-modal');
      modal && (!modal.classList.contains('active') || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true');
    `);
    recordTest('Invoice Modal', 'Close Invoice modal via #inv-modal-close', invClosed1);

    // Open again and close via #inv-modal-cancel
    await evalInBrowser(`openManageInvoiceModal('test-rec-1', 'Test Corp')`);
    await wait(100);
    await evalInBrowser(`document.getElementById('inv-modal-cancel')?.click()`);
    await wait(200);
    const invClosed2 = await evalInBrowser(`
      const modal = document.getElementById('manage-invoice-modal');
      modal && (!modal.classList.contains('active') || modal.style.display === 'none' || modal.getAttribute('aria-hidden') === 'true');
    `);
    recordTest('Invoice Modal', 'Close Invoice modal via #inv-modal-cancel', invClosed2);

    // 2.6 Manager Certificate PDF Download Handler Function
    const hasDownloadMgrCert = await evalInBrowser(`typeof window.downloadManagerCertificate === 'function'`);
    recordTest('Dashboard Handlers', 'window.downloadManagerCertificate is defined and a function', hasDownloadMgrCert);

    // Invoke downloadManagerCertificate with dummy id (should show toast gracefully without throwing)
    const mgrCertNoThrow = await evalInBrowser(`
      try {
        window.downloadManagerCertificate('non-existent-eval');
        true;
      } catch (e) {
        e.message;
      }
    `);
    recordTest('Dashboard Handlers', 'downloadManagerCertificate handles missing record safely', mgrCertNoThrow === true);

    // 2.7 Approval handler alias
    const hasApproveAlias = await evalInBrowser(`typeof window.approveEvaluation === 'function'`);
    recordTest('Dashboard Handlers', 'window.approveEvaluation alias is defined and callable', hasApproveAlias);

    // 2.8 Export CSV Button
    const csvExportBtn = await evalInBrowser(`
      const btn = document.getElementById('btn-export-csv');
      if (btn) { btn.click(); true; } else false;
    `);
    recordTest('Dashboard Exports', 'CSV Export button (#btn-export-csv) clickable without error', csvExportBtn);

    // 2.9 Manager Sign Out Button
    const signOutWorks = await evalInBrowser(`
      if (typeof handleDashboardLogout === 'function') {
        true;
      } else if (document.getElementById('btn-logout')) {
        true;
      } else false;
    `);
    recordTest('Dashboard Auth', 'Dashboard logout handler exists', signOutWorks);

    // 2.10 Vendor Credentials Generation & .tst / .txt Download Controls
    const topGenCredBtn = await evalInBrowser(`Boolean(document.getElementById('btn-top-generate-vendor-cred'))`);
    recordTest('Vendor Credentials', 'Top Generate Vendor Credentials button (#btn-top-generate-vendor-cred) present', topGenCredBtn);

    // Open input modal
    await evalInBrowser(`document.getElementById('btn-top-generate-vendor-cred')?.click()`);
    await wait(300);
    const inputModalOpen = await evalInBrowser(`
      const m = document.getElementById('generate-vendor-cred-input-modal');
      Boolean(m && m.classList.contains('active'));
    `);
    recordTest('Vendor Credentials', 'Input modal opens on clicking #btn-top-generate-vendor-cred', inputModalOpen);

    // Close input modal
    await evalInBrowser(`closeDirectVendorCredentialModal()`);
    await wait(200);
    const inputModalClosed = await evalInBrowser(`
      const m = document.getElementById('generate-vendor-cred-input-modal');
      Boolean(m && !m.classList.contains('active'));
    `);
    recordTest('Vendor Credentials', 'Input modal closes via closeDirectVendorCredentialModal()', inputModalClosed);

    // Test downloadVendorCredentials function and .tst / .txt support
    const hasDownloadVendorCred = await evalInBrowser(`typeof window.downloadVendorCredentials === 'function'`);
    recordTest('Vendor Credentials', 'window.downloadVendorCredentials function exists', hasDownloadVendorCred);

    const hasCopyVendorCred = await evalInBrowser(`typeof window.copyVendorCredentialsToClipboard === 'function'`);
    recordTest('Vendor Credentials', 'window.copyVendorCredentialsToClipboard function exists', hasCopyVendorCred);

    // 2.11 View Evaluation Report and Download PDF buttons
    const hasViewEvalReport = await evalInBrowser(`typeof viewEvaluationReport === 'function'`);
    recordTest('Report & Cert', 'viewEvaluationReport function exists', hasViewEvalReport);

    const hasDownloadReportPdf = await evalInBrowser(`typeof downloadReportPdf === 'function'`);
    recordTest('Report & Cert', 'downloadReportPdf function exists', hasDownloadReportPdf);

    // =========================================================================
    // TEST SUITE 3: Vendor Portal (/vendor-portal.html)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST SUITE 3: Vendor Portal UI & Button Audit');
    console.log('========================================');

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${vendorToken}');
      localStorage.setItem('trackscore_user_role', 'vendor');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Audit Vendor', role: 'vendor', companyName: 'Audit Telematics' }));
    `);
    await navigateTo(`http://localhost:${PORT}/vendor-portal.html`);
    await wait(1500);

    // 3.1 switchMainTab function verification
    const hasSwitchMainTab = await evalInBrowser(`typeof window.switchMainTab === 'function'`);
    recordTest('Vendor Portal', 'switchMainTab is defined and a function', hasSwitchMainTab);

    // Test clicking "Assessments" nav tab
    const tabClickOk = await evalInBrowser(`
      try {
        const btn = document.querySelector('.nav-tab[onclick*="switchMainTab(\\'evaluations\\')"]');
        if (btn) { btn.click(); true; } else false;
      } catch (e) {
        e.message;
      }
    `);
    recordTest('Vendor Portal', 'Click Assessments tab runs without throwing ReferenceError', tabClickOk === true);

    // 3.2 Company Profile modal button
    const openProfileOk = await evalInBrowser(`
      try {
        if (typeof openProfileModal === 'function') {
          openProfileModal();
          const modal = document.getElementById('modal-profile');
          modal && modal.style.display !== 'none';
        } else false;
      } catch (e) { e.message; }
    `);
    recordTest('Vendor Portal', 'Company Profile button opens modal', openProfileOk === true);

    // Close profile modal
    const closeProfileOk = await evalInBrowser(`
      try {
        closeModal('modal-profile');
        const modal = document.getElementById('modal-profile');
        modal && modal.style.display === 'none';
      } catch (e) { e.message; }
    `);
    recordTest('Vendor Portal', 'Close profile modal works', closeProfileOk === true);

    // 3.3 Notifications modal button
    const openNotifOk = await evalInBrowser(`
      try {
        const btn = document.getElementById('btn-notifications');
        if (btn) { btn.click(); true; } else false;
      } catch (e) { e.message; }
    `);
    await wait(200);
    const notifModalOpened = await evalInBrowser(`
      const modal = document.getElementById('modal-notifications');
      modal && modal.style.display !== 'none';
    `);
    recordTest('Vendor Portal', 'Notifications button (#btn-notifications) opens modal', openNotifOk && notifModalOpened);

    // Close notifications modal
    await evalInBrowser(`closeModal('modal-notifications')`);
    await wait(100);

    // 3.4 Modal lifecycle: Documents, Resubmit, Payment modals
    for (const mId of ['modal-documents', 'modal-resubmit', 'modal-payment']) {
      const opened = await evalInBrowser(`
        openModal('${mId}');
        document.getElementById('${mId}')?.style.display !== 'none';
      `);
      await wait(100);
      const closed = await evalInBrowser(`
        closeModal('${mId}');
        document.getElementById('${mId}')?.style.display === 'none';
      `);
      recordTest('Vendor Modals', `Open and close ${mId}`, opened && closed);
    }

    // 3.5 Official certificate download function
    const hasVendorCertDl = await evalInBrowser(`typeof downloadOfficialCertificate === 'function'`);
    recordTest('Vendor Portal', 'downloadOfficialCertificate function exists', hasVendorCertDl);

    // 3.6 Vendor Logout Handler
    const hasVendorLogout = await evalInBrowser(`typeof handleVendorLogout === 'function'`);
    recordTest('Vendor Portal', 'handleVendorLogout function exists', hasVendorLogout);

    // =========================================================================
    // TEST SUITE 4: Assessor Portal (/index.html)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST SUITE 4: Assessor Portal UI & Button Audit');
    console.log('========================================');

    await evalInBrowser(`
      localStorage.setItem('trackscore_token', '${assessorToken}');
      localStorage.setItem('trackscore_user_role', 'assessor');
      localStorage.setItem('trackscore_user', JSON.stringify({ name: 'Audit Assessor', role: 'assessor', assessorId: 'ASSESSOR_1' }));
    `);
    await navigateTo(`http://localhost:${PORT}/index.html`);
    await wait(1500);

    // 4.1 Assessment Matrix scoring radio/button clicks
    const matrixButtons = await evalInBrowser(`
      const options = document.querySelectorAll('.option-btn, input[type="radio"]');
      if (options.length > 0) {
        options[0].click();
        true;
      } else false;
    `);
    recordTest('Assessor Portal', 'Matrix criteria scoring option clickable', matrixButtons);

    // 4.2 Save Draft button
    const saveDraftBtn = await evalInBrowser(`
      const btn = document.getElementById('save-draft-btn') || document.getElementById('btn-save-draft');
      Boolean(btn);
    `);
    recordTest('Assessor Portal', 'Save Draft button present in DOM', saveDraftBtn);

    // 4.3 Navigation tabs (Submissions / Evaluation Form)
    const tabsSwitch = await evalInBrowser(`
      const tabs = document.querySelectorAll('.portal-tab-btn, .nav-btn, .tab-btn');
      if (tabs.length > 1) {
        tabs[1].click();
        true;
      } else false;
    `);
    recordTest('Assessor Portal', 'Assessor navigation tabs clickable', tabsSwitch);

    // 4.4 Assessor sign out button
    const assessorSignOut = await evalInBrowser(`
      const btn = document.getElementById('btn-logout') || document.getElementById('logout-btn') || document.querySelector('.btn-logout');
      Boolean(btn);
    `);
    recordTest('Assessor Portal', 'Sign out button present and bound', assessorSignOut);

    // =========================================================================
    // TEST SUITE 5: Change Password Page (/change-password.html)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST SUITE 5: Change Password Page UI & Button Audit');
    console.log('========================================');

    await navigateTo(`http://localhost:${PORT}/change-password.html`);
    await wait(500);

    // 5.1 Password visibility toggle
    const cpwToggled = await evalInBrowser(`
      const btn = document.querySelector('.toggle-pw-btn');
      const input = document.getElementById('new-password');
      if (btn && input) {
        btn.click();
        const type1 = input.type;
        btn.click();
        const type2 = input.type;
        type1 === 'text' && type2 === 'password';
      } else false;
    `);
    recordTest('Change Password', 'Password visibility toggle works', cpwToggled);

    // 5.2 Sign Out link
    const cpwSignOut = await evalInBrowser(`typeof handleSignOut === 'function'`);
    recordTest('Change Password', 'handleSignOut function defined and available', cpwSignOut);

    // =========================================================================
    // TEST SUITE 6: Verify Certificate Page (/verify-certificate.html)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST SUITE 6: Verify Certificate Page UI & Button Audit');
    console.log('========================================');

    await navigateTo(`http://localhost:${PORT}/verify-certificate.html`);
    await wait(500);

    // 6.1 Certificate search form submit button
    const certSearchBtn = await evalInBrowser(`
      const input = document.getElementById('cert-input') || document.querySelector('input[type="text"]');
      const form = document.querySelector('form') || document.getElementById('verify-form');
      if (input && form) {
        input.value = 'TS-TEST-CERT-2026';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        true;
      } else false;
    `);
    await wait(400);
    recordTest('Verify Certificate', 'Certificate verification form submit button responds without error', certSearchBtn);

    // =========================================================================
    // Console Errors & Uncaught Exceptions Audit
    // =========================================================================
    console.log('\n========================================');
    console.log('CONSOLE & RUNTIME EXCEPTION SUMMARY');
    console.log('========================================');
    console.log(`Total uncaught browser exceptions: ${uncaughtExceptions.length}`);
    console.log(`Total browser console errors: ${consoleErrors.length}`);

    recordTest(
      'Global Error Guard',
      'Zero uncaught ReferenceError / TypeError across all page interactions',
      uncaughtExceptions.length === 0,
      `errors: ${uncaughtExceptions.length}`
    );

    // =========================================================================
    // Final Summary
    // =========================================================================
    const passedTests = testResults.filter(t => t.passed).length;
    const totalTests = testResults.length;
    console.log('\n========================================');
    console.log('FINAL REAL-BROWSER AUDIT SUMMARY');
    console.log('========================================');
    console.log(`Passed: ${passedTests} / ${totalTests} tests (${Math.round((passedTests / totalTests) * 100)}%)`);

    if (passedTests === totalTests && uncaughtExceptions.length === 0) {
      console.log('\n🎉 ALL REAL BROWSER BUTTON AUDITS PASSED WITH ZERO UNCAUGHT EXCEPTIONS!');
    } else {
      console.log('\n❌ SOME BROWSER AUDITS FAILED:');
      for (const t of testResults.filter(t => !t.passed)) {
        console.log(`  - [${t.suite}] ${t.name}: ${t.details}`);
      }
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

runRealBrowserVerification();
