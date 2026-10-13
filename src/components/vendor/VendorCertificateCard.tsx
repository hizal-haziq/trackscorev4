import { useState } from 'react';
import type { VendorAssessment } from '../../types/vendor';
import {
  isCertificateDownloadableForVendor,
  downloadVendorCertificatePdf
} from '../../utils/vendorCertificate';

interface VendorCertificateCardProps {
  assessment: VendorAssessment;
}

export function VendorCertificateCard({ assessment }: VendorCertificateCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cert = assessment.certificate;
  if (!cert || !cert.certificateNumber) return null;

  const isSigned = isCertificateDownloadableForVendor(assessment);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      await downloadVendorCertificatePdf(assessment);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Certificate PDF generation failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="cert-banner">
      <div className="cert-info">
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#F58220',
            textTransform: 'uppercase'
          }}
        >
          Official MIROS Endorsement Ready
        </div>
        <h3>Certificate: {cert.certificateNumber}</h3>
        <p>
          Endorsed by {cert.signedBy || 'Authorized Signatory'} &bull; Date:{' '}
          {cert.signedDate ? new Date(cert.signedDate).toLocaleDateString('en-MY') : 'Pending'}
        </p>
        {error && (
          <p style={{ color: '#FECACA', fontSize: 12, marginTop: 4 }}>
            ⚠️ {error}
          </p>
        )}
      </div>

      <div className="cert-actions">
        <button
          type="button"
          className="btn-download-cert"
          disabled={!isSigned || isDownloading}
          title={!isSigned ? 'Certificate must be signed before downloading.' : 'Download official PDF'}
          onClick={handleDownload}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          {isDownloading ? 'Generating PDF…' : 'Download PDF'}
        </button>

        <a
          href={`/verify-certificate.html?cert=${encodeURIComponent(cert.certificateNumber)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-verify-cert"
        >
          Verify Online ↗
        </a>
      </div>
    </div>
  );
}

