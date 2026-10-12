# TrackScore React migration — Phase A rebuild and fresh verification

Date: 2026-10-12, Asia/Kuala_Lumpur. Repository: `/home/hizalhaziq/Coding/trackscorev4`, starting commit `b74ce7a` (`Stabilize TrackScore before React Phase B`). Verification environment: Ubuntu, Node 22.22.1, npm 9.2.0. This report follows the latest rebuild request in attachment `07de8bd3-c27c-4756-a826-71429865fb85`; it records a fresh inspection and baseline rather than assuming the previous implementation was gone.

**VERIFIED WORKING:** isolated React foundation and read-only Manager Overview at `/react/manager.html`. Legacy Manager dashboard remains `/dashboard.html`. Backend handlers, business workflows, production data and payment retirement are preserved. Phase B has not been implemented.

Status terms describe the evidence available: **VERIFIED WORKING**, **VERIFIED BROKEN**, **PARTIALLY WORKING**, **NOT TESTED**, **BLOCKED**. Passing local verification does not establish a live Netlify or Atlas deployment.

## 1. Pre-change Git status

**VERIFIED WORKING — existing work preserved.** The checkout was on `main`, up to date with `origin/main`. `git status` showed seven modified tracked files and fifteen individual untracked files already present from the previous rebuild. Those files were inspected and retained. The initial short status was exactly the same file list recorded in section 26. There were zero staged files: both `git diff --cached --stat` and `git diff --cached --name-only` were empty. No sensitive/generated files were staged.

Initial `git diff --stat`: seven files changed, 55 insertions and 502 deletions relative to HEAD; untracked files are not included in that stat. Git/index and a fresh file hash inventory were saved in `/tmp/trackscore-phase-a-reverify-x961r9l1/{git-before.txt,diff-before.txt,index-before.txt,staged-before.txt,hashes-before.json}`. No reset, discard, automatic unstaging or commit was performed. The earlier rebuild started clean; that historical fact is not this pass's initial state.

## 2. Pre-change test baseline

**VERIFIED WORKING.** All commands exited 0 before implementation:

| Command | Exact baseline result |
| --- | --- |
| `npm test` | 230 tests, 37 suites; 230 pass, 0 fail/cancelled/skipped/todo; duration 17883.939171 ms |
| `npm run lint` | `tsc --noEmit && tsc --noEmit -p tsconfig.react.json`, no diagnostics |
| `npm run build` | Preserved nine-input Vite frontend (1.73 s), independent React build (1.38 s), esbuild backend (22 ms) completed |

Fresh read-only Chromium smoke checks loaded all eight requested legacy pages plus the existing React entry: nine HTTP 200 responses, zero console/page errors and zero unexpected HTTP failures. Temporary signed sessions and isolated local JSON storage were used. Evidence: `/tmp/trackscore-phase-a-reverify-x961r9l1/baseline-{test,lint,build}.log`, `baseline-browser.json` and `baseline-server.log`. The baseline was not broken and required no repair.

## 3. Existing React status

React classification: **ACTIVE**. Verification status: **VERIFIED WORKING**. All requested Phase A source files were present, including the composed app, auth/route layer, Manager page, components, hooks, services/types/helpers, entry and React-specific configurations. They were inspected and reused only after the fresh tests/build/browser baseline passed. No missing implementation file needed restoration.

The earlier rebuild had already replaced the committed monolithic App and corrected certificate/schedule labels, authentication/request/stream lifecycle and source HTML serving. Those changes remain in the current working tree. This pass strengthens durable browser verification of real React ownership, successful module loading, matching served/generated bundle hashes and the overview GET's actual JavaScript initiator. Section 18 records that proof for development and production rendering.

Inspection covered both root/public HTML and scripts, Vite/TypeScript/server configuration, authentication, `get-evaluations?view=overview`, the backend overview summarizer and SSE bus/handler. Correct existing entry/configuration/types/helpers were reused. `src/index.css` was inspected and preserved; the new app uses its own scoped stylesheet. The historical `react_migration_baseline.md` is left unchanged and does not replace this current-checkout inspection.

## 4. Files created

No source files were newly created in this pass. The following fourteen implementation/verification files and report already existed as untracked working-tree files and were preserved:

