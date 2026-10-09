# TrackScore production data cleanup

Date: 1 October 2026

Confirmed local test records and production demo/default-data paths were removed. All six local JSON stores are valid empty arrays. The application was tested from zero records and then through the actual role-based workflow in a separate temporary workspace. Existing Atlas records were inspected read-only; uncertain records were preserved. Consequently, this report does not certify that the live Atlas database is free of historical test data.

## Inspection scope

The search-based inspection covered 166 source, storage and configuration files. The full file list is in [the inspection manifest](qa/dummy-cleanup-inspection-manifest.json). Searches included dummy/demo/sample/mock/test/example/placeholder/seed terms, fixture names, hardcoded accounts, dates, payments, scores, certificates, statistics and fallback values. Significant matches were traced to their purpose and callers before changing them.

Areas covered: root/public HTML, JavaScript and CSS; Express/server configuration; Netlify handlers; MongoDB initialization and lifecycle helpers; local JSON stores; bootstrap/credential scripts; frontend state and browser storage; dashboard tables/statistics; modals; notifications; payments; certificates; reports/exports; role permissions; and automated fixtures. No bulk clearing of existing users' localStorage/sessionStorage was performed. Genuine saved drafts and account state were preserved.

Principal changed files:

- `app.js`, `dashboard.html`, `vendor-portal.html`, `landing.html`, `certificate-pdf.js`, and their matching `public/` copies.
- `netlify/functions/db.js`, `netlify/functions/sla.js`, `netlify/functions/manage-inquiries.js`.
- `scripts/create-first-manager.js`, `scripts/rotate-credentials.js`, `scripts/run-tests-isolated.mjs`, `package.json`, `.gitignore`.
- `tests/certificate-pdf.unit.test.js`, `tests/production-data-integrity.test.js`.
- Local fallback JSON stores listed below.

Existing changes from the preceding button/security/PDF audit were preserved. This cleanup did not redesign pages or introduce another Manager criterion-editing workflow.

## Confirmed records removed

Exactly five local records were removed selectively. The evidence is recorded in [the removal manifest](qa/dummy-data-local-removals.json).

| Store | Removed record | Classification evidence |
| --- | --- | --- |
| evaluations | `eval_1790665360502_lldk1` | `Unique Dedup Fleet Logistics` matches the record-deduplication automated fixture. |
| users | `user_1790665360509_48nq` | Timestamped `test.history.farhan…@trackscore.my` account matches the assessment-history fixture. |
| vendors | `vendor_1790665363237_df11` | Timestamped `vendor-a-…@test.my` account matches the production-verification-history fixture. |
| assessment_versions | `ver_1790665360550_ed5lq` | `duplicate-test-1790665360538` evaluation reference is an automated duplicate-history fixture. |
| assessment_versions | `ver_1790665360518_dichn` | Alpha Tech Fleet / ATF-X100 metadata and evaluation ID belong to the same automated test timestamp cohort. |

No genuine local record was identified for deletion. No MongoDB record was deleted. The broad manual reset utility was not executed.

## Production defaults and demo behavior removed

| Change | Reason and resulting behavior |
| --- | --- |
| Removed orphaned `fillDemoData()` | It filled a fake company, model, assessor, ID and all 33 high scores, then autosaved. No active control depended on it. The previously removed Load Sample Data button remains absent. |
| Removed preset Atlas account generator and startup seed branch | Five hardcoded Manager/Assessor accounts were production seed data. Startup no longer creates them, even if the old auto-seed flag is enabled. |
| Removed bootstrap default email | First Manager setup requires an explicitly supplied email and password. Existing bcrypt/security behavior remains. |
| Removed credential-rotation preset account list | Rotation now requires explicit existing `user:email` or `vendor:email` targets and checks them before modifying passwords. It cannot create a log of credentials for absent preset accounts. |
| Removed fabricated legacy certificates/history/package choices | Lifecycle migration no longer invents certificate numbers, signatures, printed/prepared/delivered dates, initial submitted history or a default package. Real certificates and approved-record normalization remain supported. |
| Removed certificate rendering fallbacks that implied issuance | Missing number/signatory/date/company/model displays an absent-data label. A missing number does not generate a verification QR. Manager download refuses missing number/signature instead of synthesizing them. Existing preview/print/sign/download sequence is preserved. |
| Removed hardcoded payment amounts and pending invoice reference | Missing saved amounts remain blank or show Amount not recorded. Genuine package configuration, invoice generation and saved payment values remain. |
| Corrected false paid indicators | Vendor KPI, banner and cards use explicit verified/paid payment state. A pre-final assessment alone no longer appears paid. |
| Removed assumed notification Grade A and SLA scheduling information | Missing rating/date now reports absent information instead of invented outcome/deadline. |
| Corrected zero-data SLA compliance | Backend and UI show 0% with zero completed assessments, instead of a misleading 100%. Actual populated statistics retain their calculation. |
| Corrected initial connection status | Dashboard shows Checking/Loading until the backend responds. |
| Reworded static landing workflow claims | Workflow illustrations describe criteria, rating scale and certification stages instead of showing a real approved/certified/passed record. Layout and official rating terminology remain. |

The 33 official criteria, scoring boundaries, role names, package configuration, status enums, MIROS terminology, SLA rules, validation limits and useful form placeholders were retained. Marketing stars now explicitly describe a rating scale rather than a stored assessment result.

## JSON fallback storage and fixture isolation

