import React, {useState, useEffect, useMemo} from 'react';
import {fetchAssessorWork} from '../../services/assessorAssessments';
import type {AssessorTaskItem} from '../../types/assessor';

export function AssessorSubmitted() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AssessorTaskItem[]>([]);
  const [search, setSearch] = useState('');

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetchAssessorWork()
      .then(res => {
        setItems(res.submitted);
      })
      .catch(err => {
        setError(err.message || 'Failed to load submitted assessments.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        item.companyName.toLowerCase().includes(q) ||
        item.deviceModel.toLowerCase().includes(q) ||
        item.packageName.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px'}}>
        <div>
          <h1 style={{fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0', color: '#0F172A'}}>
            Submitted Assessments
          </h1>
          <p style={{margin: 0, fontSize: '13.5px', color: '#64748B'}}>
            Authoritative evaluation history submitted by your account.
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

      <div style={{background: '#FFFFFF', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px'}}>
        <input
          type="text"
          placeholder="Filter submissions by company or device model..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Filter submissions"
          style={{width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
        />
      </div>

      {loading && (
        <div role="status" style={{textAlign: 'center', padding: '40px', color: '#64748B', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          Loading submissions...
        </div>
      )}

      {error && !loading && (
        <div role="alert" style={{background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '16px', borderRadius: '8px', color: '#991B1B', marginBottom: '16px'}}>
          <div style={{fontWeight: 700, marginBottom: '4px'}}>Failed to load submissions</div>
          <div style={{fontSize: '13px', marginBottom: '10px'}}>{error}</div>
          <button type="button" className="ts-button ts-button-secondary" onClick={loadData}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <div style={{textAlign: 'center', padding: '48px 20px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          <div style={{fontSize: '16px', fontWeight: 700, color: '#1E293B', marginBottom: '6px'}}>
            No evaluations submitted yet
          </div>
          <p style={{fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto 16px auto'}}>
            When you complete and submit technical evaluations, they will appear here with authoritative server-calculated scores and review statuses.
          </p>
          <a
            href="#/work"
            className="ts-button ts-button-primary"
            style={{background: '#F58220', borderColor: '#F58220', fontSize: '13px'}}
          >
            Go to My Work Queue
          </a>
        </div>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <div style={{background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left'}}>
            <thead>
              <tr style={{background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '12px', fontWeight: 700}}>
                <th style={{padding: '12px 16px'}}>Company &amp; Device</th>
                <th style={{padding: '12px 14px'}}>Submitted Date</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Version</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Total Score</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Rating</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Review Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const s = item.status.toLowerCase();
                const isApproved = ['approved', 'completed', 'certificate_issued', 'pre_final_sent', 'payment_confirmed'].includes(s);
                return (
                  <tr key={item.id} style={{borderBottom: '1px solid #F1F5F9'}}>
                    <td style={{padding: '12px 16px'}}>
                      <div style={{fontWeight: 700, color: '#0F172A'}}>{item.companyName}</div>
                      <div style={{fontSize: '12px', color: '#64748B'}}>{item.deviceModel} · {item.packageName}</div>
                    </td>
                    <td style={{padding: '12px 14px', color: '#334155', whiteSpace: 'nowrap'}}>
                      {item.assessmentDate || new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{padding: '12px 14px', textAlign: 'center'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#F1F5F9', color: '#475569'}}>
                        v{item.currentVersion}
                      </span>
                    </td>
                    <td style={{padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#F58220'}}>
                      {item.totalScore.toFixed(2)} / 5.00
                    </td>
                    <td style={{padding: '12px 14px', textAlign: 'center', color: '#EAB308', whiteSpace: 'nowrap'}}>
                      {'★'.repeat(item.starsCount)}{'☆'.repeat(5 - item.starsCount)}
                    </td>
                    <td style={{padding: '12px 14px', textAlign: 'center'}}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: isApproved ? '#ECFDF5' : '#FFFBEB',
                          color: isApproved ? '#065F46' : '#92400E',
                          border: `1px solid ${isApproved ? '#A7F3D0' : '#FDE68A'}`
                        }}
                      >
                        {isApproved ? 'Approved' : 'Waiting Manager Review'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

