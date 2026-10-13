/**
 * Print Certificate Modal (Phase D - Step 2)
 * Manager records physical printing and routing to the Director General Office (DGO).
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import {
  markPrintedCertificate,
  type CertificateActionResponse
} from '../../services/certificateActions';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  onSuccess: (result: CertificateActionResponse) => void;
}

export function PrintModal({
  isOpen,
  onClose,
  record,
  onSuccess
}: PrintModalProps) {
  const todayStr = new Date().toISOString().split('T')[0] || '';
  const [printDate, setPrintDate] = useState(
    record.certificate.printedDate?.split('T')[0] || todayStr
  );
  const [confirmed, setConfirmed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const certNumber = record.certificate.certificateNumber || 'Pending';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!printDate) {
      setError('Printed date is required.');
      return;
    }
    if (!confirmed) {
      setError('Please confirm physical printing and routing to DGO.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await markPrintedCertificate({
        id: record.id,
        expectedVersion: record.currentVersion ?? 0,
        printedDate: printDate
      });
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to record certificate print.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Step 2: Physical Printing & DGO Routing"
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
          <label htmlFor="cert-print-date">
            Printed Date <span className="ts-required">*</span>
          </label>
          <input
            id="cert-print-date"
            type="date"
            className="ts-input"
            value={printDate}
            onChange={(e) => setPrintDate(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="ts-form-group ts-checkbox">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>I confirm this certificate has been printed and physically routed to the Director General Office (DGO).</span>
          </label>
        </div>

        <div className="ts-info-box">
          <p>
            Once printed, the certificate document is routed for authorized endorsement. The next step is recording the official signature.
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
            className="ts-button"
            disabled={isSubmitting || !confirmed}
          >
            {isSubmitting ? 'Processing...' : 'Confirm Physical Print'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