```text
scripts/react-manager-browser.mjs
scripts/watch-react.mjs
src/app/App.tsx
src/app/AuthProvider.tsx
src/app/routes.tsx
src/app/app.css
src/components/layout/ManagerLayout.tsx
src/components/common/RequestState.tsx
src/components/common/StatusBadge.tsx
src/hooks/useAuth.ts
src/hooks/useApi.ts
src/hooks/useStatusStream.ts
src/pages/manager/ManagerDashboard.tsx
tests/react-foundation.test.js
react_migration_phase_a_report.md
```

No empty future-phase placeholders were added. Fresh browser/REA evidence is in temporary directories rather than the repository.

## 5. Files modified

Changes made **during this pass** are limited to `scripts/react-manager-browser.mjs` (actual root/bundle/request-initiator assertions) and this report (fresh state/results/evidence). Both already existed as untracked files. Application source required no further changes because the inspected implementation passed fresh verification.

The seven tracked modifications already present relative to HEAD remain:

| File | Purpose |
| --- | --- |
| `package.json` | Explicit development mode, independent React build, combined build ordering, strict React lint |
| `scripts/run-tests-isolated.mjs` | Copy React source into isolated test app and enable the existing tsx loader |
| `server.ts` | Generated-only React route and development build watcher startup/cleanup |
| `src/App.tsx` | Replace monolith with compatibility re-export of the composed Phase A app |
| `src/main.tsx` | Mount composed app under StrictMode and import scoped app CSS |
| `src/services/api.ts` | Validate allowed prefixes and respect cancellation during response processing |
| `src/services/auth.ts` | Correct conditional profile spread grouping |

`vite.config.ts`, `vite.react.config.ts`, `tsconfig.json`, `tsconfig.react.json`, `react/manager.html`, `netlify.toml` and `package-lock.json` retain their pre-change bytes. No dependency packages were added. Root/public legacy copies and every backend function remain unchanged, including `netlify/functions/change-password.js`.

## 6. React architecture

**VERIFIED WORKING.** `main.tsx` mounts `AuthProvider → ManagerRoute → ManagerDashboard`. Auth context reads the existing session; the route admits only Managers who do not require a password change. Layout and request/status presentation are shared small components.

The dashboard obtains data through `services/assessments.ts` and `services/api.ts`. `useApi` owns cancellation, latest-request ordering, loading/error/data state and refresh. `useStatusStream` owns one connection and refresh triggers. Existing typed backend response definitions and presentation/date utilities are reused.

Only the overview is rendered. Workflow navigation opens the real legacy Manager portal. There are no approval, assignment, certificate or repository mutation controls in React.

## 7. Development integration

**VERIFIED WORKING.** Run:

```sh
npm run dev
```

Open `http://localhost:3000/react/manager.html` (or the configured `PORT`). Sign in using the existing login page and Manager account; no new login endpoint or test credentials were added.

Express starts the independent Vite build watcher in a child process and waits for its initial successful compilation before listening. The child isolates Vite's development environment from backend authentication behavior. Source edits rebuild generated output; refresh the browser to see them. This is a build watcher, without HMR. Startup compile failures stop startup; subsequent builds preserve previously generated files. Watcher cleanup handles process signals/disconnect.

The `/react` handler serves only generated `manager.html` and narrowly allowed asset filenames, with no-store headers. `/react/manager` redirects to the HTML entry. It does not fall back to raw source. Development checks confirmed 14 blocked paths, including `.env`, `.data`, source files, backend bundle/source, private-looking uploads and arbitrary `/react` paths. Existing API routes and legacy shortcuts remain intact.

## 8. Build integration

**VERIFIED WORKING.** `npm run build` runs the unchanged legacy Vite configuration, then the isolated React build, then esbuild for Express. `npm run build:react` is also available separately.

The pre-existing nine Vite inputs, including its React input, are retained exactly as requested. Consequently the legacy build also emits a duplicate React asset pair under `dist/assets`; the independent build runs last and supplies the final entry referencing `/react/assets`. This duplication is a bounded packaging tradeoff rather than a change to legacy inputs or global base behavior.

