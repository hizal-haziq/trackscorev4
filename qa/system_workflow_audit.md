# TrackScore full system workflow audit before redesign

Audit date: 2 October 2026  
Scope: current source, root/public role pages, Express routes, Netlify functions, storage adapter, tests, and existing browser/control evidence. No redesign code was implemented.

## 1. System overview

TrackScore is an assessment-lifecycle application with four audiences and three authenticated roles. Public visitors learn about the program, submit an inquiry, and verify a certificate. Managers run intake, registration, scheduling, assignment, review, finance, certification, reporting, and account administration. Assessors complete the technical 33-criterion evaluation. Vendors see only their linked records, provide evidence and revision responses, submit payment details, and download an eligible certificate.

The browser surface is smaller than the number of logical functions suggests. Most Manager functions are sections, tables, drawers, and modals inside `dashboard.html`; most Assessor functions are inside `index.html`; Vendor functions are inside `vendor-portal.html`. Express exposes both `/api/...` and `/.netlify/functions/...` routes to the same handlers. MongoDB Atlas is the intended production store. The storage adapter supplies isolated JSON fallback in non-production environments.

The present system already contains a complete workflow. Its main design problem is that lifecycle tasks, repository functions, and operational summaries coexist in very large role pages. The evidence supports a navigation and information-hierarchy redesign. It does not support replacing the core workflow, security model, storage model, or scoring engine.

## 2. User roles and permissions

### Public user / inquiry user

Can view the landing content, packages, standard, matrix overview and process; submit one assessment inquiry through `request-assessment.html`; sign in; and verify a certificate number through `verify-certificate.html`. The public inquiry endpoint accepts company/contact/device/package/message fields after honeypot, rate, type, format, and length checks. Certificate verification returns a deliberately small public result.

Must not list inquiries, registrations, evaluations, users, vendors, documents, payment data, internal comments, risk records, version snapshots, or certificates by arbitrary record ID. Public users cannot create registration/evaluation records directly.

### Manager

Can see all non-deleted operational records, inquiries, full assessment detail, Assessor comments, Manager comments, versions, risk, SLA, workload, payment, certificate, Vendor/registration contact data, reports, exports, notifications, and team accounts. Can convert/dismiss inquiries, register customers, confirm packages/invoices, create Vendor credentials, schedule, assign/reassign, update allowed administrative fields, archive, approve, request revision, verify or override payment, run the certificate steps, and manage staff accounts.

Must not use the Assessor’s 33-criterion submission endpoint. The current server rejects Manager calls to `save-evaluation`; review remains separate from technical authorship. A Manager also cannot authenticate as a Vendor to Vendor-only endpoints merely because Manager is the higher internal role.

### Assessor

Can see assigned work and own submissions; open an assigned assessment; complete exactly 33 criteria; add criterion comments; save local drafts; submit; correct a revision; view permitted history and risk; see assignment/review notifications; and add permitted peer comments.

Must not approve, reject, schedule, assign, verify payment, issue certificates, manage accounts/inquiries, export the full repository, edit another Assessor’s record, or modify an approved/financial/certificate-stage record. Assignment/author identity is checked server-side.

### Vendor

Can see profile data and only evaluations linked through the authoritative Vendor record’s `linkedRegistrationIds`; see a sanitized lifecycle summary; upload/list/download/delete permitted documents; respond to a revision; submit payment details/proof; see linked history; change password/profile allowlisted fields; receive scoped status events; and download a certificate when available.

Must not see unrelated records, internal Manager review fields, internal risk detail, other Vendors, staff accounts, the Manager repository, Assessor-only editing, or Manager/Assessor notifications. Vendor payment submission can only set `pending_verification`, never `paid`. Vendors cannot delete accepted evidence.

## 3. Complete current workflow

