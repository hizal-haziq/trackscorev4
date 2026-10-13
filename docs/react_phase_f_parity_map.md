# TrackScore React Migration — Phase F Parity Map: Vendor Portal

## Overview
This document tracks the migration of the Vendor frontend into React (`/react/vendor.html`).
It establishes the contracts, data protection boundaries, ownership enforcement rules, and parity status with the legacy Vendor portal (`vendor-portal.html`).

---

## Security & Data Confidentiality Boundary Mandate

A Vendor account must **NEVER** receive, inspect, or render unauthorized internal data:
- **Assessor Internal Criterion Comments:** Strictly excluded from vendor responses.
- **Manager Internal Review Notes:** Only the explicit `rejectionReason` (intended for remediation feedback) is vendor-visible.
- **Risk & Anomaly Scores:** Strictly blocked from vendor endpoints (`get-assessment-risk` rejects vendor JWTs with 403).
- **Assessor Workload & Assignment:** Assessor IDs and workload counts are omitted from vendor records.
- **Internal Audit Trails & Internal Comments:** `add-comment` and internal peer review threads are strictly excluded.
- **Account & Cryptographic Metadata:** `passwordHash`, `JWT_SECRET`, and sensitive account fields are strictly excluded.
- **Cross-Vendor Data Isolation (IDOR Prevention):** Vendors can only access evaluations listed in their authoritative `linkedRegistrationIds`. Direct object queries for other vendor IDs return 403 Forbidden.

---

## Feature Parity & Contract Matrix

