/**
 * TrackScore Assessment SLA & Deadline Tracking Engine
 * Centralized business logic for calculating, deriving, formatting,
 * and auditing SLAs across telematics evaluation lifecycles.
 */

// Centralized Configurable SLA Parameters
export const DEFAULT_SLA_CONFIG = {
  defaultSlaDays: 7,
  dueSoonThresholdHours: 48, // Flagged as DUE_SOON within 48 hours of deadline
  packageSlaDays: {
    package_1: 7, // Package 1: Standard Assessment (7 calendar days)
    package_2: 5  // Package 2: Comprehensive Assessment (5 calendar days priority review)
  }
};

// Canonical SLA Status Constants
export const SLA_STATUS = {
  ON_TRACK: 'ON_TRACK',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
  COMPLETED_ON_TIME: 'COMPLETED_ON_TIME',
  COMPLETED_LATE: 'COMPLETED_LATE'
};

// Human-readable labels and UI visual badge metadata
export const SLA_METADATA = {
  [SLA_STATUS.ON_TRACK]: {
    label: 'On Track',
    badgeClass: 'badge-sla-on-track',
    color: '#059669',
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    icon: 'check-circle',
    description: 'Sufficient time remaining before assessment deadline'
  },
  [SLA_STATUS.DUE_SOON]: {
    label: 'Due Soon',
    badgeClass: 'badge-sla-due-soon',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    icon: 'clock',
    description: 'Assessment deadline is approaching within 48 hours'
  },
  [SLA_STATUS.OVERDUE]: {
    label: 'Overdue',
    badgeClass: 'badge-sla-overdue',
    color: '#DC2626',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
    icon: 'alert-triangle',
    description: 'Assessment deadline has expired and is not yet completed'
  },
  [SLA_STATUS.COMPLETED_ON_TIME]: {
    label: 'Completed On Time',
    badgeClass: 'badge-sla-completed-ontime',
    color: '#15803D',
    bgColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    icon: 'shield-check',
    description: 'Assessment completed and approved within target SLA'
  },
  [SLA_STATUS.COMPLETED_LATE]: {
    label: 'Completed Late',
    badgeClass: 'badge-sla-completed-late',
    color: '#991B1B',
    bgColor: '#FFF1F2',
    borderColor: '#FFE4E6',
    icon: 'alert-circle',
    description: 'Assessment completed after target SLA deadline'
  }
};

/**
 * Determine the configured SLA duration in days for a given assessment or package.
 * Precedence:
 * 1. Explicit doc.slaDurationDays or doc.customSlaDays
 * 2. Package-specific SLA (Package 1: 7 days, Package 2: 5 days)
 * 3. Default system SLA (7 days)
 */
export function resolveSlaDurationDays(doc = {}, customConfig = {}) {
  const config = { ...DEFAULT_SLA_CONFIG, ...customConfig };

  if (typeof doc?.slaDurationDays === 'number' && doc.slaDurationDays > 0) {
    return doc.slaDurationDays;
  }
  if (typeof doc?.customSlaDays === 'number' && doc.customSlaDays > 0) {
    return doc.customSlaDays;
  }

  const pkgKey = String(doc?.package || doc?.requestedPackage || '').trim().toLowerCase();
  if (pkgKey && config.packageSlaDays[pkgKey]) {
    return config.packageSlaDays[pkgKey];
  }

  return config.defaultSlaDays;
}

/**
 * Resolve the SLA start timestamp.
 * Priority:
 * 1. doc.slaStartAt
 * 2. doc.assignedAt (when assessor was assigned)
 * 3. doc.scheduledAt (when inspection was scheduled)
 * 4. doc.createdAt (when record was registered/created)
 * 5. fallback: now
 */