| Stage | Initiator / page / action | Endpoint and principal data | Validation, persistence, state and blocker |
|---|---|---|---|
| Public inquiry | Public, `request-assessment.html`, **Submit Assessment Inquiry** | `POST /api/submit-inquiry`; company, address/state, contact, device, package interest, message, honeypot | Required types/formats/lengths, honeypot, 5/IP/hour. Inserts `inquiries` row with `recordType=inquiry`, `status=inquiry`. Invalid data or abuse blocks it. |
| Inquiry review | Manager, Dashboard → Applications & Inquiries | `GET /api/manage-inquiries` | Manager JWT required. Lists/filter inquiries and pending count. |
| Convert | Manager, **Convert to Registered Customer** | `POST /api/manage-inquiries`, `action=convert`, inquiry ID, package, optional schedule/assignment/notes | Only an `inquiry` can convert. Inserts an evaluation/registration with package, invoice, payment `unpaid`, status `registered`; inquiry becomes `converted` and points at the new record. |
| Dismiss | Manager, **Dismiss** | Same endpoint, `action=dismiss`, reason | Inquiry becomes `dismissed`; no registration is created. |
| Direct registration | Manager, **New Registration / Create Registration** | `POST /api/register-customer`; company/contact/device/package/invoice/pre-final/SLA data | Manager-only field allowlist and duplicate handling. Creates/merges a registration/evaluation record, normally `registered`. |
| Package / invoice | Manager, Invoice modal, **Save Invoice Details** | `POST /api/manage-invoice`; record ID, package, invoice number/amount/dates | Stores confirmed `invoice` and normalized package fields. It deliberately does not advance the assessment status. |
| Vendor account | Manager, **Create Vendor Login / Generate Vendor Credentials** | `POST /api/vendor-invite`; company/contact/login and registration link | Generates or accepts a temporary credential, stores bcrypt hash in `vendors`, links the registration ID. Credential handoff UI supports copy, text download and WhatsApp handoff; no automatic email delivery is implemented. |
| Scheduling | Manager, **Schedule / Reschedule** | `POST /api/schedule-assessment`; record, date, optional Assessor, notes, SLA days | Manager-only. Updates schedule fields and changes `registered` to `scheduled`; calculates/stores SLA start/deadline. Later states remain their current state. |
| Assignment | Manager, **Assign / Reassign** | `POST /api/assign-assessor`; record, selected staff ID/name/email, date/instructions/SLA | Staff identity required. Stores authoritative account identity and emits an assignment event. `registered` becomes `scheduled`; the code recognizes `assigned` in views but this endpoint does not normally store it. Capacity overage warns but does not forbid assignment. |
| Assessor opens work | Assessor, `index.html`, **Start Assessment / Conduct Assessment** | `GET /api/get-evaluations` and `GET /api/lookup-evaluation` | JWT and Assessor identity scope. Another Assessor’s record is excluded/forbidden. |
| Draft | Assessor, **Save Draft** | Browser local draft store; draft backup download/restore | Up to three drafts are managed on the client. Reload restores local drafts. Draft is a UI/storage concept, not a canonical server lifecycle status. |
| Technical assessment | Assessor, 33-item form | 33 score selections plus up to 33 comments and metadata | Client calculates feedback; server remains authoritative. |
| Submit | Assessor, **Submit Assessment** | `POST /api/save-evaluation`; metadata, breakdown, client totals, optional registration link | Assessor-only; identity/assignment checked; exactly one of each official criterion; comments string ≤2,000; scores recomputed and compared within 0.05. Duplicate unlinked assessment returns 409. A matched registration is updated in place. Status is normally `pending_review`, `currentVersion=1`, and v1 snapshot is created. |
| Manager review | Manager, Attention/Repository, **Review / Audit & Review** | `GET /api/lookup-evaluation?fullDetails=true`, history/risk/document endpoints | Presents score breakdown and Assessor comments read-only, Manager comment separately, evidence, status history and versions. Missing context or unauthorized role blocks access. |
| Approve score | Manager, **Approve Assessment / Confirm & Approve** | `POST /api/approve-evaluation`, action, optional Manager note/pre-final skip | From `pending_review` or `submitted`, records `approvedVersion` and Manager fields. Normal target is `pre_final_sent`; explicit pre-final skip leaves lifecycle at `pending_review` with skip metadata. Technical assessment becomes locked for Assessor editing. |
| Request changes | Manager, **Request Revision / Reject**, then confirm | Same endpoint with `action=reject`, required reason | Allowed only from `pending_review` or `pre_final_sent`; stores `status=rejected`. Despite the internal name, current UI/business meaning is “Revision Required / Changes Needed,” not a terminal rejection. |
| Assessor revision | Assessor, **Fix & Resubmit** | `POST /api/save-evaluation` with `resubmitRecordId`, changed breakdown and reason | Owner check and lock check. A single criterion may change, but the full 33-item authoritative breakdown is submitted and recomputed. Creates the next immutable snapshot and changes `rejected -> submitted`. Prior snapshots remain unchanged. |
| Vendor revision response | Vendor, **Respond to Revision** | `POST /api/vendor-resubmit`; linked evaluation and explanation, optional device model | Active Vendor and ownership required; record must need revision. Creates next snapshot from current technical data, stores Vendor response, clears rejection reason and changes to `submitted`. This is a response loop, not Vendor technical scoring. |
| Pre-final notice | Manager, **Prepare Notice / Send Pre-Final** | `POST /api/send-pre-final`; recipient, notes or skip | Only pending-review/submitted records. Stores a simulated notice and `pre_final_sent`; no real email is sent. Skip keeps `pending_review` and sets `preFinalSkipped`. |
| Payment proof | Vendor, **Submit Payment Proof** | `POST /api/vendor-submit-payment`; amount, method, reference, date, notes, optional receipt document ID | Vendor ownership and positive amount/reference checked. Stores `payment.status=pending_verification`; evaluation status stays at its current stage. |
| Verify payment | Manager, **Verify Payment / Confirm Payment Verification** | `POST /api/verify-payment`; amount/method/reference/date/notes or override+reason | Normal path requires `pre_final_sent`, or a pre-final-skipped review state. Stores `payment.status=paid` and advances to `payment_confirmed`. A reasoned Manager override is separately audited. |
| Prepare certificate | Manager, **Prepare Certificate** | `POST /api/issue-certificate`, `step=prepare` | Requires explicit paid evidence or reasoned preparation override. Creates/preserves certificate number and certified version, stores prepared date. Status stays `payment_confirmed`. |
| Print | Manager, **Print Certificate** | Same, `step=print` | Requires preparation/number; stores printed date. |
| Sign | Manager, **Record DGO Signature** | Same, `step=sign`, signatory/date | Requires print and signatory; changes status to `certificate_issued`. |
| Deliver | Manager, **Confirm Step** for delivery | Same, `step=deliver`, method/date | Requires signature; stores delivery and changes status to `completed`. Completion also finalizes SLA classification. |
| Download | Vendor/Manager, **Download PDF / Download Certificate** | Vendor first gets sanitized portal data; browser `certificate-pdf.js` renders the PDF | Certificate fields and eligibility must exist. PDF contains number, approved result/version, QR and signature/dates. |
| Public verification | Public, `verify-certificate.html`, **Verify** | `GET/POST /api/verify-certificate`, certificate number | Searches issued record and returns safe validity metadata; missing identifier 400, unknown/invalid 404. |

## 4. State/status transitions

### Inquiry

