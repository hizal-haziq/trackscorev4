/**
 * TrackScore - Digital Assessor Evaluation System
 * Frontend Logic, Real-Time Scoring Matrix, and PDF Report Generator
 */

// ==========================================================================
// 1. Scoring Matrix Data Structures
// ==========================================================================

// Official MIROS Criteria Descriptions (Version 1.1, May 2025)
// Sourced directly from MIROS TrackScore Features & Scoring Distribution
// Exact wording maintained without paraphrasing or truncation
const CRITERIA_OFFICIAL_DESCRIPTIONS = {
  // Section A — Basic Features
  trip_history: "A record or log of the historical data related to the movement and location of a vehicle. It can be used to review past routes, monitor driving habits, optimize travel routes, and provide a historical record for various analytical and management purposes.",
  realtime_tracking: "Continuous and instantaneous (real-time) monitoring of the current location and movement of an object or person equipped with a tracking device/global navigation satellite system (GNSS). This valuable feature enables users to monitor the precise locations of assets, vehicles, or individuals instantaneously.",
  map_source: "Various choices and features available for displaying and interacting with geographical maps through a GNSS device or application. It encompasses the tools and settings that allow users to customize how maps are presented, navigate, and obtain information about specific locations.",
  geofence: "A virtual boundary or perimeter that is defined around a specific geographical area. The purpose of a geofence is to trigger certain actions or notifications when a GPS-enabled device or asset enters or exits the predefined area.",
  geofence_alert: "A virtual boundary or perimeter that is defined around a specific geographical area. The purpose of a geofence is to trigger certain actions or notifications when a GPS-enabled device or asset enters or exits the predefined area.",
  vehicle_status: "Information about the current condition and state of a vehicle. The vehicle status data can include a range of parameters and details that provide insights into the health, performance, and operational aspects of the vehicle.",
  engine_status: "Capability of a tracking system to detect and report whether the engine of a vehicle is currently running (ON) or turned off (OFF).",
  overspeed_detection: "Capability of a tracking system to monitor and identify instances where a vehicle exceeds a predefined speed limit.",
  overspeed_alert: "Capability of a tracking system to monitor and identify instances where a vehicle exceeds a predefined speed limit.",
  offline_memory: "Storage capacity that is integrated directly into the tracking device or receiver. This built-in memory allows the device to store and retain certain types of data that allows it to store and use map data, waypoints, and other information without requiring a continuous internet connection. This feature is particularly useful in situations where there is limited or no access to the internet, such as in remote areas or locations with poor connectivity.",
  backup_battery: "A backup battery ensures the system operates during main power failures or off vehicle engines maintaining continuous tracking, data logging, and navigation. This secondary power source enhances vehicle management, security, and operational efficiency by preventing GPS interruptions.",
  sim_network: "Ability of a tracking device or system to establish and maintain communication with other devices, networks, or servers. The ability to establish and maintain reliable connectivity is critical for the effective functioning of tracking devices in various contexts, from personal navigation to fleet management and asset tracking.",
  connectivity: "Ability of a tracking device or system to establish and maintain communication with other devices, networks, or servers. The ability to establish and maintain reliable connectivity is critical for the effective functioning of tracking devices in various contexts, from personal navigation to fleet management and asset tracking.",
  multilingual: "Ability of tracking applications or software to operate and display information in multiple languages. This feature is designed to enhance user accessibility and accommodate individuals who speak different languages or prefer using tracking applications in their native language.",
  user_manual: "A document or guide provided by the manufacturer or developer of a tracking device or application which serves as a comprehensive reference for users, offering detailed information about the features, functions, settings, and proper usage of the tracking product.",
  warranty: "Duration during which the manufacturer or seller guarantees the product against defects in materials or workmanship of the tracking device and system.",
  customer_service: "Support and assistance provided by the manufacturer, seller, or service provider to users of tracking devices.",
  os_compatibility: "Ability of a tracking device or application to work seamlessly with specific operating systems (OS) on various devices. The compatibility ensures that the tracking system can be installed, run, and perform optimally on devices running a particular operating system.",
  trip_report: "A document or file, typically in PDF and CSV format, generated by a tracking system that summarizes and presents detailed information about a specific trip taken by a vehicle or asset equipped with a tracking device.",
  data_interval: "The data transmission interval in GPS refers to the time interval at which GPS data (such as location, speed, and time) is updated and sent from the GPS device to the receiver.",
  harsh_accel: "Capability of a tracking system to monitor and identify instances of harsh acceleration, typically recorded when the rate of change in speed exceeds predefined thresholds set by the monitoring system.",
  harsh_accel_alert: "Capability of a tracking system to monitor and identify instances of harsh acceleration, typically recorded when the rate of change in speed exceeds predefined thresholds set by the monitoring system.",
  harsh_braking: "Capability of a tracking system to monitor and identify instances where the rate of change in speed exceeds predefined thresholds set by the monitoring system, indicating harsh braking or a potential crash event.",
  harsh_braking_alert: "Capability of a tracking system to monitor and identify instances where the rate of change in speed exceeds predefined thresholds set by the monitoring system, indicating harsh braking or a potential crash event.",

  // Section B — Additional Features
  tow_detection: "A feature in tracking systems or devices that is designed to identify instances when a vehicle is being towed or transported by another vehicle. This feature helps in detecting unauthorized movement or towing of a vehicle, providing alerts or notifications to the vehicle owner, fleet manager, or relevant authorities.",
  panic_button: "A feature commonly found in tracking devices, especially those used in personal safety and security applications. The panic button is a physical or virtual button that, when pressed, triggers an immediate and often high-priority alert or notification with a primary purpose to quickly summon assistance or notify predefined contacts in emergency situations.",
  mfa: "An implementation of multifactor authentication (MFA) within the associated mobile or web applications that are part of a tracking system. Multifactor authentication is a security measure that requires users to provide multiple forms of identification before accessing the tracking application, enhancing the overall security of the system.",
  sop_tech_problems: "SOPs for technical problems offer structured procedures, reducing downtime and errors. They clarify responsibilities, streamline troubleshooting, and improve communication and documentation. Consistent use fosters efficiency, reliability, and ongoing enhancement of technical operations within organizations.",
  service_records: "A documentation or log that records the maintenance and service history of a tracking device, system, or associated components. Service records provide a detailed account of maintenance activities, repairs, updates, and any other service-related actions performed on the tracking equipment throughout its operational life.",
  driver_id: "Monitoring and analysis of how a vehicle operator behaves while driving. Tracking systems often include features and sensors that can capture data related to the behavior of drivers. Analyzing driver behavior can provide valuable insights into safety, efficiency, and compliance with established guidelines.",
  certification: "The process through which a tracking product is officially recognized and confirmed to meet specific standards, specifications, or requirements set by relevant authorities, organizations, or industry bodies. The certification process ensures that the tracking product complies with established criteria, including technical specifications, safety standards, and regulatory requirements.",
  immobilizer: "A security feature commonly used in vehicle tracking and anti-theft systems. An immobilizer is a device or mechanism designed to prevent the engine of a vehicle from starting unless the correct authorization or authentication is provided.",
  tampered_alert: "Tampered alerts in GPS systems are crucial for security and asset protection. They promptly notify of any unauthorized interference or tampering with the device or vehicle, enabling swift action to prevent theft, ensure safety, and maintain operational integrity."
};

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

// ==========================================================================
// Authoritative Rubric Version & Dynamic Weight Computation (v2.0)
// Section A max = 3.50, Section B max = 1.50, Total Max = 5.00
// Implements Raw Point Sectional Scaling
// ==========================================================================
const RUBRIC_VERSION = "2.0";

const MAX_SCORE_A = 3.50;
const MAX_SCORE_B = 1.50;
const MAX_TOTAL_SCORE = 5.00;

function computeCriterionMaxRawPoints(criterion) {
  if (!criterion || !Array.isArray(criterion.options)) return 0;
  let max = 0;
  for (let i = 1; i < criterion.options.length; i++) {
    max += Number(criterion.options[i].points) || 0;
  }
  return max;
}

function computeSectionMaxRaw(criteriaList) {
  return criteriaList.reduce((sum, item) => sum + computeCriterionMaxRawPoints(item), 0);
}

const MAX_RAW_SCORE_A = computeSectionMaxRaw(SECTION_A_CRITERIA); // 36.75
const MAX_RAW_SCORE_B = computeSectionMaxRaw(SECTION_B_CRITERIA); // 10.25
const MAX_RAW_TOTAL = MAX_RAW_SCORE_A + MAX_RAW_SCORE_B;         // 47.00

function computeItemRawPoints(criterion, optionIndex) {
  if (!criterion || !Array.isArray(criterion.options) || optionIndex <= 0) return 0;
  let earned = 0;
  for (let i = 1; i <= Math.min(optionIndex, criterion.options.length - 1); i++) {
    earned += Number(criterion.options[i].points) || 0;
  }
  return earned;
}

function computeSectionMax(criteriaList) {
  if (criteriaList === SECTION_A_CRITERIA || criteriaList?.length === 24) return MAX_SCORE_A;
  if (criteriaList === SECTION_B_CRITERIA || criteriaList?.length === 9) return MAX_SCORE_B;
  return MAX_TOTAL_SCORE;
}

// Authentication & Session Helpers (JWT Bearer Auth)
function getAuthToken() {
  return localStorage.getItem('trackscore_token') || '';
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function handleAuthError(response) {
  if (response && (response.status === 401 || response.status === 403)) {
    console.warn("Authentication failed or session expired.");
    localStorage.removeItem('trackscore_token');
    localStorage.removeItem('trackscore_user_role');
    localStorage.removeItem('trackscore_user');
    window.location.href = '/login.html?reason=expired';
    return true;
  }
  return false;
}

function handleLogout() {
  localStorage.removeItem('trackscore_token');
  localStorage.removeItem('trackscore_user_role');
  localStorage.removeItem('trackscore_user');
  window.location.href = '/login.html';
}
window.handleLogout = handleLogout;

// Enforce authentication for evaluation page
(function initAuthGuard() {
  const token = localStorage.getItem('trackscore_token');
  const role = localStorage.getItem('trackscore_user_role');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }
  if (role === 'vendor') {
    window.location.href = '/vendor-portal.html';
    return;
  }

  // Check if forced password change is pending
  try {
    const rawUser = localStorage.getItem('trackscore_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    if (user && user.mustChangePassword === true) {
      window.location.href = '/change-password.html';
      return;
    }
  } catch (e) {
    // Ignore JSON parsing errors
  }

  // Render user session badge in header when DOM is ready
  function renderUserHeader() {
    const nav = document.getElementById('main-nav');
    if (!nav || document.getElementById('user-session-badge')) return;
    try {
      const rawUser = localStorage.getItem('trackscore_user');
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (user) {
        // Hide sign in button
        const loginBtn = document.getElementById('nav-login');
        if (loginBtn) loginBtn.style.display = 'none';

        // Manage dashboard link: ONLY shown if user is a manager
        const dashBtn = document.getElementById('nav-dashboard');
        if (dashBtn) {
          dashBtn.style.display = (role === 'manager') ? 'inline-flex' : 'none';
        }

        // Adapt brand badge and subtitle if user is Manager in audit mode
        const brandBadge = document.getElementById('header-brand-badge');
        const brandSubtitle = document.getElementById('header-brand-subtitle');
        if (role === 'manager') {
          if (brandBadge) {
            brandBadge.textContent = 'Manager Audit';
            brandBadge.style.background = '#1E293B';
            brandBadge.style.color = '#38BDF8';
            brandBadge.style.border = '1px solid #334155';
          }
          if (brandSubtitle) {
            brandSubtitle.textContent = 'Auditing Evaluation Rubric';
          }
        }

        // Manager viewing banner
        const managerBanner = document.getElementById('manager-viewing-assessor-banner');
        if (managerBanner) {
          managerBanner.style.display = (role === 'manager') ? 'flex' : 'none';
        }

        const badge = document.createElement('div');
        badge.id = 'user-session-badge';
        badge.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; margin-left: 6px; padding: 4px 10px; background: #1E293B; border: 1px solid #334155; border-radius: 6px; font-size: 12px; color: #E2E8F0; white-space: nowrap !important; flex-shrink: 0;';
        const roleTitle = role === 'manager' ? 'Manager' : 'Assessor';
        const roleColor = role === 'manager' ? '#38BDF8' : '#F58220';
        const displayName = escapeHtml(user.name || user.email || 'User');
        badge.innerHTML = `
          <span style="display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10B981; flex-shrink: 0;"></span>
            <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;" title="${displayName}">${displayName}</span>
            <span style="background: rgba(255,255,255,0.1); color: ${roleColor}; font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; text-transform: uppercase;">${roleTitle}</span>
          </span>
          <button type="button" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #FCA5A5; font-size: 11px; font-weight: 600; cursor: pointer; padding: 2px 7px; border-radius: 4px; white-space: nowrap; line-height: 1.2;" onclick="handleLogout()">Sign Out</button>
        `;
        nav.appendChild(badge);

        // Auto-fill assessor info if empty
        const assessorNameInput = document.getElementById('assessorName');
        if (assessorNameInput && !assessorNameInput.value && user.name) {
          assessorNameInput.value = user.name;
        }
        const assessorIdInput = document.getElementById('assessorId');
        if (assessorIdInput && !assessorIdInput.value && (user.assessorCode || user.assessorId)) {
          assessorIdInput.value = user.assessorCode || user.assessorId;
        }

        // Initialize assessor submissions count badge
        if (typeof window.fetchAssessorSubmissions === 'function') {
          window.fetchAssessorSubmissions(true);
        }
      }
    } catch (e) {
      console.warn("Failed to render user session header:", e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderUserHeader);
  } else {
    setTimeout(renderUserHeader, 50);
  }
})();

// Application State
const assessmentState = {
  activeDraftId: null,
  rubricVersion: RUBRIC_VERSION,
  resubmitRecordId: null,
  answeredCriteria: {}, // Keyed by criterion id: true when an option has been selected
  selectedItems: {}, // Keyed by criterion id: { section, id, name, selectedOption, points }
  metadata: {
    companyName: "",
    deviceModel: "",
    packageName: "",
    assessorName: "",
    assessorId: "",
    assessmentDate: new Date().toISOString().split("T")[0]
  },
  scores: {
    sectionA: 0.0,
    sectionB: 0.0,
    total: 0.0,
    starRating: 0.0,
    starsCount: 0,
    ratingLabel: "0 Stars - Not Rated (MIROS Non-Compliant)"
  }
};

// ==========================================================================
// Criteria Description Tooltips & Popovers Management
// Supports desktop hover and mobile tap-to-toggle with edge-aware positioning
// ==========================================================================

function positionTooltipPopover(popover, wrapper) {
  if (!popover || !wrapper) return;
  // Reset positioning properties to measure natural bounding box
  popover.style.left = "0px";
  popover.style.top = "";
  popover.style.bottom = "calc(100% + 9px)";

  const rect = popover.getBoundingClientRect();

  // Vertical: if clipped at the top of the viewport (rect.top < 10), flip to bottom
  if (rect.top < 10) {
    popover.style.bottom = "auto";
    popover.style.top = "calc(100% + 9px)";
    popover.classList.add("flipped-bottom");
  } else {
    popover.classList.remove("flipped-bottom");
  }

  // Horizontal: ensure it stays within viewport padding (min 12px margins)
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  if (rect.right > windowWidth - 12) {
    const shiftRight = rect.right - (windowWidth - 12);
    popover.style.left = `-${shiftRight}px`;
  } else if (rect.left < 12) {
    const shiftLeft = 12 - rect.left;
    popover.style.left = `${shiftLeft}px`;
  }
}

function closeAllCriterionTooltips() {
  document.querySelectorAll(".criterion-tooltip-wrapper.is-open").forEach(wrap => {
    wrap.classList.remove("is-open");
    const btn = wrap.querySelector(".criterion-info-icon");
    if (btn) btn.setAttribute("aria-expanded", "false");
    const pop = wrap.querySelector(".criterion-tooltip-popover");
    if (pop) pop.setAttribute("aria-hidden", "true");
  });
}

function toggleCriterionTooltip(event, criterionId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const wrapper = document.getElementById(`tooltip-wrap-${criterionId}`);
  if (!wrapper) return;

  const isOpen = wrapper.classList.contains("is-open");
  closeAllCriterionTooltips();

  if (!isOpen) {
    wrapper.classList.add("is-open");
    const btn = wrapper.querySelector(".criterion-info-icon");
    if (btn) btn.setAttribute("aria-expanded", "true");
    const popover = wrapper.querySelector(".criterion-tooltip-popover");
    if (popover) {
      popover.setAttribute("aria-hidden", "false");
      positionTooltipPopover(popover, wrapper);
    }
  }
}

function closeCriterionTooltip(event, criterionId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const wrapper = document.getElementById(`tooltip-wrap-${criterionId}`);
  if (wrapper) {
    wrapper.classList.remove("is-open");
    const btn = wrapper.querySelector(".criterion-info-icon");
    if (btn) btn.setAttribute("aria-expanded", "false");
    const pop = wrapper.querySelector(".criterion-tooltip-popover");
    if (pop) pop.setAttribute("aria-hidden", "true");
  }
}

// Global click and Escape key dismissal
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".criterion-tooltip-wrapper")) {
      closeAllCriterionTooltips();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllCriterionTooltips();
    }
  });
}

if (typeof window !== "undefined") {
  window.toggleCriterionTooltip = toggleCriterionTooltip;
  window.closeCriterionTooltip = closeCriterionTooltip;
  window.closeAllCriterionTooltips = closeAllCriterionTooltips;
  window.positionTooltipPopover = positionTooltipPopover;
}

// ==========================================================================
// 2. DOM Rendering Functions (Accessibility Pass - Item 9)
// Every radio group is rendered as a proper <fieldset> with a semantic <legend>
// All radio inputs have explicit associated <label for="...">
// ==========================================================================

function renderCriteriaSection(criteriaList, containerId, sectionPrefix) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  criteriaList.forEach((criterion, index) => {
    // Render accessible card row with role="group"
    const rowEl = document.createElement("div");
    rowEl.className = "criterion-row";
    rowEl.id = `row-${criterion.id}`;
    rowEl.setAttribute("role", "group");
    rowEl.setAttribute("aria-labelledby", `label-${criterion.id}`);

    // Max score for this item
    const maxPoints = computeCriterionMaxRawPoints(criterion);

    const descText = CRITERIA_OFFICIAL_DESCRIPTIONS[criterion.id] || criterion.description || "";
    const escapedDesc = escapeHtml(descText);
    const escapedName = escapeHtml(criterion.name);

    const tooltipHtml = descText ? `
      <div class="criterion-tooltip-wrapper" id="tooltip-wrap-${criterion.id}">
        <button
          type="button"
          class="criterion-info-icon"
          id="info-btn-${criterion.id}"
          aria-label="Official description for ${escapedName}"
          aria-describedby="tooltip-${criterion.id}"
          aria-expanded="false"
          title="Click or hover to view official MIROS description"
          onclick="toggleCriterionTooltip(event, '${criterion.id}')"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </button>
        <div
          class="criterion-tooltip-popover"
          role="tooltip"
          id="tooltip-${criterion.id}"
          aria-hidden="true"
        >
          <div class="criterion-tooltip-header">
            <span class="criterion-tooltip-pill">MIROS Rubric v1.1</span>
            <span class="criterion-tooltip-name">${escapedName}</span>
            <button type="button" class="criterion-tooltip-close" onclick="closeCriterionTooltip(event, '${criterion.id}')" aria-label="Close description">&times;</button>
          </div>
          <div class="criterion-tooltip-text">${escapedDesc}</div>
        </div>
      </div>
    ` : '';

    const metaHtml = `
      <div class="criterion-meta" id="label-${criterion.id}">
        <div class="criterion-title-wrap">
          <span class="criterion-number">${sectionPrefix}${index + 1}.</span>
          <span class="criterion-title">${escapedName}</span>
          ${tooltipHtml}
        </div>
        <div class="criterion-badge" id="badge-${criterion.id}">Max ${maxPoints.toFixed(2)} pts</div>
      </div>
    `;

    let optionsHtml = '<div class="options-group" role="radiogroup" aria-labelledby="label-' + criterion.id + '">';
    criterion.options.forEach((opt, optIdx) => {
      const inputId = `radio_${criterion.id}_${optIdx}`;
      const isNone = opt.points === 0;
      const isAnswered = !!(assessmentState.answeredCriteria && assessmentState.answeredCriteria[criterion.id]);
      const isSelected = isAnswered && assessmentState.selectedItems[criterion.id]?.selectedOption === opt.label;
      const optRawPoints = computeItemRawPoints(criterion, optIdx);

      optionsHtml += `
        <label class="option-label ${isNone ? 'is-none' : ''}" for="${inputId}">
          <input
            type="radio"
            id="${inputId}"
            name="crit_${criterion.id}"
            value="${opt.points}"
            data-opt-idx="${optIdx}"
            data-raw-points="${optRawPoints}"
            data-label="${opt.label}"
            data-section="${sectionPrefix}"
            data-crit-id="${criterion.id}"
            data-crit-name="${criterion.name}"
            ${isSelected ? 'checked' : ''}
          />
          <span class="option-card">
            <span>${opt.label}</span>
            <span class="point-pill">${opt.points > 0 ? '+' + opt.points.toFixed(2) : '0'}</span>
          </span>
        </label>
      `;
    });
    optionsHtml += '</div>';

    rowEl.innerHTML = metaHtml + optionsHtml;
    container.appendChild(rowEl);

    // Attach edge-positioning listener on desktop hover for zero screen-edge clipping
    const tipWrap = rowEl.querySelector('.criterion-tooltip-wrapper');
    if (tipWrap) {
      tipWrap.addEventListener('mouseenter', () => {
        const pop = tipWrap.querySelector('.criterion-tooltip-popover');
        if (pop) positionTooltipPopover(pop, tipWrap);
      });
    }

    // Initial state capture (starts at None 0 if not set)
    if (!assessmentState.selectedItems[criterion.id]) {
      assessmentState.selectedItems[criterion.id] = {
        section: sectionPrefix,
        id: criterion.id,
        name: criterion.name,
        selectedOption: "None (0)",
        tierPoints: 0.0,
        points: 0.0
      };
    }
  });
}

