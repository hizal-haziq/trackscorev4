import { useState, useEffect, useCallback, useRef } from 'react';
import { parseVendorLocation, type VendorRouteState } from '../../app/vendorRoutes';
import { VendorLayout } from '../../components/layout/VendorLayout';
import { VendorDashboard } from './VendorDashboard';
import { VendorAssessments } from './VendorAssessments';
import { VendorAssessmentDetail } from './VendorAssessmentDetail';
import { VendorRequiredActions } from './VendorRequiredActions';
import { VendorDocuments } from './VendorDocuments';
import { VendorCertificates } from './VendorCertificates';
import { VendorProfile } from './VendorProfile';
import { AssessmentHistoryModal } from '../../components/vendor/AssessmentHistoryModal';
import { EvidenceUploadModal } from '../../components/vendor/EvidenceUploadModal';
import { VendorResubmitModal } from '../../components/vendor/VendorResubmitModal';
import { fetchVendorPortalData } from '../../services/vendorAssessments';
import { useVendorStatusStream } from '../../hooks/useVendorStatusStream';
import { getStoredToken } from '../../services/auth';
import { normalizeError } from '../../utils/errors';
import { ErrorPage } from '../../components/common/ErrorPage';
import type {
  VendorAssessment,
  VendorProfile as VendorProfileType
} from '../../types/vendor';

export function VendorPages() {
  const [route, setRoute] = useState<VendorRouteState>(() =>
    parseVendorLocation(window.location.hash)
  );

  const [vendor, setVendor] = useState<VendorProfileType | null>(null);
  const [evaluations, setEvaluations] = useState<VendorAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const hasLoadedRef = useRef(false);

  // Modals state
  const [historyEval, setHistoryEval] = useState<VendorAssessment | null>(null);
  const [uploadEval, setUploadEval] = useState<VendorAssessment | null>(null);
  const [resubmitEval, setResubmitEval] = useState<VendorAssessment | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const data = await fetchVendorPortalData(undefined, signal);
      setVendor(data.vendor || null);
      setEvaluations(data.evaluations || []);
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const norm = normalizeError(err);
      setError({ title: norm.title, message: norm.message });
    } finally {
      setIsLoading(false);
    }
  }, []);


  // Listen to hash change
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseVendorLocation(window.location.hash));
      loadData();
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [loadData]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Live status stream
  const token = getStoredToken();
  const { isConnected } = useVendorStatusStream({
    token,
    onUpdate: () => {
      loadData();
    }
  });

  const actionsCount = evaluations.filter(
    (e) => e.status === 'rejected' || Boolean(e.rejectionReason)
  ).length;

  return (
    <VendorLayout
      vendor={vendor}
      activePage={route.page}
      actionsCount={actionsCount}
      isStreamActive={isConnected}
    >
      {isLoading && (
        <div id="loading-view" className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
            Synchronizing Evaluation Records
          </h3>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Connecting to MIROS TrackScore encrypted registry…
          </p>
        </div>
      )}

      {error && (
        <div
          id="error-view"
          className="card"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            borderColor: '#FECACA',
            background: '#FEF2F2'
          }}
          role="alert"
        >
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#991B1B' }}>
            {error.title}
          </h3>
          <p id="error-message" style={{ fontSize: 13, color: '#7F1D1D', marginTop: 6 }}>
            {error.message}
          </p>
          <button
            type="button"
            className="btn-action-primary"
            style={{ marginTop: 18 }}
            onClick={() => loadData()}
          >
            Retry Connection
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {route.page === 'dashboard' && (
            <VendorDashboard
              evaluations={evaluations}
              onViewHistory={setHistoryEval}
              onViewDocuments={setUploadEval}
              onRespondRevision={setResubmitEval}
            />
          )}

          {route.page === 'assessments' && (
            <VendorAssessments
              evaluations={evaluations}
              onViewHistory={setHistoryEval}
              onViewDocuments={setUploadEval}
              onRespondRevision={setResubmitEval}
            />
          )}

          {route.page === 'assessment-detail' && route.id && (
            <VendorAssessmentDetail
              id={route.id}
              evaluations={evaluations}
              onViewHistory={setHistoryEval}
              onOpenUpload={setUploadEval}
              onRespondRevision={setResubmitEval}
              onRefresh={loadData}
            />
          )}

          {route.page === 'actions' && (
            <VendorRequiredActions
              evaluations={evaluations}
              onViewHistory={setHistoryEval}
              onViewDocuments={setUploadEval}
              onRespondRevision={setResubmitEval}
            />
          )}

          {route.page === 'documents' && (
            <VendorDocuments
              evaluations={evaluations}
              onOpenUpload={setUploadEval}
              onRefresh={loadData}
            />
          )}

          {route.page === 'certificates' && (
            <VendorCertificates evaluations={evaluations} />
          )}

          {route.page === 'profile' && (
            <VendorProfile vendor={vendor} onProfileUpdated={loadData} />
          )}

          {route.page === 'missing' && (
            <ErrorPage
              status={404}
              title="Page Not Found"
              message="The requested vendor page could not be found."
              action="dashboard"
              onHome={() => {
                window.location.hash = '#/dashboard';
              }}
            />
          )}
        </>
      )}


      {/* History Modal */}
      {historyEval && (
        <AssessmentHistoryModal
          isOpen={Boolean(historyEval)}
          onClose={() => setHistoryEval(null)}
          evaluationId={historyEval._id}
          companyName={historyEval.companyName}
        />
      )}

      {/* Upload Document Modal */}
      {uploadEval && (
        <EvidenceUploadModal
          isOpen={Boolean(uploadEval)}
          onClose={() => setUploadEval(null)}
          evaluationId={uploadEval._id}
          companyName={uploadEval.companyName}
          onUploaded={loadData}
        />
      )}

      {/* Resubmit Revision Modal */}
      {resubmitEval && (
        <VendorResubmitModal
          isOpen={Boolean(resubmitEval)}
          onClose={() => setResubmitEval(null)}
          assessment={resubmitEval}
          onResubmitted={loadData}
        />
      )}
    </VendorLayout>
  );
}

