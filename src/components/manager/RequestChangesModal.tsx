/**
 * Request Changes (Revision Request) Modal
 * Steps 7, 8 & 9: Explicit confirmation, required revision reason, single-submit protection.
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import { requestChanges, type ApprovalResponse } from '../../services/managerMutations';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface RequestChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  reviewComment?: string;
  onSuccess: (result: ApprovalResponse) => void;
}

export function RequestChangesModal({
  isOpen,
  onClose,
  record,
  reviewComment = '',
  onSuccess
}: RequestChangesModalProps) {
  const [reason, setReason] = useState(reviewComment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length > 0;

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!isValid) {
      setError('Please provide specific revision instructions or remediation notes for the assessor.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await requestChanges(record.id, trimmedReason, trimmedReason, undefined, record.currentVersion ?? 0);
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to request changes.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Changes from Assessor"
      subtitle={`Assessment ${record.id}`}
      isSubmitting={isSubmitting}
    >
      <div className="ts-modal-summary">
        <p>
          <strong>Company:</strong> {record.companyName || 'Not recorded'}
        </p>
        <p>
          <strong>Device Model:</strong> {record.deviceModel || 'Not recorded'}
        </p>
        <p>
          <strong>Assessor:</strong> {record.assessorName || record.assignedAssessorName || 'Not assigned'}
        </p>
      </div>

      <div className="ts-form-group">
        <label htmlFor="request-changes-reason">
          Revision Instructions / Reason for Changes <span className="ts-required">*</span>
          <small> ({2000 - reason.length} characters remaining)</small>
        </label>
        <textarea
          id="request-changes-reason"
          className="ts-textarea"
          rows={4}
          maxLength={2000}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(null);
          }}
          placeholder="State clearly which criteria require revised evidence or additional documentation..."
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="ts-info-box">
        <p>
          Submitting this request will update the status to <strong>Changes Requested</strong>. The assessor will be notified to revise evidence and submit an updated version. Old version snapshots remain strictly immutable.
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
          type="button"
          className="ts-button ts-button-danger"
          onClick={handleSubmit}
          disabled={isSubmitting || !isValid}
        >
          {isSubmitting ? 'Submitting Request...' : 'Send Revision Request'}
        </button>
      </div>
    </Modal>
  );
}

