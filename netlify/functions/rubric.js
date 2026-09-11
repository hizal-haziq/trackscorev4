/**
 * TrackScore Authoritative Scoring Rubric (v2.0) - TrackScore Version 1.1 (May 2025)
 * Single source of truth for Section A (24 items) and Section B (9 items).
 * Implements Raw Point Sectional Scaling:
 * - Section A Max: 3.50 points
 * - Section B Max: 1.50 points
 * - Total Score Max: 5.00 points
 */

const RUBRIC_VERSION = "2.0";

const SECTION_A_CRITERIA = [
  {
    id: "trip_history",
    name: "Trip History Data",
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
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 }
    ]
  },
  {
    id: "map_source",
    name: "Map",
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
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Radius", points: 1.0 },
      { label: "Polygon", points: 0.25 }
    ]
  },
  {
    id: "geofence_alert",
    name: "Geofence Alert",
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
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Parked/Driving/Idling", points: 1.0 }
    ]
  },
  {
    id: "engine_status",
    name: "Engine ON/OFF Detection",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Report available", points: 0.25 }
    ]
  },
  {
    id: "overspeed_detection",
    name: "Overspeed Detection",
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
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "4G", points: 1.0 }
    ]
  },
  {
    id: "multilingual",
    name: "Device Multilingual Support",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "English", points: 1.0 },
      { label: "Other language", points: 0.25 }
    ]
  },
  {
    id: "user_manual",
    name: "User Manual",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "English", points: 1.0 },
      { label: "Other language", points: 0.25 }
    ]
  },
  {
    id: "warranty",
    name: "Warranty Period",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Min 12 months/subscription", points: 1.0 },
      { label: ">12 months", points: 0.25 }
    ]
  },
  {
    id: "customer_service",
    name: "Customer Service",
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
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Coordinates/local time/speed", points: 1.0 },
      { label: "Driving+rest duration", points: 0.25 }
    ]
  },
  {
    id: "data_interval",
    name: "Data Transmission Interval",
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
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Notification", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  }
];

const SECTION_B_CRITERIA = [
  {
    id: "tow_detection",
    name: "Tow Detection",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 }
    ]
  },
  {
    id: "panic_button",
    name: "Panic/Emergency Button",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 },
      { label: "SMS/WhatsApp", points: 0.25 }
    ]
  },
  {
    id: "mfa",
    name: "Apps Multifactor Authentication/Security",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "OTP + Security PIN", points: 1.0 }
    ]
  },
  {
    id: "sop_tech_problems",
    name: "SOP on Technical Problem",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Solved in 3 business days", points: 1.0 }
    ]
  },
  {
    id: "service_records",
    name: "Device Service Records",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Installation/Renewal/Diagnosis/Warranty Records", points: 1.0 }
    ]
  },
  {
    id: "driver_id",
    name: "Driver Identification",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Tracking device with driver ID", points: 1.0 },
      { label: "Report per driver", points: 0.25 }
    ]
  },
  {
    id: "certification",
    name: "Certification",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "SIRIM & CE", points: 1.0 }
    ]
  },
  {
    id: "immobilizer",
    name: "Immobilizer",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "Available", points: 1.0 }
    ]
  },
  {
    id: "tampered_alert",
    name: "Tampered Alert",
    options: [
      { label: "None (0)", points: 0.0 },
      { label: "System alert", points: 1.0 },
      { label: "Notification", points: 0.25 },
      { label: "Push", points: 0.5 }
    ]
  }
];

// Maximum score limits per Section (Strict 5.00 Total Scale)
const MAX_SCORE_A = 3.50;
const MAX_SCORE_B = 1.50;
const MAX_TOTAL_SCORE = 5.00;

// Compute maximum possible raw points for a single criterion (sum of all positive tiers)
function computeCriterionMaxRawPoints(criterion) {
  if (!criterion || !Array.isArray(criterion.options)) return 0;
  let max = 0;
  for (let i = 1; i < criterion.options.length; i++) {
    max += Number(criterion.options[i].points) || 0;
  }
  return max;
}

// Compute section max raw points
function computeSectionMaxRaw(criteriaList) {
  return criteriaList.reduce((sum, item) => sum + computeCriterionMaxRawPoints(item), 0);
}

const MAX_RAW_SCORE_A = computeSectionMaxRaw(SECTION_A_CRITERIA); // 36.75
const MAX_RAW_SCORE_B = computeSectionMaxRaw(SECTION_B_CRITERIA); // 10.25
const MAX_RAW_TOTAL = MAX_RAW_SCORE_A + MAX_RAW_SCORE_B;         // 47.00

