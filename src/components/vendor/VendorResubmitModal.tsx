import { useState, type FormEvent } from 'react';
import { Modal } from '../common/Modal';
import { submitVendorResubmit } from '../../services/vendorAssessments';
import type { VendorAssessment } from '../../types/vendor';

interface VendorResubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: VendorAssessment | null;
  onResubmitted: () => void;
}

export function VendorResubmitModal({
  isOpen,
  onClose,
  assessment,
  onResubmitted
}: VendorResubmitModalProps) {
  const [deviceModel, setDeviceModel] = useState(assessment?.deviceModel || '');
  const [responseNotes, setResponseNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!assessment) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!responseNotes.trim()) {
      setError('Remediation notes / corrections explanation is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitVendorResubmit(assessment._id, deviceModel, responseNotes.trim());
      setResponseNotes('');
      onResubmitted();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resubmission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const feedbackText =
    assessment.rejectionReason ||
    'Inspection committee requested technical clarifications or evidence adjustments.';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Respond to Revision & Resubmit"
      subtitle={`Assessment: ${assessment.companyName} (Current: v${assessment.currentVersion})`}
      isSubmitting={isSubmitting}
    >
      <div
        style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#991B1B',
            textTransform: 'uppercase'
          }}
        >
          Manager Feedback / Revision Note:
        </div>
        <div
          id="resubmit-reason-text"
          style={{
            fontSize: 13.5,
            color: '#7F1D1D',
            marginTop: 4,
            fontWeight: 600
          }}
        >
          {feedbackText}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="action-banner banner-danger"
            style={{ marginBottom: 16 }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="resubmit-device-model">
            Hardware Device Model (Verify / Correct if required)
          </label>
          <input
            type="text"
            id="resubmit-device-model"
            className="form-input"
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="resubmit-notes">
            Vendor Remediation Notes / Corrections Made *
          </label>
          <textarea
            id="resubmit-notes"
            className="form-textarea"
            rows={4}
            required
            placeholder="Detail the corrections made, replacement evidence attached, or technical clarifications for the assessor…"
            value={responseNotes}
            onChange={(e) => setResponseNotes(e.target.value)}
          />
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 16 }}>
          Submitting this response will increment the assessment version and queue your submission for assessor re-evaluation.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            id="btn-submit-resubmit"
            className="btn-action-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting Revision…' : 'Submit Revision & Queue for Inspection'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

