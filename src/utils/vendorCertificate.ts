import type { VendorAssessment } from '../types/vendor';

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
 * Verifies if an evaluation has reached the Vendor-accessible certificate stage.
 */
export function isCertificateAvailableForVendor(record: VendorAssessment): boolean {
  const isIssued = ['certificate_issued', 'completed'].includes(record.status);
  const cert = record.certificate;
  return Boolean(isIssued && cert?.certificateNumber);
}

/**
 * Verifies if an evaluation has been officially signed and is ready for PDF download.
 */
export function isCertificateDownloadableForVendor(record: VendorAssessment): boolean {
  const cert = record.certificate;
  return Boolean(
    isCertificateAvailableForVendor(record) &&
    cert?.signedDate &&
    cert?.signedBy
  );
}

/**
 * Downloads the official certificate PDF for a vendor assessment record.
 */
export async function downloadVendorCertificatePdf(record: VendorAssessment): Promise<void> {
  if (!isCertificateDownloadableForVendor(record)) {
    throw new Error('Certificate PDF is unavailable until officially signed by the authorized signatory.');
  }

  await ensureCertificatePdfLoaded();

  const downloadFn = typeof window !== 'undefined' ? (window as any).downloadTrackScoreCertificatePdf : null;
  if (typeof downloadFn !== 'function') {
    throw new Error('Certificate generator template is not loaded. Please refresh the page.');
  }

  await downloadFn(record);
}

