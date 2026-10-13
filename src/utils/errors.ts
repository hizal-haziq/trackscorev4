import type { TrackScoreError, ErrorAction } from '../types/errors';

/**
 * Patterns that must NEVER leak to user UI under any circumstances.
 */
const SENSITIVE_PATTERNS = [
  /mongodb(?:\+srv)?:\/\/[^\s]+/i,
  /jwt_secret[^\s]*/i,
  /(?:Bearer\s+)[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i,
  /\/(?:home|var|usr|etc|opt|tmp)\/[^\s]+/i,
  /password(?:hash)?[:=][^\s]+/i,
  /at\s+[a-z0-9_$.<>]+\s+\([^)]+:[0-9]+:[0-9]+\)/i,
  /node_modules/i,
  /connection\s+string/i,
  /INTERNAL_STACK_TRACE/i,
  /SECRET/i
];

export function isSensitive(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeMessage(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  if (isSensitive(raw)) return '';
  // Check for Mongo driver error strings
  if (/Mongo(?:Error|ServerSelectionError|TopologyClosedError)/i.test(raw)) return '';
  return raw.trim();
}

/**
 * Normalizes any technical, network, API, or rendering error into a safe,
 * user-friendly TrackScoreError that protects against information disclosure.
 */
export function normalizeError(
  error: unknown,
  fallbackAction: ErrorAction = 'retry'
): TrackScoreError {
  let status: number | undefined;
  let rawMessage = '';
  let isNetwork = false;

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.status === 'number' && Number.isFinite(err.status)) {
      status = err.status;
    }
    if (typeof err.message === 'string') {
      rawMessage = err.message;
    }
    if (err.kind === 'network' || err.name === 'NetworkError') {
      isNetwork = true;
    }
    // Check if it's already a normalized TrackScoreError
    if (
      typeof err.title === 'string' &&
      typeof err.message === 'string' &&
      typeof err.retryable === 'boolean'
    ) {
      if (!isSensitive(err.title) && !isSensitive(err.message)) {
        return {
          status: status,
          code: typeof err.code === 'string' ? err.code : undefined,
          title: err.title,
          message: err.message,
          retryable: err.retryable,
          action: (err.action as ErrorAction) || fallbackAction
        };
      }
    }
  } else if (typeof error === 'string') {
    rawMessage = error;
  }

  // Network / connection problem check
  if (
    isNetwork ||
    status === 0 ||
    /failed to fetch/i.test(rawMessage) ||
    /network\s*error/i.test(rawMessage) ||
    /load failed/i.test(rawMessage) ||
    /connection\s*refused/i.test(rawMessage)
  ) {
    return {
      status: 0,
      title: 'Connection Problem',
      message: 'TrackScore could not connect to the server.',
      retryable: true,
      action: 'retry'
    };
  }

  // HTTP status code mappings
  if (status === 400) {
    const safeMsg = sanitizeMessage(rawMessage);
    return {
      status: 400,
      title: 'Invalid Request',
      message: safeMsg || 'Please check the information and try again.',
      retryable: false,
      action: 'none'
    };
  }

  if (status === 401) {
    return {
      status: 401,
      title: 'Session Expired',
      message: 'Please log in again to continue.',
      retryable: false,
      action: 'login'
    };
  }

  if (status === 403) {
    return {
      status: 403,
      title: 'Access Denied',
      message: 'You do not have permission to access this page or action.',
      retryable: false,
      action: 'dashboard'
    };
  }

  if (status === 404) {
    return {
      status: 404,
      title: 'Not Found',
      message: 'The requested page or record could not be found.',
      retryable: false,
      action: 'back'
    };
  }

  if (status === 409) {
    return {
      status: 409,
      title: 'Information Changed',
      message: 'This information was updated elsewhere. Refresh and try again.',
      retryable: true,
      action: 'retry'
    };
  }

  if (status === 410) {
    return {
      status: 410,
      title: 'Feature No Longer Available',
      message: 'This workflow is no longer used in TrackScore.',
      retryable: false,
      action: 'dashboard'
    };
  }

  if (status === 413) {
    return {
      status: 413,
      title: 'File Too Large',
      message: 'The selected file exceeds the allowed size.',
      retryable: false,
      action: 'none'
    };
  }

  if (status === 415) {
    return {
      status: 415,
      title: 'Unsupported File Type',
      message: 'Please choose a supported file type.',
      retryable: false,
      action: 'none'
    };
  }

  if (status === 422) {
    const safeMsg = sanitizeMessage(rawMessage);
    return {
      status: 422,
      title: 'Validation Error',
      message: safeMsg || 'Please check the submitted information and try again.',
      retryable: false,
      action: 'none'
    };
  }

  if (status === 429) {
    return {
      status: 429,
      title: 'Too Many Requests',
      message: 'Please wait a moment and try again.',
      retryable: true,
      action: 'retry'
    };
  }

  if (status === 500) {
    return {
      status: 500,
      title: 'Server Error',
      message: 'TrackScore could not complete your request.',
      retryable: true,
      action: 'retry'
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      status,
      title: 'Service Temporarily Unavailable',
      message: 'Please try again shortly.',
      retryable: true,
      action: 'retry'
    };
  }

  // Fallback for unknown / generic errors
  const safeFallback = sanitizeMessage(rawMessage);
  return {
    status,
    title: 'Something Went Wrong',
    message: safeFallback || 'Please try again.',
    retryable: true,
    action: fallbackAction
  };
}

