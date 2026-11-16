# Mysuru Paakashale ERP — Architectural Decision Records (ADRs)

[← Back to Knowledge Base Hub](README.md) | [Project Context](PROJECT_CONTEXT.md) | [Business Rules](BUSINESS_RULES.md) | [Technical Architecture](TECHNICAL_ARCHITECTURE.md) | [Development Workflow](DEVELOPMENT_WORKFLOW.md) | [Current Status](CURRENT_STATUS.md)

---

This document records the foundational architectural, technical, and business decisions made throughout the evolution of the Mysuru Paakashale ERP system.

---

## ADR-001: Serverless Spark Plan Architecture with GitHub Actions Scheduled Automation

- **Status:** Accepted & Enforced
- **Context:**
  Mysuru Paakashale is an independent food service enterprise seeking to minimize cloud infrastructure costs while maintaining automated background operations (daily order generation, subscription billing, pause/resume processing). Deploying persistent servers or paying for Cloud Functions and Cloud Scheduler would breach the Firebase Spark (free) plan boundaries.
- **Decision:**
  1. The entire cloud infrastructure is anchored on the Firebase Spark Plan.
  2. Cloud Functions are excluded from production deployment. Client-side SDK handles direct reads and writes through strictly enforced `firestore.rules`.
  3. Scheduled backend tasks are orchestrated through GitHub Actions cron workflows (`daily.yml`, `weekly.yml`, `monthly.yml`) executing `vite-node` scripts authenticated as an admin service account.
- **Consequences & Operational Considerations:**
  - *Positive:* Zero infrastructure hosting costs for backend compute.
  - *Free Tier Ceilings:* Operations operate within Google Cloud Standard Spark free quotas (50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1 GiB storage). Quotas reset daily at **midnight US Pacific Time (00:00 PT)**.
  - *Constraint:* Cloud Storage is disabled; client writes must be thoroughly validated by Firestore security rules.
  - *Cron Jitter:* GitHub Actions scheduled cron runs on a shared queue and can experience 15 to 90 minutes of execution delay during peak GitHub load. If morning generation does not trigger by 01:00 IST, the Admin Dashboard provides manual emergency order generation (`orderGenerationRuns`).
  - *Runner Budget:* Private GitHub repositories receive 2,000 free runner minutes per month. Daily workflows must complete in under 5 minutes to stay comfortably within the free tier.
  - *Safety Rule:* GitHub Actions daily automation must never be dispatched casually out-of-schedule.

---

## ADR-002: Elimination of Prepaid Wallet Credits in Favor of Pure Consumption Invoicing

- **Status:** Accepted (Phase 6B / 6D)
- **Context:**
  Earlier versions of the application maintained a customer prepaid wallet system where cancellations or subscription credits added funds to a `creditBalance`. In practice, wallet balance tracking created severe financial reconciliation discrepancies, complex edge cases during refunds, and regulatory accounting overhead.
- **Decision:**
  1. All new meal billing operates on a pure consumption basis.
  2. Meal cancellations prior to the kitchen lockout directly deduct the item value from the invoice balance due (`billingService.adjustInvoiceForCancelledOrders`).
  3. **No new wallet credits:** The system does not add funds to customer `creditBalance` or generate `cycle_credit` / `credit_applied` ledger entries for meal cancellations.
  4. **Historical Preservation:** Existing legacy `creditBalance` values on customer profiles remain preserved as read-only audit records, but are not used as automatic deductions on new invoices.
- **Consequences:**
  - Invoicing matches physical meal delivery directly.
  - Elimination of wallet liability on company balance sheet.
  - Clear reconciliation on the Accounts dashboard.

---

## ADR-003: Sequential Customer Display IDs (`MP-001`, `MP-002`) via Atomic Counters

- **Status:** Accepted & Enforced
- **Context:**
  Customers, kitchen coordinators, and delivery dispatchers communicate frequently over telephone and WhatsApp. Referencing long, random Firebase Authentication UIDs (e.g. `wtea9lQtgPVLLrrUEZVu`) was error-prone and caused operational confusion.
- **Decision:**
  1. Customers are assigned sequential display IDs: `MP-001`, `MP-002`, `MP-043`, `MP-105`, etc.
  2. The sequence is atomically managed in `settings/userCounters` via `runTransaction` in `userRepository.generateNextDisplayId()`.
  3. If a legacy record lacks a display ID, helpers format a deterministic fallback using `MP-` and the first 6 characters of the UID (e.g. `MP-WTEA9L`). Raw UIDs are never exposed in UI or customer communication.
- **Consequences & Operational Considerations:**
  - *Usability:* Fast, unambiguous customer lookup for phone support, kitchen labels, and delivery packaging.
  - *Sustained Write Rate Guidance:* Google Cloud Firestore documentation recommends a sustained rate limit of ~1 write per second to an individual document to avoid lock contention. Sign-up transactions implement exponential backoff retries (up to 5 attempts) to reliably handle registration bursts.

