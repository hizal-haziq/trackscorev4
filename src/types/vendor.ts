/**
 * Vendor Portal Type Definitions (Phase F)
 *
 * Strict Confidentiality Mandate:
 * This interface represents the authoritative Vendor presentation DTO.
 * Internal assessor scoring breakdowns, assessor criterion comments, risk scores,
 * assessor workloads, and manager review notes are STRICTLY EXCLUDED.
 */

export interface VendorProfile {
  id: string;
  companyName: string;
  contactEmail: string;
  loginEmail?: string;
  contactPhone?: string;
  contactPerson?: string;
  officeAddress?: string;
  state?: string;
  registrationNumber?: string;
  createdAt?: string;
  updatedAt?: string;
  linkedEvaluationsCount?: number;
}

export interface VendorDocumentSummary {
  id: string;
  name: string;
  category: string;
  categoryLabel?: string;
  fileType?: string;
  fileSize?: number;
  status?: string;
  statusNote?: string;
  uploadedBy?: string;
  uploadedByRole?: string;
  uploadedAt: string;
  notes?: string;
}

export interface VendorSlaSummary {
  targetDeadline?: string | null;
  status?: string;
  label?: string;
  badgeClass?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  remainingFormatted?: string;
  isCompleted?: boolean;
}

export interface VendorCertificateSummary {
  certificateNumber?: string;
  preparedDate?: string | null;
  printedDate?: string | null;
  signedDate?: string | null;
  signedBy?: string | null;
  deliveredDate?: string | null;
  status?: string;
}

export interface VendorStatusHistoryEntry {
  status: string;
  timestamp: string | null;
  note?: string;
}

export interface VendorAssessment {
  _id: string;
  companyName: string;
  officeAddress?: string;
  state?: string;
  deviceModel?: string;
  package?: string;
  packageName?: string;
  packageDetails?: Record<string, unknown> | null;
  status: string;
  currentVersion: number;
  approvedVersion?: number | null;
  scheduledDate?: string | null;
  assessmentDate?: string | null;
  rejectionReason?: string | null;
  vendorRevisionResponse?: {
    notes?: string;
    submittedAt?: string;
    version?: number;
  } | null;
  documents: VendorDocumentSummary[];
  sla?: VendorSlaSummary;
  totalScore?: number | null;
  starsCount?: number | null;
  ratingLabel?: string | null;
  invoice?: {
    invoiceNumber?: string;
    amount?: number;
    status?: string;
  } | null;
  certificate?: VendorCertificateSummary | null;
  statusHistory?: VendorStatusHistoryEntry[];
  createdAt?: string;
  statusChangedAt?: string;
}

export interface VendorPortalDataResponse {
  success: boolean;
  error?: string;
  vendor?: VendorProfile;
  evaluations?: VendorAssessment[];
  evaluation?: VendorAssessment;
}

export interface VendorDocumentsResponse {
  success: boolean;
  error?: string;
  evaluationId?: string;
  companyName?: string;
  documents?: VendorDocumentSummary[];
  document?: VendorDocumentSummary;
  message?: string;
}

export interface VendorResubmitResponse {
  success: boolean;
  error?: string;
  message?: string;
  version?: number;
  evaluationId?: string;
}

export interface VendorProfileResponse {
  success: boolean;
  error?: string;
  message?: string;
  vendor?: VendorProfile;
}

export interface AssessmentVersionEntry {
  _id?: string;
  versionNumber: number;
  action: string;
  changeReason?: string;
  actor: {
    name: string;
    role: string;
  };
  scores: {
    totalScore?: number;
    starRating?: number;
    starsCount?: number;
    ratingLabel?: string;
  };
  isApprovedVersion?: boolean;
  isCertifiedVersion?: boolean;
  createdAt: string;
}

export interface AssessmentHistoryResponse {
  success: boolean;
  error?: string;
  evaluationId?: string;
  companyName?: string;
  deviceModel?: string;
  currentVersion?: number;
  approvedVersion?: number | null;
  certifiedVersion?: number | null;
  totalVersions?: number;
  history?: AssessmentVersionEntry[];
}

