# TrackScore button functionality audit

Audit date: 5 October 2026 (Asia/Kuala_Lumpur). Chromium on Ubuntu, Express server, isolated local JSON storage. Production records and .env were not used for browser mutations.

This report does **not** claim that every button works. It distinguishes native interactions with asserted outcomes from ambiguous source branches and controls without individual browser evidence.

## Counts

| Metric | Count |
| --- | ---: |
| Interactive source definitions before removals (same counting method) | 499 |
| Remaining interactive source definitions | 495 |
| Remaining button definitions | 304 |
| VERIFIED WORKING | 346 |
| PARTIALLY WORKING | 12 |
| VERIFIED BROKEN remaining | 0 |
| NOT TESTED | 137 |
| Repaired defects with browser retests | 5 |
| Duplicate controls removed | 4 |
| Payment controls removed in this audit | 0 |
| Active payment-control matches | 0 |
| Browser workflow assertions passed | 78 |
| Browser workflow assertions failed | 0 |
| External handoffs with delivery blocked from this audit | 1 |

Counts describe source control definitions on eight canonical pages and their linked JavaScript. Repeated loop instances and the mirrored public/ copies are not multiplied. Radio choices and comment inputs are generated from templates; the 33 individual criteria were selected and commented through the browser. Two disclosure summaries are included. The first inspection found 497 definitions before summaries were added; the comparable baseline is 499.

## Complete inventory and evidence

Every source definition has Page, Role, Label, ID/class, Expected action, Actual result and one requested status in [the CSV inventory](current-button-control-inventory.csv) and [the JSON inventory](current-button-control-inventory.json). Native event evidence links each tested entry to a named browser assertion.

| Page | Controls | Buttons |
| --- | ---: | ---: |
| landing.html | 32 | 7 |
| login.html | 11 | 5 |
| change-password.html | 6 | 3 |
| request-assessment.html | 16 | 1 |
| verify-certificate.html | 5 | 1 |
| index.html | 115 | 87 |
| dashboard.html | 265 | 172 |
| vendor-portal.html | 45 | 28 |

## Repaired controls

### landing.html: Information drawer tabs

- Expected: Each tab is visible and clickable.
- Actual before fix: Portals content shrank the tab bar to 1px; content intercepted native clicks.
- Root cause: Flex children were allowed to shrink in the scrolling drawer.
- Fix: Prevent header/tab-bar shrinking.
- Retest: Public mobile navigation, drawer tabs and close; Public layouts and drawer tabs reachable at all five requested sizes.
- Status: VERIFIED WORKING.

### dashboard.html: Edit record → Save Changes

- Expected: Save allowed registration metadata before assessment.
- Actual before fix: Browser validation blocked the request because assessor name was empty.
- Root cause: Assessor Name was unconditionally required for unassessed registrations.
- Fix: Require assessor name only when a technical breakdown exists.
- Retest: Manager edit allowed registration details and cancel.
- Status: VERIFIED WORKING.

### vendor-portal.html: Document Download

- Expected: Download uploaded file bytes.
- Actual before fix: A new window opened an unauthenticated API request (token in query string is rejected).
- Root cause: The frontend URL did not send the required Authorization header.
- Fix: Fetch with Bearer header; download the response blob; report API failures.
- Retest: Vendor documents upload, download and delete persist.
- Status: VERIFIED WORKING.

### vendor-portal.html: Navigation/profile/modal controls at phone width

- Expected: Keep existing actions reachable at 390×844.
- Actual before fix: The fixed-width navigation overflowed the viewport.
- Root cause: No narrow-screen wrapping rules.
- Fix: Wrap existing navigation/user controls and contain table/modal widths.
- Retest: Responsive important pages and modal controls at five sizes.
- Status: VERIFIED WORKING.

### dashboard.html: Clear Filters after zero-result search/filter

- Expected: Show the matching-results empty state and restore records on Clear Filters.
- Actual before fix: Server-filtered empty responses used the unfiltered No Evaluations Recorded Yet message and omitted Clear Filters.
- Root cause: The early zero-record branch bypassed the matching-results recovery action.
- Fix: Reuse the existing matching-results markup when any search/filter/queue is active.
- Retest: Manager quality summary cards apply each filter.
- Status: VERIFIED WORKING.

## Removed duplicates