`vite.react.config.ts` uses `/react/`, no public directory and no environment-file directory, producing `dist/react/manager.html` and `dist/react/assets/*`. Backend output stays under `build/`, outside the published frontend. The existing Netlify `dist` publishing arrangement is unchanged; live hosting was not tested.

## 9. Authentication compatibility

**VERIFIED WORKING.** Existing keys remain `trackscore_token`, `trackscore_user_role` and `trackscore_user`; the legacy Manager session flag is handled consistently. JWT role claims drive frontend UX rather than an editable storage role hint. JWT decoding does not verify signatures: the existing backend still performs authoritative verification.

Managers can enter. Assessors and Vendors receive a denied view with their actual legacy portal link and open no React overview stream. Missing, malformed and expired sessions return to the existing login page. Required-password tokens and responses return to `/change-password.html` without a new authentication model or `/me` request.

Auth state follows same-window notifications, cross-tab storage changes, focus and token expiry. Logout clears authentication keys/Manager flag while preserving drafts and unrelated storage. Account replacement closes the old stream and starts one for the current token. Browser and backend tests cover role spoofing, expiry, 401 and password-required/ordinary 403; malformed sessions and invalid signatures are covered by the retained Node tests.

## 10. API architecture

**VERIFIED WORKING.** Requests use one typed wrapper and same-origin `/.netlify/functions/<endpoint>` by default. `VITE_API_PREFIX=/api` or an explicit allowed prefix selects `/api/<endpoint>`. Both prefixes were exercised, with no fallback/retry to a second prefix.

The wrapper attaches the legacy Bearer token, JSON-encodes request bodies, validates endpoints/prefixes, normalizes HTTP and invalid-response errors, and propagates AbortSignal. It guards aborted responses before authentication side effects and after body parsing. Existing JSON/text/Blob modes remain intact and are tested; Phase A uses only the overview JSON read.

401 clears the session; ordinary 403 preserves it and reports denial; password-required 403 preserves the token and triggers the existing password flow. Components show bounded user-facing errors without raw stack traces. Stale or aborted requests cannot overwrite newer filter data. No automatic mutation retries or new backend endpoints were introduced.

## 11. Manager overview implementation

**VERIFIED WORKING.** Uses the actual `GET get-evaluations?view=overview` response envelope `{success, overview}`. Cards display Needs Attention (`attentionTotal`), Waiting Review, Ready for Certificate, Overdue, Active, Due Soon, Unassigned and Certificates In Progress. They do not invent global counts for Changes Requested, Scheduled or In Progress.

Attention/recent sections display returned rows and genuine totals, explaining the backend's eight-row sample limit where applicable. Recent search, status and SLA controls use `q`, `overviewStatus` and `overviewSla`; grouped `review` and `revision` include both corresponding backend statuses. The UI states that filters apply to recent rows and global summary totals remain global.

The schedule is explicitly **Today's schedule, Malaysia time**, consistent with the endpoint. Date-only values show “Time not recorded” rather than an invented midnight appointment. Workloads show actual active/capacity values, including over-capacity ratios, with a bounded progress bar. Empty sections, initial loading, refresh, retained-data errors and Retry are implemented.

## 12. Status mapping

**VERIFIED WORKING.** Presentation helpers leave backend values unchanged. `submitted`/`pending_review` display Waiting Review; `rejected`/`remediation_required` display Changes Requested. Existing `pre_final_sent` and `payment_confirmed` display Approved using the established compatibility mapping. Payment controls, gates and logic were not restored. Status and SLA labels remain readable text, supported by colour rather than colour alone.

## 13. SSE behavior

**VERIFIED WORKING within local browser checks.** The existing same-origin `status-stream?token=...` authentication contract is preserved. Tokens are not printed in diagnostics. Native EventSource reconnection reuses the instance; errors do not create another connection.

One active source is maintained under StrictMode. A 250 ms debounce batches event bursts. Up to 50 event identifiers are remembered; record-ID events also use timestamp/status/action to avoid suppressing later changes to the same record. One 30-second fallback interval starts on connection errors and clears on recovery. Unmount, logout, token replacement and pagehide close the source and timers.

