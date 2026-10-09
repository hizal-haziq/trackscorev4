# TrackScore React migration — inspection, baseline and plan

Date: **9 October 2026**, Asia/Kuala_Lumpur.

Scope: the requested **first task only**: inspect, establish a testing baseline, and propose incremental migration. No frontend implementation, backend business logic, existing route, database model, environment file, or legacy asset was changed during this inspection. The two new files are this report and [the dependency map](docs/react_migration_dependency_map.json). No commit or staging operation was performed.

## 1. Current architecture map

```mermaid
flowchart TD
    Root[Root HTML templates: eight pages] --> Vite[Vite multi-page production build]
    Public[public/: HTML and shared static assets] --> Dev[Express development serving]
    Public --> Vite
    Vite --> Dist[dist/: published frontend]
    Dist --> Prod[Express production HTML / Netlify static hosting]
    Public --> Assets[Express static assets: public precedes dist]
    Dev --> Browser[Vanilla HTML / CSS / JavaScript browser application]
    Prod --> Browser
    Assets --> Browser
    Browser --> API[/.netlify/functions/* and /api/*]
    API --> Handlers[Existing Netlify handlers; Express request bridge]
    Handlers --> Auth[JWT / bcrypt / role and ownership checks]
    Handlers --> DB[db.js: MongoDB adapter / development JSON fallback]
    DB --> Stores[evaluations / users / vendors / inquiries / assessment_versions / assessment_risk]
    Handlers --> Files[Private .uploads document files]
    Handlers --> Events[status-bus / status-stream]
    Events --> Browser
    Dormant[src/main.tsx and empty src/App.tsx: not mounted]
```

- `npm run dev` runs **`tsx server.ts`**, not the Vite development server. Express owns current development routing and APIs.
- `npm run build` runs Vite on eight root HTML inputs, then bundles the Node server into **`build/server.cjs`**. `npm start` runs that private server bundle.
- `vite.config.ts` enables React and Tailwind plugins, but its active inputs are the existing vanilla pages. Plugin installation does not make those pages React applications.
- Express imports the existing function handlers and bridges requests into their Netlify event/response format. It also implements a persistent, scoped SSE connection separately from the serverless `status-stream.js` response.
- `netlify.toml` publishes **`dist/`**, deploys `netlify/functions/`, rewrites `/api/*`, defines `/dashboard`, and has an `/index.html` catch-all. No deployed Netlify site was contacted in this inspection.
- Database names, schemas, status transitions, rubric calculations, version creation, certificate gates, upload protections, and role permissions remain backend responsibilities.

## 2. Active frontend entry points

These HTML pages are active. Their role guards and interactions run in classic scripts, primarily manipulating the DOM directly.

| Page | Current runtime role | JavaScript owner |
|---|---|---|
| `landing.html` | Public information, navigation and drawers | Inline script |
| `login.html` | Unified Manager / Assessor / Vendor login | Inline script; `login` endpoint |
| `change-password.html` | Password change, including forced first change | Inline script |
| `request-assessment.html` | Public inquiry form | Inline script |
| `verify-certificate.html` | Public certificate lookup | Inline script |
| `index.html` | Assessor form, drafts, own work, peer review and alerts; Manager audit-view behavior also exists | `app.js`, `peer-comments.js`, inline initialization |
| `dashboard.html` | Manager overview, repository, review, intake, assignments, workload, accounts, history, risk, certificates and exports | Large inline controller, `manager-overview.js`, `peer-comments.js`, `certificate-pdf.js` |
| `vendor-portal.html` | Owned assessments, required actions, documents, profile, password and certificates | Inline controller and `certificate-pdf.js` |

**Express routing inspected:** `/` serves `landing.html`; `/index.html`, `/evaluation`, `/eval`, `/assessor` and Assessor aliases serve `index.html`. `/dashboard` and `/dashboard.html` serve the Manager page. Login, inquiry, Vendor, password and verification pages have explicit aliases. Development HTML comes from `public/`; explicit production HTML routes come from `dist/`.

