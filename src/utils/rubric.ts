/**
 * TrackScore Authoritative Scoring Rubric (v2.0) - TypeScript definitions for React client
 * Matches netlify/functions/rubric.js single source of truth for:
 * - Section A (24 items, Max 3.50 points scaled)
 * - Section B (9 items, Max 1.50 points scaled)
 * - Total Score Max: 5.00 points
 */

export const RUBRIC_VERSION = "2.0";

export interface CriterionOption {
  label: string;
  points: number;
}

export interface CriterionDefinition {
  id: string;
  name: string;
  section: 'A' | 'B';
  options: CriterionOption[];
}

export const SECTION_A_CRITERIA: CriterionDefinition[] = [
  {
    id: "trip_history",
    name: "Trip History Data",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "3mo", points: 1.0 },
      { label: ">3mo-1yr", points: 0.25 },
      { label: ">1yr", points: 0.5 }
    ]
  },
  {
    id: "realtime_tracking",
    name: "Real-time Tracking",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 }
    ]
  },
  {
    id: "map_source",
    name: "Map",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Closed source", points: 1.0 },
      { label: "Open source", points: 0.25 },
      { label: "Open source + latest update", points: 0.5 }
    ]
  },
  {
    id: "geofence",
    name: "Geofence",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Radius", points: 1.0 },
      { label: "Polygon", points: 0.25 }
    ]
  },
  {
    id: "geofence_alert",
    name: "Geofence Alert",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "SMS/WhatsApp/Call", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  },
  {
    id: "vehicle_status",
    name: "Vehicle Status",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Parked/Driving/Idling", points: 1.0 }
    ]
  },
  {
    id: "engine_status",
    name: "Engine ON/OFF Detection",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Report available", points: 0.25 }
    ]
  },
  {
    id: "overspeed_detection",
    name: "Overspeed Detection",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 },
      { label: "Report available", points: 0.25 },
      { label: "Configurable", points: 0.5 }
    ]
  },
  {
    id: "overspeed_alert",
    name: "Overspeed Alert",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Notification", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  },
  {
    id: "offline_memory",
    name: "Built-in/Offline Memory",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Last 15 mins", points: 1.0 },
      { label: ">15-60 mins", points: 0.25 },
      { label: ">60 mins", points: 0.5 }
    ]
  },
  {
    id: "backup_battery",
    name: "Backup Battery",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "1 hour", points: 1.0 },
      { label: ">1-24 hours", points: 0.25 },
      { label: ">24 hours", points: 0.5 }
    ]
  },
  {
    id: "sim_network",
    name: "SIM Card Network",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "2G", points: 1.0 },
      { label: "4G fallback to 2G", points: 0.25 },
      { label: "Roaming", points: 0.5 }
    ]
  },
  {
    id: "connectivity",
    name: "Device Connectivity Support",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "4G", points: 1.0 }
    ]
  },
  {
    id: "multilingual",
    name: "Device Multilingual Support",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "English", points: 1.0 },
      { label: "Other language", points: 0.25 }
    ]
  },
  {
    id: "user_manual",
    name: "User Manual",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "English", points: 1.0 },
      { label: "Other language", points: 0.25 }
    ]
  },
  {
    id: "warranty",
    name: "Warranty Period",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Min 12 months/subscription", points: 1.0 },
      { label: ">12 months", points: 0.25 }
    ]
  },
  {
    id: "customer_service",
    name: "Customer Service",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Mon-Sun 0900-1900 local", points: 1.0 },
      { label: "24/7", points: 0.25 },
      { label: "Physical Control Centre", points: 0.5 }
    ]
  },
  {
    id: "os_compatibility",
    name: "OS Compatibility",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Web", points: 1.0 },
      { label: "Apps", points: 0.25 },
      { label: "Mobile View", points: 0.5 }
    ]
  },
  {
    id: "trip_report",
    name: "Trip Report",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Coordinates/local time/speed", points: 1.0 },
      { label: "Driving+rest duration", points: 0.25 }
    ]
  },
  {
    id: "data_interval",
    name: "Data Transmission Interval",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "1 min", points: 1.0 },
      { label: "30sec-<1min", points: 0.25 },
      { label: "<30sec", points: 0.5 }
    ]
  },
  {
    id: "harsh_accel",
    name: "Harsh Acceleration",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 },
      { label: "Report available", points: 0.25 },
      { label: "Configurable", points: 0.5 }
    ]
  },
  {
    id: "harsh_accel_alert",
    name: "Harsh Acceleration Alert",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Notification", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  },
  {
    id: "harsh_braking",
    name: "Harsh Braking/Crash Detection",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 },
      { label: "Report available", points: 0.25 },
      { label: "Configurable", points: 0.5 }
    ]
  },
  {
    id: "harsh_braking_alert",
    name: "Harsh Braking/Crash Detection Alert",
    section: 'A',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Notification", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  }
];

export const SECTION_B_CRITERIA: CriterionDefinition[] = [
  {
    id: "tow_detection",
    name: "Tow Detection",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 }
    ]
  },
  {
    id: "panic_button",
    name: "Panic/Emergency Button",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 },
      { label: "SMS/WhatsApp", points: 0.25 }
    ]
  },
  {
    id: "mfa",
    name: "Apps Multifactor Authentication/Security",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "OTP + Security PIN", points: 1.0 }
    ]
  },
  {
    id: "sop_tech_problems",
    name: "SOP on Technical Problem",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Solved in 3 business days", points: 1.0 }
    ]
  },
  {
    id: "service_records",
    name: "Device Service Records",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Installation/Renewal/Diagnosis/Warranty Records", points: 1.0 }
    ]
  },
  {
    id: "driver_id",
    name: "Driver Identification",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Tracking device with driver ID", points: 1.0 },
      { label: "Report per driver", points: 0.25 }
    ]
  },
  {
    id: "certification",
    name: "Certification",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "SIRIM & CE", points: 1.0 }
    ]
  },
  {
    id: "immobilizer",
    name: "Immobilizer",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 }
    ]
  },
  {
    id: "tampered_alert",
    name: "Tampered Alert",
    section: 'B',
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Notification", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  }
];

