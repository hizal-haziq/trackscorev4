# TrackScore Full System Verification Report

Generated: 2026-10-01 (local test environment)

This report records fresh tests run against the current source. Historical QA artifacts were not used as current results. All write-based application tests ran on isolated JSON stores under the system temporary directory. The configured Atlas database was only pinged and counted; its records were not changed.

## Environment

- Windows PowerShell, Node.js v22.2.0, npm, and Google Chrome headless through Playwright.
- The project start command is `npm start` (`node dist/server.cjs`). It started successfully on port 3012 in an isolated copy using JSON fallback. A second isolated copy on port 3013 supported role-control probes.
- MongoDB Atlas was reachable for a direct read-only ping and `countDocuments` on six collections: users 2, vendors 7, evaluations 86, inquiries 5, assessment versions 209, assessment risk 2; total 311. See [read-only Mongo evidence](full-system-mongodb-readonly-current.json). No Atlas write workflow was attempted because the configured database contains real records and no staging URI was available.
- No Resend, SMTP, SendGrid, or Mailgun provider configuration was present. No email was sent.

## Commands Run

| Command | Exit | Result |
|---|---:|---|
| `npm test` | 0 | 185 passed, 0 failed, 0 skipped; 36 suites; 7,015 ms. [Output](full-system-npm-test-current.log) |
| `npm run lint` | 0 | `tsc --noEmit` passed. [Output](full-system-lint-current.log) |
| `npm run build` | 0 | Vite and esbuild completed; `dist/server.cjs` generated. [Output](full-system-build-current.log) |
| `npm start` | 0 | App started on 3012 in isolated JSON mode. Startup output was observed in the terminal. |

The successful build reports two existing Vite warnings: the classic `/api/config.js` scripts in `index.html` and `dashboard.html` are not bundled because they lack `type="module"`. Both server endpoints were directly checked and returned HTTP 200 (`/api/config.js`, `/api/config`).

## Verification Matrix

| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Authentication | Manager login, invalid credentials, protected access, logout | VERIFIED WORKING | Browser login/logout and API 401 checks; session cleared on logout. |
| Authentication | Assessor login and assigned-work access | VERIFIED WORKING | Assessor UI opened assigned submission and completed it. |
| Authentication | Vendor login and own portal | VERIFIED WORKING | Vendor login, portal data, password change, and logout tested. |
| RBAC | Assessor/Vendor denied Manager-only operations | VERIFIED WORKING | 11 forbidden role-operation calls returned 403; invalid/missing/expired tokens returned 401. |
| Security | Vendor isolation across assessments, documents, payment, revisions, notifications | VERIFIED WORKING | Cross-vendor requests returned 403; Vendor portal omitted internal comments and unrelated assessments. |
| Public | Inquiry form submission and Manager visibility | VERIFIED WORKING | Real browser submission created an inquiry; Manager converted it. |
| Registration | Inquiry conversion, registration and invoice | VERIFIED WORKING | Conversion produced a registration and invoice in JSON storage. |
| Vendor account | Credential generation and registration association | VERIFIED WORKING | Manager generated credentials, linked the Vendor to the registration, and the Vendor authenticated with the generated password. Stored password was hashed. |
| Manager | Team Account create, reset, delete | VERIFIED WORKING | Browser controls created/reset/deleted a test Assessor account. Password show/hide toggles were separately tested in both modals. |
| Password | Vendor current-password change | VERIFIED WORKING | New password accepted; prior password rejected in role-control workflow. |
| Scheduling | Schedule and assign an assessment | VERIFIED WORKING | Browser actions called the schedule/assignment APIs and persisted date and account identity. |
| SLA | SLA start/deadline and dashboard warning | VERIFIED WORKING | Seven-day SLA persisted; populated dashboard overdue/priority summaries matched created records. |
| Assessor | Complete and submit all 33 criteria | VERIFIED WORKING | All 33 score groups and all 33 comment fields were entered; submission persisted and Manager review received it. |
| Assessor | Criterion comment save, reload, XSS and length validation | VERIFIED WORKING | Comments on criteria 1, 2, 10, 20 and 33 survived reload/version 2; script text did not execute; tampered scores and 2,001-character comments returned 400. |
| Assessor | Save draft and download draft backup | VERIFIED WORKING | Draft and comments persisted; backup JSON downloaded. |
| Revisions | Manager request, Assessor correction, version 2 resubmission | VERIFIED WORKING | Rejection reason appeared; revised comments persisted; original version snapshot stayed unchanged. |
| Security | Cross-Assessor takeover and spoofing | VERIFIED WORKING | Unassigned Assessor attempts returned 403; record remained unchanged. |
| Security | Approved-record immutability | VERIFIED WORKING | Direct modifications returned 403 and the approved record remained unchanged; correction action was absent. |
| Manager review | Details, comments, approve, reject, Request Changes | VERIFIED WORKING | Browser/API flows tested, including required revision reason and persisted Manager comment. |
| Vendor revisions | Vendor response to requested revision | VERIFIED WORKING | Submit persisted Vendor response and updated the record. |
| Payment | Vendor submits proof; Manager verifies | VERIFIED WORKING | Amount/reference/date persisted; Manager verification updated payment status. |
| Certificate gate | Preparation before verified payment | VERIFIED WORKING | API returned 400 with payment-blocked response; no certificate preparation date was written. |
| Certificate | Prepare, print, sign, deliver lifecycle | VERIFIED WORKING | Each step persisted; final record became completed. |
| Certificate PDF | Vendor download and visual review | VERIFIED WORKING | Fresh one-page PDF downloaded and visually inspected; company, device, score, signatory, dates and QR were visible without cropping. [PDF](full-system-workflow-workflow-certificate.pdf) · [Rendered page](full-system-workflow-workflow-certificate-current-page-1.png) |
| Certificate verification | Valid, invalid and missing identifier | VERIFIED WORKING | Valid identifier returned 200/valid; invalid returned 404; missing returned 400. |
| Assessment report | Manager PDF download and visual review | VERIFIED WORKING | PDF opened as one page; all 33 criteria, scores and sign-off were visible without clipping. [PDF](full-system-assessment-report.pdf) · [Rendered page](full-system-assessment-report-current-page-1.png) |
| Exports | Manager Excel export | VERIFIED WORKING | Downloaded workbook opened and contained expected rows and one worksheet. |
| Documents | Upload, MIME validation, size limit, download/delete, ownership | VERIFIED WORKING | Valid document bytes round-tripped exactly; unsupported type returned 400; cross-Vendor denied; oversize returned 413 without storage. |
| Notifications | Manager/Assessor in-app notifications; Vendor restriction | VERIFIED WORKING | Manager and Assessor received access; Vendor and unrelated Vendor received 403; read/refresh/collapse controls exercised. |
| Real time | Authenticated SSE scope and reconnect | VERIFIED WORKING | Reconnect succeeded; unrelated Vendor received zero events; identity/scope failures were denied. |
| Dashboard | Empty-state Manager, Assessor and Vendor pages | VERIFIED WORKING | Stores began empty; no seeded login succeeded; displayed counts were zero and empty messaging rendered. |
| Dashboard | Populated summary, schedule, workload, payment/certificate and SLA data | VERIFIED WORKING | Browser results matched records created through the application APIs. |
| Dashboard | Search, status/SLA/risk filters, sorting and clear/view-all | VERIFIED WORKING | Browser filter/search controls changed the expected query/repository state; keyboard activation covered all four quality filters. |
| Controls | Navigation, modals, Manager/Assessor/Vendor workflow controls | VERIFIED WORKING | 70 named role-control checks passed, including scheduling, assignment, payment, certificates, submissions, uploads, profile, password, exports and modal close behavior. |
| Responsive UI | Eight pages at 1920×1080, 1366×768, 1024×768, 768×1024, 390×844 | VERIFIED WORKING | 40 page/viewport checks; no horizontal overflow. |
| Production exposure | Dummy data and QA files | VERIFIED WORKING | Empty stores stayed empty before user actions; QA fixtures, JSON stores and reports returned 404 when requested publicly. |
| Errors | Oversize and malformed JSON handling | VERIFIED WORKING | Oversize returned safe JSON 413; malformed JSON returned safe JSON 400; neither leaked a stack or changed storage. [Evidence](full-system-error-handling-current.json) |
| Assets | Root/public parity | VERIFIED WORKING | All 18 matching root/public files had identical SHA-256 hashes after the updates. |
| Database | Atlas connectivity and read-only counts | VERIFIED WORKING | Ping succeeded and six collection counts were read without mutation. |
| Database | Full workflow using Atlas-backed writes | BLOCKED | No staging Mongo URI was available; writing to the connected database would modify the 311 real records. JSON fallback workflows were fully exercised instead. |
| Messaging | Automatic email delivery | BLOCKED | No mail provider configuration was present; delivery was not attempted. |
| Credential sharing | Clipboard/TXT/WhatsApp handoff controls | NOT TESTED | Account creation and generated-password login were tested; external/share handoff was not separately exercised. |
| Public abuse controls | Inquiry honeypot and rate-limit behavior | NOT TESTED | No dedicated abuse/rate-limit run was performed. |
| Assignment | Reassign an already assigned assessment to a different Assessor | NOT TESTED | Initial assignment and identity persistence were tested; a second-Assessor reassignment was not separately executed. |
| Control inventory | Every conditional/dynamic row action individually clicked | PARTIALLY WORKING | 546 controls were inventoried (343 buttons, 203 other controls; 416 static and 130 dynamic templates). All 226 static buttons received native probes: 220 passed; 3 zero-sized zero-count cards could not be physically clicked in an empty fixture but keyboard activation/filter behavior passed in the dashboard test; 3 controls absent before their dynamic modals were separately tested in the actual password workflows. Seventy explicit role-control checks passed. Repeated conditional row actions were sampled through their workflows rather than every possible record state. See [inventory](full-system-control-inventory.json), [click probes](full-system-click-probes.json), and [role-control results](full-system-role-control-results.json). |