`inquiry` (**New Inquiry**) → `converted` (**Converted**) by Manager, or `dismissed` (**Dismissed**) by Manager. Conversion can occur only once. There is no public editing or reopening transition.

### Assessment/evaluation lifecycle

The actual stored values encountered in handlers and UI are:

| Internal value | Current user-facing meaning | Entry | Exit / forbidden notes |
|---|---|---|---|
| `registered` | Registered | conversion or direct registration | Manager schedules/assigns. No technical result yet. |
| `scheduled` | Scheduled | scheduling/assignment from registered | Assessor submission updates the same record to review. |
| `assigned` | Assigned | recognized by filters, notifications and legacy records | Current assignment handler usually retains/sets `scheduled`; assignment is also derived from fields. This dual representation is confusing. |
| `in_progress` | In Progress | recognized by overview UI | Draft/in-progress work is primarily client-side; this is not consistently written by the current submit flow. |
| `pending_review` | Pending Review / Under Review | normal initial submission; approval skip path | Manager may approve/request changes/pre-final. Assessor cannot edit after approval-stage lock. |
| `submitted` | Submitted | Assessor/Vendor resubmission and some legacy paths | Treated as review-ready. Manager can approve; UI groups it with review. |
| `rejected` | Changes Needed / Revision Required | Manager “Request Revision/Reject” from review/pre-final | Assessor or Vendor resubmits to `submitted`. Current implementation does not have a distinct terminal rejection state. |
| `pre_final_sent` | Pre-Final Logged / Results Sent | Manager approval or notice preparation | Payment may be verified; revision can still be requested. Notice is simulated, not delivered. |
| `payment_confirmed` | Payment Confirmed | Manager verification/override | Certificate preparation becomes eligible. |
| `certificate_issued` | Certificate Issued | DGO signature step | Delivery changes it to completed. |
| `completed` | Completed | certificate delivery or guarded completion | Terminal operational state; score editing forbidden. |
| `approved` | Legacy Approved | migrated to completed by lifecycle migration; still recognized in reports/SLA | Not the normal current approval target. |
| `cancelled`, `remediation_required`, `cert_issued` | Legacy/compatibility values | recognized in isolated checks/filters | They are not primary current transitions and should not be promoted in a redesign. |

Canonical current path:

`registered → scheduled → pending_review → pre_final_sent → payment_confirmed → certificate_issued → completed`

Revision path:

`pending_review|pre_final_sent → rejected → submitted → pre_final_sent ...`

The system has no single stored “assessment approved but awaiting payment” enum separate from `pre_final_sent`; `approvedVersion` and pre-final metadata carry that meaning.

### Payment

Payment subdocument values include `unpaid`, `invoiced`, `pending_verification`, and `paid`; audited override uses `overridden=true` with a mandatory reason and may retain `unpaid/invoiced` as the sub-status. Vendor submission never advances the main lifecycle. Manager verification changes the main lifecycle to `payment_confirmed`.

### Certificate

Certificate is a subdocument rather than a separate collection/state enum: unprepared/null → `preparedDate` and number → `printedDate` → `signedBy/signedDate` (main status `certificate_issued`) → `sentToCustomerDate` (main status `completed`). Steps are sequential. There is no implemented certificate-revocation state; UI wording includes Reject/Revoke in some conditional actions, but the public verifier’s real validity derives from the stored issued certificate state.

### SLA

Exact values: `ON_TRACK`, `DUE_SOON`, `OVERDUE`, `COMPLETED_ON_TIME`, `COMPLETED_LATE`. They are calculated, not a second business lifecycle. Due soon is ≤48 hours. Completed is determined by `completed` or legacy `approved`/completion timestamps.

## 5. Manager workflow

The Manager works almost entirely in `dashboard.html`:

| Function | UI action | Endpoint | Effect |
|---|---|---|---|
| Overview/attention | Dashboard, Details/Review/Verify/Issue | `get-evaluations?view=overview` then detail/action endpoints | Global metrics and prioritized records. |
| Repository | All Assessments, filters, Details/Edit/Archive/Report | `get-evaluations`, `lookup-evaluation`, `update-evaluation`, `delete-evaluation` | Search/filter/detail, allowed metadata updates, soft deletion. |
| Inquiry | Applications & Inquiries, Convert/Dismiss | `manage-inquiries` | Converted registration or dismissed inquiry. |
| Registration | New Registration/Create Registration | `register-customer` | Creates registration/invoice foundation. |
| Vendor credentials | Create Vendor Login/Credentials | `vendor-invite` | Vendor account and link. |
| Scheduling/assignment | Schedule, Assign, Reassign | `schedule-assessment`, `assign-assessor` | Schedule, Assessor identity, SLA, instructions. |
| Workload | Workload tab, View Tasks | `get-assessor-workload` | Capacity, active/due/overdue/completed, unassigned. |
| Review | Review/Audit & Review, Version History, Risk | detail/history/version/risk/comment endpoints | Read-only technical evaluation plus Manager decisions/comment. |
| Decision | Approve, Request Revision/Reject | `approve-evaluation` | Approval version/pre-final, or revision loop. |
| Payment | Verify Payment | `verify-payment` | Paid/override and `payment_confirmed`. |
| Certificate | Prepare/Print/Sign/Deliver/Download | `issue-certificate` plus PDF client | Sequential certificate lifecycle. |
| Reporting | Download Report, Print, Excel | lookup/report renderer, `export-evaluations` | Assessment PDF/print and Excel export. |
| Team | Create/reset/delete staff | `manage-users` | Assessor/Manager account operations; self-delete protected. |
| Notifications | Notifications, Refresh/Mark read locally | `get-notifications`, status stream | DB-derived events plus live status events. |

