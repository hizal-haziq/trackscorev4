/**
 * Multi-Draft Storage Subsystem for Assessor Evaluations
 * Compatible with legacy 'trackscore-drafts' key in localStorage.
 * Hard limit of MAX_DRAFTS = 3 concurrent drafts.
 */

import type {AssessorDraft} from '../types/assessor';
import {RUBRIC_VERSION} from '../utils/rubric';

const DRAFTS_KEY = 'trackscore-drafts';
const ACTIVE_DRAFT_KEY = 'trackscore-active-draft-id';
export const MAX_DRAFTS = 3;

export function getStoredDrafts(): Record<string, AssessorDraft> {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoredDrafts(drafts: Record<string, AssessorDraft>): void {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch (err) {
    console.warn('Could not save drafts to storage:', err);
  }
}

export function getActiveDraftId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DRAFT_KEY);
  } catch {
    return null;
  }
}

export function setActiveDraftId(draftId: string | null): void {
  try {
    if (draftId) localStorage.setItem(ACTIVE_DRAFT_KEY, draftId);
    else localStorage.removeItem(ACTIVE_DRAFT_KEY);
  } catch {}
}

export function generateDraftId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'draft-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

export function saveDraft(
  draftData: Omit<AssessorDraft, 'draftId' | 'lastSavedAt' | 'rubricVersion'>,
  existingDraftId?: string | null,
  forceNew = false
): AssessorDraft {
  const drafts = getStoredDrafts();
  const draftKeys = Object.keys(drafts);

  let targetId = existingDraftId || null;

  if (forceNew || !targetId || !drafts[targetId]) {
    // Creating new draft
    if (draftKeys.length >= MAX_DRAFTS) {
      throw new Error(`Maximum of ${MAX_DRAFTS} drafts reached. Discard or submit an existing draft first.`);
    }
    targetId = generateDraftId();
  }

  const now = new Date().toISOString();
  const fullDraft: AssessorDraft = {
    draftId: targetId,
    companyName: draftData.companyName || 'Untitled Company',
    deviceModel: draftData.deviceModel || 'Unspecified Device',
    packageName: draftData.packageName || 'Standard Assessment',
    assessorName: draftData.assessorName || 'Assessor',
    assessorId: draftData.assessorId || '',
    lastSavedAt: now,
    formattedTime: new Date().toLocaleString(),
    rubricVersion: RUBRIC_VERSION,
    formState: draftData.formState
  };

  drafts[targetId] = fullDraft;
  saveStoredDrafts(drafts);
  setActiveDraftId(targetId);
  return fullDraft;
}

export function discardDraft(draftId: string): boolean {
  const drafts = getStoredDrafts();
  if (drafts[draftId]) {
    delete drafts[draftId];
    saveStoredDrafts(drafts);
    if (getActiveDraftId() === draftId) {
      setActiveDraftId(null);
    }
    return true;
  }
  return false;
}

export function clearSubmittedDraft(draftId: string | null): void {
  if (!draftId) return;
  discardDraft(draftId);
}

