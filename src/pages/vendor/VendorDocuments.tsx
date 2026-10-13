import { useState } from 'react';
import type { VendorAssessment, VendorDocumentSummary } from '../../types/vendor';
import { DocumentList } from '../../components/vendor/DocumentList';
import { downloadVendorDocument, deleteVendorDocument } from '../../services/vendorDocuments';

interface VendorDocumentsProps {
  evaluations: VendorAssessment[];
  onOpenUpload: (assessment: VendorAssessment) => void;
  onRefresh: () => void;
}

export function VendorDocuments({
  evaluations,
  onOpenUpload,
  onRefresh
}: VendorDocumentsProps) {
  const [selectedEvalId, setSelectedEvalId] = useState<string>(
    evaluations[0]?._id || ''
  );

  const currentEval =
    evaluations.find((e) => e._id === selectedEvalId) || evaluations[0] || null;

  const handleDownload = async (doc: VendorDocumentSummary) => {
    if (!currentEval) return;
    await downloadVendorDocument(currentEval._id, doc.id);
  };

  const handleDelete = async (doc: VendorDocumentSummary) => {
    if (!currentEval) return;
    await deleteVendorDocument(currentEval._id, doc.id);
    onRefresh();
  };

  return (
    <div>
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="form-label" htmlFor="eval-selector" style={{ margin: 0 }}>
            Select Assessment:
          </label>
          <select
            id="eval-selector"
            className="form-select"
            style={{ minWidth: 260 }}
            value={selectedEvalId}
            onChange={(e) => setSelectedEvalId(e.target.value)}
          >
            {evaluations.map((e) => (
              <option key={e._id} value={e._id}>
                {e.companyName} ({e.deviceModel || 'Unit'})
              </option>
            ))}
          </select>
        </div>

        {currentEval && (
          <button
            type="button"
            className="btn-action-primary"
            onClick={() => onOpenUpload(currentEval)}
          >
            + Upload Document
          </button>
        )}
      </div>

      {!currentEval ? (
        <div className="card empty-state">
          <h3>No Assessments Available</h3>
          <p>No active assessment submissions found to manage documents.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                {currentEval.companyName} — Evidence Documents
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Model: <strong>{currentEval.deviceModel || 'N/A'}</strong> &bull; Total Files:{' '}
                <strong>{currentEval.documents?.length || 0}</strong>
              </p>
            </div>
          </div>

          <DocumentList
            documents={currentEval.documents || []}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}