| File | Final application record count |
| --- | ---: |
| `.data/users.json` | 0 |
| `.data/vendors.json` | 0 |
| `.data/evaluations.json` | 0 |
| `.data/inquiries.json` | 0 |
| `.data/assessment_versions.json` | 0 |
| `.data/assessment_risk.json` | 0 |

All files retain the application's expected array schema. `.data/` is ignored for future local records; already tracked empty files remain available.

Automated fixtures, mock records, test-only scripts and QA PDFs were intentionally retained. `npm test` now runs in a temporary workspace with separate JSON storage, no copied `.env`, an empty MongoDB URI, an isolated JWT secret and disabled email credentials. It unlinks shared dependencies before deleting the verified temporary directory. Tests no longer write fixture records into the application's `.data` or use its Atlas credentials. Application store counts were rechecked after testing and remained zero.

The MongoDB URI parser also now treats an empty `.env` value correctly instead of consuming the following configuration line. Chrome checks confirmed that JSON stores, automated fixtures, scripts and QA artifacts are not served as public files.

## Atlas records requiring manual review

Read-only inspection covered 311 records: 2 users, 7 vendors, 86 evaluations, 5 inquiries, 209 assessment versions and 2 risk records. Exact flagged IDs and reasons are in [the Atlas review manifest](qa/dummy-data-atlas-review.json).

- One Manager has the System Bootstrap marker. Secure manual bootstrap and the old seed routine share this marker, so it is insufficient evidence for deletion.
- Forty-five assessment versions contain names matching Alpha Tech Fleet or Unique Dedup Fleet Logistics fixtures. Their live provenance and ownership were not independently confirmed.

These 46 records remain unchanged. No collection-wide delete, database reset, account rotation or migration was performed against Atlas. Live database cleanup remains subject to provenance review; the empty-state tests describe isolated JSON storage, not the live Atlas database.

## Workflow defects discovered and fixed

1. Inquiry conversion failed in JSON fallback mode because it called nonexistent `connection.createEvaluation`. It now uses the existing `insertEvaluation` helper and its inserted ID. A handler-level regression test and Chrome conversion both passed.
2. Payment verification could be blocked by native required-field validation: Vendor's stored Online Banking / DuitNow method was absent from the Manager select options. The modal now safely includes the actual saved method and selects it. Chrome proof submission and Manager verification passed.
3. ISO saved payment dates are normalized for the HTML date input, preserving the recorded date rather than leaving the field blank.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | 171 passed; 0 failed, skipped or cancelled | [TAP output](qa/dummy-cleanup-npm-test.log) |
| `npm run lint` | Passed (`tsc --noEmit`) | [Lint output](qa/dummy-cleanup-lint.log) |
| `npm run build` | Passed frontend and server builds | [Build output](qa/dummy-cleanup-build.log) |
| Root/public parity | All 16 paired files identical | [Parity output](qa/dummy-cleanup-parity.log) |
| Chrome testing | All 15 checks passed against actual handlers; no mocked API responses | [Browser results](qa/dummy-cleanup-browser-results.json) |
| Certificate PDF | Download succeeded; rendered and visually inspected as one A4 page with actual workflow number/signatory and QR | [Downloaded PDF](qa/dummy-cleanup-workflow-certificate.pdf) |

New regressions cover absent certificate details, empty SLA statistics, legacy migration preservation and actual public inquiry-to-registration conversion.

Chrome was launched using the installed Google Chrome executable and Playwright in a separate temporary application workspace. The browser began with all six stores empty and verified preset login rejection. It then created exactly one Manager using the explicit bootstrap, an Assessor through Team Accounts and a Vendor through the actual account workflow. Empty Manager/Assessor/Vendor views had no invented records; dashboards and SLA were zero, notifications empty, and payment/certificate indicators absent.

Subsequent checks used the public inquiry form, Manager conversion/registration and invoice creation, Vendor linking, scheduling and assignment, the Assessor's full 33-criterion form with comments and submission, Manager review/approval and pre-final delivery, Vendor proof upload, Manager payment verification, and certificate preparation/printing/signing/delivery. Vendor downloaded the generated PDF and public verification returned valid. Vendor did not see internal review comments or falsely paid status. Assessment versioning recorded the submission.

The resulting test workspace contains 2 users, 1 Vendor, 1 assessment, 1 inquiry, 1 assessment version and 0 risk records, all created by those workflow actions. These are validation fixtures outside application storage; no such records were inserted into the live database. Empty-state screenshots are available in `qa/dummy-cleanup-empty-{manager,assessor,vendor}.png`. The reproducible browser harness is `scripts/dummy-cleanup-browser-verify.mjs`, with setup in `scripts/dummy-cleanup-browser-setup.mjs`.

## Remaining issues and limits

- The 46 flagged Atlas records require manual provenance review; they were deliberately preserved. Unflagged records were not assumed genuine solely because their names lacked test keywords.
- Browser results contain one existing favicon HTTP 404 console message. There were no uncaught JavaScript exceptions or failed workflow API requests; expected private-file 404 checks were deliberate access tests.
- Build retains two existing Vite warnings about classic `/api/config.js` script tags. Both frontend and backend builds complete successfully.
- Existing user browser profiles and their saved drafts were not erased. Historical manually saved demo drafts cannot be certified absent from every user's browser by this isolated test.
- Security/RBAC, revision handling, document uploads, report/export behavior and approved-record immutability retain their existing regression coverage. The fresh browser run exercised the complete approval/payment/certificate path; it did not repeat every branch covered by the preceding button audit.

No deployment was performed and no uncertain live data was removed.
