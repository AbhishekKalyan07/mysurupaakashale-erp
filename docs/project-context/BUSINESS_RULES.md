# Mysuru Paakashale ERP — Business Rules & Invariants

[← Back to Knowledge Base Hub](README.md) | [Project Context](PROJECT_CONTEXT.md) | [Technical Architecture](TECHNICAL_ARCHITECTURE.md) | [Development Workflow](DEVELOPMENT_WORKFLOW.md) | [Current Status](CURRENT_STATUS.md) | [Decisions (ADRs)](DECISIONS.md)

---

This document codifies the non-negotiable business rules, domain invariants, and operational policies governing the Mysuru Paakashale ERP.

---

## 1. Customer Identification & Sequencing

### Rule 1.1: Sequential Customer Display IDs (`MP-001`, `MP-002`, ...)
- All customer accounts are assigned a permanent, sequential, human-readable display ID in the format `MP-{PaddedNumber}` (e.g. `MP-001`, `MP-002`, `MP-042`, `MP-105`).
- The counter is atomically maintained in Cloud Firestore at `settings/userCounters` under the `customer` field using a Firestore transaction (`runTransaction`).
- Numbering is continuous and strictly incremental:
  - Numbers 1 through 999 are padded to 3 digits (`MP-001`).
  - Numbers 1000 and above scale naturally (`MP-1000`).
- **Staff Display ID Formats:**
  - Admin: `ADMIN-1001+`
  - Kitchen: `KTCH-1001+`
  - Delivery Partner: `DLVY-1001+`
  - Accounts: `ACCT-1001+`
- **Customer `displayId` vs. Order `displayId`:**
  - `Customer.displayId`: The unique, sequential customer identifier (`MP-001`).
  - `Order.displayId`: A denormalized copy of the **customer's** display ID stamped onto the order snapshot (`MP-001`) to label kitchen tiffins and delivery bags (with a fallback to `ORD-{hash}` or `MP-UID` if missing).
