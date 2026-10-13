import {useCallback, useState} from 'react';
import {ManagerLayout} from '../../components/layout/ManagerLayout';
import {RequestState} from '../../components/common/RequestState';
import {StatusBadge} from '../../components/common/StatusBadge';
import {useApi} from '../../hooks/useApi';
import {useAuth} from '../../hooks/useAuth';
import {useStatusStream} from '../../hooks/useStatusStream';
import {DEFAULT_FILTERS, getAssessmentPage} from '../../services/managerAssessments';
import {assessmentHref} from '../../app/managerRoutes';
import {certificateState} from '../../utils/certificate';
import {formatDate} from '../../utils/format';
import type {RepositoryFilters} from '../../types/managerAssessment';

export function AssessmentRepository() {
  const {session} = useAuth();
  const [query, setQuery] = useState({filters: {...DEFAULT_FILTERS}, page: 1, limit: 25});
  const load = useCallback((signal: AbortSignal) => getAssessmentPage(query.filters, query.page, query.limit, signal), [query, session?.token]);
  const request = useApi(load);useStatusStream(session!.token, request.refresh);
  const change = (key: keyof RepositoryFilters, value: string | boolean) => setQuery(previous => ({...previous, page: 1, filters: {...previous.filters, [key]: value}}));
  const data = request.data;
  return <ManagerLayout>
    <div className="ts-heading"><div><p className="ts-eyebrow">ASSESSMENT OPERATIONS</p><h1>Assessments</h1><p>Browse records and open the read-only assessment workspace.</p></div><button className="ts-button" onClick={request.refresh} disabled={request.loading}>Refresh assessments</button></div>
    <section className="ts-panel" aria-label="Assessment repository">
      <div className="ts-filters ts-repository-filters">
        <label>Search assessments<input type="search" value={query.filters.q} onChange={e => change('q', e.target.value)} placeholder="Company, device or assessor" /></label>
        <label>Status<select aria-label="Status" value={query.filters.status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option><option value="registered,scheduled">Registrations / Scheduled</option><option value="in_progress">In Progress</option><option value="submitted,pending_review">Waiting Review</option><option value="rejected,remediation_required">Changes Requested</option><option value="approved">Approved</option><option value="certificate_issued">Certificate Issued</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
        <label>Assessor<input value={query.filters.assessor} onChange={e => change('assessor', e.target.value)} placeholder="Assessor name or ID" /></label>
        <label>SLA<select aria-label="SLA" value={query.filters.slaStatus} onChange={e => change('slaStatus', e.target.value)}><option value="">All SLA states</option>{['ON_TRACK','DUE_SOON','OVERDUE','COMPLETED_ON_TIME','COMPLETED_LATE'].map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Quality check<select value={query.filters.riskLevel} onChange={e => change('riskLevel', e.target.value)}><option value="">All quality states</option>{['NORMAL','REVIEW','HIGH_ATTENTION','INSUFFICIENT_DATA'].map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Certificate queue<select value={query.filters.queue} onChange={e => change('queue', e.target.value)}><option value="">All assessments</option><option value="certificates">Certificate work pending</option></select></label>
        <label>Sort assessments<select value={query.filters.sortBy} onChange={e => change('sortBy', e.target.value)}><option value="createdAt">Newest created</option><option value="statusChangedAt">Latest status change</option><option value="nearest_deadline">Nearest deadline</option><option value="oldest_overdue">Oldest deadline</option></select></label>
        <label className="ts-checkbox"><input type="checkbox" checked={query.filters.includeDeleted} onChange={e => change('includeDeleted', e.target.checked)} />Include archived records</label>
      </div><div className="ts-repository-actions"><button className="ts-button ts-button-secondary" onClick={() => setQuery(previous => ({...previous, page: 1, filters: {...DEFAULT_FILTERS}}))}>Clear Filters</button></div>
      <div className="ts-request-pad"><RequestState {...request} retry={request.refresh} hasData={data !== null} subject="assessments" /></div>
      {data && <>
        <p className="ts-table-note" role="status">{data.total} matching assessments · Page {data.page} of {data.totalPages}</p>
        {data.rows.length ? <div className="ts-table-scroll" tabIndex={0} aria-label="Assessments, scroll for more columns"><table><caption className="ts-visually-hidden">Manager assessment repository</caption><thead><tr><th>Reference / Company</th><th>Status</th><th>Assessor</th><th>Scheduled</th><th>Updated</th><th>SLA</th><th>Certificate</th><th>Open</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td><strong>{row.companyName || 'Company not recorded'}</strong><small>{row.deviceModel || 'Device not recorded'}</small><small>{row.id}{row.deletedAt ? ' · Archived' : ''}</small></td><td><StatusBadge status={row.status} /></td><td>{row.assignedAssessorName || row.assessorName || 'Unassigned'}</td><td>{formatDate(row.scheduledDate)}</td><td>{formatDate(row.updatedAt)}</td><td><StatusBadge status={row.sla?.status} /></td><td>{certificateState(row)}</td><td><a className="ts-button ts-button-secondary" aria-label={`Open ${row.companyName || row.id}`} href={assessmentHref(row.id)}>Open</a></td></tr>)}</tbody></table></div> : <div className="ts-empty"><h2>{Object.entries(query.filters).some(([k,v]) => k !== 'sortBy' && Boolean(v)) ? 'No assessments match these filters' : 'No assessments yet'}</h2><p>Use Clear Filters or refresh to load the latest records.</p></div>}
        <div className="ts-pagination" aria-label="Assessment pagination"><button className="ts-button ts-button-secondary" disabled={request.loading || data.page <= 1} onClick={() => setQuery(previous => ({...previous, page: previous.page - 1}))}>Previous page</button><label>Rows per page<select value={query.limit} onChange={e => setQuery(previous => ({...previous, page: 1, limit: Number(e.target.value)}))}>{[10,25,50,100].map(n => <option key={n}>{n}</option>)}</select></label><button className="ts-button ts-button-secondary" disabled={request.loading || data.page >= data.totalPages} onClick={() => setQuery(previous => ({...previous, page: previous.page + 1}))}>Next page</button></div>
      </>}
    </section>
  </ManagerLayout>;
}