## Browser Test Results

- Full three-role inquiry-to-certificate workflow: 17/17 checks passed. [Results](full-system-workflow-browser-results.json)
- Assessment revision, versioning, XSS and immutability: 6/6 passed. [Results](full-system-revision-results.json)
- Authentication, RBAC, isolation, documents, SSE and exports: 14/14 passed. [Results](full-system-runtime-results.json)
- Manager dashboard workflows and responsive states: 14/14 passed. [Results](full-system-dashboard-browser-results.json)
- Role-based control flows: 70/70 passed; 220/226 static native click probes passed, with the six conditional/zero-state cases explained in the matrix. [Results](full-system-role-control-results.json)
- After adding explicit icon links to the four affected pages, Chrome reopened login, password-change, Vendor portal and certificate-verification pages: zero failed responses and zero console errors. [Evidence](full-system-error-handling-current.json)
- PDF text extraction returned no text because these PDFs are image-rendered; both page images were reviewed visually.

## Broken Features Found and Fixed

1. **Assigned Assessor could not submit.** The real Manager assignment stored the Assessor account `_id` in `assignedAssessorId`, while `save-evaluation` compared only the separate assessor code. The assigned Assessor received HTTP 403 after completing the form. Ownership validation now accepts either authenticated account ID or assessor code while retaining the same-account check. The full browser workflow and cross-Assessor denial tests passed after the fix. See [save-evaluation.js](../netlify/functions/save-evaluation.js).
2. **Missing favicon request on four pages.** Chrome requested `/favicon.ico` and reported 404. Added the existing TrackScore SVG as the icon in root and `public/` copies. Reopened all four pages; zero failed responses and zero console errors. See [login.html](../login.html), [change-password.html](../change-password.html), [vendor-portal.html](../vendor-portal.html), [verify-certificate.html](../verify-certificate.html).
3. **Oversize/malformed JSON exposed Express’s default HTML stack page.** Oversize upload returned 413 with `PayloadTooLargeError` stack content. Added safe JSON parser-error handling: oversized requests return a generic 413, malformed JSON returns a generic 400. Retests confirmed safe response bodies and unchanged storage. See [server.ts](../server.ts).

No production buttons were removed or renamed. All 343 button controls were retained; no redundant action was removed based on ambiguity.

## Remaining Issues and Limits

- Atlas-backed writes and automatic email delivery remain unverified for the reasons in the matrix.
- Credential clipboard/TXT/WhatsApp handoff, public anti-spam behavior, and second-Assessor reassignment were not separately tested.
- The button sweep exercised all static button entries and the important role-based workflows, but did not individually exercise every conditional repeated-row action in every possible record state.
- The two build-time `/api/config.js` bundling warnings remain; both runtime endpoints returned HTTP 200.

## Remaining Concerns Follow-up

