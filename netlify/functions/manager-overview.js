import { attachSlaToRecord, computeSlaAggregateSummary } from './sla.js';
import { calculateAssessorWorkloads } from './get-assessor-workload.js';
import { requiresCertificateAction } from './certificate-eligibility.js';
export { requiresCertificateAction } from './certificate-eligibility.js';

const REVIEW = new Set(['submitted', 'pending_review']);
// Existing "rejected" workflow returns work to the Assessor for revisions.
const CLOSED = new Set(['completed', 'cancelled']);
export function summarizeManagerDashboard(rawRecords, assessors, params = {}, now = new Date()) {
  const records = rawRecords.filter(r => !r.deletedAt && r.status !== 'inquiry' && r.recordType !== 'inquiry').map(r => attachSlaToRecord(r));
  const status = r => String(r.status || '').toLowerCase();
  const review = r => REVIEW.has(status(r));
  const certificate = requiresCertificateAction;
  const sla = computeSlaAggregateSummary(records);
  const compact = r => ({ _id: String(r._id || r.id), companyName: r.companyName || 'Not recorded', deviceModel: r.deviceModel || '', assessorName: r.assignedAssessorName || r.assignedAssessor || r.assessorName || 'Not assigned', status: r.status, sla: r.sla, updatedAt: r.updatedAt || r.statusChangedAt || r.createdAt || null, scheduledDate: r.scheduledDate || null });
  const time = r => new Date(r.updatedAt || r.statusChangedAt || r.createdAt || 0).getTime() || 0;
  const priorities = records.map(r => {
    if (r.sla?.status === 'OVERDUE') return { r, priority: 0, reason: 'Assessment overdue', action: review(r) ? 'Review' : 'Details', kind: 'details' };
    if (review(r)) return { r, priority: 2, reason: 'Assessment waiting for review', action: 'Review', kind: 'details' };
    if (certificate(r)) return { r, priority: 3, reason: 'Certificate awaiting action', action: 'Issue', kind: 'certificate' };
    if (r.sla?.status === 'DUE_SOON') return { r, priority: 4, reason: 'Assessment due soon', action: 'Details', kind: 'details' };
    return null;
  }).filter(Boolean).sort((a, b) => a.priority - b.priority || time(a.r) - time(b.r));
  const query = String(params.q || '').trim().toLowerCase();
  const matchesStatus = r => !params.overviewStatus || params.overviewStatus === 'all' || (params.overviewStatus === 'review' ? review(r) : params.overviewStatus === 'revision' ? ['rejected', 'remediation_required'].includes(status(r)) : params.overviewStatus === 'approved' ? ['approved', 'pre_final_sent', 'payment_confirmed'].includes(status(r)) : status(r) === params.overviewStatus);
  const filtered = records.filter(r => (!query || [r.companyName, r.deviceModel, r.assessorName, r.assignedAssessorName, r.assignedAssessor].some(v => String(v || '').toLowerCase().includes(query))) && matchesStatus(r) && (!params.overviewSla || params.overviewSla === 'all' || r.sla?.status === params.overviewSla));
  // Explicit business timezone; browser and host timezone cannot move appointments to another day.
  const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const scheduled = records.filter(r => r.scheduledDate && !['completed', 'cancelled', 'rejected'].includes(status(r)) && !Number.isNaN(new Date(r.scheduledDate).getTime()) && day(new Date(r.scheduledDate)) === day(now)).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
  return {
    metrics: { active: records.filter(r => !CLOSED.has(status(r))).length, review: records.filter(review).length, dueSoon: sla.dueSoon, overdue: sla.overdue, unassigned: records.filter(r => ['registered', 'scheduled'].includes(status(r)) && !r.assignedAssessorId && !r.assessorId && !r.assignedAssessor && !r.assignedAssessorName).length, certificates: records.filter(certificate).length, certificateReady: records.filter(r => certificate(r) && !r.certificate?.preparedDate).length, certificateInProgress: records.filter(r => certificate(r) && r.certificate?.preparedDate).length },
    slaSummary: sla,
    total: records.length,
    attentionTotal: priorities.length,
    attention: priorities.slice(0, 8).map(({ r, reason, action, kind }) => ({ ...compact(r), reason, action, kind })),
    recentTotal: filtered.length,
    recent: filtered.sort((a, b) => time(b) - time(a)).slice(0, 8).map(compact),
    schedule: scheduled.map(compact),
    workload: calculateAssessorWorkloads(assessors, records)
  };
}
