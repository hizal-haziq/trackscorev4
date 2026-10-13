import { normalizeError } from '../../utils/errors';
import type { TrackScoreError } from '../../types/errors';

export function RequestState({
  loading,
  error,
  retry,
  hasData,
  subject = 'overview'
}: {
  loading: boolean;
  error: string | TrackScoreError | Error | null;
  retry: () => void;
  hasData: boolean;
  subject?: string;
}) {
  if (error) {
    const normalized = typeof error === 'object' && error !== null && 'title' in error && 'message' in error
      ? (error as TrackScoreError)
      : normalizeError(error);

    return (
      <div className="ts-request-error" role="alert">
        <p className="ts-error-title-scoped"><strong>{normalized.title}:</strong> {normalized.message}</p>
        {hasData && <p>Showing the last loaded {subject}. It may be out of date.</p>}
        {normalized.retryable && (
          <button type="button" className="ts-button ts-button-secondary" onClick={retry}>
            Try again
          </button>
        )}
        {!hasData && normalized.status === 404 && (
          <div style={{ marginTop: '12px' }}>
            <a href="#/assessments" className="ts-button ts-button-secondary">
              Return to assessments
            </a>
          </div>
        )}
      </div>
    );

  }

  if (loading) {
    return (
      <p role="status" className="ts-request-state">
        {hasData ? `Updating ${subject}…` : `Loading ${subject}…`}
      </p>
    );
  }

  return null;
}
