/**
 * Sign Certificate Modal (Phase D - Step 3)
 * Manager records the official signature and endorsement from the Director General Office (DGO).
 * Advances overall status to 'certificate_issued'.
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import {
  recordSignature,
  type CertificateActionResponse
} from '../../services/certificateActions';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface SignModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  onSuccess: (result: CertificateActionResponse) => void;
}

export function SignModal({
  isOpen,
  onClose,
  record,
  onSuccess
}: SignModalProps) {
  const todayStr = new Date().toISOString().split('T')[0] || '';
  const [signedBy, setSignedBy] = useState(
    record.certificate.signedBy || "Dato' Ts. Dr. Siti Zaharah Ishak"
  );
  const [signedDate, setSignedDate] = useState(
    record.certificate.signedDate?.split('T')[0] || todayStr
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const certNumber = record.certificate.certificateNumber || 'Pending';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedSignatory = signedBy.trim();
    if (!trimmedSignatory) {
      setError('Authorized DGO Signatory Name is required.');
      return;
    }
    if (!signedDate) {
      setError('Date signed is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await recordSignature({
        id: record.id,
        expectedVersion: record.currentVersion ?? 0,
        signedBy: trimmedSignatory,
        signedDate
      });
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to record certificate signature.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Step 3: Record DGO Signature"
      subtitle={`Assessment ${record.id}`}
      isSubmitting={isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <div className="ts-modal-summary">
          <p>
            <strong>Certificate Number:</strong>{' '}
            <span className="ts-record-id">{certNumber}</span>
          </p>
          <p>
            <strong>Company:</strong> {record.companyName || 'Not recorded'}
          </p>
          <p>
            <strong>Device Model:</strong> {record.deviceModel || 'Not recorded'}
          </p>
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-sign-name">
            Authorized DGO Signatory Name <span className="ts-required">*</span>
          </label>
          <input
            id="cert-sign-name"
            type="text"
            className="ts-input"
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            placeholder="e.g. Dato' Ts. Dr. Siti Zaharah Ishak"
            disabled={isSubmitting}
            required
          />
          <small>Enter the official name of the Director General or authorized signatory.</small>
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-sign-date">
            Date Signed <span className="ts-required">*</span>
          </label>
          <input
            id="cert-sign-date"
            type="date"
            className="ts-input"
            value={signedDate}
            onChange={(e) => setSignedDate(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="ts-info-box">
          <p>
            Recording the DGO signature will advance the overall status to <strong>certificate_issued</strong>. This officially activates the public QR verification registry and unlocks Vendor portal PDF download.
          </p>
        </div>

        {error && (
          <div className="ts-alert ts-alert-danger" role="alert">
            {error}
          </div>
        )}

        <div className="ts-modal-footer">
          <button
            type="button"
            className="ts-button ts-button-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="ts-button ts-button-approve"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Recording...' : 'Record DGO Signature'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