// Helper to calculate earned raw points for an option index
function computeItemRawPoints(criterion, optionIndex) {
  if (!criterion || !Array.isArray(criterion.options) || optionIndex <= 0) return 0;
  let earned = 0;
  for (let i = 1; i <= Math.min(optionIndex, criterion.options.length - 1); i++) {
    earned += Number(criterion.options[i].points) || 0;
  }
  return earned;
}

// Legacy helper for compatibility
function computeSectionMax(criteriaList) {
  if (criteriaList === SECTION_A_CRITERIA || criteriaList?.length === 24) return MAX_SCORE_A;
  if (criteriaList === SECTION_B_CRITERIA || criteriaList?.length === 9) return MAX_SCORE_B;
  return MAX_TOTAL_SCORE;
}

// Fast lookup map by ID
const CRITERIA_MAP = {};
SECTION_A_CRITERIA.forEach(c => { CRITERIA_MAP[c.id] = { ...c, section: 'A' }; });
SECTION_B_CRITERIA.forEach(c => { CRITERIA_MAP[c.id] = { ...c, section: 'B' }; });

// Label normalization helper
function normalizeLabel(str) {
  return String(str || "").trim().toLowerCase();
}

// Common label alias mappings to ensure cross-version compatibility with v1.0 data
const OPTION_ALIASES = {
  // Trip History
  "<=3 months": "3mo",
  "3m": "3mo",
  "<=3m": "3mo",
  "<3m": "3mo",
  ">3m-1y": ">3mo-1yr",
  ">3m-1yr": ">3mo-1yr",
  ">1 year": ">1yr",
  ">1y": ">1yr",

  // Map
  "closed": "closed source",
  "internal": "closed source",
  "closed source": "closed source",
  "open": "open source",
  "open source": "open source",
  "open updated": "open source + latest update",
  "open source + latest update": "open source + latest update",

  // Geofence & Alerts
  "system": "system alert",
  "system log": "system alert",
  "sms/call": "sms/whatsapp/call",
  "sms": "notification",

  // Overspeed & Sensors
  "report": "report available",
  "report available": "report available",
  "config": "configurable",
  "configurable": "configurable",

  // Memory & Battery
  "15m": "last 15 mins",
  "<15m": "last 15 mins",
  "last 15 mins": "last 15 mins",
  "15-60m": ">15-60 mins",
  ">15-60m": ">15-60 mins",
  ">60m": ">60 mins",
  "1h": "1 hour",
  "<1h": "1 hour",
  "1 hour": "1 hour",
  "1-24h": ">1-24 hours",
  ">1-24h": ">1-24 hours",
  ">24h": ">24 hours",

  // Connectivity & Network
  "single 4g": "2g",
  "4g fallback": "4g fallback to 2g",

  // Multilingual & Manual
  "other": "other language",

  // Warranty
  "12m": "min 12 months/subscription",
  "min 12 months": "min 12 months/subscription",
  ">12m": ">12 months",

  // Customer Service
  "09-19": "mon-sun 0900-1900 local",
  "control centre": "physical control centre",

  // OS
  "mobile": "mobile view",

  // Trip Report
  "coords": "coordinates/local time/speed",
  "duration": "driving+rest duration",

  // Data Interval
  "1m": "1 min",
  "30s-1m": "30sec-<1min",
  "<30s": "<30sec",

  // Section B items
  "3 days": "solved in 3 business days",
  "sirim/ce": "sirim & ce",
  "otp": "otp + security pin",
  "gps id": "tracking device with driver id"
};

/**
 * Recompute and validate scores server-side against authoritative rubric
 * Implements Raw Point Sectional Scaling Formula:
 * Section A = (Earned Raw Points A / Max Raw Points A) * 3.50
 * Section B = (Earned Raw Points B / Max Raw Points B) * 1.50
 * Total = Section A + Section B (Strict Max 5.00)
 */
