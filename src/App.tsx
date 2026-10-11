/**
 * TrackScore React Manager Overview
 * Phase 9 React Migration Component
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ManagerOverview, OverviewFilters } from './types/manager';
import { getManagerOverview } from './services/assessments';
import { readSession, clearSession } from './services/auth';
import { formatDate } from './utils/format';
import { statusLabel, statusTone } from './utils/status';

export default function App() {
  const [session, setSession] = useState(() => readSession());
  const [overview, setOverview] = useState<ManagerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OverviewFilters>({ q: '', status: '', sla: '' });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Authenticate manager
  useEffect(() => {
    const currentSession = readSession();
    if (!currentSession || currentSession.user.role !== 'manager') {
      setSession(null);
      // If not manager, redirect to manager login
      const timeout = setTimeout(() => {
        window.location.href = '/login.html?role=manager';
      }, 1500);
      return () => clearTimeout(timeout);
    }
    setSession(currentSession);
  }, []);

  const fetchOverview = useCallback(async (currentFilters: OverviewFilters) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await getManagerOverview(currentFilters, controller.signal);
      setOverview(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load manager overview data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session || session.user.role !== 'manager') return;
    fetchOverview(filters);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [session, filters, fetchOverview]);

  const handleSignOut = () => {
    clearSession();
    window.location.href = '/login.html?role=manager';
  };

  if (!session || session.user.role !== 'manager') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 p-8 text-center">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Manager Access Required</h2>
          <p className="text-sm text-slate-600 mb-6">
            You must be signed in as a Manager to access this overview. Redirecting to login...
          </p>
          <a
            href="/login.html?role=manager"
            className="inline-block w-full py-2.5 px-4 bg-[#f58220] hover:bg-[#e07519] text-white font-medium rounded-lg text-sm transition-colors"
          >
            Go to Manager Sign In
          </a>
        </div>
      </div>
    );
  }

  const toneClasses = (tone: 'neutral' | 'warning' | 'danger' | 'success') => {
    switch (tone) {
      case 'danger': return 'bg-red-50 text-red-700 border-red-200';
      case 'warning': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/landing.html" className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Track<span className="text-[#f58220]">Score</span>
              </span>
            </a>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-100 text-[#f58220]">
              React Manager Overview
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="/dashboard.html"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
            >
              Legacy Dashboard
            </a>
            <div className="h-4 w-px bg-slate-200" />
            <div className="text-sm">
              <span className="font-medium text-slate-900">{session.user.name}</span>
              <span className="ml-1 text-xs text-slate-500">(Manager)</span>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Title and Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Operational Overview</h1>
            <p className="text-sm text-slate-500 mt-1">
              Live evaluation metrics, upcoming assessments, and assessor workload tracking.
              {lastUpdated && (
                <span className="ml-2 text-xs text-slate-400">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchOverview(filters)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Filter by company or device..."
              value={filters.q}
              onChange={(e) => setFilters(f => ({ ...f, q: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Status Filter
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220] focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Changes Requested</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              SLA Filter
            </label>
            <select
              value={filters.sla}
              onChange={(e) => setFilters(f => ({ ...f, sla: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220] focus:border-transparent"
            >
              <option value="">All SLA Tiers</option>
              <option value="ON_TRACK">On Track</option>
              <option value="DUE_SOON">Due Soon</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold">Error:</span>
              <span className="text-sm">{error}</span>
            </div>
            <button
              onClick={() => fetchOverview(filters)}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && !overview && (
          <div className="py-24 text-center">
            <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-[#f58220] rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-500">Loading manager overview metrics...</p>
          </div>
        )}

        {/* Overview Content */}
        {overview && (
          <div className="space-y-8">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 border-t-4 border-t-slate-400 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Active Total</span>
                <span className="block text-3xl font-extrabold text-slate-900 mt-2">{overview.metrics.active}</span>
                <span className="text-xs text-slate-400 mt-1 block">In evaluation cycle</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 border-t-4 border-t-[#f58220] shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Pending Review</span>
                <span className="block text-3xl font-extrabold text-[#f58220] mt-2">{overview.metrics.review}</span>
                <span className="text-xs text-slate-400 mt-1 block">Awaiting sign-off</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 border-t-4 border-t-amber-500 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Due Soon</span>
                <span className="block text-3xl font-extrabold text-amber-600 mt-2">{overview.metrics.dueSoon}</span>
                <span className="text-xs text-slate-400 mt-1 block">Approaching SLA</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 border-t-4 border-t-red-600 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Overdue</span>
                <span className="block text-3xl font-extrabold text-red-600 mt-2">{overview.metrics.overdue}</span>
                <span className="text-xs text-slate-400 mt-1 block">Past SLA deadline</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 border-t-4 border-t-blue-500 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Cert Ready</span>
                <span className="block text-3xl font-extrabold text-blue-600 mt-2">{overview.metrics.certificateReady}</span>
                <span className="text-xs text-slate-400 mt-1 block">Approved &amp; ready</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 border-t-4 border-t-emerald-600 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Certificates</span>
                <span className="block text-3xl font-extrabold text-emerald-600 mt-2">{overview.metrics.certificates}</span>
                <span className="text-xs text-slate-400 mt-1 block">Issued &amp; completed</span>
              </div>
            </div>

            {/* Two Column Layout: Attention Items & Today's Schedule */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Attention List */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Action Required
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {overview.attention.length}
                    </span>
                  </h2>
                </div>

                {overview.attention.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    All caught up! No urgent attention items at this time.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {overview.attention.map((item) => (
                      <div key={item._id} className="py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{item.companyName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.deviceModel} &middot; {item.reason}</p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${toneClasses(statusTone(item.status))}`}>
                          {item.action || statusLabel(item.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Schedule List */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Scheduled Assessments
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {overview.schedule.length}
                    </span>
                  </h2>
                </div>

                {overview.schedule.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    No assessments scheduled for the upcoming window.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {overview.schedule.map((item) => (
                      <div key={item._id} className="py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{item.companyName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Assessor: {item.assessorName || 'Unassigned'} &middot; Scheduled: {formatDate(item.scheduledDate)}
                          </p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${toneClasses(statusTone(item.status))}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Assessor Workload Panel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4">Assessor Workload Distribution</h2>
              {overview.workload.assessors.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No active assessors registered.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {overview.workload.assessors.map((assessor) => {
                    const active = assessor.workload.active;
                    const capacity = assessor.workload.capacity || 5;
                    const percent = Math.min(100, Math.round((active / capacity) * 100));
                    return (
                      <div key={assessor.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{assessor.name}</p>
                            <p className="text-xs text-slate-500">{assessor.assessorId || assessor.email}</p>
                          </div>
                          {assessor.workload.isAtCapacity && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">
                              AT CAPACITY
                            </span>
                          )}
                        </div>

                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>Active assignments</span>
                            <span className="font-semibold">{active} / {capacity}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${percent >= 100 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-[#f58220]'}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Assessments Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Recent Assessments</h2>
                <a
                  href="/dashboard.html"
                  className="text-xs font-semibold text-[#f58220] hover:underline"
                >
                  View All in Legacy Dashboard &rarr;
                </a>
              </div>

              {overview.recent.length === 0 ? (
                <p className="text-sm text-slate-500 py-12 text-center">No assessments found matching the current criteria.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Company / Device</th>
                        <th className="px-6 py-3 font-semibold">Assessor</th>
                        <th className="px-6 py-3 font-semibold">Status</th>
                        <th className="px-6 py-3 font-semibold">SLA Status</th>
                        <th className="px-6 py-3 font-semibold">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.recent.map((rec) => (
                        <tr key={rec._id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{rec.companyName}</div>
                            <div className="text-xs text-slate-500">{rec.deviceModel}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {rec.assessorName || 'Unassigned'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${toneClasses(statusTone(rec.status))}`}>
                              {statusLabel(rec.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {rec.sla ? (
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${toneClasses(statusTone(rec.sla.status))}`}>
                                {rec.sla.status.replace('_', ' ')}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {formatDate(rec.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
