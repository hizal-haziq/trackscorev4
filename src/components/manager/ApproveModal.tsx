/**
 * Manager Approval Confirmation Modal
 * Step 10 & 11: Explicit confirmation, complete version check, double-click protection.
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import { approveAssessment, type ApprovalResponse } from '../../services/managerMutations';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface ApproveModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  reviewComment?: string;
  onSuccess: (result: ApprovalResponse) => void;
}

export function ApproveModal({
  isOpen,
  onClose,
  record,
  reviewComment = '',
  onSuccess
}: ApproveModalProps) {
  const [comment, setComment] = useState(reviewComment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionNumber = record.currentVersion || 1;
  const isComplete = record.breakdown.length === 33;

  const handleConfirm = async () => {
    if (isSubmitting) return;

    if (!isComplete) {
      setError('Cannot approve: all 33 criteria must be evaluated by the assessor.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await approveAssessment(record.id, comment, undefined, record.currentVersion ?? 0);
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve assessment.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Manager Approval"
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
          <strong>Version to Approve:</strong> Version {versionNumber}{' '}
          <span className="ts-badge ts-badge-success">Score: {record.totalScore ?? 'N/A'}%</span>
        </p>
      </div>

      {!isComplete && (
        <div className="ts-alert ts-alert-danger" role="alert">
          Warning: This assessment only has {record.breakdown.length}/33 criteria recorded. A complete assessment version is required before approval.
        </div>
      )}

      <div className="ts-form-group">
        <label htmlFor="approve-comment">
          Manager Review Comment <small>(optional, up to 2000 characters)</small>
        </label>
        <textarea
          id="approve-comment"
          className="ts-textarea"
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add approval remarks or compliance sign-off notes..."
          disabled={isSubmitting}
        />
      </div>

      <div className="ts-info-box">
        <p>
          Upon approval, this assessment will transition to <strong>Approved</strong> and become ready for official certificate issuance in Phase D. Payment gating remains retired.
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
          className="ts-button ts-button-approve"
          onClick={handleConfirm}
          disabled={isSubmitting || !isComplete}
        >
          {isSubmitting ? 'Approving...' : 'Confirm & Approve Assessment'}
        </button>
      </div>
    </Modal>
  );
}