The dashboard redesign already reduced some top-level duplication, but one record can still expose Review/Details/Report/History/Payment/Certificate actions in overview, repository row, record detail, and modal footer. They generally call the same underlying functions, so the issue is multiple entry points and inconsistent labels rather than duplicate business implementations. “Approve,” “Approve Assessment,” and “Confirm & Approve” are stages of one action. “Request Revision,” “Reject,” “Confirm & Return for Revision,” and “Changes Needed” describe the same implemented revision branch. “Send Pre-Final,” “Prepare Notice,” and “Send Preliminary Results” refer to a simulation-only preparation step.

The Manager sees overview metrics, attention items, recent records, schedule, workload, payment, certificate, SLA, detailed repository, quality/risk, inquiries, companies, team accounts, notifications and many modal workflows. The data is relevant, but too much is available at once and the same record context is repeatedly reconstructed.

## 6. Assessor workflow, persistence and versioning

After login, the Assessor token carries role and identity. `get-evaluations` scopes results to assignment/authorship. The Assessor can begin from Assigned Work, My Submissions, alerts, drafts, or a record action; all converge on the same 33-item form.

Drafts are local browser data, capped at three, with open/delete/new/save and JSON backup/restore. This gives reload persistence on the same browser but is not cross-device server persistence. Submission always sends the full breakdown. The server validates all official criterion IDs exactly once, validates comments, recomputes Section A, Section B, total, star/rating values, and rejects client-total tampering.

Initial submission updates a matching registered/scheduled record in place, preserving registration, invoice, payment, contact and SLA fields. It stores the authoritative breakdown and version 1, then writes an immutable version snapshot to `assessment_versions` or its JSON equivalent.

When the Manager requests changes, `rejected` unlocks the technical correction route for the owning Assessor. Changing only one criterion still posts the full matrix; server recomputation produces the new aggregate. If legacy data lacks v1, the endpoint backfills a baseline. It then creates v2 (or next), updates the live evaluation, clears the rejection reason, and returns it to `submitted`. History APIs keep v1 unchanged. Approval records `approvedVersion`; certification copies that value to `certifiedVersion`. Approved, pre-final, payment, issued and completed states are explicitly locked against Assessor modification.

Peer comments are stored separately from per-criterion `breakdown[].comment`: the latter is authored technical evidence; peer/Manager commentary has its own endpoint and identity/audit behavior. These should remain visibly distinct in any redesign.

## 7. Vendor workflow and information exposure

Manager creation/invitation produces a bcrypt-backed Vendor account and links registration IDs. Vendor login redirects to `vendor-portal.html`; temporary-password behavior can redirect to `change-password.html` through `mustChangePassword`. The portal has Assessments, Company Profile and notifications rather than internal Manager navigation.

The portal API reloads the Vendor from storage, confirms active status, and resolves only linked records. Its DTO exposes lifecycle, package/invoice/payment, safe assessment result, documents, Vendor-facing revision reason/response, history and certificate data needed for the portal. It omits staff password hashes, unrelated records, internal Manager review notes and internal risk intelligence.

Documents accept PDFs, JPEG/PNG/WebP, Word and text up to 10 MB, store server-generated `.bin` files outside the public root, and keep metadata on the evaluation. Vendors may delete their unaccepted upload but not accepted evidence. Retrieval repeats ownership checks.

The Vendor can respond to `rejected` with an explanation, submit payment details with a transaction reference, and download the certificate PDF after issue data is available. The public QR/link goes to certificate verification. The portal’s internal-value-derived milestone bar includes technical labels such as Pre-Final and exposes version/history/document detail. None is a confirmed role leak, but “Pre-Final,” version mechanics, and the distinction between assessment status and payment sub-status are more operational complexity than most Vendors need.

## 8. Data ownership matrix

Legend: R read, C create, U update, D delete/archive, O own/scoped only, — no access. “Manager D” often means soft archive or account delete rather than physical evaluation deletion.

| Data | Manager | Assessor | Vendor | Public |
|---|---|---|---|---|
| Staff users | R/C/U/D | own identity/password flow only | — | — |
| Vendor accounts | R/C/U/link | — | R/U own profile/password | — |
| Inquiries | R/C via conversion/U status | — | — after public submission | C |
| Registrations/evaluations | R/C/U/D | R-O; U-O through assessment/revision | R-O; limited U-O actions | — |
| Assessment versions | R all | R-O; C through own submit | R-O; C response snapshot | — |
| 33 criterion scores/comments | R; Manager comment separate | C/U-O until lock | sanitized result only; no technical edit | — |
| Peer/Manager comments | R/C under endpoint rules | R/C-O | internal comments hidden | — |
| Documents | R/C/U/D under record scope | R/C/D assigned scope | R/C/D-O; accepted delete forbidden | — |
| Invoice/payment | R/C/U/verify/override | read only if included in assigned view | R-O; submit proof only | — |
| Certificates | R/C/U/download | report/history view only | R/download-O | verify safe fields only |
| Notifications/status events | R global/internal | R-O | R-O sanitized | — |
| Status/evaluation history | R | R-O | R-O sanitized | — |
| SLA | R all/override duration during schedule | R-O | limited display in linked record | — |
| Risk/anomaly records | R all/re-evaluate UI | R-O | explicitly denied | — |

## 9. Page and logical-view inventory

