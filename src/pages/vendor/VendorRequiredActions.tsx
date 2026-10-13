import type { VendorAssessment } from '../../types/vendor';
import { RequiredActionCard } from '../../components/vendor/RequiredActionCard';
import { VendorAssessmentCard } from '../../components/vendor/VendorAssessmentCard';

interface VendorRequiredActionsProps {
  evaluations: VendorAssessment[];
  onViewHistory: (assessment: VendorAssessment) => void;
  onViewDocuments: (assessment: VendorAssessment) => void;
  onRespondRevision: (assessment: VendorAssessment) => void;
}

export function VendorRequiredActions({
  evaluations,
  onViewHistory,
  onViewDocuments,
  onRespondRevision
}: VendorRequiredActionsProps) {
  const pendingActions = evaluations.filter(
    (e) => e.status === 'rejected' || Boolean(e.rejectionReason)
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>
          Required Actions Queue
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Assessments requiring vendor corrections, missing documentation, or technical clarifications.
        </p>
      </div>

      {pendingActions.length === 0 ? (
        <div className="card empty-state" style={{ background: '#ECFDF5', borderColor: '#A7F3D0' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <h3 style={{ color: '#065F46' }}>All Assessments On Track</h3>
          <p style={{ marginTop: 4, color: '#047857' }}>
            No actions or revisions are currently required for your submissions. You will receive an update once assessor review completes.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 20 }}>
            {pendingActions.map((e) => (
              <RequiredActionCard
                key={e._id}
                assessment={e}
                onRespond={onRespondRevision}
              />
            ))}
          </div>

          <div>
            {pendingActions.map((e) => (
              <VendorAssessmentCard
                key={e._id}
                assessment={e}
                onViewHistory={onViewHistory}
                onViewDocuments={onViewDocuments}
                onRespondRevision={onRespondRevision}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