export const ALL_CRITERIA: CriterionDefinition[] = [
  ...SECTION_A_CRITERIA,
  ...SECTION_B_CRITERIA
];

export const MAX_SCORE_A = 3.50;
export const MAX_SCORE_B = 1.50;
export const MAX_TOTAL_SCORE = 5.00;

export function computeCriterionMaxRawPoints(criterion: CriterionDefinition): number {
  let max = 0;
  for (let i = 1; i < criterion.options.length; i++) {
    const opt = criterion.options[i];
    if (opt) max += opt.points || 0;
  }
  return max;
}

export function computeSectionMaxRaw(criteriaList: CriterionDefinition[]): number {
  return criteriaList.reduce((sum, item) => sum + computeCriterionMaxRawPoints(item), 0);
}

export const MAX_RAW_SCORE_A = computeSectionMaxRaw(SECTION_A_CRITERIA); // 36.75
export const MAX_RAW_SCORE_B = computeSectionMaxRaw(SECTION_B_CRITERIA); // 10.25
export const MAX_RAW_TOTAL = MAX_RAW_SCORE_A + MAX_RAW_SCORE_B;         // 47.00

export function computeItemRawPoints(criterion: CriterionDefinition, optionIndex: number): number {
  if (optionIndex <= 0) return 0;
  let earned = 0;
  for (let i = 1; i <= Math.min(optionIndex, criterion.options.length - 1); i++) {
    const opt = criterion.options[i];
    if (opt) earned += opt.points || 0;
  }
  return earned;
}

export interface BreakdownInput {
  id: string;
  selectedOption: string;
  points?: number;
  comment?: string;
}

export interface RecomputedScores {
  sectionAScore: number;
  sectionBScore: number;
  totalScore: number;
  starRating: number;
  starsCount: number;
  ratingLabel: string;
  breakdown: Array<{
    section: 'A' | 'B';
    id: string;
    name: string;
    selectedOption: string;
    tierPoints: number;
    comment: string;
  }>;
}

export function calculateScorePreview(breakdown: BreakdownInput[]): RecomputedScores {
  let rawEarnedA = 0.0;
  let rawEarnedB = 0.0;
  const verifiedBreakdown: RecomputedScores['breakdown'] = [];

  const map = new Map<string, CriterionDefinition>();
  for (const c of ALL_CRITERIA) map.set(c.id, c);

  for (const item of breakdown) {
    const crit = map.get(item.id);
    if (!crit) continue;

    const optIdx = crit.options.findIndex(o => o.label === item.selectedOption);
    const validIdx = optIdx >= 0 ? optIdx : 0;
    const opt = crit.options[validIdx] ?? { label: 'None (0)', points: 0 };
    const earnedRaw = computeItemRawPoints(crit, validIdx);

    if (crit.section === 'A') rawEarnedA += earnedRaw;
    else rawEarnedB += earnedRaw;

    verifiedBreakdown.push({
      section: crit.section,
      id: crit.id,
      name: crit.name,
      selectedOption: opt.label,
      tierPoints: opt.points,
      comment: typeof item.comment === 'string' ? item.comment.trim() : ''
    });
  }

  const scoreA = MAX_RAW_SCORE_A > 0 ? (rawEarnedA / MAX_RAW_SCORE_A) * MAX_SCORE_A : 0.0;
  const scoreB = MAX_RAW_SCORE_B > 0 ? (rawEarnedB / MAX_RAW_SCORE_B) * MAX_SCORE_B : 0.0;

  const finalScoreA = parseFloat(Math.min(scoreA, MAX_SCORE_A).toFixed(2));
  const finalScoreB = parseFloat(Math.min(scoreB, MAX_SCORE_B).toFixed(2));
  const finalTotal = parseFloat(Math.min(finalScoreA + finalScoreB, MAX_TOTAL_SCORE).toFixed(2));

  let starsCount = 0;
  let ratingLabel = "0 Stars - Not Rated (MIROS Non-Compliant)";

  if (finalTotal >= 4.50) {
    starsCount = 5;
    ratingLabel = "5 Stars - Outstanding (MIROS Certified Grade A)";
  } else if (finalTotal >= 3.75) {
    starsCount = 4;
    ratingLabel = "4 Stars - Very Good (MIROS Grade B)";
  } else if (finalTotal >= 3.00) {
    starsCount = 3;
    ratingLabel = "3 Stars - Satisfactory (MIROS Grade C)";
  } else if (finalTotal >= 2.00) {
    starsCount = 2;
    ratingLabel = "2 Stars - Marginal (MIROS Grade D)";
  } else if (finalTotal >= 1.25) {
    starsCount = 1;
    ratingLabel = "1 Star - Substandard (MIROS Grade E)";
  }

  return {
    sectionAScore: finalScoreA,
    sectionBScore: finalScoreB,
    totalScore: finalTotal,
    starRating: finalTotal,
    starsCount,
    ratingLabel,
    breakdown: verifiedBreakdown
  };
}

