# Mysuru Paakashale ERP — Current Project Status

[← Back to Knowledge Base Hub](README.md) | [Project Context](PROJECT_CONTEXT.md) | [Business Rules](BUSINESS_RULES.md) | [Technical Architecture](TECHNICAL_ARCHITECTURE.md) | [Development Workflow](DEVELOPMENT_WORKFLOW.md) | [Decisions (ADRs)](DECISIONS.md)

---

**Document Version:** 1.0.1<br>
**Status Timestamp:** 2026-11-16<br>
**Active Documentation Branch:** `docs/egm-project-context-bootstrap`<br>
**Base Production SHA:** `52e689757a5b1f71852b3867b88f7a3b153e3708` (`origin/main`)

---

## 1. Latest Verified Milestone: PR #165

Pull Request **#165** was verified and merged into `main` on 2026-11-15:
- **PR Title:** `fix(orders): correct workflow history contract and harden emulator tests`
- **Merge Commit:** `52e689757a5b1f71852b3867b88f7a3b153e3708`
- **Author/Committer:** `AbhishekKalyan07`
- **Merged Commits:**
  1. `d1f03bd` — `test(firestore): harden order repository emulator integration tests`
  2. `7fd58db` — `fix(orders): map workflow history contract and harden emulator assertions`

### Verified Technical Improvements in PR #165:
1. **Contract Separation:**
   - In `src/shared/services/firestore/orderRepository.ts`, introduced `interface PersistedWorkflowHistoryDoc` at module scope.
   - Confined type assertion strictly to read boundary (`docSnap.data() as PersistedWorkflowHistoryDoc`).
   - Mapped `fromStatus` → `previousStatus` and `toStatus` → `newStatus`.
   - Normalizes stored `notes: null` to `undefined`, strictly fulfilling the public `notes?: string` optional contract.
   - Eliminated persistence field leakages (`...data`) onto public domain objects.
2. **Emulator Integration Hardening:**
   - In `src/shared/services/firestore/__tests__/orderRepository.int.test.ts`, eliminated all private SDK property accesses (`_settings`, `_databaseId`) and `as any` casts.
   - Utilized public typed `auth.emulatorConfig` on Firebase Auth SDK.
   - Validated default database instance via `getFirestore(db.app) === db`.
   - Verified both transitions (with notes and omitted notes) against both the public contract and the raw Admin SDK persistence document.

---

## 2. Continuous Integration & Quality Baseline

### GitHub Actions CI Status on `main`:
- **Run:** [CI #522](https://github.com/AbhishekKalyan07/mysurupaakashale-erp/actions/runs/43722171396) on commit `52e6897`
- **Result:** **100% Passed (7 / 7 Jobs Success)**
  - ✅ `Type Check & Lint` (`tsc -b` composite build, `oxlint`)
  - ✅ `Vitest Unit Tests` (All feature unit suites)
  - ✅ `Security & Functions Integration Tests` (Firestore rules & [IDOR](PROJECT_CONTEXT.md#acronym-glossary) verification)
  - ✅ `Dependency Security Audit` (Zero high/critical CVEs)
  - ✅ `Playwright E2E Tests` (End-to-end browser flows)
  - ✅ `Lighthouse Performance Audit` (Web vitals, [PWA](PROJECT_CONTEXT.md#acronym-glossary) score)
  - ✅ `Production Build` (Vite chunking & assets validation)

### Installed Tooling & Methodology:
- **Elephant-Goldfish Model (EGM):** Installed from the official Google Agent Marketplace (`antigravity-plugins-official/plugin/egm` v0.1.1).
- All EGM skills (`egm-bootstrap`, `egm-brainstorm`, `egm-draft`, `egm-review`, `egm-review-loop`, `egm-resolve`) and Goldfish reviewer personas (`egm-codebase-details`, `egm-comprehension`, `egm-design`, `egm-implementation-readiness`) are active.

---

## 3. Completed Historical Phases Summary

| Milestone / Phase | Scope & Key Accomplishments |
|---|---|
| **Phase 1 & 2: Core Platform** | Established 5 application roles, customer meal subscription plans, kitchen production board, delivery run sheets, and accounts dashboard. |
| **Phase 3A: Security & RBAC Audit** | Secured Firestore rules, prevented customer privilege escalation, instituted address flat index validation (`addressIds[]`), locked hard deletes on orders. |
| **Phase 4C: Order Repo & Emulator Fixtures** | Isolated integration tests against `demo-test` emulator, fixed custom auth token minting, aligned workflow history contracts (PR #165). |
| **Phase 5 & 6B: Financial Reconciliation** | Migrated billing from prepaid wallet credits to consumption-based billing. Locked historical customer `creditBalance` as read-only legacy records. |
| **Phase 6D: Automated Invoicing** | GitHub Actions scheduled automation (`daily.yml`) executing daily at 00:05 IST with failure queue quarantine (`failureQueue/{id}`). |

---

## 4. Open, Ongoing & Explicitly Documented Items

1. **`subscribeWorkflowHistory()` Real-Time Mapping:**
   - *Status:* Resolved. Harmonized `orderRepository.subscribeWorkflowHistory()` with `mapWorkflowHistoryDoc` shared mapper, aligning real-time snapshot emissions with `getWorkflowHistory()` public contracts and normalizing `notes?: string`.
2. **Dashboard CSP / PWA / BloomFilter Workstream:**
   - *Status:* Content Security Policy (CSP) inline script hash and Firestore BloomFilter noise filter merged into `main` in PR #167.
3. **Live Driver GPS Tracking:**
   - *Status:* The schema includes `currentLocation: { lat, lng, updatedAt }` for delivery partners, but continuous high-frequency GPS streaming is deferred to prevent exceeding Firebase Spark Plan write quotas ([TECHNICAL_ARCHITECTURE.md#12-infrastructure-economics--quota-modeling](TECHNICAL_ARCHITECTURE.md#12-infrastructure-economics--quota-modeling)).