Follow-up run: 2026-10-02. All application writes in this section used the isolated JSON store in the system temporary directory. The Atlas database was not modified. Evidence summary: [remaining-concerns-evidence.json](remaining-concerns-evidence.json).

### `/api/config.js` build warnings and client configuration

- **Concern:** Vite treated `/api/config.js` as a build asset.
- **Original status:** WARNING.
- **Investigation:** The exact warnings were `<script src="/api/config.js"> in "/index.html" can't be bundled without type="module" attribute` and the same warning for `/dashboard.html`. The route is generated at runtime by Express and by `netlify/functions/config.js`; it is not a frontend module. No frontend code consumed `APP_CONFIG`, so those script references served no current workflow.
- **Root cause:** Four unused classic-script references in the root and `public/` copies made Vite try to bundle a runtime route.
- **Change:** Removed the four unused script references. Kept both runtime handlers intact for compatibility.
- **Test:** `npm run build` completed with zero Vite warnings. Chrome fetched `/api/config.js` successfully (200; `window.APP_CONFIG = {};`). The Netlify generator was run with sentinel JWT, MongoDB, and email secrets; none appeared in its response. The four affected HTML copies contain no `/api/config.js` script reference.
- **New status:** VERIFIED WORKING.
- **Evidence:** [runtime smoke script](../scripts/remaining-concerns-runtime-smoke.mjs), [build output from this run](remaining-concerns-evidence.json).

### Dynamic and conditional interactive controls

- **Concern:** Repeated row actions were not tested in every possible record state.
- **Original status:** PARTIALLY VERIFIED (listed as PARTIALLY WORKING in the original matrix).
- **Investigation:** The prior inventory counted 546 controls: 343 buttons and 203 other controls. It recorded native probes for 226 static buttons (220 passed); six controls were zero-state or only rendered inside dynamic workflows. Seventy role-control checks passed.
- **Root cause:** Repeated conditional actions depend on record state and were sampled through representative workflows rather than individually clicked for every possible row/state combination.
- **Change:** No controls were removed. Follow-up browser checks exercised credentials, reassignment, pre-final notice preparation, and both certificate download edge cases.
- **Test:** The 17-check three-role workflow, 70 role-control checks, credential handoff checks, and reassignment flow ran in Chrome. Console exceptions and failed network responses were zero in those runs.
- **New status:** PARTIALLY VERIFIED.
- **Evidence:** [control inventory](full-system-control-inventory.json), [click probes](full-system-click-probes.json), [role-control results](full-system-role-control-results.json), [credential handoff script](../scripts/remaining-concerns-credentials.mjs), [reassignment script](../scripts/remaining-concerns-reassignment.mjs).

### Credential clipboard, downloads, and WhatsApp handoff

- **Concern:** Vendor and Assessor credential handoff actions had not been exercised.
- **Original status:** NOT TESTED.
- **Investigation:** Manager credential generation is the source of the temporary Vendor login; staff credential sharing is shown only after an Assessor account is created or reset.
- **Root cause:** The earlier run covered credential generation and login but stopped before the individual handoff controls.
- **Change:** None required.
- **Test:** In Chrome, downloaded `.txt` and `.tst` files contained the generated login email and password; Vendor and staff clipboard controls copied the expected fields; WhatsApp opened the expected `api.whatsapp.com/send` route with the test phone and prefilled message. No message was sent. There were zero console errors and failed responses.
- **New status:** VERIFIED WORKING.
- **Evidence:** [credential handoff browser script](../scripts/remaining-concerns-credentials.mjs), [evidence summary](remaining-concerns-evidence.json). Downloaded credential files were read from temporary download paths and deleted; credentials are not recorded in the report.

### Public inquiry honeypot and rate limiting

- **Concern:** Public abuse controls had not been exercised.
- **Original status:** NOT TESTED.
- **Investigation:** The handler rejects filled honeypots, permits five submissions per IP within its one-hour window, and then returns 429 with `Retry-After: 3600`.
- **Root cause:** The previous browser run submitted a normal inquiry but did not run abuse cases.
- **Change:** None required.
- **Test:** A filled honeypot returned 400 and created no row. Five valid isolated inquiries returned 201; the sixth returned 429 and `Retry-After: 3600`. All five accepted rows were then fetched from the Manager inquiry endpoint after reloading, confirming persistence.
- **New status:** VERIFIED WORKING.
- **Evidence:** [evidence summary](remaining-concerns-evidence.json); normal public submission and Manager conversion also passed in [full workflow browser results](full-system-workflow-browser-results.json).

