/**
 * Deliver Certificate Modal (Phase D - Step 4)
 * Manager records final delivery/dispatch of the official certificate to the customer.
 * Advances overall status to 'completed'.
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import {
  deliverCertificate,
  type CertificateActionResponse
} from '../../services/certificateActions';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface DeliverModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  onSuccess: (result: CertificateActionResponse) => void;
}

const DELIVERY_METHODS = [
  'Official Email & Physical Courier',
  'Physical Courier Only',
  'Email PDF Only',
  'Direct Handover'
];

export function DeliverModal({
  isOpen,
  onClose,
  record,
  onSuccess
}: DeliverModalProps) {
  const todayStr = new Date().toISOString().split('T')[0] || '';
  const [deliveryMethod, setDeliveryMethod] = useState(
    record.certificate.deliveryMethod || DELIVERY_METHODS[0]
  );
  const [sentDate, setSentDate] = useState(
    record.certificate.sentToCustomerDate?.split('T')[0] || todayStr
  );
  const [notes, setNotes] = useState(record.certificate.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const certNumber = record.certificate.certificateNumber || 'Pending';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!sentDate) {
      setError('Date sent to customer is required.');
      return;
    }
    if (notes.length > 2000) {
      setError('Delivery notes cannot exceed 2000 characters.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await deliverCertificate({
        id: record.id,
        expectedVersion: record.currentVersion ?? 0,
        deliveryMethod,
        sentToCustomerDate: sentDate,
        notes: notes.trim() || undefined
      });
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to record certificate delivery.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Step 4: Deliver Certificate to Customer"
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
            <strong>Signed By:</strong> {record.certificate.signedBy || 'Director General Office'}
          </p>
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-deliver-method">
            Delivery Method <span className="ts-required">*</span>
          </label>
          <select
            id="cert-deliver-method"
            className="ts-select"
            value={deliveryMethod}
            onChange={(e) => setDeliveryMethod(e.target.value)}
            disabled={isSubmitting}
          >
            {DELIVERY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-deliver-date">
            Date Sent to Customer <span className="ts-required">*</span>
          </label>
          <input
            id="cert-deliver-date"
            type="date"
            className="ts-input"
            value={sentDate}
            onChange={(e) => setSentDate(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="ts-form-group">
          <label htmlFor="cert-deliver-notes">
            Delivery Notes &amp; Dispatch Tracking <small>(optional, up to 2000 characters)</small>
          </label>
          <textarea
            id="cert-deliver-notes"
            className="ts-textarea"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Courier tracking #MY123456789, recipient acknowledged by Ms. Sarah..."
            disabled={isSubmitting}
          />
          <div className="ts-textarea-meta">
            <small>{2000 - notes.length} characters remaining</small>
          </div>
        </div>

        <div className="ts-info-box">
          <p>
            Marking as delivered concludes the evaluation process. The overall status will advance to <strong>completed</strong>.
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
            {isSubmitting ? 'Processing...' : 'Confirm Delivery to Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

