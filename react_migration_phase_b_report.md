# TrackScore React migration — Phase B

Date: 12 October 2026, Asia/Kuala_Lumpur. Repository: `/home/hizalhaziq/Coding/trackscorev4`. Starting commit: `1103ae2` (`Rebuild React Phase A manager overview`). Scope: isolated React Manager Assessment Repository and read-only central Assessment Workspace. No Phase C implementation, replacement of the legacy dashboard, or production requests.

**VERIFIED WORKING within isolated local verification:** repository, supported server filters/pagination, selected assessment workspace, technical results, history/stored versions/comparison, SLA/risk and certificate status. Final validation: 261 tests / 37 suites, lint/build, and 66 browser checks pass. Live Netlify/Atlas remains **NOT TESTED**.

## 1. Pre-change Git state

**VERIFIED WORKING.** `git status` showed a clean `main` branch, up to date with `origin/main`. `git diff --stat`, `git diff --cached --stat` and `git diff --cached --name-only` were empty. Zero staged/unstaged/untracked files; no suspicious staged secrets or generated files. No reset, discard, staging, unstaging or commit occurred.

Fresh Git/index and SHA-256 inventories are in `/tmp/trackscore-phase-b-7v89oa0a/{git-before.txt,index-before.txt,diff-before.txt,staged-before.txt,hashes-before.json}`. The starting inventory covers 613 files, including runtime storage and `.env` without copying their contents into browser fixtures.

## 2. Fresh Phase A baseline

**VERIFIED WORKING before implementation.** No Phase A repair was needed, so Phase B proceeded.

| Command | Exact fresh result |
| --- | --- |
| `npm test` | 230 tests, 37 suites, 230 pass, 0 fail/cancelled/skipped/todo; 18561.242494 ms; exit0 |
| `npm run lint` | Both root and strict React TypeScript checks pass; exit0 |
| `npm run build` | Preserved legacy inputs, independent React output and private backend bundle; exit0 |
| Phase A Chromium harness | All30 checks pass; actual React overview, legacy dashboard, auth, payment-compatible presentation, assets and stream lifecycle |

Evidence: scratch `baseline-{test,lint,build,browser}.log`; baseline browser directory `/tmp/trackscore-phase-a-browser-iAnkB8`. Historical migration reports/dependency map were inspected as context; current source and fresh evidence control this phase.

## 3. Phase B obligation/parity map

Created [the parity map](docs/react_phase_b_parity_map.md) before implementation, with each feature's legacy source/handler, endpoint/backend, response/permission contract, visible fields, planned replacement and verification status. Its statuses follow the requested map vocabulary VERIFIED / PARTIAL / MISSING / NOT TESTED / BLOCKED. Core read-only obligations are verified with the declared local evidence; formal REA closure is separate.

| Core obligation | Result |
| --- | --- |
| Repository, supported filters and pagination | VERIFIED WORKING |
| Correct selected-record identity and cancellation | VERIFIED WORKING |
| Overview, company metadata, schedule/assignment | VERIFIED WORKING |
|33 criteria and authorized comments as read-only text | VERIFIED WORKING |
| History, stored immutable version presentation and meaningful comparison | VERIFIED WORKING |
| Backend SLA and current-assessment risk | VERIFIED WORKING |
| Read-only certificate lifecycle/eligibility | VERIFIED WORKING |
| Auth, errors, keyboard/responsive behavior, legacy fallback | VERIFIED WORKING |

## 4. Files created

```text
docs/react_phase_b_parity_map.md
scripts/react-manager-phase-b.mjs
src/app/managerRoutes.ts
src/components/common/AssessmentReadout.tsx
src/pages/manager/AssessmentHistory.tsx
src/pages/manager/AssessmentRepository.tsx
src/pages/manager/AssessmentRisk.tsx
src/pages/manager/AssessmentWorkspace.tsx
src/services/assessmentRisk.ts
src/services/managerAssessments.ts
src/types/legacyEligibility.d.ts
src/types/managerAssessment.ts
src/utils/certificate.ts
src/utils/versionComparison.ts
tests/react-manager-readonly.test.js
react_migration_phase_b_report.md
```

No future-phase placeholders or dependencies were added. Raw captures/fixtures stay outside Git.

## 5. Files modified

