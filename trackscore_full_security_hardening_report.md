# TrackScore full security hardening report

Date: 13 October 2026, Asia/Kuala_Lumpur. Status terms: **VERIFIED WORKING**, **VERIFIED BROKEN**, **PARTIALLY WORKING**, **NOT TESTED**, **BLOCKED**. Findings distinguish pre-fix source defects from tested local results and untested deployment claims.

## 1. Executive summary

**VERIFIED WORKING locally:** security hardening of the existing Manager, Assessor and Vendor portals and backend. No migration, landing redesign, deployment or production mutation was performed. The fresh baseline already contained the earlier role hotfix; it was preserved and extended to ownership, signed-session rendering, lifecycle, privacy and operational boundaries.

**Historical credential exposure remains in Git history.** Two tracked QA credential files had plaintext password fields; working copies are now redacted. Private temporary backups from the earlier run are no longer available after the interruption. Whether any historical credential remains usable on a live service is **NOT TESTED**. If one was reused, that is a potential P0 requiring account rotation; this pass does not claim to remove history or rotate live accounts.

No VERIFIED BROKEN P0 application behavior remains in the tested local matrix. Live deployment security, distributed quota guarantees and cross-instance database transactions are not established by these local results.

## 2. Initial baseline

Repository `/home/hizalhaziq/Coding/trackscorev4`, Ubuntu, Node 22.22.1, npm 9.2.0, 13 October 2026, Asia/Kuala_Lumpur. Starting commit `1103ae2` (Rebuild React Phase A manager overview); `main` was up to date with its origin.

Before changes: 27 modified tracked files, substantial untracked Phase B–F/landing/QA work, zero staged files. `.data/evaluations.json` was already modified by the user. Initial status, diff, index and hashes were originally saved under `/tmp/trackscore-security-7n75guov`. Those temporary files were removed before this resume; the baseline below is the earlier observed result, not a newly rerun pre-change baseline. Nothing was reset, discarded, committed, staged or unstaged.

| Fresh command | Baseline result |
| --- | --- |
| npm test | 368 tests, 58 suites, 368 pass, zero failures/cancelled/skipped/todo; 23654.251405 ms; exit 0 |
| npm run lint | Both TypeScript configurations, no diagnostics; exit 0 |
| npm run build | Legacy Vite, three isolated React portals and backend completed; exit 0 |
| Full current Chromium suite | 104 checks passed, zero unexpected console/page/HTTP errors |
| npm audit | Three advisory entries: source-map-js high, uuid moderate and ExcelJS moderate through uuid |

Historical evidence locations were `baseline-*.log`, `baseline-browser-summary.json` and `/tmp/trackscore-phase-a-browser-uWXW0G`; those temporary artifacts are no longer available. Final test/lint/build/audit/browser checks were rerun during this resume and have fresh evidence under `/tmp/trackscore-security-resume-l3hti1cg`. No baseline application repair was required. Subsequent temporary regression failures were corrected before final verification, including an export initialization error, a large-Base64 validation failure, and security-fixture/browser-harness defects.

## 3. P0 findings

Pre-fix source inspection confirmed: Assessor document ownership failed open on missing identities; Assessor lists used partial names that could override conflicting IDs; Vendor history/version/SSE relied on stale JWT links; frontend guards decoded claims without obtaining signature verification before protected rendering. New submission lifecycle state and actor fields could also be supplied by the caller. Non-production signing had a known shared fallback secret.

**VERIFIED WORKING after remediation:** exact stable-ID ownership takes precedence; current active Vendor accounts supply ownership; signed server verification gates React and legacy rendering; new submissions accept only submission states; actors, creation times and rubric identity come from the backend. The development fallback is now an ephemeral cryptographic secret, and production still requires a configured secret. Direct role, JWT, IDOR and browser-route matrices pass.

Historical QA passwords were redacted from current files; the remaining historical exposure is called out in section 1 and section 39. No live reuse was tested.

## 4. P1 findings

Hardened uploads against extension/MIME disagreement, executable disguises, traversal, empty/oversize/invalid Base64 and identifier misuse. Ordinary staff password changes now require the current password; initial setup requires both account and token flags. New/reset staff passwords require eight characters, changes require eight, and bcrypt inputs are bounded to 72 UTF-8 bytes. Vendor and Manager suggested credentials now use cryptographic randomness with substantial random suffixes.

Version and document projections remove internal notes, credential material and filesystem paths. Unknown rubric options are rejected rather than falling back to submitted points; non-finite totals fail. A legacy Assessor toast interpolated unescaped error text and now escapes it in both copies. These checks are **VERIFIED WORKING** in the automated local suite.

## 5. P2 findings

Added shared bounded process-local rate limits, explicit CORS, safe error/log output, stronger CSP/headers, exact SSE scope and connection expiry/caps, per-resource mutation locks and conditional database updates. Certificate replay is rejected; approved/completed assessments cannot be reassigned or rescheduled into an editable state. React Manager actions carry the version displayed in the modal. Dependency patches and the replacement local PDF engine remove all currently reported npm advisories.

**PARTIALLY WORKING for deployment guarantees:** limits are per instance; SSE still accepts URL tokens; legacy CSP retains inline script compatibility; Mongo updates across linked records/version creation are not one transaction. These limits are detailed below.

