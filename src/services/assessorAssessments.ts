/**
 * Service for fetching Assessor work queues, details, and revisions
 */

import {apiRequest} from './api';
import type {AssessorTaskItem} from '../types/assessor';

function parseTaskItem(raw: any): AssessorTaskItem {
  const id = String(raw._id || raw.id || '');
  const companyName = String(raw.companyName || raw.metadata?.companyName || 'Untitled Company');
  const deviceModel = String(raw.deviceModel || raw.metadata?.deviceModel || 'Unspecified Device');
  const packageName = String(raw.packageName || raw.metadata?.packageName || 'Standard Assessment');
  const status = String(raw.status || 'pending_review').toLowerCase();
  const scheduledDate = raw.scheduledDate ? String(raw.scheduledDate) : null;
  const assessmentDate = raw.assessmentDate ? String(raw.assessmentDate) : null;
  const assessorName = raw.assessorName ? String(raw.assessorName) : (raw.assignedAssessorName ? String(raw.assignedAssessorName) : null);
  const assessorId = raw.assessorId ? String(raw.assessorId) : (raw.assignedAssessorId ? String(raw.assignedAssessorId) : null);
  const currentVersion = Number(raw.currentVersion || 1);
  const totalScore = Number(raw.totalScore ?? raw.scores?.total ?? 0);
  const starRating = Number(raw.starRating ?? raw.scores?.starRating ?? 0);
  const starsCount = Math.round(Number(raw.starsCount ?? starRating));
  const ratingLabel = raw.ratingLabel ? String(raw.ratingLabel) : undefined;
  const rejectionReason = raw.rejectionReason ? String(raw.rejectionReason) : null;
  const commentsCount = Array.isArray(raw.comments) ? raw.comments.length : 0;
  const createdAt = String(raw.createdAt || new Date().toISOString());
  const updatedAt = raw.updatedAt ? String(raw.updatedAt) : undefined;

  const sla = raw.sla ? {
    status: raw.sla.status,
    label: raw.sla.label,
    deadline: raw.sla.deadline,
    remainingFormatted: raw.sla.remainingFormatted,
    isCompleted: raw.sla.isCompleted,
  } : undefined;

  return {
    id,
    companyName,
    deviceModel,
    packageName,
    package: raw.package,
    status,
    scheduledDate,
    assessmentDate,
    assessorName,
    assessorId,
    currentVersion,
    totalScore,
    starRating,
    starsCount,
    ratingLabel,
    sla,
    rejectionReason,
    commentsCount,
    createdAt,
    updatedAt
  };
}

export async function fetchAssessorWork(signal?: AbortSignal): Promise<{
  all: AssessorTaskItem[];
  assigned: AssessorTaskItem[];
  changesRequested: AssessorTaskItem[];
  submitted: AssessorTaskItem[];
}> {
  const res = (await apiRequest('get-evaluations?limit=100&includeBreakdown=false', {signal})) as any;
  const records = Array.isArray(res.data) ? res.data : (Array.isArray(res.evaluations) ? res.evaluations : []);
  const all = records.map(parseTaskItem);

  const assigned: AssessorTaskItem[] = [];
  const changesRequested: AssessorTaskItem[] = [];
  const submitted: AssessorTaskItem[] = [];

  for (const item of all) {
    const s = item.status.toLowerCase();
    if (s === 'registered' || s === 'scheduled' || s === 'in_progress') {
      assigned.push(item);
    } else if (s === 'rejected' || s === 'remediation_required' || s === 'revision_requested') {
      changesRequested.push(item);
    } else {
      submitted.push(item);
    }
  }

  return {all, assigned, changesRequested, submitted};
}

export async function fetchAssessmentDetail(id: string, signal?: AbortSignal): Promise<any> {
  const res = (await apiRequest(`lookup-evaluation?id=${encodeURIComponent(id)}`, {signal})) as any;
  if (!res.data || !res.data[0]) {
    throw new Error('Assessment not found or you are not authorized to view it.');
  }
  return res.data[0];
}
