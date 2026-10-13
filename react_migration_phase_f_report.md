# Phase F Migration Report: Vendor Portal React Migration

**Date:** 13 October 2026  
**System:** TrackScore Commercial Telematics Compliance Platform  
**Scope:** Phase F — Vendor Frontend Migration to React (`/react/vendor.html`)  
**Status:** COMPLETE & VERIFIED WORKING

---

## 1. Executive Summary & Verification Metrics

Phase F successfully migrated the entire Vendor portal and customer-facing compliance workflows from legacy vanilla HTML/JS (`vendor-portal.html`) into an isolated, single-bundle React application mounted at `/react/vendor.html`. All legacy pages, Manager workflows (Phases A–D), Assessor workbenches (Phase E), server-side evaluation lifecycles, immutable version stores, and strict data confidentiality boundaries have been verified without a single regression.

| Metric | Phase E Baseline | Phase F Final Verified Result | Delta / Status |
|---|---|---|---|
| **Unit & Integration Test Suite** | 291 passed (37 suites, 0 fails) | **313 passed (45 suites, 0 fails)** | +22 tests across 8 new suites, 100% green |
| **TypeScript / React Lint** | 0 errors | **0 errors** (`tsc --noEmit && tsc -p tsconfig.react.json`) | Clean |
| **Production Build** | Passes cleanly | **Passes cleanly** (isolated single bundles for manager, assessor, vendor) | Clean |
| **Multi-Phase Browser Checks** | 94 passed | **104 passed (Phases A, B, C, D, E, F)** | +10 browser checks, 100% green |
| **Unexpected Console Errors** | 0 | **0** | Clean |
| **Unexpected HTTP Errors** | 0 | **0** | Clean |
| **Legacy Frontend Fallback** | 8 legacy pages operational | **8 legacy pages preserved intact** | Preserved |
| **Payment Workflow** | Retired (`410 Gone`) | **Retired (`410 Gone`)** | Preserved |
| **Confidential Secrets in DOM/API** | 0 leaked | **0 leaked (Sentinel secrets verified)** | Strict isolation |

---

## 2. Migrated Vendor Capabilities

### A. Vendor Dashboard (`#/dashboard`)
- High-level compliance KPI metrics: Active Evaluations, Approved, Action Required, Certificates Ready.
- Real-time SLA commitment countdowns and on-track status tracking.
- Linked evaluation list with model metadata, package information, and direct link to details.
- Singular Server-Sent Events (SSE) connection updating metrics reactively.

### B. My Assessments Repository (`#/assessments`) & Detail (`#/assessments/:id`)
- Authoritative evaluation list strictly restricted to the authenticated vendor's `linkedRegistrationIds`.
- Safe assessment detail workspace displaying evaluation lifecycle progression, device specifications, package scope, invoice reference, and attached files.
- IDOR protected: attempting to navigate to an unowned assessment renders a safe "Assessment Not Found" view with zero data leakage.

### C. Visual Lifecycle Stepper Progression
- 8-stage visual progression stepper (`registered` → `scheduled` → `in_progress` → `pending_review` → `rejected` → `approved` → `certificate_preparation` → `certificate_issued` → `completed`).
- Contextual state badges reflecting current progress with human-readable timestamps.

### D. Required Actions Queue (`#/actions`)
- Dedicated action queue surfacing remediation requests (`rejected`, `remediation_required`).
- Displays Manager remediation feedback banner (`rejectionReason`) specifying required corrections.
- Direct modal launcher for responding to revisions.

### E. Documents & Supporting Evidence Repository (`#/documents`)
- Complete table of supporting documentation attached to the vendor's assessments.
- Displays document category labels, filenames, file sizes, and upload timestamps.
- Filters out internal documents; payment proof uploads remain permanently retired.

### F. Evidence Document Upload & Storage Modal
- Modal dialog allowing vendors to upload technical evidence files (`POST /.netlify/functions/vendor-documents`).
- Strict client- and server-side validation: $\le 10\text{MB}$ size limit, MIME validation (`application/pdf`, images, text, word documents).
- Disallowed file types (e.g., executables) rejected server-side with 400 Bad Request.
- Uploaded files stored safely in `.uploads/` with anti-traversal protection.

### G. Secure Document Download & Deletion
- Secure document streaming via `GET /.netlify/functions/vendor-documents?action=download` with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Deletion permissions: vendors can delete uploaded documents unless they have transitioned to `accepted`.

### H. Revision Response & Resubmission (`POST /.netlify/functions/vendor-resubmit`)
- Revision modal capturing remediation notes and updated device model information.
- Creates an immutable snapshot in `assessment_versions` with action `RESUBMISSION_BY_VENDOR`.
- Transitions evaluation status back to `submitted` for Manager review.
- Increments version number ($v1 \to v2$) without overwriting historical version records.

