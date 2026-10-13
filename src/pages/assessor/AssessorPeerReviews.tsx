import React, {useState, useEffect} from 'react';
import {fetchPeerReviews} from '../../services/peerReviews';
import type {PeerReviewEvaluation} from '../../types/assessor';
import {PeerReviewModal} from '../../components/assessor/PeerReviewModal';

export function AssessorPeerReviews() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PeerReviewEvaluation[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetchPeerReviews()
      .then(data => {
        setItems(data);
      })
      .catch(err => {
        setError(err.message || 'Failed to load peer evaluations.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px'}}>
        <div>
          <h1 style={{fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0', color: '#0F172A'}}>
            Peer Technical Reviews
          </h1>
          <p style={{margin: 0, fontSize: '13.5px', color: '#64748B'}}>
            Inspect technical evaluations completed by fellow assessors and share append-only verification comments.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="ts-button ts-button-secondary"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && (
        <div role="status" style={{textAlign: 'center', padding: '40px', color: '#64748B', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          Loading peer evaluations...
        </div>
      )}

      {error && !loading && (
        <div role="alert" style={{background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '16px', borderRadius: '8px', color: '#991B1B', marginBottom: '16px'}}>
          <div style={{fontWeight: 700, marginBottom: '4px'}}>Failed to load peer evaluations</div>
          <div style={{fontSize: '13px', marginBottom: '10px'}}>{error}</div>
          <button type="button" className="ts-button ts-button-secondary" onClick={loadData}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{textAlign: 'center', padding: '48px 20px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          <div style={{fontSize: '16px', fontWeight: 700, color: '#1E293B', marginBottom: '6px'}}>
            No peer evaluations available
          </div>
          <p style={{fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto'}}>
            When other assessors submit evaluations for commercial vehicles, they will be listed here for peer verification.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left'}}>
            <thead>
              <tr style={{background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '12px', fontWeight: 700}}>
                <th style={{padding: '12px 16px'}}>Company &amp; Device</th>
                <th style={{padding: '12px 14px'}}>Peer Assessor</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Score &amp; Stars</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Comments</th>
                <th style={{padding: '12px 16px', textAlign: 'right'}}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{borderBottom: '1px solid #F1F5F9'}}>
                  <td style={{padding: '12px 16px'}}>
                    <div style={{fontWeight: 700, color: '#0F172A'}}>{item.companyName}</div>
                    <div style={{fontSize: '12px', color: '#64748B'}}>{item.deviceModel} · {item.packageName}</div>
                  </td>
                  <td style={{padding: '12px 14px', color: '#334155'}}>
                    {item.assessorName}
                  </td>
                  <td style={{padding: '12px 14px', textAlign: 'center'}}>
                    <span style={{fontWeight: 700, color: '#F58220'}}>{item.totalScore.toFixed(2)} / 5.00</span>{' '}
                    <span style={{color: '#EAB308', fontSize: '12px'}}>{'★'.repeat(item.starsCount)}</span>
                  </td>
                  <td style={{padding: '12px 14px', textAlign: 'center'}}>
                    <span style={{fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: '#EEF2FF', color: '#4338CA'}}>
                      {item.comments.length} comments
                    </span>
                  </td>
                  <td style={{padding: '12px 16px', textAlign: 'right'}}>
                    <button
                      type="button"
                      className="ts-button ts-button-primary"
                      onClick={() => setSelectedEvalId(item.id)}
                      style={{background: '#4F46E5', borderColor: '#4338CA', fontSize: '12px', padding: '5px 12px'}}
                    >
                      Review &amp; Comment →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Peer Review Modal */}
      <PeerReviewModal
        evaluationId={selectedEvalId}
        isOpen={Boolean(selectedEvalId)}
        onClose={() => setSelectedEvalId(null)}
        onCommentAdded={loadData}
      />
    </div>
  );
}

