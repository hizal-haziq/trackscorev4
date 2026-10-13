import type { VendorAssessment } from '../../types/vendor';
import { LifecycleStepper } from './LifecycleStepper';
import { VendorCertificateCard } from './VendorCertificateCard';

interface VendorAssessmentCardProps {
  assessment: VendorAssessment;
  onViewHistory: (assessment: VendorAssessment) => void;
  onViewDocuments: (assessment: VendorAssessment) => void;
  onRespondRevision: (assessment: VendorAssessment) => void;
}

function formatStatusName(status?: string): string {
  if (!status) return 'REGISTERED';
  if (['pre_final_sent', 'payment_confirmed'].includes(status)) return 'APPROVED';
  if (status === 'rejected') return 'REVISION REQUIRED';
  return status.replace(/_/g, ' ').toUpperCase();
}

export function VendorAssessmentCard({
  assessment,
  onViewHistory,
  onViewDocuments,
  onRespondRevision
}: VendorAssessmentCardProps) {
  const isRejected =
    assessment.status === 'rejected' || Boolean(assessment.rejectionReason);
  const docCount = Array.isArray(assessment.documents) ? assessment.documents.length : 0;
  const isCertPrepared = Boolean(assessment.certificate?.preparedDate);

  const statusBadgeClass = `badge-${assessment.status.replace(/_/g, '-')}`;

  return (
    <article className="card" aria-labelledby={`heading-${assessment._id}`}>
      <div className="card-header">
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--primary)',
              textTransform: 'uppercase'
            }}
          >
            Evaluation Registry Record (v{assessment.currentVersion || 1})
          </div>
          <h2 id={`heading-${assessment._id}`} className="card-title">
            {assessment.companyName || 'Telematics Customer'}
          </h2>
          {(assessment.officeAddress || assessment.state) && (
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              📍 {assessment.officeAddress}
              {assessment.officeAddress && assessment.state ? ', ' : ''}
              <strong>{assessment.state}</strong>
            </div>
          )}
          <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginTop: 4 }}>
            Hardware Model:{' '}
            <strong style={{ color: '#0F172A' }}>{assessment.deviceModel || 'N/A'}</strong>{' '}
            &bull; Package:{' '}
            <span style={{ color: '#0F172A' }}>
              {assessment.packageName || 'Standard Assessment'}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Status
          </div>
          <span className={`badge ${statusBadgeClass}`}>
            {formatStatusName(assessment.status)}
          </span>
        </div>
      </div>

      {/* Lifecycle Progress Stepper */}
      <LifecycleStepper
        status={assessment.status}
        isCertificatePrepared={isCertPrepared}
      />

      {/* Official Certificate Banner (if ready) */}
      <VendorCertificateCard assessment={assessment} />

      {/* Summary Details Grid */}
      <div className="details-grid">
        <div className="info-box">
          <div className="info-label">Invoice</div>
          <div className="info-value">
            {assessment.invoice?.invoiceNumber || 'Not assigned'}
          </div>
        </div>

        <div className="info-box">
          <div className="info-label">Assessment Schedule</div>
          <div className="info-value">
            {assessment.scheduledDate
              ? new Date(assessment.scheduledDate).toLocaleDateString('en-MY')
              : 'Date Pending'}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
            {assessment.assessmentDate
              ? `Evaluated on ${assessment.assessmentDate}`
              : 'Conducted by certified MIROS assessor'}
          </div>
        </div>

        <div className="info-box">
          <div className="info-label">Accreditation Result</div>
          <div className="info-value">
            {assessment.starsCount !== null && assessment.starsCount !== undefined
              ? '★'.repeat(assessment.starsCount) +
                '☆'.repeat(5 - assessment.starsCount) +
                ` (${assessment.starsCount} Stars)`
              : 'Awaiting Completion'}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
            {assessment.ratingLabel || 'Compliant with MIROS safety standards'}
          </div>
        </div>

        <div
          className="info-box"
          style={{
            borderLeft: `3px solid ${
              assessment.sla?.status === 'OVERDUE'
                ? '#EF4444'
                : assessment.sla?.status === 'DUE_SOON'
                ? '#F59E0B'
                : '#10B981'
            }`
          }}
        >
          <div className="info-label">Service Level Commitment</div>
          <div
            className="info-value"
            style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}
          >
            {assessment.sla?.targetDeadline
              ? new Date(assessment.sla.targetDeadline).toLocaleDateString('en-MY', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })
              : 'Under Scheduling'}
          </div>
          <div style={{ marginTop: 6 }}>
            <span
              className="badge"
              style={{
                background: assessment.sla?.bgColor || '#F0FDF4',
                color: assessment.sla?.color || '#15803D',
                borderColor: assessment.sla?.borderColor || '#BBF7D0',
                borderWidth: 1,
                borderStyle: 'solid',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 9999
              }}
            >
              {assessment.sla?.label || 'ON TRACK'}
            </span>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
              {assessment.sla?.remainingFormatted || '7-day standard certification target'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="card-actions-bar">
        <a
          href={`#/assessments/${assessment._id}`}
          className="btn-secondary"
        >
          <span>🔍</span> View Workspace
        </a>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onViewHistory(assessment)}
        >
          <span>📜</span> Assessment History (v{assessment.currentVersion || 1})
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onViewDocuments(assessment)}
        >
          <span>📁</span> Documents & Evidence ({docCount})
        </button>
        {isRejected && (
          <button
            type="button"
            className="btn-action-primary"
            onClick={() => onRespondRevision(assessment)}
          >
            <span>⚠️</span> Respond to Revision
          </button>
        )}
      </div>

      {/* Activity Timeline */}
      {Array.isArray(assessment.statusHistory) && assessment.statusHistory.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
            Evaluation Activity History
          </div>
          <div className="timeline">
            {assessment.statusHistory.map((h, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-dot"></div>
                <div className="timeline-content">
                  <strong>{formatStatusName(h.status)}</strong>: {h.note || 'Status updated'}
                </div>
                <div className="timeline-date">
                  {h.timestamp ? new Date(h.timestamp).toLocaleString() : 'Time not recorded'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