**Production asset precedence:** Express serves `public/` static assets before `dist/`. This is a migration constraint: a copied, unbuilt React entry in `public/` could shadow a built entry unless routing is deliberate.

**Netlify distinction:** the published root contains `dist/index.html`, the Assessor page. Its configured root/catch-all therefore differs from Express's public landing route. This is a source/configuration finding, not verification of a live deployment. Preserve existing routes; test any additive React path on both hosting modes.

## 3. Existing React status

**React frontend: NOT ACTIVE.**

- `src/App.tsx` returns an empty `<div>`.
- `src/main.tsx` would mount that component under `StrictMode`, but no active HTML page supplies `#root` or references this entry.
- `src/index.css` contains only a Tailwind import and is reachable through the dormant React entry, not the current page graph.
- There are no existing React pages, shared components, services, hooks, routing layer, or domain type directories under `src/`.
- Source search, the fresh production build, and an eight-page browser smoke confirmed no active React entry request or React root.
- Installed React and React DOM are **19.3.0**. `@types/react` and `@types/react-dom` are absent. Add compatible type declarations when implementation begins; a passing current typecheck does not demonstrate a typed React architecture.

## 4. Root / public duplication map

All **18** matching frontend files are currently byte-identical:

| Category | Mirrored files |
|---|---|
| HTML | `index.html`, `dashboard.html`, `vendor-portal.html`, `landing.html`, `login.html`, `change-password.html`, `request-assessment.html`, `verify-certificate.html` |
| JavaScript | `app.js`, `manager-overview.js`, `peer-comments.js`, `summary-worker.js`, `certificate-pdf.js` |
| CSS | `style.css`, `manager-overview.css` |
| SVG | `TrackScore_Logo.svg`, `TrackScore_TS_Icon.svg`, `miros-logo.svg` |

Root HTML files are Vite build inputs. Public copies serve Express development and provide static assets copied into the build. Production Express can still read public static assets. **Neither copy is disposable yet.** There is no equivalent React implementation of these pages under `src/`.

Maintain parity for any legacy file changed in later phases. Keep new React modules under `src/` and give the new React entry an independent build path; do not create duplicate TSX files in `public/`.

## 5. Frontend → API → storage → response → UI map

[The machine-readable dependency map](docs/react_migration_dependency_map.json) covers **493 canonical control definitions**, **30 directly referenced frontend endpoints**, source handler references, form associations, Express aliases, backend implementation paths, storage dependencies, response shapes and UI updates. It combines the existing control inventory with fresh source/AST inspection. It is a static dependency map, not proof that every individual control was exercised today.

Endpoint names below use the current `/.netlify/functions/` prefix; matching `/api/` aliases were found in Express. Preserve both prefixes. `manage-certificate.js` delegates to `issue-certificate.js`.