## 6. Authentication findings

Login signs the authenticated database account role; selected tabs, URLs, query parameters and storage hints do not grant backend authority. Inactive/deleted staff are refused at sign-in; active Vendor checks remain authoritative. `verify-session` validates the existing Bearer token, signed role and expiry; it is not a replacement login model.

React initially renders a neutral verification state, cancels obsolete verification requests, then admits the appropriate role. Legacy shells run `/portal-guard.js` before their body and stay hidden until verification, repairing storage hints from the result. Expired/malformed legacy tokens are cleared before older inline redirects can race the verifier. **VERIFIED WORKING locally.** JWT signature verification is independent of the frontend's convenience decoding.

## 7. RBAC findings

36 endpoint policies are inventoried in `docs/trackscore_security_inventory.md`, with methods, auth, roles, resource checks, input, output, mutation and limits. A shared wrapper enforces declared roles before handler logic for direct Netlify-style calls and Express adapters. Aliases retain the same handlers.

Manager review, scheduling, assignment, provisioning, administration, exports, global workload/risk and certificates are restricted to Manager. Submission is Assessor-only. Vendor profile, customer portal and resubmission are Vendor-only. Manager and Assessor can read appropriately scoped documents; only Vendor owners upload vendor documents. Assessor deletion is denied.

The existing explicitly supported Assessor **own-assessment risk advisory** and eligible peer reviews are retained. They do not grant Manager global risk/workload or another Assessor's history/version/document access. **VERIFIED WORKING** within the direct matrix and positive regression cases.

## 8. Cross-role results

**VERIFIED WORKING:** both React and legacy portals admit only their own role. Wrong roles get the denied view or their own portal; missing, expired and modified/invalid-signature JWTs cannot show protected content. The browser observer checks protected rendering while session verification is delayed. Direct unsigned edits are rejected with 401 under both API prefixes.

| Account | Manager portal | Assessor portal | Vendor portal |
| --- | --- | --- | --- |
| Manager | ALLOW | DENY | DENY |
| Assessor | DENY | ALLOW | DENY |
| Vendor | DENY | DENY | ALLOW |
| Missing/expired/invalid token | DENY | DENY | DENY |

The following **140 direct cells** invoke the first declared method with an empty payload/query. 401 means missing identity; 403 means role/resource denial. 400/404/200 on an allowed role still depend on input/resource rules; an empty request is not proof of workflow success. Separate tests cover positive mutations and genuine owned resources.

| Protected endpoint | Manager | Assessor | Vendor A | Vendor B | No token |
| --- | --- | --- | --- | --- | --- |
| add-comment | 400 | 400 | 403 | 403 | 401 |
| approve-evaluation | 400 | 403 | 403 | 403 | 401 |
| assign-assessor | 400 | 403 | 403 | 403 | 401 |
| change-password | 400 | 400 | 403 | 403 | 401 |
| delete-evaluation | 400 | 403 | 403 | 403 | 401 |
| export-evaluations | 200 | 403 | 403 | 403 | 401 |
| get-assessment-history | 400 | 400 | 400 | 400 | 401 |
| get-assessment-risk | 400 | 400 | 403 | 403 | 401 |
| get-assessment-version | 400 | 400 | 400 | 400 | 401 |
| get-assessor-workload | 200 | 403 | 403 | 403 | 401 |
| get-evaluations | 200 | 200 | 403 | 403 | 401 |
| get-notifications | 200 | 200 | 403 | 403 | 401 |
| issue-certificate | 400 | 403 | 403 | 403 | 401 |
| lookup-evaluation | 200 | 200 | 403 | 403 | 401 |
| manage-inquiries | 200 | 403 | 403 | 403 | 401 |
| manage-invoice | 400 | 403 | 403 | 403 | 401 |
| manage-users | 200 | 403 | 403 | 403 | 401 |
| register-customer | 400 | 403 | 403 | 403 | 401 |
| save-evaluation | 403 | 400 | 403 | 403 | 401 |
| schedule-assessment | 400 | 403 | 403 | 403 | 401 |
| status-stream | 200 | 200 | 200 | 200 | 401 |
| update-evaluation | 400 | 403 | 403 | 403 | 401 |
| vendor-documents | 400 | 400 | 400 | 400 | 401 |
| vendor-invite | 400 | 403 | 403 | 403 | 401 |
| vendor-portal-data | 403 | 403 | 200 | 200 | 401 |
| vendor-profile | 403 | 403 | 200 | 200 | 401 |
| vendor-resubmit | 403 | 403 | 400 | 400 | 401 |
| verify-session | 200 | 200 | 200 | 200 | 401 |

The table records the earlier direct matrix responses; its temporary JSON artifact is no longer available. The fresh full test run re-exercises all 140 cells and verifies forbidden roles independently of the frontend.

## 9. JWT findings

HS256 is explicitly signed and allowed during verification. A known role and finite expiry are required; invalid signatures, payload role edits, alternate algorithms, expired and expiry-free tokens fail. Query tokens are accepted only for SSE compatibility. The validator permits legitimate JWTs with many linked IDs up to 16,384 characters; ordinary query values retain the 2,000-character limit. A positive large-token test verifies current database ownership still governs SSE. Production refuses absent/short secrets; the non-production fallback is random per process and invalidates unconfigured development sessions on restart. **VERIFIED WORKING.**

