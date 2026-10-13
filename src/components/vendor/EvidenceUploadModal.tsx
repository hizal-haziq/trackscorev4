import { useState, type FormEvent } from 'react';
import { Modal } from '../common/Modal';
import { uploadVendorDocument } from '../../services/vendorDocuments';

interface EvidenceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluationId: string;
  companyName?: string;
  onUploaded: () => void;
}

export function EvidenceUploadModal({
  isOpen,
  onClose,
  evaluationId,
  companyName,
  onUploaded
}: EvidenceUploadModalProps) {
  const [category, setCategory] = useState('device_spec');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the maximum limit of 10MB.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await uploadVendorDocument(evaluationId, file, category, notes);
      setFile(null);
      setNotes('');
      onUploaded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Supporting Documentation"
      subtitle={companyName ? `Target Assessment: ${companyName}` : undefined}
      isSubmitting={isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="action-banner banner-danger"
            style={{ marginBottom: 16 }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="doc-category">
              Document Category
            </label>
            <select
              id="doc-category"
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="device_spec">Device Technical Specification</option>
              <option value="test_report">Lab / Calibration Test Report</option>
              <option value="compliance_cert">Declaration of Conformity / Cert</option>
              <option value="installation_guide">Installation Manual</option>
              <option value="other">Other Supporting Evidence</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="doc-file">
              Select File (Max 10MB)
            </label>
            <input
              type="file"
              id="doc-file"
              className="form-input"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,.txt"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="doc-notes">
            Document Notes (Optional)
          </label>
          <input
            type="text"
            id="doc-notes"
            className="form-input"
            placeholder="e.g. Revised wiring diagram addressing section A-4"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            id="btn-upload-submit"
            className="btn-action-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Uploading…' : 'Upload Document'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

