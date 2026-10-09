import type {ManagerOverview, OverviewFilters} from '../types/manager';
import {isRecord} from '../types/api';
import {ApiError, apiRequest} from './api';

const count = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const nullableString = (v: unknown) => v === null || typeof v === 'string';
function compact(value: unknown) {
  return isRecord(value) && ['_id', 'companyName', 'deviceModel', 'assessorName', 'status'].every(k => typeof value[k] === 'string') &&
    nullableString(value.updatedAt) && nullableString(value.scheduledDate) &&
    (value.sla === undefined || value.sla === null || (isRecord(value.sla) && typeof value.sla.status === 'string'));
}
export function parseManagerOverview(value: unknown): ManagerOverview {
  if (!isRecord(value) || value.success !== true || !isRecord(value.overview)) throw new ApiError('The overview response is incomplete.', 200, 'invalid-response');
  const o = value.overview;
  if (!isRecord(o.metrics) || !['active','review','dueSoon','overdue','unassigned','certificates','certificateReady','certificateInProgress'].every(k => count((o.metrics as Record<string, unknown>)[k])) ||
    !['total','attentionTotal','recentTotal'].every(k => count(o[k])) ||
    !Array.isArray(o.recent) || !o.recent.every(compact) || !Array.isArray(o.schedule) || !o.schedule.every(compact) ||
    !Array.isArray(o.attention) || !o.attention.every(r => compact(r) && isRecord(r) && ['reason','action','kind'].every(k => typeof r[k] === 'string')) ||
    !isRecord(o.workload) || !Array.isArray(o.workload.assessors) || !o.workload.assessors.every(a => isRecord(a) && ['id','name','assessorId','email'].every(k => typeof a[k] === 'string') && isRecord(a.workload) && count(a.workload.active) && count(a.workload.capacity) && typeof a.workload.isAtCapacity === 'boolean')) {
    throw new ApiError('The overview response is incomplete.', 200, 'invalid-response');
  }
  return o as unknown as ManagerOverview;
}
export async function getManagerOverview(filters: OverviewFilters, signal: AbortSignal): Promise<ManagerOverview> {
  const query = new URLSearchParams({view: 'overview', q: filters.q, overviewStatus: filters.status, overviewSla: filters.sla});
  return parseManagerOverview(await apiRequest(`get-evaluations?${query}`, {signal}));
}