| File | Purpose |
| --- | --- |
| `src/app/App.tsx` | Dispatch genuine dashboard/repository/record hash routes beneath existing auth guard |
| `src/app/app.css` | Add matching repository controls, readout grids, tabs, table containment and responsive styles |
| `src/components/layout/ManagerLayout.tsx` | Dashboard/Assessments navigation; main focus; skip link preserves workspace route |
| `src/components/common/RequestState.tsx` | Accurate per-resource loading/stale messaging; default overview behavior preserved |
| `src/utils/format.ts` | Add Malaysia timestamp formatter for audit/version presentation |
| `scripts/react-manager-browser.mjs` | Optional `--phase-b` scenario runner and accurate expected-failure count |
| `netlify/functions/lookup-evaluation.js` | Narrow confirmed local archive compatibility fix for Manager ID reads |

The archive test initially reproduced an empty local lookup for a Manager's archived ID, while Mongo's existing ID query returns it. The local read now uses `getEvaluations(isManager && Boolean(idQuery))`. Non-Manager and unfiltered lookup scope remain unchanged. The targeted test passes; no schema, scoring, version-write, workflow, JWT or SSE-backend behavior was changed.

## 6. React repository architecture

**VERIFIED WORKING.** `AssessmentRepository` owns filters, page and row limit in one local state object. The typed Manager service projects returned list records into an explicit presentation DTO. It uses existing `useApi` cancellation/latest-request guards and the existing singular status-stream refresh hook. Table rows provide one primary Open link.

Loading, retained-data error/Retry, empty store, no matching filters and populated responses are handled. Server totals and sample/page size remain authoritative. Returning from the workspace remounts the repository with default filters/page; persistent browsing state is not implemented.

## 7. Workspace architecture

**VERIFIED WORKING.** `AssessmentWorkspace` is keyed by selected ID and owns its selected section. Sections: Overview, Vendor, Schedule & Assignment, Technical Assessment, History, SLA & Risk, Certificate. They share one React-owned workspace, without legacy modals/controllers.

History/version and risk reads are lazy, scoped to their sections, with independent error/Retry states. Version viewers are keyed by record/version/comparison to prevent retaining the previous snapshot during a switch. Detail refresh and existing live status refresh preserve the selected section. There are no technical scoring editors or workflow-action controls.

## 8. Routing

**VERIFIED WORKING.** The existing static entry remains:

```text
/react/manager.html                  Dashboard
/react/manager.html#/assessments    Repository
/react/manager.html#/assessments/<encoded-id>    Workspace
```

Hash parsing/encoded IDs are tested; unknown or malformed routes provide a real repository exit. These hashes do not require server rewrite changes. The current Express/Vite/Netlify configuration, nine legacy Vite inputs, `/dashboard` shortcut and static publish location are unchanged. `/dashboard.html` remains the workflow fallback.

## 9. APIs used

All new data requests are GETs through the existing Bearer-authenticated API wrapper; both allowed prefixes and existing 401/403/cancellation behavior are preserved.

| Endpoint | Data consumed |
| --- | --- |
| `get-evaluations` | `success,data,total,page,limit,totalPages`; lightweight assessment records with backend SLA |
| `lookup-evaluation?id=…&fullDetails=true` | Manager-only full-detail mode, `success,count,data[]`; empty array becomes a local404 message |
| `get-assessment-history?evaluationId=…` | Actual history entries and current/approved/certified version pointers |
| `get-assessment-version?evaluationId=…&version=…` | Selected snapshot scores,33-criterion breakdown/comments, actor, metadata and approval markers |
| `get-assessment-risk?evaluationId=…` | Current assessment risk state/score, confidence, signals/explanations and benchmark notes |
| Existing `status-stream` | Refresh notifications; one active source with cleanup |

No `/me`, unsupported date parameters, write requests, alternate-prefix retries or certificate action endpoints were added. Legacy lookup projection can send optional fields as null while full-detail mode omits them; parity compares those absent values consistently rather than asserting byte-identical envelopes.

## 10. Filters

**VERIFIED WORKING.** Server-side controls use only inspected query parameters: `q`, `status`, `assessor`, `slaStatus`, `riskLevel`, `includeDeleted`, `queue=certificates`, `sortBy`. Status options group review and revision using supported comma-separated values, and approved uses the backend's historical compatibility grouping.

SLA and quality options match backend values. Sorting supports newest created, latest status change, nearest deadline and oldest deadline. Archive inclusion includes active and archived records; no archive-only query is invented. Certificate queue means approved unfinished certificate work, not a fabricated readiness subtype.