Tokens remain Bearer credentials until expiry. Logout removes the client's token and closes its stream; it does not add centralized revocation of copied tokens. Staff account/session revocation beyond the existing contracts is not claimed.

## 10. Ownership / IDOR findings

Stable Assessor account/assessor IDs override name hints; email and exact full-name fallbacks support historical records only when stronger identifiers are absent. Partial-name matching no longer authorizes access. An unassigned resource cannot be claimed by an Assessor submission. Current assignment takes precedence for writes: a previous author may retain authorized history access but cannot resubmit after reassignment to another Assessor. Manager authority is global, not a Vendor tenant role.

Vendor ownership uses the current active account links for history, versions, profile, documents, portal reads and SSE, rejecting an overbroad stale signed token. Vendor A cannot read/upload/download Vendor B's private resources. Profile IDs in a request cannot select another account. Public certificate lookup intentionally remains public for minimal endorsement data.

**VERIFIED WORKING** for tested IDs and conflicting-name fixtures. Exact-name-only historical assignment cannot provide the same identity assurance as a stable ID; duplicate historical names are a residual data-quality risk, not evidence that conflicting current IDs are accepted.

## 11. Password findings

bcrypt hashing is preserved; stored hashes are excluded from all retrieval responses. Eight-character minimums apply to staff creation/reset and staff/Vendor password changes; the UTF-8 byte cap prevents silent bcrypt truncation. Ordinary changes verify the current password; first setup is allowed only when both account and token require it, and the old flagged token cannot repeat setup after the account flag is cleared.

Manager provisioning/reset may return a credential once in a successful authenticated mutation response, preserving onboarding. GET/list responses do not expose stored passwords. Backend Vendor provisioning uses a cryptographic random suffix; legacy Manager suggestions use `crypto.getRandomValues`. **VERIFIED WORKING locally.** Existing short historical passwords are not forcibly rotated by this pass.

## 12. Scoring integrity

All 33 required criteria still use the existing authoritative rubric and server recomputation. Unknown option labels, altered totals, non-finite totals and privileged initial status fail. Supplied points do not override canonical scoring; official totals, stars and rubric identity come from the server. Trusted Assessor identity, creation time and history replace supplied actor/timestamp/certificate values. **VERIFIED WORKING** in adversarial and unchanged scoring regressions.

## 13. Version integrity

Resubmission appends an immutable technical snapshot; old breakdown/comments remain unchanged. Existing legitimate edits of an unlocked pending-review submission are preserved as a new version. Approved/certified/completed stages stay locked. New Mongo version inserts await the unique `(evaluationId, versionNumber)` index so index failure cannot silently allow duplicates; JSON storage retains its duplicate-version check.

Approval may mark approval metadata, but does not rewrite historical technical content. **VERIFIED WORKING locally**; real concurrent Atlas inserts/index permissions are **NOT TESTED**. Version insertion and parent/linked-record updates are not one multi-document transaction.

## 14. Upload security

Vendor-only uploads require current ownership, an allowed category/type and matching extension; executable disguises, slash/backslash traversal, controls and unsafe document IDs fail. Base64 validation uses bounded decoded-size estimation and a linear character check, avoiding the oversized-input regex failure caught during verification. Zero-byte and >10 MiB decoded files fail.

Names are sanitized; identifiers include cryptographic randomness; files use confined `.uploads/<id>.bin` paths, exclusive creation and mode 0600. Role/type/owner/oversize/traversal tests pass. **VERIFIED WORKING for those boundaries.** MIME/extension checks are not magic-byte validation, malware scanning, content disarm or safe parsing of every permitted document. Durable multi-instance upload storage is not established.

## 15. Download security

Private documents require a signed allowed role and resource ownership. Tested owner Vendor and own Assessor succeed; another Vendor, unrelated/unassigned Assessor and no session fail. Safe document IDs map to the confined binary path; stored arbitrary paths are ignored. Response filenames are sanitized and downloads use attachment plus nosniff. Metadata uses an explicit field allowlist.

Vendor deletion cannot remove accepted or verified documents. **VERIFIED WORKING locally.** Host-level compromise, filesystem symlink tampering and production filesystem durability are not covered by these remote-application tests.

## 16. XSS

React renders API strings as text. Root/public Assessor toasts now escape untrusted messages. The audited local PDF engine sanitizes text sources, and the application's certificate template still escapes record fields. Existing legacy renderers retain their escaping; no redesign or wholesale template rewrite was introduced. Browser fixtures exercise company names, criterion comments, document names and office addresses in repository/workspace/legacy views and assert that injected image handlers never become executable DOM. Node tests preserve literal comment text in storage.

**VERIFIED WORKING** for these tested sinks. This is not a claim of an exhaustive DOM-XSS proof; retained legacy inline CSP compatibility is documented in section 21.

## 17. Input validation

The shared wrapper rejects non-object JSON bodies, operator/prototype keys, object queries, invalid/long identifiers, excessive nesting/array size, malformed numeric parameters, typed/string length violations, bad dates and overlong password bytes. Endpoint-specific required fields, enums, scoring and upload validation still apply. Express handles malformed and oversized JSON with bounded JSON errors rather than default stack pages.

