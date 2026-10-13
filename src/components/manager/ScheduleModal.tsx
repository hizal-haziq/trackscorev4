/**
 * Schedule Assessment Modal
 * Steps 14 & 15: Controlled scheduling form with date validation and single-submit guard.
 */

import { useState } from 'react';
import { Modal } from '../common/Modal';
import { scheduleAssessment, type ScheduleResponse } from '../../services/managerMutations';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  onSuccess: (result: ScheduleResponse) => void;
}

export function ScheduleModal({
  isOpen,
  onClose,
  record,
  onSuccess
}: ScheduleModalProps) {
  const [scheduledDate, setScheduledDate] = useState(record.scheduledDate || '');
  const [deviceModel, setDeviceModel] = useState(record.deviceModel || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!scheduledDate || !scheduledDate.trim()) {
      setError('Please select a scheduled inspection date.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await scheduleAssessment({
        id: record.id,
        expectedVersion: record.currentVersion ?? 0,
        scheduledDate: scheduledDate.trim(),
        deviceModel: deviceModel.trim() || undefined,
        notes: notes.trim() || undefined
      });
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to schedule assessment.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Assessment Inspection"
      subtitle={`Assessment ${record.id}`}
      isSubmitting={isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <div className="ts-modal-summary">
          <p>
            <strong>Company:</strong> {record.companyName || 'Not recorded'}
          </p>
          <p>
            <strong>Package:</strong> {record.packageName || 'Standard Assessment'}
          </p>
        </div>

        <div className="ts-form-group">
          <label htmlFor="schedule-date-input">
            Scheduled Inspection Date <span className="ts-required">*</span>
          </label>
          <input
            id="schedule-date-input"
            type="date"
            className="ts-input"
            value={scheduledDate}
            onChange={(e) => {
              setScheduledDate(e.target.value);
              if (error) setError(null);
            }}
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="ts-form-group">
          <label htmlFor="schedule-device-input">Device Model</label>
          <input
            id="schedule-device-input"
            type="text"
            className="ts-input"
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
            placeholder="Telematics Gateway / Device Model"
            disabled={isSubmitting}
          />
        </div>

        <div className="ts-form-group">
          <label htmlFor="schedule-notes-input">Scheduling Notes / Instructions</label>
          <textarea
            id="schedule-notes-input"
            className="ts-textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Location, fleet contact notes or inspection requirements..."
            disabled={isSubmitting}
          />
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
            disabled={isSubmitting || !scheduledDate}
          >
            {isSubmitting ? 'Saving Schedule...' : 'Save Inspection Schedule'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

