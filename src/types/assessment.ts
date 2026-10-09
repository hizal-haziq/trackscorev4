export interface SlaSummary {
  status: string;
  deadline?: string | null;
  remainingFormatted?: string;
  overdueFormatted?: string;
}
/** The compact projection returned by the existing Manager overview endpoint. */
export interface AssessmentSummary {
  _id: string;
  companyName: string;
  deviceModel: string;
  assessorName: string;
  status: string;
  sla?: SlaSummary | null;
  updatedAt: string | null;
  scheduledDate: string | null;
}
