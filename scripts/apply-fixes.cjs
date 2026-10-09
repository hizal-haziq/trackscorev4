const fs = require('fs');
const path = require('path');

function applyDashboardFixes(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isCrlf = content.includes('\r\n');
  const eol = isCrlf ? '\r\n' : '\n';

  // 1. Registered tab buttons
  const oldRegButtons = `<div style="display: flex; gap: 8px; align-items: center;">${eol}            <button type="button" class="btn btn-secondary btn-sm" onclick="fetchRegisteredCustomers()" title="Reload registered customers">`;
  const newRegButtons = `<div style="display: flex; gap: 8px; align-items: center;">${eol}            <button type="button" class="btn btn-secondary btn-sm" id="btn-refresh-registered" onclick="fetchRegisteredCustomers()" title="Reload registered customers">`;
  if (!content.includes(oldRegButtons)) {
    console.error(`[${filePath}] Failed to find oldRegButtons`);
  } else {
    content = content.replace(oldRegButtons, newRegButtons);
    console.log(`[${filePath}] Replaced oldRegButtons`);
  }

  const oldRegCustBtn = `<button type="button" class="btn btn-primary btn-sm" onclick="openRegisterCustomerModal()" title="Register a new customer for telematics assessment">`;
  const newRegCustBtn = `<button type="button" class="btn btn-primary btn-sm" id="btn-open-register-modal" onclick="openRegisterCustomerModal()" title="Register a new customer for telematics assessment">`;
  if (!content.includes(oldRegCustBtn)) {
    console.error(`[${filePath}] Failed to find oldRegCustBtn`);
  } else {
    content = content.replace(oldRegCustBtn, newRegCustBtn);
    console.log(`[${filePath}] Replaced oldRegCustBtn`);
  }

  // 2. Register modal close and cancel
  const oldRegClose = `<button type="button" class="modal-close-btn" onclick="closeRegisterCustomerModal()" aria-label="Close modal">&times;</button>`;
  const newRegClose = `<button type="button" class="modal-close-btn" id="reg-modal-close" onclick="closeRegisterCustomerModal()" aria-label="Close modal">&times;</button>`;
  if (!content.includes(oldRegClose)) {
    console.error(`[${filePath}] Failed to find oldRegClose`);
  } else {
    content = content.replace(oldRegClose, newRegClose);
    console.log(`[${filePath}] Replaced oldRegClose`);
  }

  const oldRegCancel = `<button type="button" class="btn btn-secondary btn-sm" onclick="closeRegisterCustomerModal()">Cancel</button>`;
  const newRegCancel = `<button type="button" class="btn btn-secondary btn-sm" id="reg-modal-cancel" onclick="closeRegisterCustomerModal()">Cancel</button>`;
  if (!content.includes(oldRegCancel)) {
    console.error(`[${filePath}] Failed to find oldRegCancel`);
  } else {
    content = content.replace(oldRegCancel, newRegCancel);
    console.log(`[${filePath}] Replaced oldRegCancel`);
  }

  // 3. Schedule modal close and cancel
  const oldSchedClose = `<button type="button" class="modal-close-btn" onclick="closeScheduleModal()" aria-label="Close modal">&times;</button>`;
  const newSchedClose = `<button type="button" class="modal-close-btn" id="schedule-modal-close" onclick="closeScheduleModal()" aria-label="Close modal">&times;</button>`;
  if (!content.includes(oldSchedClose)) {
    console.error(`[${filePath}] Failed to find oldSchedClose`);
  } else {
    content = content.replace(oldSchedClose, newSchedClose);
    console.log(`[${filePath}] Replaced oldSchedClose`);
  }

  const oldSchedCancel = `<button type="button" class="btn btn-secondary btn-sm" onclick="closeScheduleModal()">Cancel</button>`;
  const newSchedCancel = `<button type="button" class="btn btn-secondary btn-sm" id="schedule-modal-cancel" onclick="closeScheduleModal()">Cancel</button>`;
  if (!content.includes(oldSchedCancel)) {
    console.error(`[${filePath}] Failed to find oldSchedCancel`);
  } else {
    content = content.replace(oldSchedCancel, newSchedCancel);
    console.log(`[${filePath}] Replaced oldSchedCancel`);
  }

  // 4. Manage invoice modal close and cancel
  const oldInvClose = `<button type="button" class="modal-close-btn" onclick="closeManageInvoiceModal()" aria-label="Close modal">&times;</button>`;
  const newInvClose = `<button type="button" class="modal-close-btn" id="inv-modal-close" onclick="closeManageInvoiceModal()" aria-label="Close modal">&times;</button>`;
  if (!content.includes(oldInvClose)) {
    console.error(`[${filePath}] Failed to find oldInvClose`);
  } else {
    content = content.replace(oldInvClose, newInvClose);
    console.log(`[${filePath}] Replaced oldInvClose`);
  }

  const oldInvCancel = `<button type="button" class="btn btn-secondary btn-sm" onclick="closeManageInvoiceModal()">Cancel</button>`;
  const newInvCancel = `<button type="button" class="btn btn-secondary btn-sm" id="inv-modal-cancel" onclick="closeManageInvoiceModal()">Cancel</button>`;
  if (!content.includes(oldInvCancel)) {
    console.error(`[${filePath}] Failed to find oldInvCancel`);
  } else {
    content = content.replace(oldInvCancel, newInvCancel);
    console.log(`[${filePath}] Replaced oldInvCancel`);
  }

  // 5. Premature pre_final_sent in renderCertificateBadge
  const oldBadgePaid = `const isPaid = evalRecord?.payment?.status === 'paid' || evalRecord?.payment?.overridden || evalRecord?.status === 'payment_confirmed' || evalRecord?.status === 'pre_final_sent' || evalRecord?.status === 'certificate_issued' || evalRecord?.status === 'completed';`;
  const newBadgePaid = `const isPaid = evalRecord?.payment?.status === 'paid' || evalRecord?.payment?.overridden || evalRecord?.status === 'payment_confirmed' || evalRecord?.status === 'certificate_issued' || evalRecord?.status === 'completed';`;
  if (!content.includes(oldBadgePaid)) {
    console.error(`[${filePath}] Failed to find oldBadgePaid`);
  } else {
    content = content.replace(oldBadgePaid, newBadgePaid);
    console.log(`[${filePath}] Replaced oldBadgePaid`);
  }

  // 6. Premature pre_final_sent in openEvaluationDetails
  const oldDetailsPaid = `const isPaymentPaid = ((record.payment?.status || '').toLowerCase() === 'paid') || Boolean(record.payment?.overridden) || status === 'payment_confirmed' || status === 'pre_final_sent' || status === 'certificate_issued' || status === 'completed';`;
  const newDetailsPaid = `const isPaymentPaid = ((record.payment?.status || '').toLowerCase() === 'paid') || Boolean(record.payment?.overridden) || status === 'payment_confirmed' || status === 'certificate_issued' || status === 'completed';`;
  if (!content.includes(oldDetailsPaid)) {
    console.error(`[${filePath}] Failed to find oldDetailsPaid`);
  } else {
    content = content.replace(oldDetailsPaid, newDetailsPaid);
    console.log(`[${filePath}] Replaced oldDetailsPaid`);
  }

  // 7. Premature pre_final_sent in openCertificateModal
  const oldModalPaid = `        const curStatus = (record.status || '').toLowerCase();${eol}        const cert = record.certificate || {};${eol}        const isPaid = ((record.payment?.status || '').toLowerCase() === 'paid') ||${eol}          Boolean(record.payment?.overridden) ||${eol}          curStatus === 'payment_confirmed' ||${eol}          curStatus === 'pre_final_sent' ||${eol}          curStatus === 'certificate_issued' ||${eol}          curStatus === 'completed';${eol}${eol}        // Enforce sequential rules${eol}        if (action === 'prepare') {${eol}          if (!isPaid) {${eol}            showToast("Cannot prepare certificate: Evaluation must reach pre-final result or review stage first.", true);`;
  const newModalPaid = `        const curStatus = (record.status || '').toLowerCase();${eol}        const cert = record.certificate || {};${eol}        const isPaid = ((record.payment?.status || '').toLowerCase() === 'paid') ||${eol}          Boolean(record.payment?.overridden) ||${eol}          curStatus === 'payment_confirmed' ||${eol}          curStatus === 'certificate_issued' ||${eol}          curStatus === 'completed';${eol}${eol}        // Enforce sequential rules${eol}        if (action === 'prepare') {${eol}          if (!isPaid) {${eol}            showToast("Cannot prepare certificate: Payment must be verified or confirmed first.", true);`;
  if (!content.includes(oldModalPaid)) {
    console.error(`[${filePath}] Failed to find oldModalPaid`);
  } else {
    content = content.replace(oldModalPaid, newModalPaid);
    console.log(`[${filePath}] Replaced oldModalPaid`);
  }

  // 8. Add downloadManagerCertificate & approveEvaluation alias before bulk CSV export
  const oldCsvSection = `      // ==========================================================================${eol}      // Bulk CSV Export Function (Pass 2)${eol}      // ==========================================================================`;
  const downloadFnCode = `      // Download Official Certificate PDF for Manager${eol}` +
`      async function downloadManagerCertificate(recordId) {${eol}` +
`        let record = (typeof activeEvaluation !== 'undefined' && activeEvaluation && (activeEvaluation._id === recordId || activeEvaluation.id === recordId))${eol}` +
`          ? activeEvaluation${eol}` +
`          : (typeof evaluationsList !== 'undefined' && Array.isArray(evaluationsList) ? evaluationsList.find(r => r._id === recordId || r.id === recordId) : null);${eol}${eol}` +
`        if (!record || !record.certificate || !record.certificate.certificateNumber) {${eol}` +
`          try {${eol}` +
`            const token = localStorage.getItem("token") || localStorage.getItem("trackscore_token");${eol}` +
`            const res = await fetch(\`/.netlify/functions/lookup-evaluation?id=\${encodeURIComponent(recordId)}\`, {${eol}` +
`              headers: token ? { 'Authorization': \`Bearer \${token}\` } : {}${eol}` +
`            });${eol}` +
`            const data = await res.json();${eol}` +
`            if (data && data.success && (data.evaluation || data.data)) {${eol}` +
`              record = data.evaluation || data.data;${eol}` +
`            }${eol}` +
`          } catch (e) {${eol}` +
`            console.warn("[downloadManagerCertificate] lookup failed:", e);${eol}` +
`          }${eol}` +
`        }${eol}${eol}` +
`        if (!record || !record.certificate || !record.certificate.certificateNumber) {${eol}` +
`          showToast("Certificate record not found or not yet generated.", true);${eol}` +
`          return;${eol}` +
`        }${eol}${eol}` +
`        if (!record.certificate.signedDate || !record.certificate.signedBy) {${eol}` +
`          showToast("Certificate PDF is unavailable until signed by an authorized signatory.", true);${eol}` +
`          return;${eol}` +
`        }${eol}${eol}` +
`        if (typeof window.generateCertificateHtml !== 'function') {${eol}` +
`          showToast("Certificate generator template is not loaded. Please refresh the page.", true);${eol}` +
`          return;${eol}` +
`        }${eol}${eol}` +
`        const element = document.createElement('div');${eol}` +
`        element.style.position = 'fixed';${eol}` +
`        element.style.left = '-100000px';${eol}` +
`        element.style.top = '0';${eol}` +
`        element.setAttribute('aria-hidden', 'true');${eol}${eol}` +
`        try {${eol}` +
`          showToast("Generating official certificate PDF...");${eol}` +
`          element.innerHTML = window.generateCertificateHtml(record);${eol}` +
`          document.body.appendChild(element);${eol}${eol}` +
`          await loadHtml2Pdf();${eol}` +
`          const cleanCertNo = String(record.certificate.certificateNumber || recordId).replace(/[^a-zA-Z0-9_-]/g, '_');${eol}` +
`          await window.html2pdf().set({${eol}` +
`            margin: 0,${eol}` +
`            filename: \`TrackScore_Certificate_\${cleanCertNo}.pdf\`,${eol}` +
`            image: { type: 'jpeg', quality: 0.98 },${eol}` +
`            html2canvas: { scale: 2, useCORS: true, logging: false },${eol}` +
`            jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' }${eol}` +
`          }).from(element.firstElementChild).save();${eol}${eol}` +
`          showToast("Official Certificate PDF downloaded successfully!");${eol}` +
`        } catch (err) {${eol}` +
`          console.error("Certificate PDF generation error:", err);${eol}` +
`          showToast("Failed to generate certificate PDF: " + (err.message || err), true);${eol}` +
`        } finally {${eol}` +
`          if (element.parentNode) {${eol}` +
`            element.parentNode.removeChild(element);${eol}` +
`          }${eol}` +
`        }${eol}` +
`      }${eol}` +
`      window.downloadManagerCertificate = downloadManagerCertificate;${eol}` +
`      window.approveEvaluation = typeof handleApproveEvaluation === 'function' ? handleApproveEvaluation : undefined;${eol}${eol}` +
oldCsvSection;

  if (!content.includes(oldCsvSection)) {
    console.error(`[${filePath}] Failed to find oldCsvSection`);
  } else {
    content = content.replace(oldCsvSection, downloadFnCode);
    console.log(`[${filePath}] Added downloadManagerCertificate`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[${filePath}] Successfully updated.`);
}

function applyVendorPortalFixes(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isCrlf = content.includes('\r\n');
  const eol = isCrlf ? '\r\n' : '\n';

  // Add switchMainTab
  const targetLogout = `    // Sign out button${eol}    function handleVendorLogout() {`;
  const switchFnCode = `    // Navigation Tab Switching${eol}` +
`    function switchMainTab(tab) {${eol}` +
`      document.querySelectorAll('.nav-menu .nav-tab').forEach(btn => {${eol}` +
`        btn.classList.remove('active');${eol}` +
`      });${eol}` +
`      const activeBtn = document.querySelector(\`.nav-menu .nav-tab[onclick*="\${tab}"]\`);${eol}` +
`      if (activeBtn) activeBtn.classList.add('active');${eol}${eol}` +
`      if (tab === 'evaluations') {${eol}` +
`        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');${eol}` +
`        window.scrollTo({ top: 0, behavior: 'smooth' });${eol}` +
`      } else if (tab === 'profile') {${eol}` +
`        openProfileModal();${eol}` +
`      }${eol}` +
`    }${eol}` +
`    window.switchMainTab = switchMainTab;${eol}${eol}` +
targetLogout;

  if (!content.includes(targetLogout)) {
    console.error(`[${filePath}] Failed to find targetLogout`);
  } else {
    content = content.replace(targetLogout, switchFnCode);
    console.log(`[${filePath}] Added switchMainTab`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[${filePath}] Successfully updated.`);
}

function applyChangePasswordFixes(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isCrlf = content.includes('\r\n');
  const eol = isCrlf ? '\r\n' : '\n';

  const oldSignOut = `    function handleSignOut() {${eol}      localStorage.removeItem('trackscore_token');${eol}      localStorage.removeItem('trackscore_user_role');${eol}      localStorage.removeItem('trackscore_user');${eol}      window.location.href = '/login.html';${eol}    }`;
  const newSignOut = `    function handleSignOut() {${eol}      try { sessionStorage.clear(); } catch (e) {}${eol}      localStorage.removeItem('trackscore_token');${eol}      localStorage.removeItem('trackscore_user_role');${eol}      localStorage.removeItem('trackscore_user');${eol}      localStorage.removeItem('token');${eol}      localStorage.removeItem('role');${eol}      localStorage.removeItem('username');${eol}      window.location.href = '/login.html';${eol}    }`;

  if (!content.includes(oldSignOut)) {
    console.error(`[${filePath}] Failed to find oldSignOut`);
  } else {
    content = content.replace(oldSignOut, newSignOut);
    console.log(`[${filePath}] Updated handleSignOut`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[${filePath}] Successfully updated.`);
}

applyDashboardFixes('dashboard.html');
applyDashboardFixes('public/dashboard.html');

applyVendorPortalFixes('vendor-portal.html');
applyVendorPortalFixes('public/vendor-portal.html');

applyChangePasswordFixes('change-password.html');
applyChangePasswordFixes('public/change-password.html');
