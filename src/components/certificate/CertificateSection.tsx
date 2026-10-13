/**
 * Certificate Section Component (Phase D)
 * Comprehensive manager certificate lifecycle workspace:
 * - Visual step pipeline (Prepare -> Print -> Sign -> Deliver)
 * - Authoritative certificate metadata & audit details
 * - Sequential lifecycle action triggers & modal orchestration
 * - Official Single-page A4 PDF download orchestrator (reuses certificate-pdf.js)
 * - Public QR verification registry link
 */

import { useState } from 'react';
import type { ManagerAssessment } from '../../types/managerAssessment';
import { Fields } from '../common/AssessmentReadout';
import { StatusBadge } from '../common/StatusBadge';
import { formatDate } from '../../utils/format';
import { certificateState } from '../../utils/certificate';
import {
  downloadCertificatePdf,
  type CertificateActionResponse
} from '../../services/certificateActions';
import { PrepareModal } from './PrepareModal';
import { PrintModal } from './PrintModal';
import { SignModal } from './SignModal';
import { DeliverModal } from './DeliverModal';

interface CertificateSectionProps {
  record: ManagerAssessment;
  onRefresh: () => void;
}

export function CertificateSection({
  record,
  onRefresh
}: CertificateSectionProps) {
  const [activeModal, setActiveModal] = useState<
    'prepare' | 'print' | 'sign' | 'deliver' | null
  >(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const cert = record.certificate;
  const status = record.status;
  const isApproved =
    Boolean(record.approvedVersion) &&
    ['approved', 'certificate_issued', 'completed'].includes(status);
  const isCompleted = status === 'completed' || Boolean(cert.sentToCustomerDate);
  const isSigned = Boolean(cert.signedDate);
  const isPrinted = Boolean(cert.printedDate);
  const isPrepared = Boolean(cert.preparedDate) && Boolean(cert.certificateNumber);
  const certNumber = cert.certificateNumber || '';

  // Sequential eligibility
  const canPrepare = isApproved && !isCompleted;
  const canPrint = isPrepared && !isCompleted && !isPrinted;
  const canSign = isPrinted && !isCompleted && !isSigned;
  const canDeliver = isSigned && !isCompleted;
  const canDownloadPdf = Boolean(certNumber);
  const canVerifyOnline = Boolean(certNumber && isSigned);

  const handleDownload = async () => {
    if (isDownloading || !canDownloadPdf) return;
    setIsDownloading(true);
    setFeedback(null);

    try {
      await downloadCertificatePdf(record);
      setFeedback({
        type: 'success',
        message: `Official Certificate PDF for ${certNumber} downloaded successfully!`
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to download certificate PDF.';
      setFeedback({
        type: 'error',
        message: msg
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleActionSuccess = (result: CertificateActionResponse, stepName: string) => {
    setFeedback({
      type: 'success',
      message: result.message || `Certificate ${stepName} completed successfully.`
    });
    onRefresh();
  };

  return (
    <div className="ts-cert-section">
      <div className="ts-panel-heading" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div>
          <h2>Certificate Lifecycle &amp; Issuance</h2>
          <span className="ts-text-muted">
            Official MIROS compliance certificate generation, endorsement, and distribution.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="ts-badge ts-badge-neutral">
            Lifecycle: <strong>{certificateState(record)}</strong>
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      {feedback && (
        <div className={`ts-alert ts-alert-${feedback.type}`} role="status">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{feedback.message}</span>
            <button
              type="button"
              className="ts-alert-dismiss"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Visual Pipeline */}
      <div className="ts-cert-pipeline" aria-label="Certificate progression steps">
        <div className={`ts-cert-pipeline-step ${isApproved ? 'is-complete' : 'is-active'}`}>
          <div className="ts-step-marker">✓</div>
          <div className="ts-step-info">
            <strong>Approval</strong>
            <small>{isApproved ? `v${record.approvedVersion || 1}` : 'Pending'}</small>
          </div>
        </div>
        <div className="ts-step-connector" />
        <div className={`ts-cert-pipeline-step ${isPrepared ? 'is-complete' : isApproved ? 'is-active' : 'is-pending'}`}>
          <div className="ts-step-marker">1</div>
          <div className="ts-step-info">
            <strong>Prepare</strong>
            <small>{cert.preparedDate ? formatDate(cert.preparedDate) : 'Step 1'}</small>
          </div>
        </div>
        <div className="ts-step-connector" />
        <div className={`ts-cert-pipeline-step ${isPrinted ? 'is-complete' : isPrepared ? 'is-active' : 'is-pending'}`}>
          <div className="ts-step-marker">2</div>
          <div className="ts-step-info">
            <strong>Print</strong>
            <small>{cert.printedDate ? formatDate(cert.printedDate) : 'Step 2'}</small>
          </div>
        </div>
        <div className="ts-step-connector" />
        <div className={`ts-cert-pipeline-step ${isSigned ? 'is-complete' : isPrinted ? 'is-active' : 'is-pending'}`}>
          <div className="ts-step-marker">3</div>
          <div className="ts-step-info">
            <strong>Sign (DGO)</strong>
            <small>{cert.signedDate ? formatDate(cert.signedDate) : 'Step 3'}</small>
          </div>
        </div>
        <div className="ts-step-connector" />
        <div className={`ts-cert-pipeline-step ${isCompleted ? 'is-complete' : isSigned ? 'is-active' : 'is-pending'}`}>
          <div className="ts-step-marker">4</div>
          <div className="ts-step-info">
            <strong>Deliver</strong>
            <small>{cert.sentToCustomerDate ? formatDate(cert.sentToCustomerDate) : 'Step 4'}</small>
          </div>
        </div>
      </div>

      {/* Guidance Alert based on current stage */}
      {!isApproved && (
        <div className="ts-alert ts-alert-warning" role="alert">
          <strong>Approval Required:</strong> This assessment has not yet been approved. Official certificate processing requires Manager approval of a complete 33-criterion assessment.
        </div>
      )}

      {isApproved && !isPrepared && (
        <div className="ts-alert ts-alert-warning" role="alert">
          <strong>Step 1 Pending:</strong> Assessment is approved. Proceed to <strong>Prepare Certificate</strong> to assign an official Certificate Number and lock the certified version.
        </div>
      )}

      {isPrepared && !isPrinted && (
        <div className="ts-alert ts-alert-warning" role="alert">
          <strong>Step 2 Pending:</strong> Certificate #{certNumber} prepared. Proceed to <strong>Mark Printed</strong> once physically printed for DGO review.
        </div>
      )}

      {isPrinted && !isSigned && (
        <div className="ts-alert ts-alert-warning" role="alert">
          <strong>Step 3 Pending:</strong> Certificate routed to the Director General Office. Proceed to <strong>Record DGO Signature</strong> once signed.
        </div>
      )}

      {isSigned && !isCompleted && (
        <div className="ts-alert ts-alert-success" role="alert">
          <strong>Step 4 Pending:</strong> Certificate signed by <strong>{cert.signedBy}</strong>! Status advanced to <code>certificate_issued</code>. Public verification is active. Proceed to <strong>Deliver to Customer</strong>.
        </div>
      )}

      {isCompleted && (
        <div className="ts-alert ts-alert-success" role="alert">
          <strong>Lifecycle Completed:</strong> Official Certificate #{certNumber} was dispatched to the customer on {formatDate(cert.sentToCustomerDate)}. Evaluation lifecycle concluded.
        </div>
      )}

      {/* Action Buttons Toolbar */}
      <div className="ts-cert-action-bar">
        <button
          type="button"
          className="ts-button"
          disabled={!canPrepare}
          onClick={() => setActiveModal('prepare')}
        >
          {isPrepared ? 'Update Prepared Details' : '1. Prepare Certificate'}
        </button>

        <button
          type="button"
          className="ts-button ts-button-secondary"
          disabled={!canPrint}
          onClick={() => setActiveModal('print')}
        >
          2. Mark Printed
        </button>

        <button
          type="button"
          className="ts-button ts-button-approve"
          disabled={!canSign}
          onClick={() => setActiveModal('sign')}
        >
          3. Record DGO Signature
        </button>

        <button
          type="button"
          className="ts-button ts-button-secondary"
          disabled={!canDeliver}
          onClick={() => setActiveModal('deliver')}
        >
          4. Deliver to Customer
        </button>

        <button
          type="button"
          className="ts-button ts-button-secondary"
          disabled={!canDownloadPdf || isDownloading}
          onClick={handleDownload}
          title={canDownloadPdf ? 'Download Official Single-Page A4 Certificate PDF' : 'Prepare certificate first to enable PDF download'}
        >
          {isDownloading ? 'Generating PDF...' : 'Download Official PDF 📄'}
        </button>

        {canVerifyOnline && (
          <a
            href={`/verify-certificate.html?cert=${encodeURIComponent(certNumber)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ts-button ts-button-secondary"
            style={{ textDecoration: 'none' }}
          >
            Verify Online ↗
          </a>
        )}
      </div>

      {/* Metadata Readout */}
      <h3 style={{ marginTop: '28px', marginBottom: '14px' }}>Authoritative Certificate Details</h3>
      <Fields
        values={[
          ['Certificate status', certificateState(record)],
          ['Certificate number', cert.certificateNumber || 'Not assigned'],
          ['Approved version', record.approvedVersion],
          ['Certified version', cert.certifiedVersion || record.approvedVersion || 'Pending'],
          ['Prepared date', formatDate(cert.preparedDate)],
          ['Prepared by', cert.preparedBy || (cert.preparedDate ? 'Operations Manager' : null)],
          ['Printed date', formatDate(cert.printedDate)],
          ['Printed by', cert.printedBy || (cert.printedDate ? 'Operations Manager' : null)],
          ['Signed date', formatDate(cert.signedDate)],
          ['Signatory (DGO)', cert.signedBy || 'Pending signature'],
          ['Delivered date', formatDate(cert.sentToCustomerDate)],
          ['Delivery method', cert.deliveryMethod || (cert.sentToCustomerDate ? 'Official Dispatch' : null)],
          ['Delivered by', cert.deliveredBy || (cert.sentToCustomerDate ? 'Operations Manager' : null)],
          ['Delivery notes', cert.notes || 'None recorded']
        ]}
      />

      {/* Modals */}
      {activeModal === 'prepare' && (
        <PrepareModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleActionSuccess(res, 'preparation')}
        />
      )}

      {activeModal === 'print' && (
        <PrintModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleActionSuccess(res, 'physical print')}
        />
      )}

      {activeModal === 'sign' && (
        <SignModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleActionSuccess(res, 'DGO signature')}
        />
      )}

      {activeModal === 'deliver' && (
        <DeliverModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          record={record}
          onSuccess={(res) => handleActionSuccess(res, 'delivery')}
        />
      )}
    </div>
  );
}