### I. Official Compliance Certificates Repository (`#/certificates`)
- Official certificates card displaying issued MIROS endorsement certificates.
- Visible only when evaluation status has reached `certificate_issued` or `completed` with a registered `certificateNumber`.
- Displays authorized endorsement signatory and official issue dates.

### J. Official Certificate PDF Download Reuse
- Seamlessly dynamically loads proven `/certificate-pdf.js` canvas engine.
- Reuses exact html2canvas and jsPDF rendering logic with official MIROS branding and QR code.
- Download button disabled until official DGO signature is recorded.

### K. Public Certificate Online Verification Link
- Direct external link to `/verify-certificate.html?cert=:certificateNumber`.
- Verifies public certificate validity against backend registry while omitting private vendor and internal assessor data.

### L. Company Profile Management (`#/profile`)
- Form allowing vendors to inspect and update contact details: `contactPerson`, `contactPhone`, `officeAddress`, `state`.
- Strict field allowlist: attempting to alter email, login email, or linked IDs is strictly blocked.
- Responsive success banner with no component unmounting or state loss on background refresh.

### M. Secure Password Change & Session Management
- Dedicated tab in Company Profile for updating passwords (`POST /.netlify/functions/vendor-profile`).
- Requires valid current password verified against bcrypt hash on the server.
- Enforces minimum 8 characters and confirmation match.
- Clean session teardown on logout.

### N. Real-Time Status Stream (SSE)
- Singular `EventSource` connection to `GET /.netlify/functions/status-stream?token=:token`.
- Event stream strictly scoped to evaluations owned by the vendor.
- Automatic reconnect and cleanup on unmount/logout.

---

## 3. Strict Security & Confidentiality Boundaries Verified

1. **Strict Data Confidentiality Mandate:**
   - Evaluated using 6 sentinel secrets (`SECRET_ASSESSOR`, `SECRET_MANAGER`, `SECRET_RISK`, `SECRET_WORKLOAD`, `SECRET_AUDIT`, `SECRET_OTHER_VENDOR`).
   - Browser DOM text and API network payloads verified to contain **zero internal assessor remarks, manager review notes, risk/anomaly scores, assessor workload, internal audit identifiers, or competitor records**.
2. **Cross-Vendor Data Isolation (IDOR Prevention):**
   - Vendor A is strictly restricted to records listed in `linkedRegistrationIds`.
   - Direct API queries or navigation to Vendor B records return 403 Forbidden.
3. **Payment Retirement Invariant:**
   - All payment submission and verification endpoints remain permanently retired (`410 Gone`).
   - Zero payment buttons, FPX links, or proof upload inputs exist in the React Vendor UI.
4. **Dedicated Single-Bundle Isolation:**
   - `vite.react.config.ts` builds 3 independent bundles:
     - `dist/react/assets/manager-[hash].js`
     - `dist/react/assets/assessor-[hash].js`
     - `dist/react/assets/vendor-[hash].js`
   - Zero shared chunks, strictly fulfilling single-bundle script tag assertions.
5. **Role-Based Access Control (RBAC):**
   - Manager users visiting `/react/vendor.html` are redirected to `/react/manager.html`.
   - Assessor users visiting `/react/vendor.html` are redirected to `/react/assessor.html`.
   - Unauthenticated visitors are redirected to `/login.html`.
6. **Responsive Layouts Across All 5 Standard Viewports:**
   - Verified zero horizontal overflow and full usability across $1920\times1080$, $1366\times768$, $1280\times800$, $768\times1024$, and $390\times844$.

---

## 4. Verification Evidence & Commands

### A. Full Test Suite Execution
```bash
npm test
```
**Result:** 313 passed, 45 suites, 0 failures.

### B. TypeScript / Lint Verification
```bash
npm run lint
```
**Result:** 0 errors across standard and React TypeScript configurations.

### C. Multi-Target Production Build
```bash
npm run build
```
**Result:** Successfully compiled `dist/react/manager.html`, `dist/react/assessor.html`, `dist/react/vendor.html`, and `build/server.cjs`.

### D. End-to-End Multi-Phase Browser Suite
```bash
TRACKSCORE_PLAYWRIGHT_MODULE=/tmp/trackscore-audit-tools/node_modules/playwright-core/index.mjs \
TRACKSCORE_BROWSER_EXECUTABLE=/home/hizalhaziq/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
node scripts/react-manager-browser.mjs --phase-b --phase-c --phase-d --phase-e --phase-f
```
**Result:** 104 checks passed, 0 failures, 0 unexpected console errors, 0 unexpected HTTP errors.

