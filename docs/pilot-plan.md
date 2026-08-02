# Pilot Deployment Plan

The Pilot Rollout tests the system in a live production environment with real data but limited traffic. 

## 1. Pilot Users
- **Admin**: 2 active restaurant managers.
- **Kitchen**: 3 head chefs/packers.
- **Delivery**: 5 dedicated delivery partners.
- **Accounts**: 1 finance officer.
- **Customers**: 20 active, hand-picked customers (mix of basic and regular plan subscribers).

## 2. Pilot Timeline
- **Duration**: 7 Days
- **Day 1-2**: Admin, Kitchen, and Accounts only (verifying recipes, stock, and offline states).
- **Day 3-7**: Add 20 Customers and 5 Delivery partners.

## 3. Success Criteria
- **Zero Critical Crashes**: Sentry crash-free session rate > 99.5%.
- **Zero Missed Deliveries**: All orders must reach `delivered` or `failed_delivery` state.
- **Payments**: 100% of payment verifications complete successfully.
- **Performance**: P95 load times < 2.5s.

## 4. Rollback Criteria
- If Firestore latency spikes > 5 seconds, causing order dispatch failures.
- If Auth fails for > 10% of users.
- If data corruption (e.g. incorrect plan pricing) is identified.

## 5. Escalation Flow
1. **Level 1 (Support)**: Admin logs the issue in the central Slack/WhatsApp group.
2. **Level 2 (Triage)**: Developer checks Sentry and categorizes the bug using `docs/bug-triage.md`.
3. **Level 3 (Emergency)**: If criteria for rollback is met, DevOps immediately reverts Firebase Hosting to the previous known state (or puts the app in Maintenance Mode via Remote Config).

## 6. Communication Plan
- Notify the 20 customers via SMS/WhatsApp before Day 3.
- Share a direct WhatsApp feedback number for bug reporting.
