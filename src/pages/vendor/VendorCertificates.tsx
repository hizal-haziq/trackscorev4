import type { VendorAssessment } from '../../types/vendor';
import { VendorCertificateCard } from '../../components/vendor/VendorCertificateCard';
import { isCertificateAvailableForVendor } from '../../utils/vendorCertificate';

interface VendorCertificatesProps {
  evaluations: VendorAssessment[];
}

export function VendorCertificates({ evaluations }: VendorCertificatesProps) {
  const readyEvals = evaluations.filter(isCertificateAvailableForVendor);
  const inProgressEvals = evaluations.filter((e) => !isCertificateAvailableForVendor(e));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>
          Official Compliance Certificates
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Authoritative MIROS telematics compliance certificates with tamper-proof QR verification.
        </p>
      </div>

      {readyEvals.length === 0 ? (
        <div className="card empty-state" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📜</div>
          <h3>No Certificates Issued Yet</h3>
          <p style={{ maxWidth: 520, margin: '8px auto 0' }}>
            Official certificates are generated upon Manager approval and authorized signature endorsement.
            Check your assessment progress below.
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {readyEvals.map((e) => (
            <div key={e._id} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--navy)',
                  marginBottom: 6
                }}
              >
                {e.companyName} — {e.deviceModel || 'Unit'} (v{e.currentVersion})
              </div>
              <VendorCertificateCard assessment={e} />
            </div>
          ))}
        </div>
      )}

      {inProgressEvals.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h3 className="card-title">Pending Certification Pipeline</h3>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {inProgressEvals.map((e) => (
              <div
                key={e._id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--surface-subtle)',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: 8
                }}
              >
                <div>
                  <strong>{e.companyName}</strong> ({e.deviceModel || 'N/A'})
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Package: {e.packageName || 'Standard'} &bull; Scheduled:{' '}
                    {e.scheduledDate ? new Date(e.scheduledDate).toLocaleDateString('en-MY') : 'Pending'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`badge badge-${e.status.replace(/_/g, '-')}`}>
                    {e.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

