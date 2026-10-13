import React, {useState, useEffect} from 'react';
import {Modal} from '../common/Modal';
import type {PeerReviewEvaluation} from '../../types/assessor';
import {fetchPeerReviewDetail, addPeerComment} from '../../services/peerReviews';

interface PeerReviewModalProps {
  evaluationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export function PeerReviewModal({
  evaluationId,
  isOpen,
  onClose,
  onCommentAdded
}: PeerReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PeerReviewEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !evaluationId) {
      setDetail(null);
      setError(null);
      setCommentText('');
      setSubmitError(null);
      setSuccessMsg(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchPeerReviewDetail(evaluationId)
      .then(data => {
        if (isMounted) setDetail(data);
      })
      .catch(err => {
        if (isMounted) setError(err.message || 'Failed to load peer evaluation details.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, evaluationId]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evaluationId || !commentText.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    setSuccessMsg(null);

    try {
      const res = await addPeerComment({
        evaluationId,
        text: commentText.trim()
      });

      if (detail) {
        setDetail({
          ...detail,
          comments: [...detail.comments, res.comment],
          commentsOverallSummary: res.commentsOverallSummary || detail.commentsOverallSummary
        });
      }

      setCommentText('');
      setSuccessMsg('Peer commentary added successfully.');
      onCommentAdded?.();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit comment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={detail ? `Peer Technical Review · ${detail.companyName}` : 'Peer Technical Review'}
      subtitle="Inspect peer evaluation and provide append-only technical commentary"
      isSubmitting={submitting}
    >
      <div style={{display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px'}}>
        {loading && (
          <div role="status" style={{textAlign: 'center', padding: '24px', color: '#64748B'}}>
            Loading peer evaluation details...
          </div>
        )}

        {error && (
          <div role="alert" className="ts-alert ts-alert-danger" style={{padding: '12px', fontSize: '13px'}}>
            {error}
          </div>
        )}

        {detail && (
          <>
            <div style={{background: '#F8FAFC', padding: '12px 14px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '13px'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px'}}>
                <div><span style={{color: '#64748B'}}>Device:</span> <strong>{detail.deviceModel}</strong></div>
                <div><span style={{color: '#64748B'}}>Package:</span> <strong>{detail.packageName}</strong></div>
                <div><span style={{color: '#64748B'}}>Assessor:</span> <strong>{detail.assessorName}</strong></div>
                <div><span style={{color: '#64748B'}}>Score:</span> <strong style={{color: '#F58220'}}>{detail.totalScore.toFixed(2)} / 5.00 ({detail.starRating.toFixed(1)} ★)</strong></div>
              </div>
            </div>

            {/* Comments List */}
            <div>
              <h4 style={{fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px'}}>
                Technical Commentary ({detail.comments.length})
              </h4>
              {detail.comments.length === 0 ? (
                <p style={{fontSize: '13px', color: '#94A3B8', fontStyle: 'italic'}}>No peer comments yet. Be the first to review this evaluation.</p>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  {detail.comments.map(c => (
                    <div key={c.commentId} style={{background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px 12px', fontSize: '13px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
                        <span style={{fontWeight: 600, color: '#1E293B'}}>
                          {c.authorName} <span style={{fontSize: '11px', color: '#64748B', fontWeight: 'normal'}}>({c.authorRole})</span>
                        </span>
                        <span style={{fontSize: '11px', color: '#94A3B8'}}>
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{margin: '4px 0 0 0', color: '#334155', whiteSpace: 'pre-wrap'}}>{c.text}</p>
                      {c.aiSummary && (
                        <div style={{marginTop: '6px', fontSize: '11.5px', color: '#6366F1', background: '#EEF2FF', padding: '4px 8px', borderRadius: '4px'}}>
                          <strong>AI Summary:</strong> {c.aiSummary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleSubmitComment} style={{borderTop: '1px solid #E2E8F0', paddingTop: '14px'}}>
              <h4 style={{fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px'}}>
                Add Peer Review Comment
              </h4>
              {submitError && (
                <div role="alert" style={{background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '8px 12px', borderRadius: '4px', fontSize: '12.5px', marginBottom: '8px'}}>
                  {submitError}
                </div>
              )}
              {successMsg && (
                <div role="status" style={{background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 12px', borderRadius: '4px', fontSize: '12.5px', marginBottom: '8px'}}>
                  {successMsg}
                </div>
              )}
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
                <label htmlFor="peer-comment-input" style={{fontSize: '12px', fontWeight: 600, color: '#475569'}}>Comment Text:</label>
                <span style={{fontSize: '11px', color: commentText.length > 950 ? '#DC2626' : '#94A3B8'}}>
                  {commentText.length} / 1000
                </span>
              </div>
              <textarea
                id="peer-comment-input"
                rows={3}
                maxLength={1000}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Share technical feedback, CAN bus validation remarks, or evaluation quality observations..."
                disabled={submitting}
                style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px', fontFamily: 'inherit', resize: 'vertical'}}
              />
              <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px'}}>
                <button type="button" className="ts-button ts-button-secondary" onClick={onClose} disabled={submitting}>
                  Close
                </button>
                <button
                  type="submit"
                  className="ts-button ts-button-primary"
                  disabled={submitting || !commentText.trim()}
                  style={{background: '#4F46E5', borderColor: '#4338CA'}}
                >
                  {submitting ? 'Posting...' : 'Post Review Comment'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
