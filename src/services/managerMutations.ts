/**
 * TrackScore Manager Workflow Mutation Service Layer
 * Authoritative mutation endpoints for Review, Changes, Approval, Scheduling, and Assignment.
 */

import { ApiError, apiRequest } from './api';
import { readSession } from './auth';
import { isRecord } from '../types/api';

export function requireManager() {
  const session = readSession();
  if (!session || session.user.role !== 'manager') {
    throw new ApiError('Manager access required.', 403, 'forbidden');
  }
  return session;
}

export interface ApprovalResponse {
  success: boolean;
  id: string;
  status: string;
  approvedVersion?: number | null;
  message?: string;
  sla?: unknown;
  statusChangedAt?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface SchedulePayload {
  expectedVersion?: number;
  id: string;
  scheduledDate: string;
  deviceModel?: string;
  notes?: string;
  assignedAssessor?: string;
  assignedAssessorName?: string;
  assignedAssessorId?: string;
  assignedAssessorEmail?: string;
}

export interface ScheduleResponse {
  success: boolean;
  id: string;
  message?: string;
  status: string;
  scheduledDate: string;
  assignedAssessor?: string | null;
  deviceModel?: string;
  sla?: unknown;
}

export interface AssignPayload {
  expectedVersion?: number;
  id: string;
  assessorName: string;
  assessorId?: string;
  assessorEmail?: string;
  scheduledDate?: string;
  deviceModel?: string;
  instructions?: string;
}

export interface CapacityWarning {
  isOverCapacity: boolean;
  activeCount: number;
  capacityLimit: number;
  message: string;
}

export interface AssignResponse {
  success: boolean;
  id: string;
  message?: string;
  status: string;
  assignedAssessor: string;
  assignedAssessorId?: string;
  assignedAssessorEmail?: string;
  scheduledDate?: string | null;
  deviceModel?: string;
  sla?: unknown;
  capacityWarning?: CapacityWarning | null;
}

export interface AssessorDirectoryItem {
  id: string;
  name: string;
  assessorId: string;
  email: string;
  workload: {
    active: number;
    capacity: number;
    isAtCapacity: boolean;
    isOverCapacity: boolean;
    remainingCapacity: number;
    status: string;
    overdue: number;
    dueSoon: number;
    onTrack: number;
    completed: number;
  };
}

/**
 * Submits Manager Approval for an evaluation awaiting review.
 */
export async function approveAssessment(
  id: string,
  managerReviewComment?: string,
  signal?: AbortSignal,
  expectedVersion?: number
): Promise<ApprovalResponse> {
  const session = requireManager();
  const managerName = session.user.name || 'Operations Manager';

  const body = {
    id,
    action: 'approve',
    expectedVersion,
    managerReviewComment: managerReviewComment?.trim() || undefined,
    reviewComment: managerReviewComment?.trim() || undefined,
    managerName
  };

  const res = await apiRequest('approve-evaluation', {
    method: 'POST',
    body,
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to approve assessment.', 500);
  }

  return res as unknown as ApprovalResponse;
}

/**
 * Requests changes / returns assessment to Assessor with required rejection reason.
 */
export async function requestChanges(
  id: string,
  reason: string,
  managerReviewComment?: string,
  signal?: AbortSignal,
  expectedVersion?: number
): Promise<ApprovalResponse> {
  const session = requireManager();
  const managerName = session.user.name || 'Operations Manager';
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    throw new ApiError('Revision reason is required.', 400);
  }

  const comment = (managerReviewComment?.trim() || trimmedReason);

  const body = {
    id,
    action: 'reject',
    expectedVersion,
    reason: trimmedReason,
    rejectionReason: trimmedReason,
    managerReviewComment: comment,
    reviewComment: comment,
    managerName
  };

  const res = await apiRequest('approve-evaluation', {
    method: 'POST',
    body,
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to submit revision request.', 500);
  }

  return res as unknown as ApprovalResponse;
}

/**
 * Schedules an inspection date for a registered customer.
 */
export async function scheduleAssessment(
  payload: SchedulePayload,
  signal?: AbortSignal
): Promise<ScheduleResponse> {
  requireManager();

  if (!payload.scheduledDate || !payload.scheduledDate.trim()) {
    throw new ApiError('Scheduled inspection date is required.', 400);
  }

  const res = await apiRequest('schedule-assessment', {
    method: 'POST',
    body: {
      id: payload.id,
      expectedVersion: payload.expectedVersion,
      scheduledDate: payload.scheduledDate.trim(),
      deviceModel: payload.deviceModel?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
      assignedAssessor: payload.assignedAssessor?.trim() || undefined,
      assignedAssessorName: payload.assignedAssessorName?.trim() || payload.assignedAssessor?.trim() || undefined,
      assignedAssessorId: payload.assignedAssessorId?.trim() || undefined,
      assignedAssessorEmail: payload.assignedAssessorEmail?.trim() || undefined
    },
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to schedule assessment.', 500);
  }

  return res as unknown as ScheduleResponse;
}

/**
 * Assigns or reassigns an assessment to a chosen assessor.
 */
export async function assignAssessor(
  payload: AssignPayload,
  signal?: AbortSignal
): Promise<AssignResponse> {
  requireManager();

  if (!payload.assessorName || !payload.assessorName.trim()) {
    throw new ApiError('Please choose an assessor to assign.', 400);
  }

  const res = await apiRequest('assign-assessor', {
    method: 'POST',
    body: {
      id: payload.id,
      expectedVersion: payload.expectedVersion,
      assessorName: payload.assessorName.trim(),
      assessorId: payload.assessorId?.trim() || undefined,
      assessorEmail: payload.assessorEmail?.trim() || undefined,
      scheduledDate: payload.scheduledDate?.trim() || undefined,
      deviceModel: payload.deviceModel?.trim() || undefined,
      instructions: payload.instructions?.trim() || undefined
    },
    signal
  });

  if (!isRecord(res) || res.success !== true) {
    throw new ApiError('Failed to assign assessor.', 500);
  }

  return res as unknown as AssignResponse;
}

/**
 * Retrieves the registered assessor staff directory with live workload aggregation.
 */
export async function getAssessorDirectory(
  signal?: AbortSignal
): Promise<AssessorDirectoryItem[]> {
  requireManager();

  const res = await apiRequest('get-assessor-workload', {
    method: 'GET',
    signal
  });

  if (!isRecord(res) || res.success !== true || !Array.isArray(res.assessors)) {
    throw new ApiError('Failed to load assessor directory.', 500);
  }

  return res.assessors as AssessorDirectoryItem[];
}

