# TrackScore security review

Review date: 2026-10-02

## Security changes made

- **Known production JWT fallback:** `netlify/functions/auth.js` signed tokens with a source-controlled key whenever `JWT_SECRET` was missing, and padded short values to the minimum length. Production now fails closed when the secret is absent or shorter than 32 characters. Non-production retains a local-only development key for existing test and developer workflows; a short explicitly configured development key is still padded for compatibility.
- **Environment precedence:** `server.ts` no longer loads `.env.example` as live configuration and dotenv no longer overwrites deployment-provided environment variables. `auth.js` uses the same non-overriding dotenv behavior.
- **Token exposure in URLs:** `getBearerToken` now rejects query-string JWTs by default. The Netlify EventSource status stream explicitly opts in because EventSource cannot set Authorization headers. The Express status-stream route retains query-token support only for that stream.
- **Document upload validation and paths:** `netlify/functions/vendor-documents.js` validates base64 syntax and encoded size before decoding, caps the original filename, notes, and category, and resolves generated/stored document paths under `.uploads` after validating the server-generated document ID format. Existing evaluation ownership and role checks remain in place.
- **Error disclosure:** the Express-to-function bridge now returns a generic 500 response while logging the error server-side.
- **Response security headers:** Express and Netlify static responses add `nosniff`, referrer and permissions policies, frame denial, and a frame-ancestors CSP. Production Express responses add HSTS. The CSP only sets `frame-ancestors` because the existing app uses inline scripts and styles; a restrictive script/style policy requires a separate nonce/hash migration.

## Security controls already present and preserved

- JWT signature and expiry verification and server-side role checks; Manager, Assessor, Vendor separation and vendor resource ownership remain enforced.
- bcrypt password hashing, failed-login throttling, protected password-change flows, and vendor account deactivation checks.
- MongoDB driver query objects and ObjectId conversion are used for database access. Dynamic regular expressions inspected in the query paths are escaped before use.
- Production database fallback is disabled; local JSON storage is development/test-only. The test runner clones test inputs into an isolated temporary workspace.
- Explicit upload MIME allowlist, 10 MB decoded file limit, generated server-side document names, and private `.uploads` storage remain in place.
- Workflow authorization, version snapshots, approved-record immutability, payment verification, and certificate gates were not changed.

## Tests performed

- `npm test`: passed, 190 tests across 37 suites. Added checks for missing/short production JWT secrets, URL-token restriction, invalid upload base64, and excessive file-name length.
- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed (Vite production build and server bundle).
- Runtime smoke test: started the built Express server; `/api/health` and `/` both returned HTTP 200. Confirmed `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`, and `Permissions-Policy` headers on the served page.
- `npm audit --json`: reports 2 moderate findings (ExcelJS and its nested `uuid`). The advisory concerns a `uuid` buffer bounds check in v3/v5/v6 APIs. npm proposes downgrading ExcelJS to 3.4.0, a major compatibility change, so no dependency change was made without validating compatibility.
- Browser testing: not completed. The Tabbit launcher exited with code 1 without diagnostics, so Chrome console/network inspection was unavailable. Runtime smoke checks used HTTP requests instead.

## Remaining concerns and limits

- Functions still emit `Access-Control-Allow-Origin: *`. The APIs use explicit Bearer tokens rather than cookies, so the wildcard does not enable credentialed cookie access; however, an explicit deployment origin allowlist is still preferable and has not been rolled through all functions in this pass.
- Uploads are checked against MIME allowlists but file signatures are not verified. Signature validation needs compatibility decisions for Word documents and the existing text/PDF upload workflow.
- Login throttling is process-local and trusts forwarded client IP headers; serverless instances can distribute attempts and proxy trust depends on deployment configuration.
- Query-string tokens remain for EventSource status streams and can appear in access logs or browser history. This compatibility path should be replaced with a short-lived stream ticket if the hosting architecture permits it.
- The CSP does not constrain scripts, styles, image sources, or connections. Restricting those directives safely requires inventorying and migrating existing inline code and external resources.
- Automated business-flow tests use isolated local storage; no live production database, credentials, deployment headers, or real Manager/Assessor/Vendor browser sessions were used.
- Dependency advisory remains pending an ExcelJS-compatible update or a tested override.