### Reassignment to another Assessor

- **Concern:** Changing an already assigned assessment to a different Assessor had not been tested.
- **Original status:** NOT TESTED.
- **Investigation:** Manager assignment is handled by the existing assignment modal and `assign-assessor` endpoint; it writes the selected account ID, email, name, and assignment timestamp.
- **Root cause:** The prior run tested only an initial assignment.
- **Change:** None required.
- **Test:** The Manager assigned the same isolated registration to two newly created Assessors in succession using the actual Chrome assignment modal. The second Assessor’s account ID, email, name, and `assignedAt` value were persisted. The assigned Assessor submission path still passed the full workflow, while unrelated Assessor attempts returned 403 with the record unchanged.
- **New status:** VERIFIED WORKING.
- **Evidence:** [reassignment browser script](../scripts/remaining-concerns-reassignment.mjs), [revision and cross-Assessor results](full-system-revision-results.json).

### Atlas writes and JSON fallback

- **Concern:** MongoDB-backed create/update/reload/version/comment persistence was not verified with writes.
- **Original status:** BLOCKED.
- **Investigation:** A fresh, read-only inspection classified the configured Atlas target as **unknown**; no production/staging/development marker or verified owner was available. The previous ping/count found 311 existing records. No separate safe staging URI was configured.
- **Root cause:** The only configured Atlas target has real records and its ownership/environment is unknown, so write tests could affect operational data.
- **Change:** No Atlas writes were made.
- **Test:** Atlas remained read-only; no create, update, delete, version, payment, comment, or notification write was attempted. Independently, the JSON fallback passed the 17-check end-to-end Manager/Assessor/Vendor workflow, including assignment, 33 scores and comments, Manager review, payment proof/verification, certificate lifecycle, reload, and PDF download.
- **New status:** BLOCKED — no safe staging Atlas database available. JSON fallback: VERIFIED WORKING.
- **Evidence:** [Atlas read-only evidence](full-system-mongodb-readonly-current.json), [full workflow results](full-system-workflow-browser-results.json).

### Automatic email delivery and simulated pre-final notification

- **Concern:** Whether a pre-final email is actually delivered, and whether the Manager is told the truth when no provider is configured.
- **Original status:** BLOCKED.
- **Investigation:** No Resend, SMTP/Nodemailer, SendGrid, or Mailgun delivery implementation/configuration is active. The handler generates and stores a simulated email and returns `simulatedEmail`; it does not send mail. The old Manager toast and status card claimed the notice was sent.
- **Root cause:** Simulated notification preparation was labelled as delivery in user-facing copy.
- **Change:** The response now says “simulation only; no email was sent.” Manager actions and cards now say “Prepare Notice,” “Pre-Final Logged,” and “Pre-Final Notice Prepared (Not Sent).” The test workflow and status transition remain intact.
- **Test:** A malformed recipient returned 400 and left the isolated record unchanged. Chrome then submitted the Manager pre-final action with a valid address. The response recipient and generated body were correct, the response and toast explicitly said no email was sent, and the test credential did not appear in the response. No browser errors or failed network calls occurred. No test email was sent.
- **New status:** BLOCKED — no configured test email provider available.
- **Evidence:** [email simulation browser script](../scripts/remaining-concerns-email-simulation.mjs), [handler](../netlify/functions/send-pre-final.js), [Manager UI](../public/dashboard.html).

### Short and long company certificate PDFs

- **Concern:** Check certificate rendering with short and long company names using an actual Vendor download.
- **Original status:** Previously VERIFIED WORKING for a standard company; long-name regression requested.
- **Investigation:** Vendor certificate download calls the portal data endpoint and the PDF generator, then downloads a one-page PDF.
- **Root cause:** No new defect reproduced.
- **Change:** None required.
- **Test:** Chrome downloaded one-page PDFs for `ABC Sdn. Bhd.` and `Very Long Commercial Vehicle Telematics Technology Sdn. Bhd.`. PyMuPDF rendered the downloaded PDFs to images. Visual inspection confirmed the full top, bottom, left and right edges, border corners, MIROS mark, title, certificate number, company name, dates, QR code, and signature remained visible. The PDFs are image-rendered, so text extraction is not available; visual inspection was used.
- **New status:** VERIFIED WORKING.
- **Evidence:** [short company PDF](remaining-concerns-certificate-1.pdf) · [rendered page](remaining-concerns-certificate-1.png) · [long company PDF](remaining-concerns-certificate-2.pdf) · [rendered page](remaining-concerns-certificate-2.png).

