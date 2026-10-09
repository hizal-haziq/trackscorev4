# TrackScore Remaining Concerns Fix Report

Checked: 2026-10-02. Follow-up work focused on the open items in [the full-system report](full_system_verification_report.md). Write-based tests ran only in an isolated JSON fallback environment. The configured Atlas database remained read-only.

## Findings and fixes

The two Vite warnings came from unused classic script tags for `/api/config.js` in `index.html` and `dashboard.html`. That URL is a runtime-generated API route, not a module Vite can bundle. Removed the four unused references across root and `public/` copies while retaining the Express and Netlify runtime handlers. `npm run build` now has zero Vite warnings. A Chrome request returned HTTP 200 with `window.APP_CONFIG = {};`; running the dynamic Netlify generator with JWT, database, and email secret sentinels exposed none.

The Manager could call the Assessor `save-evaluation` endpoint because shared role validation allowed Managers on Assessor routes and the endpoint granted non-Assessors an unrestricted update path. The handler now requires the Assessor role. The Manager regression request returned 403, the assigned Assessor completed all 33 criteria and submitted, unrelated Assessors and Vendors remained denied, and the Manager received the submission for review. A regression assertion was added to the test suite.

The pre-final email endpoint only creates and stores a simulated message, but the Manager interface said the message had been sent. The Manager action now validates recipient email format server-side and returns 400 without changing the record for malformed recipients. The API response, Manager status badge, detail card, and toast now state that the notice is simulated and no email was sent. Browser testing confirmed the expected recipient and message body. No provider was configured, so actual delivery remains blocked.

## Previously untested items

| Concern | Result |
|---|---|
| Vendor and Assessor credential handoff | **VERIFIED WORKING.** Actual `.txt` and `.tst` downloads contained the generated account fields; Vendor/staff clipboard actions copied them; WhatsApp opened the correct prefilled URL. Nothing was sent externally. |
| Public inquiry honeypot and rate limit | **VERIFIED WORKING.** Honeypot returned 400; five submissions returned 201; the sixth returned 429 with a 3600-second retry header. The five accepted inquiries were read back through the Manager endpoint after reload. |
| Assessor reassignment | **VERIFIED WORKING.** The Manager reassigned the same record to two Assessors through the Chrome modal. The second Assessor identity and assignment timestamp persisted. |
| Dynamic conditional control inventory | **PARTIALLY VERIFIED.** The inventory has 546 controls (343 buttons and 203 other controls); 226 static buttons received native probes and 70 role-control checks passed. Six zero-state or dynamic cases were not individually clicked across every record state. |

## Atlas and JSON fallback

**Atlas writes: BLOCKED — no safe staging Atlas database available.** A fresh metadata-only inspection classified the configured target as **unknown**. It has 311 existing records and ownership is unverified. No Atlas data was changed.

**JSON fallback: VERIFIED WORKING.** The isolated three-role browser journey exercised inquiry, registration, credentials, assignment, 33-criterion scoring/comments, Manager approval, payment proof and verification, certificate lifecycle, Vendor certificate download, and public certificate verification.

## Certificate PDF regression

Chrome downloaded actual one-page Vendor PDFs for both `ABC Sdn. Bhd.` and `Very Long Commercial Vehicle Telematics Technology Sdn. Bhd.`. PyMuPDF rendered both pages, which were visually inspected. Page edges, borders, MIROS mark, title, certificate number, company name, dates, QR code, and signatory were visible. No PDF change was needed.

- Short company: [downloaded PDF](remaining-concerns-certificate-1.pdf) · [rendered page](remaining-concerns-certificate-1.png)
- Long company: [downloaded PDF](remaining-concerns-certificate-2.pdf) · [rendered page](remaining-concerns-certificate-2.png)

## Error handling and favicon regressions

Malformed JSON returned safe 400 JSON, oversized JSON returned safe 413 JSON, and invalid login payload returned safe 400 JSON. No stack trace, source path, package detail, or secret appeared in client responses.

Chrome revisited login, change-password, Vendor portal, and certificate-verification pages. All four favicons loaded; there were no failed responses or console errors.

## Verification results

- `npm test`: **186 passed, 0 failed, 36 suites**.
- `npm run lint`: **passed** (`tsc --noEmit`).
- `npm run build`: **passed**, with **zero Vite warnings**.
- Browser: the complete three-role workflow passed **17/17** checks with zero console exceptions and failed network responses. Credential sharing, reassignment, simulated notice, PDFs, error responses, and favicons were also exercised in Chrome without browser errors or failed requests.
- Controls: **343 buttons kept, 0 removed**. Three labels in the simulated pre-final notice flow were clarified: `Send Pre-Final` → `Prepare Notice`, `Send Pre-Final Result` → `Prepare Notice`, and `Approve & Send Pre-Final` → `Approve & Prepare Notice`.

Core local workflows passed. A complete live-system readiness sign-off remains blocked until Atlas persistence can be tested on a safe staging database and real email delivery can be tested with a configured provider. No claim is made that every external integration works.

See [detailed follow-up evidence](remaining-concerns-evidence.json) and the appended [Remaining Concerns Follow-up](full_system_verification_report.md#remaining-concerns-follow-up).
