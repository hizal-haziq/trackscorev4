/**
 * Central Manager Actions Panel
 * Steps 5-25: Governs Manager Review, Request Changes, Approval, Scheduling, and Assignment.
 */

import { useState } from 'react';
import type { ManagerAssessment } from '../../types/managerAssessment';
import { StatusBadge } from '../common/StatusBadge';
import { certificateState } from '../../utils/certificate';
import { formatDate } from '../../utils/format';
import { ApproveModal } from './ApproveModal';
import { RequestChangesModal } from './RequestChangesModal';
import { ScheduleModal } from './ScheduleModal';
import { AssignAssessorModal } from './AssignAssessorModal';
import { PrepareModal } from '../certificate/PrepareModal';
import { PrintModal } from '../certificate/PrintModal';
import { SignModal } from '../certificate/SignModal';
import { DeliverModal } from '../certificate/DeliverModal';
import {
  downloadCertificatePdf,
  type CertificateActionResponse
} from '../../services/certificateActions';
import type {
  ApprovalResponse,
  ScheduleResponse,
  AssignResponse
} from '../../services/managerMutations';

interface ManagerActionsProps {
  record: ManagerAssessment;
  onRefresh: () => void;
}

export function ManagerActions({ record, onRefresh }: ManagerActionsProps) {
  const [activeModal, setActiveModal] = useState<
    | 'approve'
    | 'requestChanges'
    | 'schedule'
    | 'assign'
    | 'prepare'
    | 'print'
    | 'sign'
    | 'deliver'
    | null
  >(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [managerReviewNotes, setManagerReviewNotes] = useState(
    record.managerReviewComment || ''
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const status = record.status;
  const isAwaitingReview = ['pending_review', 'submitted'].includes(status);
  const isSchedulable = ['registered', 'scheduled'].includes(status);
  const isCompletedOrApproved = ['completed', 'approved', 'cancelled'].includes(status);
  const currentAssessor = record.assignedAssessorName || record.assessorName;
  const isAssigned = Boolean(currentAssessor);
  const isAssignAllowed = !isCompletedOrApproved;
  const certState = certificateState(record);
  const cert = record.certificate;
  const isApproved =
    Boolean(record.approvedVersion) &&
    ['approved', 'certificate_issued', 'completed'].includes(status);
  const isCompleted = status === 'completed' || Boolean(cert.sentToCustomerDate);
  const isSigned = Boolean(cert.signedDate);
  const isPrinted = Boolean(cert.printedDate);
  const isPrepared = Boolean(cert.preparedDate) && Boolean(cert.certificateNumber);
  const canPrepare = isApproved && !isCompleted;
  const canPrint = isPrepared && !isCompleted && !isPrinted;
  const canSign = isPrinted && !isCompleted && !isSigned;
  const canDeliver = isSigned && !isCompleted;
  const canDownloadPdf = Boolean(cert.certificateNumber);

  const handleCertSuccess = (result: CertificateActionResponse, actionName: string) => {
    setFeedback({
      type: 'success',
      message: result.message || `Certificate ${actionName} completed successfully.`
    });
    onRefresh();
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf || !canDownloadPdf) return;
    setIsDownloadingPdf(true);
    setFeedback(null);
    try {
      await downloadCertificatePdf(record);
      setFeedback({
        type: 'success',
        message: 'Official Certificate PDF downloaded successfully!'
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to download certificate PDF.'
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleApprovalSuccess = (result: ApprovalResponse) => {
    setFeedback({
      type: 'success',
      message: result.message || 'Assessment successfully approved! Ready for certificate issuance.'
    });
    onRefresh();
  };

  const handleRequestChangesSuccess = (result: ApprovalResponse) => {
    setFeedback({
      type: 'success',
      message: result.message || 'Revision request submitted. Assessment returned to Assessor for corrections.'
    });
    onRefresh();
  };

  const handleScheduleSuccess = (result: ScheduleResponse) => {
    setFeedback({
      type: 'success',
      message: result.message || `Assessment successfully scheduled for ${result.scheduledDate}!`
    });
    onRefresh();
  };

  const handleAssignSuccess = (result: AssignResponse) => {
    let msg = result.message || `Task successfully assigned to ${result.assignedAssessor}!`;
    if (result.capacityWarning && result.capacityWarning.isOverCapacity) {
      setFeedback({
        type: 'warning',
        message: `${msg} — Note: ${result.capacityWarning.message}`
      });
    } else {
      setFeedback({
        type: 'success',
        message: msg
      });
    }
    onRefresh();
  };

  return (
    <div className="ts-manager-actions-area">
      <div className="ts-panel-heading">
        <h2>Manager Workflow Actions</h2>
        <span className="ts-badge ts-badge-neutral">
          Status: <StatusBadge status={status} />
        </span>
      </div>

      {feedback && (
        <div
          className={`ts-alert ts-alert-${feedback.type}`}
          role="status"
          style={{ margin: '16px 22px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{feedback.message}</span>
            <button
              type="button"
              className="ts-alert-dismiss"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss feedback"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Review Remarks Area */}
      <div className="ts-review-notes-card">
        <h3>Manager Review Remarks &amp; Internal Notes</h3>
        <p className="ts-text-muted">
          Add operational notes or compliance remarks before approving or requesting changes. Technical criterion values remain immutable.
        </p>
        <textarea
          className="ts-textarea"
          rows={3}
          maxLength={2000}
          value={managerReviewNotes}
          onChange={(e) => setManagerReviewNotes(e.target.value)}
          placeholder="Enter compliance sign-off remarks, review notes, or assessor feedback..."
        />
        <div className="ts-textarea-meta">
          <small>{2000 - managerReviewNotes.length} characters remaining</small>
        </div>
      </div>

      {/* Action Cards Grid */}
      <div className="ts-actions-grid">
        {/* Card 1: Review & Approval */}
        <div className="ts-action-card">
          <div className="ts-action-card-header">
            <h4>Evaluation Review &amp; Approval</h4>
            {isAwaitingReview ? (
              <span className="ts-badge ts-badge-warning">Awaiting Review</span>
            ) : status === 'approved' ? (
              <span className="ts-badge ts-badge-success">Approved</span>
            ) : status === 'rejected' ? (
              <span className="ts-badge ts-badge-danger">Changes Requested</span>
            ) : (
              <span className="ts-badge ts-badge-neutral">Not Submitted</span>
            )}
          </div>
          <p className="ts-action-card-desc">
            {isAwaitingReview
              ? `Version ${record.currentVersion || 1} has been submitted by the assessor with all criteria completed. Review evidence and approve or request changes.`
              : status === 'approved'
              ? `Approved by Manager (Version ${record.approvedVersion || 1}). Assessment is ready for certificate issuance.`
              : status === 'rejected'
              ? 'Changes requested from the assessor. Waiting for updated revision.'
              : 'Evaluation is in progress or not yet submitted for Manager review.'}
          </p>
          <div className="ts-action-card-buttons">
            <button
              type="button"
              className="ts-button ts-button-danger"
              disabled={!isAwaitingReview}
              onClick={() => setActiveModal('requestChanges')}
            >
              Request Changes
            </button>
            <button
              type="button"
              className="ts-button ts-button-approve"
              disabled={!isAwaitingReview || record.breakdown.length !== 33}
              onClick={() => setActiveModal('approve')}
            >
              Approve Assessment
            </button>
          </div>
        </div>

        {/* Card 2: Scheduling */}
        <div className="ts-action-card">
          <div className="ts-action-card-header">
            <h4>Inspection Scheduling</h4>
            {record.scheduledDate ? (
              <span className="ts-badge ts-badge-success">
                {formatDate(record.scheduledDate)}
              </span>
            ) : (
              <span className="ts-badge ts-badge-warning">Unscheduled</span>
            )}
          </div>
          <p className="ts-action-card-desc">
            {record.scheduledDate
              ? `Scheduled inspection on ${formatDate(record.scheduledDate)}. You may update inspection dates or notes.`
              : 'Set an official inspection date and update equipment details for the fleet.'}
          </p>
          <div className="ts-action-card-buttons">
            <button
              type="button"
              className="ts-button ts-button-secondary"
              disabled={!isSchedulable && isCompletedOrApproved}
              onClick={() => setActiveModal('schedule')}
            >
              {record.scheduledDate ? 'Reschedule Inspection' : 'Schedule Inspection'}
            </button>
          </div>
        </div>

        {/* Card 3: Assessor Assignment */}
        <div className="ts-action-card">
          <div className="ts-action-card-header">
            <h4>Assessor Assignment</h4>
            {isAssigned ? (
              <span className="ts-badge ts-badge-success">{currentAssessor}</span>
            ) : (
              <span className="ts-badge ts-badge-warning">Unassigned</span>
            )}
          </div>
          <p className="ts-action-card-desc">
            {isAssigned
              ? `Assigned to ${currentAssessor}${record.assignedAssessorId ? ` (${record.assignedAssessorId})` : ''}. You may reassign to another registered assessor.`
              : 'Assign this evaluation task to a registered assessor with available workload capacity.'}
          </p>
          <div className="ts-action-card-buttons">
            <button
              type="button"
              className="ts-button"
              disabled={!isAssignAllowed}
              onClick={() => setActiveModal('assign')}
            >
              {isAssigned ? 'Reassign Assessor' : 'Assign Assessor'}
            </button>
          </div>
        </div>

        {/* Card 4: Certificate Lifecycle Management */}
        <div className="ts-action-card">
          <div className="ts-action-card-header">
            <h4>Certificate Lifecycle Management</h4>
            <span className="ts-badge ts-badge-neutral">{certState}</span>
          </div>
          <p className="ts-action-card-desc">
            {certState === 'Completed'
              ? `Certificate #${cert.certificateNumber || ''} delivered to customer. Lifecycle completed.`
              : certState === 'Signed'
              ? `Certificate #${cert.certificateNumber || ''} signed by ${cert.signedBy || 'DGO'}. Ready for customer delivery.`
              : certState === 'Printed'
              ? `Certificate #${cert.certificateNumber || ''} printed and routed to DGO. Awaiting signature.`
              : certState === 'Prepared'
              ? `Certificate #${cert.certificateNumber || ''} prepared. Ready for physical printing.`
              : certState === 'Ready for Certificate'
              ? 'Assessment approved! Ready to prepare official certificate.'
              : 'Certificate issuance becomes available once the assessment is approved.'}
          </p>
          <div className="ts-action-card-buttons">
            {canPrepare && !isPrepared && (
              <button
                type="button"
                className="ts-button"
                onClick={() => setActiveModal('prepare')}
              >
                Prepare Certificate
              </button>
            )}
            {canPrint && (
              <button
                type="button"
                className="ts-button ts-button-secondary"
                onClick={() => setActiveModal('print')}
              >
                Mark Printed
              </button>
            )}
            {canSign && (
              <button
                type="button"
                className="ts-button ts-button-approve"
                onClick={() => setActiveModal('sign')}
              >
                Record DGO Signature
              </button>
            )}
            {canDeliver && (
              <button
                type="button"
                className="ts-button ts-button-secondary"
                onClick={() => setActiveModal('deliver')}
              >
                Deliver to Customer
              </button>
            )}
            {canDownloadPdf && (
              <button
                type="button"
                className="ts-button ts-button-secondary"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
              >
                {isDownloadingPdf ? 'Downloading...' : 'Download PDF 📄'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {activeModal === 'approve' && (
        <ApproveModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          reviewComment={managerReviewNotes}
          onSuccess={handleApprovalSuccess}
        />
      )}

      {activeModal === 'requestChanges' && (
        <RequestChangesModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          reviewComment={managerReviewNotes}
          onSuccess={handleRequestChangesSuccess}
        />
      )}

      {activeModal === 'schedule' && (
        <ScheduleModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={handleScheduleSuccess}
        />
      )}

      {activeModal === 'assign' && (
        <AssignAssessorModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={handleAssignSuccess}
        />
      )}

      {activeModal === 'prepare' && (
        <PrepareModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleCertSuccess(res, 'preparation')}
        />
      )}

      {activeModal === 'print' && (
        <PrintModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleCertSuccess(res, 'physical print')}
        />
      )}

      {activeModal === 'sign' && (
        <SignModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleCertSuccess(res, 'DGO signature')}
        />
      )}

      {activeModal === 'deliver' && (
        <DeliverModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleCertSuccess(res, 'delivery')}
        />
      )}
    </div>
  );
}