| Control / handler | API | Backend storage / response | Current UI update |
|---|---|---|---|
| Login form submit listener | POST `login` | Users/Vendors; bcrypt; JWT, role, user and password-change state | Store session keys; redirect to the appropriate portal or password page |
| Password form submit listener | POST `change-password` | User/Vendor password hash; updated session fields where returned | Replace session and apply current navigation behavior |
| Overview refresh / `load()` in `manager-overview.js` | GET `get-evaluations?view=overview` | Evaluations + users + SLA/certificate/workload helpers; `{success, overview}` | Render metrics, attention, recent records, schedule and workload |
| Repository filters / `fetchEvaluations` | GET `get-evaluations` | Evaluations; `data`, `count`, `total`, `page`, `limit`, `totalPages`, SLA/risk summaries | Replace current filtered/paginated rows and counters |
| Details, correction, reports / `openEvaluationDetails`, `loadEvaluationForCorrection`, report handlers | GET `lookup-evaluation` | Protected evaluation data array; assignment/peer access depends on caller/flags | Open selected record, restore correction form, render report/discussion |
| Public inquiry submit | POST `submit-inquiry` | Inquiries; validation, honeypot and rate limit | Confirmation or recoverable validation/error state |
| Inquiry queue, convert/dismiss / `fetchInquiries`, conversion handlers | GET/POST `manage-inquiries` | Inquiries; conversion creates registration in evaluations | Refresh queue, registrations and counts |
| Registration / `handleRegisterCustomer` | POST `register-customer` | Evaluation registration and current package/invoice stub | Close form and refresh lists |
| Vendor credentials / credential handlers | POST `vendor-invite` | Vendor account, bcrypt hash and authoritative linked record IDs | Show/download existing credential formats |
| Scheduling / `handleScheduleAssessment` | POST `schedule-assessment` | Evaluation scheduling/assignment/SLA metadata; status event | Refresh records and workload |
| Assignment / `handleAssignTask` | POST `assign-assessor` | Users lookup; evaluation assignment/SLA; status event | Refresh work and workload |
| Staff management / create/reset/delete handlers | GET/POST `manage-users` | Users/Vendors; action-specific responses | Staff list, credential result, reset/delete confirmation |
| Retained invoice administration / `handleSaveInvoice` | POST `manage-invoice` | Existing evaluation invoice/package metadata | Refresh registration; **no payment verification or certificate gate** |
| Assessor submit / `saveEvaluationToDatabase` | POST `save-evaluation` | Server rubric; evaluations and immutable versions; ID/version/verified scores | Submission result, own-work refresh, draft/registration linkage |
| Review confirmations / `executeConfirmedApproval`, `executeRejection` | POST `approve-evaluation` | Review notes, lifecycle/history, approved version and SLA | Refresh details, queues and certificate readiness |
| Administrative edit / `handleSaveEdit` | PUT `update-evaluation` | Metadata/history; scoring and immutable-stage guards | Close edit form, refresh selected record/list |
| Archive confirmation | DELETE `delete-evaluation` | Soft delete; missing-record 404 | Refresh repository with current archive filter |
| Workload / workload handlers | GET `get-assessor-workload` | Users + evaluations; computed summary and assessor workloads | Cards, table and detail views |
| Version history / detail / comparison handlers | GET `get-assessment-history`, `get-assessment-version` | Evaluation/version storage; `history` list or protected `version` object | Immutable timeline, snapshot and comparison |
| Quality Check / `openRiskDetailsModal` | GET `get-assessment-risk` | Evaluations and risk storage; Manager-only recalculation | Protected risk details |
| Peer/Manager discussion / `PeerComments` handlers | POST `add-comment` | Evaluation comments and role/ownership checks | Refresh discussion; retain technical comments separately |
| Alerts / notification loaders | GET `get-notifications` | Role-scoped evaluation state and recent event bus; notifications/live events | Feed, banners and unread indicators |
| Status connection handlers | GET `status-stream` | Scoped SSE, **not JSON**; Express live emitter/serverless replay | Batched refresh/toast; connection/timer cleanup |
| Certificate stages / `handleCertificateSubmit` | POST `manage-certificate` | Approved/certified versions, evaluation certificate and history | Prepare → print → sign → deliver state and confirmations |
| Manager export / `exportFilteredCsv` | GET `export-evaluations` | Protected filtered **Excel attachment**, despite CSV-named frontend function | Blob download as `.xlsx` |
| Vendor loading / `loadVendorData` | GET `vendor-portal-data` | Authoritative linked IDs and minimized Vendor DTO | Owned progress, required actions and certificate access |
| Vendor document handlers | GET/POST `vendor-documents` | Evaluation document metadata and private `.uploads`; JSON or binary download | Upload/list/delete refresh and authenticated Blob download |
| Vendor profile/password handlers | GET/POST `vendor-profile` | Vendor profile/hash; action-specific JSON | Profile refresh and current password behavior |
| Vendor revision / resubmit handler | POST `vendor-resubmit` | New version copies existing scores/breakdown; increments current version and moves record to `submitted` | Refresh owned required actions and status |
| Public verification submit | GET `verify-certificate` | Public minimized projection backed by certified version; `valid` boolean | Valid/invalid certificate result |

