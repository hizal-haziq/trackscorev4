import {ApiError, apiRequest} from './api';
import {readSession} from './auth';
import {isRecord} from '../types/api';
import type {AssessmentHistory, AssessmentPage, AssessmentVersion, Criterion, ManagerAssessment, RepositoryFilters, Scores, VersionSummary} from '../types/managerAssessment';

export const DEFAULT_FILTERS: RepositoryFilters = {q: '', status: '', assessor: '', slaStatus: '', riskLevel: '', includeDeleted: false, queue: '', sortBy: 'createdAt'};
export const text = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null;
export const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const object = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const invalid = () => new ApiError('The assessment response is incomplete. Please try again.', 200, 'invalid-response');
export function requireManager() {if (readSession()?.user.role !== 'manager') throw new ApiError('Manager access required.', 403, 'forbidden');}
function id(value: unknown): string {if (typeof value !== 'string' || !value) throw invalid(); return value;}
export function scores(value: unknown): Scores {const r = object(value); return {sectionAScore: number(r.sectionAScore), sectionBScore: number(r.sectionBScore), totalScore: number(r.totalScore), starsCount: number(r.starsCount), ratingLabel: text(r.ratingLabel)};}
export function criteria(value: unknown): Criterion[] {return list(value).map(value => {const r = object(value);return {id: text(r.id), name: text(r.name), section: text(r.section), selectedOption: text(r.selectedOption), points: number(r.points), comment: text(r.comment)};});}
export function projectAssessment(value: unknown): ManagerAssessment {
  const r = object(value), c = object(r.certificate), s = object(r.sla);
  return {id: id(r._id || r.id), companyName: text(r.companyName), deviceModel: text(r.deviceModel), status: text(r.status) || '',
    assessorName: text(r.assessorName), assessorId: text(r.assessorId), assignedAssessorName: text(r.assignedAssessorName || r.assignedAssessor), assignedAssessorId: text(r.assignedAssessorId),
    scheduledDate: text(r.scheduledDate), assessmentDate: text(r.assessmentDate), createdAt: text(r.createdAt), updatedAt: text(r.updatedAt || r.statusChangedAt || r.createdAt), deletedAt: text(r.deletedAt),
    currentVersion: number(r.currentVersion), approvedVersion: number(r.approvedVersion), rubricVersion: text(r.rubricVersion), managerReviewComment: text(r.managerReviewComment || r.reviewComment),
    contactPerson: text(r.contactPerson), contactEmail: text(r.contactEmail), contactPhone: text(r.contactPhone), officeAddress: text(r.officeAddress), state: text(r.state),
    packageName: text(r.packageName), registrationReferenceId: text(r.registrationReferenceId || r.linkedRegistrationId),
    ...scores(r), breakdown: criteria(r.breakdown),
    sla: text(s.status) ? {status: String(s.status), startAt: text(s.startAt), deadline: text(s.deadline), durationDays: number(s.durationDays), remainingFormatted: text(s.remainingFormatted), overdueFormatted: text(s.overdueFormatted)} : null,
    certificate: {certificateNumber: text(c.certificateNumber), certifiedVersion: number(c.certifiedVersion), preparedDate: text(c.preparedDate), printedDate: text(c.printedDate), signedDate: text(c.signedDate), sentToCustomerDate: text(c.sentToCustomerDate), signedBy: text(c.signedBy), preparedBy: text(c.preparedBy), printedBy: text(c.printedBy), deliveredBy: text(c.deliveredBy), deliveryMethod: text(c.deliveryMethod), notes: text(c.notes)},
    statusHistory: list(r.statusHistory).map(object).filter(e => !/payment|pending_verification|pre.?final/i.test(String(e.status || e.action || '') + ' ' + String(e.note || ''))).map(e => ({status: text(e.status), actor: text(e.actor || e.changedBy), timestamp: text(e.timestamp || e.changedAt), note: text(e.note)})),
    documents: list(r.documents).map(object).filter(d => d.category !== 'payment_proof').map(d => ({name: text(d.fileName || d.filename || d.name), category: text(d.category), uploadedAt: text(d.uploadedAt)}))};
}
export function parseAssessmentPage(value: unknown): AssessmentPage {
  const r = object(value);
  if (r.success !== true || !Array.isArray(r.data) || !['total','page','limit','totalPages'].every(key => Number.isInteger(r[key]) && Number(r[key]) >= (key === 'total' ? 0 : 1))) throw invalid();
  return {rows: r.data.map(projectAssessment), total: Number(r.total), page: Number(r.page), limit: Number(r.limit), totalPages: Number(r.totalPages)};
}
export function repositoryQuery(filters: RepositoryFilters, page: number, limit: number): string {
  const query = new URLSearchParams({page: String(Math.max(1, Math.trunc(page))), limit: String(Math.max(1, Math.min(100, Math.trunc(limit)))), includeDeleted: String(filters.includeDeleted), sortBy: filters.sortBy});
  for (const key of ['q','status','assessor','slaStatus','riskLevel','queue'] as const) if (filters[key]) query.set(key, filters[key]);
  return query.toString();
}
export async function getAssessmentPage(filters: RepositoryFilters, page: number, limit: number, signal: AbortSignal) {requireManager();return parseAssessmentPage(await apiRequest(`get-evaluations?${repositoryQuery(filters, page, limit)}`, {signal}));}
export function parseAssessmentDetail(value: unknown, expectedId: string): ManagerAssessment {
  const r = object(value);if (r.success !== true || !Array.isArray(r.data)) throw invalid();
  if (!r.data.length) throw new ApiError('Assessment not found.', 404);
  const result = projectAssessment(r.data[0]);if (result.id !== expectedId) throw invalid();return result;
}
export async function getAssessmentDetail(evaluationId: string, signal: AbortSignal) {requireManager();return parseAssessmentDetail(await apiRequest(`lookup-evaluation?${new URLSearchParams({id: evaluationId, fullDetails: 'true'})}`, {signal}), evaluationId);}
function summary(value: unknown): VersionSummary {
  const r = object(value), actor = object(r.actor);if (!Number.isInteger(r.versionNumber) || Number(r.versionNumber) < 1) throw invalid();
  return {versionNumber: Number(r.versionNumber), action: text(r.action), changeReason: text(r.changeReason), actor: text(actor.name), actorRole: text(actor.role), createdAt: text(r.createdAt), isApprovedVersion: r.isApprovedVersion === true, isCertifiedVersion: r.isCertifiedVersion === true, scores: scores(r.scores || r)};
}
export function parseAssessmentHistory(value: unknown, expectedId: string): AssessmentHistory {
  const r = object(value);if (r.success !== true || r.evaluationId !== expectedId || !Array.isArray(r.history)) throw invalid();
  return {evaluationId: expectedId, currentVersion: number(r.currentVersion), approvedVersion: number(r.approvedVersion), certifiedVersion: number(r.certifiedVersion), history: r.history.map(summary)};
}
export async function getAssessmentHistory(evaluationId: string, signal: AbortSignal) {requireManager();return parseAssessmentHistory(await apiRequest(`get-assessment-history?${new URLSearchParams({evaluationId})}`, {signal}), evaluationId);}
export function parseAssessmentVersion(value: unknown, expectedId: string, expectedVersion: number): AssessmentVersion {
  const r = object(value), v = object(r.version), meta = object(v.metadata);if (r.success !== true || r.evaluationId !== expectedId || v.versionNumber !== expectedVersion) throw invalid();
  return {...summary(v), evaluationId: expectedId, breakdown: criteria(v.breakdown), metadata: {companyName: text(meta.companyName), deviceModel: text(meta.deviceModel), assessmentDate: text(meta.assessmentDate), rubricVersion: text(meta.rubricVersion)}, approvedBy: text(v.approvedBy), approvedAt: text(v.approvedAt)};
}
export async function getAssessmentVersion(evaluationId: string, version: number, signal: AbortSignal) {requireManager();return parseAssessmentVersion(await apiRequest(`get-assessment-version?${new URLSearchParams({evaluationId, version: String(version)})}`, {signal}), evaluationId, version);}
