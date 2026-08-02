# Monitoring & Observability

This document outlines how to monitor the ERP in production.

## Sentry Error Tracking

Sentry captures React crashes, unhandled promises, and backend errors.
- **Project URL**: [Sentry Dashboard]
- **Session Replay**: Enabled for production (10% sample rate, 100% on error).
- **Sensitive Data**: Redacted automatically via `src/shared/utils/logger.ts`.

## Firebase Performance Monitoring

We track custom metrics via `src/shared/utils/performance.ts`:
- `dashboard_load_time`
- `login_duration`
- `firestore_read_time` / `firestore_write_time`
- `storage_upload_time` / `storage_download_time`

View these metrics in the Firebase Console -> Performance.

## Uptime Monitoring

Do not use a built-in monitor. We recommend setting up external monitors:

### UptimeRobot
1. Create a free account at UptimeRobot.
2. Add a new HTTP(s) Monitor.
3. Point to `https://your-project.web.app`.
4. Set check interval to 5 minutes.
5. Add alert contacts (Email/Slack).

### Better Stack (Logtail/Uptime)
1. Sign up for Better Stack Uptime.
2. Create an HTTP monitor.
3. Configure incident escalation policies for the on-call team.
4. Better Stack provides incident management features for advanced routing.
