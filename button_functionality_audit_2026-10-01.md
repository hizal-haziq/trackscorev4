# TrackScore control audit — 1 October 2026

Confirmed failures were fixed, one redundant hidden button was removed, and the existing role workflows and UI design were preserved. No Manager criterion editor was added.

## Inventory

| Measure | Count |
| --- | ---: |
| Source control definitions inspected before cleanup | 530 |
| Button definitions before cleanup | 326 |
| Buttons kept | 325 |
| Buttons removed | 1 |
| Other interactive definitions kept | 204 |
| Total remaining definitions | 529 |
| Buttons renamed | 0 |

Counts include eight canonical pages and linked JavaScript/nested templates. Root/public copies are counted once; record/criterion loop instances are not multiplied by current data. This differs from the historical audit's counting method.

| Page | Remaining controls | Buttons |
| --- | ---: | ---: |
| landing.html | 32 | 7 |
| login.html | 11 | 5 |
| change-password.html | 6 | 3 |
| request-assessment.html | 16 | 1 |
| verify-certificate.html | 5 | 1 |
| index.html / Assessor | 114 | 87 |
| dashboard.html / Manager | 290 | 188 |
| vendor-portal.html | 55 | 33 |

The [CSV](qa/button-control-inventory.csv) and [JSON](qa/button-control-inventory.json) record each remaining control's role, location, purpose/handler, form, reachable API strings, retention decision and test evidence. Function tracing supports inspection; it does not prove every backend transaction.

## Removal and retention

Removed **`#btn-report-download-cert`** from the Manager report modal in root/public. It was permanently hidden, had no event binding or code to expose it, and duplicated the working certificate actions. No exclusive listener existed. Working Manager/Vendor certificate controls remain.

Removed the dead listener targeting the already absent `#modal-view-pdf`, plus duplicate listeners where inline bindings already performed the action. These are code cleanup, not additional button removals.

Kept contextual Save/Drafts controls, credentials in different tabs, filters for different datasets, modal Cancel/Close controls, print/certificate lifecycle controls and role-specific reports. Similar labels/shared handlers alone did not justify removal. Unrendered conditional controls were retained with their testing limits recorded.

## Broken controls and fixes

| Control/feature | Root cause | Fix and retest |
| --- | --- | --- |
| Four Manager risk summary cards | Missing `filterByRiskLevel` | Added handler using existing filter/request; browser filtering and native navigation passed. |
| Quality/risk Details, Recalculate and Close | Referenced modal functions absent | Added authenticated loading/recalculation, escaped content, error/loading states, stale-request cancellation and close cleanup; browser open/recalculate/close passed. |
| Report Approve templates and `approveEvaluation` alias | Called undefined `handleApproveEvaluation` | Routed to existing confirmation; actual browser approval persisted through API. |
| Refresh, status filter, evaluations/registered tabs, Register and registered Refresh | Inline bindings plus listeners performed duplicate actions | Retained one binding; browser navigation/filter/refresh passed. |
| Request Changes confirmation and modal close/cancel | Duplicate listeners sent two POSTs; second failed after first changed status | Retained inline handlers; a single submission persisted revision instructions. |
| Manager review comment | Frontend sent text; approval backend discarded it | Validated text/length, saved trimmed comment and audit history; browser persistence and privacy tests passed without modifying Assessor evidence. |
| Manager/Assessor automatic updates | EventSource omitted JWT required by authenticated stream | Added token; removed editable Assessor-name stream identity. Existing backend authorization remains; no stream HTTP authorization failure in successful run. |
| Root Manager certificate download lookup | Root assumed object while API can return array; public already corrected | Normalized both response shapes and synchronized copies; actual download passed. |
| Certificate QR download | Inline SVG appeared in browser but rasterized blank | Used an image containing the same SVG with intrinsic dimensions; QR decoded from actual PDF. |
| Certificate cropping investigated earlier in session | Centered html2pdf copy measured in one viewport and cloned into fixed viewport | Kept capture-origin/image/cleanup fix; four real layout cases rendered complete one-page A4 PDFs. |

The complete approval path was exercised: click → confirmation → authenticated request → `approve-evaluation` → isolated storage/history → response → refreshed UI. Risk, scheduling, assignment, payment, certificate, comments and Vendor actions likewise used their existing handlers. Vendor sanitization still omits internal comments/risk data; no Manager scoring workflow was introduced.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | **167 passed; 0 failed, cancelled or skipped** |
| `npm run lint` | Passed (`tsc --noEmit`) |
| `npm run build` | Passed (Vite frontend and esbuild server) |
| Chrome public/role workflow assertions | **70 passed; 0 failed** |
| Additional Chrome peer-comment/credential workflows | **3 passed; 0 failed** |
| Native static-button probes | **210 passed; 0 exceptions** |
| Native dynamic-template click probes | **66 passed; 0 exceptions; 56 templates not rendered in fixture state** |
| Native fields/action links/navigation controls | **130 / 2 / 7 passed** |
| Local-link resolution checks | **45 passed** |
| External links | 4 handoffs inspected; no external message sent |
| Read-only/disabled fields | 3 preserved as workflow-controlled fields |
| Certificate layout cases | **4 passed; one A4 page each** |
| Root/public parity | All 16 corresponding files identical |

