import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { fetchAssessmentHistory } from '../../services/vendorAssessments';
import type { AssessmentVersionEntry } from '../../types/vendor';

interface AssessmentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluationId: string;
  companyName?: string;
}

export function AssessmentHistoryModal({
  isOpen,
  onClose,
  evaluationId,
  companyName
}: AssessmentHistoryModalProps) {
  const [history, setHistory] = useState<AssessmentVersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !evaluationId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchAssessmentHistory(evaluationId)
      .then((data) => {
        if (!isMounted) return;
        setHistory(data.history || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load version history.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, evaluationId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assessment Version History"
      subtitle={companyName ? `Assessment: ${companyName}` : undefined}
    >
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
          Loading version history…
        </div>
      )}

      {error && (
        <div
          className="action-banner banner-danger"
          style={{ marginBottom: 16 }}
          role="alert"
        >
          {error}
        </div>
      )}

      {!isLoading && !error && history.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
          No prior version snapshots recorded.
        </div>
      )}

      {!isLoading && !error && history.length > 0 && (
        <div>
          {history.map((v) => (
            <div
              key={v.versionNumber}
              className={`version-item ${v.isApprovedVersion ? 'approved' : ''} ${
                v.isCertifiedVersion ? 'certified' : ''
              }`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                  flexWrap: 'wrap',
                  gap: 8
                }}
              >
                <div>
                  <strong style={{ fontSize: 15, color: 'var(--navy)' }}>
                    Version {v.versionNumber}
                  </strong>
                  <span
                    style={{
                      fontSize: 11,
                      background: '#E2E8F0',
                      padding: '2px 6px',
                      borderRadius: 4,
                      marginLeft: 6,
                      fontWeight: 700
                    }}
                  >
                    {v.action || 'SUBMISSION'}
                  </span>
                  {v.isApprovedVersion && (
                    <span className="badge badge-approved" style={{ marginLeft: 6 }}>
                      APPROVED VERSION
                    </span>
                  )}
                  {v.isCertifiedVersion && (
                    <span
                      className="badge"
                      style={{
                        background: '#FFF7ED',
                        color: '#EA580C',
                        border: '1px solid #FFEDD5',
                        marginLeft: 6
                      }}
                    >
                      CERTIFIED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {v.createdAt ? new Date(v.createdAt).toLocaleString() : 'N/A'}
                </div>
              </div>

              {v.changeReason && (
                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>
                  <strong>Revision Note:</strong> {v.changeReason}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  marginTop: 8,
                  fontSize: 12,
                  color: '#64748B'
                }}
              >
                <div>
                  Rating:{' '}
                  <strong>
                    {v.scores?.starsCount
                      ? '★'.repeat(v.scores.starsCount) + '☆'.repeat(5 - v.scores.starsCount)
                      : 'Pending'}
                  </strong>
                </div>
                <div>
                  Result: <strong>{v.scores?.ratingLabel || 'In Progress'}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