Removed redundant Companies-table row actions: Assign, Assign Assessor, Schedule and Invoice. The assessor column retains Assign/Reassign; the schedule column retains Schedule/Reschedule; the invoice column retains Review & Confirm/Edit. Linked assessment Review remains. All assignment/schedule variants were natively clicked before removal and loaded the same record: [duplicate evidence](current-duplicate-button-evidence.json). Fresh workflow tests subsequently saved schedules and assignments using the retained controls.

## Role/workflow coverage

Public inquiry submission, mobile navigation, all drawer tabs, login role tabs and password visibility, certificate verification, and requested public viewport sizes were tested. Manager registration, conversion/dismissal, scheduling/rescheduling, assignment/reassignment, metadata edit, credentials copy/download, review/rejection/approval, version snapshots/comparison, risk refresh, certificates, report/Excel export, staff creation/reset/deletion, notifications and logout were tested. Assessor scoring of all 33 criteria, comment persistence, correction/resubmission, drafts, submissions, peer review, notifications and logout were exercised. Vendor profile/password, history, revision response, documents, certificates, verification and logout were exercised. Exact successful/failed outcomes are listed below and in the JSON files; this paragraph does not supersede a failed or untested inventory entry.

Direct API tests attempted forbidden actions with Assessor, Vendor and Manager tokens, including Manager technical submission. The tests assert 401/403 responses. Certificate preparation before approval was rejected. A rejected record exposes no Approve button until resubmission. Completed certificate actions are read-only/download operations.

The main workflow started with zero inquiries, users, vendors, assessments, versions and risk records. Empty Manager/Assessor/Vendor views were checked. Populated workflows included registered, scheduled, assigned, pending review, rejected/revision requested, resubmitted version 2, approved, certificate prepared/printed/signed/issued, and completed records. Native states were used rather than invented status labels.

## Payment removal

[Current scan](current-payment-control-scan.json): no active payment buttons, labels or API calls in canonical frontend files. Historical payment_confirmed/pre_final_sent values are mapped to Approved for old records. Retired verify-payment, vendor-submit-payment and send-pre-final routes return 410 and leave stored records unchanged. These are route retirement checks, not payment-button tests. No payment buttons were clicked. Package pricing/invoice administration remains; it does not verify or gate payment.

## Browser, network and regression results

- Browser console/page exceptions: 0 captured in the final suites.
- HTTP failures observed by page listeners: 0. Direct intentional API denials/retired routes were asserted separately.
- Cancelled requests: 195; recorded ERR_ABORTED requests arose when navigation, filters or page teardown cancelled pending fetch/SSE work. Other failures: 0.
- npm test: PASS — 191 tests, 37 suites, zero failures.
- npm run lint: PASS — tsc --noEmit.
- npm run build: PASS — frontend and server bundles generated.

Responsive evidence covers 1920×1080, 1366×768, 1024×768, 768×1024 and 390×844. It checks page overflow and sampled important modal actions, not every possible table-row/modal combination at every size. See current-responsive-*.png and the named responsive assertions.

## Limits and untested controls

137 source definitions have no individual successful native interaction; 12 are only partially verified. Do not interpret them as working or broken. The complete list is in the inventory with NOT TESTED/PARTIALLY WORKING statuses. Repeated state-specific template branches cannot all be certified from a click on only one rendered branch. Read-only fields, conditional retry/error controls and some secondary close/cancel variants were not all individually asserted. Earlier failed assertions remain in their raw artifacts; a later named retest supersedes them for the final outcome table.

The WhatsApp handoff is intercepted locally to inspect the generated destination and prefilled text; no message is sent and external delivery is not verified. A vendor-specific WhatsApp action, a separate Manager document viewer, and an Assessor version-history button do not exist in the current interface. Those requested labels could not be clicked; no new feature was added. Existing criteria, report, comment and Manager history views were tested. Physical printing/signing, external email delivery, live MongoDB Atlas persistence and operating-system print/mail applications are outside these isolated browser checks. All storage persistence claims concern the isolated JSON backend.

## Named browser outcomes

