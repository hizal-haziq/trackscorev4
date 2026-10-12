import {useCallback, useState} from 'react';
import {ManagerLayout} from '../../components/layout/ManagerLayout';
import {RequestState} from '../../components/common/RequestState';
import {StatusBadge} from '../../components/common/StatusBadge';
import {useAuth} from '../../hooks/useAuth';
import {useApi} from '../../hooks/useApi';
import {useStatusStream} from '../../hooks/useStatusStream';
import {getManagerOverview} from '../../services/assessments';
import {formatDate, formatTime} from '../../utils/format';
import type {OverviewFilters} from '../../types/manager';

export function ManagerDashboard() {
  const {session} = useAuth();
  const [filters, setFilters] = useState<OverviewFilters>({q: '', status: '', sla: ''});
  const load = useCallback((signal: AbortSignal) => getManagerOverview(filters, signal), [filters, session?.token]);
  const {data, loading, error, updatedAt, refresh} = useApi(load);
  useStatusStream(session!.token, refresh);
  const filter = (key: keyof OverviewFilters, value: string) => setFilters(previous => ({...previous, [key]: value}));
  return <ManagerLayout>
    <div className="ts-heading"><div><p className="ts-eyebrow">ASSESSMENT OPERATIONS</p><h1>Overview</h1><p>Track attention items, recent assessments and your team’s workload.</p></div>
      <div className="ts-refresh"><button className="ts-button" onClick={refresh} disabled={loading}>Refresh overview</button><small>{updatedAt ? `Updated ${formatTime(updatedAt)} · MYT` : 'Awaiting first update'}</small></div>
    </div>
    <RequestState loading={loading} error={error} retry={refresh} hasData={data !== null} />
    {data && <>
      <section className="ts-metrics" aria-label="Assessment totals">
        {[
          ['Needs Attention', data.attentionTotal, 'Items requiring action'], ['Waiting Review', data.metrics.review, 'Submitted for Manager review'],
          ['Ready for Certificate', data.metrics.certificateReady, 'Approved assessments'], ['Overdue', data.metrics.overdue, 'Past the SLA deadline'],
          ['Active', data.metrics.active, 'Active assessments'], ['Due Soon', data.metrics.dueSoon, 'Approaching the SLA deadline'],
          ['Unassigned', data.metrics.unassigned, 'Awaiting an assessor'], ['Certificates In Progress', data.metrics.certificateInProgress, 'Certificate preparation started'],
        ].map(([label, count, note]) => <article className="ts-metric" key={label}><h2>{label}</h2><strong>{count}</strong><p>{note}</p></article>)}
      </section>
      {data.total === 0 && <div className="ts-empty ts-overview-empty"><h2>No assessments yet</h2><p>New assessments will appear here when they are registered.</p></div>}
      <section className="ts-panel"><div className="ts-panel-heading"><h2>Needs Attention</h2><span>{data.attentionTotal} total</span></div>
        {data.attention.length ? <ul className="ts-attention">{data.attention.map(row => <li key={row._id}><div><strong>{row.companyName || 'Unnamed company'}</strong><p>{row.deviceModel || 'Device not recorded'} · {row.reason}</p></div><StatusBadge status={row.status} /></li>)}</ul> : <p className="ts-empty">No assessments need attention.</p>}
        {data.attentionTotal > data.attention.length && <p className="ts-table-note">Showing {data.attention.length} of {data.attentionTotal} attention items.</p>}
      </section>
      <section className="ts-panel"><div className="ts-panel-heading"><h2>Recent assessments</h2><span>{data.recentTotal} matching</span></div>
        <div className="ts-filters">
          <label>Search recent assessments<input type="search" value={filters.q} onChange={event => filter('q', event.target.value)} placeholder="Company, device or assessor" /></label>
          <label>Status<select aria-label="Status" value={filters.status} onChange={event => filter('status', event.target.value)}><option value="">All statuses</option><option value="review">Waiting Review</option><option value="revision">Changes Requested</option><option value="scheduled">Scheduled</option><option value="in_progress">In Progress</option><option value="approved">Approved</option><option value="certificate_issued">Certificate Issued</option></select></label>
          <label>SLA<select aria-label="SLA" value={filters.sla} onChange={event => filter('sla', event.target.value)}><option value="">All SLA states</option><option value="OVERDUE">Overdue</option><option value="DUE_SOON">Due Soon</option><option value="ON_TRACK">On Track</option></select></label>
        </div><p className="ts-table-note">Filters apply to recent assessments. Summary totals cover all assessments.</p>
        {data.recent.length ? <div className="ts-table-scroll" tabIndex={0} aria-label="Recent assessments, scroll for more columns"><table><caption className="ts-visually-hidden">Recent assessments</caption><thead><tr><th>Company / Device</th><th>Assessor</th><th>Status</th><th>SLA</th><th>Updated</th></tr></thead><tbody>{data.recent.map(row => <tr key={row._id}><td><strong>{row.companyName || 'Unnamed company'}</strong><small>{row.deviceModel || 'Device not recorded'}</small></td><td>{row.assessorName || 'Unassigned'}</td><td><StatusBadge status={row.status} /></td><td><StatusBadge status={row.sla?.status} /></td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table></div> : <p className="ts-empty">No assessments match these filters.</p>}
        {data.recentTotal > data.recent.length && <p className="ts-table-note">Showing {data.recent.length} of {data.recentTotal} matching assessments. Open the Manager portal to view all records.</p>}
      </section>
      <div className="ts-two-columns"><section className="ts-panel"><div className="ts-panel-heading"><h2>Today’s schedule</h2><span>Malaysia time</span></div>
        {data.schedule.length ? <ul className="ts-schedule">{data.schedule.map(row => <li key={row._id}><strong>{row.companyName || 'Unnamed company'}</strong><p>{row.deviceModel || 'Device not recorded'} · {row.assessorName || 'Unassigned'}</p><small>{formatDate(row.scheduledDate)} · {formatTime(row.scheduledDate)}</small><StatusBadge status={row.status} /></li>)}</ul> : <p className="ts-empty">No assessments scheduled for today.</p>}
      </section><section className="ts-panel"><div className="ts-panel-heading"><h2>Assessor workload</h2><span>Active assessments</span></div>
        {data.workload.assessors.length ? <ul className="ts-workload">{data.workload.assessors.map(assessor => <li key={assessor.id}><div><strong>{assessor.name || assessor.assessorId}</strong><span>{assessor.workload.active} / {assessor.workload.capacity}</span></div><progress value={Math.min(assessor.workload.active, assessor.workload.capacity)} max={Math.max(1, assessor.workload.capacity)} aria-label={`${assessor.name} workload`} /><small>{assessor.workload.isAtCapacity ? 'At capacity' : 'Capacity available'}</small></li>)}</ul> : <p className="ts-empty">No assessor workload is available.</p>}
      </section></div>
      <p className="ts-portal-link">Manage assignments, reviews and certificates in the <a href="/dashboard.html">Manager portal ↗</a>.</p>
    </>}
  </ManagerLayout>;
}
