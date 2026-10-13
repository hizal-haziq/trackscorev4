import {useCallback, useRef, useState, type KeyboardEvent} from 'react';
import {ManagerLayout} from '../../components/layout/ManagerLayout';
import {Fields, TechnicalAssessment} from '../../components/common/AssessmentReadout';
import {RequestState} from '../../components/common/RequestState';
import {StatusBadge} from '../../components/common/StatusBadge';
import {useApi} from '../../hooks/useApi';
import {useAuth} from '../../hooks/useAuth';
import {useStatusStream} from '../../hooks/useStatusStream';
import {getAssessmentDetail} from '../../services/managerAssessments';
import {formatDate, formatTime} from '../../utils/format';
import {certificateState} from '../../utils/certificate';
import {AssessmentHistory} from './AssessmentHistory';
import {AssessmentRisk} from './AssessmentRisk';
import {ManagerActions} from '../../components/manager/ManagerActions';
import {CertificateSection} from '../../components/certificate/CertificateSection';

const sections = ['Overview','Actions','Vendor','Schedule & Assignment','Technical Assessment','History','SLA & Risk','Certificate'] as const;
export function AssessmentWorkspace({id}: {id: string}) {
  const {session} = useAuth();
  const load = useCallback((signal: AbortSignal) => getAssessmentDetail(id, signal), [id, session?.token]);
  const request = useApi(load);useStatusStream(session!.token, request.refresh);
  const [section, setSection] = useState<(typeof sections)[number]>('Overview');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null;
    if (target === null) return;event.preventDefault();setSection(sections[target]!);tabs.current[target]?.focus();
  };
  const record = request.data, index = sections.indexOf(section);
  return <ManagerLayout>
    <a href="#/assessments">← Back to assessments</a>
    <div className="ts-heading"><div><p className="ts-eyebrow">ASSESSMENT WORKSPACE</p><h1>{record?.companyName || 'Assessment workspace'}</h1><p>{record?.deviceModel || 'Device not recorded'} · <span className="ts-record-id">{id}</span></p></div><button className="ts-button" onClick={request.refresh} disabled={request.loading}>Refresh assessment</button></div>
    <RequestState {...request} retry={request.refresh} hasData={record !== null} subject="assessment" />
    {record && <>
      <div className="ts-workspace-tabs" role="tablist" aria-label="Assessment sections">{sections.map((name, i) => <button ref={element => {tabs.current[i] = element;}} type="button" role="tab" id={`workspace-tab-${i}`} aria-selected={section === name} aria-controls="workspace-panel" tabIndex={section === name ? 0 : -1} onClick={() => setSection(name)} onKeyDown={event => keyboard(event, i)} key={name}>{name}</button>)}</div>
      <section id="workspace-panel" className="ts-panel ts-workspace-panel" role="tabpanel" aria-labelledby={`workspace-tab-${index}`} tabIndex={0}>
        {section === 'Overview' && <><h2>Overview</h2><Fields values={[["Assessment ID", record.id], ["Company", record.companyName], ["Device", record.deviceModel], ["Status", <StatusBadge status={record.status} />], ["Created", formatDate(record.createdAt)], ["Updated", formatDate(record.updatedAt)], ["Current version", record.currentVersion], ["Approved version", record.approvedVersion], ["Certified version", record.certificate.certifiedVersion], ["Archive state", record.deletedAt ? 'Archived' : 'Active'], ["Certificate lifecycle", certificateState(record)]]} /></>}
        {section === 'Actions' && <ManagerActions key={record.id} record={record} onRefresh={request.refresh} />}
        {section === 'Vendor' && <><h2>Vendor</h2><Fields values={[["Company", record.companyName], ["Contact person", record.contactPerson], ["Contact email", record.contactEmail], ["Contact phone", record.contactPhone], ["Office address", record.officeAddress], ["State", record.state], ["Package", record.packageName], ["Registration reference", record.registrationReferenceId]]} /><h3>Document summary</h3>{record.documents.length ? <ul className="ts-events">{record.documents.map((doc, i) => <li key={i}>{doc.name || 'Name not recorded'} · {doc.category || 'Category not recorded'} · {formatDate(doc.uploadedAt)}</li>)}</ul> : <p>No document metadata recorded.</p>}</>}
        {section === 'Schedule & Assignment' && <><h2>Schedule & Assignment</h2><Fields values={[["Scheduled date", formatDate(record.scheduledDate)], ["Scheduled time", formatTime(record.scheduledDate)], ["Assessment date", formatDate(record.assessmentDate)], ["Assigned assessor", record.assignedAssessorName || record.assessorName], ["Assessor ID", record.assignedAssessorId || record.assessorId], ["Assignment", record.assignedAssessorId || record.assessorId || record.assignedAssessorName || record.assessorName ? 'Assigned' : 'Unassigned'], ["SLA deadline", formatDate(record.sla?.deadline)]]} /></>}
        {section === 'Technical Assessment' && <><h2>Technical Assessment</h2><Fields values={[["Current version", record.currentVersion], ["Rubric", record.rubricVersion]]} /><TechnicalAssessment scores={record} breakdown={record.breakdown} review={record.managerReviewComment} /></>}
        {section === 'History' && <AssessmentHistory key={record.id} record={record} />}
        {section === 'SLA & Risk' && <><h2>SLA & Risk</h2><Fields values={[["SLA state", <StatusBadge status={record.sla?.status} />], ["Started", formatDate(record.sla?.startAt)], ["Deadline", formatDate(record.sla?.deadline)], ["Duration in days", record.sla?.durationDays], ["Time remaining", record.sla?.remainingFormatted], ["Overdue", record.sla?.overdueFormatted]]} /><AssessmentRisk key={record.id} id={record.id} /></>}
        {section === 'Certificate' && <CertificateSection key={record.id} record={record} onRefresh={request.refresh} />}
      </section><p className="ts-portal-link">Legacy workflow actions and certificate tools remain available in the <a href="/dashboard.html">Manager portal ↗</a>.</p>
    </>}
  </ManagerLayout>;
}
