# TrackScore payment removal

Verified on 2 October 2026. This change removes the active payment workflow; it does not delete historical payment records or change package pricing and quotation/invoice functionality.

## Resulting workflow

Inquiry → Registration → Vendor Account → Schedule → Assign Assessor → Assessment → Submit → Manager Review → Approve → Prepare Certificate → Print → Sign → Deliver → Completed.

Manager approval now stores `approved` and the current assessment's `approvedVersion`. New approvals no longer enter `pre_final_sent` or `payment_confirmed`. Approval requires a complete saved assessment version. Preparing a certificate requires an authenticated Manager, an approved unfinished assessment, an existing approved version with 33 criteria, and company/device details. The certificate records that approved version, rather than selecting an unapproved newer version. Print, sign and deliver retain their sequential checks; signatory details remain mandatory. Direct completion through assessment approval, generic record editing, or the former batch shortcut cannot bypass those steps.

## Removed and retained functionality

| Area | Removed | Reason / replacement |
| --- | --- | --- |
| Manager dashboard | Payment verification card, count, queue shortcut and attention entries | Payment is outside the current workflow. Real Unassigned, Certificate Ready and Certificate In Progress counts are shown. |
| Assessment repository | Payment column and badges, payment filters, payment details and actions | Review and certificate controls remain; Approved is a separate filter from Completed. |
| Manager payment modal | Amount, method, transaction reference, date, verification, waiver/override controls and handlers | No payment collection, confirmation, or override is permitted. |
| Pre-final notice | Preparation/skip form, email preview, related controls and handlers | This simulated notice mainly handed the assessment to payment verification. Approval now leads directly to certificate readiness. |
| Vendor portal | Payment KPI, alerts, payment submission buttons/form/modal, payment history and receipt upload category | Assessment status and certificate progress remain. Required non-payment documents and revisions remain available. |
| Public landing page / Assessor labels | References to payment duties and visible historical payment labels | Public workflow copy describes assessment/certification. Historical stages display as Approved. |
| APIs | Active payment verification, payment submission and pre-final mutations | Both Express aliases and direct Netlify routes return HTTP 410 without reading or changing storage. |
| Registration / inquiry conversion / assessment submission | Creation or copying of payment state | No fake paid, waived, verified or override state is generated. |
| Reports / data responses | Current payment details and payment-stage export labels | Packages and invoice references remain. Excel maps historical payment/pre-final stages to Approved. Existing assessment and certificate PDFs remain available. |
| Vendor styles | Payment badge name and unused pending-payment badge rule | The retained approval-version badge uses `badge-approved`. Shared styles remain. |

Manager review continues to use the Assessor's 33-criterion evidence and comments. No Manager scoring workflow was added. Vendor responses continue to omit internal review comments and criterion evidence. Working account, scheduling, assignment, SLA, revision, version-history and PDF controls were retained.

Button/status wording changes include Approve, Request Changes, Assessment Status and historical-stage Approved labels. Vendor milestones show registration, scheduling, assessment progress, review, changes requested when applicable, approval, certificate preparation, certificate availability and completion.

## Historical storage and remaining references

No live database was modified by verification and no payment-data migration was performed. Existing `payment`, invoice payment metadata, proof documents and files remain stored. Updating invoice details preserves existing historical metadata. Historical proof is omitted from document lists; uploads using the retired category are rejected and direct download/delete attempts cannot access or remove that proof.

Remaining source references have these purposes:

- `payment_confirmed` / `pre_final_sent` in eligibility, locked-status lists, filters and label mappings: support existing approved records without rewriting their stored status. A historical status alone is insufficient for certificate processing; a real approved version must exist.
- `retired-workflow.js`, Vendor responses and document handlers: omit historical fields/history from active output and reject the retired upload category. No payment decision or update occurs.
- The three retired handler filenames and Express route registrations: explicit HTTP 410 responses, including `/api/verify-payment`, `/api/vendor-submit-payment` and `/api/send-pre-final`, plus their Netlify equivalents.
- Existing history/version compatibility and legacy approved-record handling: retained for older records. New versioned approvals are excluded from the old approved-to-completed migration.
- Previous audit scripts/reports, QA evidence and regression fixtures: historical or verification-only references, outside the served application. Earlier payment audit scripts describe the old workflow; use `scripts/payment-removal-browser.mjs` for the current workflow.
- Existing database files: preserved historical data, not an active payment feature.

The searches are recorded in `qa/payment-removal-remaining-references.txt` (application source matches) and `qa/payment-removal-reference-files.txt` (repository-wide matching filenames). Temporary editing scripts were removed. Root/public copies of all 18 shared assets compare identically.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **191 passed**, 0 failed, 0 skipped |
| `npm run lint` | **Passed** |
| `npm run build` | **Passed** |
| Chrome production-build browser checks | **20 passed**, 0 failed |
| Browser console / uncaught exceptions | **0 errors** |
| Failed requests from normal browser UI | **0** |
| Root/public parity | **18 shared files identical** |

Automated regression coverage includes preparation blocked before approval; successful processing without payment; denial of all four certificate actions for Assessor/Vendor roles; approved-version selection; sequential enforcement; completed-record locking; historical-stage compatibility; preservation of stored payment/proof; retired endpoints; removal of payment output; and separation of Approved and Completed filters.

Chrome clicked the actual controls for account creation, public inquiry, registration conversion, Vendor linking, schedule/assignment, all 33 criteria, criterion comments, submission, Manager Request Changes, Assessor revision/resubmission, Manager approval, Approved filtering, certificate preparation/printing/signing/delivery, and both Manager/Vendor PDF downloads. It verified version 2 was approved and certified, no payment object was created, public certificate verification succeeded, and all six retired route aliases returned 410 without changing records. Empty dashboard layouts were checked at 1920, 1366, 1024, 768 and 390 pixels.

Tests ran in isolated temporary stores with new authentication secrets and no MongoDB URI. Chrome used the built application in a separate temporary workspace. Intended negative API probes (400, 403, 404, 410) were checked separately from failed normal UI requests.

Evidence: `qa/payment-removal-tests.log`, `qa/payment-removal-lint.log`, `qa/payment-removal-build.log`, `qa/payment-removal-workflow-browser-results.json`, Manager/Vendor completed-state screenshots and downloaded PDFs in `qa/`.

## Remaining issues / limits

- No payment-removal failure remains in the tested workflow.
- MongoDB Atlas operations were inspected but not exercised against a live deployment; local isolated persistence was exercised. Records missing their approved version cannot prepare certificates, including legacy records.
- Visual inspection found existing Vendor activity entries with missing `timestamp` can display “Invalid Date”; the existing response uses `timestamp` while some handlers store `changedAt`. Replayed status notifications can also stack briefly after login. These unrelated presentation issues were left outside this payment-removal change.
- This work is local; it has not been deployed.