| Physical page / logical view | Role | Purpose and main actions | Duplicate/overlap |
|---|---|---|---|
| `landing.html` | Public | Program explanation, packages/process, register/sign-in links | Repeated desktop/mobile/hero links are responsive entry points, not separate workflows. |
| `request-assessment.html` | Public | Inquiry form | Unique. |
| `login.html` | All | Role tabs, credentials, password visibility, sign in | One endpoint also supports Vendor login; role tabs clarify destination. |
| `change-password.html` | authenticated forced-change | Replace temporary password | Vendor portal also has voluntary password change. Different context, same concept. |
| `verify-certificate.html` | Public | Certificate lookup | Unique. |
| `index.html` Assessment Form | Assessor | 33 criteria, comments, draft, submit | Main technical-authoring surface; must remain Assessor-only. |
| `index.html` Assigned Work/My Submissions/Alerts/Peer Reviews | Assessor | Work queue, history/report/comment entry | Several ways to open the same record; useful categories but visually dense. |
| `dashboard.html` Dashboard | Manager | Metrics, attention, recent, schedule, workload, finance/certificate/SLA summary | Shortcuts overlap repository row/detail actions by design. |
| `dashboard.html` All Assessments | Manager | Canonical repository, filters, detail, report, actions | Should be the durable browse/search surface. |
| `dashboard.html` Companies & Assignments | Manager | Registration, schedule, invoice, Vendor and assignment operations | Same evaluation records as repository; differs by task focus. |
| `dashboard.html` Applications & Inquiries | Manager | Intake review/convert/dismiss | Unique dataset and workflow. |
| `dashboard.html` Assessor Workload | Manager | capacity/task/SLA aggregation and assignment context | Summary also appears on dashboard. Detail view remains justified. |
| Manager review/detail/history/risk/payment/certificate modals | Manager | Complete record/task flows | Multiple modal launch points expose the same central record. |
| Team Accounts | Manager | create/reset/delete staff | Administration concern inside operational page. |
| `vendor-portal.html` Assessments | Vendor | linked status, evidence, revision, payment, certificate/history | Appropriate single portal; some internal wording can be simplified. |
| `vendor-portal.html` Company Profile | Vendor | profile/password | Unique self-service function. |

## 10. Button/action inventory

The latest full inventory contains 546 interactive controls: 343 buttons and 203 other controls, across eight major pages; many entries are repeated dynamic row templates. The table below consolidates production actions by workflow rather than repeating each generated row instance.

| Page/view | Button/action | Role | Endpoint | Result |
|---|---|---|---|---|
| Request Assessment | Submit Assessment Inquiry | Public | `submit-inquiry` | New inquiry. |
| Certificate Verify | Verify | Public | `verify-certificate` | Safe valid/invalid result. |
| Login | Sign In | all roles | `login` / `vendor-login` | JWT + role redirect. |
| Dashboard | New Registration/Create Registration | Manager | `register-customer` | Registered evaluation foundation. |
| Inquiries | Convert / Dismiss | Manager | `manage-inquiries` | Converted registration or dismissed inquiry. |
| Companies/repository | Schedule/Reschedule | Manager | `schedule-assessment` | Schedule/SLA. |
| Companies/workload | Assign/Reassign | Manager | `assign-assessor` | Assessor identity and assignment. |
| Company detail | Log/Edit Invoice | Manager | `manage-invoice` | Invoice/package stored. |
| Company detail | Create Vendor Login/Credentials | Manager | `vendor-invite` | Vendor linked. |
| Review | Review/Audit & Review/Details | Manager | `lookup-evaluation` + supporting reads | Opens same review context. |
| Review | Approve/Confirm & Approve | Manager | `approve-evaluation` | Approved version/pre-final stage. |
| Review | Request Revision/Reject/Return | Manager | `approve-evaluation` | `rejected` revision loop. |
| Review | Version History/View Snapshot/Compare | Manager | history/version endpoints | Immutable snapshot inspection. |
| Review | Post Comment | Manager/Assessor | `add-comment` | Audited comment. |
| Results | Prepare Notice/Send Pre-Final | Manager | `send-pre-final` | Simulated notice stored. |
| Payment | Verify Payment | Manager | `verify-payment` | Paid/override and `payment_confirmed`. |
| Certificate | Prepare/Print/Record Signature/Deliver | Manager | `issue-certificate` | Sequential certificate state. |
| Repository | Report/Print/Download Excel | Manager | detail/client report/export endpoint | Output artifacts. |
| Repository | Archive | Manager | `delete-evaluation` | Soft delete. |
| Team Accounts | Create/Reset/Delete | Manager | `manage-users` | Staff administration. |
| Assessor work | Start/Conduct/Open/Fix & Resubmit | Assessor | evaluation reads; then form | Opens the same authoring form. |
| Assessment form | Save Draft/backup/restore | Assessor | local browser storage | Local draft persistence. |
| Assessment form | Submit Assessment | Assessor | `save-evaluation` | v1 or next version, review queue. |
| Vendor assessment | Documents & Evidence/Upload/Download/Delete | Vendor | `vendor-documents` | Scoped evidence operations. |
| Vendor assessment | Respond to Revision | Vendor | `vendor-resubmit` | Vendor response and next version. |
| Vendor assessment | Submit Payment Proof | Vendor | `vendor-submit-payment` | Pending Manager verification. |
| Vendor assessment | Download PDF/Verify Online | Vendor | portal data + client PDF/public verify | Certificate artifact/verification. |

Confirmed label/action duplication is predominantly presentation duplication: Details/Open Details/Review; Assign/Assign Assessor; Schedule/Reschedule; Report/View Report/Download Report; and the revision label family. Centralizing a record workspace can retain shortcuts while eliminating competing action locations.

## 11. API flow

