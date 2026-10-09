# TrackScore — Assessment Risk & Anomaly Detection

## 1. Executive Summary & Purpose

The **Assessment Risk & Anomaly Detection** system is an operational and compliance monitoring engine designed for TrackScore managers and compliance officers. It automatically monitors telematics hardware and software evaluations to identify unusual patterns that may deserve manager review before approval or certification.

### Key Tenets & Architectural Guardrails
1. **Advisory Intelligence Only**:
   - Risk signals and anomaly alerts are strictly advisory.
   - The engine **NEVER automatically rejects, suspends, penalizes, or blocks** an assessment from progressing or achieving certification.
   - The system identifies objective patterns; it **NEVER makes accusations** of fraud, dishonesty, or assessor incompetence.
2. **Scoring Rubric & SLA Integrity**:
   - The authoritative 33-point evaluation rubric (`rubric.js`), raw point scaling, and star ratings remain 100% untouched.
   - SLA tracking (`sla.js`) and assessor workload management (`get-assessor-workload.js`) remain untouched.
3. **Data Isolation & Vendor Protection**:
   - Risk analysis results and anomaly scores are stored in a dedicated collection (`assessment_risk`) and fallback store (`.data/assessment_risk.json`).
   - Assessment version history records (`assessment_versions`) remain strictly immutable.
   - **Vendor Isolation**: External vendors and customer portal accounts are strictly forbidden from accessing risk analytics, peer baselines, or internal assessor metrics (403 Forbidden).

---

## 2. Risk Classification Levels & Thresholds

The system calculates a cumulative **Risk Score** ranging from `0` to `100`, weighted across detected anomaly vectors.

| Risk Level | Score Range | Operational Meaning | Suggested Action |
| :--- | :---: | :--- | :--- |
| **`NORMAL`** | 0 – 29 | Assessment turnaround, score variance, and criterion distributions align with expected norms. | Standard managerial review workflow. |
| **`REVIEW`** | 30 – 59 | One or more operational patterns diverge from historical peer baselines. | Manager inspects evidence, reviews 33 criteria matrix, or compares revision history. |
| **`HIGH_ATTENTION`** | 60 – 100 | Multiple compounding statistical anomalies detected across turnaround, criteria, or revisions. | Comprehensive manager audit across version diffs and assessor workload prior to approval. |
| **`INSUFFICIENT_DATA`** | 0 | Baseline historical sample size is too small (< 3 peer evaluations) to compute statistical variance. | Neutral display indicating baseline building in progress. |

### Data Confidence Scoring
- **`HIGH`**: Baseline sample size $\ge 5$ peer assessments.
- **`MEDIUM`**: Baseline sample size between $3$ and $4$ peer assessments.
- **`INSUFFICIENT_DATA`**: Baseline sample size $< 3$ peer assessments.

---

## 3. The 9 Anomaly Vectors & Detection Logic

### 1. `RAPID_COMPLETION` (Weight: 15 pts)
- **Signal**: Evaluation turnaround from initiation/start to submission completed drastically faster than expected.
- **Trigger**: Turnaround duration $< 30\text{ minutes}$, or $< 20\%$ of the historical median duration for assessments.
- **Rationale**: Telematics hardware verification requires bench testing, map verification, and signal capture. Abnormally fast turnaround warrants managerial check of attached evidence.

### 2. `SCORE_CONCENTRATION` (Weight: 10 pts)
- **Signal**: Score concentration at perfection or near-perfection in a historically lower-scoring category.
- **Trigger**: Evaluation awards points on all 33/33 criteria (or total score $\ge 4.80$) while less than $25\%$ of historical peer evaluations achieve 5 stars.
- **Rationale**: Extreme top-end scoring when peers consistently find partial deficiencies may warrant double-checking test reports.

### 3. `CRITERION_PATTERN_ANOMALY` (Weight: 15 pts)
- **Signal**: Assessor criterion selections diverge significantly from package-level peer norms.
- **Trigger**: Disagreement on $\ge 8$ criteria where peer consensus exceeds $80\%$.
- **Rationale**: Identifies evaluations where criteria selections conflict with typical hardware/software characteristics for that certification tier.

### 4. `LARGE_VERSION_CHANGE` (Weight: 15 pts)
- **Signal**: Substantial jump or drop in total score between consecutive assessment versions.
- **Trigger**: Absolute score difference $|\Delta| \ge 1.00\text{ points}$ between versions.
- **Rationale**: A revision that changes more than 20% of the entire 5.00-point scale indicates major remediation or re-scoring deserving version diff inspection.

### 5. `REPEATED_RESUBMISSION` (Weight: 10 pts)
- **Signal**: Assessment has undergone an unusually high revision count.
- **Trigger**: Version number reaches $\ge 4$ (i.e. 4 or more revisions/resubmissions).
- **Rationale**: Multiple revision cycles suggest ongoing compliance difficulties or misaligned technical requirements.

### 6. `ASSESSOR_SCORE_OUTLIER` (Weight: 15 pts)
- **Signal**: Assessor's awarded score deviates noticeably from their personal historical scoring distribution.
- **Trigger**: Score deviates by $> 2.0\text{ standard deviations}$ ($|z| > 2.0$) from the assessor's historical mean, with at least 3 prior assessments.
- **Rationale**: Highlights when an assessor evaluates significantly harsher or significantly more leniently than their usual baseline.