Browser evidence: one active/peak source; 12-event burst causes one refresh, duplicate replay causes zero additional refreshes, later change causes one; native reconnect retains its source and fallback timers stay singular. Some failure/burst callbacks are deliberately stimulated by the harness; production proxy behavior and every backend event producer are not thereby proven.

## 14. Tests added

The 29 meaningful Node tests from the earlier rebuild were retained in `tests/react-foundation.test.js`, using the existing isolated test runner. They cover legacy session keys, token role versus storage hints, malformed/expired tokens, invalid profile JSON, password-required state, logout/draft retention, login-role mismatch, both API prefixes, rejected external endpoints, Bearer/JSON/AbortSignal, public requests, response formats, 401/403, malformed/error responses, cancellation, status labels, real empty/populated backend overview parsing, and authoritative Manager/Assessor/Vendor/invalid-signature/expired-token access. They pass in both fresh baseline and final test runs; no duplicate implementation-mirroring tests were added.

`scripts/react-manager-browser.mjs` retains 30 durable browser checks using temporary local storage, fake accounts, generated signing secrets and actual local backend handlers. This pass strengthens its development and production checks with mounted React ownership, module identity and actual CDP API initiator assertions, retaining sanitized proof without tokens/headers. It also retains screenshots, response captures and structured assertions. Playwright is supplied externally through `TRACKSCORE_PLAYWRIGHT_MODULE`; no browser dependency was added to application dependencies. To rerun after building, provide an installed Playwright Core module and, if necessary, `TRACKSCORE_BROWSER_EXECUTABLE`.

## 15. Exact npm test result

**VERIFIED WORKING — exit 0.** Final `npm test`:

```text
1..84
# tests 230
# suites 37
# pass 230
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21612.989911
```

Evidence: `/tmp/trackscore-phase-a-reverify-x961r9l1/final-test.log`.

## 16. Exact lint result

**VERIFIED WORKING — exit 0.** Final `npm run lint` ran:

```text
tsc --noEmit && tsc --noEmit -p tsconfig.react.json
```

No diagnostics. Strict checking applies to new/existing React TypeScript without globally tightening legacy JavaScript. Evidence: `/tmp/trackscore-phase-a-reverify-x961r9l1/final-lint.log`. `git diff --check` also passed.

## 17. Exact build result

**VERIFIED WORKING — exit 0.** Vite 6.4.3 completed the preserved nine-input build in 2.09 s, the independent React build in 3.42 s, and esbuild completed in 114 ms.

```text
dist/react/manager.html                    0.59 kB / gzip 0.35 kB
dist/react/assets/manager-Dx5B-gZX.css      7.26 kB / gzip 2.16 kB
dist/react/assets/manager-VnXVOUV1.js     242.38 kB / gzip 75.27 kB
build/server.cjs                        376.4 kb
build/server.cjs.map                    690.4 kb
```

Final tested artifact SHA-256 values:

```text
HTML 65c347e7f674bf20b4fa8a712c89c5fbaf4568e982ee1865e9d18be3d002ec05
JS   3444c09ccf8ddab30dbd95a24c29d5ebb483bec56b7605b36fb7f2dd431f6df4
CSS  e932b686addc68ba6b4f831f2515ff3edf7ecaa876be98d847e0255f9e019a03
```

Evidence: `/tmp/trackscore-phase-a-reverify-x961r9l1/final-build.log` and `rea/artifact-identity-checks.json`. Final output hashes match the baseline build and the bundles exercised by the fresh browser run.

## 18. Browser verification

**VERIFIED WORKING — 30 checks, exit 0.** Fresh evidence: `/tmp/trackscore-phase-a-browser-Pvmel0/results.json` and `/tmp/trackscore-phase-a-reverify-x961r9l1/browser-final.log`. Tests exercised a real React mount and Manager login, role denial via frontend and both backend prefixes, empty/populated data, loading, failure/retry, refresh, filters/stale requests, logout/account replacement/cross-tab events, expiry, forced password change, resource cleanup, development rebuilding, production static routes and production bundle rendering.

