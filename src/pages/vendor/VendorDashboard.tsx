import type { VendorAssessment } from '../../types/vendor';
import { RequiredActionCard } from '../../components/vendor/RequiredActionCard';
import { VendorAssessmentCard } from '../../components/vendor/VendorAssessmentCard';

interface VendorDashboardProps {
  evaluations: VendorAssessment[];
  onViewHistory: (assessment: VendorAssessment) => void;
  onViewDocuments: (assessment: VendorAssessment) => void;
  onRespondRevision: (assessment: VendorAssessment) => void;
}

function formatStatusName(status?: string): string {
  if (!status) return 'PENDING';
  if (['pre_final_sent', 'payment_confirmed'].includes(status)) return 'APPROVED';
  if (status === 'rejected') return 'REVISION REQUIRED';
  return status.replace(/_/g, ' ').toUpperCase();
}

export function VendorDashboard({
  evaluations,
  onViewHistory,
  onViewDocuments,
  onRespondRevision
}: VendorDashboardProps) {
  const primary = evaluations[0] || null;
  const isCertReady =
    primary &&
    ['certificate_issued', 'completed'].includes(primary.status) &&
    primary.certificate?.certificateNumber;

  const pendingActions = evaluations.filter(
    (e) => e.status === 'rejected' || Boolean(e.rejectionReason)
  );

  return (
    <div>
      {/* KPI Summary Grid */}
      <div className="kpi-grid" id="kpi-summary-grid">
        <div className="kpi-card">
          <div className="kpi-label">Active Submissions</div>
          <div className="kpi-value" id="kpi-active-count">
            {evaluations.length}
          </div>
          <div className="kpi-subtext">Registered telematics units</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">SLA Commitment</div>
          <div
            className="kpi-value"
            id="kpi-sla-status"
            style={{
              fontSize: 16,
              color: primary?.sla?.color || 'var(--success)'
            }}
          >
            {primary ? primary.sla?.label || 'ON TRACK' : 'N/A'}
          </div>
          <div className="kpi-subtext" id="kpi-sla-subtext">
            {primary ? primary.sla?.remainingFormatted || 'Within certification target' : 'No active submission'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Assessment Status</div>
          <div className="kpi-value" id="kpi-assessment-status" style={{ fontSize: 16 }}>
            {primary ? formatStatusName(primary.status) : 'N/A'}
          </div>
          <div className="kpi-subtext" id="kpi-assessment-subtext">
            Assessment progress
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Accreditation</div>
          <div
            className="kpi-value"
            id="kpi-cert-status"
            style={{
              fontSize: 16,
              color: isCertReady ? 'var(--primary)' : 'var(--navy)'
            }}
          >
            {primary ? (isCertReady ? 'ISSUED' : 'IN PROGRESS') : 'N/A'}
          </div>
          <div className="kpi-subtext" id="kpi-cert-subtext">
            Official MIROS endorsement
          </div>
        </div>
      </div>

      {/* Priority Action Alerts Area */}
      {pendingActions.length > 0 && (
        <div id="priority-alerts-area" style={{ marginBottom: 24 }}>
          {pendingActions.map((e) => (
            <RequiredActionCard
              key={e._id}
              assessment={e}
              onRespond={onRespondRevision}
            />
          ))}
        </div>
      )}

      {/* Main Evaluations List */}
      {evaluations.length === 0 ? (
        <div className="card empty-state">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <h3>No Evaluation Records Linked</h3>
          <p
            style={{
              marginTop: 8,
              maxWidth: 520,
              marginLeft: 'auto',
              marginRight: 'auto'
            }}
          >
            No commercial telematics hardware evaluations are currently registered for
            your company account. Once MIROS schedules your inspection, your evaluation
            progress and certificate will appear here.
          </p>
        </div>
      ) : (
        <div id="records-view">
          {evaluations.map((e) => (
            <VendorAssessmentCard
              key={e._id}
              assessment={e}
              onViewHistory={onViewHistory}
              onViewDocuments={onViewDocuments}
              onRespondRevision={onRespondRevision}
            />
          ))}
        </div>
      )}
    </div>
  );
}

