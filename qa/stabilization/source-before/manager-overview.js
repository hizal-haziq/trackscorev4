/* Existing workflow modals remain the single source of Manager actions. */
(() => {
  let controller, snapshot, searchTimer, notifications = [], notificationsController;
  const el = id => document.getElementById(id);
  const safe = value => escapeHtml(String(value ?? ''));
  const labels = { registered: 'Registered', scheduled: 'Scheduled', assigned: 'Assigned', in_progress: 'In Progress', submitted: 'Waiting for Review', pending_review: 'Waiting for Review', remediation_required: 'Revision Required', approved: 'Approved', pre_final_sent: 'Approved', payment_confirmed: 'Approved', certificate_issued: 'Certificate Issued', completed: 'Completed', rejected: 'Revision Required', cancelled: 'Cancelled' };
  const slaLabels = { ON_TRACK: 'On Track', DUE_SOON: 'Due Soon', OVERDUE: 'Overdue', COMPLETED_ON_TIME: 'Completed On Time', COMPLETED_LATE: 'Completed Late', NOT_STARTED: 'Not Started' };
  const reviewing = r => ['submitted', 'pending_review'].includes(r.status);
  const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }) : 'Not recorded';
  const action = (r, kind = 'details', text = reviewing(r) ? 'Review' : 'Details') => `<button type="button" class="btn btn-secondary" data-record="${safe(r._id)}" data-action="${safe(kind)}">${safe(text)}</button>`;
  function render(data) {
    snapshot = data;
    for (const key of ['active', 'review', 'dueSoon', 'overdue', 'unassigned', 'certificates']) el('overview-' + key).textContent = data.metrics[key];
    el('overview-certificate-summary').textContent = `${data.metrics.certificateReady} ready for preparation · ${data.metrics.certificateInProgress} in progress`;
    el('overview-rate').textContent = data.slaSummary.complianceRate;
    el('overview-sla-summary').textContent = `${data.slaSummary.onTrack} on track · ${data.slaSummary.completedOnTime} completed on time · ${data.slaSummary.completedLate} completed late`;
    el('overview-attention-count').textContent = data.attentionTotal ? `${data.attentionTotal} items${data.attentionTotal > data.attention.length ? ' · highest priorities shown' : ''}` : '';
    el('overview-attention').innerHTML = data.attention.length ? data.attention.map(r => `<div class="manager-list-item"><div><strong>${safe(r.companyName)}</strong><p class="manager-muted">${safe(r.reason)}</p>${r.sla?.deadline ? `<p class="manager-muted">Due ${safe(date(r.sla.deadline))}</p>` : ''}</div>${action(r, r.kind, r.action)}</div>`).join('') : '<div class="manager-empty"><strong>You’re all caught up.</strong><br>No items need your attention.</div>';
    el('overview-recent-count').textContent = `${data.recentTotal} matching assessments${data.recentTotal > 8 ? ' · latest 8 shown' : ''}`;
    el('overview-recent-body').innerHTML = data.recent.length ? data.recent.map(r => `<tr><td>${safe(r.companyName)}</td><td>${safe(r.assessorName)}</td><td><span class="manager-badge ${reviewing(r) ? 'review' : ''}">${safe(labels[r.status] || r.status || 'Not recorded')}</span></td><td><span class="manager-badge ${safe(r.sla?.status || '')}">${safe(slaLabels[r.sla?.status] || 'Not scheduled')}</span></td><td>${safe(date(r.updatedAt))}</td><td>${action(r)}</td></tr>`).join('') : '<tr><td colspan="6"><div class="manager-empty">No assessments found.</div></td></tr>';
    el('overview-schedule').innerHTML = data.schedule.length ? data.schedule.map(r => `<div class="manager-list-item"><div><p class="manager-muted">${safe(new Date(r.scheduledDate).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' }))}</p><strong>${safe(r.companyName)}</strong><p class="manager-muted">Assessor: ${safe(r.assessorName)}</p></div>${action(r, 'details', 'Details')}</div>`).join('') : '<div class="manager-empty">No assessments scheduled today.</div>';
    assessorWorkloadData = { success: true, ...data.workload };
    updateWorkloadSummaryCards(data.workload.summary);
    const assessors = [...data.workload.assessors].sort((a, b) => b.workload.active - a.workload.active);
    el('overview-workload').innerHTML = assessors.length ? assessors.slice(0, 6).map(a => `<div class="manager-workload"><h4>${safe(a.name)}</h4><p class="manager-muted">${a.workload.active} active assessments</p><progress max="${Math.max(1, a.workload.capacity)}" value="${a.workload.active}" aria-label="${safe(a.name)} workload"></progress><p class="manager-muted">${a.workload.isAtCapacity ? 'High workload' : a.workload.active ? 'Normal' : 'Available'} · ${a.workload.active} / ${a.workload.capacity}</p><button type="button" class="btn btn-secondary" data-assessor="${safe(a.id)}">Details</button></div>`).join('') : '<div class="manager-empty">No assessors found.</div>';
    el('overview-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}`;
  }
  async function load() {
    controller?.abort(); controller = new AbortController();
    const requestController = controller;
    const params = new URLSearchParams({ view: 'overview', q: el('overview-search').value, overviewStatus: el('overview-status').value, overviewSla: el('overview-sla').value });
    el('overview-loading').hidden = false; el('overview-error').hidden = true; el('manager-overview').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/.netlify/functions/get-evaluations?' + params, { headers: getAuthHeaders(), signal: controller.signal });
      if (handleAuthError(response)) return;
      if (!response.ok) throw new Error('Dashboard unavailable');
      const result = await response.json();
      if (!result.success || !result.overview) throw new Error('Dashboard unavailable');
      render(result.overview);
    } catch (error) { if (error.name !== 'AbortError') { el('overview-error').hidden = false; el('overview-updated').textContent = snapshot ? 'Showing last loaded data' : ''; } }
    finally { if (!requestController.signal.aborted) { el('overview-loading').hidden = true; el('manager-overview').setAttribute('aria-busy', 'false'); } }
  }
  window.loadManagerOverview = load;
  window.managerOverviewRecordAction = async (id, kind) => {
    const button = document.querySelector(`[data-record="${CSS.escape(id)}"][data-action="${CSS.escape(kind)}"]`);
    if (button) button.disabled = true;
    try {
      // Fetch the selected record once; existing modal code loads its protected details.
      const response = await fetch('/.netlify/functions/lookup-evaluation?fullDetails=true&id=' + encodeURIComponent(id), { headers: getAuthHeaders() });
      if (handleAuthError(response)) return;
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.length) throw new Error('Record unavailable');
      const record = result.data[0];
      record._fullDetailsLoaded = true;
      const index = evaluationsList.findIndex(r => String(r._id || r.id) === String(id));
      if (index >= 0) evaluationsList[index] = record; else evaluationsList.push(record);
      if (kind === 'certificate') {
        const cert = record.certificate || {};
        openCertificateModal(id, !cert.preparedDate ? 'prepare' : !cert.printedDate ? 'print' : !cert.signedDate ? 'sign' : 'deliver');
      } else await openEvaluationDetails(id);
    } catch { showToast('Unable to open this assessment. Please try again.', true); }
    finally { if (button) button.disabled = false; }
  };
  const seenKey = () => 'trackscore_manager_notifications_seen_' + (getAuthUser()?.id || getAuthUser()?._id || getAuthUser()?.email || 'manager');
  async function loadNotifications() {
    notificationsController?.abort(); notificationsController = new AbortController();
    try {
      const response = await fetch('/.netlify/functions/get-notifications', { headers: getAuthHeaders(), signal: notificationsController.signal });
      if (handleAuthError(response)) return;
      if (!response.ok) throw new Error();
      const result = await response.json(); notifications = result.notifications || [];
      const seen = Number(localStorage.getItem(seenKey()) || 0);
      const unread = notifications.filter(n => new Date(n.statusChangedAt || n.createdAt || 0).getTime() > seen).length;
      el('overview-notification-count').textContent = unread ? `(${unread})` : '';
      el('overview-notification-list').innerHTML = notifications.length ? notifications.map(n => `<div class="manager-list-item"><div><strong>${safe(n.companyName || 'Assessment update')}</strong><p class="manager-muted">${safe(labels[n.originalStatus || n.status] || n.status)} · ${safe(date(n.statusChangedAt || n.createdAt))}</p></div>${action({ _id: n.id || n._id }, 'details', 'Details')}</div>`).join('') : '<p class="manager-empty">No notifications yet.</p>';
    } catch (error) { if (error.name !== 'AbortError') el('overview-notification-list').innerHTML = '<p class="manager-empty">Unable to load notifications. Please close and try again.</p>'; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const originalFetchEvaluations = fetchEvaluations;
    // Modal saves already refresh the repository. Refresh the visible overview too,
    // reusing that established lifecycle instead of adding a second polling timer.
    fetchEvaluations = async function(...args) {
      await originalFetchEvaluations(...args);
      if (currentDashboardTab === 'overview' && snapshot) await load();
    };
    const originalSwitch = switchDashboardTab;
    switchDashboardTab = function(tab) {
      el('manager-overview').hidden = tab !== 'overview';
      el('tab-btn-overview').classList.toggle('active', tab === 'overview');
      if (tab !== 'overview') { controller?.abort(); originalSwitch(tab); }
      else {
        window.managerOverviewQueue = '';
        el('manager-queue-banner').hidden = true;
        currentDashboardTab = 'overview';
        for (const id of ['evaluations', 'registered-customers', 'inquiries', 'workload']) el(id + '-tab-content').style.display = 'none';
        document.querySelectorAll('.dash-tab-btn:not(#tab-btn-overview)').forEach(b => b.classList.remove('active'));
        load();
      }
      document.querySelectorAll('.dash-tab-btn').forEach(b => b.setAttribute('aria-current', b.classList.contains('active') ? 'page' : 'false'));
    };
    // Keep historical statistics and quality filters, lower in a collapsible section.
    for (const selector of ['#stats-grid', '.sla-overview-section', '#risk-overview-section']) el('overview-secondary-content').append(document.querySelector(selector));
    el('manager-overview').addEventListener('click', event => {
      const record = event.target.closest('[data-record]');
      const assessor = event.target.closest('[data-assessor]');
      if (record) window.managerOverviewRecordAction(record.dataset.record, record.dataset.action);
      if (assessor) openAssessorDetailModal(assessor.dataset.assessor);
    });
    el('overview-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 300); });
    for (const id of ['overview-status', 'overview-sla']) el(id).addEventListener('change', load);
    el('overview-retry').addEventListener('click', load);
    el('overview-refresh').addEventListener('click', load);
    function openQueue(queue) {
      window.managerOverviewQueue = queue;
      for (const id of ['status-filter', 'sla-filter', 'risk-filter', 'rating-filter']) el(id).value = 'all';
      el('table-search').value = '';
      currentPage = 1;
      el('manager-queue-label').textContent = 'Certificates awaiting action';
      el('manager-queue-banner').hidden = false;
      switchDashboardTab('evaluations');
    }
    el('overview-certificates-link').addEventListener('click', () => openQueue('certificates'));
    el('manager-queue-clear').addEventListener('click', () => { window.managerOverviewQueue = ''; el('manager-queue-banner').hidden = true; fetchEvaluations(1, currentLimit); });
    el('overview-notifications').addEventListener('click', async () => {
      el('overview-notifications-dialog').showModal();
      await loadNotifications();
      localStorage.setItem(seenKey(), String(Date.now())); el('overview-notification-count').textContent = '';
    });
    el('overview-notifications-close').addEventListener('click', () => el('overview-notifications-dialog').close());
    el('overview-notification-list').addEventListener('click', event => { const button = event.target.closest('[data-record]'); if (button) { el('overview-notifications-dialog').close(); window.managerOverviewRecordAction(button.dataset.record, 'details'); } });
    el('overview-profile').addEventListener('click', () => {
      const user = getAuthUser() || {};
      el('overview-profile-name').textContent = user.name || 'Manager'; el('overview-profile-email').textContent = user.email || 'Not recorded';
      el('overview-profile-dialog').showModal();
    });
    el('overview-profile-close').addEventListener('click', () => el('overview-profile-dialog').close());
    const originalRefresh = triggerAutoRefreshFetch;
    triggerAutoRefreshFetch = function() { if (currentDashboardTab === 'overview') { load(); loadNotifications(); } else originalRefresh(); };
    window.addEventListener('pagehide', () => { controller?.abort(); notificationsController?.abort(); clearTimeout(searchTimer); });
    switchDashboardTab('overview');
    loadNotifications();
  });
})();