// ==========================================================================
// 3. Calculation & Real-Time State Capture (v2.0 Raw Point Sectional Scaling)
// ==========================================================================

function calculateScores() {
  let rawEarnedA = 0.0;
  let rawEarnedB = 0.0;

  Object.values(assessmentState.selectedItems).forEach(item => {
    if (item.section === "A") {
      rawEarnedA += Number(item.points) || 0;
    } else if (item.section === "B") {
      rawEarnedB += Number(item.points) || 0;
    }
  });

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

  assessmentState.scores = {
    sectionA: finalScoreA,
    sectionB: finalScoreB,
    total: finalTotal,
    starRating: finalTotal,
    starsCount,
    ratingLabel,
    rawEarnedA: parseFloat(rawEarnedA.toFixed(2)),
    rawEarnedB: parseFloat(rawEarnedB.toFixed(2))
  };

  updateScoreUI();
}

function updateScoreUI() {
  const { sectionA, sectionB, total, starRating, starsCount, ratingLabel } = assessmentState.scores;

  const scoreAEl = document.getElementById("summary-score-a");
  const scoreBEl = document.getElementById("summary-score-b");
  const scoreTotalEl = document.getElementById("summary-score-total");
  const ratingTextEl = document.getElementById("summary-rating-text");
  const starsContainerEl = document.getElementById("summary-stars");

  if (scoreAEl) scoreAEl.textContent = `${sectionA.toFixed(2)} / ${MAX_SCORE_A.toFixed(2)}`;
  if (scoreBEl) scoreBEl.textContent = `${sectionB.toFixed(2)} / ${MAX_SCORE_B.toFixed(2)}`;
  if (scoreTotalEl) scoreTotalEl.textContent = `${total.toFixed(2)} / ${MAX_TOTAL_SCORE.toFixed(2)}`;
  if (ratingTextEl) ratingTextEl.textContent = `${starRating.toFixed(2)} / 5.0 (${starsCount} ★)`;

  if (starsContainerEl) {
    let starIcons = "";
    for (let i = 1; i <= 5; i++) {
      starIcons += i <= starsCount ? "★" : "☆";
    }
    starsContainerEl.innerHTML = starIcons;
    starsContainerEl.title = ratingLabel;
  }
}

function handleOptionChange(event) {
  const radio = event.target;
  if (radio.tagName !== "INPUT" || radio.type !== "radio") return;

  const critId = radio.getAttribute("data-crit-id");
  const critName = radio.getAttribute("data-crit-name");
  const section = radio.getAttribute("data-section");
  const selectedOption = radio.getAttribute("data-label");
  const optIdx = parseInt(radio.getAttribute("data-opt-idx"), 10) || 0;
  const critList = section === "A" ? SECTION_A_CRITERIA : SECTION_B_CRITERIA;
  const crit = critList.find(c => c.id === critId);
  const earnedRaw = computeItemRawPoints(crit, optIdx);

  // Update selected state record
  assessmentState.selectedItems[critId] = {
    section,
    id: critId,
    name: critName,
    selectedOption,
    tierPoints: parseFloat(radio.value) || 0,
    points: earnedRaw
  };

  // Update visual indicators for this row
  const rowEl = document.getElementById(`row-${critId}`);
  const badgeEl = document.getElementById(`badge-${critId}`);

  if (rowEl) {
    if (earnedRaw > 0) {
      rowEl.classList.add("has-score");
    } else {
      rowEl.classList.remove("has-score");
    }
  }

  if (badgeEl) {
    if (earnedRaw > 0) {
      badgeEl.classList.add("scored");
      badgeEl.textContent = `Awarded: ${earnedRaw.toFixed(2)} pts`;
    } else {
      badgeEl.classList.remove("scored");
      badgeEl.textContent = "0.00 pts";
    }
  }

  // Feature 3: Mark criterion as answered and update sidebar progress
  if (!assessmentState.answeredCriteria) assessmentState.answeredCriteria = {};
  assessmentState.answeredCriteria[critId] = true;

  calculateScores();
  updateSectionProgressUI();
  debouncedAutosave();
}

function updateDateDisplay() {
  const dateInput = document.getElementById("assessmentDate");
  const displayEl = document.getElementById("date-formatted-display");
  if (!dateInput || !displayEl) return;
  const val = dateInput.value;
  if (!val) {
    displayEl.textContent = "";
    return;
  }
  try {
    const parts = val.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
      displayEl.textContent = d.toLocaleDateString("en-MY", options);
    }
  } catch (e) {
    displayEl.textContent = val;
  }
}

// Strict Assessor ID format: exactly 3 letters, 1 space, 4 numbers (e.g. "MKA 9006")
const ASSESSOR_ID_REGEX = /^[A-Z]{3} \d{4}$/;

function isValidAssessorId(id) {
  if (!id || typeof id !== "string") return false;
  return ASSESSOR_ID_REGEX.test(id.trim());
}

function sanitizeAndFormatAssessorId(raw) {
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  const lettersMatch = upper.match(/^[A-Z]{0,3}/);
  const letters = lettersMatch ? lettersMatch[0] : "";
  const remainder = upper.slice(letters.length).replace(/[^0-9]/g, "").slice(0, 4);

  if (letters.length === 3) {
    if (remainder.length > 0) {
      return `${letters} ${remainder}`;
    } else if (raw.endsWith(" ") || upper.endsWith(" ")) {
      return `${letters} `;
    }
  }
  return letters;
}

function updateAssessorIdValidationUI() {
  const el = document.getElementById("assessorId");
  const hint = document.getElementById("assessorId-hint");
  if (!el) return;

  const val = (el.value || "").trim();
  if (!val) {
    el.classList.remove("is-valid", "is-invalid");
    if (hint) {
      hint.className = "field-hint";
      hint.textContent = "Format: 3 letters and 4 numbers (e.g. MKA 9006)";
    }
    return;
  }

  if (isValidAssessorId(val)) {
    el.classList.remove("is-invalid");
    el.classList.add("is-valid");
    if (hint) {
      hint.className = "field-hint success";
      hint.textContent = "✓ Valid Assessor ID format (e.g. MKA 9006)";
    }
  } else {
    el.classList.remove("is-valid");
    if (val.length >= 3) {
      el.classList.add("is-invalid");
      if (hint) {
        hint.className = "field-hint error";
        hint.textContent = "Format must strictly be 3 letters and 4 numbers (e.g. MKA 9006)";
      }
    } else {
      el.classList.remove("is-invalid");
      if (hint) {
        hint.className = "field-hint";
        hint.textContent = `Enter 3 letters and 4 numbers (e.g. MKA 9006) - ${val.length}/8 chars`;
      }
    }
  }
}

function setPackageSelectValue(val) {
  const selectEl = document.getElementById("packageName");
  const customEl = document.getElementById("packageNameCustom");
  if (!selectEl) return;
  const cleanVal = (val || "").trim();
  if (!cleanVal) {
    selectEl.value = "";
    if (customEl) {
      customEl.style.display = "none";
      customEl.value = "";
    }
    return;
  }

  // 1. Direct option value match
  let matched = false;
  for (let i = 0; i < selectEl.options.length; i++) {
    if (selectEl.options[i].value === cleanVal) {
      selectEl.selectedIndex = i;
      matched = true;
      break;
    }
  }

  // 2. Fuzzy match for standard tiers
  if (!matched) {
    if (/package\s*2/i.test(cleanVal) || /6[,.]?000/.test(cleanVal) || /comprehensive/i.test(cleanVal)) {
      selectEl.value = "Package 2: Comprehensive Assessment (RM 6,000)";
      matched = true;
    } else if (/package\s*1/i.test(cleanVal) || /4[,.]?500/.test(cleanVal) || /standard/i.test(cleanVal)) {
      selectEl.value = "Package 1: Standard Assessment (RM 4,500)";
      matched = true;
    }
  }

  // 3. Custom tier if not matching predefined options
  if (!matched) {
    selectEl.value = "Custom";
    if (customEl) {
      customEl.style.display = "block";
      customEl.value = cleanVal;
    }
  } else if (customEl) {
    customEl.style.display = "none";
    customEl.value = "";
  }
}

function captureMetadata() {
  assessmentState.metadata.companyName = (document.getElementById("companyName")?.value || "").trim();
  assessmentState.metadata.deviceModel = (document.getElementById("deviceModel")?.value || "").trim();
  
  const pkgEl = document.getElementById("packageName");
  const customPkgEl = document.getElementById("packageNameCustom");
  let pkgVal = (pkgEl?.value || "").trim();
  if (pkgVal === "Custom") {
    pkgVal = (customPkgEl?.value || "").trim();
  }
  assessmentState.metadata.packageName = pkgVal;

  assessmentState.metadata.assessorName = (document.getElementById("assessorName")?.value || "").trim();
  assessmentState.metadata.assessorId = (document.getElementById("assessorId")?.value || "").trim().toUpperCase();
  assessmentState.metadata.assessmentDate = document.getElementById("assessmentDate")?.value || new Date().toISOString().split("T")[0];
  updateDateDisplay();
  updateSectionProgressUI();
}

// ==========================================================================
// 3a. Section Progress Sidebar & Completeness Subsystem
// ==========================================================================

function updateSectionProgressUI() {
  if (!assessmentState.answeredCriteria) assessmentState.answeredCriteria = {};

  const answeredA = SECTION_A_CRITERIA.filter(c => assessmentState.answeredCriteria[c.id]).length;
  const answeredB = SECTION_B_CRITERIA.filter(c => assessmentState.answeredCriteria[c.id]).length;
  const totalAnswered = answeredA + answeredB;
  const totalCriteria = 33;

  // Update Section A elements
  const secACountEl = document.getElementById("sec-a-count");
  const secAFillEl = document.getElementById("sec-a-progress-fill");
  const secAPctEl = document.getElementById("sec-a-pct");
  const secAStatusEl = document.getElementById("sec-a-status-badge") || document.getElementById("sec-a-status");
  const secAIconEl = document.getElementById("sec-a-check-icon");
  const pctA = Math.round((answeredA / 24) * 100);

  if (secACountEl) secACountEl.textContent = answeredA;
  if (secAFillEl) {
    secAFillEl.style.width = `${(answeredA / 24) * 100}%`;
    secAFillEl.style.background = answeredA === 24 ? "#10B981" : "#F58220";
  }
  if (secAPctEl) secAPctEl.textContent = `${pctA}% answered`;
  if (secAStatusEl) {
    if (answeredA === 24) {
      secAStatusEl.textContent = "Complete";
      secAStatusEl.className = "nav-status-badge complete";
      if (secAIconEl) {
        secAIconEl.textContent = "✓";
        secAIconEl.className = "status-icon-complete";
      }
    } else if (answeredA > 0) {
      secAStatusEl.textContent = "In Progress";
      secAStatusEl.className = "nav-status-badge progress";
      if (secAIconEl) {
        secAIconEl.textContent = "○";
        secAIconEl.className = "status-icon-pending";
      }
    } else {
      secAStatusEl.textContent = "Not Started";
      secAStatusEl.className = "nav-status-badge empty";
      if (secAIconEl) {
        secAIconEl.textContent = "○";
        secAIconEl.className = "status-icon-pending";
      }
    }
  }

  // Update Section B elements
  const secBCountEl = document.getElementById("sec-b-count");
  const secBFillEl = document.getElementById("sec-b-progress-fill");
  const secBPctEl = document.getElementById("sec-b-pct");
  const secBStatusEl = document.getElementById("sec-b-status-badge") || document.getElementById("sec-b-status");
  const secBIconEl = document.getElementById("sec-b-check-icon");
  const pctB = Math.round((answeredB / 9) * 100);

  if (secBCountEl) secBCountEl.textContent = answeredB;
  if (secBFillEl) {
    secBFillEl.style.width = `${(answeredB / 9) * 100}%`;
    secBFillEl.style.background = answeredB === 9 ? "#10B981" : "#F58220";
  }
  if (secBPctEl) secBPctEl.textContent = `${pctB}% answered`;
  if (secBStatusEl) {
    if (answeredB === 9) {
      secBStatusEl.textContent = "Complete";
      secBStatusEl.className = "nav-status-badge complete";
      if (secBIconEl) {
        secBIconEl.textContent = "✓";
        secBIconEl.className = "status-icon-complete";
      }
    } else if (answeredB > 0) {
      secBStatusEl.textContent = "In Progress";
      secBStatusEl.className = "nav-status-badge progress";
      if (secBIconEl) {
        secBIconEl.textContent = "○";
        secBIconEl.className = "status-icon-pending";
      }
    } else {
      secBStatusEl.textContent = "Not Started";
      secBStatusEl.className = "nav-status-badge empty";
      if (secBIconEl) {
        secBIconEl.textContent = "○";
        secBIconEl.className = "status-icon-pending";
      }
    }
  }

  // Update Overall count and progress elements
  const overallCountEl = document.getElementById("overall-count-num");
  if (overallCountEl) {
    overallCountEl.textContent = totalAnswered;
  }

  const overallBadgeEl = document.getElementById("sec-total-progress-badge") || document.getElementById("overall-progress-badge");
  const overallPctEl = document.getElementById("overall-progress-pct");
  const overallFillEl = document.getElementById("overall-progress-fill");
  const overallPctVal = Math.round((totalAnswered / totalCriteria) * 100);

  if (overallBadgeEl) {
    overallBadgeEl.textContent = `${totalAnswered} / ${totalCriteria} completed`;
    if (totalAnswered === totalCriteria) {
      overallBadgeEl.className = "sidebar-status-badge badge-complete";
    } else if (totalAnswered > 0) {
      overallBadgeEl.className = "sidebar-status-badge badge-progress";
    } else {
      overallBadgeEl.className = "sidebar-status-badge badge-empty";
    }
  }

  const stickyCriteriaCount = document.getElementById("sticky-criteria-answered");
  if (stickyCriteriaCount) {
    stickyCriteriaCount.textContent = `${totalAnswered}/${totalCriteria}`;
  }

  if (overallPctEl) {
    overallPctEl.textContent = `${overallPctVal}%`;
    overallPctEl.className = overallPctVal === 100 ? "progress-pct-badge pct-complete" : "progress-pct-badge";
  }
  if (overallFillEl) {
    overallFillEl.style.width = `${overallPctVal}%`;
    overallFillEl.style.background = totalAnswered === totalCriteria ? "#10B981" : "#F58220";
  }

  // Update Metadata status indicator
  const metaStatusEl = document.getElementById("sidebar-meta-status");
  const metaIconEl = document.getElementById("meta-check-icon");
  const hasMeta = !!(
    assessmentState.metadata.companyName &&
    assessmentState.metadata.deviceModel &&
    assessmentState.metadata.assessorName
  );

  if (metaStatusEl) {
    if (hasMeta) {
      metaStatusEl.textContent = "Complete";
      metaStatusEl.className = "nav-status-badge complete";
      if (metaIconEl) {
        metaIconEl.textContent = "✓";
        metaIconEl.className = "status-icon-complete";
      }
    } else {
      metaStatusEl.textContent = "Pending";
      metaStatusEl.className = "nav-status-badge pending";
      if (metaIconEl) {
        metaIconEl.textContent = "○";
        metaIconEl.className = "status-icon-pending";
      }
    }
  }

  // If all completed, hide the incomplete alert
  if (totalAnswered === totalCriteria) {
    const alertBox = document.getElementById("sidebar-incomplete-alert");
    if (alertBox) alertBox.style.display = "none";
  }
}

function scrollToSection(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("section-highlight");
    setTimeout(() => el.classList.remove("section-highlight"), 1600);
  }
}
window.scrollToSection = scrollToSection;

function getMissingCriteria() {
  const missing = [];
  if (!assessmentState.answeredCriteria) assessmentState.answeredCriteria = {};

  SECTION_A_CRITERIA.forEach((crit, idx) => {
    if (!assessmentState.answeredCriteria[crit.id]) {
      missing.push({
        id: crit.id,
        name: crit.name,
        section: "A",
        code: `A${idx + 1}`
      });
    }
  });

  SECTION_B_CRITERIA.forEach((crit, idx) => {
    if (!assessmentState.answeredCriteria[crit.id]) {
      missing.push({
        id: crit.id,
        name: crit.name,
        section: "B",
        code: `B${idx + 1}`
      });
    }
  });

  return missing;
}

function displayIncompleteWarning(missingItems) {
  const alertBox = document.getElementById("sidebar-incomplete-alert");
  const countEl = document.getElementById("missing-count");
  const listEl = document.getElementById("sidebar-missing-list");
  if (!alertBox || !listEl) return;

  alertBox.style.display = "block";
  if (countEl) countEl.textContent = missingItems.length;

  listEl.innerHTML = missingItems.map(item => `
    <a href="javascript:void(0)" onclick="scrollToCriterion('${item.id}')" style="display: block; text-decoration: none; color: #991B1B; padding: 5px 8px; border-radius: 4px; background: #FFFFFF; border: 1px solid #FECACA; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;" title="Click to jump to ${item.code}: ${escapeHtml(item.name)}">
      <strong style="color: #DC2626;">${item.code}.</strong> ${escapeHtml(item.name)}
    </a>
  `).join("");

  alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function scrollToCriterion(critId) {
  const row = document.getElementById(`row-${critId}`);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("missing-highlight");
    setTimeout(() => row.classList.remove("missing-highlight"), 2500);
  }
}
window.scrollToCriterion = scrollToCriterion;

// ==========================================================================
// 3b. Multi-Draft Autosave Subsystem (Requirements 1, 2, 3, 4)
// Debounced autosave (500ms) to localStorage under 'trackscore-drafts'
// Supports up to 3 concurrent in-progress evaluations, rubric version tracking,
// draft picker modal, and automatic cleanup of submitted draft.
// ==========================================================================

const DRAFTS_STORAGE_KEY = "trackscore-drafts";
const OLD_DRAFT_STORAGE_KEY = "trackscore-draft";
const MAX_DRAFTS = 3;
let autosaveTimer = null;

// Backward compatibility migration from legacy single-draft storage
function migrateOldDraftIfNeeded() {
  try {
    const oldRaw = localStorage.getItem(OLD_DRAFT_STORAGE_KEY);
    if (!oldRaw) return;
    const oldDraft = JSON.parse(oldRaw);
    if (oldDraft && (oldDraft.metadata || oldDraft.selections)) {
      const drafts = getDrafts();
      const draftId = generateDraftId();
      drafts[draftId] = {
        draftId,
        companyName: oldDraft.metadata?.companyName || "Untitled Company",
        deviceModel: oldDraft.metadata?.deviceModel || "Unspecified Model",
        packageName: oldDraft.metadata?.packageName || "",
        assessorName: oldDraft.metadata?.assessorName || "",
        lastSavedAt: oldDraft.timestamp || new Date().toISOString(),
        formattedTime: oldDraft.formattedTime || new Date().toLocaleString(),
        rubricVersion: oldDraft.metadata?.rubricVersion || "1.0",
        formState: {
          metadata: oldDraft.metadata || {},
          selections: oldDraft.selections || {},
          scores: oldDraft.scores || {}
        }
      };
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    }
    localStorage.removeItem(OLD_DRAFT_STORAGE_KEY);
  } catch (err) {
    console.warn("Draft migration note:", err);
  }
}

function getDrafts() {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.warn("Could not parse drafts from localStorage:", e);
    return {};
  }
}

function saveDrafts(drafts) {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    updateDraftsCountUI();
  } catch (e) {
    console.warn("Could not save drafts to localStorage:", e);
  }
}

function generateDraftId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "draft-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
}

function formatRelativeTime(isoString) {
  if (!isoString) return "just now";
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (isNaN(diffSec)) return "recently";
    if (diffSec < 45) return "just now";
    if (diffSec < 90) return "1 min ago";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mins ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  } catch {
    return "recently";
  }
}

function updateDraftsCountUI() {
  const drafts = getDrafts();
  const count = Object.keys(drafts).length;
  const headerCountEl = document.getElementById("header-drafts-count");
  const headerTopCountEl = document.getElementById("header-drafts-count-top");
  const modalCountEl = document.getElementById("modal-drafts-count");
  if (headerCountEl) headerCountEl.textContent = count;
  if (headerTopCountEl) headerTopCountEl.textContent = count;
  if (modalCountEl) modalCountEl.textContent = count;
}

function serializeDraft(draftId) {
  captureMetadata();
  const selections = {};
  const answeredCriteria = assessmentState.answeredCriteria || {};

  Object.entries(assessmentState.selectedItems).forEach(([critId, item]) => {
    const isAnswered = !!answeredCriteria[critId];
    selections[critId] = {
      section: item.section,
      id: item.id,
      name: item.name,
      selectedOption: item.selectedOption,
      points: item.points,
      isAnswered: isAnswered
    };
  });

  const company = assessmentState.metadata.companyName || "Untitled Company";
  const device = assessmentState.metadata.deviceModel || "Unspecified Model";
  const assessor = assessmentState.metadata.assessorName || "Unassigned Assessor";
  const assessorId = assessmentState.metadata.assessorId || "";

  return {
    draftId,
    companyName: company,
    deviceModel: device,
    packageName: assessmentState.metadata.packageName || "",
    assessorName: assessor,
    assessorId: assessorId,
    lastSavedAt: new Date().toISOString(),
    formattedTime: new Date().toLocaleString(),
    rubricVersion: assessmentState.rubricVersion || RUBRIC_VERSION,
    formState: {
      metadata: { ...assessmentState.metadata },
      selections,
      answeredCriteria: { ...answeredCriteria },
      scores: { ...assessmentState.scores }
    }
  };
}