Actual React activation is proven in `react-mount-proof.json`, for both modes: `#root` exists with React's root ownership marker and a child Fiber; the ManagerDashboard's Overview heading and eight cards render; exactly one module script is loaded with HTTP 200; its served SHA-256 matches the generated file; and Chromium CDP records a GET/200 Fetch whose initiator stack points into that same React bundle. No legacy overview controller is defined and no legacy DOM controller script is loaded into the React page. The built HTML contains the isolated entry. These are execution observations, not an inference from TSX filenames.

Development bundle: `/react/assets/manager-Bnlv9USE.js`, SHA-256 `38a3a4d87991bc7388663ed35f90a4b09e3e79d96c9cb49db4155a339e26da55`; initiating frame line 278, column 13682. Production bundle: `/react/assets/manager-VnXVOUV1.js`, SHA-256 `3444c09ccf8ddab30dbd95a24c29d5ebb483bec56b7605b36fb7f2dd431f6df4`; initiating frame line 49, column 59001. CDP proof retains paths/status/line/column only, not request headers or credential-bearing query strings.

There were zero unexpected console/page errors and zero unexpected HTTP failures. Four intentional failure cases produced the expected 503, ordinary 403, 401 and password-required 403. They are retained as expected evidence, not silently discarded.

Development exercises the real backend against isolated JSON data. Production mode cannot use that fallback; its bundle-render check intercepts the overview with the actual backend summarizer's output and a valid temporary Manager JWT. That proves production assets/rendering, not a live Atlas request.

## 19. Responsive results

**VERIFIED WORKING within the automated browser checks.** Tested 1920×1080, 1366×768, 1280×800, 768×1024 and 390×844. The populated overview fits each viewport, with visible Refresh, navigation, cards, recent rows, today's schedule and workloads. Wide tables scroll within their section rather than creating page overflow. Loading and error/retry states are also checked at the five requested sizes; responsive error injection uses HTTP 200 with the established `success:false` envelope. Evidence includes 15 screenshots and control-boundary assertions under `/tmp/trackscore-phase-a-browser-Pvmel0`.

These tests use Chromium viewport emulation; physical devices and other browser engines are NOT TESTED.

## 20. Accessibility results

**VERIFIED WORKING for tested interactions.** Keyboard activation of the skip link focuses the overview; one h1 is present; search/status/SLA controls have labels; Refresh supports keyboard activation and has a visible focus outline. Table captions/headers, labelled workload progress, readable status text, loading status announcements and error alerts are present.

This is targeted keyboard/DOM verification, not a complete accessibility certification. Screen readers, a full WCAG audit and exhaustive contrast testing are NOT TESTED.

## 21. Legacy regression results

**VERIFIED WORKING — smoke scope.** Fresh before/after read-only browser smoke checks returned HTTP 200 and zero errors for landing, login, Manager dashboard, Assessor `index.html`, Vendor portal, request-assessment, certificate verification and change-password. The final nine-page smoke also confirmed the rebuilt React mount. Evidence: `/tmp/trackscore-phase-a-reverify-x961r9l1/final-legacy-browser.json`/`.log`.

The durable harness additionally verifies real legacy Manager login, overview and repository rendering, navigation back from React, and production HTML serving. Workflow mutations were not repeated against production.

The fresh pre-change inventory covers 613 existing files. Exactly two changed during this pass: the browser verification script and this report; the remaining 611 retain their initial hashes. All application/backend/legacy source files are unchanged since this request. Forty-six backend function source files also match the original pre-rebuild snapshot. All 18 root/public mirrored pairs remain identical. `.env`, `.data`, retired-payment handlers and certificate logic retain their baseline hashes. The index is unchanged, with zero staged files. No production account, assessment or runtime storage was altered.

## 22. REA findings

Used the [reverse-engineer-anything skill](/home/hizalhaziq/.agents/skills/reverse-engineer-anything/SKILL.md) for shipped JavaScript/HTML and retained network captures. Ordinary source inspection used repository tools. REA did not use native binary analysis, fetch captured URLs, alter configuration or perform production mutations.

**Available capabilities:** no REA MCP tool is connected in this session. Cached REA 6.4.0 provides 127 CLI commands; its catalog advertises 170 MCP tools and six prompts, which must not be described as connected tools. The previous read-only doctor reported Codex registration `config_drift` and installed skill version 33 versus expected 37. No setup or configuration changes were made; the working pinned CLI supplied fresh capture inspection.