Public: `packages` (GET), `submit-inquiry` (POST), `verify-certificate` (GET/POST), and config/health. Authentication: `login`, `vendor-login`, `change-password`. Manager-only operations: `manage-users`, `register-customer`, `manage-inquiries`, `schedule-assessment`, `assign-assessor`, `get-assessor-workload`, `manage-invoice`, `send-pre-final`, `verify-payment`, `issue-certificate`, `vendor-invite`, `update-evaluation`, `delete-evaluation`, `export-evaluations`, and approval. Shared scoped reads/actions: `get-evaluations`, `lookup-evaluation`, history/version, risk, comments, documents, notifications, and status stream. Vendor-only mutations: portal profile/password, revision response, payment submission. Assessor-only technical mutation: `save-evaluation`.

The Express bridge and Netlify functions share handlers, so a navigation redesign can reuse APIs. No proposed menu regrouping needs a database migration.

## 12. Database and storage flow

MongoDB collections are `evaluations`, `users`, `vendors`, `inquiries`, `assessment_versions`, and `assessment_risk`. Payment, invoice, documents, certificate, history and SLA fields are embedded in an evaluation; they are not separate collections. IDs are Mongo ObjectIds in Atlas where applicable and string IDs in fallback. References are stored as strings (`linkedRegistrationIds`, `registrationReferenceId`, `linkedRegistrationId`, `evaluationId`).

Indexes cover evaluation status/Assessor/date/deletion, unique staff email, unique Vendor contact email, unique evaluation+version, and risk lookup fields. Duplicate assessment prevention checks company+device+Assessor+date. Version uniqueness prevents two snapshots with the same evaluation/version combination.

Non-production fallback files are `.data/evaluations.json`, `users.json`, `vendors.json`, `inquiries.json`, `assessment_versions.json`, and `assessment_risk.json`. The adapter offers matching operations and creates empty stores, not default accounts. Upload bytes live under `.uploads`; metadata remains embedded in evaluations.

Production recognizes `NODE_ENV=production` or `CONTEXT=production`; without a usable Mongo URI it raises database-unavailable rather than serving JSON fallback. Development may read `.env` and use fallback. Atlas connection pooling and a retry cooldown are implemented. A lifecycle migration changes legacy `approved` evaluations to `completed` and appends history.

## 13. Authentication and security flow

Staff login looks up the account, compares bcrypt hash, and returns a 24-hour JWT with role/identity and `mustChangePassword`. Vendor login reloads the Vendor account, verifies active state and bcrypt hash, and includes linked IDs in the token. Login failures use a 10-attempt/15-minute in-memory limiter. Public inquiry has a separate 5/hour/IP limiter and honeypot.

The browser stores JWT and role/user metadata in localStorage; logout removes them and clears session storage. Protected requests send `Authorization: Bearer`. `verifyToken` checks signature/expiry. Production requires a configured JWT secret of at least 32 characters. `validateRole` enforces role boundaries; sensitive endpoints add resource ownership/assignment checks. A forced temporary-password token is denied protected functions until password change.

EventSource cannot attach the Authorization header, so only the status-stream endpoint explicitly accepts a query token; normal APIs reject URL tokens. Manager stream is global, Assessor stream is identity-scoped, and Vendor stream is filtered to linked IDs with a smaller event DTO.

Bearer rather than cookie authentication means browser CSRF based on ambient cookies does not apply. XSS/token theft remains the more relevant client risk. Functions currently emit wildcard CORS; no credentials flag is used. Express parser errors and bridge failures return safe generic JSON. Production/static security headers are configured. These are architecture facts for redesign planning; navigation changes should not create a second auth system.

## 14. SLA workflow

Default SLA is seven calendar days; package 1 is seven and package 2 is five. Explicit `slaDurationDays/customSlaDays` takes precedence. Start priority is stored `slaStartAt`, then assignment, scheduling, scheduled date, creation, then now. Scheduling/assignment stores the start/deadline so later resubmission does not restart it. Manager can enter a custom SLA duration during scheduling/assignment.

Active records are On Track, Due Soon at 48 hours or less, or Overdue after deadline. Completion uses `completedAt`, legacy approval, certificate delivery/signature or matching history; it becomes Completed On Time or Completed Late by comparing completion to the original deadline. Revision and resubmission remain within the same SLA unless an existing stored deadline is administratively changed. Approval alone normally moves to pre-final and therefore does not stop the current SLA engine; final `completed` does.

SLA appears in the dashboard primary cards, attention queue, repository filters/rows/details, workload tasks, exports, and status events. Summary plus contextual badges is justified, but detailed SLA metrics in several sections create repetition. The dashboard should show exceptions, while record detail/repository should show the exact deadline and history.

## 15. Assessor workload

The Manager-only workload endpoint loads all active Assessor accounts, including zero-task Assessors, and all non-deleted/non-inquiry evaluations. It matches account ID, assessor code, name and email variants. `completed`/legacy `approved` count as completed; `cancelled` is excluded; every other matched lifecycle value counts active. Active tasks are split by authoritative SLA.

Default capacity is 5. Zero tasks = `AVAILABLE`; 1–4 = `OPTIMAL`; 5 = `AT_CAPACITY`; >5 = `OVERLOADED`. Assignment above capacity produces a warning but remains possible. Unmatched active evaluations are reported as unassigned. Reassignment uses the same assignment endpoint and overwrites the authoritative identity fields with audit history.

Workload belongs in two places: a compact dashboard exception summary and the assignment decision context. A dedicated detailed workload view remains useful for balancing and reassignment. Three full independent representations would be excessive.

## 16. Payment workflow

The invoice establishes the expected package amount. Vendor proof records amount, date, method, transaction reference, optional receipt-document link and notes as `pending_verification`, without granting entitlement. Manager review sees the proof and either verifies it (payment `paid`, invoice `paid`) or uses a deliberate override with a required reason. Both paths can move the lifecycle to `payment_confirmed`.

