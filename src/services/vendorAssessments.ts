import { getStoredToken, clearSession } from './auth';
import { ApiError } from './api';
import type {
  VendorPortalDataResponse,
  VendorResubmitResponse,
  AssessmentHistoryResponse
} from '../types/vendor';

function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Retrieves the vendor's profile and linked evaluation records.
 * If evaluationId is supplied, retrieves only that specific evaluation.
 */
export async function fetchVendorPortalData(
  evaluationId?: string,
  signal?: AbortSignal
): Promise<VendorPortalDataResponse> {
  const query = evaluationId ? `?id=${encodeURIComponent(evaluationId)}` : '';
  const res = await fetch(`/.netlify/functions/vendor-portal-data${query}`, {
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    signal
  });

  if (res.status === 401) {
    clearSession();
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(errorData.error || 'Your session has expired. Please sign in again.', 401, 'unauthenticated');
  }

  if (res.status === 403) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(errorData.error || 'You do not have permission to access this page or action.', 403, 'forbidden');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Failed to retrieve vendor data.', res.status);
  }

  return data;
}

/**
 * Responds to a revision/rejection request and resubmits the assessment for inspection.
 */
export async function submitVendorResubmit(
  evaluationId: string,
  deviceModel: string,
  responseNotes: string
): Promise<VendorResubmitResponse> {
  const res = await fetch('/.netlify/functions/vendor-resubmit', {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      evaluationId,
      deviceModel,
      responseNotes
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Resubmission failed.', res.status);
  }

  return data;
}

/**
 * Retrieves the immutable version history list for a specific evaluation.
 */
export async function fetchAssessmentHistory(
  evaluationId: string,
  signal?: AbortSignal
): Promise<AssessmentHistoryResponse> {
  const res = await fetch(
    `/.netlify/functions/get-assessment-history?evaluationId=${encodeURIComponent(evaluationId)}`,
    {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      signal
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Failed to load assessment history.', res.status);
  }

  return data;
}