Filter changes and Clear Filters reset page1 atomically. Rapid filters, zero matches and reset behavior are verified. Unlike the legacy current-page search/rating filter, React uses the authoritative backend's broader search. There is no unsupported date-range or rating filter in React; these are explicit migration choices, not claims of literal client-filter equivalence.

## 11. Pagination

**VERIFIED WORKING.** Backend page/limit/total/totalPages drive display and navigation. Row limits10/25/50/100 are supported; Previous/Next disable at bounds and while loading. Browser fixture:42 active records,25+17 rows across two pages, changing limit10 resets to page1 of5. Unit tests verify pagination shape, query bounds and grouped filters.

An external deletion that empties the current final page can leave that page empty until the Manager navigates back or changes filters; automatic page clamping after external data changes is not implemented.

## 12. Status presentation

**VERIFIED WORKING.** Existing presentation-only mapping is reused: submitted/pending_review → Waiting Review; rejected/remediation_required → Changes Requested; historical pre_final_sent/payment_confirmed → Approved. Stored status values are unchanged. Missing fields receive safe “Not recorded” presentation. Payment controls/status/proof/gating do not appear.

## 13. Vendor display

**VERIFIED WORKING.** Displays actual company, contact person/email/phone, office address/state, package and registration reference. Document metadata is limited to name/category/upload date; payment-proof category is omitted.

Explicit DTO construction drops password hashes, tokens, private paths, internal auth metadata, invoices/payment data and nested credential extras before components receive objects. Browser fixtures deliberately contain sentinel secrets and payment proof; the Vendor section does not render them. This is frontend projection over the existing authorized Manager endpoint, not a newly invented Vendor API or changed backend response schema.

## 14. Schedule/assignment display

**VERIFIED WORKING.** Shows returned schedule/assessment dates, time if recorded, assigned assessor/name/ID, assignment presence and SLA deadline. Date-only schedules say “Time not recorded”. The section contains no form inputs, assignment buttons or scheduling mutations.

## 15. Technical read-only enforcement

**VERIFIED WORKING.** Stored Section A/B/total scores, rating, version/rubric, criterion name/section/selected option/points and authorized criterion comments are rendered in text/table elements. Manager review remarks are separate read-only text. Missing data is not replaced with fabricated scores.

All33 fixture criteria are visible; markup-like comments are escaped. DOM assertions and static-render tests find no scoring inputs, textarea, select or scoring-action button. Services expose only reads; browser monitoring sees no scoring/write endpoint requests. Backend scoring and Manager/Assessor separation remain authoritative and unchanged.

## 16. History behavior

**VERIFIED WORKING.** Uses actual returned entries, actors, submission actions/reasons, scores, timestamps and approved/certified markers. Lifecycle events come from the returned full record; retired workflow entries are filtered. Malaysia timestamps include date/time where recorded.

The table follows API order, typically latest version first, whereas legacy reverses that list. Both retain all returned entries. The UI explicitly notes that the backend can synthesize a baseline for legacy records lacking snapshots; frontend history is not fabricated.

## 17. Version behavior

**VERIFIED WORKING for stored-version fixtures.** Managers choose returned versions and read snapshot scores/criteria/comments, actor/action/revision reason, company/device/assessment/rubric metadata, and approval/certification information.404 is scoped to the viewer without losing the assessment. Snapshot projection does not mutate raw stored objects; there is no write service.

Meaningful comparison is implemented because legacy has an understood two-version read contract. It compares total score, option, points and comments per criterion, indicating Changed/Unchanged and additions/removals. ID alignment intentionally improves on legacy index alignment. Generic raw JSON diff, exports and legacy change-only toggle are not migrated. Historical v1 synthetic fallback remains a backend compatibility behavior, not proof that an immutable stored snapshot exists for every legacy record.

## 18. SLA behavior

**VERIFIED WORKING.** Displays backend status/start/deadline/duration/remaining/overdue strings. No React SLA formula or deadline mutation exists. Backend SLA sorting/filtering and the fixture's overdue record are verified. Countdown text is a read-time backend snapshot, updated by refresh rather than a new client calculation.

## 19. Risk behavior

**VERIFIED WORKING for current-assessment data.** A separate Manager-only service/DTO loads risk lazily, displays returned state/score/confidence/version/generated date, signals and explanation/benchmark text, and retains assessment context on risk failure. Vendor and out-of-scope Assessor denial are verified server-side; React services reject all non-Managers before issuing reads.