**VERIFIED WORKING** for adversarial cases. It is not a replacement schema for every historical data field; flexible business metadata remains compatible.

## 18. Mass assignment

Handlers construct allowed update objects instead of applying arbitrary payloads. Vendor profile input cannot change role, login identity, owner links, active state, another account, status, score, history or certificate. Assessor writes cannot inject Manager lifecycle state, prior history, certificate fields or official totals. Protected Manager metadata edits do not overwrite technical snapshots. Actor and timestamp fields come from the authenticated backend context. **VERIFIED WORKING** in targeted tests.

## 19. Rate limiting

Shared limits are 600 reads or 300 mutations per endpoint/principal per ten minutes, with bounded 10,000-key storage. Existing stricter failed-login limits remain. Express uses socket/request connection identity; arbitrary forwarded IP headers do not override it. A direct public endpoint test reaches a real 429. SSE has a six-active-connection cap per principal.

**VERIFIED WORKING process-local; PARTIALLY WORKING for distributed abuse control.** Instances/restarts have separate limits; no global Netlify quota, sustained load test or Redis was added. Production gateway limits and trusted proxy metadata remain deployment verification items.

## 20. Error handling

The wrapper normalizes unexpected handler/database failures without exception objects, stack traces, URIs, tokens, body contents or paths. Authorization/ownership, missing resources, conflicts and limits retain 401/403/404/409/429. Express parser failures use 400/413; unknown request errors use a generic 500, including already-started responses ending safely.

Sentinel exceptions are absent from response/log output. **VERIFIED WORKING** in direct and HTTP tests. Existing specific benign validation messages are retained where useful.

## 21. Headers / CSP

Express and Netlify configuration use nosniff, frame denial/frame-ancestors, no-referrer, restricted permissions and production HSTS. HTML CSP specifies self/default, explicit required font/CDN/model sources, no objects, self base/form actions and scoped workers. API responses use restrictive CSP and no-store. Inline styles/scripts remain allowed for the existing legacy application; the wasm-specific permission preserves the optional existing model worker without enabling JavaScript eval. [Mozilla CSP documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) explains that distinction.

**VERIFIED WORKING for local headers and browser workflows.** Live HTTPS/HSTS and complete optional AI-model downloads are **NOT TESTED**. Inline compatibility and trusted CDNs remain residual XSS/supply-chain exposure.

## 22. CORS

Authenticated handlers no longer return wildcard origins. Requests without Origin get no permissive origin header; matching same-origin or explicit `TRACKSCORE_ALLOWED_ORIGINS`/Netlify deployment origins may be reflected. Other origins receive 403. Preflight declares supported methods and Bearer/JSON headers; Vary: Origin is set. Native Express SSE uses the same policy. **VERIFIED WORKING locally; live production origin/proxy configuration NOT TESTED.**

## 23. CSRF assessment

Sensitive authentication uses explicitly attached Bearer headers, not ambient authentication cookies. Cross-origin HTML forms cannot supply that Bearer header, and the CORS policy restricts script origins. SSE URL-token compatibility is read-only. No unnecessary cookie-CSRF framework was added. **VERIFIED WORKING for the current transport/source contract.** This does not mitigate a stolen token or same-origin script compromise.

## 24. SSE security

Signature, role and forced-password gates apply to snapshot and persistent stream endpoints. Events use an explicit public-status projection; notes, internal risk/workload/audit/auth material are omitted. Stable Assessor identity and current Vendor links determine scope; unknown/unscoped Assessor events are dropped safely. Express rechecks Vendor membership for each event and on a timer, closes on expiry, caps concurrent streams, and removes listener/timers on response close. Existing client singular connection, burst debounce, reconnect and logout cleanup remain.

**VERIFIED WORKING locally**, including real HTTP stream expiry and direct scoped sentinel events. Native Netlify handlers still return a finite recent-event snapshot; live long-lived serverless/proxy behavior and every producer are **NOT TESTED**. The process-local event bus is not a distributed event service.

## 25. Sensitive-data minimization

Vendor versions, score objects, breakdowns, metadata, actors, certificates, documents and history use restricted field projections; internal criterion comments, Manager notes, risk/workload/audit, credential metadata and paths are omitted. Assessor responses remove Manager-only notes/audit/workload and keep authorized technical/history/customer fields. Public certificates retain only their explicit endorsement fields. Authentication tokens and one-time Manager credentials are narrowly preserved only in their intended successful mutation responses.

Fixtures contain MANAGER_SECRET, ASSESSOR_SECRET, VENDOR_A_SECRET, VENDOR_B_SECRET, RISK_SECRET, WORKLOAD_SECRET, AUDIT_SECRET, PASSWORD_HASH_SECRET, JWT_SECRET_VALUE and SERVER_PATH_SECRET. Unauthorized responses and Vendor snapshots are checked for leakage. **VERIFIED WORKING** for the tested projection/resource combinations.

## 26. Certificate security

