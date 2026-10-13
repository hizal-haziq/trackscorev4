// Internal Manager intelligence has a separate DTO; it is never a Vendor projection.
import {ApiError, apiRequest} from './api';
import {isRecord} from '../types/api';
import {requireManager, text, number} from './managerAssessments';
export interface ManagerRisk {evaluationId: string; versionNumber: number | null; riskLevel: string; riskScore: number | null; dataConfidence: string | null; generatedAt: string | null; signals: {severity: string | null; message: string | null; explanation: string | null}[]; benchmarkingNotes: string[]}
export function parseManagerRisk(value: unknown, evaluationId: string): ManagerRisk {
  if (!isRecord(value) || value.success !== true || !isRecord(value.risk) || value.risk.evaluationId !== evaluationId || typeof value.risk.riskLevel !== 'string') throw new ApiError('Risk information is unavailable or incomplete.', 200, 'invalid-response');
  const r = value.risk;
  return {evaluationId, versionNumber: number(r.versionNumber), riskLevel: String(r.riskLevel), riskScore: number(r.riskScore), dataConfidence: text(r.dataConfidence), generatedAt: text(r.generatedAt),
    signals: Array.isArray(r.signals) ? r.signals.filter(isRecord).map(s => ({severity: text(s.severity), message: text(s.message || s.description || s.type), explanation: text(s.explanation)})) : [],
    benchmarkingNotes: Array.isArray(r.benchmarkingNotes) ? r.benchmarkingNotes.filter((v): v is string => typeof v === 'string') : []};
}
export async function getManagerRisk(evaluationId: string, signal: AbortSignal) {requireManager();return parseManagerRisk(await apiRequest(`get-assessment-risk?${new URLSearchParams({evaluationId})}`, {signal}), evaluationId);}