function recomputeScores(breakdown) {
  let rawEarnedA = 0.0;
  let rawEarnedB = 0.0;
  const verifiedBreakdown = [];

  if (Array.isArray(breakdown)) {
    breakdown.forEach(item => {
      if (!item || !item.id) return;
      const crit = CRITERIA_MAP[item.id];
      if (!crit) return;

      const normSelected = normalizeLabel(item.selectedOption);
      const aliasTarget = OPTION_ALIASES[normSelected] || normSelected;

      // 1. Direct label match (exact or case-insensitive)
      let matchedOptIdx = crit.options.findIndex(
        o => o.label === item.selectedOption || normalizeLabel(o.label) === normSelected
      );

      // 2. Alias match
      if (matchedOptIdx < 0 && aliasTarget) {
        matchedOptIdx = crit.options.findIndex(
          o => normalizeLabel(o.label) === aliasTarget ||
               OPTION_ALIASES[normalizeLabel(o.label)] === aliasTarget
        );
      }

      // 3. Fallback: match by cumulative points if provided
      if (matchedOptIdx < 0 && typeof item.points === "number" && !isNaN(item.points) && item.points > 0) {
        let cumPoints = 0;
        for (let i = 1; i < crit.options.length; i++) {
          cumPoints += Number(crit.options[i].points) || 0;
          if (Math.abs(cumPoints - item.points) < 0.01 || Math.abs(crit.options[i].points - item.points) < 0.01) {
            matchedOptIdx = i;
            break;
          }
        }
      }

      // 4. Default fallback to first option (None 0.0)
      if (matchedOptIdx < 0) {
        matchedOptIdx = 0;
      }

      const matchedOpt = crit.options[matchedOptIdx];
      const earnedRaw = computeItemRawPoints(crit, matchedOptIdx);

      if (crit.section === 'A') {
        rawEarnedA += earnedRaw;
      } else if (crit.section === 'B') {
        rawEarnedB += earnedRaw;
      }

      verifiedBreakdown.push({
        section: crit.section,
        id: crit.id,
        name: crit.name,
        selectedOption: matchedOpt.label,
        tierPoints: Number(matchedOpt.points) || 0.0,
        points: earnedRaw
      });
    });
  }

  // Raw Point Sectional Scaling Formula
  const scoreA = MAX_RAW_SCORE_A > 0 ? (rawEarnedA / MAX_RAW_SCORE_A) * MAX_SCORE_A : 0.0;
  const scoreB = MAX_RAW_SCORE_B > 0 ? (rawEarnedB / MAX_RAW_SCORE_B) * MAX_SCORE_B : 0.0;

  const finalScoreA = parseFloat(Math.min(scoreA, MAX_SCORE_A).toFixed(2));
  const finalScoreB = parseFloat(Math.min(scoreB, MAX_SCORE_B).toFixed(2));
  const finalTotal = parseFloat(Math.min(finalScoreA + finalScoreB, MAX_TOTAL_SCORE).toFixed(2));

  // Star Rating Conversion Rules on 5.0 scale:
  // 4.50 - 5.00: 5 Stars (Grade A)
  // 3.75 - 4.49: 4 Stars (Grade B)
  // 3.00 - 3.74: 3 Stars (Grade C)
  // 2.00 - 2.99: 2 Stars (Grade D)
  // 1.25 - 1.99: 1 Star  (Grade E)
  // Below 1.25:  0 Stars (Not Rated)
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
  } else {
    starsCount = 0;
    ratingLabel = "0 Stars - Not Rated (MIROS Non-Compliant)";
  }

  return {
    sectionAScore: finalScoreA,
    sectionBScore: finalScoreB,
    totalScore: finalTotal,
    starRating: finalTotal,
    starsCount,
    ratingLabel,
    breakdown: verifiedBreakdown,
    rubricVersion: RUBRIC_VERSION,
    maxScoreA: MAX_SCORE_A,
    maxScoreB: MAX_SCORE_B,
    maxTotalScore: MAX_TOTAL_SCORE,
    rawEarnedA: parseFloat(rawEarnedA.toFixed(2)),
    rawEarnedB: parseFloat(rawEarnedB.toFixed(2)),
    maxRawA: MAX_RAW_SCORE_A,
    maxRawB: MAX_RAW_SCORE_B
  };
}

export {
  RUBRIC_VERSION,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  computeSectionMax,
  computeCriterionMaxRawPoints,
  computeSectionMaxRaw,
  computeItemRawPoints,
  MAX_SCORE_A,
  MAX_SCORE_B,
  MAX_TOTAL_SCORE,
  MAX_RAW_SCORE_A,
  MAX_RAW_SCORE_B,
  MAX_RAW_TOTAL,
  recomputeScores
};

export default {
  RUBRIC_VERSION,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  computeSectionMax,
  computeCriterionMaxRawPoints,
  computeSectionMaxRaw,
  computeItemRawPoints,
  MAX_SCORE_A,
  MAX_SCORE_B,
  MAX_TOTAL_SCORE,
  MAX_RAW_SCORE_A,
  MAX_RAW_SCORE_B,
  MAX_RAW_TOTAL,
  recomputeScores
};