Only Manager tokens can prepare, print, record signature and deliver through either certificate alias. The approved version must exist with 33 criteria and valid details; existing certified-version binding must agree. Server ordering is enforced; repeated recorded steps cannot replace certificate numbers/signatures/dates. Delivered records stay complete. Private certificate-related snapshots remain ownership-scoped; public lookup is an explicit minimal endorsement response.

The existing end-to-end lifecycle, PDF/download and public verification regressions pass. Additional real-engine downloads at 375px and 1366px produce one A4 page with unchanged capture dimensions, rather than relying solely on the earlier PDF mocks. **VERIFIED WORKING locally.** Recording a physical DGO signature is metadata, not verification of a digital signature or a scanned signer identity.

## 27. Session / logout

React verifies signatures before protected children, clears expired/auth-failed sessions, cancels stale verification/API work and closes sources on logout/replacement/pagehide. BFCache restoration re-verifies before revealing the React root; legacy pages hide on pagehide and verify on restoration. Logout clears auth keys/Manager session hint while retaining unrelated drafts.

Both portal kinds reject missing, expired and invalid/edited tokens; cross-role redirects never grant backend privilege. **VERIFIED WORKING in tested browser cases.** Copied JWT server revocation and exhaustive browser-cache behavior are not claimed.

## 28. Concurrency

Per-resource in-process locks reject overlapping writes across actions; UI submitting states prevent repeated clicks. Manager React review/schedule/assignment/certificate payloads include the viewed expectedVersion, returning 409 for a newer current version. The version is checked both at the shared boundary and against the handler's freshly read snapshot before its conditional update, covering a read-between-checks race. Mongo primary workflow updates use conditional current version/status/timestamp/certificate fields; JSON updates compare the same snapshot. Immutable versions use uniqueness enforcement; recorded certificate steps reject replay. Approved/completed work cannot be reassigned or rescheduled.

**VERIFIED WORKING for local concurrent and stale cases; PARTIALLY WORKING across a deployment.** Mongo compare-and-set is covered with a failing-match test, not a live Atlas race. Legacy callers without expectedVersion retain lifecycle/CAS checks but do not gain a universal viewed-version contract. Multi-document atomicity, upload rollback and cross-process JSON guarantees remain limited; no new schema/transaction service was added.

## 29. Audit / history

Actor identity for approval/update/delete/submission comes from JWT/backend account context; status-history timestamps are generated by the server. Caller-supplied history, prior timestamps and official certificate/version state are not copied wholesale. Existing history is appended and technical versions remain immutable. Signatory and business date inputs remain explicitly authorized Manager-recorded certificate metadata, while the audit records the actual Manager action/time. **VERIFIED WORKING** in source and targeted mutation assertions.

## 30. Production secret safety

**VERIFIED WORKING for the checked artifacts:** 36 published frontend files scanned against 3 configured sensitive values and private-material patterns: zero matches. .env/runtime storage/backend/source/private upload routes are blocked; no real deployment or production credential was used. A fresh configured-value scan also checked 608 tracked source files (excluding `.env` and runtime JSON), with zero configured secret matches. Five URI-pattern matches are loopback test configuration or a placeholder, rather than configured credentials. Retired API-key examples matching local configuration were removed from README; their historical Git text remains. Test accounts and captures live only in temporary isolated storage. No new capture/JWT/password/PDF was staged or committed.

Password values in two old tracked QA files were redacted, including repeated login-instruction copies found during the pre-push review. Git history still contains the old text. Fresh hashes verify all seven protected files (`.env`, four runtime JSON files and two landing pages) stayed unchanged throughout this resume; earlier original-hash verification of the environment/landing pages remains a historical observation. Four `.data/*.json` files were already tracked; their fresh hashes match the recorded pre-audit hashes, with no staging/untracking or new credentials introduced. They are not frontend build inputs or served files. Existing generated PDFs were preserved; the audit did not generate repository PDFs. .gitignore now also excludes HAR/temporary QA credential artifacts.

## 31. DB fail-closed behavior

The existing production guard refuses local JSON fallback on absent, malformed or unreachable Mongo configuration; the isolated subprocess test verifies DATABASE_UNAVAILABLE and absence of a created .data directory. Non-production JSON fallback remains intentional. Secret/connection failures are sanitized; misleading TLS advice about opening all IPs/falling back normally was removed.

**VERIFIED WORKING for simulated production failure.** Live Atlas connection, permissions/index creation, failover and load are **NOT TESTED**. No production database was contacted.

## 32. Dependency audit

Fresh audit had three entries. source-map-js was patched from 1.2.1 to 1.2.2; ExcelJS stays 4.4.0 with a scoped uuid 11.1.1 override. No forced major downgrade was used. ExcelJS's v4/CommonJS UUID use is retained; a workbook export/reopen test passes. The primary advisories are [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) and [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

Final npm audit: **0 vulnerabilities**, exit 0. **VERIFIED WORKING for npm's current catalog**, not proof of absence of unknown vulnerabilities. The old CDN html2pdf.js 0.10.1 also had a published text-source XSS advisory outside the original npm audit. It is now replaced by local html2pdf.js 0.14.0 bundled with jsPDF 4.2.1, DOMPurify 3.4.17 and html2canvas 1.4.1, all included in the lockfile/audit. [Maintainer advisory](https://github.com/eKoopmans/html2pdf.js/security/advisories/GHSA-w8x4-x68c-m6fc) and [jsPDF patched-output advisory](https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5) document the fixes. `scripts/build-pdf.mjs` generates ignored public/pdf-engine.js; dev/build generate it before serving/copying assets. The eight legacy/core loader references now use that local asset. Actual mobile/laptop certificate downloads verify a single A4 page, 1588x2240 canvas and valid PDF bytes; the library text-source XSS fixture is sanitized. Optional model CDN trust remains.

