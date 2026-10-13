import { useState, useMemo } from 'react';
import type { VendorAssessment } from '../../types/vendor';
import { VendorAssessmentCard } from '../../components/vendor/VendorAssessmentCard';

interface VendorAssessmentsProps {
  evaluations: VendorAssessment[];
  onViewHistory: (assessment: VendorAssessment) => void;
  onViewDocuments: (assessment: VendorAssessment) => void;
  onRespondRevision: (assessment: VendorAssessment) => void;
}

export function VendorAssessments({
  evaluations,
  onViewHistory,
  onViewDocuments,
  onRespondRevision
}: VendorAssessmentsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    return evaluations.filter((e) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = (e.companyName || '').toLowerCase().includes(q);
        const matchModel = (e.deviceModel || '').toLowerCase().includes(q);
        const matchId = (e._id || '').toLowerCase().includes(q);
        if (!matchName && !matchModel && !matchId) return false;
      }

      if (statusFilter) {
        if (statusFilter === 'approved') {
          if (!['approved', 'pre_final_sent', 'payment_confirmed'].includes(e.status)) {
            return false;
          }
        } else if (statusFilter === 'review') {
          if (!['submitted', 'pending_review'].includes(e.status)) return false;
        } else if (statusFilter === 'revision') {
          if (e.status !== 'rejected' && !e.rejectionReason) return false;
        } else if (e.status !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [evaluations, searchQuery, statusFilter]);

  return (
    <div>
      {/* Search and Filters Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <input
            type="search"
            aria-label="Search assessments"
            className="form-input"
            style={{ maxWidth: 320 }}
            placeholder="Search by company, model, or ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            aria-label="Filter by status"
            className="form-select"
            style={{ maxWidth: 220 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="registered">Registered</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Waiting Review</option>
            <option value="revision">Changes Requested</option>
            <option value="approved">Approved</option>
            <option value="certificate_issued">Certificate Available</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Showing <strong>{filtered.length}</strong> of <strong>{evaluations.length}</strong> assessments
        </div>
      </div>

      {/* Evaluations List */}
      {filtered.length === 0 ? (
        <div className="card empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <h3>No matching assessments found</h3>
          <p style={{ marginTop: 4 }}>
            Try adjusting your search query or status filter to locate your records.
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((e) => (
            <VendorAssessmentCard
              key={e._id}
              assessment={e}
              onViewHistory={onViewHistory}
              onViewDocuments={onViewDocuments}
              onRespondRevision={onRespondRevision}
            />
          ))}
        </div>
      )}
    </div>
  );
}