function saveDraftToStorage(isManual = false, forceNew = false) {
  try {
    const drafts = getDrafts();
    const draftKeys = Object.keys(drafts);

    const companyInput = document.getElementById("companyName");
    const currentCompany = (companyInput?.value || assessmentState.metadata?.companyName || "").trim();
    const deviceInput = document.getElementById("deviceModel");
    const currentDevice = (deviceInput?.value || assessmentState.metadata?.deviceModel || "").trim();
    const answeredCount = assessmentState.answeredCriteria ? Object.keys(assessmentState.answeredCriteria).length : 0;

    // Guard: Do not autosave a completely untouched empty form
    if (!isManual && !currentCompany && !currentDevice && answeredCount === 0) {
      return false;
    }

    let targetDraftId = null;

    // Case 1: Force New Draft mode (e.g. user clicked "Save Form as New Draft")
    if (forceNew) {
      if (draftKeys.length >= MAX_DRAFTS) {
        const warning = `You have reached the maximum of ${MAX_DRAFTS} saved drafts. Please submit or discard an existing draft before saving a new one.`;
        showToast(warning, true);
        openDraftsModal(warning);
        return false;
      }
      targetDraftId = generateDraftId();
      assessmentState.activeDraftId = targetDraftId;
    }
    // Case 2: An active draft is currently loaded in this form session
    else if (assessmentState.activeDraftId && drafts[assessmentState.activeDraftId]) {
      const activeDraft = drafts[assessmentState.activeDraftId];
      const savedCompany = (activeDraft.companyName || "").trim().toLowerCase();
      const currentCompanyLower = currentCompany.toLowerCase();

      // Detect if user changed the company name to a completely different company
      const isDifferentCompany = savedCompany && currentCompanyLower &&
                                 savedCompany !== "untitled company" &&
                                 currentCompanyLower !== "untitled company" &&
                                 savedCompany !== currentCompanyLower;

      if (isDifferentCompany) {
        // User changed company: this is a different evaluation!
        if (draftKeys.length < MAX_DRAFTS) {
          // Space available (< 3 drafts): branch into a NEW separate draft so the previous company draft is NOT destroyed
          targetDraftId = generateDraftId();
          assessmentState.activeDraftId = targetDraftId;
        } else {
          // Already have 3 drafts in storage: we cannot create a 4th, and we must NEVER overwrite the existing draft
          if (isManual) {
            const warning = `You have reached the maximum of ${MAX_DRAFTS} saved drafts. Discard or submit an existing draft before saving a new one for "${currentCompany}".`;
            showToast(warning, true);
            openDraftsModal(warning);
          }
          return false;
        }
      } else {
        // Same company / continuing work on this active draft: update in place
        targetDraftId = assessmentState.activeDraftId;
      }
    }
    // Case 3: No active draft currently loaded in session (e.g. after clicking "New Evaluation" or fresh form)
    else {
      // Check if space is available for a new draft (< MAX_DRAFTS)
      if (draftKeys.length < MAX_DRAFTS) {
        // Allocate a brand new draft ID so existing drafts are fully preserved
        targetDraftId = generateDraftId();
        assessmentState.activeDraftId = targetDraftId;
      } else {
        // Storage has reached maximum 3 drafts: DO NOT OVERWRITE ANY EXISTING DRAFT!
        if (isManual) {
          const warning = `You have reached the maximum of ${MAX_DRAFTS} saved drafts. Please open Drafts to resume one or discard one to make room.`;
          showToast(warning, true);
          openDraftsModal(warning);
        }
        return false;
      }
    }

    const draft = serializeDraft(targetDraftId);
    drafts[targetDraftId] = draft;
    saveDrafts(drafts);
    localStorage.setItem("trackscore-active-draft-id", targetDraftId);
    updateDraftsCountUI();

    const indicator = document.getElementById("autosave-indicator");
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const countNow = Object.keys(drafts).length;
    const displayName = draft.companyName && draft.companyName !== "Untitled Company" ? draft.companyName : "Evaluation";

    if (indicator) {
      indicator.innerHTML = isManual
        ? `<span style="color: #10B981; font-weight: 600;">✓ Saved:</span> Draft "${escapeHtml(displayName)}" saved at ${timeStr} (${countNow}/${MAX_DRAFTS} drafts in storage)`
        : `<span style="color: #64748B;">Autosaved:</span> "${escapeHtml(displayName)}" at ${timeStr} (${countNow}/${MAX_DRAFTS} drafts in storage)`;
    }

    if (isManual) {
      showToast(`Draft "${displayName}" saved (${countNow}/${MAX_DRAFTS} drafts in storage)`);
      const buttons = [
        document.getElementById("btn-save-draft"),
        document.getElementById("btn-save-draft-top"),
        document.getElementById("btn-save-as-new"),
        document.getElementById("btn-save-as-new-top"),
        document.getElementById("btn-save-as-new-modal")
      ];
      buttons.forEach(btn => {
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = `✓ Saved!`;
          setTimeout(() => { if (btn) btn.innerHTML = orig; }, 1800);
        }
      });
    }
    return true;
  } catch (err) {
    console.warn("Could not save evaluation draft to localStorage:", err);
    return false;
  }
}

function saveDraftAsNew() {
  const res = saveDraftToStorage(true, true);
  if (res) {
    renderDraftsModal();
  }
}

function debouncedAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveDraftToStorage(false);
  }, 500);
}

function clearDraftFromStorage(draftIdToClear = null) {
  try {
    clearTimeout(autosaveTimer);
    const targetId = draftIdToClear || assessmentState.activeDraftId;
    if (targetId) {
      const drafts = getDrafts();
      if (drafts[targetId]) {
        delete drafts[targetId];
        saveDrafts(drafts);
      }
    }
    const storedActive = localStorage.getItem("trackscore-active-draft-id");
    if (targetId && storedActive === targetId) {
      localStorage.removeItem("trackscore-active-draft-id");
    }
    if (!draftIdToClear || draftIdToClear === assessmentState.activeDraftId) {
      assessmentState.activeDraftId = null;
      hideRubricWarning();
      const indicator = document.getElementById("autosave-indicator");
      if (indicator) indicator.textContent = "";
    }
    updateDraftsCountUI();
    checkExistingDraft();
  } catch (err) {
    console.warn("Error clearing draft from localStorage:", err);
  }
}

function discardDraft(draftId) {
  if (!draftId) return;
  clearTimeout(autosaveTimer);
  const wasActive = assessmentState.activeDraftId === draftId;
  clearDraftFromStorage(draftId);
  if (wasActive) {
    assessmentState.activeDraftId = null;
    localStorage.removeItem("trackscore-active-draft-id");
    hideRubricWarning();
    const indicator = document.getElementById("autosave-indicator");
    if (indicator) indicator.textContent = "Draft discarded.";
  }
  renderDraftsModal();
  updateDraftsCountUI();
  showToast("Draft discarded successfully.");
}

function showRubricWarning(version) {
  const banner = document.getElementById("rubric-mismatch-banner");
  const textEl = document.getElementById("rubric-mismatch-text");
  if (banner && textEl) {
    textEl.textContent = `This draft was started under an older scoring version (v${escapeHtml(version || '1.0')} vs current v${escapeHtml(RUBRIC_VERSION)}) — please review your answers before submitting.`;
    banner.style.display = "flex";
  }
}

function hideRubricWarning() {
  const banner = document.getElementById("rubric-mismatch-banner");
  if (banner) banner.style.display = "none";
}

function restoreDraft(draft) {
  if (!draft) return;
  assessmentState.activeDraftId = draft.draftId;
  localStorage.setItem("trackscore-active-draft-id", draft.draftId);

  // Check for rubric version mismatch (Requirement 1)
  const draftVersion = draft.rubricVersion || (draft.formState?.metadata?.rubricVersion) || "1.0";
  if (draftVersion !== RUBRIC_VERSION) {
    showRubricWarning(draftVersion);
  } else {
    hideRubricWarning();
  }

  const state = draft.formState || draft;

  // 1. Populate metadata inputs
  if (state.metadata) {
    if (state.metadata.companyName !== undefined) {
      const el = document.getElementById("companyName");
      if (el) el.value = state.metadata.companyName;
    }
    if (state.metadata.deviceModel !== undefined) {
      const el = document.getElementById("deviceModel");
      if (el) el.value = state.metadata.deviceModel;
    }
    if (state.metadata.packageName !== undefined) {
      setPackageSelectValue(state.metadata.packageName);
    }
    if (state.metadata.assessorName !== undefined) {
      const el = document.getElementById("assessorName");
      if (el) el.value = state.metadata.assessorName;
    }
    if (state.metadata.assessorId !== undefined) {
      const el = document.getElementById("assessorId");
      if (el) {
        el.value = state.metadata.assessorId;
        updateAssessorIdValidationUI();
      }
    }
    if (state.metadata.assessmentDate !== undefined) {
      const el = document.getElementById("assessmentDate");
      if (el) el.value = state.metadata.assessmentDate;
    }
    captureMetadata();
  }

  // 2. Clear current selections and restore saved ones
  assessmentState.selectedItems = {};
  assessmentState.answeredCriteria = {};
  document.querySelectorAll('input[type="radio"][data-crit-id]').forEach(r => { r.checked = false; });
  document.querySelectorAll('.criterion-row').forEach(el => el.classList.remove('has-score'));

  // Reset all criterion badges to their default Max Points display
  const allCriteria = [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA];
  allCriteria.forEach(criterion => {
    const badgeEl = document.getElementById(`badge-${criterion.id}`);
    if (badgeEl) {
      badgeEl.classList.remove('scored');
      const maxPts = computeCriterionMaxRawPoints(criterion);
      badgeEl.textContent = `Max ${maxPts.toFixed(2)} pts`;
    }
    // Default initial selected item for baseline calculations
    assessmentState.selectedItems[criterion.id] = {
      section: criterion.section || (SECTION_A_CRITERIA.some(c => c.id === criterion.id) ? "A" : "B"),
      id: criterion.id,
      name: criterion.name,
      selectedOption: "None (0)",
      tierPoints: 0.0,
      points: 0.0
    };
  });

  const savedAnswered = state.answeredCriteria || {};

  if (state.selections) {
    Object.entries(state.selections).forEach(([critId, sel]) => {
      // CRITICAL: A criterion should ONLY be marked/checked if it was ACTUALLY answered by the user!
      const wasAnswered = !!(savedAnswered[critId] || sel.isAnswered || (typeof sel.points === 'number' && sel.points > 0));
      if (!wasAnswered) return;

      const radios = Array.from(document.querySelectorAll(`input[type="radio"][data-crit-id="${critId}"]`));
      let matchingRadio = radios.find(r => r.getAttribute("data-label") === sel.selectedOption);
      if (!matchingRadio && typeof sel.points === 'number') {
        matchingRadio = radios.find(r => parseFloat(r.value) === sel.points);
      }

      if (matchingRadio) {
        matchingRadio.checked = true;
        const optIdx = parseInt(matchingRadio.getAttribute("data-opt-idx"), 10) || 0;
        const section = matchingRadio.getAttribute("data-section") || sel.section;
        const critList = section === "A" ? SECTION_A_CRITERIA : SECTION_B_CRITERIA;
        const crit = critList.find(c => c.id === critId);
        const earnedRaw = computeItemRawPoints(crit, optIdx);
        const critName = matchingRadio.getAttribute("data-crit-name") || sel.name;
        
        assessmentState.answeredCriteria[critId] = true;
        assessmentState.selectedItems[critId] = {
          section,
          id: critId,
          name: critName,
          selectedOption: matchingRadio.getAttribute("data-label") || sel.selectedOption,
          tierPoints: parseFloat(matchingRadio.value) || 0,
          points: earnedRaw
        };

        const rowEl = document.getElementById(`row-${critId}`);
        const badgeEl = document.getElementById(`badge-${critId}`);
        if (rowEl) {
          if (earnedRaw > 0) rowEl.classList.add("has-score");
          else rowEl.classList.remove("has-score");
        }
        if (badgeEl) {
          if (earnedRaw > 0) {
            badgeEl.classList.add("scored");
            badgeEl.textContent = `Awarded: ${earnedRaw.toFixed(2)} pts`;
          } else {
            badgeEl.classList.remove("scored");
            badgeEl.textContent = "0.00 pts";
          }
        }
      }
    });
  }

  calculateScores();
  updateSectionProgressUI();

  const banner = document.getElementById("draft-banner");
  if (banner) banner.style.display = "none";

  const indicator = document.getElementById("autosave-indicator");
  const answeredCount = Object.keys(assessmentState.answeredCriteria).length;
  const drafts = getDrafts();
  const countNow = Object.keys(drafts).length;
  if (indicator) {
    indicator.innerHTML = `<span style="color: #10B981; font-weight: 600;">Active Draft:</span> "${escapeHtml(draft.companyName || 'Evaluation')}" (${answeredCount}/33 criteria) &bull; In Storage: <strong>${countNow}/${MAX_DRAFTS}</strong> &bull; <a href="javascript:void(0)" onclick="openDraftsModal()" style="color: #2563EB; font-weight: 600; text-decoration: underline;">Switch Draft</a> &bull; <a href="javascript:void(0)" onclick="startNewEvaluation()" style="color: #2563EB; font-weight: 600; text-decoration: underline;">New Evaluation</a>`;
  }
}

function startNewEvaluation() {
  const drafts = getDrafts();
  const count = Object.keys(drafts).length;

  if (count >= MAX_DRAFTS) {
    const warning = `You have reached the maximum of ${MAX_DRAFTS} saved drafts. Please submit or discard an existing draft before starting a new one.`;
    openDraftsModal(warning);
    showToast(`Maximum of ${MAX_DRAFTS} drafts reached. Discard or submit one first.`, true);
    return false;
  }

  clearTimeout(autosaveTimer);
  assessmentState.activeDraftId = null;
  localStorage.removeItem("trackscore-active-draft-id");
  assessmentState.resubmitRecordId = null;
  hideRubricWarning();

  // Reset inputs
  const companyEl = document.getElementById("companyName");
  const deviceEl = document.getElementById("deviceModel");
  const assessorEl = document.getElementById("assessorName");
  const assessorIdEl = document.getElementById("assessorId");
  const dateEl = document.getElementById("assessmentDate");

  if (companyEl) companyEl.value = "";
  if (deviceEl) deviceEl.value = "";
  setPackageSelectValue("");
  if (assessorEl) assessorEl.value = "";
  if (assessorIdEl) {
    assessorIdEl.value = "";
    assessorIdEl.classList.remove("is-valid", "is-invalid");
    const hint = document.getElementById("assessorId-hint");
    if (hint) {
      hint.className = "field-hint";
      hint.textContent = "Format: 3 letters and 4 numbers (e.g. MKA 9006)";
    }
  }
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  assessmentState.selectedItems = {};
  assessmentState.answeredCriteria = {};
  captureMetadata();

  renderCriteriaSection(SECTION_A_CRITERIA, "sectionA-container", "A");
  renderCriteriaSection(SECTION_B_CRITERIA, "sectionB-container", "B");
  calculateScores();
  updateSectionProgressUI();

  closeDraftsModal();
  const banner = document.getElementById("draft-banner");
  if (banner) banner.style.display = "none";

  const indicator = document.getElementById("autosave-indicator");
  if (indicator) {
    indicator.innerHTML = `<span style="color: #64748B;">Fresh evaluation ready</span> (Saved drafts: ${count}/${MAX_DRAFTS})`;
  }

  updateDraftsCountUI();
  showToast("Started fresh evaluation form. Enter details to save as draft.");
  return true;
}

function openDraftsModal(warningMsg = null) {
  const modal = document.getElementById("drafts-modal");
  if (!modal) return;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  renderDraftsModal(warningMsg);
}