| Suite | Assertion | Status | Failure |
| --- | --- | --- | --- |
| current-button-workflow-results.json | All six application stores start at zero; preset-account login rejected | PASS |  |
| current-button-workflow-results.json | Test fixtures, JSON storage and QA artifacts are not served publicly | PASS |  |
| current-button-workflow-results.json | Explicit first-Manager setup creates exactly one chosen account | PASS |  |
| current-button-workflow-results.json | New Manager overview renders true empty states and responsive layout | PASS |  |
| current-button-workflow-results.json | Manager empty tables and backend-derived statistics remain zero | PASS |  |
| current-button-workflow-results.json | Manager creates Assessor via Team Accounts | PASS |  |
| current-button-workflow-results.json | Assessor empty submissions and notifications render without sample records | PASS |  |
| current-button-workflow-results.json | Vendor account created through UI; empty portal contains no fabricated assessments | PASS |  |
| current-button-workflow-results.json | Public Inquiry creates a record through the actual form | PASS |  |
| current-button-workflow-results.json | Inquiry conversion creates registered assessment and real invoice | PASS |  |
| current-button-workflow-results.json | Vendor account links to registration through credential workflow | PASS |  |
| current-button-workflow-results.json | Scheduling and assignment save through real handlers | PASS |  |
| current-button-workflow-results.json | Assessor completes all 33 criteria and submits assigned registration in place | PASS |  |
| current-button-workflow-results.json | Certificate API blocks before approval and denies Assessor and Vendor roles | PASS |  |
| current-button-workflow-results.json | Manager requests changes; Assessor revises and resubmits version 2 | PASS |  |
| current-button-workflow-results.json | Manager approves version 2 directly to certificate readiness without creating payment data | PASS |  |
| current-button-workflow-results.json | Manager prepares, prints, signs and delivers through certificate modal controls | PASS |  |
| current-button-workflow-results.json | Vendor downloads genuine workflow certificate and public verification succeeds | PASS |  |
| current-button-workflow-results.json | Retired Express and Netlify payment routes return 410 without changing records | PASS |  |
| current-button-workflow-results.json | Vendor milestones and Manager completed certificate download remain usable | PASS |  |
| current-button-supplement-results.json | Public mobile navigation, drawer tabs and close | PASS |  |
| current-button-supplement-results.json | Public role tabs and password visibility | PASS |  |
| current-button-supplement-results.json | Public verification button resolves delivered certificate | PASS |  |
| current-button-supplement-results.json | Manager overview profile, notifications, refresh, search and filters | PASS |  |
| current-button-supplement-results.json | Manager repository filters, search, refresh and reset | PASS |  |
| current-button-supplement-results.json | Manager Excel export downloads XLSX bytes | PASS |  |
| current-button-supplement-results.json | Manager completed details, version snapshots, compare and risk recalculate | PASS |  |
| current-button-supplement-results.json | Manager report open, PDF download and close | PASS |  |
| current-button-supplement-results.json | Manager new registration resets stale state and saves | PASS |  |
| current-button-supplement-results.json | Manager scheduling then rescheduling reloads saved record | PASS |  |
| current-button-supplement-results.json | Manager assign then reassign keeps selected identity | PASS |  |
| current-button-supplement-results.json | Manager edit allowed registration details and cancel | PASS |  |
| current-button-supplement-results.json | Manager staff create, generate password, reset and delete | PASS |  |
| current-button-supplement-results.json | Manager vendor credentials generate, copy and download | PASS |  |
| current-button-supplement-results.json | Manager inquiry Dismiss persists and removes action | PASS |  |
| current-button-supplement-results.json | Manager archive confirmation stores deletion | PASS |  |
| current-button-supplement-results.json | Manager logout clears token | PASS |  |
| current-button-supplement-results.json | Assessor My Work, peer review, notifications and scoring tabs | PASS |  |
| current-button-supplement-results.json | Assessor save, restore, export and delete draft preserve score and comment | PASS |  |
| current-button-supplement-results.json | Assessor notification filters, refresh and collapse | PASS |  |
| current-button-supplement-results.json | Assessor completed submission View is read only | PASS |  |
| current-button-supplement-results.json | Assessor logout clears token | PASS |  |
| current-button-supplement-results.json | Vendor My Assessments, notifications and close | PASS |  |
| current-button-supplement-results.json | Vendor profile save persists and password tabs switch | PASS |  |
| current-button-supplement-results.json | Vendor documents upload, download and delete persist | PASS |  |
| current-button-supplement-results.json | Vendor history and certificate verification link open correct record | PASS |  |
| current-button-supplement-results.json | Vendor certificate download has PDF bytes | PASS |  |
| current-button-supplement-results.json | Vendor password change verifies old password and persists new password | PASS |  |
| current-button-supplement-results.json | Vendor logout clears token | PASS |  |
| current-button-secondary-results.json | Unauthorized API actions reject all sensitive role combinations | PASS |  |
| current-button-supplement-results.json | Responsive important pages and modal controls at five sizes | PASS |  |
| current-button-extended-results.json | Manager review loads correct record and peer comment persists | PASS |  |
| current-button-extended-results.json | Manager reject modal Cancel, close, repeat open then request changes | PASS |  |
| current-button-extended-results.json | Manager rejected record has no approval action before resubmission | PASS |  |
| current-button-extended-results.json | Assessor peer review opens, posts comment and closes through footer | PASS |  |
| current-button-extended-results.json | Assessor own comments, work search, refresh and report download | PASS |  |
| current-button-extended-results.json | Assessor draft backup import, form clear, sidebar sections and Escape dismissal | PASS |  |
| current-button-extended-results.json | Vendor Required Actions revision modal cancels, reloads notes then resubmits | PASS |  |
| current-button-extended-results.json | Vendor repeated document modals load correct record and close | PASS |  |
| current-button-extended-results.json | Manager notifications record opens correct details | PASS |  |
| current-button-extended-results.json | Manager certificates queue View All and clear return to repository | PASS |  |
| current-button-extended-results.json | Manager combined assessment PDF downloads actual bytes | PASS |  |
| current-button-extended-results.json | Manager overview statistics disclosure toggles | PASS |  |
| current-button-extended-results.json | Manager Companies search and status filter apply to table | PASS |  |
| current-button-extended-results.json | Staff credential copy and WhatsApp handoff URL (external delivery not tested) | PASS |  |
| current-button-extended-results.json | Manager account password page toggles, changes password and redirects | PASS |  |
| current-button-extended-results.json | Public layouts and drawer tabs reachable at all five requested sizes | PASS |  |
| current-button-secondary-results.json | Manager View All navigation, workload refresh, task details and repository filter | PASS |  |
| current-button-secondary-results.json | Manager quality summary cards apply each filter | PASS |  |
| current-button-secondary-results.json | Manager retained invoice action confirms draft then edits stored invoice | PASS |  |
| current-button-secondary-results.json | Manager repeated registration, schedule, assignment, invoice and edit close/cancel controls preserve record | PASS |  |
| current-button-secondary-results.json | Manager record credentials open through existing Login Info action and Copy All | PASS |  |
| current-button-secondary-results.json | Manager report Audit & Review, header close and history Back actions | PASS |  |
| current-button-secondary-results.json | Assessor header navigation, refresh, new assessment and mark all notifications read | PASS |  |
| current-button-secondary-results.json | Assessor all criterion descriptions open and close through icon controls | PASS |  |
| current-button-secondary-results.json | Assessor draft modal header, save-as-new, delete confirmation and cancel | PASS |  |
| current-button-secondary-results.json | Assessor own report disclosure summary and header/footer close | PASS |  |
| current-button-secondary-results.json | Public local navigation links are actually clicked | PASS |  |

## Reproduce

Use Node.js 22.12+ and installed project dependencies. Browser tools live outside project dependencies:

```bash
npm install --prefix /tmp/trackscore-audit-tools playwright linkedom
/tmp/trackscore-audit-tools/node_modules/.bin/playwright install chromium
npm run build
node scripts/payment-removal-browser-setup.mjs
```

Start dist/server.cjs with cwd set to the generated sandbox in qa/payment-removal-state.json (port 3018), then run current-button-workflow.mjs, current-button-supplement.mjs and current-button-extended.mjs and current-button-secondary.mjs in that order (the secondary suite uses AUDIT_MANAGER_PASSWORD=ManagerChanged42!). The extended suite changes the isolated Manager password at its end. Alternatively run node scripts/current-button-audit.mjs to create the sandbox, choose a free port, run all four browser suites and regression checks, and generate the report. Generate the source inventory and report using button-audit-inventory.mjs and current-button-report.mjs. Reset/recreate the sandbox before replaying the whole sequence. Never point these mutation suites at production.