## 33. Logging hygiene

Handler failures and database/TLS/stream diagnostics use endpoint/category codes without raw errors, request bodies, passwords, hashes, authorization headers, URLs with query tokens, database URIs or upload contents. Migration diagnostics no longer print customer names/record identifiers. Browser security assertions use booleans instead of displaying token strings. Temporary raw HARs remain outside Git; safe capture summaries retain paths/statuses only.

**VERIFIED WORKING** in targeted logging tests/source review. Platform/access/proxy logs are not controlled or audited here; URL-token exposure is still possible there.

## 34. Tests added

`tests/full-security-hardening.test.js` adds 172 tests/cells to the 368-test baseline: direct protected role matrix, JWT and forced-password gates, conflicting identity/stale links, peer scope, secret projections, traversal/type/Base64/size/ownership downloads, profile mass assignment, authoritative scoring/actors/history, version immutability/stale conflict, certificate binding/replay/order, SSE scope, safe failures/logs, malformed/operator input, CORS, rate-window and actual 429, concurrent lock/lost-Mongo-match handling, ordinary/initial password changes, current-assignee write restrictions, large valid SSE tokens and ExcelJS compatibility.

Existing fixtures were corrected to create real isolated Vendor accounts, assign a registration before Assessor submission, and expect traversal rejection followed by an ordinary upload. Assertions were strengthened to reflect new security boundaries; positive workflows remain intact.

`scripts/security-browser.mjs` extends the complete existing harness with portal/storage/JWT/URL matrices, a delayed verifier/no-flash observer, DOM-XSS fixtures, browser IDOR/profile injection, real stream expiry, safe HTTP errors/private-path and public-route checks. No app Playwright dependency was added; the external scratch installation supplies the existing harness.

## 35. Exact npm test result

**VERIFIED WORKING — exit 0.**

```text
1..149
# tests 540
# suites 59
# pass 540
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21520.896323
```

Evidence: `/tmp/trackscore-security-resume-l3hti1cg/final-test.log`. All existing legitimate functional regressions remain passing.

## 36. Exact lint result

**VERIFIED WORKING — exit 0.**

```text
tsc --noEmit && tsc --noEmit -p tsconfig.react.json
```

No diagnostics. `/tmp/trackscore-security-resume-l3hti1cg/final-lint.log` retains the command. A scoped whitespace check using the repository's CRLF convention also passes; pre-existing landing/App whitespace changes are preserved and excluded from that scoped check. The default Git whitespace check reports CRLF and those existing differences; the scoped check enables cr-at-eol and excludes landing.html, public/landing.html and src/app/App.tsx.

## 37. Exact build result

**VERIFIED WORKING — exit 0.** Local PDF bundling, legacy Vite, independent Manager/Assessor/Vendor builds and esbuild backend completed. The patched local PDF engine is generated first; no warning was reported in the captured final build.

```text
> npm run build:pdf && vite build && npm run build:react && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs
dist/react/manager.html                  0.65 kB │ gzip:   0.37 kB
dist/react/assessor.html                 0.66 kB │ gzip:   0.37 kB
dist/react/vendor.html                   0.67 kB │ gzip:   0.38 kB
../dist/react/manager.html                   0.59 kB │ gzip:   0.34 kB
../dist/react/assets/manager-2Ph6z5gl.css   16.19 kB │ gzip:   4.05 kB
../dist/react/assets/manager-CSoat3Sj.js   442.31 kB │ gzip: 120.06 kB
../dist/react/assessor.html                   0.60 kB │ gzip:   0.35 kB
../dist/react/assets/assessor-2Ph6z5gl.css   16.19 kB │ gzip:   4.05 kB
../dist/react/assets/assessor-DTwGseYA.js   442.31 kB │ gzip: 120.06 kB
../dist/react/vendor.html                   0.61 kB │ gzip:   0.36 kB
../dist/react/assets/vendor-2Ph6z5gl.css   16.19 kB │ gzip:   4.05 kB
../dist/react/assets/vendor-DyPdr4d7.js   442.31 kB │ gzip: 120.06 kB
  public/pdf-engine.js  968.0kb
  build/server.cjs      408.3kb
  build/server.cjs.map  748.9kb
```

Evidence: `/tmp/trackscore-security-resume-l3hti1cg/final-build.log`. Generated dist/build remain ignored.

## 38. Browser result

**VERIFIED WORKING — 137 checks passed, exit 0.** The complete current Manager/Assessor/Vendor suite has 104 retained checks plus 33 added security checks. Fresh Chromium results contain 137 VERIFIED WORKING entries, zero unexpected console/page errors and zero unexpected HTTP failures. Intentional error cases remain recorded as expected results.