export function resolveSlaStartAt(doc = {}) {
  const candidates = [
    doc?.slaStartAt,
    doc?.assignedAt,
    doc?.scheduledAt,
    doc?.scheduledDate,
    doc?.createdAt
  ];

  for (const c of candidates) {
    if (c) {
      const parsed = new Date(c);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return new Date().toISOString();
}

/**
 * Calculate the authoritative SLA deadline ISO string.
 * Priority:
 * 1. doc.slaDeadline if explicitly stored and valid
 * 2. startAt + (slaDurationDays * 86,400,000 ms)
 */
export function computeSlaDeadline(doc = {}, startAt = null, durationDays = null) {
  if (doc?.slaDeadline) {
    const parsed = new Date(doc.slaDeadline);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const startIso = startAt || resolveSlaStartAt(doc);
  const startTime = new Date(startIso).getTime();
  const days = durationDays || resolveSlaDurationDays(doc);
  const deadlineTime = startTime + (days * 24 * 60 * 60 * 1000);

  return new Date(deadlineTime).toISOString();
}

/**
 * Resolve the completion timestamp for an evaluation if completed.
 * Returns null if the evaluation is active / in-progress.
 */
export function resolveCompletionTimestamp(doc = {}) {
  const st = String(doc?.status || '').toLowerCase().trim();
  const isCompletedStatus = st === 'completed' || st === 'approved';

  if (!isCompletedStatus && !doc?.completedAt && !doc?.approvedAt) {
    return null;
  }

  const candidates = [
    doc?.completedAt,
    doc?.approvedAt,
    doc?.certificate?.sentToCustomerDate,
    doc?.certificate?.signedDate,
    doc?.statusHistory?.slice().reverse().find(h => {
      const hs = String(h?.status || '').toLowerCase();
      return hs === 'completed' || hs === 'approved';
    })?.timestamp,
    doc?.statusChangedAt,
    doc?.updatedAt
  ];

  for (const c of candidates) {
    if (c) {
      const parsed = new Date(c);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  if (isCompletedStatus) {
    return new Date().toISOString();
  }

  return null;
}

/**
 * Format a duration in seconds into a clean, human-readable string.
 * Examples:
 * - "5 days"
 * - "1 day 4 hours"
 * - "18 hours"
 * - "2 hours 14 mins"
 * - "35 mins"
 * - "< 1 min"
 */
export function formatDurationSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (days >= 2) {
    return `${days} days`;
  }
  if (days === 1) {
    return hours > 0 ? `1 day ${hours}h` : `1 day`;
  }
  if (hours >= 2) {
    return minutes > 0 ? `${hours} hours ${minutes}m` : `${hours} hours`;
  }
  if (hours === 1) {
    return minutes > 0 ? `1 hour ${minutes}m` : `1 hour`;
  }
  if (minutes >= 1) {
    return `${minutes} mins`;
  }
  return '< 1 min';
}

/**
 * Authoritatively derive the complete SLA descriptor for an assessment document.
 * Pure function: Does NOT mutate the input document.
 * 
 * @param {Object} doc Assessment/Evaluation document
 * @param {Object} options Optional overrides { now, config }
 * @returns {Object} Canonical SLA status object
 */
export function calculateAssessmentSla(doc = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const nowTime = now.getTime();
  const config = { ...DEFAULT_SLA_CONFIG, ...options.config };

  const durationDays = resolveSlaDurationDays(doc, config);
  const startAt = resolveSlaStartAt(doc);
  const deadline = computeSlaDeadline(doc, startAt, durationDays);
  const deadlineTime = new Date(deadline).getTime();

  const completedAt = resolveCompletionTimestamp(doc);
  const isCompleted = Boolean(completedAt);

  let status = SLA_STATUS.ON_TRACK;
  let remainingSeconds = 0;
  let overdueSeconds = 0;
  let remainingFormatted = '';
  let overdueFormatted = '';

  if (isCompleted) {
    const completedTime = new Date(completedAt).getTime();
    const diff = deadlineTime - completedTime; // positive = early/on-time, negative = late

    if (diff >= 0) {
      status = SLA_STATUS.COMPLETED_ON_TIME;
      remainingSeconds = Math.floor(diff / 1000);
      remainingFormatted = `Completed on time (${formatDurationSeconds(remainingSeconds)} ahead)`;
      overdueSeconds = 0;
      overdueFormatted = 'None';
    } else {
      status = SLA_STATUS.COMPLETED_LATE;
      overdueSeconds = Math.floor(Math.abs(diff) / 1000);
      overdueFormatted = `Completed late by ${formatDurationSeconds(overdueSeconds)}`;
      remainingSeconds = 0;
      remainingFormatted = '0 mins';
    }
  } else {
    // Active Assessment (In Progress)
    const diff = deadlineTime - nowTime;

    if (diff < 0) {
      status = SLA_STATUS.OVERDUE;
      overdueSeconds = Math.floor(Math.abs(diff) / 1000);
      overdueFormatted = `Overdue by ${formatDurationSeconds(overdueSeconds)}`;
      remainingSeconds = 0;
      remainingFormatted = '0 mins (Overdue)';
    } else {
      remainingSeconds = Math.floor(diff / 1000);
      const remainingHours = diff / (3600 * 1000);

      if (remainingHours <= config.dueSoonThresholdHours) {
        status = SLA_STATUS.DUE_SOON;
      } else {
        status = SLA_STATUS.ON_TRACK;
      }

      remainingFormatted = `${formatDurationSeconds(remainingSeconds)} remaining`;
      overdueSeconds = 0;
      overdueFormatted = 'None';
    }
  }

  const meta = SLA_METADATA[status] || SLA_METADATA[SLA_STATUS.ON_TRACK];

  return {
    startAt,
    deadline,
    durationDays,
    completedAt,
    isCompleted,
    status,
    label: meta.label,
    badgeClass: meta.badgeClass,
    color: meta.color,
    bgColor: meta.bgColor,
    borderColor: meta.borderColor,
    icon: meta.icon,
    remainingSeconds,
    remainingFormatted,
    overdueSeconds,
    overdueFormatted,
    dueSoonThresholdHours: config.dueSoonThresholdHours
  };
}

/**
 * Attach authoritative SLA object to an evaluation record.
 */
export function attachSlaToRecord(record, options = {}) {
  if (!record || typeof record !== 'object') return record;
  const sla = calculateAssessmentSla(record, options);
  return {
    ...record,
    sla
  };
}
/**
 * Calculate aggregate SLA metrics summary across an array of evaluations.
 */
export function computeSlaAggregateSummary(records = [], options = {}) {
  const summary = {
    totalEvaluations: records.length,
    totalActive: 0,
    onTrack: 0,
    dueSoon: 0,
    overdue: 0,
    completedOnTime: 0,
    completedLate: 0,
    totalCompleted: 0,
    complianceRate: '0%'
  };

  records.forEach(r => {
    // Skip soft-deleted records in active counts unless requested
    if (r.deletedAt && !options.includeDeleted) return;

    const sla = r.sla || calculateAssessmentSla(r, options);

    if (sla.isCompleted) {
      summary.totalCompleted += 1;
      if (sla.status === SLA_STATUS.COMPLETED_ON_TIME) {
        summary.completedOnTime += 1;
      } else {
        summary.completedLate += 1;
      }
    } else {
      summary.totalActive += 1;
      if (sla.status === SLA_STATUS.OVERDUE) {
        summary.overdue += 1;
      } else if (sla.status === SLA_STATUS.DUE_SOON) {
        summary.dueSoon += 1;
      } else {
        summary.onTrack += 1;
      }
    }
  });

  if (summary.totalCompleted > 0) {
    const rate = (summary.completedOnTime / summary.totalCompleted) * 100;
    summary.complianceRate = `${rate.toFixed(1)}%`;
  }

  return summary;
}

export default {
  DEFAULT_SLA_CONFIG,
  SLA_STATUS,
  SLA_METADATA,
  resolveSlaDurationDays,
  resolveSlaStartAt,
  computeSlaDeadline,
  resolveCompletionTimestamp,
  formatDurationSeconds,
  calculateAssessmentSla,
  attachSlaToRecord,
  computeSlaAggregateSummary
};
