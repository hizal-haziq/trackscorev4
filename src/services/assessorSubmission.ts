/**
 * Service for submitting new assessments and resubmitting revisions
 */

import {apiRequest} from './api';
import type {SubmissionPayload, SubmissionResult} from '../types/assessor';

export async function submitAssessment(
  payload: SubmissionPayload,
  signal?: AbortSignal
): Promise<SubmissionResult> {
  const result = (await apiRequest('save-evaluation', {
    method: 'POST',
    body: payload,
    signal
  })) as SubmissionResult;

  return result;
}

export async function resubmitAssessment(
  payload: SubmissionPayload,
  signal?: AbortSignal
): Promise<SubmissionResult> {
  if (!payload.resubmitRecordId) {
    throw new Error('A valid record ID is required to resubmit a revision.');
  }

  const result = (await apiRequest('save-evaluation', {
    method: 'POST',
    body: payload,
    signal
  })) as SubmissionResult;

  return result;
}