Certificate preparation checks evidence directly: payment `paid`, legacy verified flag, or a stored reasoned override. A lifecycle label alone is insufficient. This is the certificate gate. The preparation endpoint can record its own explicit reasoned payment override; absent payment/override it returns `paymentBlocked` and writes no preparation date.

## 17. Certificate workflow

The certificate number is generated as `TS-CERT-<year>-<suffix>` unless a Manager supplies/preserves one. `certifiedVersion` resolves from existing certificate, `approvedVersion`, then `currentVersion`, binding the artifact to a snapshot. Prepare, print, sign and deliver each append history; sign requires a named DGO signatory and sets `certificate_issued`; delivery sets `completed`.

The browser PDF pipeline renders the official one-page certificate and QR verification URL from record data. Vendor download uses the scoped portal API; Manager can download from review/repository. The public verifier returns safe fields by certificate number. No explicit revocation data model or revocation transition is implemented, so redesign copy must not imply a complete revocation workflow without adding business rules.

## 18. Notifications

Status-changing handlers call `recordStatusEvent`, which emits to an in-process EventEmitter and retains the last 50 events in memory. `get-notifications` merges recent events with database-derived assignment and review outcome records. Assessor queries are replaced with token identity; Managers can see broader results; Vendor access to internal notification endpoint is denied, while Vendor receives its sanitized status stream and portal notification list.

SSE provides immediate updates; pages also reload/poll data and reconnect. Read/mark-all state is browser-local rather than a database notification entity. “Attention Required” is a task-priority calculation over current records; notifications are event/update information. They overlap in content but have different intent. The UI should avoid showing the same event simultaneously as a persistent alert and a task card without indicating which one requires action.

## 19. Current workflow problems

### Navigation problems

- The Manager completes a single record lifecycle across overview shortcuts, Companies & Assignments, repository, review modal, payment modal and certificate modal. These are one physical page but still require mental navigation between views.
- Administration (Team Accounts) sits beside operational assessment work.
- Assessor records can be opened from Assigned Work, My Submissions, alerts, drafts and peer-review surfaces with several labels.

### Duplicate actions and labels

- Review, Details, Open Details, Audit & Review and Review & Confirm converge on one record context.
- Request Revision, Request Changes, Reject and Return for Revision invoke the same nonterminal `rejected` transition.
- Approve, Approve Assessment and Confirm & Approve are the same decision plus confirmation.
- Prepare Notice, Send Pre-Final and Send Preliminary Results describe the same simulated notice stage.
- Schedule/Reschedule and Assign/Reassign are legitimate state variants, but repeated row/modal placement makes them appear separate.

### Responsibility confusion

- The system correctly blocks Manager technical submission, but proximity between Manager review/report detail and the Assessor matrix can make review look like editing.
- Vendor revision response changes the overall assessment to `submitted` and creates a version, while the Vendor is not allowed to rescore. The UI must say it submits supporting response/evidence, not a technical reassessment.

### Status confusion

- Internal `rejected` means “changes requested,” not terminal rejection.
- `pending_review` and `submitted` are both review-ready.
- `assigned` and `in_progress` are displayed/recognized but not consistently stored by the normal assignment/draft path.
- `pre_final_sent` can be set by score approval even though the separate notice handler is simulation-only; labels alternate among Pre-Final, Results Sent and Pre-Final Logged.
- Payment sub-status can be `pending_verification` while the main lifecycle remains `pre_final_sent`, producing two concurrent status concepts.
- Legacy `approved`, `cert_issued`, `remediation_required` and current values coexist in compatibility code.

### Too much information / missing context

- Manager dashboard secondary statistics, repository detail, risk, SLA and notifications repeat signals. Priority should be actionable exceptions; detail should remain one click away.
- Row-level decision buttons may invite action before scores, comments, evidence and version context are reviewed. Destructive/decisive actions belong in the complete review context even if a shortcut opens it.
- Vendor milestone/version/pre-final language exposes process complexity, though no protected internal data leak was found.

## 20. Proposed simplified workflow and navigation structure

Keep the stored state model for the first redesign and map it to stable user-facing phases. Make one record workspace the destination for every Manager shortcut. The workspace should present a task header, context, history and the actions valid for the current state. Overview and tables should open that workspace rather than rendering different action sets.

Recommended Manager navigation:

- **Dashboard:** Needs Attention, Today, Waiting for Review, Waiting for Payment, Ready for Certificate, overdue exceptions.
- **Assessments:** All Assessments; Review Queue; Schedule & Assignment; Assessor Workload.
- **Vendors:** Inquiries; Registrations; Vendor Accounts.
- **Finance & Certification:** Payment Verification; Certificates.
- **Reports:** assessment reports, export and operational/SLA summaries.
- **Administration:** Team Accounts; Notifications/profile/security.

Recommended task path: `Needs Attention → open complete record → perform one valid action → return to next task`. Review should always show score, Assessor comments, evidence, version and risk before Approve/Request Changes. Finance should show invoice and Vendor proof before Verify. Certification should show payment gate and a four-step progress control.

Recommended Assessor structure: My Work, Changes Requested, Submitted, Drafts, Peer Reviews. All Start/Resume/Fix actions open the same assessment workspace with visible assignment and revision context.

Recommended Vendor structure: My Assessments, Required Actions, Documents, Payments & Certificates, Company Profile. Show simple milestones and only expose version detail behind History.

## 21. Proposed lifecycle presentation

No enum rename is required initially:

