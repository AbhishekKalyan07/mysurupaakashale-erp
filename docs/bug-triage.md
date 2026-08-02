# Bug Triage & Classification System

This document outlines how production issues discovered post-launch are categorized, prioritized, and resolved.

## Severity Levels

### 1. Critical (P0)
- **Definition**: System is completely down, core flow (e.g. Payments, Orders) is broken for >10% of users, or data is being corrupted.
- **Examples**: Firebase Auth is down, Razorpay webhooks failing, Firestore `permission-denied` for valid roles.
- **SLA**: Immediate acknowledgment. Resolution/Rollback within 1 Hour.
- **Action**: Rollback to previous known-good deployment immediately. Hotfix required.

### 2. High (P1)
- **Definition**: A major feature is broken, but a workaround exists, or it affects a very small subset of users.
- **Examples**: Admin dashboard failing to load specific metric cards, Delivery partners unable to accept bulk batches (but can accept individually).
- **SLA**: Resolution within 24 Hours.
- **Action**: Requires expedited Hotfix patch. Rollback only if the workaround is deemed unacceptable.

### 3. Medium (P2)
- **Definition**: Non-critical functionality is degraded, UX issue, or localized cosmetic bug.
- **Examples**: Push notifications delayed, table sorting broken, CSV export failing.
- **SLA**: Resolution within current active Sprint (1-2 weeks).
- **Action**: No hotfix. Schedule for next standard release.

### 4. Low (P3)
- **Definition**: Minor cosmetic issue, typo, or feature request.
- **Examples**: Color contrast on a non-critical button, spelling error in toast notification.
- **SLA**: Resolution in future release cycle when capacity permits.
- **Action**: Log in backlog.

## Issue Processing Flow
1. **Report**: Bug reported via Customer Feedback, Sentry crash, or Staff WhatsApp.
2. **Assign Owner**: Developer on-call evaluates and assigns severity (P0-P3).
3. **Resolve/Mitigate**: If P0, execute rollback via Firebase Console. If P1-P3, triage to the board.
4. **Post-Mortem**: Required for all P0 issues. Document root cause and preventions in `docs/operations-runbook.md`.
