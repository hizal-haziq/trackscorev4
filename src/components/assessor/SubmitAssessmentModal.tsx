import React from 'react';
import {Modal} from '../common/Modal';

interface SubmitAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  companyName: string;
  deviceModel: string;
  completedCount: number;
  totalCriteriaCount: number;
  isResubmission: boolean;
  resubmitVersion?: number;
  isSubmitting: boolean;
  error?: string | null;
}

export function SubmitAssessmentModal({
  isOpen,
  onClose,
  onConfirm,
  companyName,
  deviceModel,
  completedCount,
  totalCriteriaCount,
  isResubmission,
  resubmitVersion,
  isSubmitting,
  error
}: SubmitAssessmentModalProps) {
  const isIncomplete = completedCount < totalCriteriaCount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isResubmission ? `Resubmitting Version ${resubmitVersion || 2}` : 'Submit Assessment Confirmation'}
      subtitle={`Submit evaluation for ${companyName} (${deviceModel})`}
      isSubmitting={isSubmitting}
    >
      <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
        {error && (
          <div role="alert" className="ts-alert ts-alert-danger" style={{padding: '10px 14px', fontSize: '13px'}}>
            <strong>Submission Error:</strong> {error}
          </div>
        )}

        <div style={{background: '#F8FAFC', padding: '14px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '13px'}}>
          <div style={{marginBottom: '6px'}}>
            <span style={{color: '#64748B'}}>Company:</span> <strong>{companyName || 'Untitled Company'}</strong>
          </div>
          <div style={{marginBottom: '6px'}}>
            <span style={{color: '#64748B'}}>Device Model:</span> <strong>{deviceModel || 'Unspecified Device'}</strong>
          </div>
          <div>
            <span style={{color: '#64748B'}}>Criteria Completion:</span>{' '}
            <strong style={{color: isIncomplete ? '#DC2626' : '#059669'}}>
              {completedCount} / {totalCriteriaCount} Answered ({Math.round((completedCount / totalCriteriaCount) * 100)}%)
            </strong>
          </div>
        </div>

        {isIncomplete && (
          <div style={{background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '12px', color: '#991B1B', fontSize: '13px'}}>
            <strong>Notice:</strong> {totalCriteriaCount - completedCount} criteria have not been evaluated. The MIROS specification requires all 33 criteria to be scored. Any unselected items will default to &quot;None (0)&quot;.
          </div>
        )}

        <div style={{fontSize: '13px', color: '#475569', lineHeight: 1.5}}>
          {isResubmission ? (
            <p style={{margin: 0}}>
              Resubmitting will record an immutable <strong>version {resubmitVersion || 2}</strong> snapshot. The earlier version snapshot remains preserved in the audit log. The status will return to <strong>Waiting Review</strong>.
            </p>
          ) : (
            <p style={{margin: 0}}>
              Submitting will record an authoritative <strong>version 1</strong> evaluation snapshot in the database. The status will become <strong>Waiting Manager Review</strong>.
            </p>
          )}
        </div>

        <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px'}}>
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
            className="ts-button ts-button-primary"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{background: '#F58220', borderColor: '#F58220'}}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-inline spinner-white" /> Submitting...
              </>
            ) : isResubmission ? (
              'Confirm & Resubmit Revision'
            ) : (
              'Confirm & Submit to Manager'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
