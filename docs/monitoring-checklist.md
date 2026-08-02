# Monitoring & Alert Checklist

This checklist defines the operational bounds for our telemetry stack in production.

## Telemetry Stack Checklist
- [ ] **Sentry**: DSN is valid, release version matches package.json, source maps are verified.
- [ ] **Firebase Performance**: Custom traces installed on `/admin` and `/customer/orders`.
- [ ] **Remote Config**: Maintenance mode flag (`app_maintenance_mode`) is accessible and defaults to `false`.
- [ ] **Audit Logs**: Verified that `audit_logs` collection is writing Admin patch actions.
- [ ] **Logger**: PII redactor is active for all console logs (no raw phone numbers or payment IDs in the output).

## Alert Thresholds

| Metric | Threshold Trigger (Sentry/GCP) | Action Required |
|---|---|---|
| **Crash Rate** | < 99.0% crash-free sessions | **High Priority**. Triage the Sentry stack trace. |
| **Failed Deliveries** | > 5% of daily active orders | **Critical**. Assess if UI bug or operational routing failure. |
| **Failed Payments** | > 3 consecutive failures | **High Priority**. Check Razorpay/payment gateway webhook status. |
| **Authentication Errors** | > 10 OTP failures / hour | **Critical**. Firebase limits might be reached or SMS gateway down. |
| **Firestore Errors** | `permission-denied` spikes | **Critical**. Re-evaluate Firestore Security Rules immediately. |