- **Fallback Rule:** If an un-migrated record lacks a `displayId`, helper functions (`formatAllottedId` in `src/shared/utils/displayId.ts`) format a deterministic fallback using `MP-` and the first 6 characters of the UID (e.g. `MP-WTEA9L`). Raw Firebase UIDs must **never** be exposed to customers or operators.
- **Sustained Write Rate Guidance:** Google Cloud Firestore documentation recommends a sustained write rate limit of ~1 write per second to a single document to avoid contention and transaction aborts. In `userRepository.ts`, customer registration transactions retry up to 5 times with exponential backoff and jitter to safely handle registration bursts ([ADR-003](DECISIONS.md#adr-003-sequential-customer-numbering-via-atomic-counter-transaction)).

---

## 2. Order Generation & Scheduling Invariants

### Rule 2.1: Sunday Operation Rule
- Mysuru Paakashale kitchen does not operate on Sundays for regular subscription meal deliveries.
- `orderService.generateDailyOrders(targetDate)` explicitly evaluates whether the target execution date is a Sunday in Asia/Kolkata timezone:
  ```text
  [orderService] Today ({date}) is Sunday. Skipping order generation.
  ```
  Returns `{ success: true, message: "Today is Sunday (Holiday). No orders generated.", ordersGenerated: 0 }` and exits cleanly without error.

### Rule 2.2: Daily Order Generation Idempotency
- Subscription orders are generated daily at 00:05 IST by GitHub Actions `daily.yml`.
- Generation is strictly idempotent: re-running order generation for the same date must not create duplicate orders or overwrite in-flight order statuses.
- **Order Document IDs:**
  - Recurring subscription orders: Deterministic formula `ord_{subscriptionId}_{date}_{mealType}`.
  - On-demand / one-time orders: Custom or standard Firestore auto-generated IDs (`source: "one_time"`).
- If an order document already exists with an active workflow status (`scheduled`, `preparing`, `delivered`, etc.), generation preserves the existing document without overwriting kitchen progress.

### Rule 2.3: Order Denormalization & Price Freezing
- When an order is generated, customer delivery address, contact phone, meal combination details, dietary flags, and pricing snapshots are **frozen directly onto the `Order` document**.
- Subsequent edits to master menus, subscription rates, or customer address books must **never** retroactively rewrite existing orders or historical invoices ([ADR-004](DECISIONS.md#adr-004-denormalized-operational-order-snapshots)).

---

## 3. Operational Protection & Lockout States

### Rule 3.1: Dual Status Lifecycle (`status` vs `kitchenStatus`)
The application maintains two status fields on `Order` (`src/shared/types/order.types.ts`):
- **`status` (Full Operational Lifecycle):** `scheduled`, `preparing`, `packing`, `packed`, `ready_for_pickup`, `picked_up`, `out_for_delivery`, `delivered`, `skipped`, `cancelled`, `failed_delivery`, `returned_delivery`, `locked`, `closed`, `reopened`.
- **`kitchenStatus` (Scoped Production Board View):** `scheduled`, `packing`, `packed`, `ready_for_pickup`.
- **`cancellationReason`:** Structured reason when cancelled (`holiday`, `customer_request`, `subscription_cancelled`, `subscription_paused`, `admin`, `other`).

### Rule 3.2: Kitchen & Delivery Lockout States
- **Customer Cancellation Lockout:** Once an order reaches `packing`, `packed`, or `ready_for_pickup` (or past the shift cutoff while `preparing`), it is locked against customer self-service cancellation or address changes:
  `"Order is already being prepared by the kitchen and cannot be cancelled."`
- **Delivery Lockout:** Once an order is in transit (`picked_up`, `out_for_delivery`, `delivered`, `failed_delivery`, `returned_delivery`), delivery details and routing cannot be modified by customers or kitchen staff.
- Guarded by `isOrderProtectedFromCancellation()` in `src/shared/types/order.types.ts`.

### Rule 3.3: Strict Order Immutability (No Hard Deletes)
- In `firestore.rules`:
  ```text
  match /orders/{orderId} {
    allow delete: if false;
  }
  ```
- Orders represent legal, tax, and operational records. Hard deletion of orders is globally denied for all roles, including Admin. Cancelled orders remain in Firestore with `status: "cancelled"` and a structured `cancellationReason` ([ADR-007](DECISIONS.md#adr-007-immutable-orders-and-rejection-of-hard-deletes)).

---

## 4. Pause, Resume, Skip & Cutoff Rules

### Rule 4.1: Meal Cutoff Windows & Timezone Alignment
Customer self-service actions (skipping a meal, altering meal options, or requesting an unskip) are governed by strict operational cutoff times codified in `AUTHORITATIVE_OPERATIONAL_CUTOFFS` (`src/shared/types/settings.types.ts`):
- **Breakfast Cutoff:** `05:00 IST` on the day of delivery (enforced in `firestore.rules` as `base - 30m` = `23:30 UTC` on the previous calendar day).
- **Lunch Cutoff:** `10:30 IST` on the day of delivery (enforced in `firestore.rules` as `base + 5h` = `05:00 UTC` on the day of delivery).
- **Dinner Cutoff:** `16:00 IST` on the day of delivery (enforced in `firestore.rules` as `base + 10h 30m` = `10:30 UTC` on the day of delivery).

> [!NOTE]
> **Client and Security Rules Synchronization:**
> Client-side evaluation in `dateUtils.ts` (`getModifiableMeals`) formats local time in `Asia/Kolkata` and evaluates against `AUTHORITATIVE_OPERATIONAL_CUTOFFS` (`05:00`, `10:30`, `16:00`). In `firestore.rules` (`checkMealsCutoff`), `timestamp.date(year, month, day)` initializes a base timestamp at `00:00:00 UTC` (which corresponds to `05:30:00 AM IST`), and adds/subtracts durations to define the boundaries. Because `23:30 UTC (prev day) = 05:00 IST`, `05:00 UTC = 10:30 IST`, and `10:30 UTC = 16:00 IST`, the client application and Firestore Security Rules evaluate to the **exact same physical moment in time**.

### Rule 4.2: Automated Pause and Resume Lifecycle
- Subscriptions support future-dated pause ranges (`pauseStartDate` to `pauseEndDate`).
- During daily automation at 00:05 IST:
  1. `automationService.processScheduledPauses(today)` evaluates pause start dates: if `today >= pauseStartDate` and status is `active`, subscription transitions to `paused`.
  2. If `today > pauseEndDate` and status is `paused`, subscription transitions back to `active`.
  3. No orders are generated for dates falling within an active pause range.

### Rule 4.3: Unskip Processing Order
- If a customer previously skipped a meal but submits an unskip request before the cutoff, `automationService.processUnskipRequests()` executes **before** `orderService.generateDailyOrders()`, ensuring the unskipped order is generated in that morning's batch.
- Intraday unskips submitted between 00:05 IST and the cutoff are executed interactively from the client web application via `orderService.addTodayMeal()`.

---

## 5. Billing & Wallet Credit Invariants

### Rule 5.1: Strict Consumption-Based Invoicing
- Customers are billed purely for meals actually delivered or committed to kitchen preparation.
- When an order is cancelled or skipped prior to kitchen lockout, `billingService.adjustInvoiceForCancelledOrders()` immediately deducts the item amount from the relevant invoice subtotal and balance due.

### Rule 5.2: Complete Elimination of Wallet Credits for New Billing
- **Strict Invariant:** Under Phase 6B/6D architecture, the historical "wallet credit" system is permanently deactivated for meal billing ([ADR-002](DECISIONS.md#adr-002-elimination-of-wallet-credits-in-favor-of-pure-consumption-invoicing)).
- When a meal is cancelled or adjusted:
  - **Do NOT** add funds to the customer's `creditBalance`.
  - **Do NOT** generate `cycle_credit` or `credit_applied` ledger entries.
  - Deductions are applied directly to the invoice balance due (`creditApplied: 0`).
- **Historical Wallet Preservation:** Pre-existing `creditBalance` on legacy customer documents and historical ledger entries remain preserved as read-only audit records. They must not be wiped, but must not be drawn upon for automatic meal billing discounts.

### Rule 5.3: Security Deposits Isolation
- Security deposits (held for reusable stainless steel tiffin containers or subscription collateral) are maintained in an independent tracking state (`depositStatus: "paid" | "refunded"`).
- Security deposits are never merged into general meal subscription revenue. Releasing or refunding a deposit requires explicit administrative action and does not create meal billing credits.

---

## 6. Holiday Management

### Rule 6.1: Official Holiday Declaration & Cancellations
- The business may declare specific calendar dates as holidays at `holidays/holiday_{YYYY-MM-DD}` (e.g. `/holidays/holiday_2026-08-15`).
- When a holiday is declared:
  - Orders scheduled for that date are cancelled using `HOLIDAY_CANCELLABLE_STATUSES`: `["scheduled", "preparing", "packing"]`.
  - Orders already in transit or delivered are protected and never retroactively overwritten.
  - Cancelled orders record `cancellationReason: "holiday"`.

---

## 7. Staff Lifecycle Invariant (Soft Deactivation Only)

### Rule 7.1: Preservation of Staff Audit Trails
- Staff accounts (`kitchen`, `delivery_partner`, `accounts`, `admin`) are **never hard-deleted**.
- Terminated or departing staff members are updated to `isActive: false`.
- `firestore.rules` enforces `isActive()` on all staff operations:
  ```text
  function isActive() {
    let doc = callerDoc();
    return doc != null ? doc.get('isActive', true) == true : false;
  }
  ```
  Deactivated staff immediately lose system access while all historical orders, workflow histories, and audit records preserve their `changedBy` / `operatorId` UID references intact.