### Assessor submission and Manager role boundary

- **Concern:** Recheck the assigned Assessor fix and ensure a Manager cannot act as the Assessor.
- **Original status:** The assigned Assessor fix was VERIFIED WORKING; Manager submission was not covered by the old RBAC tests.
- **Investigation:** `validateRole(event, ROLE_ASSESSOR)` intentionally granted Managers access to Assessor routes, and `save-evaluation` treated any non-Assessor as unrestricted. That allowed a Manager token to submit or revise an assessment through the Assessor endpoint.
- **Root cause:** The endpoint’s Manager privilege bypass conflicted with the required role separation.
- **Change:** `save-evaluation` now rejects every authenticated role other than Assessor before parsing or persisting a payload. Added a regression test requiring Manager POST to return 403. The existing owner check still accepts the assigned Assessor account ID/code and denies another Assessor.
- **Test:** Chrome completed all 33 criteria and comments as the assigned Assessor and received a successful submission; the Manager saw it in review. The unrelated Assessor returned 403 without changing the record, Vendor save requests returned 403, and the Manager save request returned 403. `npm test` covers the new Manager denial assertion.
- **New status:** VERIFIED WORKING.
- **Evidence:** [save-evaluation.js](../netlify/functions/save-evaluation.js), [regression test](../tests/save-evaluation.integration.test.js), [full workflow](full-system-workflow-browser-results.json), [revision and cross-Assessor results](full-system-revision-results.json).

### Safe request error handling

- **Concern:** Malformed and oversized JSON responses could expose server internals.
- **Original status:** VERIFIED WORKING after the previous fix.
- **Investigation:** The Express JSON parser error handler returns safe JSON for parser errors.
- **Root cause:** Previously fixed; no regression found.
- **Change:** None required.
- **Test:** Fresh HTTP requests returned malformed JSON 400, oversized JSON 413, and invalid login payload 400. All bodies were safe JSON without stack traces, source paths, package details, or secrets. Isolated stores remained the target.
- **New status:** VERIFIED WORKING.
- **Evidence:** [server.ts](../server.ts), [evidence summary](remaining-concerns-evidence.json).

### Favicon regression

- **Concern:** The four previously affected pages might still request a missing favicon.
- **Original status:** VERIFIED WORKING after the previous fix.
- **Investigation:** Login, change-password, Vendor portal, and certificate-verification pages each link the TrackScore icon.
- **Root cause:** Previously fixed; no regression found.
- **Change:** None required.
- **Test:** Chrome opened all four pages and fetched each icon successfully. Zero failed responses and zero console errors.
- **New status:** VERIFIED WORKING.
- **Evidence:** [runtime smoke script](../scripts/remaining-concerns-runtime-smoke.mjs), [icon links](../login.html).

### Regression commands and readiness

- `npm test`: 186/186 passed, 0 failed, 36 suites.
- `npm run lint`: `tsc --noEmit` passed.
- `npm run build`: passed; zero Vite warnings. The root and `public/` copies were both updated.
- Browser: the three-role end-to-end workflow passed 17/17 checks with zero console exceptions and failed responses. Credential handoff, reassignment, email simulation, certificate PDF and favicon checks also completed with zero browser errors or failed requests.
- Buttons/controls: all 343 inventoried buttons were kept; zero buttons were removed. Three button labels were clarified for the simulated notice flow. The repeated conditional-row inventory remains PARTIALLY VERIFIED because six zero-state/dynamic cases were not individually clicked in every record state.
- No known critical application defect remains from the tested local workflows. Atlas writes and real email delivery remain blocked by missing safe external test environments; these are not represented as verified functionality.
- **Release readiness:** Local core workflows are verified, but a complete live-system readiness sign-off is blocked until safe Atlas staging writes and a configured test email provider can be verified.

## Status Totals

- VERIFIED WORKING: 39 features
- PARTIALLY WORKING: 1 feature
- VERIFIED BROKEN: 0 features after fixes
- NOT TESTED: 3 features
- BLOCKED: 2 features