function closeDraftsModal() {
  const modal = document.getElementById("drafts-modal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
}

function renderDraftsModal(warningMsg = null) {
  const container = document.getElementById("drafts-list-container");
  const warningEl = document.getElementById("drafts-modal-warning");
  if (!container) return;

  const drafts = getDrafts();
  const draftList = Object.values(drafts).sort((a, b) => new Date(b.lastSavedAt || 0) - new Date(a.lastSavedAt || 0));
  const count = draftList.length;

  updateDraftsCountUI();

  if (warningEl) {
    if (warningMsg) {
      warningEl.textContent = warningMsg;
      warningEl.style.display = "block";
    } else if (count >= MAX_DRAFTS) {
      warningEl.textContent = "You have reached the maximum of 3 saved drafts. Please submit or discard an existing draft before starting a new one.";
      warningEl.style.display = "block";
    } else {
      warningEl.style.display = "none";
    }
  }

  if (count === 0) {
    container.innerHTML = `
      <div class="empty-state-box" style="padding: 32px 16px; margin: 8px 0; text-align: center;">
        <div class="empty-state-icon" style="width: 44px; height: 44px; margin: 0 auto 10px auto; font-size: 28px;">📋</div>
        <div class="empty-state-title" style="font-size: 15px; font-weight: 700; color: #1E293B;">No In-Progress Drafts</div>
        <div class="empty-state-subtitle" style="font-size: 13px; color: #64748B; margin-bottom: 12px;">You do not have any evaluations saved in draft state. Click "Start New Evaluation" to begin.</div>
      </div>
    `;
    return;
  }

  let html = "";
  draftList.forEach((draft) => {
    const isActive = assessmentState.activeDraftId === draft.draftId;
    const isRubricMismatch = draft.rubricVersion && draft.rubricVersion !== RUBRIC_VERSION;
    const relativeTime = formatRelativeTime(draft.lastSavedAt);
    const answeredCount = draft.formState?.answeredCriteria ? Object.keys(draft.formState.answeredCriteria).length : 0;

    html += `
      <div class="draft-card ${isActive ? 'active-draft' : ''}" id="draft-card-${draft.draftId}">
        <div class="draft-card-info">
          <div class="draft-card-title">
            ${escapeHtml(draft.companyName || "Untitled Company")} — ${escapeHtml(draft.deviceModel || "Unspecified Model")}
            ${isActive ? '<span style="font-size: 11px; background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; padding: 2px 7px; border-radius: 9999px; font-weight: 700; margin-left: 8px;">CURRENT</span>' : ''}
          </div>
          <div class="draft-card-meta">
            <span>👤 Assessor: <strong>${escapeHtml(draft.assessorName || "Unassigned")}</strong>${draft.assessorId ? ` <span style="color:#0284C7; font-family: monospace;">[${escapeHtml(draft.assessorId)}]</span>` : ''}</span>
            <span>&bull;</span>
            <span>📊 Progress: <strong>${answeredCount}/33 criteria</strong></span>
            <span>&bull;</span>
            <span>🕒 Saved: <strong>${escapeHtml(relativeTime)}</strong></span>
            ${isRubricMismatch ? `<span class="rubric-badge-warning" title="Started under rubric v${escapeHtml(draft.rubricVersion)}">⚠️ Old Rubric (v${escapeHtml(draft.rubricVersion)})</span>` : ''}
          </div>
        </div>
        <div class="draft-card-actions" id="actions-${draft.draftId}">
          <button type="button" class="btn ${isActive ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="resume" data-draft-id="${draft.draftId}">
            ${isActive ? 'Active' : 'Resume'}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="discard" data-draft-id="${draft.draftId}" style="color: #DC2626; border-color: #FECACA;">
            Discard
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.handleResumeDraftClick = function(draftId) {
  const drafts = getDrafts();
  const draft = drafts[draftId];
  if (draft) {
    restoreDraft(draft);
    closeDraftsModal();
    showToast(`Restored draft for ${draft.companyName || 'Evaluation'}.`);
  }
};

window.handleDiscardDraftClick = function(draftId) {
  const actionsContainer = document.getElementById(`actions-${draftId}`);
  if (actionsContainer) {
    actionsContainer.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px;">
        <button type="button" class="btn btn-sm" data-action="confirm-discard" data-draft-id="${draftId}" style="background: #DC2626; color: #FFFFFF; border: 1px solid #DC2626; font-weight: 600; padding: 4px 8px; font-size: 12px;">
          ⚠️ Confirm Discard
        </button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="cancel-discard" data-draft-id="${draftId}" style="padding: 4px 8px; font-size: 12px;">
          Cancel
        </button>
      </div>
    `;
    return;
  }
  discardDraft(draftId);
};

function checkExistingDraft() {
  migrateOldDraftIfNeeded();
  updateDraftsCountUI();
  const drafts = getDrafts();
  const draftList = Object.values(drafts).sort((a, b) => new Date(b.lastSavedAt || 0) - new Date(a.lastSavedAt || 0));
  const banner = document.getElementById("draft-banner");
  const timeEl = document.getElementById("draft-banner-time");

  // If there's an active draft stored from the previous session, automatically resume it
  const storedActiveId = localStorage.getItem("trackscore-active-draft-id");
  if (storedActiveId && drafts[storedActiveId] && !assessmentState.activeDraftId) {
    restoreDraft(drafts[storedActiveId]);
    if (banner) banner.style.display = "none";
    return;
  }

  if (draftList.length === 1 && !assessmentState.activeDraftId) {
    const single = draftList[0];
    if (banner && timeEl) {
      timeEl.innerHTML = `<strong>${escapeHtml(single.companyName || 'Evaluation')}</strong> (${escapeHtml(formatRelativeTime(single.lastSavedAt))})`;
      banner.style.display = "flex";
      const btnResume = document.getElementById("btn-resume-draft");
      const btnDiscard = document.getElementById("btn-discard-draft");
      if (btnResume) {
        btnResume.textContent = "Resume";
        btnResume.onclick = () => {
          restoreDraft(single);
          banner.style.display = "none";
          showToast("Evaluation draft restored successfully.");
        };
      }
      if (btnDiscard) {
        btnDiscard.textContent = "Discard";
        btnDiscard.onclick = () => {
          discardDraft(single.draftId);
          banner.style.display = "none";
        };
      }
    }
  } else if (draftList.length > 1 && !assessmentState.activeDraftId) {
    if (banner && timeEl) {
      timeEl.innerHTML = `<strong>${draftList.length} saved drafts</strong> in progress (max ${MAX_DRAFTS})`;
      banner.style.display = "flex";
      const btnResume = document.getElementById("btn-resume-draft");
      const btnDiscard = document.getElementById("btn-discard-draft");
      if (btnResume) {
        btnResume.textContent = "View All Drafts";
        btnResume.onclick = () => openDraftsModal();
      }
      if (btnDiscard) {
        btnDiscard.textContent = "Dismiss";
        btnDiscard.onclick = () => {
          banner.style.display = "none";
        };
      }
    }
  } else {
    if (banner) banner.style.display = "none";
  }
}

// ==========================================================================
// 3c. Assessor Rejection Notice & Status Lookup Subsystem (Requirement 4)
// Allows assessors to review their submissions and prominently view rejection reasons
// ==========================================================================

function openLookupModal() {
  const modal = document.getElementById("lookup-modal");
  if (!modal) return;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");

  // Pre-fill with current Assessor ID or Assessor Name if present
  const currentAssessorId = (document.getElementById("assessorId")?.value || "").trim();
  const currentAssessorName = (document.getElementById("assessorName")?.value || "").trim();
  const defaultQuery = currentAssessorId || currentAssessorName;
  const input = document.getElementById("lookup-assessor-input");
  if (input && defaultQuery && !input.value) {
    input.value = defaultQuery;
    lookupAssessorSubmissions(defaultQuery);
  } else if (input && input.value) {
    lookupAssessorSubmissions(input.value);
  }
}

function closeLookupModal() {
  const modal = document.getElementById("lookup-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
}

async function lookupAssessorSubmissions(queryStr) {
  const query = (queryStr || document.getElementById("lookup-assessor-input")?.value || "").trim();
  const container = document.getElementById("lookup-results-container");
  if (!container) return;

  if (!query) {
    container.innerHTML = `<div style="padding: 12px; font-size: 13px; color: #DC2626; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 4px;">Please enter an Assessor ID, Name, or Company Name to search.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="text-align: center; padding: 24px; color: #64748B;">
      <span class="spinner-inline" style="width: 14px; height: 14px; border-width: 2px;"></span> Searching records...
    </div>
  `;

  try {
    const res = await fetch(`/.netlify/functions/lookup-evaluation?query=${encodeURIComponent(query)}`, {
      headers: getAuthHeaders()
    });

    if (handleAuthError(res)) return;

    const result = await res.json();
    if (!res.ok || !result.success) {
      container.innerHTML = `<div style="padding: 12px; font-size: 13px; color: #DC2626; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 4px;">Lookup Error: ${escapeHtml(result.error || 'Failed to search records')}</div>`;
      return;
    }

    if (!result.data || result.data.length === 0) {
      container.innerHTML = `
        <div style="padding: 18px; text-align: center; color: #64748B; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 6px; font-size: 13px;">
          No evaluations found matching "<strong>${escapeHtml(query)}</strong>".
        </div>
      `;
      return;
    }

    let html = `<div style="display: flex; flex-direction: column; gap: 12px; max-height: 380px; overflow-y: auto; padding-right: 4px;">`;
    result.data.forEach(sub => {
      const normStatus = (sub.status || "pending_review").toLowerCase();
      const isRejected = normStatus === "rejected";
      const isApproved = normStatus === "approved";
      const recordDate = sub.assessmentDate || (sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "N/A");

      html += `
        <div style="border: 1px solid ${isRejected ? '#FCA5A5' : isApproved ? '#A7F3D0' : '#E2E8F0'}; background: ${isRejected ? '#FFF5F5' : '#FFFFFF'}; border-radius: 6px; padding: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
            <div>
              <div style="font-weight: 700; color: #1E293B; font-size: 14px;">${escapeHtml(sub.companyName)} — ${escapeHtml(sub.deviceModel)}</div>
              <div style="font-size: 12px; color: #64748B; margin-top: 2px;">
                Assessor: <strong>${escapeHtml(sub.assessorName)}</strong>${sub.assessorId ? ` <span style="color: #0284C7; font-family: monospace;">[${escapeHtml(sub.assessorId)}]</span>` : ''} &bull; Date: ${escapeHtml(recordDate)}
              </div>
            </div>
            <div>
              ${isApproved ? `
                <span style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 9999px;">● Approved</span>
              ` : isRejected ? `
                <span style="background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 9999px;">● Rejected</span>
              ` : `
                <span style="background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 9999px;">● Pending Review</span>
              `}
            </div>
          </div>

          <div style="font-size: 12.5px; color: #475569; margin-top: 8px;">
            <strong>Score:</strong> ${Number(sub.totalScore || 0).toFixed(2)}/${sub.rubricVersion === '1.0' ? '43.00' : '5.00'} (${Number(sub.starRating || 0).toFixed(2)}★) &bull; <em>${escapeHtml(sub.ratingLabel || '')}</em>
          </div>

          ${isApproved ? `
            <div style="margin-top: 8px; font-size: 12px; color: #065F46; background: #F0FDF4; border: 1px solid #BBF7D0; padding: 6px 10px; border-radius: 4px;">
              ✓ Approved by <strong>${escapeHtml(sub.approvedBy || 'Manager')}</strong> on ${sub.approvedAt ? new Date(sub.approvedAt).toLocaleString() : 'N/A'}. Record is locked.
            </div>
          ` : ''}

          ${isRejected ? `
            <div style="margin-top: 10px; background: #FFFFFF; border: 2px solid #EF4444; border-radius: 6px; padding: 12px;">
              <div style="color: #991B1B; font-weight: 800; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                ⚠️ Regulatory Rejection Notice (by ${escapeHtml(sub.rejectedBy || 'Manager')}${sub.rejectedAt ? ' on ' + new Date(sub.rejectedAt).toLocaleString() : ''})
              </div>
              <div style="margin-top: 6px; background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 4px; padding: 8px 12px; color: #7F1D1D; font-size: 13px; font-weight: 600; line-height: 1.4;">
                Reason: "${escapeHtml(sub.rejectionReason || 'No specific reason provided.')}"
              </div>
              <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                <button type="button" class="btn btn-primary btn-sm" onclick="loadEvaluationForCorrection('${sub._id}')">
                  ✏️ Load into Form to Correct &amp; Resubmit
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div style="padding: 12px; font-size: 13px; color: #DC2626; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 4px;">Network Error: ${escapeHtml(error.message)}</div>`;
  }
}

async function loadEvaluationForCorrection(recordId) {
  try {
    showToast("Loading evaluation into form for correction...");
    const res = await fetch(`/.netlify/functions/lookup-evaluation?id=${encodeURIComponent(recordId)}`, {
      headers: getAuthHeaders()
    });
    if (handleAuthError(res)) return;
    const result = await res.json();
    if (!res.ok || !result.success || !result.data || !result.data[0]) {
      showToast("Failed to fetch evaluation record details", true);
      return;
    }

    const doc = result.data[0];
    assessmentState.resubmitRecordId = doc._id || recordId;

    // Populate metadata
    if (document.getElementById("companyName")) document.getElementById("companyName").value = doc.companyName || "";
    if (document.getElementById("deviceModel")) document.getElementById("deviceModel").value = doc.deviceModel || "";
    setPackageSelectValue(doc.packageName || "");
    if (document.getElementById("assessorName")) document.getElementById("assessorName").value = doc.assessorName || "";
    if (document.getElementById("assessorId")) {
      document.getElementById("assessorId").value = doc.assessorId || "";
      updateAssessorIdValidationUI();
    }
    if (document.getElementById("assessmentDate") && doc.assessmentDate) document.getElementById("assessmentDate").value = doc.assessmentDate;
    captureMetadata();

    // Populate radio buttons
    assessmentState.answeredCriteria = {};
    if (Array.isArray(doc.breakdown)) {
      doc.breakdown.forEach(item => {
        let radio = document.querySelector(`input[data-crit-id="${item.id}"][data-label="${item.selectedOption}"]`);
        if (!radio && typeof item.points === "number") {
          radio = document.querySelector(`input[data-crit-id="${item.id}"][value="${item.points}"]`);
        }
        if (radio) {
          radio.checked = true;
          const optIdx = parseInt(radio.getAttribute("data-opt-idx"), 10) || 0;
          const section = radio.getAttribute("data-section");
          const critList = section === "A" ? SECTION_A_CRITERIA : SECTION_B_CRITERIA;
          const crit = critList.find(c => c.id === item.id);
          const earnedRaw = computeItemRawPoints(crit, optIdx);
          const critName = radio.getAttribute("data-crit-name") || item.name;
          assessmentState.selectedItems[item.id] = {
            section,
            id: item.id,
            name: critName,
            selectedOption: item.selectedOption,
            tierPoints: parseFloat(radio.value) || 0,
            points: earnedRaw
          };
          assessmentState.answeredCriteria[item.id] = true;
          const rowEl = document.getElementById(`row-${item.id}`);
          const badgeEl = document.getElementById(`badge-${item.id}`);
          if (rowEl) {
            if (earnedRaw > 0) rowEl.classList.add("has-score");
            else rowEl.classList.remove("has-score");
          }
          if (badgeEl) {
            if (earnedRaw > 0) {
              badgeEl.classList.add("scored");
              badgeEl.textContent = `Awarded: ${earnedRaw.toFixed(2)} pts`;
            } else {
              badgeEl.classList.remove("scored");
              badgeEl.textContent = "0.00 pts";
            }
          }
        }
      });
    }

    calculateScores();
    updateSectionProgressUI();
    debouncedAutosave();
    closeLookupModal();

    if (doc.rejectionReason) {
      showFormAlert(`Loaded rejected evaluation. Reason from Manager: "${doc.rejectionReason}". Please adjust the criteria and resubmit.`, "warning");
    } else {
      showToast("Evaluation loaded into form successfully.");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showToast(`Error loading evaluation: ${err.message}`, true);
  }
}

// Make globally available
window.loadEvaluationForCorrection = loadEvaluationForCorrection;

// ==========================================================================
// 4. HTML2PDF Full Breakdown Report Generation & On-Page Viewer
// ==========================================================================

let currentReportHtml = "";
let currentReportFilename = "";

function generatePdfReport() {
  captureMetadata();

  const { companyName, deviceModel, packageName, assessorName, assessorId, assessmentDate } = assessmentState.metadata;
  const { sectionA, sectionB, total, starRating, starsCount, ratingLabel } = assessmentState.scores;

  if (!companyName || !deviceModel || !assessorName) {
    showToast("Please fill in Company Name, Device Model, and Assessor Name before generating report.", true);
    document.getElementById("companyName")?.focus();
    return;
  }

  showToast("Compiling official TrackScore Assessment report...");

  // Build sorted items list for dual-column 1-page layout
  const allCriteriaItems = [];
  SECTION_A_CRITERIA.forEach((crit, idx) => {
    const selected = assessmentState.selectedItems[crit.id] || { selectedOption: "None (0)", points: 0.0 };
    allCriteriaItems.push({
      sec: "A",
      num: idx + 1,
      name: crit.name,
      selectedOption: selected.selectedOption,
      points: selected.points
    });
  });
  SECTION_B_CRITERIA.forEach((crit, idx) => {
    const selected = assessmentState.selectedItems[crit.id] || { selectedOption: "None (0)", points: 0.0 };
    allCriteriaItems.push({
      sec: "B",
      num: idx + 1,
      name: crit.name,
      selectedOption: selected.selectedOption,
      points: selected.points
    });
  });

  let starDisplay = "";
  for (let s = 1; s <= 5; s++) {
    starDisplay += s <= starsCount ? "★" : "☆";
  }

  // Split into two balanced columns: 17 items on left, 16 items on right
  const leftColumnItems = allCriteriaItems.slice(0, 17);
  const rightColumnItems = allCriteriaItems.slice(17);

  const renderColumnRows = (itemsList) => itemsList.map((item, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
      <td style="padding: 2.5px 4px; border-bottom: 1px solid #E2E8F0; font-size: 8px; text-align: center; color: #64748B; font-weight: 700;">
        ${item.sec}${item.num}
      </td>
      <td style="padding: 2.5px 5px; border-bottom: 1px solid #E2E8F0; font-size: 8px; font-weight: 600; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">
        ${escapeHtml(item.name)}
      </td>
      <td style="padding: 2.5px 5px; border-bottom: 1px solid #E2E8F0; font-size: 7.5px; color: ${item.points > 0 ? (item.sec === 'A' ? '#C2410C' : '#1D4ED8') : '#64748B'}; font-weight: ${item.points > 0 ? '700' : '400'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">
        ${escapeHtml(item.selectedOption)}
      </td>
      <td style="padding: 2.5px 5px; border-bottom: 1px solid #E2E8F0; font-size: 8px; font-weight: 700; text-align: right; color: ${item.points > 0 ? '#0F172A' : '#94A3B8'}; white-space: nowrap;">
        ${Number(item.points || 0).toFixed(2)} pts
      </td>
    </tr>
  `).join("");

  const reportId = `TS-${Date.now().toString().slice(-6)}`;
  const dateFormatted = assessmentDate || new Date().toISOString().split("T")[0];
  const certData = assessmentState.certificate || (assessmentState.metadata && assessmentState.metadata.certificate) || null;
  const isCertSigned = Boolean(certData && certData.signedDate);

  // Pristine single-page A4 format designed to fit 100% without overflowing or splitting
  const rawHtmlTemplate = `
    <div id="trackscore-pdf-document" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1A1A1A; background-color: #FFFFFF; padding: 12px 14px; width: 100%; max-width: 780px; margin: 0 auto; box-sizing: border-box;">
      
      <!-- Report Header -->
      <div style="background-color: #1A1A1A; border-bottom: 3px solid #F58220; padding: 10px 14px; color: #FFFFFF; border-radius: 4px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #F58220; font-weight: 800; margin-bottom: 2px;">MALAYSIAN INSTITUTE OF ROAD SAFETY RESEARCH (MIROS)</div>
          <h1 style="margin: 0; font-size: 17px; font-weight: 800; letter-spacing: 0.5px; color: #FFFFFF;">TRACKSCORE ASSESSMENT REPORT</h1>
          <div style="font-size: 9.5px; color: #CBD5E1; margin-top: 1px;">Official Telematics Hardware & Software Compliance Matrix</div>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #F58220; color: #FFFFFF; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 3px;">
            OFFICIAL EVALUATION
          </div>
          <div style="font-size: 9.5px; color: #CBD5E1; margin-top: 3px;">Ref ID: ${reportId}</div>
        </div>
      </div>

      <!-- Metadata Grid -->
      <div style="border: 1px solid #E2E8F0; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; background-color: #F8FAFC;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 18%; padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase;">Company:</td>
            <td style="width: 32%; padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #0F172A;">${escapeHtml(companyName)}</td>
            <td style="width: 18%; padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase;">Date:</td>
            <td style="width: 32%; padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #0F172A;">${escapeHtml(dateFormatted)}</td>
          </tr>
          <tr>
            <td style="padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase;">Device Model:</td>
            <td style="padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #0F172A;">${escapeHtml(deviceModel)}</td>
            <td style="padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase;">Assessor Name:</td>
            <td style="padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #0F172A;">${escapeHtml(assessorName)}</td>
          </tr>
          <tr>
            <td style="padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase;">Package:</td>
            <td style="padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #0F172A;">${escapeHtml(packageName || "Standard Evaluation Package")}</td>
            <td style="padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase;">Assessor ID:</td>
            <td style="padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #0284C7; font-family: monospace;">${escapeHtml(assessorId || "N/A")}</td>
          </tr>
          ${isCertSigned ? `
          <tr>
            <td style="padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #166534; text-transform: uppercase;">Certificate No:</td>
            <td style="padding: 2.5px 5px; font-size: 10.5px; font-weight: 800; color: #166534; font-family: monospace;">${escapeHtml(certData.certificateNumber || "N/A")}</td>
            <td style="padding: 2.5px 5px; font-size: 8.5px; font-weight: 700; color: #166534; text-transform: uppercase;">Endorsement:</td>
            <td style="padding: 2.5px 5px; font-size: 10.5px; font-weight: 700; color: #166534;">DGO Signed (${new Date(certData.signedDate).toLocaleDateString('en-MY')})</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- Score Summary Table -->
      <div style="margin-bottom: 10px;">
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #1A1A1A; border-radius: 4px; overflow: hidden;">
          <thead>
            <tr style="background-color: #1A1A1A; color: #FFFFFF;">
              <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%;">Section A Score (Basic)</th>
              <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%;">Section B Score (Additional)</th>
              <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%; color: #F58220;">Total Score</th>
              <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%;">Certification Grade</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background-color: #FFFFFF;">
              <td style="padding: 6px 8px; font-size: 13px; font-weight: 800; border-right: 1px solid #E2E8F0;">
                ${sectionA.toFixed(2)} <span style="font-size: 9.5px; font-weight: 500; color: #64748B;">/ ${MAX_SCORE_A.toFixed(2)}</span>
              </td>
              <td style="padding: 6px 8px; font-size: 13px; font-weight: 800; border-right: 1px solid #E2E8F0;">
                ${sectionB.toFixed(2)} <span style="font-size: 9.5px; font-weight: 500; color: #64748B;">/ ${MAX_SCORE_B.toFixed(2)}</span>
              </td>
              <td style="padding: 6px 8px; font-size: 15px; font-weight: 900; color: #F58220; border-right: 1px solid #E2E8F0;">
                ${total.toFixed(2)} <span style="font-size: 10px; font-weight: 600; color: #64748B;">/ ${MAX_TOTAL_SCORE.toFixed(2)}</span>
              </td>
              <td style="padding: 6px 8px;">
                <div style="font-size: 13px; font-weight: 800; color: #B45309;">
                  ${starDisplay} <span style="font-size: 10px;">(${starRating.toFixed(2)}/5.0)</span>
                </div>
                <div style="font-size: 9px; font-weight: 700; color: #475569; margin-top: 1px;">
                  ${escapeHtml(ratingLabel)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Itemized Criteria Matrix Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; border-bottom: 2px solid #F58220; padding-bottom: 3px;">
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1A1A1A;">
          Itemized Evaluation Breakdown (All 33 Criteria)
        </span>
        <span style="font-size: 8.5px; color: #64748B; font-weight: 600;">
          24 Core Requirements + 9 Security Items
        </span>
      </div>

      <!-- Dual-Column Itemized Matrix: Fits perfectly on 1 Single A4 Page -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
        <tr>
          <!-- Column 1: Items 1 to 17 -->
          <td style="width: 49.5%; vertical-align: top; padding-right: 4px;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1;">
              <thead>
                <tr style="background-color: #1A1A1A; color: #FFFFFF;">
                  <th style="padding: 3px 4px; font-size: 7.5px; font-weight: 700; width: 10%; text-align: center;">#</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 48%; text-align: left;">Criterion (Sec A)</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 26%; text-align: left;">Selected Option</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 16%; text-align: right;">Pts</th>
                </tr>
              </thead>
              <tbody>
                ${renderColumnRows(leftColumnItems)}
              </tbody>
            </table>
          </td>

          <!-- Column 2: Items 18 to 33 -->
          <td style="width: 49.5%; vertical-align: top; padding-left: 4px;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1;">
              <thead>
                <tr style="background-color: #1A1A1A; color: #FFFFFF;">
                  <th style="padding: 3px 4px; font-size: 7.5px; font-weight: 700; width: 10%; text-align: center;">#</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 48%; text-align: left;">Criterion (Sec A/B)</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 26%; text-align: left;">Selected Option</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 16%; text-align: right;">Pts</th>
                </tr>
              </thead>
              <tbody>
                ${renderColumnRows(rightColumnItems)}
              </tbody>
            </table>
          </td>
        </tr>
      </table>

      <!-- Sign-Off & Verification Footer -->
      <div style="border-top: 1px solid #E2E8F0; padding-top: 6px; font-size: 8px; color: #64748B;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            ${isCertSigned ? `
            <td style="width: 38%; vertical-align: top;">
              <div style="font-weight: 700; color: #1A1A1A; margin-bottom: 1px;">TrackScore Digital Assessor Matrix</div>
              <div>Certified by Malaysian Institute of Road Safety Research (MIROS)</div>
              <div style="margin-top: 1px;">Generated on ${new Date().toLocaleString()}</div>
              <div style="margin-top: 2px; font-weight: 700; color: #166534; font-size: 8px;">Certificate Ref: ${escapeHtml(certData.certificateNumber || '')}</div>
            </td>
            <td style="width: 31%; vertical-align: top; text-align: right;">
              <div style="display: inline-block; text-align: center; border-top: 1px solid #94A3B8; padding-top: 2px; min-width: 130px;">
                <div style="font-weight: 700; color: #1A1A1A; font-size: 8.5px;">${escapeHtml(assessorName)}</div>
                <div style="font-size: 7.5px; color: #64748B;">Authorized Assessor Sign-Off</div>
              </div>
            </td>
            <td style="width: 31%; vertical-align: top; text-align: right; padding-left: 8px;">
              <div style="display: inline-block; text-align: center; border-top: 1.5px solid #166534; padding-top: 2px; min-width: 140px;">
                <div style="font-weight: 800; color: #166534; font-size: 8.5px;">${escapeHtml(certData.signedBy || 'Director General')}</div>
                <div style="font-size: 7.5px; color: #15803D; font-weight: 700;">Director General Office (DGO)</div>
                <div style="font-size: 7px; color: #64748B;">Signed: ${new Date(certData.signedDate).toLocaleDateString('en-MY')}</div>
              </div>
            </td>
            ` : `
            <td style="width: 55%; vertical-align: top;">
              <div style="font-weight: 700; color: #1A1A1A; margin-bottom: 1px;">TrackScore Digital Assessor Matrix</div>
              <div>Certified by Malaysian Institute of Road Safety Research (MIROS)</div>
              <div style="margin-top: 1px;">Generated on ${new Date().toLocaleString()}</div>
            </td>
            <td style="width: 45%; vertical-align: top; text-align: right;">
              <div style="display: inline-block; text-align: center; border-top: 1px solid #94A3B8; padding-top: 2px; min-width: 150px;">
                <div style="font-weight: 700; color: #1A1A1A; font-size: 8.5px;">${escapeHtml(assessorName)}</div>
                <div style="font-size: 7.5px; color: #64748B;">Authorized Assessor Sign-Off</div>
              </div>
            </td>
            `}
          </tr>
        </table>
      </div>

    </div>
  `;

  // Cache template and filename
  currentReportHtml = rawHtmlTemplate;
  currentReportFilename = `TrackScore_Evaluation_${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_${deviceModel.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  // 1. RENDER AND SHOW REPORT DIRECTLY ON THE EVALUATION PAGE
  const reportWrapper = document.getElementById("report-document-wrapper");
  const reportModal = document.getElementById("report-modal");
  const reportModalTitle = document.getElementById("report-modal-title");
  const reportStatusBadge = document.getElementById("report-status-badge");

  if (reportWrapper && reportModal) {
    reportWrapper.innerHTML = rawHtmlTemplate;

    if (reportModalTitle) {
      reportModalTitle.textContent = `Generated Assessment Report: ${companyName} (${deviceModel})`;
    }
    if (reportStatusBadge) {
      reportStatusBadge.textContent = "Report generated and displayed on evaluation page";
    }

    // Open modal on evaluation page
    reportModal.classList.add("active");
    reportModal.setAttribute("aria-hidden", "false");

    // Scroll to top of modal container
    const modalBody = document.getElementById("report-modal-body");
    if (modalBody) modalBody.scrollTop = 0;

    showToast("Assessment Report is now displayed on the page!");
  }
}

// Lazy-load html2pdf only when PDF generation is requested
let html2pdfLoadingPromise = null;
function loadHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (html2pdfLoadingPromise) return html2pdfLoadingPromise;
  html2pdfLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.onload = () => resolve(window.html2pdf);
    script.onerror = (err) => {
      html2pdfLoadingPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });
  return html2pdfLoadingPromise;
}

// Download the currently generated report as a PDF file
let isGeneratingReportPdf = false;
async function downloadReportPdf(showMessage = true) {
  if (isGeneratingReportPdf) {
    console.warn("[PDF Generator] PDF generation already in progress; ignoring duplicate request.");
    return;
  }
  if (!currentReportHtml) {
    showToast("Please generate the report first before downloading.", true);
    return;
  }

  isGeneratingReportPdf = true;
  const downloadBtn = document.getElementById("btn-download-pdf-modal");
  const downloadText = document.getElementById("btn-download-modal-text");
  const statusBadge = document.getElementById("report-status-badge");

  if (downloadBtn) downloadBtn.disabled = true;
  if (downloadText) downloadText.textContent = "Loading PDF engine...";
  if (statusBadge) statusBadge.textContent = "Loading PDF generator...";

  try {
    await loadHtml2Pdf();

    if (downloadText) downloadText.textContent = "Generating PDF...";
    if (statusBadge) statusBadge.textContent = "Compiling 1-page PDF document...";

    const element = document.getElementById('report-document-wrapper'); 

    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: currentReportFilename || "TrackScore_Evaluation_Report.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        scrollY: 0,
        windowHeight: element ? element.scrollHeight : undefined
      },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    if (window.html2pdf && element) {
      await window.html2pdf()
        .set(opt)
        .from(element)
        .save();

      if (statusBadge) statusBadge.textContent = "Report displayed • 1-page PDF file downloaded successfully";
      if (showMessage) {
        showToast("PDF report successfully downloaded!");
      }
    } else {
      showToast("html2pdf library is loading. Please try again shortly.", true);
    }
  } catch (err) {
    console.error("PDF generation failed:", err);
    if (statusBadge) statusBadge.textContent = "Report displayed on page (PDF download issue)";
    showToast("PDF file download error: " + err.message, true);
  } finally {
    isGeneratingReportPdf = false;
    if (downloadText) downloadText.textContent = "Download PDF File";
    if (downloadBtn) downloadBtn.disabled = false;
  }
}

// Print the currently displayed report
function printCurrentReport() {
  if (!currentReportHtml) {
    showToast("No report is currently displayed to print.", true);
    return;
  }
  window.print();
}

// Close the on-page report modal
function closeReportModal() {
  const reportModal = document.getElementById("report-modal");
  if (reportModal) {
    reportModal.classList.remove("active");
    reportModal.setAttribute("aria-hidden", "true");
  }
}

// ==========================================================================
// 5. Database Save Operation (Netlify Function)
// ==========================================================================

// Form Alert Management (Hardening Pass 2)
function showFormAlert(message, type = "danger") {
  const container = document.getElementById("form-alert-container");
  const msgEl = document.getElementById("form-alert-message");
  if (!container || !msgEl) {
    showToast(message, type !== "success");
    return;
  }
  container.className = `form-alert-container alert-${type}`;
  container.style.display = "flex";
  msgEl.innerHTML = `<strong>${escapeHtml(type.toUpperCase())}:</strong> ${escapeHtml(message)}`;
  container.scrollIntoView({ behavior: "smooth", block: "center" });
}

function dismissFormAlert() {
  const container = document.getElementById("form-alert-container");
  if (container) container.style.display = "none";
}

// Make globally accessible for close button
window.dismissFormAlert = dismissFormAlert;

async function saveEvaluationToDatabase() {
  dismissFormAlert();
  captureMetadata();

  const { companyName, deviceModel, packageName, assessorName, assessorId } = assessmentState.metadata;
  const { sectionA, sectionB, total, starRating, starsCount, ratingLabel } = assessmentState.scores;

  if (!companyName || !deviceModel || !assessorName) {
    const errorMsg = "Please fill in Company Name, Device Model, and Assessor Name before saving.";
    showFormAlert(errorMsg, "warning");
    showToast(errorMsg, true);
    if (!companyName) document.getElementById("companyName")?.focus();
    else if (!deviceModel) document.getElementById("deviceModel")?.focus();
    else document.getElementById("assessorName")?.focus();
    return;
  }

  if (!assessorId) {
    const errorMsg = "Please enter an Assessor ID (e.g. MKA 9006) before saving.";
    showFormAlert(errorMsg, "warning");
    showToast(errorMsg, true);
    document.getElementById("assessorId")?.focus();
    return;
  }

  if (!isValidAssessorId(assessorId)) {
    const errorMsg = "Assessor ID must strictly follow 3 letters and 4 numbers (e.g. MKA 9006).";
    showFormAlert(errorMsg, "warning");
    showToast(errorMsg, true);
    document.getElementById("assessorId")?.focus();
    return;
  }

  // Feature 3: Section progress completeness enforcement
  // Block submission if any of the 33 criteria items have not been evaluated
  const missingItems = getMissingCriteria();
  if (missingItems.length > 0) {
    const errorMsg = `Submission Blocked: All 33 criteria must be evaluated before saving. (${missingItems.length} item${missingItems.length > 1 ? 's' : ''} remaining)`;
    showFormAlert(errorMsg, "warning");
    showToast(errorMsg, true);
    displayIncompleteWarning(missingItems);
    return;
  }

  const saveBtn = document.getElementById("btn-save-evaluation");
  const originalHtml = saveBtn ? saveBtn.innerHTML : "Submit Evaluation";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner-inline spinner-white"></span> Submitting Evaluation...`;
  }

  // Build full breakdown list
  const breakdown = [];
  SECTION_A_CRITERIA.forEach(crit => {
    const item = assessmentState.selectedItems[crit.id] || { selectedOption: "None (0)", points: 0.0 };
    breakdown.push({
      section: "A",
      id: crit.id,
      name: crit.name,
      selectedOption: item.selectedOption,
      points: item.points
    });
  });

  SECTION_B_CRITERIA.forEach(crit => {
    const item = assessmentState.selectedItems[crit.id] || { selectedOption: "None (0)", points: 0.0 };
    breakdown.push({
      section: "B",
      id: crit.id,
      name: crit.name,
      selectedOption: item.selectedOption,
      points: item.points
    });
  });

  const payload = {
    companyName,
    deviceModel,
    packageName: packageName || "Standard Package",
    assessorName,
    assessorId: assessorId.toUpperCase(),
    assessmentDate: assessmentState.metadata.assessmentDate,
    rubricVersion: assessmentState.rubricVersion || RUBRIC_VERSION,
    sectionAScore: sectionA,
    sectionBScore: sectionB,
    totalScore: total,
    starRating,
    starsCount,
    ratingLabel,
    breakdown,
    createdAt: new Date().toISOString()
  };

  if (assessmentState.resubmitRecordId) {
    payload.resubmitRecordId = assessmentState.resubmitRecordId;
  }

  try {
    const response = await fetch("/.netlify/functions/save-evaluation", {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    if (handleAuthError(response)) return;

    let result = {};
    try {
      result = await response.json();
    } catch (parseErr) {
      result = { error: "Server returned non-JSON response" };
    }

    if (response.ok && result.success) {
      const msg = result.message || "Evaluation record securely saved to database!";
      showFormAlert(msg, "success");
      showToast(msg);
      // Requirement 4: On successful submission, remove only the submitted draft from trackscore-drafts
      if (assessmentState.activeDraftId) {
        clearDraftFromStorage(assessmentState.activeDraftId);
        assessmentState.activeDraftId = null;
      }
      hideRubricWarning();
      updateDraftsCountUI();
      assessmentState.resubmitRecordId = null;
      checkExistingDraft();
    } else if (response.status === 409) {
      // Duplicate submission guard (Item 8)
      const err = result.error || "A record for this Company, Device, Assessor, and Date already exists.";
      showFormAlert(`Duplicate Error: ${err}`, "warning");
      showToast(`Duplicate: ${err}`, true);
    } else if (response.status === 400) {
      // Score integrity verification failure or validation error (Item 3)
      const err = result.error || "Server detected score discrepancy or invalid parameters.";
      showFormAlert(`Validation Integrity Error: ${err}`, "danger");
      showToast(`Validation Error: ${err}`, true);
    } else if (response.status === 401) {
      // Authentication error (Item 4)
      const err = result.error || "Invalid or missing Assessor API key.";
      showFormAlert(`Authentication Error (401): ${err}`, "danger");
      showToast(`Auth Error: ${err}`, true);
    } else if (response.status === 403) {
      // Role permission error
      const err = result.error || "Forbidden: Endpoint requires Assessor role privileges.";
      showFormAlert(`Permission Error (403): ${err}`, "danger");
      showToast(`Forbidden: ${err}`, true);
    } else {
      const err = result.error || `Server responded with HTTP status ${response.status}`;
      showFormAlert(`Submission Failure: ${err}`, "danger");
      showToast(`Error: ${err}`, true);
    }
  } catch (error) {
    console.error("Save evaluation network error:", error);
    const err = error.message || "Network connection failure. Please check server connectivity.";
    showFormAlert(`Network Error: ${err}`, "danger");
    showToast(`Network Error: ${err}`, true);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}

// ==========================================================================
// 5a. Submission Confirmation Modal Subsystem
// ==========================================================================

function openSubmitConfirmModal() {
  captureMetadata();
  const { companyName, deviceModel, assessorName, assessorId } = assessmentState.metadata;
  const { total, starsCount, ratingLabel } = assessmentState.scores;

  if (!companyName) {
    showToast("Please enter Company Name before submitting.", true);
    document.getElementById("companyName")?.focus();
    return;
  }
  if (!deviceModel) {
    showToast("Please enter Device Model before submitting.", true);
    document.getElementById("deviceModel")?.focus();
    return;
  }
  if (!assessorName) {
    showToast("Please enter Assessor Name before submitting.", true);
    document.getElementById("assessorName")?.focus();
    return;
  }
  if (!assessorId) {
    showToast("Please enter Assessor ID (e.g. MKA 9006) before submitting.", true);
    document.getElementById("assessorId")?.focus();
    return;
  }
  if (!isValidAssessorId(assessorId)) {
    showToast("Assessor ID must strictly follow 3 letters and 4 numbers (e.g. MKA 9006).", true);
    document.getElementById("assessorId")?.focus();
    return;
  }

  if (!assessmentState.answeredCriteria) assessmentState.answeredCriteria = {};
  const answeredCount = Object.keys(assessmentState.answeredCriteria).filter(k => assessmentState.answeredCriteria[k]).length;
  const totalCriteria = 33;

  const countEl = document.getElementById("confirm-criteria-count");
  if (countEl) countEl.textContent = `${answeredCount} of ${totalCriteria}`;

  const compEl = document.getElementById("confirm-company-val");
  if (compEl) compEl.textContent = companyName;

  const devEl = document.getElementById("confirm-device-val");
  if (devEl) devEl.textContent = deviceModel;

  const assessorIdEl = document.getElementById("confirm-assessor-id-val");
  if (assessorIdEl) assessorIdEl.textContent = assessorId;

  const scoreEl = document.getElementById("confirm-score-val");
  if (scoreEl) scoreEl.textContent = `${total.toFixed(2)} / ${MAX_TOTAL_SCORE.toFixed(2)} pts`;

  const ratingEl = document.getElementById("confirm-rating-val");
  if (ratingEl) ratingEl.textContent = `${starsCount} ★ (${ratingLabel})`;

  const modal = document.getElementById("submit-confirm-modal");
  if (modal) {
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }
}

function closeSubmitConfirmModal() {
  const modal = document.getElementById("submit-confirm-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
}

// ==========================================================================
// 6. Utility Functions & Notifications
// ==========================================================================

function escapeHtml(string) {
  if (!string) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return String(string).replace(/[&<>"']/g, m => map[m]);
}

function showToast(message, isError = false) {
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <span>${isError ? '⚠️' : '✓'}</span>
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Reset form to defaults
function resetEvaluationForm() {
  const btn = document.getElementById("btn-reset-form");
  if (btn && btn.getAttribute("data-confirming") !== "true") {
    btn.setAttribute("data-confirming", "true");
    const origHtml = btn.innerHTML;
    btn.innerHTML = "⚠️ Confirm Reset?";
    btn.style.color = "#DC2626";
    btn.style.borderColor = "#DC2626";
    btn.style.fontWeight = "600";
    showToast("Click 'Confirm Reset?' again to reset form.");
    setTimeout(() => {
      if (btn && btn.getAttribute("data-confirming") === "true") {
        btn.setAttribute("data-confirming", "false");
        btn.innerHTML = origHtml;
        btn.style.color = "";
        btn.style.borderColor = "";
        btn.style.fontWeight = "";
      }
    }, 3500);
    return;
  }

  if (btn) {
    btn.setAttribute("data-confirming", "false");
    btn.innerHTML = "Reset Form";
    btn.style.color = "";
    btn.style.borderColor = "";
    btn.style.fontWeight = "";
  }

  clearTimeout(autosaveTimer);
  assessmentState.activeDraftId = null;
  assessmentState.resubmitRecordId = null;
  hideRubricWarning();

  // Reset metadata inputs
  const companyEl = document.getElementById("companyName");
  const deviceEl = document.getElementById("deviceModel");
  const assessorEl = document.getElementById("assessorName");
  const assessorIdEl = document.getElementById("assessorId");
  const dateEl = document.getElementById("assessmentDate");

  if (companyEl) companyEl.value = "";
  if (deviceEl) deviceEl.value = "";
  setPackageSelectValue("");
  if (assessorEl) assessorEl.value = "";
  if (assessorIdEl) {
    assessorIdEl.value = "";
    assessorIdEl.classList.remove("is-valid", "is-invalid");
    const hint = document.getElementById("assessorId-hint");
    if (hint) {
      hint.className = "field-hint";
      hint.textContent = "Format: 3 letters and 4 numbers (e.g. MKA 9006)";
    }
  }
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  assessmentState.selectedItems = {};
  assessmentState.answeredCriteria = {};
  captureMetadata();

  // Re-render and re-calculate
  renderCriteriaSection(SECTION_A_CRITERIA, "sectionA-container", "A");
  renderCriteriaSection(SECTION_B_CRITERIA, "sectionB-container", "B");
  calculateScores();
  updateSectionProgressUI();

  const indicator = document.getElementById("autosave-indicator");
  if (indicator) indicator.textContent = "Evaluation form reset to blank state.";
  showToast("Evaluation form reset to initial state.");
}

// Auto-populate demo data for quick assessor inspection
function fillDemoData() {
  document.getElementById("companyName").value = "Vortex Telematics Malaysia Sdn Bhd";
  document.getElementById("deviceModel").value = "VT-900 GPS Telematics Hub";
  setPackageSelectValue("Package 2: Comprehensive Assessment (RM 6,000)");
  document.getElementById("assessorName").value = "Ir. Khairul Azhar";
  const demoAssessorIdEl = document.getElementById("assessorId");
  if (demoAssessorIdEl) {
    demoAssessorIdEl.value = "MKA 9006";
    updateAssessorIdValidationUI();
  }

  // Select some realistic high-score options
  const samplePicks = {
    trip_history: ">1 year",
    realtime_tracking: "Available",
    map_source: "Open updated",
    geofence: "Polygon",
    geofence_alert: "Push",
    vehicle_status: "Available",
    engine_status: "Report",
    overspeed_detection: "Configurable",
    overspeed_alert: "Push",
    offline_memory: ">60m",
    backup_battery: ">24h",
    sim_network: "Roaming",
    connectivity: "4G",
    multilingual: "Other",
    user_manual: "Other",
    warranty: ">12m",
    customer_service: "Control Centre",
    os_compatibility: "Mobile",
    trip_report: "Duration",
    data_interval: "<30s",
    harsh_accel: "Config",
    harsh_accel_alert: "Push",
    harsh_braking: "Config",
    harsh_braking_alert: "Push",
    tow_detection: "Available",
    panic_button: "SMS",
    mfa: "OTP",
    sop_tech_problems: "3 days",
    service_records: "Available",
    driver_id: "Report",
    certification: "SIRIM/CE",
    immobilizer: "Available",
    tampered_alert: "Push"
  };

  assessmentState.answeredCriteria = {};

  Object.entries(samplePicks).forEach(([critId, optionLabel]) => {
    const radio = document.querySelector(`input[data-crit-id="${critId}"][data-label="${optionLabel}"]`);
    if (radio) {
      radio.checked = true;
      const points = parseFloat(radio.value);
      const section = radio.getAttribute("data-section");
      const critName = radio.getAttribute("data-crit-name");
      assessmentState.selectedItems[critId] = {
        section,
        id: critId,
        name: critName,
        selectedOption: optionLabel,
        points
      };
      assessmentState.answeredCriteria[critId] = true;
      const rowEl = document.getElementById(`row-${critId}`);
      const badgeEl = document.getElementById(`badge-${critId}`);
      if (rowEl) rowEl.classList.add("has-score");
      if (badgeEl) {
        badgeEl.classList.add("scored");
        badgeEl.textContent = `Awarded: ${points.toFixed(2)} pts`;
      }
    }
  });

  captureMetadata();
  calculateScores();
  updateSectionProgressUI();
  debouncedAutosave();
  showToast("Demo evaluation loaded with high-specification inputs.");
}

// ==========================================================================
// 5. Bulk Draft Export and Import Subsystem
// ==========================================================================

function exportDraftsToJson() {
  const drafts = getDrafts();
  const draftIds = Object.keys(drafts);
  if (draftIds.length === 0) {
    showToast("No drafts found in storage to export.", true);
    return;
  }

  const exportPayload = {
    app: "TrackScore",
    version: "2.1",
    exportedAt: new Date().toISOString(),
    draftsCount: draftIds.length,
    drafts: drafts
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const downloadAnchor = document.createElement("a");
  const dateStr = new Date().toISOString().split("T")[0];
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `TrackScore_Drafts_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast(`Exported ${draftIds.length} draft(s) as JSON successfully!`);
}

function importDraftsFromJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      let incomingDrafts = {};

      if (parsed.drafts && typeof parsed.drafts === "object") {
        incomingDrafts = parsed.drafts;
      } else if (parsed && typeof parsed === "object" && !parsed.drafts) {
        incomingDrafts = parsed;
      }

      const incomingIds = Object.keys(incomingDrafts).filter(id => {
        const d = incomingDrafts[id];
        return d && (d.formState || d.metadata || d.companyName);
      });

      if (incomingIds.length === 0) {
        showToast("Invalid drafts file: No recognized draft records found.", true);
        return;
      }

      const currentDrafts = getDrafts();
      const currentIds = Object.keys(currentDrafts);
      const totalCombinedCount = currentIds.length + incomingIds.length;

      // Enforce the 3-draft cap!
      if (totalCombinedCount > MAX_DRAFTS) {
        const warningBox = document.getElementById("drafts-modal-warning");
        const msg = `Import Blocked: Exceeds ${MAX_DRAFTS}-draft limit. You currently have ${currentIds.length} draft(s) and attempted to import ${incomingIds.length} draft(s) (total ${totalCombinedCount}). Please discard some drafts first.`;
        if (warningBox) {
          warningBox.textContent = msg;
          warningBox.style.display = "block";
        }
        showToast(`Import Blocked: Exceeds ${MAX_DRAFTS}-draft limit (${currentIds.length} existing + ${incomingIds.length} imported).`, true);
        return;
      }

      incomingIds.forEach(id => {
        const draft = incomingDrafts[id];
        const newId = generateDraftId();
        draft.draftId = newId;
        const currentComp = draft.companyName || draft.formState?.metadata?.companyName || "Untitled Draft";
        draft.companyName = currentComp.includes("(Imported)") ? currentComp : `${currentComp} (Imported)`;
        currentDrafts[newId] = draft;
      });

      saveDrafts(currentDrafts);
      renderDraftsModal();
      updateDraftsCountUI();
      showToast(`Successfully imported ${incomingIds.length} draft(s)!`);
    } catch (err) {
      console.error("Draft import error:", err);
      showToast("Failed to parse JSON file. Ensure it is a valid TrackScore drafts backup.", true);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

// ==========================================================================
// 6. Real-Time Status Change & Remediation Notifications Subsystem
// Real-time SSE stream with polling fallback & comprehensive notification center
// ==========================================================================
let sseConnection = null;
let notificationPollingTimer = null;
const SEEN_EVENTS_STORAGE_KEY = "trackscore_seen_status_events";
const DISMISSED_NOTIFS_STORAGE_KEY = "trackscore_dismissed_notifications";

const notificationsFeedState = {
  items: [],
  filter: "all", // "all" | "rejected" | "approved"
  searchQuery: "",
  isCollapsed: false,
  isLoading: false
};

function getSeenStatusEvents() {
  try {
    const raw = localStorage.getItem(SEEN_EVENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function markStatusEventSeen(eventId) {
  if (!eventId) return;
  const seen = getSeenStatusEvents();
  if (!seen.includes(eventId)) {
    seen.push(eventId);
    if (seen.length > 80) seen.shift();
    try {
      localStorage.setItem(SEEN_EVENTS_STORAGE_KEY, JSON.stringify(seen));
    } catch (e) {}
  }
}

function getDismissedNotificationIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIFS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function dismissSingleNotification(id) {
  if (!id) return;
  const dismissed = getDismissedNotificationIds();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    try {
      localStorage.setItem(DISMISSED_NOTIFS_STORAGE_KEY, JSON.stringify(dismissed));
    } catch (e) {}
  }
  renderNotificationCardsList();
  updateNotificationBadges();
}
window.dismissSingleNotification = dismissSingleNotification;

function clearAllNotifications() {
  const allIds = notificationsFeedState.items.map(it => it.evaluationId || it.id).filter(Boolean);
  try {
    localStorage.setItem(DISMISSED_NOTIFS_STORAGE_KEY, JSON.stringify(allIds));
  } catch (e) {}
  renderNotificationCardsList();
  updateNotificationBadges();
  showToast("All notifications marked as read");
}
window.clearAllNotifications = clearAllNotifications;

function formatNotificationTime(ts) {
  if (!ts) return "Recently";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "Recently";
    return d.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return "Recently";
  }
}

function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

function showAssignmentModal(evt) {
  if (!evt) return;
  const modal = document.getElementById("assignment-alert-modal");
  if (!modal) return;

  const compEl = document.getElementById("assign-modal-company");
  const devEl = document.getElementById("assign-modal-device");
  const pkgEl = document.getElementById("assign-modal-package");
  const dateEl = document.getElementById("assign-modal-date");
  const mgrEl = document.getElementById("assign-modal-manager");
  const notesCont = document.getElementById("assign-modal-notes-container");
  const notesEl = document.getElementById("assign-modal-notes");
  const startBtn = document.getElementById("btn-start-assigned-modal");
  const closeBtn = document.getElementById("btn-close-assignment-modal");
  const dismissBtn = document.getElementById("btn-dismiss-assignment-modal");

  const evalId = evt.evaluationId || evt.id;
  const comp = evt.companyName || "Assigned Customer";
  const device = evt.deviceModel || "Unspecified Model";
  const pkg = evt.packageName || "Package 2: Comprehensive Assessment (RM 6,000)";
  const date = evt.scheduledDate ? evt.scheduledDate : "Immediate / Flexible";
  const manager = evt.actor || evt.assignedBy || "MIROS Management";
  const instructions = evt.assignmentInstructions || evt.schedulingNotes || evt.note || "";

  if (compEl) compEl.textContent = comp;
  if (devEl) devEl.textContent = device;
  if (pkgEl) pkgEl.textContent = pkg;
  if (dateEl) dateEl.textContent = date;
  if (mgrEl) mgrEl.textContent = manager;

  if (notesCont && notesEl) {
    if (instructions) {
      notesEl.textContent = `"${instructions}"`;
      notesCont.style.display = "block";
    } else {
      notesCont.style.display = "none";
    }
  }

  const closeModal = () => {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (dismissBtn) dismissBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  if (startBtn) {
    startBtn.onclick = () => {
      closeModal();
      window.startAssignedEvaluation(evalId, comp, device, pkg);
    };
  }

  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}
window.showAssignmentModal = showAssignmentModal;

function showAssignmentModalFromFeed(id) {
  const item = notificationsFeedState.items.find(it => (it.evaluationId || it.id) === id);
  if (item) {
    showAssignmentModal(item);
  }
}
window.showAssignmentModalFromFeed = showAssignmentModalFromFeed;

function showStatusBanner(evt) {
  const banner = document.getElementById("assessor-status-banner");
  const textEl = document.getElementById("assessor-banner-text");
  const actionBtn = document.getElementById("btn-banner-action");
  if (!banner || !textEl) return;

  const isAssignment = evt.eventType === 'ASSIGNMENT' || evt.status === 'assigned' || evt.status === 'scheduled';
  const isApproved = evt.status === "approved";

  const comp = evt.companyName || "Evaluation";
  const model = evt.deviceModel ? ` (${evt.deviceModel})` : "";
  const reviewer = evt.reviewedBy ? ` by ${evt.reviewedBy}` : (evt.approvedBy ? ` by ${evt.approvedBy}` : (evt.rejectedBy ? ` by ${evt.rejectedBy}` : (evt.assignedBy ? ` by ${evt.assignedBy}` : "")));

  if (isAssignment) {
    banner.className = "status-notification-banner banner-assigned";
    banner.style.borderLeftColor = "#4F46E5";
    banner.style.background = "#EEF2FF";
    textEl.innerHTML = `<strong>🎯 New Assessment Assigned:</strong> ${escapeHtml(comp)}${escapeHtml(model)} was assigned to you${escapeHtml(reviewer)}.${evt.scheduledDate ? ' Scheduled for ' + escapeHtml(evt.scheduledDate) + '.' : ''} Ready to start evaluation.`;
    if (actionBtn) {
      actionBtn.style.display = "inline-flex";
      actionBtn.textContent = "▶ Start Assessment";
      actionBtn.style.background = "#4F46E5";
      actionBtn.style.borderColor = "#4338CA";
      actionBtn.style.color = "#FFFFFF";
      actionBtn.onclick = () => {
        const evalId = evt.evaluationId || evt.id;
        window.startAssignedEvaluation(evalId, evt.companyName, evt.deviceModel, evt.packageName);
        banner.style.display = "none";
      };
    }
  } else if (isApproved) {
    banner.className = `status-notification-banner banner-approved`;
    banner.style.borderLeftColor = "#16A34A";
    banner.style.background = "";
    const maxScoreVal = evt.rubricVersion === '1.0' ? '43.00' : '5.00';
    const scoreStr = evt.totalScore !== undefined ? ` [Score: ${Number(evt.totalScore).toFixed(2)}/${maxScoreVal}, ${evt.ratingLabel || 'Grade A'}]` : "";
    textEl.innerHTML = `<strong>Evaluation Approved:</strong> ${escapeHtml(comp)}${escapeHtml(model)}${scoreStr} was approved${escapeHtml(reviewer)}. Record is locked from further edits.`;
    if (actionBtn) {
      actionBtn.style.display = "inline-flex";
      actionBtn.textContent = "View Notifications";
      actionBtn.style.background = "";
      actionBtn.style.borderColor = "";
      actionBtn.style.color = "";
      actionBtn.onclick = () => {
        scrollToNotificationSection();
      };
    }
  } else {
    banner.className = `status-notification-banner banner-rejected`;
    banner.style.borderLeftColor = "#DC2626";
    banner.style.background = "";
    const reason = evt.rejectionReason ? ` — Reason: "${escapeHtml(evt.rejectionReason)}"` : "";
    textEl.innerHTML = `<strong>Action Required — Remediation:</strong> ${escapeHtml(comp)}${escapeHtml(model)} was rejected${escapeHtml(reviewer)}${reason}. Click to load and correct.`;
    if (actionBtn) {
      actionBtn.style.display = "inline-flex";
      actionBtn.textContent = "Load to Correct";
      actionBtn.style.background = "";
      actionBtn.style.borderColor = "";
      actionBtn.style.color = "";
      actionBtn.onclick = () => {
        loadAndScrollEvaluationForCorrection(evt.evaluationId);
        banner.style.display = "none";
      };
    }
  }

  banner.style.display = "flex";
}

function showStatusToast(evt) {
  const toastContainer = document.getElementById("status-toast-container");
  if (!toastContainer) return;

  const isAssignment = evt.eventType === 'ASSIGNMENT' || evt.status === 'assigned' || evt.status === 'scheduled';
  const isApproved = evt.status === "approved";
  const comp = evt.companyName || "Evaluation";
  const model = evt.deviceModel ? ` - ${evt.deviceModel}` : "";
  const evalId = evt.evaluationId || evt.id;

  const toast = document.createElement("div");
  toast.className = `status-toast ${isAssignment ? 'assigned toast-assigned' : (isApproved ? 'toast-approved' : 'toast-rejected')}`;

  if (isAssignment) {
    const manager = evt.actor || evt.assignedBy || "MIROS Manager";
    toast.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">
        <div style="font-size: 22px; line-height: 1;">🎯</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; font-size: 13px; color: #312E81; display: flex; align-items: center; gap: 6px;">
            New Assessment Assigned!
            <span style="font-size: 10px; background: #E0E7FF; color: #4338CA; padding: 1px 6px; border-radius: 4px; font-weight: 700;">MIROS</span>
          </div>
          <div style="font-size: 12.5px; font-weight: 600; color: #0F172A; margin-top: 2px;">
            ${escapeHtml(comp)}${escapeHtml(model)}
          </div>
          <div style="font-size: 11.5px; color: #4338CA; margin-top: 2px;">
            Assigned by ${escapeHtml(manager)}${evt.scheduledDate ? ' • Scheduled: ' + escapeHtml(evt.scheduledDate) : ''}
          </div>
          ${evt.assignmentInstructions ? `<div style="font-size: 11px; color: #475569; font-style: italic; margin-top: 3px; line-height: 1.3;">"${escapeHtml(evt.assignmentInstructions)}"</div>` : ''}
        </div>
        <button type="button" class="btn-toast-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #94A3B8; padding: 0 4px; line-height: 1;">&times;</button>
      </div>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #E0E7FF;">
        <button type="button" class="btn btn-secondary btn-sm btn-toast-details" style="font-size: 11px; padding: 4px 8px;">
          View Details
        </button>
        <button type="button" class="btn btn-primary btn-sm btn-toast-start" style="font-size: 11.5px; padding: 4px 12px; font-weight: 700; background: #4F46E5; border-color: #4338CA; color: #FFFFFF; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(79, 70, 229, 0.3);">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Start Assessment
        </button>
      </div>
    `;

    toast.querySelector(".btn-toast-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toast.remove();
    });

    toast.querySelector(".btn-toast-details")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showAssignmentModal(evt);
      toast.remove();
    });

    toast.querySelector(".btn-toast-start")?.addEventListener("click", (e) => {
      e.stopPropagation();
      window.startAssignedEvaluation(evalId, evt.companyName, evt.deviceModel, evt.packageName);
      toast.remove();
    });
  } else {
    let scoreDetailsHtml = "";
    if (isApproved && evt.totalScore !== undefined) {
      const maxScoreVal = evt.rubricVersion === '1.0' ? '43.00' : '5.00';
      const stars = evt.starsCount ? "★".repeat(evt.starsCount) : "";
      scoreDetailsHtml = `<div style="font-size: 11.5px; color: #166534; margin-top: 2px; font-weight: 600;">
        Score: ${Number(evt.totalScore).toFixed(2)}/${maxScoreVal} pts • ${escapeHtml(evt.ratingLabel || 'Grade A')} ${stars}
      </div>`;
    }

    toast.innerHTML = `
      <div style="font-size: 20px;">${isApproved ? '✅' : '❌'}</div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 700; font-size: 13px; color: #0F172A;">
          Evaluation ${isApproved ? 'Approved & Certified' : 'Rejected (Action Required)'}
        </div>
        <div style="font-size: 12px; color: #475569; margin-top: 2px;">
          ${escapeHtml(comp)}${escapeHtml(model)}
          ${scoreDetailsHtml}
          ${!isApproved && evt.rejectionReason ? `<div style="font-style: italic; color: #991B1B; margin-top: 2px;">"${escapeHtml(evt.rejectionReason)}"</div>` : ''}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        ${!isApproved ? `
          <button type="button" class="btn btn-primary btn-sm btn-toast-correct" style="font-size: 11.5px; padding: 4px 8px; white-space: nowrap;">
            Fix &amp; Resubmit
          </button>
        ` : `
          <button type="button" class="btn btn-secondary btn-sm btn-toast-view" style="font-size: 11.5px; padding: 4px 8px; white-space: nowrap;">
            View Feed
          </button>
        `}
        <button type="button" class="btn-toast-close" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #94A3B8;">&times;</button>
      </div>
    `;

    toast.querySelector(".btn-toast-close")?.addEventListener("click", () => {
      toast.remove();
    });

    if (!isApproved) {
      toast.querySelector(".btn-toast-correct")?.addEventListener("click", () => {
        loadAndScrollEvaluationForCorrection(evt.evaluationId);
        toast.remove();
      });
    } else {
      toast.querySelector(".btn-toast-view")?.addEventListener("click", () => {
        scrollToNotificationSection();
        toast.remove();
      });
    }
  }

  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }
  }, 12000);
}

function handleIncomingStatusEvent(evt) {
  if (!evt || (!evt.id && !evt.evaluationId)) return;
  evt.status = evt.status || evt.newStatus || (evt.eventType === 'ASSIGNMENT' ? 'assigned' : null);
  if (!evt.status) return;

  const isAssignment = evt.eventType === 'ASSIGNMENT' || evt.status === 'assigned' || evt.status === 'scheduled';
  const eventId = evt.id || `${evt.evaluationId}_${evt.status}_${evt.statusChangedAt || Date.now()}`;
  const seen = getSeenStatusEvents();
  if (!seen.includes(eventId)) {
    markStatusEventSeen(eventId);
    playNotificationChime();
    if (isAssignment) {
      showAssignmentModal(evt);
    }
    showStatusBanner(evt);
    showStatusToast(evt);
  }

  // Update in-memory feed items
  const evalId = evt.evaluationId || evt.id;
  const existingIdx = notificationsFeedState.items.findIndex(it => (it.evaluationId || it.id) === evalId);
  if (existingIdx >= 0) {
    notificationsFeedState.items[existingIdx] = { ...notificationsFeedState.items[existingIdx], ...evt };
  } else {
    notificationsFeedState.items.unshift(evt);
  }

  renderNotificationCardsList();
  updateNotificationBadges();
}

async function fetchNotificationsFeed() {
  if (!getAuthToken()) {
    notificationsFeedState.isLoading = false;
    return;
  }
  notificationsFeedState.isLoading = true;
  const syncEl = document.getElementById("notif-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span style="font-size: 11px; color: #F58220; font-weight: 600;">Syncing...</span>`;
  }

  try {
    const currentAssessorId = (document.getElementById("assessorId")?.value || "").trim();
    const currentAssessorName = (document.getElementById("assessorName")?.value || "").trim();
    const assessorParam = currentAssessorId || currentAssessorName;

    let url = `/.netlify/functions/get-notifications`;
    if (assessorParam) {
      url += `?assessorName=${encodeURIComponent(assessorParam)}`;
    }

    const res = await fetch(url, {
      headers: getAuthHeaders()
    });
    if (handleAuthError(res)) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success) {
      const liveEvents = Array.isArray(json.recentLiveEvents) ? json.recentLiveEvents : [];
      const dbNotifs = Array.isArray(json.notifications) ? json.notifications : [];

      // Check if any fresh events came in that need audio chime / toast / modal
      liveEvents.forEach(evt => {
        if (evt && evt.id) {
          const seen = getSeenStatusEvents();
          if (!seen.includes(evt.id)) {
            markStatusEventSeen(evt.id);
            playNotificationChime();
            const isAssignment = evt.eventType === 'ASSIGNMENT' || evt.status === 'assigned' || evt.status === 'scheduled';
            if (isAssignment) {
              showAssignmentModal(evt);
            }
            showStatusBanner(evt);
            showStatusToast(evt);
          }
        }
      });

      // Merge items, deduplicating by evaluationId or id
      const map = new Map();
      dbNotifs.forEach(n => {
        const key = n.evaluationId || n.id;
        if (key) map.set(key, n);
      });
      liveEvents.forEach(e => {
        const key = e.evaluationId || e.id;
        if (key) {
          if (map.has(key)) {
            map.set(key, { ...map.get(key), ...e });
          } else {
            map.set(key, e);
          }
        }
      });

      const merged = Array.from(map.values());
      // Sort newest first
      merged.sort((a, b) => {
        const tA = new Date(a.statusChangedAt || a.updatedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.statusChangedAt || b.updatedAt || b.createdAt || 0).getTime();
        return tB - tA;
      });

      notificationsFeedState.items = merged;
      renderNotificationCardsList();
      updateNotificationBadges();
    }
  } catch (err) {
    console.warn("Notifications feed fetch warning:", err);
  } finally {
    notificationsFeedState.isLoading = false;
    if (syncEl) {
      syncEl.innerHTML = `<span class="pulse-dot" style="display: inline-block; width: 6px; height: 6px; background: #10B981; border-radius: 50%; margin-right: 4px;"></span> Live Connected`;
    }
  }
}

function updateNotificationBadges() {
  const dismissed = getDismissedNotificationIds();
  const activeItems = notificationsFeedState.items.filter(it => {
    const id = it.evaluationId || it.id;
    return id && !dismissed.includes(id);
  });

  const allCount = activeItems.length;
  const assignedCount = activeItems.filter(it => it.status === "assigned" || it.eventType === "ASSIGNMENT" || it.status === "scheduled").length;
  const rejectedCount = activeItems.filter(it => it.status === "rejected").length;
  const approvedCount = activeItems.filter(it => it.status === "approved").length;

  const countAllEl = document.getElementById("notif-count-all");
  const countAssignedEl = document.getElementById("notif-count-assigned");
  const countRejEl = document.getElementById("notif-count-rejected");
  const countAppEl = document.getElementById("notif-count-approved");
  if (countAllEl) countAllEl.textContent = allCount;
  if (countAssignedEl) countAssignedEl.textContent = assignedCount;
  if (countRejEl) countRejEl.textContent = rejectedCount;
  if (countAppEl) countAppEl.textContent = approvedCount;

  // Header quick buttons
  const headerCountEl = document.getElementById("header-notifications-count");
  if (headerCountEl) headerCountEl.textContent = allCount;

  const navBadgeEl = document.getElementById("nav-notifications-badge");
  if (navBadgeEl) {
    if (assignedCount > 0) {
      navBadgeEl.style.display = "inline-flex";
      navBadgeEl.style.background = "#4F46E5";
      navBadgeEl.textContent = assignedCount;
    } else if (rejectedCount > 0) {
      navBadgeEl.style.display = "inline-flex";
      navBadgeEl.style.background = "#DC2626";
      navBadgeEl.textContent = rejectedCount;
    } else if (allCount > 0) {
      navBadgeEl.style.display = "inline-flex";
      navBadgeEl.style.background = "#0284C7";
      navBadgeEl.textContent = allCount;
    } else {
      navBadgeEl.style.display = "none";
    }
  }

  const actionPill = document.getElementById("notif-action-pill");
  const dotEl = document.getElementById("notif-unread-indicator-dot");
  if (actionPill) {
    if (assignedCount > 0) {
      actionPill.style.display = "inline-flex";
      actionPill.style.background = "#EEF2FF";
      actionPill.style.color = "#4338CA";
      actionPill.style.borderColor = "#C7D2FE";
      actionPill.textContent = `${assignedCount} New Task${assignedCount > 1 ? 's' : ''} Assigned`;
    } else if (rejectedCount > 0) {
      actionPill.style.display = "inline-flex";
      actionPill.style.background = "#FEE2E2";
      actionPill.style.color = "#991B1B";
      actionPill.style.borderColor = "#FECACA";
      actionPill.textContent = `${rejectedCount} Action${rejectedCount > 1 ? 's' : ''} Required`;
    } else {
      actionPill.style.display = "none";
    }
  }
  if (dotEl) {
    dotEl.style.display = (assignedCount > 0 || rejectedCount > 0 || allCount > 0) ? "block" : "none";
  }
}

function renderNotificationCardsList() {
  const container = document.getElementById("notification-cards-list");
  if (!container) return;

  const dismissed = getDismissedNotificationIds();
  const query = (notificationsFeedState.searchQuery || "").trim().toLowerCase();
  const filter = notificationsFeedState.filter;

  const visibleItems = notificationsFeedState.items.filter(it => {
    const id = it.evaluationId || it.id;
    if (id && dismissed.includes(id)) return false;

    if (filter === "assigned" && it.status !== "assigned" && it.eventType !== "ASSIGNMENT" && it.status !== "scheduled") return false;
    if (filter === "rejected" && it.status !== "rejected") return false;
    if (filter === "approved" && it.status !== "approved") return false;

    if (query) {
      const comp = String(it.companyName || "").toLowerCase();
      const model = String(it.deviceModel || "").toLowerCase();
      const aid = String(it.assessorId || "").toLowerCase();
      const aname = String(it.assessorName || "").toLowerCase();
      const reason = String(it.rejectionReason || "").toLowerCase();
      const instr = String(it.assignmentInstructions || "").toLowerCase();
      if (!comp.includes(query) && !model.includes(query) && !aid.includes(query) && !aname.includes(query) && !reason.includes(query) && !instr.includes(query)) {
        return false;
      }
    }
    return true;
  });

  if (visibleItems.length === 0) {
    const isFiltered = filter !== "all" || query.length > 0;
    container.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: #64748B;">
        <div style="font-size: 28px; margin-bottom: 8px;">${isFiltered ? '🔍' : '🔔'}</div>
        <div style="font-weight: 700; font-size: 13.5px; color: #1E293B;">
          ${isFiltered ? 'No matching review notifications found' : 'All Clear — No Pending Review Notifications'}
        </div>
        <div style="font-size: 12.5px; margin-top: 4px; max-width: 440px; margin-left: auto; margin-right: auto; line-height: 1.5;">
          ${isFiltered 
            ? 'Try clearing your search query or switching to another filter tab.'
            : 'All evaluations are currently in sync. When MIROS managers assign assessments or review your submissions, alerts will appear here instantly.'}
        </div>
      </div>
    `;
    return;
  }

  let html = "";
  visibleItems.forEach(item => {
    const evalId = item.evaluationId || item.id || "";
    const isAssignment = item.status === "assigned" || item.eventType === "ASSIGNMENT" || item.status === "scheduled";
    const isRejected = item.status === "rejected";
    const comp = item.companyName || "Untitled Company";
    const model = item.deviceModel || "Unspecified Model";
    const aid = item.assessorId || "";
    const timestampStr = formatNotificationTime(item.statusChangedAt || item.assignedAt || item.rejectedAt || item.approvedAt || item.createdAt);
    const reviewer = (isAssignment ? (item.actor || item.assignedBy) : (isRejected ? (item.rejectedBy || item.reviewedBy) : (item.approvedBy || item.reviewedBy))) || "MIROS Manager";

    if (isAssignment) {
      html += `
        <div class="notification-card-item is-assigned" id="notif-card-${escapeHtml(evalId)}">
          <div class="notif-card-header">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="notif-status-badge badge-assigned">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                New Assessment Assigned
              </span>
              <span class="notif-meta-text">
                Assigned by <strong>${escapeHtml(reviewer)}</strong> • ${escapeHtml(timestampStr)}
              </span>
            </div>
            <button type="button" class="btn-toast-close" title="Dismiss notification" onclick="dismissSingleNotification('${escapeHtml(evalId)}')" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #94A3B8; padding: 2px 6px;">&times;</button>
          </div>

          <div class="notif-card-title">
            ${escapeHtml(comp)} — ${escapeHtml(model)}
            ${aid ? `<span class="notif-assessor-badge" title="Assessor ID">Assessor: ${escapeHtml(aid)}</span>` : ''}
          </div>

          <div class="notif-assignment-callout">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
              <div><strong>Package:</strong> ${escapeHtml(item.packageName || 'Package 2: Comprehensive Assessment (RM 6,000)')}</div>
              ${item.scheduledDate ? `<div style="font-weight: 600; color: #4338CA;">Scheduled: ${escapeHtml(item.scheduledDate)}</div>` : ''}
            </div>
            ${item.assignmentInstructions ? `<div style="margin-top: 4px; font-style: italic; color: #334155;">Manager Notes: "${escapeHtml(item.assignmentInstructions)}"</div>` : ''}
            <div style="margin-top: 4px; font-size: 11.5px; color: #4F46E5; font-weight: 600;">Status: Ready for Evaluation</div>
          </div>

          <div class="notif-card-actions">
            <div class="notif-actions-left">
              <button type="button" class="btn btn-primary btn-sm" onclick="startAssignedEvaluation('${escapeHtml(evalId)}', '${escapeHtml(comp)}', '${escapeHtml(model)}', '${escapeHtml(item.packageName || '')}')" style="font-size: 12px; padding: 6px 14px; font-weight: 700; background: #4F46E5; border-color: #4338CA; color: #FFFFFF; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Start Assessment
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="showAssignmentModalFromFeed('${escapeHtml(evalId)}')" style="font-size: 12px; padding: 6px 12px;">
                View Details
              </button>
            </div>
            <span style="font-size: 11.5px; color: #4338CA; font-weight: 600;">1-Click Launch</span>
          </div>
        </div>
      `;
    } else if (isRejected) {
      html += `
        <div class="notification-card-item is-rejected" id="notif-card-${escapeHtml(evalId)}">
          <div class="notif-card-header">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="notif-status-badge badge-rejected">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                Action Required: Remediation
              </span>
              <span class="notif-meta-text">
                Reviewed by <strong>${escapeHtml(reviewer)}</strong> • ${escapeHtml(timestampStr)}
              </span>
            </div>
            <button type="button" class="btn-toast-close" title="Dismiss notification" onclick="dismissSingleNotification('${escapeHtml(evalId)}')" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #94A3B8; padding: 2px 6px;">&times;</button>
          </div>

          <div class="notif-card-title">
            ${escapeHtml(comp)} — ${escapeHtml(model)}
            ${aid ? `<span class="notif-assessor-badge" title="Assessor ID">Assessor: ${escapeHtml(aid)}</span>` : ''}
          </div>

          <div class="notif-rejection-callout">
            <strong>Rejection Reason &amp; Remediation Instructions:</strong><br/>
            "${escapeHtml(item.rejectionReason || "Criteria verification points or evidence requires assessor review and adjustment.")}"
          </div>

          <div class="notif-card-actions">
            <div class="notif-actions-left">
              <button type="button" class="btn btn-primary btn-sm" onclick="loadAndScrollEvaluationForCorrection('${escapeHtml(evalId)}')" style="font-size: 12px; padding: 5px 12px; font-weight: 700;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Fix &amp; Resubmit Form
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="viewNotificationLookupDetails('${escapeHtml(comp)}')" style="font-size: 12px; padding: 5px 10px;">
                Review Submission Record
              </button>
            </div>
            <span style="font-size: 11.5px; color: #DC2626; font-weight: 600;">Form unlocked for revision</span>
          </div>
        </div>
      `;
    } else {
      const score = typeof item.totalScore === "number" ? item.totalScore.toFixed(2) : (parseFloat(item.totalScore) || 0).toFixed(2);
      const rating = item.ratingLabel || "Grade A";
      const stars = item.starsCount ? "★".repeat(item.starsCount) : "";

      html += `
        <div class="notification-card-item is-approved" id="notif-card-${escapeHtml(evalId)}">
          <div class="notif-card-header">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="notif-status-badge badge-approved">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Certified: Approved
              </span>
              <span class="notif-meta-text">
                Approved by <strong>${escapeHtml(reviewer)}</strong> • ${escapeHtml(timestampStr)}
              </span>
            </div>
            <button type="button" class="btn-toast-close" title="Dismiss notification" onclick="dismissSingleNotification('${escapeHtml(evalId)}')" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #94A3B8; padding: 2px 6px;">&times;</button>
          </div>

          <div class="notif-card-title">
            ${escapeHtml(comp)} — ${escapeHtml(model)}
            ${aid ? `<span class="notif-assessor-badge" title="Assessor ID">Assessor: ${escapeHtml(aid)}</span>` : ''}
          </div>

          <div class="notif-approval-callout">
            <div>
              <strong>Certified Score:</strong> ${score} / ${item.rubricVersion === '1.0' ? '43.00' : '5.00'} pts
              ${rating ? `• <strong>${escapeHtml(rating)}</strong>` : ''}
              ${stars ? `<span style="color: #F59E0B; margin-left: 4px;">${stars}</span>` : ''}
            </div>
            <span style="font-size: 11.5px; color: #065F46; font-weight: 600;">Official MIROS Certified</span>
          </div>

          <div class="notif-card-actions">
            <div class="notif-actions-left">
              <button type="button" class="btn btn-secondary btn-sm" onclick="exportNotificationRecordPDF('${escapeHtml(evalId)}')" style="font-size: 12px; padding: 5px 10px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Download Certified PDF
              </button>
              <button type="button" class="btn btn-text btn-sm" onclick="dismissSingleNotification('${escapeHtml(evalId)}')" style="font-size: 12px; padding: 5px 8px; color: #64748B;">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

async function loadAndScrollEvaluationForCorrection(recordId) {
  if (typeof window.switchAssessorPortalTab === "function") {
    window.switchAssessorPortalTab("matrix");
  }
  await loadEvaluationForCorrection(recordId);
  const metaCard = document.getElementById("card-metadata");
  if (metaCard) {
    metaCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
window.loadAndScrollEvaluationForCorrection = loadAndScrollEvaluationForCorrection;

async function exportNotificationRecordPDF(recordId) {
  try {
    showToast("Retrieving certified evaluation record...");
    const res = await fetch(`/.netlify/functions/lookup-evaluation?id=${encodeURIComponent(recordId)}`, {
      headers: getAuthHeaders()
    });
    if (handleAuthError(res)) return;
    const result = await res.json();
    if (!res.ok || !result.success || !result.data || !result.data[0]) {
      showToast("Unable to load record for PDF generation", true);
      return;
    }
    // Load into state and display report
    await loadEvaluationForCorrection(recordId);
    generatePdfReport();
  } catch (e) {
    showToast("PDF generation error: " + e.message, true);
  }
}
window.exportNotificationRecordPDF = exportNotificationRecordPDF;

function viewNotificationLookupDetails(companyName) {
  openLookupModal();
  const input = document.getElementById("lookup-assessor-input");
  if (input) {
    input.value = companyName || "";
    lookupAssessorSubmissions(companyName);
  }
}
window.viewNotificationLookupDetails = viewNotificationLookupDetails;

function scrollToNotificationSection() {
  const section = document.getElementById("notification-section");
  const body = document.getElementById("notification-section-body");
  const collapseLabel = document.getElementById("notif-collapse-label");
  const collapseIcon = document.getElementById("notif-collapse-icon");

  if (section) {
    if (body && body.classList.contains("collapsed")) {
      body.classList.remove("collapsed");
      if (collapseLabel) collapseLabel.textContent = "Collapse";
      if (collapseIcon) collapseIcon.style.transform = "rotate(0deg)";
      notificationsFeedState.isCollapsed = false;
    }
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.classList.add("highlight-flash");
    setTimeout(() => {
      section.classList.remove("highlight-flash");
    }, 1800);
  }
}
window.scrollToNotificationSection = scrollToNotificationSection;

function toggleNotificationSectionCollapse() {
  const body = document.getElementById("notification-section-body");
  const collapseLabel = document.getElementById("notif-collapse-label");
  const collapseIcon = document.getElementById("notif-collapse-icon");
  const btn = document.getElementById("btn-toggle-notif-collapse");

  if (!body) return;
  const isCollapsed = body.classList.toggle("collapsed");
  notificationsFeedState.isCollapsed = isCollapsed;

  if (btn) btn.setAttribute("aria-expanded", String(!isCollapsed));
  if (collapseLabel) collapseLabel.textContent = isCollapsed ? "Expand" : "Collapse";
  if (collapseIcon) collapseIcon.style.transform = isCollapsed ? "rotate(180deg)" : "rotate(0deg)";
}

function setNotificationFilter(filter) {
  notificationsFeedState.filter = filter;
  document.querySelectorAll(".notif-filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === filter);
  });
  renderNotificationCardsList();
}

function initNotificationSection() {
  // Navigation & title quick jump buttons
  document.getElementById("btn-toggle-notification-section")?.addEventListener("click", scrollToNotificationSection);
  document.getElementById("btn-nav-notifications")?.addEventListener("click", scrollToNotificationSection);

  // Filter tabs
  document.getElementById("notif-filter-all")?.addEventListener("click", () => setNotificationFilter("all"));
  document.getElementById("notif-filter-assigned")?.addEventListener("click", () => setNotificationFilter("assigned"));
  document.getElementById("notif-filter-rejected")?.addEventListener("click", () => setNotificationFilter("rejected"));
  document.getElementById("notif-filter-approved")?.addEventListener("click", () => setNotificationFilter("approved"));

  // Refresh feed button
  document.getElementById("btn-refresh-notifications")?.addEventListener("click", () => {
    fetchNotificationsFeed();
    showToast("Notifications feed updated");
  });

  // Collapse / Expand toggle
  document.getElementById("btn-toggle-notif-collapse")?.addEventListener("click", toggleNotificationSectionCollapse);

  // Search input (debounced 300ms to prevent rapid DOM re-renders)
  const searchInput = document.getElementById("notif-search-input");
  if (searchInput) {
    let notifSearchTimer = null;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(notifSearchTimer);
      const val = e.target.value;
      notifSearchTimer = setTimeout(() => {
        notificationsFeedState.searchQuery = val;
        renderNotificationCardsList();
      }, 300);
    });
  }

  // Clear all button
  document.getElementById("btn-clear-all-notifs")?.addEventListener("click", clearAllNotifications);

  // Initial fetch
  fetchNotificationsFeed();
}

function initAssessorStatusListener() {
  document.getElementById("btn-dismiss-banner")?.addEventListener("click", () => {
    const banner = document.getElementById("assessor-status-banner");
    if (banner) banner.style.display = "none";
  });

  if (typeof EventSource !== "undefined") {
    try {
      const currentAssessorName = (document.getElementById("assessorName")?.value || "").trim();
      let sseUrl = `/.netlify/functions/status-stream`;
      if (currentAssessorName) sseUrl += `?assessorName=${encodeURIComponent(currentAssessorName)}`;

      sseConnection = new EventSource(sseUrl);

      sseConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "STATUS_EVENT" && data.event) {
            handleIncomingStatusEvent(data.event);
          } else if (data.status) {
            handleIncomingStatusEvent(data);
          }
        } catch (e) {}
      };

      sseConnection.onerror = () => {
        if (!notificationPollingTimer) {
          notificationPollingTimer = setInterval(fetchNotificationsFeed, 20000);
        }
      };
    } catch (e) {
      if (!notificationPollingTimer) {
        notificationPollingTimer = setInterval(fetchNotificationsFeed, 20000);
      }
    }
  } else {
    notificationPollingTimer = setInterval(fetchNotificationsFeed, 20000);
  }

  setTimeout(fetchNotificationsFeed, 1200);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      fetchNotificationsFeed();
    }
  });
}

// ==========================================================================
// 7. Initialization on DOMContentLoaded
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Check if we are on index.html (the evaluation form)
  const sectionAContainer = document.getElementById("sectionA-container");
  if (sectionAContainer) {
    renderCriteriaSection(SECTION_A_CRITERIA, "sectionA-container", "A");
    renderCriteriaSection(SECTION_B_CRITERIA, "sectionB-container", "B");

    // Event delegation on containers
    document.getElementById("evaluation-form")?.addEventListener("change", handleOptionChange);

    // Debounced autosave on metadata field inputs and changes
    ["companyName", "deviceModel", "packageName", "packageNameCustom", "assessorName", "assessorId", "assessmentDate"].forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.addEventListener("input", debouncedAutosave);
        el.addEventListener("change", debouncedAutosave);
      }
    });

    // Assessment Package dropdown and custom input handlers
    const packageSelectEl = document.getElementById("packageName");
    const packageCustomEl = document.getElementById("packageNameCustom");
    if (packageSelectEl) {
      packageSelectEl.addEventListener("change", (e) => {
        if (e.target.value === "Custom") {
          if (packageCustomEl) {
            packageCustomEl.style.display = "block";
            packageCustomEl.focus();
          }
        } else {
          if (packageCustomEl) {
            packageCustomEl.style.display = "none";
            packageCustomEl.value = "";
          }
        }
        captureMetadata();
        debouncedAutosave();
      });
    }
    if (packageCustomEl) {
      packageCustomEl.addEventListener("input", () => {
        captureMetadata();
        debouncedAutosave();
      });
    }

    // Check URL parameters for pre-filling evaluation (e.g. from Dashboard or Scheduled Customer)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const companyParam = urlParams.get("company");
      const deviceParam = urlParams.get("device");
      const packageParam = urlParams.get("package") || urlParams.get("pkg");
      const assessorParam = urlParams.get("assessor");

      if (companyParam && document.getElementById("companyName")) {
        document.getElementById("companyName").value = companyParam;
      }
      if (deviceParam && document.getElementById("deviceModel")) {
        document.getElementById("deviceModel").value = deviceParam;
      }
      if (packageParam) {
        setPackageSelectValue(packageParam);
      }
      if (assessorParam && document.getElementById("assessorName")) {
        document.getElementById("assessorName").value = assessorParam;
      }
      if (companyParam || deviceParam || packageParam) {
        captureMetadata();
      }
    } catch (err) {
      console.warn("Error parsing URL params:", err);
    }

    // Assessor ID auto-formatting and real-time validation handler
    const assessorIdEl = document.getElementById("assessorId");
    if (assessorIdEl) {
      assessorIdEl.addEventListener("input", (e) => {
        const formatted = sanitizeAndFormatAssessorId(e.target.value);
        if (formatted !== e.target.value) {
          e.target.value = formatted;
        }
        updateAssessorIdValidationUI();
        captureMetadata();
      });
      assessorIdEl.addEventListener("blur", () => {
        const formatted = sanitizeAndFormatAssessorId(assessorIdEl.value).trim();
        assessorIdEl.value = formatted;
        updateAssessorIdValidationUI();
        captureMetadata();
      });
      updateAssessorIdValidationUI();
    }

    // Check for existing draft in localStorage on page load
    checkExistingDraft();

    // Initial score calculation
    calculateScores();

    // Attach button handlers
    document.getElementById("btn-save-draft")?.addEventListener("click", () => saveDraftToStorage(true, false));
    document.getElementById("btn-save-draft-top")?.addEventListener("click", () => saveDraftToStorage(true, false));
    document.getElementById("btn-save-as-new-modal")?.addEventListener("click", saveDraftAsNew);
    document.getElementById("btn-my-drafts")?.addEventListener("click", () => openDraftsModal());
    document.getElementById("btn-my-drafts-top")?.addEventListener("click", () => openDraftsModal());
    document.getElementById("link-view-all-drafts")?.addEventListener("click", () => openDraftsModal());
    document.getElementById("btn-start-new-eval")?.addEventListener("click", startNewEvaluation);
    document.getElementById("btn-modal-new-eval")?.addEventListener("click", startNewEvaluation);
    document.getElementById("drafts-modal-close")?.addEventListener("click", closeDraftsModal);
    document.getElementById("btn-close-drafts")?.addEventListener("click", closeDraftsModal);
    document.getElementById("btn-dismiss-rubric-warning")?.addEventListener("click", hideRubricWarning);
    document.getElementById("btn-lookup-rejections")?.addEventListener("click", openLookupModal);
    document.getElementById("btn-pdf-report")?.addEventListener("click", generatePdfReport);
    document.getElementById("btn-save-evaluation")?.addEventListener("click", openSubmitConfirmModal);
    document.getElementById("btn-close-submit-confirm")?.addEventListener("click", closeSubmitConfirmModal);
    document.getElementById("btn-cancel-submit-confirm")?.addEventListener("click", closeSubmitConfirmModal);
    document.getElementById("btn-execute-submit")?.addEventListener("click", () => {
      closeSubmitConfirmModal();
      saveEvaluationToDatabase();
    });
    document.getElementById("btn-reset-form")?.addEventListener("click", resetEvaluationForm);
    document.getElementById("btn-demo-data")?.addEventListener("click", fillDemoData);

    // Lookup modal handlers
    document.getElementById("lookup-modal-close")?.addEventListener("click", closeLookupModal);
    document.getElementById("btn-close-lookup")?.addEventListener("click", closeLookupModal);
    document.getElementById("btn-do-lookup")?.addEventListener("click", () => {
      lookupAssessorSubmissions();
    });
    document.getElementById("lookup-assessor-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        lookupAssessorSubmissions();
      }
    });

    // Delegated drafts list click listener for robust action handling
    const draftsListContainer = document.getElementById("drafts-list-container");
    if (draftsListContainer) {
      draftsListContainer.addEventListener("click", (e) => {
        const resumeBtn = e.target.closest("[data-action='resume']");
        if (resumeBtn) {
          const draftId = resumeBtn.getAttribute("data-draft-id");
          if (draftId) handleResumeDraftClick(draftId);
          return;
        }

        const discardBtn = e.target.closest("[data-action='discard']");
        if (discardBtn) {
          const draftId = discardBtn.getAttribute("data-draft-id");
          if (draftId) handleDiscardDraftClick(draftId);
          return;
        }

        const confirmBtn = e.target.closest("[data-action='confirm-discard']");
        if (confirmBtn) {
          const draftId = confirmBtn.getAttribute("data-draft-id");
          if (draftId) discardDraft(draftId);
          return;
        }

        const cancelBtn = e.target.closest("[data-action='cancel-discard']");
        if (cancelBtn) {
          renderDraftsModal();
          return;
        }
      });
    }

    // Modal report viewer handlers
    document.getElementById("report-modal-close")?.addEventListener("click", closeReportModal);
    document.getElementById("btn-close-report-modal")?.addEventListener("click", closeReportModal);
    document.getElementById("btn-download-pdf-modal")?.addEventListener("click", () => downloadReportPdf(true));
    document.getElementById("btn-print-report")?.addEventListener("click", printCurrentReport);

    // Feature 5: Bulk Draft Export & Import handlers
    document.getElementById("btn-export-drafts")?.addEventListener("click", exportDraftsToJson);
    document.getElementById("btn-import-drafts")?.addEventListener("click", () => {
      document.getElementById("input-import-drafts")?.click();
    });
    document.getElementById("input-import-drafts")?.addEventListener("change", importDraftsFromJson);

    // Feature 2: Initialize real-time status change notification listener & notification feed section
    initAssessorStatusListener();
    initNotificationSection();

    // Feature 3: Initialize section progress UI
    updateSectionProgressUI();

    // Close on overlay backdrop click
    const draftsModal = document.getElementById("drafts-modal");
    if (draftsModal) {
      draftsModal.addEventListener("click", (e) => {
        if (e.target === draftsModal) {
          closeDraftsModal();
        }
      });
    }

    const reportModal = document.getElementById("report-modal");
    if (reportModal) {
      reportModal.addEventListener("click", (e) => {
        if (e.target === reportModal) {
          closeReportModal();
        }
      });
    }

    const lookupModal = document.getElementById("lookup-modal");
    if (lookupModal) {
      lookupModal.addEventListener("click", (e) => {
        if (e.target === lookupModal) {
          closeLookupModal();
        }
      });
    }

    const submitConfirmModal = document.getElementById("submit-confirm-modal");
    if (submitConfirmModal) {
      submitConfirmModal.addEventListener("click", (e) => {
        if (e.target === submitConfirmModal) {
          closeSubmitConfirmModal();
        }
      });
    }

    // Close on Escape key press
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDraftsModal();
        closeReportModal();
        closeLookupModal();
        closeSubmitConfirmModal();
      }
    });
    // Assessor Submissions search listener
    const submissionsSearchInput = document.getElementById("assessor-submissions-search");
    if (submissionsSearchInput) {
      let searchDebounceTimer = null;
      submissionsSearchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          if (typeof window.renderAssessorSubmissionsTable === "function") {
            window.renderAssessorSubmissionsTable(cachedAssessorSubmissions);
          }
        }, 200);
      });
    }
  }
});

