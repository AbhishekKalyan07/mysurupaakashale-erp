# Firestore Optimization Report

This document outlines architectural optimization points for Firestore queries based on static analysis of the repository layer.

## Audit Findings

### 1. Missing Limits on History/Feed Queries
- **`orderRepository.ts`**: The query for history changes (`historyRef, orderBy('changedAt', 'desc')`) is unbounded. Over time, as an order accumulates history, this will fetch the entire history array/subcollection every time an admin opens the order.
  - *Recommendation*: Append `limit(50)` and implement manual pagination for older history items.

### 2. Unbounded Read for Subscriptions
- **`subscriptionRepository.ts`**: The query `query(skipsRef, orderBy('date', 'desc'))` is unbounded.
  - *Recommendation*: Use `where('date', '>=', startOfMonth)` to only fetch relevant skips for the current billing cycle.

### 3. Missing Composite Indexes
Based on the queries, we need the following composite indexes in `firestore.indexes.json` to prevent slow queries as data grows:
- **`orders` collection**: `date` (ASC) + `source` (ASC)
- **`attendance` collection**: `staffId` (ASC) + `date` (DESC)
- **`payroll` collection**: `staffId` (ASC) + `month` (DESC)
- **`leave` collection**: `staffId` (ASC) + `createdAt` (DESC)
- **`leave` collection**: `status` (ASC) + `createdAt` (DESC)

### 4. Overuse of `onSnapshot`
- The `useAdminDashboardMetrics.ts` hook opens 5 concurrent `onSnapshot` listeners. While this provides real-time data, leaving the Admin dashboard open continuously consumes read operations.
- *Recommendation*: Convert low-priority metrics (e.g., total users, failed payments) to `getDocs` polling every 5 minutes, reserving `onSnapshot` strictly for live kitchen/delivery operations.

### 5. N+1 Queries
- None found natively in the Repositories, but ensure that the frontend does not iterate over a list of items and individually fetch references (e.g. `getUser(id)` inside a `.map()`). Use `in` queries if batch fetching is required, or denormalize basic user info into the order document.
