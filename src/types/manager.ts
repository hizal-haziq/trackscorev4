import type {AssessmentSummary} from './assessment';
export interface ManagerMetrics {
  active: number;
  review: number;
  dueSoon: number;
  overdue: number;
  unassigned: number;
  certificates: number;
  certificateReady: number;
  certificateInProgress: number;
}
export interface AttentionAssessment extends AssessmentSummary {
  reason: string;
  action: string;
  kind: string;
}
export interface AssessorWorkload {
  id: string;
  name: string;
  assessorId: string;
  email: string;
  workload: {active: number; capacity: number; isAtCapacity: boolean};
}
export interface ManagerOverview {
  metrics: ManagerMetrics;
  total: number;
  attentionTotal: number;
  attention: AttentionAssessment[];
  recentTotal: number;
  recent: AssessmentSummary[];
  schedule: AssessmentSummary[];
  workload: {assessors: AssessorWorkload[]};
}
export interface OverviewFilters {q: string; status: string; sla: string}
