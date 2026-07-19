# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-19

### Added
- **Core Architecture:** Set up React 19 + Vite frontend and Firebase Cloud Functions (v2) backend.
- **Authentication & RBAC:** Implemented secure login and role-based access control (Admin, Customer, Kitchen, Delivery, Accounts).
- **Customer Portal:** Browse plans, customize daily meals, and subscribe to recurring meal plans.
- **Manual Payment Verification:** Complete offline payment workflow with receipt upload and admin approval.
- **Kitchen Dashboard:** Daily menu publication and production tracking for generated orders.
- **Delivery Workflow:** Real-time dispatch, delivery confirmation, and reassignment for failed deliveries.
- **Accounts Dashboard:** Automated PDF invoice generation upon payment verification, revenue tracking, and CSV exports.
- **Notifications Engine:** Centralized, provider-agnostic notification service with SendGrid and Twilio integrations.
- **Automated Scheduling:** Idempotent Cloud Scheduler job for daily order generation.
- **Audit Logging:** Immutable audit trail for critical system actions (payments, settings changes, staff management).
- **Security:** Strict Firestore security rules, environment variable management via Secret Manager.

### Fixed
- Fixed duplicate subscription draft creation via server-side checks.
- Prevented double approval of payments in concurrent scenarios using transactional updates.
- Refactored notification logic to decouple it from core admin features.
- Resolved UI accessibility and responsiveness issues across all dashboards.

### Security
- All sensitive credentials moved to Firebase Secret Manager.
- Enforced strict owner-or-admin read/write security posture across all Firestore collections.

## [0.9.0] - 2026-07-15
### Changed
- Removed Razorpay integration in favor of a manual payment verification workflow.
- Updated database schemas to support manual payment proofs.

## [0.8.0] - 2026-07-10
### Added
- Initial project scaffolding and foundational UI components.
- Setup of Firebase Emulators for local development.