---

## ADR-004: Denormalized Daily Operational Snapshot for Orders

- **Status:** Accepted & Enforced
- **Context:**
  Customer addresses, delivery partner assignments, and meal plan prices change over time. If orders merely held foreign keys pointing to master customer or subscription documents, later address edits or menu price increases would retroactively distort historical delivery routes and past invoices.
- **Decision:**
  1. The daily order document (`orders/{orderId}`) acts as the **frozen operational snapshot for the day**.
  2. When `orderService.generateDailyOrders()` runs, customer name, phone, full address string, geographic coordinates, assigned delivery partner, zone, items label, and unit prices are copied directly into the order.
  3. Later updates to customer profiles or menu pricing do not mutate already-generated orders.
- **Consequences:**
  - Preserves immutable tax and delivery audit trails.
  - Kitchen and delivery views read exclusively from `orders` without complex relational joins.

---

## ADR-005: Decoupled Workflow History Public Contract vs Firestore Persistence

- **Status:** Accepted (Refined in PR #165)
- **Context:**
  In Firestore persistence, `orderRepository.updateWorkflow()` historically stored state transitions using the field names `fromStatus` and `toStatus`. However, the domain model `OrderWorkflowHistory` (`src/shared/types/order.types.ts`) defined the public contract as `previousStatus` and `newStatus`. A previous workaround cast the raw persistence document directly to the public interface, causing contract leakage and fragility.
- **Decision:**
  1. Define a private `PersistedWorkflowHistoryDoc` interface at module scope in `orderRepository.ts` representing the exact Firestore storage schema.
  2. Restrict type assertions strictly to the database boundary (`docSnap.data() as PersistedWorkflowHistoryDoc`).
  3. Explicitly map `fromStatus` → `previousStatus` and `toStatus` → `newStatus`.
  4. Normalize optional `notes`: if stored as `null`, map to `undefined` on the public contract so it strictly fulfills `notes?: string`.
  5. Prohibit spreading `...data` into the domain object.
- **Consequences:**
  - Clean TypeScript domain contracts for UI consumers.
  - Full backward compatibility with existing stored Firestore documents.
  - Independent unit and integration assertions for both public and persistence schemas.
  - *Resolved Item:* `subscribeWorkflowHistory()` real-time listener was harmonized via `mapWorkflowHistoryDoc` to ensure consistent mapping and null-to-undefined notes normalization.

---

## ADR-006: Adoption of the Elephant-Goldfish Model (EGM) for AI-Assisted Development

- **Status:** Accepted & Active
- **Context:**
  During prolonged AI agent sessions, long conversational histories lead to "agent tunnel vision", confirmation bias, and memory drift. Large prompts were required from external tools to enforce constraints, creating workflow friction.
- **Decision:**
  1. Install and standardize on the official Google **Elephant-Goldfish Model (EGM)** plugin (`antigravity-plugins-official/plugin/egm`).
  2. The primary chat session acts as the **Elephant** (retaining deep codebase context, rules, and architecture to draft specs).
  3. Independent subagents act as **Goldfish** (spawned in fresh, zero-context sessions to critically audit specs and diffs against rubrics without conversational bias).
- **Consequences:**
  - Higher rigor and automated critique before code execution.
  - Eliminates reliance on external prompt-crafting workflows.
  - Permanent documentation maintained in `docs/project-context/` so future sessions have an immediate, verified ground truth.

---

## ADR-007: Strict Order Immutability (Prohibition of Hard Deletion)

- **Status:** Accepted & Enforced (Archival Policy: Proposed / Under Review)
- **Context:**
  In financial, food safety, and customer service domains, records of ordered, prepared, or cancelled meals must never be erased. Accidental deletion could cause delivery dispatch ghosting or revenue leakage. Over multiple years, cumulative operational documents could approach the Firebase Spark Plan 1 GiB database storage ceiling.
- **Decision:**
  1. In `firestore.rules`, `match /orders/{orderId}` explicitly sets `allow delete: if false;`.
  2. No role, including Admin, possesses hard deletion rights for order records.
  3. Cancelled orders transition to `status: "cancelled"` with an explicit `cancellationReason`.
  4. **Proposed Archival Strategy (Under Architectural Review):** To ensure long-term database storage remains within the 1 GiB free tier without compromising active audit trails, an archival proposal suggests exporting orders older than 180 days to external cold storage (NDJSON / Google Drive / local disk) and purging them from live Firestore. This remains a proposal and is **not yet approved** as an active operational policy.
- **Consequences:**
  - Complete, unalterable historical ledger of all active meal operations.
  - Compliance with commercial audit and tax standards.
  - Future storage risks are formally cataloged for architectural planning without premature policy invention.