Dynamic-template probe counts and remaining coverage are in the [coverage summary](qa/button-audit-coverage.json) and per-control inventory. Static/dynamic click probes expose hidden UI synthetically and often exercise empty-form validation. They demonstrate delivery without an exception, **not** a completed transaction for every button. Workflow assertions are reported separately.

The full suite ran in an isolated copy using synthetic accounts and JSON fallback storage, avoiding live Atlas writes. A pre-existing comment-persistence test left its database connection open and stalled the suite; it now closes the connection. Approval, Vendor and SLA fixtures were corrected to create missing JSON records/link test registrations rather than assuming Atlas-only behavior. Application checks were not weakened.

Chrome used native Playwright actions against the real isolated server, without mocking workflow API responses. Manager tests covered tabs/filters/refresh, scores/comments, quality, history snapshots, report/CSV downloads, approval/revisions, registration, scheduling, assignment, invoices, payment verification, all certificate lifecycle steps, staff create/reset/delete, archive, credentials/copy/download and logout. Assessor tests covered navigation, all 33 criterion selections/comments, drafts/backup, notifications, actual submission, peer review/comment and logout. Vendor tests covered privacy, profile, notifications, document upload/download control/delete, revision submission, payment proof, own certificate, password change and logout. Public tests covered mobile navigation, drawer tabs, role login/password visibility, inquiry submission, certificate verification and local links.

Certificate measurements were **1588 × 2240 canvas pixels**, **one A4 page**, at widths 375/1280/1920 and with a long company name at 1440. PyMuPDF measured **595.28 × 841.89 points**. Visual inspection confirmed borders, title, company, scores/rating, signature record, QR and footer. The QR decoded to the fixture's verification URL. Assessment Report and Vendor certificate downloads also passed.

## Evidence

- [Workflow results and console/network/native events](qa/button-browser-results.json), [additional workflows](qa/button-extra-workflows.json)
- [Static button probes](qa/button-click-sweep.json), [field/link probes](qa/button-field-probes.json), [dynamic template probes](qa/button-dynamic-probes.json)
- [Test log](qa/button-audit-npm-test.log), [lint log](qa/button-audit-lint.log), [build log](qa/button-audit-build.log), [parity log](qa/button-root-public-parity.log)
- [Actual certificate PDF](qa/certificate-pdf.pdf), [long-name PDF](qa/certificate-audit-long-company.pdf), [Assessment Report](qa/button-audit-assessment-report.pdf), [canvas/page measurements](qa/certificate-layout-results.json), [decoded PDF QR](qa/certificate-qr-verification.json)

## Remaining issues and limits

The successful main Chrome run had no uncaught JavaScript exceptions or failed HTTP API responses. Its console recorded an existing favicon 404. Network observations retain `net::ERR_ABORTED` from navigation, superseded loads and EventSource closure. Build retains existing classic `/api/config.js` script-bundling warnings; both pages loaded runtime configuration in Chrome. The control labelled “View Simulated Email” was retained: its handler previews stored pre-final correspondence and has a real Manager review purpose, so its label alone does not establish obsolete functionality.

This is **not a claim that every conditional definition completed an end-to-end transaction**. Absent states, some selected-record/report variants, draft recovery/import, forced temporary-password onboarding, long AI summarization/model downloads, external email/WhatsApp delivery and physical printing have narrower coverage. The standalone password-change page received click/field probes. Vendor document download opened its destination, but no separate document-file artifact was saved. Live Atlas/deployed-provider behavior was not browser-tested. Unrendered/source-only definitions are identified in the coverage evidence, and no necessary control was removed because of a testing limit.

Reproduction scripts: `scripts/button-audit-*.mjs`. They require temporary `playwright-core`, `linkedom`, `jsqr`, `pngjs` dependencies under the system temp directory's `trackscore-audit-tools/node_modules`, installed Chrome, and PyMuPDF for PDF inspection. Setup creates a separate workspace, random JWT secret and JSON fixtures. Start its built server on port 3008; run main verification before supplementary probes because it changes the synthetic Vendor password. Keep fixtures separate from production data.
