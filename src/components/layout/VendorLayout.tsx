import { type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { VendorProfile } from '../../types/vendor';

interface VendorLayoutProps {
  children: ReactNode;
  vendor?: VendorProfile | null;
  activePage: string;
  actionsCount?: number;
  isStreamActive?: boolean;
}

export function VendorLayout({
  children,
  vendor,
  activePage,
  actionsCount = 0,
  isStreamActive = true
}: VendorLayoutProps) {
  const { logout } = useAuth();

  const companyName = vendor?.companyName || 'Authorized Vendor';
  const subtitle = [vendor?.contactEmail, vendor?.state].filter(Boolean).join(' • ');

  return (
    <div className="ts-app-container">
      {/* Top Navigation */}
      <header className="navbar" role="banner">
        <div className="nav-left">
          <a href="#/dashboard" className="brand-title">
            TrackScore <span className="brand-badge">Vendor Portal</span>
          </a>
          <nav className="nav-menu" aria-label="Vendor Portal Navigation">
            <a
              href="#/dashboard"
              className={`nav-tab ${activePage === 'dashboard' ? 'active' : ''}`}
            >
              <span>📊</span> Dashboard
            </a>
            <a
              href="#/assessments"
              className={`nav-tab ${activePage === 'assessments' || activePage === 'assessment-detail' ? 'active' : ''}`}
            >
              <span>📋</span> Assessments
            </a>
            <a
              href="#/actions"
              className={`nav-tab ${activePage === 'actions' ? 'active' : ''}`}
            >
              <span>⚠️</span> Required Actions
              {actionsCount > 0 && (
                <span className="badge-count" style={{ display: 'inline-block', marginLeft: 4 }}>
                  {actionsCount}
                </span>
              )}
            </a>
            <a
              href="#/documents"
              className={`nav-tab ${activePage === 'documents' ? 'active' : ''}`}
            >
              <span>📁</span> Documents
            </a>
            <a
              href="#/certificates"
              className={`nav-tab ${activePage === 'certificates' ? 'active' : ''}`}
            >
              <span>📜</span> Certificates
            </a>
            <a
              href="#/profile"
              className={`nav-tab ${activePage === 'profile' ? 'active' : ''}`}
            >
              <span>👤</span> Company Profile
            </a>
          </nav>
        </div>

        <div className="nav-user">
          <div className="user-info">
            <div className="user-name">{companyName}</div>
            <div className="user-email">{subtitle || 'Encrypted Session'}</div>
          </div>
          <button
            type="button"
            id="btn-logout"
            className="btn-logout"
            onClick={logout}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="container" role="main">
        {/* Header bar */}
        <div className="page-header">
          <div>
            <h1 className="header-title">Commercial Vehicle Telematics Registry</h1>
            <p className="header-subtitle">
              Official MIROS tracking, compliance verification, and certificate self-service repository.
            </p>
          </div>
          <div className="live-indicator">
            <span className={`pulse-dot ${isStreamActive ? '' : 'disconnected'}`}></span>
            <span id="sse-status-label">
              {isStreamActive ? 'Live Status Active' : 'Connecting to Stream...'}
            </span>
          </div>
        </div>

        {children}
      </main>

      <footer style={{ textAlign: 'center', padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
        TrackScore Digital Assessor Evaluation System &bull; Official MIROS Telematics Registry &bull;{' '}
        <a href="/vendor-portal.html" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
          Switch to Legacy Portal
        </a>
      </footer>
    </div>
  );
}