// ==========================================================================
// 8. Assessor Portal Navigation & Submissions Repository
// ==========================================================================

let cachedAssessorSubmissions = [];

window.switchAssessorPortalTab = function(tabName) {
  const workbench = document.getElementById("evaluation-workbench-layout");
  const submissionsView = document.getElementById("assessor-submissions-view");
  const notifSection = document.getElementById("notification-section");
  const stickyBar = document.getElementById("sticky-score-bar");

  // Tab buttons
  const tabMatrix = document.getElementById("tab-btn-matrix");
  const tabSubmissions = document.getElementById("tab-btn-submissions");
  const tabNotifs = document.getElementById("tab-btn-notifications");
  const navEval = document.getElementById("nav-eval-form");
  const navSub = document.getElementById("nav-my-submissions");
  const navNotifs = document.getElementById("btn-nav-notifications");

  // Reset tab button styles
  [tabMatrix, tabSubmissions, tabNotifs].forEach(btn => {
    if (btn) {
      btn.classList.remove("active");
      btn.style.background = "#FFFFFF";
      btn.style.color = "#475569";
      btn.style.borderColor = "#CBD5E1";
      btn.style.fontWeight = "600";
    }
  });

  if (navEval) navEval.classList.remove("active");
  if (navSub) navSub.classList.remove("active");
  if (navNotifs) navNotifs.classList.remove("active");

  const titleBar = document.getElementById("page-title-bar");

  if (tabName === "submissions") {
    if (workbench) workbench.style.display = "none";
    if (stickyBar) stickyBar.style.display = "none";
    if (notifSection) notifSection.style.display = "none";
    if (titleBar) titleBar.style.display = "none";
    if (submissionsView) submissionsView.style.display = "block";

    if (tabSubmissions) {
      tabSubmissions.classList.add("active");
      tabSubmissions.style.background = "#F58220";
      tabSubmissions.style.color = "#FFFFFF";
      tabSubmissions.style.borderColor = "#F58220";
      tabSubmissions.style.fontWeight = "700";
    }
    if (navSub) navSub.classList.add("active");

    window.fetchAssessorSubmissions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (tabName === "notifications") {
    if (workbench) workbench.style.display = "none";
    if (stickyBar) stickyBar.style.display = "none";
    if (submissionsView) submissionsView.style.display = "none";
    if (titleBar) titleBar.style.display = "none";
    if (notifSection) notifSection.style.display = "block";

    if (tabNotifs) {
      tabNotifs.classList.add("active");
      tabNotifs.style.background = "#F58220";
      tabNotifs.style.color = "#FFFFFF";
      tabNotifs.style.borderColor = "#F58220";
      tabNotifs.style.fontWeight = "700";
    }
    if (navNotifs) navNotifs.classList.add("active");

    if (typeof fetchNotificationsFeed === "function") {
      fetchNotificationsFeed();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    // Default: 'matrix'
    if (workbench) workbench.style.display = "";
    if (stickyBar) stickyBar.style.display = "";
    if (submissionsView) submissionsView.style.display = "none";
    if (notifSection) notifSection.style.display = "none";
    if (titleBar) titleBar.style.display = "";

    if (tabMatrix) {
      tabMatrix.classList.add("active");
      tabMatrix.style.background = "#F58220";
      tabMatrix.style.color = "#FFFFFF";
      tabMatrix.style.borderColor = "#F58220";
      tabMatrix.style.fontWeight = "700";
    }
    if (navEval) navEval.classList.add("active");
  }
};

window.fetchAssessorSubmissions = async function(countOnly = false) {
  const tbody = document.getElementById("assessor-submissions-tbody");
  const countSpan = document.getElementById("assessor-submissions-count");
  const navBadge = document.getElementById("nav-submissions-badge");
  const statTotal = document.getElementById("assessor-stat-total");
  const statPending = document.getElementById("assessor-stat-pending");
  const statApproved = document.getElementById("assessor-stat-approved");
  const statRejected = document.getElementById("assessor-stat-rejected");

  if (!countOnly && tbody) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: #64748B;">Loading your evaluations...</td></tr>`;
  }

  try {
    const res = await fetch("/.netlify/functions/get-evaluations?limit=100&includeBreakdown=false", {
      headers: getAuthHeaders()
    });

    if (handleAuthError(res)) return;
    if (!res.ok) throw new Error("Failed to load submissions.");

    const data = await res.json();
    const records = Array.isArray(data.evaluations) ? data.evaluations : (Array.isArray(data) ? data : []);
    cachedAssessorSubmissions = records;

    // Update counters
    const totalCount = records.length;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    records.forEach(r => {
      const s = (r.status || "pending_review").toLowerCase();
      if (s === "approved" || s === "completed") approvedCount++;
      else if (s === "rejected" || s === "remediation_required") rejectedCount++;
      else pendingCount++;
    });

    if (countSpan) countSpan.textContent = totalCount;
    if (navBadge) navBadge.textContent = totalCount;
    if (statTotal) statTotal.textContent = totalCount;
    if (statPending) statPending.textContent = pendingCount;
    if (statApproved) statApproved.textContent = approvedCount;
    if (statRejected) statRejected.textContent = rejectedCount;

    if (!countOnly && tbody) {
      window.renderAssessorSubmissionsTable(records);
    }
  } catch (err) {
    console.error("Failed to fetch assessor submissions:", err);
    if (!countOnly && tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #DC2626;">Error loading submissions: ${escapeHtml(err.message || "Network error")}</td></tr>`;
    }
  }
};

window.startAssignedEvaluation = function(id, company, device, pkg) {
  // Hide assignment popup modal if active
  const assignModal = document.getElementById("assignment-alert-modal");
  if (assignModal) {
    assignModal.style.display = "none";
    assignModal.setAttribute("aria-hidden", "true");
  }

  if (typeof window.switchAssessorPortalTab === "function") {
    window.switchAssessorPortalTab("matrix");
  }
  const companyInput = document.getElementById("companyName");
  if (companyInput && company) {
    companyInput.value = company;
    companyInput.dispatchEvent(new Event("input", { bubbles: true }));
    companyInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const deviceInput = document.getElementById("deviceModel");
  if (deviceInput && device) {
    deviceInput.value = device;
    deviceInput.dispatchEvent(new Event("input", { bubbles: true }));
    deviceInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const pkgSelect = document.getElementById("packageName");
  if (pkgSelect && pkg) {
    if (pkg.toLowerCase().includes("package 2") || pkg.toLowerCase().includes("comprehensive")) {
      pkgSelect.value = "Package 2: Comprehensive Assessment (RM 6,000)";
    } else if (pkg.toLowerCase().includes("package 1") || pkg.toLowerCase().includes("standard")) {
      pkgSelect.value = "Package 1: Standard Assessment (RM 4,500)";
    }
    pkgSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Store active assigned registration / task link
  window._activeAssignedRegistrationId = id;

  const metaCard = document.getElementById("card-metadata");
  if (metaCard) {
    metaCard.scrollIntoView({ behavior: "smooth", block: "start" });
    metaCard.style.transition = "box-shadow 0.3s ease, border-color 0.3s ease";
    metaCard.style.borderColor = "#4F46E5";
    metaCard.style.boxShadow = "0 0 0 3px rgba(79, 70, 229, 0.3)";
    setTimeout(() => {
      metaCard.style.borderColor = "";
      metaCard.style.boxShadow = "";
    }, 2500);
  }
  if (typeof showToast === "function") {
    showToast(`🎯 Assessment started for ${company || "Assigned Customer"} (${device || "Device"}) — Scoring form loaded`);
  }
};

window.renderAssessorSubmissionsTable = function(records) {
  const tbody = document.getElementById("assessor-submissions-tbody");
  if (!tbody) return;

  const searchInput = document.getElementById("assessor-submissions-search");
  const query = (searchInput ? searchInput.value : "").toLowerCase().trim();

  const filtered = records.filter(r => {
    if (!query) return true;
    const comp = (r.companyName || r.metadata?.companyName || "").toLowerCase();
    const dev = (r.deviceModel || r.metadata?.deviceModel || "").toLowerCase();
    const ref = (r.submissionRef || r._id || "").toLowerCase();
    return comp.includes(query) || dev.includes(query) || ref.includes(query);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 16px; color: #64748B;">
          <div style="font-size: 15px; font-weight: 600; color: #1E293B; margin-bottom: 4px;">No evaluations found</div>
          <div style="font-size: 13px;">${query ? "No submissions match your search query." : "You have not submitted any evaluations yet."}</div>
          ${!query ? '<button type="button" class="btn btn-primary btn-sm" onclick="switchAssessorPortalTab(\'matrix\')" style="margin-top: 12px;">Start First Assessment</button>' : ''}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((r, idx) => {
    const id = r._id || r.id;
    const dateStr = r.assessmentDate || (r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB") : "-");
    const comp = escapeHtml(r.companyName || r.metadata?.companyName || "Unknown Company");
    const model = escapeHtml(r.deviceModel || r.metadata?.deviceModel || "Unknown Device");
    const pkg = escapeHtml(r.packageName || r.metadata?.packageName || "Comprehensive");
    const totalScore = Number(r.totalScore ?? r.scores?.total ?? 0).toFixed(2);
    const starRating = Number(r.starRating ?? r.scores?.starRating ?? 0).toFixed(1);
    const starsCount = Math.round(Number(starRating));
    let starsStr = "";
    for (let s = 1; s <= 5; s++) starsStr += s <= starsCount ? "★" : "☆";

    const status = (r.status || "pending_review").toLowerCase();
    const isAssigned = status === "registered" || status === "scheduled" || status === "assigned";
    const isRejected = status === "rejected" || status === "remediation_required";

    let statusBadge = "";
    if (isAssigned) {
      statusBadge = '<span class="status-badge" style="background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">🎯 Assigned by Manager</span>';
    } else if (status === "approved" || status === "completed") {
      statusBadge = '<span class="status-badge" style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">✔ Approved &amp; Certified</span>';
    } else if (isRejected) {
      statusBadge = '<span class="status-badge" style="background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">⚠ Remediation Required</span>';
    } else if (status === "pre_final_sent") {
      statusBadge = '<span class="status-badge" style="background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Pre-Final Issued</span>';
    } else if (status === "certificate_issued") {
      statusBadge = '<span class="status-badge" style="background: #F0FDF4; color: #166534; border: 1px solid #BBF7D0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Certificate Issued</span>';
    } else if (status === "payment_confirmed") {
      statusBadge = '<span class="status-badge" style="background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">Payment Confirmed</span>';
    } else {
      statusBadge = '<span class="status-badge" style="background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">⏳ Pending Manager Review</span>';
    }

    const scoreCol = isAssigned ? '<span style="color: #64748B; font-weight: 500; font-size: 12px; font-style: italic;">Pending Eval</span>' : `${totalScore} / 5.00`;
    const starsCol = isAssigned ? '<span style="color: #94A3B8;">-</span>' : starsStr;

    return `
      <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}; border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 12px; color: #475569; font-size: 12.5px; white-space: nowrap;">${dateStr}</td>
        <td style="padding: 10px 12px; font-weight: 600; color: #0F172A;">${comp}</td>
        <td style="padding: 10px 12px; color: #334155;">${model}</td>
        <td style="padding: 10px 12px; color: #64748B; font-size: 12px;">${pkg}</td>
        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #F58220;">${scoreCol}</td>
        <td style="padding: 10px 12px; text-align: center; font-size: 12.5px; color: #EAB308; white-space: nowrap;" title="${starRating} Stars">${starsCol}</td>
        <td style="padding: 10px 12px; text-align: center;">${statusBadge}</td>
        <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
          ${isAssigned ? `
            <button type="button" class="btn btn-primary btn-sm" onclick="startAssignedEvaluation('${escapeHtml(id)}', '${escapeHtml(comp)}', '${escapeHtml(model)}', '${escapeHtml(pkg)}')" style="font-size: 11.5px; padding: 4px 10px; font-weight: 700; background: #4F46E5; border-color: #4338CA; color: #FFFFFF;">
              Conduct Assessment
            </button>
          ` : (isRejected ? `
            <button type="button" class="btn btn-primary btn-sm" onclick="loadAndScrollEvaluationForCorrection('${escapeHtml(id)}')" style="font-size: 11.5px; padding: 4px 9px; font-weight: 700; margin-right: 6px;">
              Fix &amp; Resubmit
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="viewAssessorSubmissionReport('${escapeHtml(id)}')" style="font-size: 11.5px; padding: 4px 9px;">
              View Report
            </button>
          ` : `
            <button type="button" class="btn btn-secondary btn-sm" onclick="viewAssessorSubmissionReport('${escapeHtml(id)}')" style="font-size: 11.5px; padding: 4px 9px;">
              View Report
            </button>
          `)}
        </td>
      </tr>
    `;
  }).join("");
};

function generatePdfReportForRecord(record) {
  const companyName = record.companyName || record.metadata?.companyName || "Unknown Company";
  const deviceModel = record.deviceModel || record.metadata?.deviceModel || "Unknown Device";
  const packageName = record.packageName || record.metadata?.packageName || "Comprehensive";
  const assessorName = record.assessorName || record.metadata?.assessorName || "Assessor";
  const assessorId = record.assessorId || record.metadata?.assessorId || "ASR 0000";
  const assessmentDate = record.assessmentDate || record.metadata?.assessmentDate || new Date().toISOString().split("T")[0];

  const sectionA = Number(record.scores?.sectionA ?? record.sectionAScore ?? 0).toFixed(2);
  const sectionB = Number(record.scores?.sectionB ?? record.sectionBScore ?? 0).toFixed(2);
  const total = Number(record.scores?.total ?? record.totalScore ?? 0).toFixed(2);
  const starRating = Number(record.scores?.starRating ?? record.starRating ?? 0).toFixed(1);
  const starsCount = Math.round(Number(starRating));

  let starDisplay = "";
  for (let s = 1; s <= 5; s++) {
    starDisplay += s <= starsCount ? "★" : "☆";
  }

  const rawBreakdown = Array.isArray(record.breakdown) ? record.breakdown : [];
  let allCriteriaItems = [];
  if (rawBreakdown.length > 0) {
    let aCount = 0;
    let bCount = 0;
    allCriteriaItems = rawBreakdown.map(item => {
      const isB = (item.section || "").toUpperCase() === "B";
      const num = isB ? ++bCount : ++aCount;
      return {
        sec: isB ? "B" : "A",
        num,
        name: item.name || "",
        selectedOption: item.selectedOption || "None (0)",
        points: Number(item.points || 0)
      };
    });
  } else {
    SECTION_A_CRITERIA.forEach((crit, idx) => {
      allCriteriaItems.push({
        sec: "A",
        num: idx + 1,
        name: crit.name,
        selectedOption: "Verified",
        points: (Number(sectionA) / 24).toFixed(3)
      });
    });
    SECTION_B_CRITERIA.forEach((crit, idx) => {
      allCriteriaItems.push({
        sec: "B",
        num: idx + 1,
        name: crit.name,
        selectedOption: "Verified",
        points: (Number(sectionB) / 9).toFixed(3)
      });
    });
  }

  const leftColumnItems = allCriteriaItems.slice(0, 17);
  const rightColumnItems = allCriteriaItems.slice(17);

  const renderColumnRows = (itemsList) => itemsList.map((item, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
      <td style="padding: 2.5px 4px; border-bottom: 1px solid #E2E8F0; font-size: 8px; text-align: center; color: #64748B; font-weight: 700;">
        ${item.sec}${item.num}
      </td>
      <td style="padding: 2.5px 5px; border-bottom: 1px solid #E2E8F0; font-size: 8px; font-weight: 600; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">
        ${escapeHtml(item.name)}
      </td>
      <td style="padding: 2.5px 5px; border-bottom: 1px solid #E2E8F0; font-size: 7.5px; color: ${item.points > 0 ? (item.sec === 'A' ? '#C2410C' : '#1D4ED8') : '#64748B'}; font-weight: ${item.points > 0 ? '700' : '400'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">
        ${escapeHtml(item.selectedOption)}
      </td>
      <td style="padding: 2.5px 4px; border-bottom: 1px solid #E2E8F0; font-size: 8px; text-align: right; font-weight: 700; color: #0F172A;">
        +${Number(item.points).toFixed(2)}
      </td>
    </tr>
  `).join("");

  return `
    <div id="pdf-report-content" style="width: 794px; min-height: 1120px; padding: 22px 28px; background: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0F172A; box-sizing: border-box; position: relative;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #F58220; padding-bottom: 8px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="/TrackScore_Logo.svg" alt="TrackScore" style="height: 32px; width: auto;" />
          <div style="border-left: 1.5px solid #CBD5E1; padding-left: 10px;">
            <div style="font-size: 11px; font-weight: 800; color: #0F172A; letter-spacing: 0.05em; text-transform: uppercase;">Telematics Compliance Assessment</div>
            <div style="font-size: 8.5px; color: #64748B;">Official Technical Audit Report</div>
          </div>
        </div>
        <div style="text-align: right; font-size: 8.5px; color: #64748B; line-height: 1.3;">
          <div style="font-weight: 700; color: #0F172A; font-size: 9.5px;">Malaysian Institute of Road Safety Research</div>
          <div>Telematics Verification Division</div>
          <div>Ref: <strong>${escapeHtml(record.submissionRef || record._id || 'TS-EVAL')}</strong></div>
        </div>
      </div>

      <!-- Metadata Box -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 18%; padding: 2px 4px; font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase;">Company:</td>
            <td style="width: 32%; padding: 2px 4px; font-size: 10px; font-weight: 700; color: #0F172A;">${escapeHtml(companyName)}</td>
            <td style="width: 18%; padding: 2px 4px; font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase;">Date:</td>
            <td style="width: 32%; padding: 2px 4px; font-size: 10px; font-weight: 700; color: #0F172A;">${escapeHtml(assessmentDate)}</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase;">Device Model:</td>
            <td style="padding: 2px 4px; font-size: 10px; font-weight: 700; color: #0F172A;">${escapeHtml(deviceModel)}</td>
            <td style="padding: 2px 4px; font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase;">Assessor:</td>
            <td style="padding: 2px 4px; font-size: 10px; font-weight: 700; color: #0F172A;">${escapeHtml(assessorName)} (${escapeHtml(assessorId)})</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase;">Package:</td>
            <td style="padding: 2px 4px; font-size: 10px; font-weight: 700; color: #0F172A;">${escapeHtml(packageName)}</td>
            <td style="padding: 2px 4px; font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase;">Status:</td>
            <td style="padding: 2px 4px; font-size: 10px; font-weight: 700; color: #F58220; text-transform: uppercase;">${escapeHtml(record.status || 'Verified')}</td>
          </tr>
        </table>
      </div>

      <!-- Score Summary Table -->
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #1A1A1A; margin-bottom: 10px;">
        <thead>
          <tr style="background-color: #1A1A1A; color: #FFFFFF;">
            <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%;">Section A Score</th>
            <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%;">Section B Score</th>
            <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%; color: #F58220;">Total Score</th>
            <th style="padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 700; width: 25%;">Star Rating</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; font-size: 11px; font-weight: 700; border-right: 1px solid #E2E8F0;">${sectionA} / 3.50</td>
            <td style="padding: 6px 8px; font-size: 11px; font-weight: 700; border-right: 1px solid #E2E8F0;">${sectionB} / 1.50</td>
            <td style="padding: 6px 8px; font-size: 13px; font-weight: 800; color: #F58220; border-right: 1px solid #E2E8F0;">${total} / 5.00</td>
            <td style="padding: 6px 8px; font-size: 11px; font-weight: 700; color: #EAB308;">${starDisplay} (${starRating} ★)</td>
          </tr>
        </tbody>
      </table>

      <!-- Dual-Column Breakdown Matrix -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
        <tr>
          <td style="width: 49.5%; vertical-align: top; padding-right: 4px;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1;">
              <thead>
                <tr style="background-color: #1A1A1A; color: #FFFFFF;">
                  <th style="padding: 3px 4px; font-size: 7.5px; font-weight: 700; width: 10%; text-align: center;">#</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 48%; text-align: left;">Criterion (Sec A)</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 26%; text-align: left;">Selected Option</th>
                  <th style="padding: 3px 4px; font-size: 7.5px; font-weight: 700; width: 16%; text-align: right;">Pts</th>
                </tr>
              </thead>
              <tbody>
                ${renderColumnRows(leftColumnItems)}
              </tbody>
            </table>
          </td>
          <td style="width: 49.5%; vertical-align: top; padding-left: 4px;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1;">
              <thead>
                <tr style="background-color: #1A1A1A; color: #FFFFFF;">
                  <th style="padding: 3px 4px; font-size: 7.5px; font-weight: 700; width: 10%; text-align: center;">#</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 48%; text-align: left;">Criterion (Sec A/B)</th>
                  <th style="padding: 3px 5px; font-size: 7.5px; font-weight: 700; width: 26%; text-align: left;">Selected Option</th>
                  <th style="padding: 3px 4px; font-size: 7.5px; font-weight: 700; width: 16%; text-align: right;">Pts</th>
                </tr>
              </thead>
              <tbody>
                ${renderColumnRows(rightColumnItems)}
              </tbody>
            </table>
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <div style="border-top: 1px solid #E2E8F0; padding-top: 6px; font-size: 8px; color: #64748B; display: flex; justify-content: space-between;">
        <div>
          <span style="font-weight: 700; color: #0F172A;">TrackScore Assessor Evaluation Matrix</span> • MIROS Telematics Standards
        </div>
        <div>
          Official System Archive: <strong>${new Date().toLocaleDateString("en-GB")}</strong>
        </div>
      </div>
    </div>
  `;
}

window.viewAssessorSubmissionReport = async function(recordId) {
  try {
    showToast("Loading evaluation record report...");
    const res = await fetch(`/.netlify/functions/lookup-evaluation?id=${encodeURIComponent(recordId)}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error("Could not retrieve evaluation details.");
    const data = await res.json();
    const record = data.evaluation || (Array.isArray(data.records) ? data.records[0] : (Array.isArray(data.data) ? data.data[0] : data));
    if (!record) throw new Error("Record not found.");

    const reportHtml = generatePdfReportForRecord(record);
    const container = document.getElementById("report-document-wrapper");
    const modal = document.getElementById("report-modal");
    if (container && modal) {
      container.innerHTML = reportHtml;
      currentReportHtml = reportHtml;
      currentReportFilename = `TrackScore-Assessment-${(record.companyName || "Report").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      modal.classList.add("active");
    }
  } catch (err) {
    console.error("Failed to view submission report:", err);
    showToast("Error loading report: " + err.message, true);
  }
};
window.TrackScore = {
  assessmentState,
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  calculateScores,
  updateSectionProgressUI,
  generatePdfReport,
  downloadReportPdf,
  printCurrentReport,
  closeReportModal,
  saveEvaluationToDatabase,
  getDrafts,
  openDraftsModal,
  closeDraftsModal,
  startNewEvaluation,
  restoreDraft,
  discardDraft,
  handleDiscardDraftClick,
  handleResumeDraftClick,
  exportDraftsToJson,
  importDraftsFromJson
};