| Existing data | Proposed UI phase |
|---|---|
| `registered` | Registered |
| `scheduled` with no Assessor | Scheduled |
| `scheduled` with Assessor / legacy `assigned` | Assigned |
| client draft / legacy `in_progress` | Assessment In Progress |
| `submitted` | Submitted |
| `pending_review` | Under Review |
| `rejected` | Changes Requested |
| `pre_final_sent` or approvedVersion+skip | Assessment Approved — Awaiting Payment |
| payment `pending_verification` | Payment Under Review |
| `payment_confirmed` | Payment Verified |
| payment confirmed + prepared/printed certificate | Certificate In Preparation |
| `certificate_issued` | Certificate Issued |
| `completed` | Completed |

If the business truly needs a terminal rejection, add a distinct future internal state such as a separately approved domain term only after requirements and migration are agreed. Do not repurpose current `rejected`, because it drives the working revision loop.

## 22. Features that should remain unchanged

- JWT authentication, production secret failure, password hashing and role boundaries.
- Vendor isolation and Assessor assignment/ownership checks.
- Manager/Assessor separation and Assessor-only 33-criterion authoring.
- Official rubric, exactly-33 validation, server score recomputation and comment limits.
- Immutable assessment version snapshots, approved/certified version linkage and legacy history fallback.
- Approved/payment/certificate-stage edit locks.
- SLA calculation and stored deadline continuity through revisions.
- Payment proof/Manager verification and reasoned override audit.
- Sequential certificate gate, public verification, QR and working PDF/report pipelines.
- MongoDB/local adapter, production no-fallback rule, indexes and soft deletion.

## 23. Redesign risks

| Proposal | Benefit | Affected UI/APIs/statuses | DB/migration | Regression/security risk |
|---|---|---|---|---|
| Task-focused Manager home | Faster next-action discovery | Dashboard presentation; overview/read APIs | None | Low; preserve authorization and global totals. |
| Central record workspace | Removes competing modal/row action sets and restores context | Dashboard/repository modals; existing detail/action APIs; all lifecycle states | None | Medium; many launch paths and state-specific actions must be retested. |
| Grouped navigation | Reduces menu hopping and separates administration | Dashboard tabs/navigation only | None | Low. Deep-link/focus/mobile regression risk. |
| Unified display labels | Makes lifecycle understandable without changing stored enums | All three role pages, reports/export labels | None | Medium; filtering and tests must continue using internal values. |
| Combined Schedule + Assignment task | Fewer Manager steps while retaining optional sequencing | Schedule/assignment forms and two existing endpoints | None initially | Medium; avoid double writes and preserve audit/SLA precedence. |
| Review Queue view | Keeps decisions in full context | Repository filters/detail; existing APIs | None | Low–medium. Must include submitted and pending_review consistently. |
| Finance & Certification workspace | Makes payment gate and certificate steps explicit | Payment/certificate UI and existing endpoints | None | Medium; must never infer entitlement from display phase alone. |
| Simplified Vendor milestones | Removes internal terminology | Vendor portal DTO presentation only | None | Low; retain evidence, revision, payment and certificate actions. |
| Server-backed Assessor drafts (future option) | Cross-device recovery | New endpoint/storage/ownership rules | Yes | High; not justified for the first redesign without requirement. |
| New terminal rejection status (future option) | Distinguishes closure from revision | Review UI, approval handler, filters, history and Vendor copy | Yes, migration/mapping | High; requires explicit business decision. |
| Persistent notification read state (future option) | Cross-device read/unread consistency | Notification endpoint/storage | Yes | Medium; current browser-local behavior is functional. |

## 24. Redesign priorities

| Area | Current problem | Proposed change | Priority | Risk |
|---|---|---|---|---|
| Status language | `rejected`, `submitted/pending_review`, and pre-final wording are inconsistent | Central UI label map; call current `rejected` “Changes Requested” | High | Medium |
| Manager review | Same actions appear in rows, overview and several modals | One complete record/review workspace; shortcuts open it | High | Medium |
| Manager navigation | Operational, finance and administration tasks coexist in a very large page | Group navigation by task domain | High | Low |
| Needs Attention | Events, SLA signals and actions compete | One prioritized actionable queue with reason and next action | High | Low |
| Payment/certificate | Main status and sub-status are hard to read together | One gated Finance & Certification progress view | High | Medium |
| Assessor entry points | Multiple labels open the same form | My Work/Changes Requested/Submitted structure | Medium | Low |
| Vendor lifecycle | Versions and pre-final mechanics are prominent | Simple milestones; history on demand | Medium | Low |
| Schedule/assignment | Related tasks are split and repeated | Guided combined task backed by existing endpoints | Medium | Medium |
| Notifications | Duplicates some Attention Required content | Separate informational updates from actionable tasks | Medium | Low |
| Workload | Summary and detail repeat | Keep dashboard exceptions plus assignment-context detail | Low | Low |
| New data model | No evidence current model prevents the workflow | Defer schema/state replacement | Low | High |

## 25. Conclusion

TrackScore does not presently need a ground-up workflow or security redesign. The implemented workflow is coherent and tested from inquiry through public certificate verification. It does need a navigation redesign and a status-presentation cleanup, followed by a focused visual redesign of the Manager record workspace. Smaller UX improvements are appropriate for Assessor entry points and Vendor terminology.

The first redesign phase should require no database migration: regroup navigation, centralize record actions, map internal states to consistent role-appropriate labels, and show task-specific context. Changes to stored statuses, server-backed drafts, terminal rejection, or notification persistence should be separate business/data projects with their own migration and regression plans.

Companion artifacts: [current complete workflow](system_workflow_current.txt) and [proposed simplified workflow](system_workflow_proposed.txt).