| Feature # | Feature Description | Legacy Source / Handler | API Endpoint & Method | Ownership & Confidentiality Rules | React Replacement | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | **Vendor Dashboard** | `vendor-portal.html`<br>`loadVendorData()` | `GET /.netlify/functions/vendor-portal-data` | JWT `role: 'vendor'`. Authoritative lookup via `linkedRegistrationIds`. Returns company profile summary & linked evaluations. Internal rubrics/comments stripped. | `src/pages/vendor/VendorDashboard.tsx`<br>`src/services/vendorAssessments.ts` | **VERIFIED** |
| **F-02** | **My Assessments Repository** | `vendor-portal.html`<br>`renderEvaluations()` | `GET /.netlify/functions/vendor-portal-data` | Only evaluations strictly matching vendor's `linkedRegistrationIds`. Excludes assessor workload, internal rubrics, risk, and peer review. | `src/pages/vendor/VendorAssessments.tsx`<br>`src/components/vendor/VendorAssessmentCard.tsx` | **VERIFIED** |
| **F-03** | **Assessment Status & Progress** | `vendor-portal.html`<br>`LIFECYCLE_STAGES` | `GET /.netlify/functions/vendor-portal-data?id=:id` | Stepper visualization across standard stages (`registered` → `scheduled` → `in_progress` → `pending_review` → `approved` → `certificate_preparation` → `certificate_issued` → `completed`). | `src/pages/vendor/VendorAssessmentDetail.tsx`<br>`src/components/vendor/LifecycleStepper.tsx` | **VERIFIED** |
| **F-04** | **Required Actions Queue** | `vendor-portal.html`<br>`renderPriorityAlerts()` | `GET /.netlify/functions/vendor-portal-data` | Surfaces pending remediation feedback (`rejectionReason` / `rejected` status) requiring vendor response. | `src/pages/vendor/VendorRequiredActions.tsx`<br>`src/components/vendor/RequiredActionCard.tsx` | **VERIFIED** |
| **F-05** | **Registration & Package Context** | `vendor-portal.html`<br>Invoice & Package boxes | `GET /.netlify/functions/vendor-portal-data` | Surfaces `deviceModel`, `packageName`, invoice number, SLA commitment. Payment workflow remains retired (`410 Gone`); no payment actions exposed. | `src/components/vendor/VendorAssessmentCard.tsx`<br>`src/pages/vendor/VendorAssessmentDetail.tsx` | **VERIFIED** |
| **F-06** | **Documents & Evidence Repository** | `vendor-portal.html`<br>`openDocumentsModal()` | `GET /.netlify/functions/vendor-documents?evaluationId=:id` | Authenticated vendor JWT. Documents filtered to strip `payment_proof`. Returns metadata only (name, category, size, upload date). | `src/pages/vendor/VendorDocuments.tsx`<br>`src/components/vendor/DocumentList.tsx` | **VERIFIED** |
| **F-07** | **Evidence Document Upload** | `vendor-portal.html`<br>`#form-upload-doc` | `POST /.netlify/functions/vendor-documents`<br>`{ action: 'upload', evaluationId, name, category, fileType, fileData, notes }` | Max 10MB limit. Allowed MIME: PDF, PNG, JPG, WEBP, DOC, DOCX, TXT. Sanitized filenames stored in `.uploads/doc_*.bin`. Anti-traversal protection. Rejects `payment_proof` (400). | `src/components/vendor/EvidenceUploadModal.tsx`<br>`src/services/vendorDocuments.ts` | **VERIFIED** |
| **F-08** | **Document Download & Delete** | `vendor-portal.html`<br>`downloadDocument()`<br>`deleteDocument()` | `GET /.netlify/functions/vendor-documents?action=download&evaluationId=:id&docId=:docId`<br>`POST /.netlify/functions/vendor-documents`<br>`{ action: 'delete', evaluationId, docId }` | Authenticated stream download with `Content-Disposition: attachment` and `nosniff`. Cross-vendor downloads denied with 403. Vendors cannot delete `accepted` documents. | `src/services/vendorDocuments.ts`<br>`src/components/vendor/DocumentList.tsx` | **VERIFIED** |
| **F-09** | **Changes Requested / Revision Response** | `vendor-portal.html`<br>`#form-resubmit` | `POST /.netlify/functions/vendor-resubmit`<br>`{ evaluationId, deviceModel, responseNotes }` | Permitted only when `status === 'rejected'` or `rejectionReason` present. Creates immutable snapshot in `assessment_versions` with action `RESUBMISSION_BY_VENDOR`. Transitions status to `submitted`. | `src/components/vendor/VendorResubmitModal.tsx`<br>`src/services/vendorAssessments.ts` | **VERIFIED** |
| **F-10** | **Certificates Repository & Visibility** | `vendor-portal.html`<br>`certBannerHtml` | `GET /.netlify/functions/vendor-portal-data` | Certificate details visible only when status is `certificate_issued` or `completed` with assigned `certificateNumber`. | `src/pages/vendor/VendorCertificates.tsx`<br>`src/components/vendor/VendorCertificateCard.tsx` | **VERIFIED** |
| **F-11** | **Certificate PDF Generation** | `vendor-portal.html`<br>`downloadOfficialCertificate()` | Reuses `/certificate-pdf.js`<br>`window.downloadTrackScoreCertificatePdf(record)` | Available only if signed (`signedDate && signedBy`). Reuses proven canvas/jsPDF rendering with QR code. Single-page A4 format. | `src/utils/vendorCertificate.ts`<br>`src/components/vendor/VendorCertificateCard.tsx` | **VERIFIED** |
| **F-12** | **Public Certificate Verification Link** | `vendor-portal.html`<br>`btn-verify-cert` | Link to `/verify-certificate.html?cert=:certNumber` | Regression-tested link to public verification portal. Omits private vendor notes and assessor commentary. | `src/components/vendor/VendorCertificateCard.tsx` | **VERIFIED** |
| **F-13** | **Company Profile Management** | `vendor-portal.html`<br>`#form-profile-info` | `GET /.netlify/functions/vendor-profile`<br>`POST /.netlify/functions/vendor-profile`<br>`{ action: 'update_profile', contactPerson, contactPhone, officeAddress, state }` | Strict field allowlist. Role escalation or editing `email`, `loginEmail`, `linkedRegistrationIds` is strictly blocked. | `src/pages/vendor/VendorProfile.tsx`<br>`src/services/vendorProfile.ts` | **VERIFIED** |
| **F-14** | **Password Change / Session Compatibility** | `vendor-portal.html`<br>`#form-profile-pwd`<br>`/change-password.html` | `POST /.netlify/functions/vendor-profile`<br>`{ action: 'change_password', currentPassword, newPassword, confirmPassword }` | Bcrypt current password verification. Min 8 characters. Confirmation match. Cleans session on logout. | `src/pages/vendor/VendorProfile.tsx`<br>`src/services/vendorProfile.ts` | **VERIFIED** |
| **F-15** | **Real-Time Status Updates (SSE)** | `vendor-portal.html`<br>`setupStatusStream()` | `GET /.netlify/functions/status-stream?token=:token` | EventSource connection scoped strictly to evaluations in `linkedRegistrationIds`. Sanitized event payload (no internal fields). Reconnection and cleanup on unmount/logout. | `src/hooks/useVendorStatusStream.ts` | **VERIFIED** |
| **F-16** | **Payment Retirement Invariant** | `vendor-portal.html` | Retired routes (`vendor-submit-payment.js`) | Must return `410 Gone`. Zero active UI elements for payment proof or submission in React. | Verified across all React views | **VERIFIED** |