The browser suite exercises role isolation in all three React and legacy portals, storage-role tampering, missing/expired/invalid/edited JWTs, delayed verification without protected-content flash, backend rejection under both API prefixes, actual escaped XSS fixtures, Vendor IDOR/profile injection, authenticated SSE expiry, malformed/oversize requests, private-path blocking and public routes. Existing Manager review/assignment/scheduling/certificate, Assessor submission/revision/peer review and Vendor workflow checks pass.

The actual local PDF engine produced valid single-page A4 certificates at 375px and 1366px widths: both canvases were 1588×2240, with PDF sizes 396,312 and 396,328 bytes. A library text-source XSS fixture had its event handler removed and did not execute. Browser screenshots, structured role results, PDF proof and complete results are retained outside Git under `/tmp/trackscore-phase-a-browser-9MOPQF`; the command log is `/tmp/trackscore-security-resume-l3hti1cg/final-browser.log`.

Development rebuilding and generated production assets/rendering also passed. Production render uses a valid temporary JWT and an intercepted real backend summarizer response because production JSON fallback is intentionally disabled; it does not establish a live Atlas request. Chromium viewport emulation is not a physical-device or other-browser-engine certification.

Reproduction after building: set `TRACKSCORE_PLAYWRIGHT_MODULE` to an external installed Playwright Core `index.mjs`, optionally set `TRACKSCORE_BROWSER_EXECUTABLE`, then run `node scripts/react-manager-browser.mjs --phase-b --phase-c --phase-d --phase-e --phase-f --security`. This resume used an isolated scratch Playwright installation; application dependencies gained no browser-testing package.

## 39. Remaining risks

- **Potential P0:** historical QA password text and retired README API-key examples remain in Git history; validity/reuse is NOT TESTED. Rotate any reused account credential through an authorized live process. No history rewrite or production account reset was performed.
- Process-local quotas/locks/event bus and local uploads do not establish multi-instance durability or distributed abuse protection. Conditional Mongo updates are not cross-document transactions; interrupted version/linked-record/upload writes can leave partial/orphan state.
- Legacy clients do not universally submit expectedVersion; exact-name-only historical assignments lack stable-ID assurance and need data review if duplicate names exist.
- URL JWTs remain for compatible EventSource; production proxy/access logs can capture them. JWTs are not centrally revoked by client logout/password changes.
- Legacy CSP retains inline compatibility/trusted CDNs. Allowed document MIME/extension is not malware or magic-byte validation; host filesystem attacks are outside the tested boundary.
- Existing tracked runtime JSON and archived PDFs remain user work. Build/route isolation blocks access, but past Git contents are not erased.

These are explicit limits of the completed local remediation, not claims that a live deployment is secure without verification.

## 40. NOT TESTED

Live Netlify deployment, real Atlas connectivity/permissions/index migration and concurrent replicas; real production credentials, historical credential reuse/rotation and history rewrite; actual production mutations/email delivery; distributed load/bot resistance, platform CORS/proxy/HSTS/access logs; long-lived Netlify streaming, every event producer and durable shared uploads; malware/content parsing, host compromise/symlinks; other browser engines/physical devices/full accessibility audit; optional live AI-model/CDN supply-chain verification; exhaustive XSS/static equivalence and all browser BFCache configurations.

## 41. BLOCKED

No required local implementation or verification is BLOCKED. Live production changes were outside the allowed isolated scope and were not attempted. Historical credential rotation/history cleanup and deployment verification are separate external actions, not silently relabelled as completed tests.

## 42. Exact final Git status

No staged files; git diff --cached --stat and --name-only are empty. The index is unchanged since resuming; the earlier pass also verified it against the initial inventory, whose temporary copy is now unavailable. Pre-existing work and runtime data are retained; old QA password fields were deliberately redacted. No commit, reset, discard, staging or unstaging occurred.