Other existing routes: `packages`, `config`, alternate `vendor-login`, and certificate aliases. No direct active caller of `packages` or `vendor-login` was found in the inspected page/script graph. Keep them until caller/deployment compatibility is proved. `verify-payment`, `vendor-submit-payment`, and `send-pre-final` are deliberately retired routes and must stay retired.

### Contracts the new API/auth layer must preserve

- Default to the existing same-origin Netlify-function prefix; support a configured `/api/` prefix without renaming endpoints. Do not automatically retry writes on another prefix.
- Read/write the established `trackscore_token`, `trackscore_user_role`, and `trackscore_user` keys. Preserve Manager session state, logout and forced-password-change navigation. There is no existing `/me` endpoint to invent.
- Login role comes from the authenticated backend response. Frontend guards are UX; backend permissions and ownership remain authoritative.
- Distinguish expired/invalid-auth **401**, ordinary forbidden **403**, and password-change-required behavior. Do not log out every valid session on every 403.
- Validate response shapes by endpoint: list `data`, overview `overview`, history `history`, version `version`, Vendor `evaluations`, public verification `valid`, exports/documents as binary, and SSE as a stream. A generic `{success,data}` assumption would break several callers.
- Preserve AbortController and stale-response protection. Uploads currently use **JSON/base64**, not a new multipart contract. Binary responses must remain Blob downloads.
- EventSource query-token handling is restricted to the existing SSE endpoint; normal API calls retain Bearer headers. Redact tokens from diagnostics.

## 6. High-risk migration areas and existing risks

1. **DOM ownership and global coupling.** `dashboard.html` is 9,017 lines / 518,186 bytes; `app.js` is 5,388 lines / 237,904 bytes. `manager-overview.js` wraps `fetchEvaluations` and `switchDashboardTab`, re-parents existing statistics, and calls global modal/workload functions. Loading it alongside a React-owned replacement would create competing owners.
2. **Development activation.** Express deliberately blocks `/src/*`. Adding a module script alone will not activate React under `npm run dev`. A safe, scoped frontend integration must precede migration; private backend/storage paths must remain inaccessible.
3. **Build/hosting divergence.** Root inputs, public copies, production static precedence, Netlify catch-all behavior and React asset URLs need explicit integration tests. Do not switch the existing Vite base globally and change legacy asset URLs accidentally.
4. **Auth and identity.** Legacy session keys, forced password changes, Assessor codes versus account IDs, Vendor linked IDs and cross-tab/logout behavior must remain compatible. Keep JWT secrets and signing logic on the server.
5. **Scoring, drafts and immutable versions.** Preserve all 33 criteria, criterion comments, server recomputation, browser draft formats (`trackscore-drafts`, legacy `trackscore-draft`), active-draft behavior and submission locks. Do not perform a status/data migration while extracting UI code.
6. **Revision semantics require care.** Current `vendor-resubmit` also creates a version, copying existing technical values rather than allowing Vendor score edits. Do not assume only Assessor submission creates versions, or change this behavior during framework migration.
7. **Lifecycle actions.** Display `rejected` as Changes Requested. Map historical `pre_final_sent` / `payment_confirmed` to the existing approved interpretation, while preserving approved-version/certificate eligibility checks. A display label is not permission to transition state.
8. **SSE and effects.** Preserve role scoping, burst batching, polling fallback, cancellation and teardown. React StrictMode must not create duplicate active connections, listeners, timers or mutations. The Express and Netlify stream implementations differ.
9. **PDF/print geometry.** `certificate-pdf.js` is a proven shared window helper. Reports use html2pdf/html2canvas/jsPDF and existing print CSS. React DOM nesting, portals, fonts and width constraints can change captures; reuse the engine and verify actual downloaded/rendered PDFs, including QR decoding.
10. **Documents and confidentiality.** Keep upload MIME/base64/size/name/path rules, accepted-document protection, authenticated downloads and Vendor minimization. Do not reuse a Manager DTO as a Vendor DTO.
11. **Worker lifecycle.** `peer-comments.js` loads `summary-worker.js` on demand, imports the browser model library remotely and terminates workers after completion/timeout. Preserve that boundary; do not start model loading as a general React page effect.
12. **Coverage is incomplete.** Existing control evidence records 447 working, 16 partial, 28 not tested and 2 external-delivery blocked definitions. Some working statuses retain earlier evidence. This inspection did not re-certify all 493 controls.
13. **Documentation drift.** README still describes shared API keys and unconditional fallback; current source uses JWT and disables JSON fallback in production. The stabilization report also contains historical counts/paths. Fresh results and implementation source take precedence.
14. **Existing staged changes.** Git had **580 staged entries** before inspection, including runtime data, generated PDFs/browser artifacts and QA credential files. They are pre-existing changes, left untouched. Review that staged set before any future migration commit; do not include those artifacts or secrets in migration commits.