### 7. `ASSESSOR_CONSISTENCY_SIGNAL` (Weight: 10 pts)
- **Signal**: Assessor's criteria selections contradict their established personal pattern across identical device models or packages.
- **Trigger**: Selection contradiction rate $> 40\%$ across criteria where the assessor previously demonstrated consistent scoring patterns.
- **Rationale**: Identifies potential assessor calibration drift across evaluation cycles.

### 8. `VENDOR_REVISION_ANOMALY` (Weight: 10 pts)
- **Signal**: Current evaluation's revision count significantly exceeds the vendor's historical revision baseline.
- **Trigger**: Current revisions $> (\text{Vendor Average Revisions} + 2.0)$ with $\ge 2$ previous assessments on file.
- **Rationale**: Flags vendors experiencing unusual submission rework relative to their typical operational efficiency.

### 9. `SLA_PATTERN_ANOMALY` (Weight: 5 pts)
- **Signal**: Assessment turnaround timeline shows operational strain.
- **Trigger**: SLA status is `OVERDUE` or assessment finished `COMPLETED_LATE`.
- **Rationale**: Timeline strain correlates with rushed final submissions or communication bottlenecks.

---

## 4. Architecture & Data Model

### Database Collections & Fallback Files
- **MongoDB Atlas Collection**: `assessment_risk`
  - Indexed on: `{ evaluationId: 1, versionNumber: -1 }`, `{ riskLevel: 1 }`, `{ assessorId: 1 }`, `{ createdAt: -1 }`
- **Local Fallback File**: `.data/assessment_risk.json`

### Risk Document Schema (`assessment_risk`)
```json
{
  "_id": "risk_6745...01",
  "evaluationId": "6745...99",
  "versionNumber": 1,
  "riskLevel": "REVIEW",
  "riskScore": 40,
  "dataConfidence": "HIGH",
  "signals": [
    {
      "type": "RAPID_COMPLETION",
      "name": "Rapid Completion Anomaly",
      "weight": 15,
      "score": 15,
      "observed": "Completed in 14 minutes (Historical median: 180 min)",
      "explanation": "Assessment duration is substantially below historical median."
    },
    {
      "type": "LARGE_VERSION_CHANGE",
      "name": "Large Version Score Delta",
      "weight": 15,
      "score": 15,
      "observed": "Score shifted from 2.25 to 4.50 (|Δ| = 2.25 pts)",
      "explanation": "Score delta between version 1 and version 2 exceeds 1.00 points threshold."
    },
    {
      "type": "REPEATED_RESUBMISSION",
      "name": "Repeated Resubmission Count",
      "weight": 10,
      "score": 10,
      "observed": "Current version is v4 (threshold: 4)",
      "explanation": "High revision cycle count."
    }
  ],
  "signalsCount": 3,
  "metrics": {
    "durationMinutes": 14,
    "historicalMedianMinutes": 180,
    "versionDelta": 2.25,
    "versionCount": 4,
    "assessorScoreZ": 0.42
  },
  "evaluatedAt": "2026-09-25T14:30:00.000Z",
  "updatedAt": "2026-09-25T14:30:00.000Z"
}
```

---

## 5. API Endpoints & Role-Based Access Control (RBAC)

### `GET /.netlify/functions/get-assessment-risk` (or `/api/get-assessment-risk`)

#### Query Parameters:
- `evaluationId`: ID of evaluation to evaluate or retrieve risk diagnostics.
- `version`: (Optional) Version number to inspect historical snapshot.
- `recalculate`: (Optional, `true`) Forces recalculation against latest baseline peers.
- `overview`: (Optional, `true`) Returns manager aggregate overview counts.

#### RBAC Permissions:
| Role | Individual Evaluation (`evaluationId`) | Global Overview (`overview=true`) |
| :--- | :---: | :---: |
| **Manager** | Full Access | Full Access |
| **Assessor** | Own Evaluations Only | 403 Forbidden |
| **Vendor** | 403 Forbidden | 403 Forbidden |
| **Anonymous** | 401 Unauthorized | 401 Unauthorized |

---

## 6. Frontend Manager Dashboard Integration

### 1. Assessment Intelligence Summary Cards
Displays 4 metric cards below the SLA Operational Overview:
- **`NORMAL`**: Green badge, count of evaluations with score 0–29.
- **`REVIEW`**: Amber badge, count of evaluations with score 30–59.
- **`HIGH ATTENTION`**: Red badge, count of evaluations with score $\ge 60$.
- **`INSUFFICIENT DATA`**: Slate badge, count of evaluations lacking baseline sample size.
Clicking any card instantly filters the evaluations table to that risk category.

### 2. Evaluation Table Risk Column & Filter
- New **Risk Level** column displaying colored status badge with signal counter (`Review (35 pts)`).
- Filter toolbar dropdown: Filter by All, `Normal`, `Review`, `High Attention`, `Insufficient Data`.
- Action button `Risk` on every row to directly open the diagnostics modal.

### 3. Risk & Anomaly Diagnostics Modal (`#risk-modal`)
- **Header**: Company, device, assessor, package, and total score.
- **Metrics Grid**: Risk Level, Cumulative Risk Score (meter), Data Confidence, Triggered Signals count.
- **Compliance Advisory Banner**: Explains advisory nature.
- **Detected Signals Card**: List of all triggered signals with observed values and rationale.
- **9-Vector Diagnostic Audit Matrix**: Comprehensive inspection grid of all 9 anomaly vectors.
- **Manager Action Direct Links**:
  - `Compare Version History` (opens revision diff tool).
  - `Inspect 33 Criteria Matrix` (opens technical evaluation report).
  - `Check Assessor Workload` (opens assessor workload tab).
  - `Re-evaluate Risk` (recalculates on demand against current database state).
