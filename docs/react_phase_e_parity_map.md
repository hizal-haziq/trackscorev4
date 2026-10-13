# Phase E Assessor Frontend Parity Obligations

Created before implementation, 12 October 2026.  
Source of truth: TrackScore codebase, current backend handlers (`save-evaluation.js`, `get-evaluations.js`, `lookup-evaluation.js`, `add-comment.js`, `rubric.js`), legacy frontend controls in `index.html` and `public/app.js`, and verified Phase D baseline (280 tests / 37 suites, lint/build and 85 browser checks passed).

Map statuses: VERIFIED, PARTIAL, MISSING, NOT TESTED, BLOCKED.  
Initial status for every Assessor feature is NOT TESTED before implementation and verification.

---

## 1. Assessor Frontend Parity Matrix

| Feature | Legacy Control & Handler | Endpoint & Method | Request Payload & Role | Ownership & Role Guard | Valid Assessment States | Draft Behavior | Version & Scoring Behavior | React Replacement | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **1. Assessor Dashboard / My Work Queue** | `index.html:146` `#notification-section`, `app.js:4602` `fetchAssessorSubmissions`, `app.js:4724` | `GET /.netlify/functions/get-evaluations?limit=100` | Query params: `limit=100`, `includeBreakdown=false`. Role: Assessor only. | Scoped to authenticated Assessor (`assessorId`, `name`, `email`). Managers/Vendors denied. | `scheduled`, `registered`, `in_progress` | N/A | Server-authoritative SLA and status. Displays assigned inspections with due date and conduct action. | `AssessorWork.tsx` (`#/work`), Work Queue table with filters, search, and loading/empty/error states. | VERIFIED |
| **2. Changes Requested / Revision Queue** | `index.html:146` filter `#notif-filter-revisions`, `app.js:2282` `loadEvaluationForCorrection` | `GET /.netlify/functions/get-evaluations?limit=100` | Query params: `limit=100`. Role: Assessor only. | Scoped to authenticated Assessor. | `rejected`, `remediation_required` | Resumes or loads latest rejected assessment snapshot. | Displays Manager rejection reason/notes. Loads into editable revision form. | `AssessorChangesRequested.tsx` (`#/changes-requested`), Revision list with reason badges. | VERIFIED |
| **3. 33-Criterion Assessment Form** | `index.html:362` `#evaluation-workbench-layout`, `app.js` form builder & radio handlers | Form input collecting 33 criteria from rubric | Radio option selections + comments mapped to criteria IDs. Role: Assessor only. | Assessor owns assigned record. Cannot edit another assessor's work. | `scheduled`, `in_progress`, `rejected` (revising), or fresh evaluation. | Form updates trigger debounced draft save to `trackscore-drafts`. Form dirty tracking. | All 33 criteria rendered across Section A (24) and Section B (9). Points preview from authoritative rubric. Server recalculates scores upon submit. | `AssessmentForm.tsx`, `CriterionCard.tsx`, Section A & B cards with option badges. | VERIFIED |
| **4. Criterion Comments** | `index.html` `#comment_${critId}`, `app.js:2889` comment collector | Included in `breakdown` array per criterion | String per criterion, $\le 2000$ characters. Escaped, no HTML injection. | Same as assessment. | Same as form. | Preserved in drafts and submissions. Reloaded on resume/revision. | Comments bound to specific criterion in version snapshot. Internal Manager review notes excluded from editable fields. | `CriterionCard.tsx` with textarea, character counter ($0/2000$), warning when $>1950$. | VERIFIED |
| **5. Save & Resume Drafts** | `index.html:41` `#btn-my-drafts`, `app.js:1572` `saveDraftToStorage`, `app.js:1765` `restoreDraft` | Client `localStorage` (`trackscore-drafts`) | Serialized draft state with `draftId`, metadata, selections, comments. | Scoped to browser storage; identity check protects against cross-record overwrite. | In-progress evaluation or revision. | Max 3 concurrent drafts. Rubric version check (`RUBRIC_VERSION = "2.0"`). Discard or overwrite. | Local only; no premature server version created. Autosave and manual save buttons with toast feedback. | `AssessorDrafts.tsx` (`#/drafts`), `DraftControls.tsx`, `assessorDrafts.ts` service with 3-draft capacity. | VERIFIED |
| **6. Submit Initial Evaluation** | `index.html` `#btn-submit-eval`, `app.js:2880` submit handler | `POST /.netlify/functions/save-evaluation` | `{ companyName, deviceModel, packageName, assessorName, assessorId, assessmentDate, breakdown, totalScore, ... }` | Assessor role required; identity matches assigned assessor. Managers denied (403). | `scheduled`, `registered`, `in_progress` | Removes active submitted draft from storage. Retains other saved drafts. | Creates immutable version snapshot `v1` in `assessment_versions`. Status becomes `pending_review` (or `submitted`). Server recomputes scores. | `SubmitAssessmentModal.tsx`, `submitAssessment` service, single-submit lock. | VERIFIED |
| **7. Resubmit Revision** | `app.js:2933` `payload.resubmitRecordId`, `save-evaluation.js:210` | `POST /.netlify/functions/save-evaluation` | Payload including `resubmitRecordId`, adjusted `breakdown`, change reason. | Assessor role required; must own existing record. | `rejected`, `remediation_required` | Removes submitted draft on success. | Creates immutable version snapshot `v2` (or next version). Status becomes `submitted`. `v1` snapshot remains untouched. | Revision resubmission modal, `resubmitAssessment` service, preserves `v1`. | VERIFIED |
| **8. Submitted Assessments View** | `index.html:235` `#assessor-submissions-view`, `app.js:4602` `fetchAssessorSubmissions` | `GET /.netlify/functions/get-evaluations?limit=100` | Query params: `limit=100`. Role: Assessor only. | Scoped to authenticated Assessor. | `submitted`, `pending_review`, `approved`, `completed` | Read-only; technical editing disabled unless entering Changes Requested. | Displays current version, server scores, stars, SLA status, Manager approval stage. | `AssessorSubmitted.tsx` (`#/submitted`), table with search, status badges, version markers. | VERIFIED |
| **9. Peer Review Workflow** | `index.html:311` `#assessor-peer-review-view`, `app.js:5091` `fetchPeerEvaluations`, `peer-comments.js` | `GET /.netlify/functions/lookup-evaluation?peerReview=true&limit=100`, `POST /.netlify/functions/add-comment` | Comment payload: `{ evaluationId, text, aiSummary?, commentsOverallSummary? }` | Assessor role required. Assessor CANNOT comment on own evaluation (403). Allowed on peer evaluations only. | Submitted/approved evaluations by other assessors. | N/A | Comments are append-only. Does NOT mutate technical score or criterion breakdown. | `AssessorPeerReviews.tsx` (`#/peer-reviews`), `PeerReviewModal.tsx`, `peerReviews.ts` service. | VERIFIED |
| **10. Version Context & Read-Only History** | `app.js` report viewer, `lookup-evaluation.js`, `get-assessment-version.js` | `GET /.netlify/functions/lookup-evaluation?id=...`, `GET /.netlify/functions/get-assessment-version?id=...&version=...` | Query params: `id`, `version`. Role: Assessor only. | Scoped to own record or peer record via `peerReview=true`. | Any valid record state. | N/A | Historical versions immutable; read-only inspection of past scores, criterion answers, and audit trail. | Integrated version banner and read-only inspection modal. | VERIFIED |