## 7. Recommended migration order and phase gates

| Stage | Scope | Required gate before the next stage |
|---|---|---|
| Inspection / safety baseline — this task | Architecture, dependencies, parity, fresh commands and read-only browser smoke | Present this plan and stop; no major migration yet |
| Foundation | Typed API/auth, legacy session compatibility, independent React entry/build/dev integration and basic layout | Same-origin assets work under Express and Netlify configuration; private paths stay blocked; role/password/logout/API error checks pass |
| Manager overview | Metrics, attention/recent/schedule/workload, filters and meaningful loading/empty/error states using `get-evaluations?view=overview` | Compare real empty/populated DTOs and current dashboard; test refresh, abort/stale responses, keyboard/mobile and one active SSE connection |
| Manager repository + record workspace | Existing server filters/pagination and one React-owned selected-record workspace | Correct record IDs; roles/states, technical read-only behavior, history/risk and metadata guards verified |
| Manager review + scheduling/assignment | Existing approve/request-changes APIs and administrative forms | v1 → request changes → Assessor v2 → approval; assignment ownership, confirmation/cancel and duplicate-submit checks pass |
| Manager certificates, reports, accounts and notifications | Existing certificate/PDF/export engines and management APIs | Prepare/print/sign/deliver; approved/certified versions; Manager/Vendor downloads; real PDF renders, QR and Excel bytes; staff/notification checks pass |
| Assessor | My Work, corrections, submitted work, 33-criterion form, drafts and peer reviews | All 33 comments persist through reload/revision; scoring/version locks, assignment/peer privacy and draft compatibility pass |
| Vendor | Owned assessments, required actions, documents, certificates, profile/password | Cross-Vendor denial, minimized data, accepted document restrictions, revision versioning, downloads and password behavior pass |
| Public/authentication pages | Landing, login, inquiry and verification, after authenticated UI gates pass | Public forms, role login, forced password changes, rate limit/honeypot and verification regression pass; retain static pages when adequate |
| Legacy cleanup | Remove only proven unused code | React replacement verified, full workflow/browser/build checks pass, no remaining runtime references, rollback reviewed |

The current vanilla pages remain the default during early stages. Start a new React-owned Manager screen at the proposed **`/react/manager.html`** path. Keep existing workflows reachable through their actual routes. Do not claim unsupported record/queue deep links work. Migrate mutation actions only when their React workspace/confirmation handlers exist and are tested. Do not run `app.js` or `manager-overview.js` against React-owned DOM.

Use built-in React state/context/hooks first. The API layer, auth context and selected-record/page state are sufficient to start; no Redux, new auth provider, Next.js, payment, database schema or UI-library replacement is proposed. Extract common components when they are actually reused.

