import React, {useState, useEffect, useMemo} from 'react';
import {fetchAssessorWork} from '../../services/assessorAssessments';
import type {AssessorTaskItem} from '../../types/assessor';

export function AssessorWork() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AssessorTaskItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetchAssessorWork()
      .then(res => {
        setItems(res.assigned);
      })
      .catch(err => {
        setError(err.message || 'Failed to load assigned work queue.');
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
      if (statusFilter && item.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchComp = item.companyName.toLowerCase().includes(q);
        const matchDev = item.deviceModel.toLowerCase().includes(q);
        const matchPkg = item.packageName.toLowerCase().includes(q);
        if (!matchComp && !matchDev && !matchPkg) return false;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px'}}>
        <div>
          <h1 style={{fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0', color: '#0F172A'}}>
            My Work Queue
          </h1>
          <p style={{margin: 0, fontSize: '13.5px', color: '#64748B'}}>
            Evaluations assigned to you awaiting inspection and technical assessment.
          </p>
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          <a
            href="#/assessment/new"
            className="ts-button ts-button-primary"
            style={{background: '#F58220', borderColor: '#F58220', fontWeight: 600, fontSize: '13px'}}
          >
            + Start New Assessment
          </a>
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

      {/* Filter Toolbar */}
      <div
        className="ts-filters"
        style={{
          display: 'flex',
          gap: '12px',
          background: '#FFFFFF',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          marginBottom: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{flex: 1, minWidth: '220px'}}>
          <input
            type="text"
            placeholder="Search by company, device model, or package..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search assigned work"
            style={{width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by assignment status"
            style={{padding: '7px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
          >
            <option value="">All Assigned Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="registered">Registered</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div role="status" style={{textAlign: 'center', padding: '40px', color: '#64748B', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          <div style={{fontSize: '14px', fontWeight: 600, marginBottom: '6px'}}>Loading your assigned work...</div>
          <div style={{fontSize: '12px'}}>Fetching evaluations from the database</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div role="alert" style={{background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '16px', borderRadius: '8px', color: '#991B1B', marginBottom: '16px'}}>
          <div style={{fontWeight: 700, marginBottom: '4px'}}>Failed to load work queue</div>
          <div style={{fontSize: '13px', marginBottom: '10px'}}>{error}</div>
          <button type="button" className="ts-button ts-button-secondary" onClick={loadData}>
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredItems.length === 0 && (
        <div style={{textAlign: 'center', padding: '48px 20px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          <div style={{fontSize: '16px', fontWeight: 700, color: '#1E293B', marginBottom: '6px'}}>
            {search || statusFilter ? 'No matching assessments' : 'No assigned assessments yet'}
          </div>
          <p style={{fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto 16px auto'}}>
            {search || statusFilter
              ? 'Try clearing your search query or filters to see all assigned tasks.'
              : 'When a Manager assigns commercial telematics assessments to your account, they will appear in this work queue.'}
          </p>
          <a
            href="#/assessment/new"
            className="ts-button ts-button-primary"
            style={{background: '#F58220', borderColor: '#F58220', fontSize: '13px'}}
          >
            Start Standalone Assessment
          </a>
        </div>
      )}

      {/* Work Queue Table */}
      {!loading && !error && filteredItems.length > 0 && (
        <div style={{background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left'}}>
            <thead>
              <tr style={{background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '12px', fontWeight: 700}}>
                <th style={{padding: '12px 16px'}}>Company &amp; Device</th>
                <th style={{padding: '12px 14px'}}>Package</th>
                <th style={{padding: '12px 14px'}}>Scheduled Date</th>
                <th style={{padding: '12px 14px'}}>SLA Deadline</th>
                <th style={{padding: '12px 14px', textAlign: 'center'}}>Status</th>
                <th style={{padding: '12px 16px', textAlign: 'right'}}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} style={{borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease'}}>
                  <td style={{padding: '12px 16px'}}>
                    <div style={{fontWeight: 700, color: '#0F172A'}}>{item.companyName}</div>
                    <div style={{fontSize: '12px', color: '#64748B'}}>{item.deviceModel}</div>
                  </td>
                  <td style={{padding: '12px 14px', color: '#475569', fontSize: '12.5px'}}>
                    {item.packageName}
                  </td>
                  <td style={{padding: '12px 14px', color: '#334155', whiteSpace: 'nowrap'}}>
                    {item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString() : 'Pending schedule'}
                  </td>
                  <td style={{padding: '12px 14px', whiteSpace: 'nowrap'}}>
                    {item.sla ? (
                      <div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '10px',
                            background: item.sla.status === 'OVERDUE' ? '#FEF2F2' : (item.sla.status === 'DUE_SOON' ? '#FFFBEB' : '#F0FDF4'),
                            color: item.sla.status === 'OVERDUE' ? '#DC2626' : (item.sla.status === 'DUE_SOON' ? '#B45309' : '#15803D'),
                            border: `1px solid ${item.sla.status === 'OVERDUE' ? '#FECACA' : (item.sla.status === 'DUE_SOON' ? '#FDE68A' : '#BBF7D0')}`
                          }}
                        >
                          {item.sla.label || item.sla.status}
                        </span>
                        {item.sla.remainingFormatted && (
                          <div style={{fontSize: '11px', color: '#64748B', marginTop: '2px'}}>
                            {item.sla.remainingFormatted}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{color: '#94A3B8'}}>--</span>
                    )}
                  </td>
                  <td style={{padding: '12px 14px', textAlign: 'center'}}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: '#EEF2FF',
                        color: '#4338CA',
                        border: '1px solid #C7D2FE',
                        textTransform: 'capitalize'
                      }}
                    >
                      {item.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td style={{padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap'}}>
                    <a
                      href={`#/assessment/${item.id}`}
                      className="ts-button ts-button-primary"
                      style={{
                        background: '#4F46E5',
                        borderColor: '#4338CA',
                        fontSize: '12px',
                        padding: '6px 12px',
                        fontWeight: 700,
                        textDecoration: 'none'
                      }}
                    >
                      Conduct Assessment →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

