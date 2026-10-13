import type { VendorAssessment } from '../../types/vendor';

interface RequiredActionCardProps {
  assessment: VendorAssessment;
  onRespond: (assessment: VendorAssessment) => void;
}

export function RequiredActionCard({ assessment, onRespond }: RequiredActionCardProps) {
  const reason =
    assessment.rejectionReason ||
    'Inspection committee requested technical remediation notes or supporting evidence.';

  return (
    <div className="action-banner banner-danger" role="alert">
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
          ⚠️ Action Required: Revisions Requested
        </div>
        <strong style={{ fontSize: 14 }}>
          {assessment.deviceModel || assessment.companyName}:
        </strong>{' '}
        <span style={{ fontSize: 13 }}>{reason}</span>
      </div>
      <button
        type="button"
        className="btn-action-primary"
        onClick={() => onRespond(assessment)}
      >
        Respond to Revision
      </button>
    </div>
  );
}

