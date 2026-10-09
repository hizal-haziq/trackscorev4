# TrackScore Manager Dashboard redesign

Date: 1 October 2026

The Manager landing view now prioritizes assessment tasks, deadlines, reviews, workload and pending operational work. TrackScore's existing logo, Inter typography, charcoal header, orange actions, terminology and workflow modals were retained. Vendor, Assessor, login, certificate, report and registration-form designs were not changed.

## Original layout findings

- Four general statistics, seven SLA cards and four quality cards appeared before the full assessment repository. These competed for attention without identifying the Manager's next task.
- Today’s schedule and actionable payment/certificate queues had no concise overview. Workload information required opening its dedicated tab.
- The full repository had many fields, filters and row actions appropriate to detailed administration but excessive for an overview.
- Assessment Form appeared in both the header and title area. Registration belonged to the assignments toolbar rather than a single obvious primary action.
- Existing Atlas list summaries covered the fetched page. Using them as global dashboard totals would undercount records outside that page.

## New hierarchy and retained functionality

1. Compact TrackScore header, established navigation, Notifications and Manager Profile.
2. Manager Dashboard title, short explanation and one New Registration action.
3. Four summary cards: Active Assessments, Waiting for Review, Due Soon and Overdue.
4. Attention Required: one action per record, with overdue work first, then payment verification, review, certificate action and due-soon work. At most eight highest priorities are shown, with the total visible.
5. Recent Assessments beside Today’s Schedule on desktop. The overview table has Company, Assessor, Status, SLA, Updated and one action. Search and two labeled filters operate across records, while global totals remain unchanged.
6. Assessor Workload: highest active workload first, up to six Assessors; actual backend capacity and warnings are retained. View All opens the existing workload page.
7. Smaller Payment Verification, Certificates and SLA Performance summaries. Payment/certificate links filter the existing repository rather than opening a second management workflow.
8. Existing statistics, SLA detail and quality filters in a collapsed secondary section. Their repository filter/page scope is stated explicitly.

The existing All Assessments, Companies & Assignments, Applications & Inquiries and Assessor Workload tabs remain. Team Accounts moved beside that navigation. The existing top navigation style was kept; a new sidebar was not introduced. No charts were added.

All existing review, scheduling, assignment, reassignment, account, payment, certificate, history, report/export and document interfaces remain available. Overview shortcuts open the same modals. Manager Review continues to show Assessor scores/comments without adding a 33-criterion editing form.

## Buttons consolidated and interaction fixes

| Control | Result and reason |
| --- | --- |
| Title-area View Assessment Form (`btn-audit-matrix`) | Removed: exactly duplicates the retained header Assessment Form link and destination. It had no exclusive event listener. |
| Assignments-toolbar Register Customer (`btn-open-register-modal`) | Replaced by the single New Registration action in the title area, calling the same `openRegisterCustomerModal`. The form and submission handler are unchanged. |
| Team Accounts | Moved beside navigation; retained its ID and existing handler. |
| Overview row actions | One Review or Details action per recent row. Existing repository secondary actions remain in the detailed administration view. |
| Four quality filter cards | Converted to native keyboard-accessible buttons. Their handler now opens the repository after selecting the quality filter; previously, moving the cards left the filtered repository hidden. |
| Payment/certificate summaries | Open the existing repository with a clearly labeled queue. Clear Filter removes that queue. The existing Clear Filters action also clears it. |
| Modal shortcuts | Fetch the selected record once with complete Manager metadata, preserving assignment, scheduling, contacts and pre-final-skip state. This also avoids a second lookup for the review breakdown. |

Review and revision filters group the existing status variants under simple labels. No stored enum was renamed. In this project, `rejected` means returned to the Assessor for revision; the overview displays Revision Required and keeps it active. The Assessor remains responsible for revisions until resubmission.

## API and data handling

- Added optional Manager-only `view=overview` mode to `get-evaluations`. It aggregates across all nondeleted, noninquiry records after existing deduplication, independently of the eight-row overview limit and recent filters.
- The overview reuses `attachSlaToRecord`, `computeSlaAggregateSummary` and `calculateAssessorWorkloads`, including configured capacity. It does not implement another SLA or capacity calculation.
- Payment verification counts require saved pending-verification evidence. Certificate queues require recorded verified/paid/overridden payment state and an eligible lifecycle stage; a sent pre-final alone does not qualify.
- Added optional `queue=payments` and `queue=certificates` filters to the existing repository API. Existing pagination, role scoping and response shape remain.
- Added optional `fullDetails=true` to `lookup-evaluation` for Managers. Other roles retain the existing response projection and ownership checks; Vendors remain forbidden.
- Notification summaries use the existing notifications endpoint. Read timestamps are scoped to the authenticated Manager in browser storage. Notifications have their own compact dialog; the dashboard does not duplicate their full list.
- Existing polling and SSE are retained. On the overview, SSE refreshes the aggregate snapshot rather than separately fetching the repository and workload. Requests are abortable; no per-card, per-Assessor or per-row requests are used to populate the overview. Only opening a selected record triggers its detail lookup.
- No data model, security rule, score calculation, payment requirement or certificate lifecycle was changed. No production records or accounts were created. All six application JSON stores remain empty after verification, and Atlas was not modified.

## Responsive and accessibility changes

- Desktop: four summary cards, approximately 65/35 recent/schedule columns and three operational summaries.
- Tablet: two summary cards per row and stacked main panels.
- Mobile: one summary card and one operational panel per row; wrapped existing navigation; labeled filters stack; the table scrolls within its own keyboard-focusable region.
- Buttons have readable text and large click targets. Focus outlines are visible. Status badges contain text, so color is not the only signal.
- Profile/notifications use native dialogs with keyboard Escape support. Existing operational modals were preserved and checked at mobile size.
- Loading uses a visible status and pending metric marks. Failure shows plain-language error, Retry and a last-loaded-data label instead of presenting stale values as current.