## 8. Exact files proposed for the first implementation stage

These are **proposals, not implemented files**. The user's numbered Phase 1 is the safety baseline; this report supplies that documentation. The following bounded implementation stage prepares the foundation and then the first Manager overview, rather than scaffolding every target page.

| Existing file proposed to change | Intended change |
|---|---|
| `package.json`, `package-lock.json` | React-compatible type declarations; separate React build/typecheck commands integrated with existing build |
| `server.ts` | Development-only, same-origin Vite integration limited to the React entry/frontend modules; preserve all API/business/security handlers |
| `src/main.tsx` | Mount the new app and scoped styles; retain StrictMode and effect cleanup |
| `src/App.tsx` | Compatibility re-export to the new app after import graph verification |
| `scripts/run-tests-isolated.mjs` | Copy new frontend service/type/utility modules into the isolated test workspace; verify TypeScript test loading using the installed tooling, without touching real data |

| New file proposed | Purpose |
|---|---|
| `react/manager.html` | Independent React HTML entry with `#root`; keep it outside legacy `public/` copies |
| `vite.react.config.ts` | Independent frontend build producing `dist/react/manager.html` and its assets; retain the legacy Vite config/base |
| `tsconfig.react.json`, `src/vite-env.d.ts` | Scoped frontend type checking and Vite client declarations; do not tighten every legacy JS file at once |
| `src/app/App.tsx`, `src/app/routes.tsx`, `src/app/AuthProvider.tsx`, `src/app/app.css` | App composition, explicit route definitions, shared auth context and scoped CSS |
| `src/services/api.ts`, `src/services/auth.ts`, `src/services/assessments.ts` | Typed request/binary/error handling, session compatibility and actual assessment/overview endpoints |
| `src/hooks/useAuth.ts`, `src/hooks/useApi.ts`, `src/hooks/useStatusStream.ts` | Auth consumption, request cancellation/state and scoped connection lifecycle |
| `src/types/api.ts`, `src/types/auth.ts`, `src/types/assessment.ts`, `src/types/manager.ts` | Types based on inspected responses; separate overview and assessment shapes |
| `src/utils/status.ts`, `src/utils/format.ts` | Display-only status compatibility and safe date/number formatting |
| `src/components/layout/ManagerLayout.tsx` | Initial Manager layout; expand task-focused navigation as working features migrate |
| `src/components/common/RequestState.tsx`, `src/components/common/StatusBadge.tsx` | Shared request states and status display where reused |
| `src/pages/manager/ManagerDashboard.tsx` | First actual migrated feature, using the existing overview API |
| `tests/react-api-auth.test.js`, `tests/react-status.test.js` | Meaningful API/auth/status contract and failure tests, integrated with the existing isolated runner |
| `scripts/react-manager-browser.mjs` | Isolated browser regression for the new route; test output/credentials/databases stay in temporary storage |

No existing `dashboard.html`, `app.js`, Vendor/Assessor page or Netlify function is proposed for deletion. No change to `netlify.toml` is planned initially: publish `dist/`, use an existing physical `/react/manager.html` file, and retain existing rewrites. Validate live/static hosting behavior before adding optional aliases. Confirm Vite development module/HMR paths and filesystem access restrictions during implementation; this integration is **NOT TESTED** today.

## 9. Fresh testing baseline and limits

Environment: Ubuntu, Node **v22.22.1**, npm **9.2.0**, Vite **6.4.3**, TypeScript **5.8.3**, esbuild **0.25.12**. Runtime browser smoke used the installed Chromium build through temporary Playwright tooling.