This pass executed `inspect-web-network-capture` against fresh captures. Prior `analyze-javascript-application`, `trace-javascript-semantics`, `compare-application-versions`, `build-reconstruction-obligation-ledger` and `evaluate-reconstruction-coverage` evidence was reused only after all five selected artifact hashes matched. Identical resource-exhausting static analyses were not repeated. Useful available but unexecuted commands include `inspect-web-page`, `list-browser-targets`, `reconcile-javascript-runtime` and `compare-source-to-bundle`. `record_unknown` is listed in the MCP catalog but has no standalone command in this CLI release; unknowns are recorded here and in retained findings.

| Observation | Status / evidence |
| --- | --- |
| Initial and revision-filtered legacy/React responses match for all nine compared field groups | VERIFIED WORKING within local fixture; complete HAR bodies, HTTP 200 |
| Metrics, total/attention/recent counts, selected row fields/reasons, workload and SLA summaries agree | VERIFIED WORKING; `rea/har-parity-comparison.json` |
| Literal unfiltered query differs (`all` versus empty), but initial results agree | VERIFIED WORKING for captured cases; not every possible query |
| Selected published legacy files and tested React artifacts retain their hashes | VERIFIED WORKING; artifact identity checks |
| Complete React semantic graph/static equivalence | PARTIALLY WORKING; semantic worker exhausted memory at 1 GiB and a focused 3 GiB retry |
| Machine-authenticated reconstruction closure | NOT TESTED / formal coverage unknown; no bound verifier contract |

Fresh complete captures are `/tmp/trackscore-phase-a-browser-Pvmel0/legacy-overview.har` and `react-overview.har`, each containing exactly two overview responses. Initial total/recentTotal is 12, attentionTotal is 7; revision recentTotal is 2. Metrics agree: active 11, review 2, dueSoon 0, overdue 1, unassigned 0, certificates 4, certificateReady 3, certificateInProgress 1. Workload agrees at 9 active / 5 capacity. SLA ticking seconds, timings and ETags are excluded from byte-equivalence claims. REA's capture parser excludes Authorization values; raw HARs contain only temporary test credentials and remain outside Git.

REA Evidence IDs:

```text
Legacy application ev_a6ccd2af216e6075da6e4588378bd8638714a3271d28a45532f8d318d64d4125
Legacy fetch trace ev_0a853a8966bff3a3a2c0ae437f25886d60b15f56ab3ddab5bf8498ba416be887
React application  ev_a6d6dbbad3841667d6deb426e4a9b23b2ca89d56c77084171761c3e78c9fb83a
Static comparison  ev_195a829c4c6bbbba648db5067377a9ad1161070f29e8e14f628cc42997b3f983
Legacy fresh HAR   ev_d57749cf54f23caf10c03ece86ff90435e19b38a415830d81b2e38925a649ab4
React fresh HAR    ev_29f55a813b49228e435925dc35f3a84d9960bdccd62ca51a7ac92f1792783771
Obligation ledger  ev_842a9a9f04749c01894c816430dbbf10e6c2dd1ae074585734daec295218306c
```

Legacy parsing is complete only within its two selected inputs and retains 419 conservative semantic unknowns. React has one parsed JS file, 78,895 visited AST nodes and zero parse failures, but its graph remains partial. Static comparison reports six added/eight unknown entities and no inferred matches; that does not prove lost features.

The reused formal ledger has 27 required obligations, zero formally verified and 27 open: 26 generated candidates are unowned and one reviewed overview obligation lacks a bound verifier. Several candidates cover legacy surfaces outside Phase A. Scoped coverage is unknown because authority routing, owner distribution, runtime-routing proof and verifier contract are missing. These are formal-proof gaps, **not 27 broken application features**. Independent browser/CDP passes are not relabelled as REA-controlled verifier records. Fresh CDP observations substantiate the bounded execution claim in section 18; they do not close the formal REA ledger or establish a live deployment. Historical HARs contain no SSE lifecycle proof.

Human-reviewed Phase A obligations:

