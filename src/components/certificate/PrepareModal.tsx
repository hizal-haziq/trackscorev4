/**
 * Prepare Certificate Modal (Phase D - Step 1)
 * Manager assigns or confirms the official Certificate Number and sets the preparation date.
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import {
  prepareCertificate,
  type CertificateActionResponse
} from '../../services/certificateActions';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface PrepareModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  onSuccess: (result: CertificateActionResponse) => void;
}

export function PrepareModal({
  isOpen,
  onClose,
  record,
  onSuccess
}: PrepareModalProps) {
  const todayStr = new Date().toISOString().split('T')[0] || '';
  const defaultCertNum =
    record.certificate.certificateNumber ||
    `TS-CERT-${new Date().getFullYear()}-${record.id.slice(-4).toUpperCase()}`;

  const [certNum, setCertNum] = useState(defaultCertNum);
  const [prepDate, setPrepDate] = useState(
    record.certificate.preparedDate?.split('T')[0] || todayStr
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedCert = certNum.trim();
    if (!trimmedCert) {
      setError('Official Certificate Number is required.');
      return;
    }
    if (!prepDate) {
      setError('Preparation date is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await prepareCertificate({
        id: record.id,
        expectedVersion: record.currentVersion ?? 0,
        certificateNumber: trimmedCert,
        preparedDate: prepDate
      });
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to prepare certificate.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Step 1: Prepare Certificate"
      subtitle={`Assessment ${record.id}`}
      isSubmitting={isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <div className="ts-modal-summary">
          <p>
            <strong>Company:</strong> {record.companyName || 'Not recorded'}
          </p>
          <p>
            <strong>Device Model:</strong> {record.deviceModel || 'Not recorded'}
          </p>
          <p>
            <strong>Approved Assessment Version:</strong> Version{' '}
            {record.approvedVersion || 1}
          </p>
          <p>
            <strong>Technical Score:</strong> {record.totalScore ?? 'N/A'}%
          </p>
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-prep-number">
            Official Certificate Number <span className="ts-required">*</span>
          </label>
          <input
            id="cert-prep-number"
            type="text"
            className="ts-input"
            value={certNum}
            onChange={(e) => setCertNum(e.target.value)}
            placeholder="e.g. TS-CERT-2026-0042"
            disabled={isSubmitting}
            required
          />
          <small>Authoritative format: TS-CERT-YYYY-XXXX (can be customized if required).</small>
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-prep-date">
            Preparation Date <span className="ts-required">*</span>
          </label>
          <input
            id="cert-prep-date"
            type="date"
            className="ts-input"
            value={prepDate}
            onChange={(e) => setPrepDate(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="ts-info-box">
          <p>
            Preparing the certificate binds <strong>Version {record.approvedVersion || 1}</strong> as the certified snapshot. The status remains <strong>Approved</strong> until official DGO signature.
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
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Preparing...' : 'Confirm Preparation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