No risk formula or recalculate/refresh flag was added. The existing GET may persist a calculated backend cache on miss; that inherited side effect is acknowledged and tests use only isolated storage. Historical-version risk calculation is not claimed: backend cache-version selection does not guarantee fresh analysis of a historical snapshot.

## 20. Certificate status behavior

**VERIFIED WORKING.** Reuses the existing pure backend certificate-eligibility helper and recorded lifecycle dates. Displays Not Eligible, Ready for Certificate, Prepared, Printed, Signed, Delivered or Completed as applicable, with certificate number/version/date metadata. Unit tests cover each stage, approval-version requirement and archived eligibility.

No preparation/print/sign/delivery/PDF controls or payment gate were added. Actual completed/delivered history is preserved as read-only context; certificate mutations remain in the legacy workflow.

## 21. Race/cancellation behavior

**VERIFIED WORKING.** Existing AbortController/sequence guards prevent stale filter requests from updating the newest query. A selected-record key remounts the workspace, cancelling old detail/section requests; version/comparison keys similarly isolate snapshots.

Browser tests delay Assessment A, open B, then release A: B remains visible. Rapid filter and version switching have the same result. Parser identity checks also reject unexpected assessment/version responses. Resource cleanup preserves one active EventSource under StrictMode and after navigation/refresh.

## 22. Tests added

31 new Node tests in `tests/react-manager-readonly.test.js`: list/page parsing and query parameters; empty/malformed responses; safe DTOs and missing fields; selected-ID validation/404; Manager-only service access; history/version identities/immutability; risk parser/permissions/no recalculate; eligibility/lifecycle; escaped text-only technical rendering; criterion comparison; static hash routes;401/403/404/server error; abort behavior; actual grouped/paginated backend list, archived lookup and stored history/version/RBAC.

36 Phase B Chromium checks supplement the original30: navigation, filters/clear/paging, empty/loading/error/Retry, archive reads,33 criteria, company confidentiality, read-only schedule/technical/certificate, history/version comparison, delayed record/filter/version races, risk recovery,404/403/401, roles, five sizes, keyboard tabs/skip/focus, stream lifecycle, GET-only reads, actual legacy/React response captures and eight-page legacy rendering.

Run after building with externally installed Playwright Core:

```sh
TRACKSCORE_PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs node scripts/react-manager-browser.mjs --phase-b
```

`TRACKSCORE_BROWSER_EXECUTABLE` can select an installed browser. No application dependency was added for testing.

## 23. Exact npm test result

**VERIFIED WORKING — exit0.** Final `npm test`:

```text
1..115
# tests 261
# suites 37
# pass 261
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16222.124323
```

Evidence: `/tmp/trackscore-phase-b-7v89oa0a/final-test.log`. Original230 tests remain passing.

## 24. Exact lint result

**VERIFIED WORKING — exit0.** `npm run lint` runs `tsc --noEmit && tsc --noEmit -p tsconfig.react.json`; no diagnostics. `git diff --check` and browser-script syntax checks pass. Evidence: scratch `final-lint.log`.

## 25. Exact build result

**VERIFIED WORKING — exit0.** Preserved nine-input legacy Vite build:1.21s; independent React build:867ms/56 modules; esbuild:11ms. Existing publishing/backend separation remains intact.

```text
dist/react/manager.html                    0.59kB / gzip0.34kB
dist/react/assets/manager-DBUDBIEc.css      9.28kB / gzip2.59kB
dist/react/assets/manager-Nv6pNK7t.js     269.76kB / gzip81.87kB
build/server.cjs                        376.4kb
build/server.cjs.map                    690.6kb
```

```text
HTML 650b4f2e5e4d525f1df2e3c65c49d60243dd4d6d6bfe50976e19a27f80ea82f2
CSS  5ec5c3e081804e326c007a13a587e4907f3a2ce7fa66a17d2ad877ca1710d22a
JS   ab7db908dbdafa14d3b7b89c3cd8f6b55132d9c4f617188149092622a5c3cbc9
```

Evidence: scratch `final-build.log` and final browser `react-mount-proof.json`; production served bundle hash equals current generated output. Retaining the pre-existing React input in the legacy build still emits duplicate generated root assets before the independent build writes the final isolated entry.

## 26. Browser verification result

**VERIFIED WORKING —66/66 checks, exit0.** `/tmp/trackscore-phase-a-browser-tl3nd3/results.json`; scratch `browser.log`. Zero unexpected console/page errors and zero unexpected HTTP failures. Nine intentional error cases produced nine expected console resource errors/HTTP statuses; the cases cover overview/repository/risk failures, ordinary403,401 and missing-version404.

