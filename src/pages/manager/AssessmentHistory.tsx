import {useCallback, useState} from 'react';
import {getAssessmentHistory, getAssessmentVersion} from '../../services/managerAssessments';
import {useApi} from '../../hooks/useApi';
import {RequestState} from '../../components/common/RequestState';
import {Fields, TechnicalAssessment} from '../../components/common/AssessmentReadout';
import {formatDate, formatDateTime} from '../../utils/format';
import {compareAssessmentVersions} from '../../utils/versionComparison';
import type {ManagerAssessment} from '../../types/managerAssessment';
import {StatusBadge} from '../../components/common/StatusBadge';

function VersionViewer({id, version, compare}: {id: string; version: number; compare: number | null}) {
  const load = useCallback(async (signal: AbortSignal) => {
    const selected = await getAssessmentVersion(id, version, signal);
    const other = compare === null ? null : await getAssessmentVersion(id, compare, signal);
    return {selected, other};
  }, [id, version, compare]);
  const request = useApi(load), data = request.data;
  return <section aria-label="Historical version"><h3>Version {version} snapshot</h3><RequestState {...request} retry={request.refresh} hasData={data !== null} subject="version" />{data && <>
    <Fields values={[["Version", data.selected.versionNumber], ["Submitted", formatDateTime(data.selected.createdAt)], ["Submitted by", data.selected.actor], ["Submission action", data.selected.action?.replaceAll('_', ' ')], ["Revision reason", data.selected.changeReason], ["Approved snapshot", data.selected.isApprovedVersion ? 'Yes' : 'No'], ["Certified snapshot", data.selected.isCertifiedVersion ? 'Yes' : 'No'], ["Approved by", data.selected.approvedBy], ["Approved date", formatDateTime(data.selected.approvedAt)], ["Company in snapshot", data.selected.metadata.companyName], ["Device in snapshot", data.selected.metadata.deviceModel], ["Assessment date", formatDate(data.selected.metadata.assessmentDate)], ["Rubric", data.selected.metadata.rubricVersion]]} />
    <TechnicalAssessment scores={data.selected.scores} breakdown={data.selected.breakdown} />
    {data.other && <section aria-label="Version comparison"><h3>Compare version {compare} with version {version}</h3><p>Total score: {data.other.scores.totalScore ?? 'Not recorded'} → {data.selected.scores.totalScore ?? 'Not recorded'}</p><div className="ts-table-scroll" tabIndex={0} aria-label="Version comparison, scroll for more columns"><table><caption>Criterion changes by stored criterion ID</caption><thead><tr><th>Criterion</th><th>Version {compare}</th><th>Version {version}</th><th>Change</th></tr></thead><tbody>{compareAssessmentVersions(data.other, data.selected).map(row => <tr key={row.id}><td>{row.name}</td><td className="ts-comment">{row.older ? <>{row.older.selectedOption || 'Not recorded'} · {row.older.points ?? 'Not recorded'} points<br />{row.older.comment}</> : 'Not present'}</td><td className="ts-comment">{row.newer ? <>{row.newer.selectedOption || 'Not recorded'} · {row.newer.points ?? 'Not recorded'} points<br />{row.newer.comment}</> : 'Not present'}</td><td>{row.changed ? 'Changed' : 'Unchanged'}</td></tr>)}</tbody></table></div></section>}
  </>}</section>;
}
export function AssessmentHistory({record}: {record: ManagerAssessment}) {
  const load = useCallback((signal: AbortSignal) => getAssessmentHistory(record.id, signal), [record.id]);
  const request = useApi(load);
  const [selected, setSelected] = useState<number | null>(null), [compare, setCompare] = useState<number | null>(null);
  return <><h2>History</h2><RequestState {...request} retry={request.refresh} hasData={request.data !== null} subject="history" />{request.data && <>
    <Fields values={[["Current version", request.data.currentVersion], ["Approved version", request.data.approvedVersion], ["Certified version", request.data.certifiedVersion]]} />
    <p>Version entries are returned by the history service. Legacy records without stored snapshots may return a baseline version.</p>
    {request.data.history.length ? <div className="ts-table-scroll" tabIndex={0} aria-label="Version history, scroll for more columns"><table><caption>Assessment version history</caption><thead><tr><th>Version</th><th>Event</th><th>Actor</th><th>Submitted</th><th>Score</th><th>Markers</th></tr></thead><tbody>{request.data.history.map(v => <tr key={v.versionNumber}><td>{v.versionNumber}</td><td>{v.action?.replaceAll('_', ' ') || 'Not recorded'}<small>{v.changeReason}</small></td><td>{v.actor}<small>{v.actorRole}</small></td><td>{formatDateTime(v.createdAt)}</td><td>{v.scores.totalScore ?? 'Not recorded'}</td><td>{[v.isApprovedVersion ? 'Approved' : '', v.isCertifiedVersion ? 'Certified' : ''].filter(Boolean).join(' · ') || 'No marker'}</td></tr>)}</tbody></table></div> : <p>No version history returned.</p>}
    <div className="ts-version-controls"><label>View version<select value={selected ?? ''} onChange={e => {setSelected(e.target.value ? Number(e.target.value) : null);setCompare(null);}}><option value="">Select a version</option>{request.data.history.map(v => <option key={v.versionNumber} value={v.versionNumber}>Version {v.versionNumber}</option>)}</select></label>{selected !== null && <label>Compare with<select value={compare ?? ''} onChange={e => setCompare(e.target.value ? Number(e.target.value) : null)}><option value="">No comparison</option>{request.data.history.filter(v => v.versionNumber !== selected).map(v => <option key={v.versionNumber} value={v.versionNumber}>Version {v.versionNumber}</option>)}</select></label>}</div>
    {selected !== null && <VersionViewer key={`${record.id}-${selected}-${compare}`} id={record.id} version={selected} compare={compare} />}
  </>}
  <h3>Lifecycle events</h3>{record.statusHistory.length ? <ol className="ts-events">{record.statusHistory.map((event, index) => <li key={index}><StatusBadge status={event.status} /><p>{event.actor || 'Actor not recorded'} · {formatDateTime(event.timestamp)}</p><p className="ts-comment">{event.note}</p></li>)}</ol> : <p>No lifecycle events recorded.</p>}
  </>;
}
