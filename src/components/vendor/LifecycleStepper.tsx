const BASE_STAGES = [
  { key: 'registered', label: 'Application Registered' },
  { key: 'scheduled', label: 'Assessment Scheduled' },
  { key: 'in_progress', label: 'Assessment In Progress' },
  { key: 'pending_review', label: 'Assessment Under Review' },
  { key: 'approved', label: 'Assessment Approved' },
  { key: 'certificate_preparation', label: 'Certificate In Preparation' },
  { key: 'certificate_issued', label: 'Certificate Available' },
  { key: 'completed', label: 'Completed' }
];

interface LifecycleStepperProps {
  status: string;
  isCertificatePrepared?: boolean;
}

export function LifecycleStepper({ status, isCertificatePrepared }: LifecycleStepperProps) {
  let mappedStatus = status || 'registered';
  if (['pre_final_sent', 'payment_confirmed'].includes(mappedStatus)) {
    mappedStatus = isCertificatePrepared ? 'certificate_preparation' : 'approved';
  } else if (isCertificatePrepared && mappedStatus === 'approved') {
    mappedStatus = 'certificate_preparation';
  }

  const stages = [...BASE_STAGES];
  if (mappedStatus === 'rejected') {
    stages.splice(4, 0, { key: 'rejected', label: 'Changes Requested' });
  }

  const milestone =
    mappedStatus === 'submitted'
      ? 'pending_review'
      : mappedStatus === 'assigned'
      ? 'scheduled'
      : mappedStatus;

  const currentIdx = stages.findIndex((s) => s.key === milestone);
  const progressPercent = currentIdx >= 0 ? (currentIdx / (stages.length - 1)) * 100 : 0;

  return (
    <div className="lifecycle-stepper" aria-label="Assessment Lifecycle Progress">
      <div className="step-line">
        <div
          className="step-line-progress"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>
      {stages.map((s, idx) => {
        let stateClass = '';
        if (idx < currentIdx) stateClass = 'completed';
        else if (idx === currentIdx) stateClass = 'current';

        return (
          <div key={s.key} className={`step-item ${stateClass}`}>
            <div className="step-icon">
              {idx < currentIdx ? '✓' : idx + 1}
            </div>
            <div className="step-label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

