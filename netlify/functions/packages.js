/**
 * Reference Data Table for MIROS TrackScore Telematics Packages & Lifecycle
 * Stored as a reference table module, not hardcoded inline.
 */

export const PACKAGES = {
  package_1: {
    id: 'package_1',
    name: 'Package 1',
    label: 'Package 1 (RM 4,500)',
    fullName: 'Package 1: RM4,500, 2-year validity, 1 free reassessment',
    code: 'PKG-01',
    price: 4500,
    currency: 'MYR',
    formattedPrice: 'RM4,500',
    validityYears: 2,
    freeReassessments: 1,
    description: 'RM4,500, 2-year validity, 1 free reassessment'
  },
  package_2: {
    id: 'package_2',
    name: 'Package 2',
    label: 'Package 2 (RM 6,000)',
    fullName: 'Package 2: RM6,000, 3-year validity, 2 free reassessments',
    code: 'PKG-02',
    price: 6000,
    currency: 'MYR',
    formattedPrice: 'RM6,000',
    validityYears: 3,
    freeReassessments: 2,
    description: 'RM6,000, 3-year validity, 2 free reassessments'
  }
};

export const LIFECYCLE_STATUSES = [
  'registered',
  'scheduled',
  'submitted',
  'pending_review',
  'pre_final_sent',
  'payment_confirmed',
  'certificate_issued',
  'completed',
  'rejected'
];

export const LIFECYCLE_METADATA = {
  registered: {
    key: 'registered',
    label: 'Customer Registered',
    badgeClass: 'badge-registered',
    color: '#6366F1',
    bgColor: '#EEF2FF',
    step: 1,
    description: 'Pre-assessment registration created by manager.'
  },
  scheduled: {
    key: 'scheduled',
    label: 'Inspection Scheduled',
    badgeClass: 'badge-scheduled',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    step: 2,
    description: 'Evaluation date agreed and scheduled.'
  },
  submitted: {
    key: 'submitted',
    label: 'Evaluation Submitted',
    badgeClass: 'badge-submitted',
    color: '#D97706',
    bgColor: '#FEF3C7',
    step: 3,
    description: 'Evaluation submitted by assessor, ready for review.'
  },
  pending_review: {
    key: 'pending_review',
    label: 'Pending Review',
    badgeClass: 'badge-pending',
    color: '#EA580C',
    bgColor: '#FFEDD5',
    step: 4,
    description: 'Under managerial review and score validation.'
  },
  pre_final_sent: {
    key: 'pre_final_sent',
    label: 'Pre-Final Result Sent',
    badgeClass: 'badge-pre-final',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    step: 5,
    description: 'Preliminary results delivered to customer before invoice.'
  },
  payment_confirmed: {
    key: 'payment_confirmed',
    label: 'Payment Confirmed',
    badgeClass: 'badge-paid',
    color: '#059669',
    bgColor: '#ECFDF5',
    step: 6,
    description: 'Package invoice paid and verified by manager.'
  },
  certificate_issued: {
    key: 'certificate_issued',
    label: 'Certificate Issued',
    badgeClass: 'badge-certified',
    color: '#16A34A',
    bgColor: '#F0FDF4',
    step: 7,
    description: 'MIROS Certificate generated and signed by DGO.'
  },
  completed: {
    key: 'completed',
    label: 'Completed & Delivered',
    badgeClass: 'badge-completed',
    color: '#15803D',
    bgColor: '#DCFCE7',
    step: 8,
    description: 'Certificate delivered to vendor; evaluation cycle completed.'
  },
  rejected: {
    key: 'rejected',
    label: 'Requires Resubmission',
    badgeClass: 'badge-rejected',
    color: '#DC2626',
    bgColor: '#FEF2F2',
    step: -1,
    description: 'Evaluation returned to assessor for corrections and resubmission.'
  }
};

export function getPackageDetails(packageId) {
  if (!packageId) return PACKAGES.package_1;
  const raw = String(packageId).trim();
  const normalized = raw.toLowerCase().replace(/[-\s]/g, '_');
  if (PACKAGES[normalized]) return PACKAGES[normalized];
  if (normalized === 'package_1' || normalized === 'pkg_01' || normalized === 'pkg1' || normalized === '1') {
    return PACKAGES.package_1;
  }
  if (normalized === 'package_2' || normalized === 'pkg_02' || normalized === 'pkg2' || normalized === '2') {
    return PACKAGES.package_2;
  }
  if (/package\s*2/i.test(raw) || /6[,.]?000/.test(raw) || /3[- ]year/i.test(raw)) {
    return PACKAGES.package_2;
  }
  return PACKAGES.package_1;
}

export function isValidLifecycleStatus(status) {
  return LIFECYCLE_STATUSES.includes(status);
}

export async function handler(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      packages: Object.values(PACKAGES),
      lifecycleStatuses: LIFECYCLE_STATUSES,
      lifecycleMetadata: LIFECYCLE_METADATA
    })
  };
}

export default {
  PACKAGES,
  LIFECYCLE_STATUSES,
  LIFECYCLE_METADATA,
  getPackageDetails,
  isValidLifecycleStatus,
  handler
};
