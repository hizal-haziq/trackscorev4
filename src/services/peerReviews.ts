/**
 * Service for Peer Review workflows and technical commentary
 */

import {apiRequest} from './api';
import type {PeerReviewEvaluation, PeerComment} from '../types/assessor';

function parsePeerReviewItem(raw: any): PeerReviewEvaluation {
  return {
    id: String(raw._id || raw.id || ''),
    companyName: String(raw.companyName || raw.metadata?.companyName || 'Untitled Company'),
    deviceModel: String(raw.deviceModel || raw.metadata?.deviceModel || 'Unspecified Device'),
    packageName: String(raw.packageName || raw.metadata?.packageName || 'Standard Assessment'),
    assessorName: String(raw.assessorName || raw.metadata?.assessorName || 'Peer Assessor'),
    assessorId: String(raw.assessorId || raw.metadata?.assessorId || ''),
    assessmentDate: String(raw.assessmentDate || raw.metadata?.assessmentDate || ''),
    status: String(raw.status || 'pending_review'),
    totalScore: Number(raw.totalScore ?? raw.scores?.total ?? 0),
    starRating: Number(raw.starRating ?? raw.scores?.starRating ?? 0),
    starsCount: Math.round(Number(raw.starsCount ?? (raw.starRating ?? 0))),
    currentVersion: Number(raw.currentVersion || 1),
    comments: Array.isArray(raw.comments) ? raw.comments.map((c: any) => ({
      commentId: String(c.commentId || c.id || ''),
      authorName: String(c.authorName || 'Anonymous'),
      authorRole: String(c.authorRole || 'assessor'),
      text: String(c.text || ''),
      aiSummary: c.aiSummary ? String(c.aiSummary) : undefined,
      createdAt: String(c.createdAt || new Date().toISOString())
    })) : [],
    commentsOverallSummary: raw.commentsOverallSummary ? String(raw.commentsOverallSummary) : undefined,
    breakdown: Array.isArray(raw.breakdown) ? raw.breakdown : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString())
  };
}

export async function fetchPeerReviews(signal?: AbortSignal): Promise<PeerReviewEvaluation[]> {
  const res = (await apiRequest('lookup-evaluation?peerReview=true&limit=100', {signal})) as any;
  const records = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
  return records.map(parsePeerReviewItem);
}

export async function fetchPeerReviewDetail(id: string, signal?: AbortSignal): Promise<PeerReviewEvaluation> {
  const res = (await apiRequest(`lookup-evaluation?id=${encodeURIComponent(id)}&peerReview=true`, {signal})) as any;
  if (!res.data || !res.data[0]) {
    throw new Error('Peer evaluation record not found.');
  }
  return parsePeerReviewItem(res.data[0]);
}

export interface AddPeerCommentInput {
  evaluationId: string;
  text: string;
  aiSummary?: string;
  commentsOverallSummary?: string;
}

export async function addPeerComment(
  input: AddPeerCommentInput,
  signal?: AbortSignal
): Promise<{ success: boolean; comment: PeerComment; commentsOverallSummary?: string }> {
  if (!input.evaluationId) throw new Error('Evaluation ID is required.');
  const trimmed = input.text.trim();
  if (!trimmed) throw new Error('Comment text cannot be empty.');
  if (trimmed.length > 1000) throw new Error('Comment cannot exceed 1000 characters.');

  const result = (await apiRequest('add-comment', {
    method: 'POST',
    body: {
      evaluationId: input.evaluationId,
      text: trimmed,
      aiSummary: input.aiSummary,
      commentsOverallSummary: input.commentsOverallSummary
    },
    signal
  })) as any;

  return {
    success: true,
    comment: {
      commentId: result.comment.commentId,
      authorName: result.comment.authorName,
      authorRole: result.comment.authorRole,
      text: result.comment.text,
      aiSummary: result.comment.aiSummary,
      createdAt: result.comment.createdAt || new Date().toISOString()
    },
    commentsOverallSummary: result.commentsOverallSummary
  };
}