| Obligation | Evidence | Result |
| --- | --- | --- |
| Isolated genuine React mount; legacy fallback usable | Browser, artifact identity | VERIFIED WORKING |
| Manager allowed, Assessor/Vendor denied authoritatively | Browser + backend tests | VERIFIED WORKING |
| Legacy auth/session/expiry/password change retained | Node + browser | VERIFIED WORKING |
| Real overview metrics/totals and revision grouping retained | Browser + captured REA fields | VERIFIED WORKING |
| Loading/empty/error/retry/cancellation handled | Node + browser | VERIFIED WORKING |
| Today's schedule/workload labels reflect returned data | Source + real fixture browser | VERIFIED WORKING |
| Singular stream and cleanup/reconnect maintained | Browser resource assertions | VERIFIED WORKING |
| Development rebuild and isolated production assets run | Browser watcher + production render | VERIFIED WORKING |
| Legacy/data/payment-retirement sources preserved | Hash inventory + regression tests | VERIFIED WORKING |
| Global formal REA reconstruction closure | Partial semantic evidence, missing verifier | NOT TESTED / unknown |

Fresh scratch findings: `/tmp/trackscore-phase-a-reverify-x961r9l1/rea/rea_revalidation_findings.md`, `evidence-reuse-manifest.json`, `artifact-identity-checks.json` and fresh capture comparison evidence. Original static/ledger/coverage evidence remains under `/tmp/trackscore-phase-a-rebuild-a37_wmec/rea`. Temporary evidence may be removed by the OS; bounded conclusions and identifiers are recorded here.

## 23. Known issues

**PARTIALLY WORKING — REA semantic reconstruction only:** resource limits prevented full bundle semantics; formal coverage remains unknown. Application tests and bounded runtime parity passed.

Development updates require browser refresh. Retaining every existing Vite input produces duplicate generated React assets before the isolated build writes the final entry. Overview samples are limited by the current backend; future schedules and unsupported global status counts are not fabricated. These limits do not prevent the requested Phase A overview from working.

No VERIFIED BROKEN Phase A behavior remained in the final test/browser run.

## 24. NOT TESTED items

- Live Netlify deployment, MongoDB Atlas connectivity/permissions, real production credentials or production requests.
- Production mutations, approval/revision/assignment/scheduling/certificate actions, reports/exports and every legacy interactive control in this pass; existing regression tests remain passing.
- Other browser engines, physical devices, screen readers and full accessibility certification.
- Production SSE proxies, every event producer and full application/static reconstruction equivalence.
- REA-owned live CDP reconciliation and authenticated formal verifier closure. Independent Chromium CDP root/bundle/request evidence was obtained, as described in section 18.

## 25. BLOCKED items

No required Phase A implementation or local verification is BLOCKED. REA MCP connection/configuration drift was bypassed with the working CLI. Full static semantic closure is limited by worker memory; formal coverage requires additional verifier bindings. These optional deeper proofs remain partial/unknown as recorded above, rather than blocking the completed local migration.

## 26. Exact final Git status

No staged changes. `git diff --cached --stat` and `git diff --cached --name-only` are empty; the pre-change index inventory is unchanged. Seven tracked files are modified and fifteen individual files are untracked, all already present at the start of this pass. `git status --short`:

```text
 M package.json
 M scripts/run-tests-isolated.mjs
 M server.ts
 M src/App.tsx
 M src/main.tsx
 M src/services/api.ts
 M src/services/auth.ts
?? react_migration_phase_a_report.md
?? scripts/react-manager-browser.mjs
?? scripts/watch-react.mjs
?? src/app/
?? src/components/
?? src/hooks/
?? src/pages/
?? tests/react-foundation.test.js
```

Generated `dist/` and `build/` outputs remain ignored. Nothing was committed, staged or unstaged.

## 27. Recommended Phase B

After separate authorization, migrate only the Manager Assessment Repository and Read-Only Assessment Workspace. Derive their contracts from the existing handlers and preserve filters, immutable versions, comments/documents, SLA and audit/history behavior. Keep action workflows in the legacy portal and maintain the same baseline/regression discipline.

**Stopped after Phase A.** No repository/workspace migration, workflow mutations, or Assessor/Vendor/public UI migration was started.