Development uses actual local backend handlers and temporary fixture storage. Production static routes/assets and the actual built Dashboard React module are verified; the production overview response is explicitly mocked with the real summarizer, because production local JSON fallback is disabled. Production repository/workspace end-to-end Atlas calls are NOT TESTED. All core Phase B browser interactions exercise the real development handlers.

## 27. Authorization/security checks

**VERIFIED WORKING within tested scopes.** Manager login/session works; Assessor/Vendor are denied on repository and workspace routes, with no active React stream. Expired sessions and401 return to existing login and clean resources. Ordinary403 retains a valid Manager. Forced password behavior remains covered by the original Phase A harness.

API roles are unchanged: Assessors legitimately retain their own scoped repository/detail/history/version/risk access; Vendor history/version ownership remains supported by existing handlers, while Vendor risk is denied. React Manager guards are UX and frontend service scoping, not replacement backend authorization. JWT design, immutable writes, rubric scoring, upload security and Vendor authorization were not moved to React.

## 28. Responsive result

**VERIFIED WORKING in Chromium viewport emulation.** Repository and workspace tested at1920×1080,1366×768,1280×800,768×1024,390×844. No page-level horizontal overflow; tables scroll within their sections. Open links are reachable, filter controls usable, tabs wrap, and long company names/comments remain contained. Ten new Phase B screenshots plus original overview/state screenshots are retained in the final browser directory.

The initial loading and failure/retry flows are exercised at desktop; original shared RequestState styling is additionally checked at all five sizes by Phase A. Physical devices and non-Chromium engines are NOT TESTED.

## 29. Accessibility result

**VERIFIED WORKING for targeted interactions.** Labelled filters/row limits/version controls; descriptive Open link labels; table captions/headers; one main heading; visible focus; loading status and error alert announcements. Workspace tabs use tablist/tab/tabpanel semantics, selected/controlled IDs and roving focus with arrows/Home/End. Skip link focuses main without changing the selected-record route. No keyboard trap or editable scoring control was observed.

Screen-reader testing, a full WCAG/contrast audit and every browser accessibility tree are NOT TESTED.

## 30. Legacy regression result

**VERIFIED WORKING — smoke scope.** Actual rendering checks for landing, login, Manager dashboard/repository, Assessor page, Vendor portal, request-assessment, certificate verification and change-password pass without unexpected errors. Legacy controllers also drive the final parity captures. Root/public mirrored copies remain byte-identical; no legacy frontend file was changed/deleted.

Of613 pre-existing hashed files,606 retain their initial bytes. The seven changes are exactly the authorized files in section5. `.env`, all runtime `.data`, legacy HTML/CSS/JS, certificate/report engines, mutation handlers, risk/SLA/rubric, authentication/session handlers and SSE backend remain unchanged. Lookup's tested local archive read is the sole backend compatibility change. The Git index is unchanged and no production data was contacted or damaged.

## 31. REA parity result

Used the [reverse-engineer-anything skill](/home/hizalhaziq/.agents/skills/reverse-engineer-anything/SKILL.md) and working pinned REA6.4.0 CLI. No native tools, configuration/setup writes or captured-URL fetching. No REA MCP tools are connected; the CLI supplies bounded artifact/capture analysis.

Bounded static evidence covers17 exact inert handler slices extracted from the published legacy dashboard with parse5/Babel offsets and original SHA provenance. All17 parse with zero failures; selected-input graph is complete, but semantic coverage retains1,542 conservative globals/DOM/dynamic unknowns. Application Evidence: `ev_a5cf678a836a99615555ef8b0f8c1e5c1bd72c164978788ae4a277d2f4532889`. Ten focused feature traces are retained in scratch `rea/trace-summary.json` and `phase-b-static-feature-ledger.json`. Static inspection is not execution proof.

Final actual UI/controller captures: `/tmp/trackscore-phase-a-browser-tl3nd3/phase-b-legacy.har` and `phase-b-react.har`. Browser assertions and fresh REA inspection compare list IDs/order and total42, detail identity/status/score/version/33 criteria/certificate context, and history/version/risk payloads. Both return stored versions2/1, snapshotv1's33 criteria, and cached current-version2 risk REVIEW. SLA timing fields are time-dependent and excluded from byte-equivalence claims. Optional absent/null detail fields are equivalent missing data; full-detail mode intentionally adds company/schedule metadata. Independent browser root/Fiber/module/initiator/hash evidence also confirms React ownership, without a legacy DOM controller in the React pages.

