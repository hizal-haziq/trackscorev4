import type { VendorAssessment } from '../../types/vendor';
import { VendorAssessmentCard } from '../../components/vendor/VendorAssessmentCard';
import { DocumentList } from '../../components/vendor/DocumentList';
import { downloadVendorDocument, deleteVendorDocument } from '../../services/vendorDocuments';

interface VendorAssessmentDetailProps {
  id: string;
  evaluations: VendorAssessment[];
  onViewHistory: (assessment: VendorAssessment) => void;
  onOpenUpload: (assessment: VendorAssessment) => void;
  onRespondRevision: (assessment: VendorAssessment) => void;
  onRefresh: () => void;
}

export function VendorAssessmentDetail({
  id,
  evaluations,
  onViewHistory,
  onOpenUpload,
  onRespondRevision,
  onRefresh
}: VendorAssessmentDetailProps) {
  const assessment = evaluations.find((e) => e._id === id);

  if (!assessment) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Assessment Not Found</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          The requested assessment ID does not exist in your account.
        </p>
        <a href="#/assessments" className="btn-action-primary">
          Back to Assessments
        </a>
      </div>
    );
  }

  const handleDownload = async (doc: { id: string }) => {
    await downloadVendorDocument(assessment._id, doc.id);
  };

  const handleDelete = async (doc: { id: string }) => {
    await deleteVendorDocument(assessment._id, doc.id);
    onRefresh();
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <a
          href="#/assessments"
          className="btn-secondary"
          style={{ textDecoration: 'none' }}
        >
          ← Back to Assessments List
        </a>
      </div>

      <VendorAssessmentCard
        assessment={assessment}
        onViewHistory={onViewHistory}
        onViewDocuments={() => onOpenUpload(assessment)}
        onRespondRevision={onRespondRevision}
      />

      {/* Attached Documents Section */}
      <section className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Attached Evidence Documents</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Supporting documentation submitted for MIROS technical inspection.
            </p>
          </div>
          <button
            type="button"
            className="btn-action-primary"
            onClick={() => onOpenUpload(assessment)}
          >
            + Upload New Document
          </button>
        </div>

        <DocumentList
          documents={assessment.documents || []}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      </section>
    </div>
  );
}

