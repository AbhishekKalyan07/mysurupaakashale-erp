# Mysuru Paakashale ERP — Project Knowledge Base

This directory contains the permanent, source-verified project context for the **Mysuru Paakashale ERP**. It serves as the canonical source of truth for both human engineers and autonomous AI agents operating under the **Elephant-Goldfish Model (EGM)**.

---

## Knowledge Base Navigation

| Document | Primary Focus & Purpose | Key Contents |
|---|---|---|
| 📘 **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** | **Architecture & System Overview** | Mission, serverless Spark architecture, current tech stack, 5 roles & RBAC boundaries, and dual execution workflows. |
| ⚖️ **[BUSINESS_RULES.md](BUSINESS_RULES.md)** | **Domain Invariants & Policies** | Sequential customer IDs (`MP-001`), Sunday closures, cutoffs (with UTC/IST security rules notes), lockouts, and consumption-based billing. |
| 🏛️ **[TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md)** | **Technical & Data Architecture** | Infrastructure economics & Spark limits (20k write/day ceiling, 1 GiB storage), complete Firestore schema ERD, contract separation, and security rules. |
| 🛠️ **[DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)** | **Engineering & Testing Protocol** | EGM lifecycle, 7-step pre-commit & pre-PR checklist, local dev & emulator setup (Java, seed data), and CI stages. |
| 📍 **[CURRENT_STATUS.md](CURRENT_STATUS.md)** | **Current Baseline & Milestones** | Baseline SHA (`52e6897`), PR #165 achievements, CI #522 verification, active workstreams, and known asymmetries. |
| 📜 **[DECISIONS.md](DECISIONS.md)** | **Architectural Decision Records (ADRs)** | Formal records (ADR-001 to ADR-007) explaining *why* key architectural, financial, and operational decisions were made. |

---

## Core Operational Invariants at a Glance

1. **Spark Plan Serverless:** Zero Cloud Functions in production; scheduled automations run via GitHub Actions cron + `vite-node`. Quota ceilings (20,000 writes/day, 50,000 reads/day, 1 GiB storage) must be respected.
2. **Sequential Customer IDs:** `MP-001`, `MP-002`... maintained atomically in `settings/userCounters`. Raw Firebase UIDs are never exposed to operators or customers.
3. **No Wallet Credits for Meals:** Meal cancellations deduct directly from invoice balance due (`adjustInvoiceForCancelledOrders`); no funds are added to customer `creditBalance`. Historical wallet data remains read-only for audit integrity.
4. **Order Immutability:** Orders are never hard-deleted (`allow delete: if false;` in `firestore.rules`). Cancelled orders record cancellation reasons and preserve status history.
5. **Emulator Isolation on `demo-test`:** Integration write tests must strictly target the local `demo-test` emulator on `127.0.0.1:8085` (Firestore) and `127.0.0.1:9099` (Auth). Never execute production writes.
6. **Production Automation Protection:** Never casually dispatch `daily.yml` without authorization and a verified target date.

---

## Methodology: Elephant-Goldfish Model (EGM)

This documentation suite was established and verified using the **Elephant-Goldfish Model**:
- **Elephant Coordinator (Long-term Memory & Architecture):** Synthesizes cross-system domain context, enforces persistent architectural invariants, coordinates review workflows, and updates the permanent knowledge base.
- **Goldfish Reviewers (Fresh-Context Specialized Auditors):**
  - **`egm-codebase-details`**: Technical auditor verifying that documentation strictly matches real code implementation, schemas, and types.
  - **`egm-comprehension`**: Naive reader auditor flagging cognitive leaps, domain jargon, undefined acronyms, and workflow ambiguities.
  - **`egm-design`**: Hostile design critic evaluating system architecture, scalability limits, infrastructure economics, and unmitigated risks.
  - **`egm-implementation-readiness`**: Pragmatic tech lead verifying that workflows, checklists, and commands are unambiguous and directly executable.