| Check | Result label | Fresh result |
|---|---|---|
| `npm test` | VERIFIED WORKING | **201 passed, 37 suites, 0 failed, 0 skipped, 0 cancelled** |
| `npm run lint` | VERIFIED WORKING | `tsc --noEmit`, exit 0, no errors |
| `npm run build` | VERIFIED WORKING | Eight legacy HTML entries and private `build/server.cjs`; exit 0, no reported warnings |
| Eight-page read-only browser smoke | VERIFIED WORKING | All eight pages returned 200; 0 page/console errors and 0 HTTP failures; no active React root/entry |
| Root/public parity | VERIFIED WORKING | All 18 matching files identical |
| Baseline write workflows | NOT TESTED in this inspection | No new login/submission/review/upload/certificate mutation journey was run; existing unit/integration checks ran in isolated storage |
| React replacement/features | NOT TESTED | No migration implemented; no success claim for proposed screens |
| Individual legacy controls | PARTIALLY WORKING coverage | Existing evidence includes 16 partial and 28 untested definitions; today's smoke is not a full button audit |
| New local blocker | VERIFIED BROKEN | **None found by these baseline checks**; this does not certify every interaction |
| Live Netlify behavior, staging Atlas writes, external delivery and physical printing | BLOCKED / unverified | No staging/deployed environment or external-delivery validation used in this task |

The browser smoke used an isolated empty JSON runtime, one synthetic Vendor fixture and short-lived synthetic signed QA sessions. It tested page rendering/entry points, not real login or write authorization. The Assessor page rendered all **33 criterion comment controls**. The real `.env` and `.data` files were not used for browser writes, and `npm test` uses `scripts/run-tests-isolated.mjs` with production database/provider settings disabled.

Temporary command logs and browser evidence: `/tmp/trackscore-react-baseline-v2z40o5x/`. Temporary installation of Playwright did not change the application's dependencies. These logs, runtime stores, tokens and browser artifacts are not part of the proposed commit.

Final safety validation compared **95 application/protected file hashes**, including `.env` and all six local data stores: all unchanged. All **580 pre-existing staged entries** retain their original Git status. The only new working-tree entries are the two documentation files named above. Evidence: `inspection-validation.json` in the temporary directory.

### Required validation after each implemented feature

- Run fresh `npm test`, `npm run lint`, `npm run build`; compare baseline counts and investigate warnings/failures.
- Use isolated fixtures for writes. Compare the migrated feature with actual legacy behavior and response contracts.
- Check role/ownership denial directly; immutable technical snapshots and approval/certificate gates remain server-authoritative.
- Exercise loading, errors/retry, empty/populated lists, cancellation, selected-record races, confirmation/cancel/reopen, keyboard focus and mobile sizes.
- Track duplicate writes, unexpected HTTP errors, uncaught promises, EventSource counts and teardown. Keep intentional denial tests separate from unexpected failures.
- For certificate/report changes, download actual bytes, render PDFs, inspect all edges and long names/comments, decode QR and verify its record; inspect Excel and document bytes.
- Stop subsequent migration work on a regression and repair it before proceeding. Preserve a working legacy route as rollback until the replacement is verified.

## 10. Phase output and stopping point

- **Inspected:** build/deployment/server routing; all eight pages; three dormant React files; shared JS/CSS/assets; active frontend API implementations and supporting auth/storage/version/rubric/SLA/risk/SSE code; current QA inventory/reports; test runner; Git state.
- **Changed:** documentation only — this report and the dependency-map JSON.
- **Preserved:** all application code, current APIs/routes, JWT/security/ownership controls, data/environment files, local fallback behavior, version/status semantics, payment removal, workers, uploads, PDFs and legacy UI.
- **Tests/browser checks/results:** the fresh baseline and limits above.
- **Known issues/risks:** incomplete individual-control coverage, source/report/documentation drift, staged artifact/data safety, dormant React activation, build/asset precedence and sensitive workflow migration boundaries.
- **Remaining legacy code:** all current vanilla pages/controllers and their root/public copies remain active and necessary.
- **Recommended next stage:** the typed API/auth and independent React entry/build foundation, followed by the Manager overview using its existing backend response.

**Stop here as requested. Major migration has not started.**