Fresh REA capture Evidence:

```text
Legacy ev_de2309e5e347a39a61baab4daa6b3448ef843f470fde123c4591cc5a714152af
React  ev_3fad521a06ee0e170a69f48f23e316bb500893882b813f70ab3e114b3ab8e686
Ledger ev_a919ff703f877523704fb2b6d605a4f811716b5ceaccfc6b15a8da3c9116a114
```

The nine-record legacy/five-record React HARs have matched complete GET/200 bodies at original ordinals3/0 (list),4/1 (detail),6/2 (history),7/3 (version),8/4 (risk). Request credential headers are excluded by REA; no captured URL was fetched. Raw test captures remain outside Git with temporary fixture credentials only.

Formal REA reconstruction closure is not claimed. The actual reconstruction ledger is complete within declared inputs but remains unknown:66 obligations,61 generated/unowned candidates and five reviewed core contracts without machine-bound verifier authority; zero formally verified. This66 count is unrelated to the66 passing browser checks and does not mean66 application failures. Scoped coverage returns unknown for five surfaces/five claims with16 reasons involving authority/owner distribution, verifier contracts and runtime-routing package proof; it has linked Evidence IDs rather than a standalone fabricated ID. The reviewed human parity map and independent browser assertions verify local core behavior without relabelling it as a REA-owned verifier pass. Fresh findings are retained under `/tmp/trackscore-phase-b-7v89oa0a/rea`.

## 32. Remaining PARTIAL items

**PARTIALLY WORKING — formal REA reconstruction only.** Static URL/global resolution and machine-bound reconstruction closure remain incomplete. This is not evidence of broken read-only workspace features.

Known bounded behavior: repository filters/page reset on return; external deletion does not auto-clamp an empty last page; backend history/version can return synthetic v1 for unsnapshotted legacy data. Global search follows the backend rather than legacy page-only search; comparisons align stored IDs rather than legacy array indices. These differences are explicit, not hidden parity claims. No VERIFIED BROKEN core Phase B behavior remains.

## 33. Remaining NOT TESTED

- Live Netlify/Atlas, production repository/workspace API calls and real production credentials.
- Physical devices, other browser engines, screen readers/full accessibility certification.
- Historical-version fresh risk computation, complete static semantics, global application equivalence and REA-owned authenticated runtime verification.
- Production mutations and every legacy action; approval, revisions, assignment/scheduling, exports/reports, staff management and certificate actions are intentionally NOT MIGRATED.

## 34. BLOCKED items

No required Phase B implementation/local check is BLOCKED. Optional formal REA closure remains partial/unknown for the documented evidence-authority limits; core read-only behavior is independently verified. Live deployment and later phases were not attempted.

## 35. Exact final Git status

Seven modified tracked files and sixteen new untracked files; no staged files. `git diff --cached --stat`/`--name-only` are empty and the initial index remains unchanged.

```text
 M netlify/functions/lookup-evaluation.js
 M scripts/react-manager-browser.mjs
 M src/app/App.tsx
 M src/app/app.css
 M src/components/common/RequestState.tsx
 M src/components/layout/ManagerLayout.tsx
 M src/utils/format.ts
?? docs/react_phase_b_parity_map.md
?? react_migration_phase_b_report.md
?? scripts/react-manager-phase-b.mjs
?? src/app/managerRoutes.ts
?? src/components/common/AssessmentReadout.tsx
?? src/pages/manager/AssessmentHistory.tsx
?? src/pages/manager/AssessmentRepository.tsx
?? src/pages/manager/AssessmentRisk.tsx
?? src/pages/manager/AssessmentWorkspace.tsx
?? src/services/assessmentRisk.ts
?? src/services/managerAssessments.ts
?? src/types/legacyEligibility.d.ts
?? src/types/managerAssessment.ts
?? src/utils/certificate.ts
?? src/utils/versionComparison.ts
?? tests/react-manager-readonly.test.js
```

Generated outputs remain ignored. Nothing was committed or staged.

## 36. Recommended Phase C

After separate authorization, migrate Manager review, request changes, approval, scheduling and assignment/reassignment using existing backend workflows and permissions. Preserve immutable technical versions, review/scoring separation and the legacy fallback. Certificate action mutations belong to a later phase.

**Stopped after Phase B.** Phase C and certificate mutations were not started.
