import { useEffect, useRef } from 'react';
import type { TrackScoreError, ErrorAction } from '../../types/errors';
import { normalizeError } from '../../utils/errors';
import { getRoleHome } from '../../utils/navigation';
import { useAuth } from '../../hooks/useAuth';
import { readSession } from '../../services/auth';

export interface ErrorPageProps {
  error?: TrackScoreError | Error | string | null;
  title?: string;
  message?: string;
  status?: number;
  action?: ErrorAction;
  onRetry?: () => void;
  onBack?: () => void;
  onHome?: () => void;
  inline?: boolean;
}

export function ErrorPage({
  error,
  title,
  message,
  status,
  action,
  onRetry,
  onBack,
  onHome,
  inline = false
}: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  let sessionRole: string | undefined;

  try {
    const auth = useAuth();
    sessionRole = auth.session?.user?.role;
  } catch {
    // If rendered outside AuthProvider (e.g., top-level ErrorBoundary)
    sessionRole = readSession()?.user?.role;
  }

  const normalized = normalizeError(error);
  const displayTitle = title || normalized.title;
  const displayMessage = message || normalized.message;
  const displayStatus = status ?? normalized.status;
  const displayAction = action || normalized.action;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleDashboard = () => {
    if (onHome) {
      onHome();
      return;
    }
    const home = getRoleHome(sessionRole);
    window.location.href = home;
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      handleDashboard();
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const showLogin = displayAction === 'login' || displayStatus === 401;
  const showDashboard = displayAction === 'dashboard' || displayStatus === 403 || displayStatus === 404 || displayStatus === 410 || displayStatus === 500;
  const showBack = displayAction === 'back' || displayStatus === 404;
  const showRetry = (normalized.retryable || displayAction === 'retry') && !showLogin;

  const content = (
    <div className="ts-error-content">
      <div className="ts-error-badge" aria-hidden="true">
        {displayStatus === 401 ? '⏳' : displayStatus === 403 ? '🔒' : displayStatus === 404 ? '🔍' : displayStatus === 0 ? '📶' : '⚠️'}
      </div>

      {displayStatus !== undefined && displayStatus > 0 && (
        <span className="ts-error-status-pill">HTTP {displayStatus}</span>
      )}

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="ts-error-title"
      >
        {displayTitle}
      </h1>

      <p className="ts-error-message">{displayMessage}</p>

      <div className="ts-error-actions">
        {showLogin && (
          <a href="/login.html" className="ts-button">
            Log In
          </a>
        )}

        {showRetry && (
          <button type="button" className="ts-button" onClick={handleRetry}>
            Try Again
          </button>
        )}

        {showBack && (
          <button
            type="button"
            className="ts-button ts-button-secondary"
            onClick={handleBack}
          >
            Go Back
          </button>
        )}

        {showDashboard && !showLogin && (
          <button
            type="button"
            className={`ts-button ${showRetry ? 'ts-button-secondary' : ''}`}
            onClick={handleDashboard}
          >
            Go to My Dashboard
          </button>
        )}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="ts-error-container ts-error-inline" role="alert">
        {content}
      </div>
    );
  }

  return (
    <main className="ts-error-container ts-error-page" role="alert">
      {content}
    </main>
  );
}

