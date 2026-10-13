/**
 * TrackScore Certificate Lifecycle Service Layer (Phase D)
 * Authoritative endpoints and client PDF orchestrator for:
 * 1. Prepare Certificate
 * 2. Mark Printed
 * 3. Record DGO Signature
 * 4. Deliver Certificate to Customer
 * 5. Download Official Certificate PDF (reuses existing certificate-pdf.js)
 */

import { ApiError, apiRequest } from './api';
import { readSession } from './auth';
import { isRecord } from '../types/api';
import type { ManagerAssessment } from '../types/managerAssessment';

export function requireManager() {
  const session = readSession();
  if (!session || session.user.role !== 'manager') {
    throw new ApiError('Manager access required.', 403, 'forbidden');
  }
  return session;
}

export interface CertificateMetadata {
  certificateNumber: string | null;
  certifiedVersion?: number | null;
  preparedDate: string | null;
  printedDate: string | null;
  signedBy: string | null;
  signedDate: string | null;
  sentToCustomerDate: string | null;
  deliveryMethod?: string;
  deliveredBy?: string;
  notes?: string;
}

export interface CertificateActionResponse {
  success: boolean;
  message: string;
  status: string;
  certificate: CertificateMetadata;
  sla?: unknown;
}

export interface PrepareCertificatePayload {
  id: string;
  expectedVersion?: number;
  certificateNumber?: string;
  preparedDate?: string;
}

export interface PrintCertificatePayload {
  id: string;
  expectedVersion?: number;
  printedDate?: string;
}

export interface SignCertificatePayload {
  id: string;
  expectedVersion?: number;
  signedBy: string;
  signedDate?: string;
}

export interface DeliverCertificatePayload {
  id: string;
  expectedVersion?: number;
  deliveryMethod?: string;
  sentToCustomerDate?: string;
  notes?: string;
}

export async function prepareCertificate(
  payload: PrepareCertificatePayload,
  signal?: AbortSignal
): Promise<CertificateActionResponse> {
  requireManager();

  const body = {
    id: payload.id,
    expectedVersion: payload.expectedVersion,
    step: 'prepare',
    certificateNumber: payload.certificateNumber?.trim() || undefined,
    preparedDate: payload.preparedDate?.trim() || undefined
  };

  const res = await apiRequest('manage-certificate', {
    method: 'POST',
    body,
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to prepare certificate.', 500);
  }

  return res as unknown as CertificateActionResponse;
}

export async function markPrintedCertificate(
  payload: PrintCertificatePayload,
  signal?: AbortSignal
): Promise<CertificateActionResponse> {
  requireManager();

  const body = {
    id: payload.id,
    expectedVersion: payload.expectedVersion,
    step: 'print',
    printedDate: payload.printedDate?.trim() || undefined
  };

  const res = await apiRequest('manage-certificate', {
    method: 'POST',
    body,
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to mark certificate as printed.', 500);
  }

  return res as unknown as CertificateActionResponse;
}

export async function recordSignature(
  payload: SignCertificatePayload,
  signal?: AbortSignal
): Promise<CertificateActionResponse> {
  requireManager();

  const signedBy = payload.signedBy?.trim();
  if (!signedBy) {
    throw new ApiError('Signatory name is required to record signature.', 400);
  }

  const body = {
    id: payload.id,
    expectedVersion: payload.expectedVersion,
    step: 'sign',
    signedBy,
    signedDate: payload.signedDate?.trim() || undefined
  };

  const res = await apiRequest('manage-certificate', {
    method: 'POST',
    body,
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to record certificate signature.', 500);
  }

  return res as unknown as CertificateActionResponse;
}

export async function deliverCertificate(
  payload: DeliverCertificatePayload,
  signal?: AbortSignal
): Promise<CertificateActionResponse> {
  requireManager();

  const notes = payload.notes?.trim();
  if (notes && notes.length > 2000) {
    throw new ApiError('Delivery notes cannot exceed 2000 characters.', 400);
  }

  const body = {
    id: payload.id,
    expectedVersion: payload.expectedVersion,
    step: 'deliver',
    deliveryMethod: payload.deliveryMethod?.trim() || undefined,
    sentToCustomerDate: payload.sentToCustomerDate?.trim() || undefined,
    notes: notes || undefined
  };

  const res = await apiRequest('manage-certificate', {
    method: 'POST',
    body,
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to mark certificate as delivered.', 500);
  }

  return res as unknown as CertificateActionResponse;
}

/**
 * Ensures the official certificate PDF engine (/certificate-pdf.js) is loaded on demand.
 */
export async function ensureCertificatePdfLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof (window as any).downloadTrackScoreCertificatePdf === 'function') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="certificate-pdf.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load certificate PDF script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = '/certificate-pdf.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(new Error('Failed to load certificate PDF script: ' + e));
    document.head.appendChild(script);
  });
}

/**
 * Downloads the official certificate PDF by reusing window.downloadTrackScoreCertificatePdf.
 */
export async function downloadCertificatePdf(
  record: ManagerAssessment,
  customFilename?: string
): Promise<void> {
  await ensureCertificatePdfLoaded();

  const downloadFn = typeof window !== 'undefined' ? (window as any).downloadTrackScoreCertificatePdf : null;
  if (typeof downloadFn !== 'function') {
    throw new Error('Certificate PDF download function is not available.');
  }

  await downloadFn(record, customFilename);
}

