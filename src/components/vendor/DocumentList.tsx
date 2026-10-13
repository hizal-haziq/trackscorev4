import { useState } from 'react';
import type { VendorDocumentSummary } from '../../types/vendor';

interface DocumentListProps {
  documents: VendorDocumentSummary[];
  onDownload: (doc: VendorDocumentSummary) => Promise<void>;
  onDelete?: (doc: VendorDocumentSummary) => Promise<void>;
  isLoading?: boolean;
}

export function DocumentList({
  documents,
  onDownload,
  onDelete,
  isLoading = false
}: DocumentListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
        Loading attached files…
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
        No documents uploaded yet.
      </div>
    );
  }

  const handleDownload = async (doc: VendorDocumentSummary) => {
    setDownloadingId(doc.id);
    try {
      await onDownload(doc);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (doc: VendorDocumentSummary) => {
    if (!onDelete) return;
    if (!window.confirm(`Are you sure you want to remove document "${doc.name}"?`)) return;

    setDeletingId(doc.id);
    try {
      await onDelete(doc);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Document Name</th>
            <th>Category</th>
            <th>Uploaded</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.name}</strong>
                {d.notes && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {d.notes}
                  </div>
                )}
              </td>
              <td>
                <span style={{ fontSize: 11, color: '#475569' }}>
                  {d.categoryLabel || d.category}
                </span>
              </td>
              <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : 'N/A'}
              </td>
              <td>
                <span
                  className={`badge badge-${
                    d.status === 'accepted' ? 'approved' : d.status === 'rejected' ? 'rejected' : 'submitted'
                  }`}
                >
                  {(d.status || 'uploaded').toUpperCase()}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                  disabled={downloadingId === d.id}
                  onClick={() => handleDownload(d)}
                >
                  {downloadingId === d.id ? 'Downloading…' : 'Download'}
                </button>
                {onDelete && d.status !== 'accepted' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      color: 'var(--danger)',
                      marginLeft: 6
                    }}
                    disabled={deletingId === d.id}
                    onClick={() => handleDelete(d)}
                  >
                    {deletingId === d.id ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