---

## 2. Invariants & Safety Guardrails

1. **Server-Side Scoring Invariant:**
   - React UI is strictly an input collector.
   - The backend recomputes all sectional and total scores, ratings, and stars (`recomputeScores`).
   - If client totals are omitted or tampered, the server recomputes authoritative scores and enforces integrity.
2. **Version Immutability:**
   - When an evaluation is submitted, version 1 snapshot is permanently stored in `assessment_versions`.
   - When a revision is submitted, version 2 is created.
   - Version 1 data, criteria, and scores are never edited in place.
3. **Manager vs. Assessor Separation:**
   - Assessors cannot access Manager overview or mutations (Prepare, Print, Sign, Deliver, Approve).
   - Managers cannot submit assessments through `save-evaluation.js` (403 Forbidden).
   - Assessor React entry points are strictly guarded for `role === 'assessor'`.
4. **IDOR & Ownership Protection:**
   - Assessors can only view and edit assessments assigned to them.
   - Direct API calls to load or submit another assessor's record are rejected with 403 Forbidden.
   - Peer review allows read-only viewing of peers, but strictly blocks self-commenting and technical mutations.
5. **Draft Safety:**
   - Max 3 drafts enforced in `localStorage` (`trackscore-drafts`).
   - Identity checks prevent draft A from overwriting assessment B.
   - Submitting an evaluation removes only that specific draft.
6. **Payment Retained Invariant:**
   - Payment endpoints remain 410 Gone.
   - No payment UI or references in the Assessor workflow.

