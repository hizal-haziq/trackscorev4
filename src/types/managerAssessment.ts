/** Manager presentation DTOs: explicitly projected, never raw database objects. */
export interface Criterion {id: string | null; name: string | null; section: string | null; selectedOption: string | null; points: number | null; comment: string | null}
export interface Scores {sectionAScore: number | null; sectionBScore: number | null; totalScore: number | null; starsCount: number | null; ratingLabel: string | null}
export interface AssessmentSla {status: string; startAt: string | null; deadline: string | null; durationDays: number | null; remainingFormatted: string | null; overdueFormatted: string | null}
export interface Certificate {certificateNumber: string | null; certifiedVersion: number | null; preparedDate: string | null; printedDate: string | null; signedDate: string | null; sentToCustomerDate: string | null; signedBy?: string | null; preparedBy?: string | null; printedBy?: string | null; deliveredBy?: string | null; deliveryMethod?: string | null; notes?: string | null}
export interface LifecycleEvent {status: string | null; actor: string | null; timestamp: string | null; note: string | null}
export interface ManagerAssessment extends Scores {
  id: string; companyName: string | null; deviceModel: string | null; status: string;
  assessorName: string | null; assessorId: string | null; assignedAssessorName: string | null; assignedAssessorId: string | null;
  scheduledDate: string | null; assessmentDate: string | null; createdAt: string | null; updatedAt: string | null; deletedAt: string | null;
  currentVersion: number | null; approvedVersion: number | null; rubricVersion: string | null; managerReviewComment: string | null;
  contactPerson: string | null; contactEmail: string | null; contactPhone: string | null; officeAddress: string | null; state: string | null;
  packageName: string | null; registrationReferenceId: string | null; sla: AssessmentSla | null; certificate: Certificate;
  breakdown: Criterion[]; statusHistory: LifecycleEvent[];
  documents: {name: string | null; category: string | null; uploadedAt: string | null}[];
}
export interface RepositoryFilters {q: string; status: string; assessor: string; slaStatus: string; riskLevel: string; includeDeleted: boolean; queue: string; sortBy: string}
export interface AssessmentPage {rows: ManagerAssessment[]; total: number; page: number; limit: number; totalPages: number}
export interface VersionSummary {versionNumber: number; action: string | null; changeReason: string | null; actor: string | null; actorRole: string | null; createdAt: string | null; isApprovedVersion: boolean; isCertifiedVersion: boolean; scores: Scores}
export interface AssessmentHistory {evaluationId: string; currentVersion: number | null; approvedVersion: number | null; certifiedVersion: number | null; history: VersionSummary[]}
export interface AssessmentVersion extends VersionSummary {evaluationId: string; breakdown: Criterion[]; metadata: {companyName: string | null; deviceModel: string | null; assessmentDate: string | null; rubricVersion: string | null}; approvedBy: string | null; approvedAt: string | null}