## Files modified or added for this redesign

| Files | Purpose |
| --- | --- |
| `dashboard.html`, `public/dashboard.html` | Layout, consolidated controls, queue context, secondary filters and overview-aware SSE. |
| `manager-overview.css`, `public/manager-overview.css` | Manager-specific styling and responsive layout; shared stylesheet unchanged. |
| `manager-overview.js`, `public/manager-overview.js` | Overview rendering, search/filter state, existing-modal shortcuts, profile/notifications and request cleanup. |
| `netlify/functions/manager-overview.js` | Aggregate presentation data using established domain helpers. |
| `netlify/functions/get-evaluations.js` | Overview mode and repository queue filters. |
| `netlify/functions/lookup-evaluation.js` | Explicit Manager-only full metadata for modal shortcuts. |
| `tests/manager-overview.test.js` | Nine regression checks for zero data, complete totals, grouped statuses, queue eligibility, schedule timezone, workload, priority/revisions, access control and detail metadata privacy. |
| `scripts/manager-redesign-browser-setup.mjs`, `scripts/manager-redesign-workflow-verify.mjs`, `scripts/manager-redesign-browser-verify.mjs` | Isolated reproducible Chrome validation. |

Earlier task changes remain in the working tree; this list identifies the redesign scope rather than attributing all existing repository differences to this task.

## Screenshots

Before: [original empty Manager view from the preceding cleanup audit](qa/dummy-cleanup-empty-manager.png).

After: [empty desktop](qa/manager-redesign-empty-1366.png), [populated desktop](qa/manager-redesign-populated-1366.png), [empty mobile](qa/manager-redesign-empty-390.png), [populated mobile](qa/manager-redesign-populated-390.png).

Additional screenshots for 1920, 1024 and 768 pixel widths are in `qa/manager-redesign-{empty,populated}-WIDTH.png`. Images were inspected to check hierarchy, readable spacing and stacking as well as automated overflow assertions.

## Verification results

| Verification | Result | Evidence |
| --- | --- | --- |
| `npm test` | 180 passed; 0 failed, skipped or cancelled | [Test log](qa/manager-redesign-npm-test.log) |
| `npm run lint` | Passed (`tsc --noEmit`) | [Lint log](qa/manager-redesign-lint.log) |
| `npm run build` | Passed Vite frontend and esbuild server builds | [Build log](qa/manager-redesign-build.log) |
| Root/public parity | All 18 paired files identical, including the two new assets | [Parity log](qa/manager-redesign-parity.log) |
| Fresh empty-state/full-workflow Chrome run | 16/16 passed | [Workflow results](qa/manager-redesign-workflow-browser-results.json) |
| Populated dashboard/action/responsive Chrome run | 14/14 passed | [Dashboard results](qa/manager-redesign-browser-results.json) |

Browser tests used installed Google Chrome with real local handlers and separate temporary JSON storage. Empty-state checks began with zero users, Vendors, assessments, payments, certificates, notifications and schedules, then used explicit first-Manager setup. The workflow created Manager/Assessor/Vendor accounts, inquiry, registration, invoice, assignment and scheduling through the real interfaces; completed all 33 criteria with comments; submitted and reviewed; verified payment; issued and downloaded a certificate; and passed public verification. Vendor isolation and the unpaid pre-final state were also checked.

The populated test created additional records through actual registration and assessment endpoints. They covered in-progress work, waiting review, revision requests, due-soon/overdue deadlines, approved results awaiting payment, proof awaiting verification and verified payment ready for certificate preparation. A deliberately short configured SLA in the isolated workspace exercised real deadline expiry without directly inserting or modifying a fake overdue record. Current approvals advance to `pre_final_sent`; no artificial legacy `approved` record was inserted merely to populate that enum.

Dashboard actions actually exercised: New Registration and form submission; Attention Review/Verify/Issue; Request Changes and persisted revision; recent/schedule Details; workload Details/View All; repository View All; payment/certificate queue links and Clear Filter; search/status/SLA filters; all four quality filters using keyboard activation; retained navigation tabs; Home and Assessment Form destinations; Profile/Change Password destination; Notifications/notification Details; Refresh/Retry; keyboard dialog dismissal; mobile registration modal; and Sign Out.

Both empty and populated views were checked at **1920×1080, 1366×768, 1024×768, 768×1024 and 390×844**. No whole-page horizontal overflow or undefined/NaN/object text was detected. Mobile tables deliberately scroll inside their own region.

## Remaining issues and limits

- No uncaught JavaScript exceptions or unexpected failed workflow API requests were recorded in the final runs. The error-state test deliberately injected one HTTP 503 and verified successful Retry recovery; it is recorded separately from genuine failures.
- The full-workflow run recorded the existing favicon HTTP 404 console message. The build retains its two existing classic `/api/config.js` script-tag warnings; compilation succeeds.
- Detailed repository scoring/quality/SLA statistics retain their existing filter/page scope, now explicitly labeled and placed in the secondary section. The four primary metrics and operational SLA summary use the new global aggregate.
- Atlas aggregation logic was inspected, but final browser tests used isolated JSON storage. No write or deployment to the live Atlas application was performed. Large-production-dataset latency was not benchmarked; the aggregate uses existing workload calculations and lightweight record projections.
- Existing report/export, immutable version and security regressions pass. The full certificate path was repeated in Chrome; every branch of every unchanged administrative modal was not repeated beyond the preceding comprehensive button audit and the current regression suite.

No redesign changes remain untested in the described paths. The dashboard is ready for local review using the linked screenshots and browser evidence.
