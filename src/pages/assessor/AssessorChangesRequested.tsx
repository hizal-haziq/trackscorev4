import React, {useState, useEffect} from 'react';
import {fetchAssessorWork} from '../../services/assessorAssessments';
import type {AssessorTaskItem} from '../../types/assessor';

export function AssessorChangesRequested() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AssessorTaskItem[]>([]);

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetchAssessorWork()
      .then(res => {
        setItems(res.changesRequested);
      })
      .catch(err => {
        setError(err.message || 'Failed to load changes requested queue.');
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
            Changes Requested / Revisions
          </h1>
          <p style={{margin: 0, fontSize: '13.5px', color: '#64748B'}}>
            Evaluations returned by the Manager requiring remediation or additional evidence.
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
          Loading revision tasks...
        </div>
      )}

      {error && !loading && (
        <div role="alert" style={{background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '16px', borderRadius: '8px', color: '#991B1B', marginBottom: '16px'}}>
          <div style={{fontWeight: 700, marginBottom: '4px'}}>Failed to load queue</div>
          <div style={{fontSize: '13px', marginBottom: '10px'}}>{error}</div>
          <button type="button" className="ts-button ts-button-secondary" onClick={loadData}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{textAlign: 'center', padding: '48px 20px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          <div style={{fontSize: '16px', fontWeight: 700, color: '#059669', marginBottom: '6px'}}>
            ✓ No Changes Requested
          </div>
          <p style={{fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto 16px auto'}}>
            You currently have zero evaluations pending revision. All your submitted assessments are either under review or approved.
          </p>
          <a
            href="#/work"
            className="ts-button ts-button-secondary"
            style={{fontSize: '13px'}}
          >
            Return to My Work Queue
          </a>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
          {items.map(item => (
            <div
              key={item.id}
              className="ts-card ts-changes-requested-item"
              style={{
                background: '#FFFFFF',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 4px rgba(239, 68, 68, 0.08)'
              }}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px'}}>
                <div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                    <h3 style={{fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0}}>
                      {item.companyName}
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: '#FEF2F2',
                        color: '#991B1B',
                        border: '1px solid #FECACA'
                      }}
                    >
                      Remediation Required · v{item.currentVersion}
                    </span>
                  </div>
                  <div style={{fontSize: '13px', color: '#64748B'}}>
                    Hardware Model: <strong>{item.deviceModel}</strong> · Package: {item.packageName}
                  </div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span style={{fontSize: '13px', fontWeight: 700, color: '#F58220'}}>
                    Last Score: {item.totalScore.toFixed(2)} / 5.00
                  </span>
                  <a
                    href={`#/assessment/${item.id}`}
                    className="ts-button ts-button-primary"
                    style={{
                      background: '#DC2626',
                      borderColor: '#B91C1C',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    Fix &amp; Resubmit (v{item.currentVersion + 1}) →
                  </a>
                </div>
              </div>

              {/* Manager Rejection Reason */}
              <div
                style={{
                  background: '#FFF5F5',
                  border: '1px solid #FED7D7',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  fontSize: '13px'
                }}
              >
                <div style={{fontWeight: 700, color: '#991B1B', marginBottom: '4px'}}>
                  Manager&apos;s Review Remarks:
                </div>
                <p style={{margin: 0, color: '#742A2A', fontStyle: 'italic', whiteSpace: 'pre-wrap'}}>
                  &quot;{item.rejectionReason || 'No specific remarks provided. Please review technical criteria and resubmit.'}&quot;
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

