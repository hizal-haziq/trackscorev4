/**
 * Assign / Reassign Assessor Modal
 * Steps 16, 17 & 18: Real staff directory from get-assessor-workload, workload awareness, explicit reassignment confirmation.
 */

import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import {
  assignAssessor,
  getAssessorDirectory,
  type AssignResponse,
  type AssessorDirectoryItem
} from '../../services/managerMutations';
import type { ManagerAssessment } from '../../types/managerAssessment';

interface AssignAssessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ManagerAssessment;
  onSuccess: (result: AssignResponse) => void;
}

export function AssignAssessorModal({
  isOpen,
  onClose,
  record,
  onSuccess
}: AssignAssessorModalProps) {
  const currentAssessorName = record.assignedAssessorName || record.assessorName || '';
  const isReassign = Boolean(currentAssessorName);

  const [assessors, setAssessors] = useState<AssessorDirectoryItem[]>([]);
  const [loadingAssessors, setLoadingAssessors] = useState(false);
  const [selectedAssessorId, setSelectedAssessorId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState(record.scheduledDate || '');
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch real staff directory on open
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const controller = new AbortController();

    setLoadingAssessors(true);
    setError(null);

    getAssessorDirectory(controller.signal)
      .then((items) => {
        if (!cancelled) {
          setAssessors(items);
          if (items.length > 0) {
            // Find current or default to first
            const matching = items.find(
              (a) => a.name.toLowerCase() === currentAssessorName.toLowerCase()
            );
            if (matching && !isReassign) {
              setSelectedAssessorId(matching.id);
            } else if (items[0]) {
              setSelectedAssessorId(items[0].id);
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !(err instanceof Error && err.name === 'AbortError')) {
          setError('Failed to load registered assessor list.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAssessors(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, currentAssessorName, isReassign]);

  const selectedAssessor = assessors.find((a) => a.id === selectedAssessorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedAssessor) {
      setError('Please select an assessor from the directory.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await assignAssessor({
        id: record.id,
        expectedVersion: record.currentVersion ?? 0,
        assessorName: selectedAssessor.name,
        assessorId: selectedAssessor.assessorId || selectedAssessor.id,
        assessorEmail: selectedAssessor.email,
        scheduledDate: scheduledDate.trim() || undefined,
        deviceModel: record.deviceModel || undefined,
        instructions: instructions.trim() || undefined
      });
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign assessor.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAtOrOverCapacity = selectedAssessor?.workload
    ? selectedAssessor.workload.active >= selectedAssessor.workload.capacity
    : false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isReassign ? 'Reassign Assessor' : 'Assign Assessor'}
      subtitle={`Assessment ${record.id}`}
      isSubmitting={isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <div className="ts-modal-summary">
          <p>
            <strong>Company:</strong> {record.companyName || 'Not recorded'}
          </p>
          {isReassign && (
            <p>
              <strong>Currently Assigned To:</strong>{' '}
              <span className="ts-badge ts-badge-warning">{currentAssessorName}</span>
            </p>
          )}
        </div>

        <div className="ts-form-group">
          <label htmlFor="assign-assessor-select">
            {isReassign ? 'New Assigned Assessor' : 'Choose Assessor'}{' '}
            <span className="ts-required">*</span>
          </label>
          {loadingAssessors ? (
            <p className="ts-modal-loading">Loading assessor directory and workloads...</p>
          ) : (
            <select
              id="assign-assessor-select"
              className="ts-select"
              value={selectedAssessorId}
              onChange={(e) => {
                setSelectedAssessorId(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting || assessors.length === 0}
              required
            >
              {assessors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.assessorId || a.email}) — {a.workload.active}/{a.workload.capacity} active
                  {a.workload.isAtCapacity ? ' [AT CAPACITY]' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedAssessor && (
          <div className="ts-workload-preview">
            <div className="ts-workload-preview-header">
              <span>Current Workload: {selectedAssessor.name}</span>
              <span className="ts-workload-count">
                {selectedAssessor.workload.active} / {selectedAssessor.workload.capacity} tasks
              </span>
            </div>
            {isAtOrOverCapacity && (
              <div className="ts-alert ts-alert-warning" role="alert">
                Warning: {selectedAssessor.name} has {selectedAssessor.workload.active} active tasks (Capacity: {selectedAssessor.workload.capacity}). You may still assign this task, but monitor their turnaround time.
              </div>
            )}
          </div>
        )}

        <div className="ts-form-group">
          <label htmlFor="assign-date-input">Scheduled Inspection Date (optional)</label>
          <input
            id="assign-date-input"
            type="date"
            className="ts-input"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="ts-form-group">
          <label htmlFor="assign-instructions-input">Manager Briefing Instructions (optional)</label>
          <textarea
            id="assign-instructions-input"
            className="ts-textarea"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Key telematics features to verify, location access details, or priority notes..."
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
            disabled={isSubmitting || !selectedAssessorId || loadingAssessors}
          >
            {isSubmitting
              ? isReassign ? 'Reassigning...' : 'Assigning...'
              : isReassign ? 'Confirm Reassignment' : 'Assign Assessor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

