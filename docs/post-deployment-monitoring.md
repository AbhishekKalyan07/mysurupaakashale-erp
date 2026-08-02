# Post-Deployment Monitoring Strategy

After Version 1.0.0 is promoted to Production, the DevOps/Admin team must monitor the health of the application during critical time windows to catch regressions.

## 1. First Hour Monitoring (Hyper-Care Phase)
*Goal: Ensure the system booted correctly and core services are attached.*
- **Action**: Check Firebase Console -> Hosting (ensure rollback is available if deployment corrupts).
- **Metric**: **Crash Rate** (Sentry). Must be 100% crash-free. Any crash triggers immediate rollback.
- **Metric**: **Authentication Errors**. Ensure OTPs are firing successfully.

## 2. First Day Monitoring (Operational Phase)
*Goal: Monitor the first live business cycle (Breakfast/Lunch/Dinner).*
- **Action**: Review Admin Dashboard SLAs.
- **Metric**: **Failed Payments**. Ensure Razorpay webhooks are correctly updating order status.
- **Metric**: **Failed Deliveries**. Monitor delivery partner assignment times and failed states.
- **Metric**: **Firestore Errors**. Check GCP Logs Explorer for `permission-denied` spikes indicating bad security rules.

## 3. First Week Monitoring (Stability Phase)
*Goal: Ensure steady-state capacity and performance.*
- **Action**: Review Firebase Performance traces.
- **Metric**: **Performance (LCP/TTI)**. Verify real-world P95 metrics match staging expectations (<2.5s).
- **Metric**: **Customer Feedback**. Review the internal `feedback` collection for bug reports or UX complaints.

If any metric breaches the thresholds defined in `docs/monitoring-checklist.md`, the bug triage process (`docs/bug-triage.md`) must be initiated.
