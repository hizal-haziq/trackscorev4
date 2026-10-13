import {AuthProvider} from './AuthProvider';
import {ManagerRoute, AssessorRoute, VendorRoute} from './routes';
import {ManagerDashboard} from '../pages/manager/ManagerDashboard';
import {useEffect, useState} from 'react';
import {managerLocation} from './managerRoutes';
import {AssessmentRepository} from '../pages/manager/AssessmentRepository';
import {AssessmentWorkspace} from '../pages/manager/AssessmentWorkspace';
import {ManagerLayout} from '../components/layout/ManagerLayout';
import {AssessorPages} from '../pages/assessor/AssessorPages';
import {VendorPages} from '../pages/vendor/VendorPages';
import {ErrorBoundary} from '../components/common/ErrorBoundary';
import {ErrorPage} from '../components/common/ErrorPage';

function ManagerPages() {
  const [route, setRoute] = useState(() => managerLocation(window.location.hash));
  useEffect(() => {
    const sync = () => setRoute(managerLocation(window.location.hash));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  if (route.page === 'assessments') return <AssessmentRepository />;
  if (route.page === 'workspace') return <AssessmentWorkspace key={route.id} id={route.id} />;
  if (route.page === 'missing') return (
    <ManagerLayout>
      <ErrorPage
        status={404}
        title="Page Not Found"
        message="The requested manager page could not be found."
        action="dashboard"
        onHome={() => { window.location.hash = '#/'; }}
      />
    </ManagerLayout>
  );
  return <ManagerDashboard />;
}

export default function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isAssessorPortal = pathname.includes('assessor');
  const isVendorPortal = pathname.includes('vendor');

  if (isVendorPortal) {
    return (
      <ErrorBoundary>
        <AuthProvider>
          <VendorRoute>
            <VendorPages />
          </VendorRoute>
        </AuthProvider>
      </ErrorBoundary>
    );
  }

  if (isAssessorPortal) {
    return (
      <ErrorBoundary>
        <AuthProvider>
          <AssessorRoute>
            <AssessorPages />
          </AssessorRoute>
        </AuthProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ManagerRoute>
          <ManagerPages />
        </ManagerRoute>
      </AuthProvider>
    </ErrorBoundary>
  );
}

