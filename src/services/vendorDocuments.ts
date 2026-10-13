import { getStoredToken, clearSession } from './auth';
import { ApiError } from './api';
import type { VendorDocumentsResponse } from '../types/vendor';

function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Lists documents for a specific evaluation.
 */
export async function fetchVendorDocuments(
  evaluationId: string,
  signal?: AbortSignal
): Promise<VendorDocumentsResponse> {
  const res = await fetch(
    `/.netlify/functions/vendor-documents?evaluationId=${encodeURIComponent(evaluationId)}`,
    {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      signal
    }
  );

  if (res.status === 401) {
    clearSession();
    throw new ApiError('Your session has expired. Please sign in again.', 401, 'unauthenticated');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Failed to load documents.', res.status);
  }

  return data;
}

/**
 * Uploads a supporting evidence document via base64 encoding.
 */
export async function uploadVendorDocument(
  evaluationId: string,
  file: File,
  category: string,
  notes = ''
): Promise<VendorDocumentsResponse> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });

  const res = await fetch('/.netlify/functions/vendor-documents', {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'upload',
      evaluationId,
      name: file.name,
      category,
      fileType: file.type || 'application/octet-stream',
      fileData: base64Data,
      notes
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Document upload failed.', res.status);
  }

  return data;
}

/**
 * Downloads a stored document file securely.
 */
export async function downloadVendorDocument(
  evaluationId: string,
  docId: string
): Promise<void> {
  const res = await fetch(
    `/.netlify/functions/vendor-documents?action=download&evaluationId=${encodeURIComponent(evaluationId)}&docId=${encodeURIComponent(docId)}`,
    {
      headers: getAuthHeader()
    }
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(errorData.error || 'Unable to download document.', res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const contentDisposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  link.href = url;
  link.download = (match && match[1]) ? match[1] : 'document';

  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Deletes an unaccepted document.
 */
export async function deleteVendorDocument(
  evaluationId: string,
  docId: string
): Promise<VendorDocumentsResponse> {
  const res = await fetch('/.netlify/functions/vendor-documents', {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'delete',
      evaluationId,
      docId
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Document deletion failed.', res.status);
  }

  return data;
}
