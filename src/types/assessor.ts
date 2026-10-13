/**
 * TypeScript Interfaces for TrackScore Assessor Domain
 */


export interface AssessorTaskItem {
  id: string;
  companyName: string;
  deviceModel: string;
  packageName: string;
  package?: string;
  status: string;
  scheduledDate: string | null;
  assessmentDate: string | null;
  assessorName: string | null;
  assessorId: string | null;
  currentVersion: number;
  totalScore: number;
  starRating: number;
  starsCount: number;
  ratingLabel?: string;
  sla?: {
    status?: string;
    label?: string;
    deadline?: string;
    remainingFormatted?: string;
    isCompleted?: boolean;
  };
  rejectionReason?: string | null;
  commentsCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AssessorDraftSelection {
  section: 'A' | 'B';
  id: string;
  name: string;
  selectedOption: string;
  points: number;
  isAnswered: boolean;
  comment: string;
}

export interface AssessorDraftMetadata {
  companyName?: string;
  deviceModel?: string;
  packageName?: string;
  package?: string;
  assessorName?: string;
  assessorId?: string;
  assessmentDate?: string;
  officeAddress?: string;
  state?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  rubricVersion?: string;
  resubmitRecordId?: string | null;
  linkedRegistrationId?: string | null;
}

export interface AssessorDraft {
  draftId: string;
  companyName: string;
  deviceModel: string;
  packageName: string;
  assessorName: string;
  assessorId: string;
  lastSavedAt: string;
  formattedTime?: string;
  rubricVersion: string;
  formState: {
    metadata: AssessorDraftMetadata;
    selections: Record<string, AssessorDraftSelection>;
    answeredCriteria: Record<string, boolean>;
    scores: {
      sectionAScore: number;
      sectionBScore: number;
      totalScore: number;
      starRating: number;
      starsCount: number;
      ratingLabel: string;
    };
  };
}

export interface PeerComment {
  commentId: string;
  authorName: string;
  authorRole: string;
  text: string;
  aiSummary?: string;
  createdAt: string;
}

export interface PeerReviewEvaluation {
  id: string;
  companyName: string;
  deviceModel: string;
  packageName: string;
  assessorName: string;
  assessorId: string;
  assessmentDate: string;
  status: string;
  totalScore: number;
  starRating: number;
  starsCount: number;
  currentVersion: number;
  comments: PeerComment[];
  commentsOverallSummary?: string;
  breakdown?: Array<{
    id: string;
    section: string;
    name: string;
    selectedOption: string;
    tierPoints?: number;
    comment?: string;
  }>;
  createdAt: string;
}

export interface SubmissionPayload {
  companyName: string;
  deviceModel: string;
  packageName: string;
  package?: string;
  assessorName: string;
  assessorId: string;
  assessmentDate: string;
  officeAddress?: string;
  state?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  rubricVersion: string;
  sectionAScore: number;
  sectionBScore: number;
  totalScore: number;
  starRating: number;
  starsCount: number;
  ratingLabel: string;
  breakdown: Array<{
    section: 'A' | 'B';
    id: string;
    name: string;
    selectedOption: string;
    points?: number;
    comment: string;
  }>;
  resubmitRecordId?: string;
  registrationId?: string;
  linkedRegistrationId?: string;
  changeReason?: string;
}

export interface SubmissionResult {
  success: boolean;
  id: string;
  status: string;
  isResubmission?: boolean;
  currentVersion: number;
  version?: number;
  verifiedScores?: {
    sectionAScore: number;
    sectionBScore: number;
    totalScore: number;
    starRating: number;
    ratingLabel: string;
  };
  message?: string;
  error?: string;
}