```text
 M .data/evaluations.json
 M .gitignore
 M README.md
 M app.js
 M certificate-pdf.js
 M change-password.html
 M dashboard.html
 M index.html
 M landing.html
 M netlify.toml
 M netlify/functions/add-comment.js
 M netlify/functions/approve-evaluation.js
 M netlify/functions/assign-assessor.js
 M netlify/functions/auth.js
 M netlify/functions/change-password.js
 M netlify/functions/config.js
 M netlify/functions/db.js
 M netlify/functions/delete-evaluation.js
 M netlify/functions/export-evaluations.js
 M netlify/functions/get-assessment-history.js
 M netlify/functions/get-assessment-risk.js
 M netlify/functions/get-assessment-version.js
 M netlify/functions/get-assessor-workload.js
 M netlify/functions/get-evaluations.js
 M netlify/functions/get-notifications.js
 M netlify/functions/issue-certificate.js
 M netlify/functions/login.js
 M netlify/functions/lookup-evaluation.js
 M netlify/functions/manage-inquiries.js
 M netlify/functions/manage-invoice.js
 M netlify/functions/manage-users.js
 M netlify/functions/register-customer.js
 M netlify/functions/rubric.js
 M netlify/functions/save-evaluation.js
 M netlify/functions/schedule-assessment.js
 M netlify/functions/send-pre-final.js
 M netlify/functions/status-bus.js
 M netlify/functions/status-stream.js
 M netlify/functions/submit-inquiry.js
 M netlify/functions/update-evaluation.js
 M netlify/functions/vendor-documents.js
 M netlify/functions/vendor-invite.js
 M netlify/functions/vendor-login.js
 M netlify/functions/vendor-portal-data.js
 M netlify/functions/vendor-profile.js
 M netlify/functions/vendor-resubmit.js
 M netlify/functions/vendor-submit-payment.js
 M netlify/functions/verify-certificate.js
 M netlify/functions/verify-payment.js
 M package-lock.json
 M package.json
 M public/app.js
 M public/certificate-pdf.js
 M public/change-password.html
 M public/dashboard.html
 M public/index.html
 M public/landing.html
 M public/vendor-portal.html
 M qa/stabilization/supplement-credentials.tst
 M qa/stabilization/supplement-credentials.txt
 M react/manager.html
 M scripts/react-manager-browser.mjs
 M server.ts
 M src/app/App.tsx
 M src/app/AuthProvider.tsx
 M src/app/app.css
 M src/app/routes.tsx
 M src/components/common/RequestState.tsx
 M src/components/layout/ManagerLayout.tsx
 M src/services/api.ts
 M src/services/auth.ts
 M src/types/api.ts
 M src/utils/format.ts
 M tests/assessment-risk.unit.test.js
 M tests/criterion-comments.test.js
 M tests/e2e-comment-persistence.test.js
 M tests/production-verification-history.test.js
 M tests/record-deduplication.unit.test.js
 M vendor-portal.html
 M vite.config.ts
 M vite.react.config.ts
?? docs/react_phase_b_parity_map.md
?? docs/react_phase_c_parity_map.md
?? docs/react_phase_d_parity_map.md
?? docs/react_phase_e_parity_map.md
?? docs/react_phase_f_parity_map.md
?? docs/trackscore_security_inventory.md
?? netlify/functions/security.js
?? netlify/functions/verify-session.js
?? portal-guard.js
?? public/commercial-vehicle-truck.png
?? public/portal-guard.js
?? public/trackscore-lorry.png
?? qa/screenshots/
?? react/assessor.html
?? react/vendor.html
?? react_migration_phase_b_report.md
?? react_migration_phase_c_report.md
?? react_migration_phase_d_report.md
?? react_migration_phase_e_report.md
?? react_migration_phase_f_report.md
?? scripts/build-pdf.mjs
?? scripts/inspect-landing-responsive.mjs
?? scripts/react-assessor-phase-e.mjs
?? scripts/react-manager-phase-b.mjs
?? scripts/react-manager-phase-c.mjs
?? scripts/react-manager-phase-d.mjs
?? scripts/react-vendor-phase-f.mjs
?? scripts/reproduce-auth-bug.mjs
?? scripts/security-browser.mjs
?? scripts/verify-landing-redesign.mjs
?? scripts/verify-landing-responsive-fix.mjs
?? src/app/managerRoutes.ts
?? src/app/vendorRoutes.ts
?? src/assessor.tsx
?? src/components/assessor/
?? src/components/certificate/
?? src/components/common/AssessmentReadout.tsx
?? src/components/common/ErrorBoundary.tsx
?? src/components/common/ErrorPage.tsx
?? src/components/common/Modal.tsx
?? src/components/layout/AssessorLayout.tsx
?? src/components/layout/VendorLayout.tsx
?? src/components/manager/
?? src/components/vendor/
?? src/hooks/useVendorStatusStream.ts
?? src/manager.tsx
?? src/pages/assessor/
?? src/pages/manager/AssessmentHistory.tsx
?? src/pages/manager/AssessmentRepository.tsx
?? src/pages/manager/AssessmentRisk.tsx
?? src/pages/manager/AssessmentWorkspace.tsx
?? src/pages/vendor/
?? src/services/assessmentRisk.ts
?? src/services/assessorAssessments.ts
?? src/services/assessorDrafts.ts
?? src/services/assessorSubmission.ts
?? src/services/certificateActions.ts
?? src/services/managerAssessments.ts
?? src/services/managerMutations.ts
?? src/services/peerReviews.ts
?? src/services/vendorAssessments.ts
?? src/services/vendorDocuments.ts
?? src/services/vendorProfile.ts
?? src/types/assessor.ts
?? src/types/errors.ts
?? src/types/legacyEligibility.d.ts
?? src/types/managerAssessment.ts
?? src/types/vendor.ts
?? src/utils/certificate.ts
?? src/utils/errors.ts
?? src/utils/navigation.ts
?? src/utils/rubric.ts
?? src/utils/vendorCertificate.ts
?? src/utils/versionComparison.ts
?? src/vendor.tsx
?? tests/error-handling-recovery.test.js
?? tests/full-security-hardening.test.js
?? tests/rbac-security-hotfix.test.js
?? tests/react-assessor.test.js
?? tests/react-certificate-actions.test.js
?? tests/react-manager-mutations.test.js
?? tests/react-manager-readonly.test.js
?? tests/react-vendor.test.js
?? trackscore_full_security_hardening_report.md
?? trackscore_landing_lorry_visual_report.md
?? trackscore_landing_redesign_report.md
?? trackscore_landing_responsive_fix_report.md
```

Stopped after security hardening and this report. No feature or migration phase was begun.
