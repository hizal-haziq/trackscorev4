# TrackScore Digital Assessor Evaluation System

The **TrackScore Digital Assessor Evaluation System** is a telematics standardization and certification framework developed in alignment with the Malaysian Institute of Road Safety Research (MIROS). It enables authorized assessors to evaluate vehicle telematics systems across 33 strict criteria (Section A: 24 criteria, Section B: 9 criteria), with dynamic score computation, server-side recomputation, cryptographic-grade tamper guards, audit trails, and managerial review dashboards.

---

## Setup & Deployment

### 1. Environment Variables

Create a `.env` file in the root directory (or use `.env.example` as a template):

```env
# MongoDB Atlas connection string (e.g. mongodb+srv://<username>:<password>@cluster.mongodb.net/trackscore?retryWrites=true&w=majority)
MONGODB_URI=""

# Required in production: generate a unique cryptographically random JWT secret.
# Leave blank only for local development; its ephemeral session key changes on restart.
JWT_SECRET=""

# Host URL
APP_URL="http://localhost:3000"
```

#### MongoDB Atlas Connection String Format
- Ensure your MongoDB Atlas connection string follows the standard SRV format:
  ```
  mongodb+srv://<username>:<password>@<cluster-subdomain>.mongodb.net/trackscore?retryWrites=true&w=majority
  ```
- **IP Access Whitelist**: In [cloud.mongodb.com](https://cloud.mongodb.com) -> **Network Access**, allow only your trusted hosting egress IPs.
- **Resilient Fallback Storage**: If `MONGODB_URI` is omitted or network access is firewalled, TrackScore seamlessly falls back to persistent local storage (`.data/evaluations.json`), ensuring zero downtime or data loss.

---

### 2. Local Development

Use Node.js 22.12 or newer. From the project directory, install dependencies on
the operating system where you will run the app:

```bash
cd trackscorev4
npm ci --include=optional
npm run dev
```

Open `http://localhost:3000` in your browser. TrackScore needs the Node server
for its API routes; opening `index.html` directly or using an HTML-only Live
Server does not start the backend.

If you moved the project from Windows to Ubuntu, run `npm ci --include=optional`
again on Ubuntu. This replaces `node_modules` with Linux dependencies while
preserving `.env` and `.data`. Copied Windows dependencies cause errors such as
`@esbuild/win32-x64 ... needs @esbuild/linux-x64`, a missing Rollup native module,
or a Tailwind native binding failure. Keep `package-lock.json`; dependencies
must be installed separately on each operating system.

You can also run TrackScore locally via either `netlify dev` or the Express development server:

#### Option A: Using Netlify CLI
```bash
# Install Netlify CLI globally if needed
npm install -g netlify-cli

# Start Netlify local development server
netlify dev
```
This reads `netlify.toml`, starts local serverless functions at `/.netlify/functions/*`, and maps `/api/*` routes automatically.

#### Option B: Using Full-Stack Development Server
```bash
# Start development server on port 3000
npm run dev
```
Navigate to:
- **Evaluation Form (Assessor)**: `http://localhost:3000/`
- **Managerial Dashboard**: `http://localhost:3000/dashboard`

---

### 3. Automated Testing Suite

Run the unit and integration test suites:
```bash
npm test
```
The test suite utilizes `node:test` (lightweight, zero-setup) and includes:
- **Unit Tests (`tests/scoring-engine.unit.test.js`)**:
  - Section A maximum calculation (33.00 pts)
  - Section B maximum calculation (10.00 pts)
  - Total maximum calculation (43.00 pts)
  - 1-to-5 Star rating thresholds and MIROS grade classifications (A, B, C, D, E)
- **Integration Tests (`tests/save-evaluation.integration.test.js`)**:
  - Valid submission payloads (200 OK)
  - Client-side tampered total score rejection (400 Bad Request)
  - Missing, invalid-signature or expired Bearer token rejection (401 Unauthorized)
  - Duplicate Company + Device + Assessor + Date guard (409 Conflict)
- **Role-Based Access Control Tests (`tests/role-access.unit.test.js`)**:
  - Enforces signed Assessor role (403 when calling manager endpoints)
  - Enforces signed Manager role (403 when calling assessor endpoints)

---

### 4. Role-Based Access Control (RBAC)

The backend verifies `Authorization: Bearer <JWT>` issued by login. Role tabs, storage hints and page URLs do not grant privileges. Legacy `x-api-key` role keys are retired and are not an authentication fallback.

| Role | Authority | Resource boundary |
| --- | --- | --- |
| Assessor | Submission, assigned/authorized work and eligible peer review | Current assignment for writes; authorized records for reads |
| Manager | Review, assignment, scheduling, certificates, provisioning and administration | Manager scope; no Assessor submission or Vendor self-service authority |
| Vendor | Own portal, documents, profile and revision response | Current active account ownership; no staff authority |

Generate a unique random production JWT secret (for example, `openssl rand -hex 32`), store it only in the deployment secret settings or private `.env`, and never commit it. Production refuses missing/short signing secrets and refuses local JSON database fallback. See [security inventory](docs/trackscore_security_inventory.md) and [hardening report](trackscore_full_security_hardening_report.md) for tested boundaries and deployment limits.

---

### 5. Audit Trail & Soft-Delete

- **Document History**: Every record update via `update-evaluation.js` pushes an audit snapshot `{ editedAt, editedBy, previousScores, previousBreakdown }` to the `evaluationHistory` array on the document.
- **Auditable Soft-Delete**: Deletions via `delete-evaluation.js` mark `deletedAt` and `deletedBy` without dropping the document, preserving full managerial accountability.
- **Filter Support**: `get-evaluations.js` automatically excludes soft-deleted records by default; admins can pass `?includeDeleted=true` to view historical archived records.

---

### 6. Production Build & Deployment

To bundle the application for production:
```bash
npm run build
npm start
```
`npm run dev` and `npm run build` first generate the locally bundled, audited PDF engine (`public/pdf-engine.js`, ignored). `npm run build` then compiles Vite frontend assets into `dist/` and bundles `server.ts` into `build/server.cjs` (outside the published static folder) via `esbuild`.
