# Operations Runbook

## Incident Response

If an alert triggers in Sentry or UptimeRobot:

1. **Acknowledge**: Respond in the #alerts channel that you are investigating.
2. **Triaging**:
   - Check Sentry for a stack trace.
   - Check Firebase Performance for latency spikes.
   - Verify Firebase Status Dashboard for platform outages.
3. **Mitigation**:
   - If the issue is a recent deployment, perform a Rollback (see `docs/disaster-recovery.md`).
   - If it's a feature bug, toggle the feature off via Firebase Remote Config.
4. **Resolution**:
   - Implement the fix locally.
   - Push to `main` for CI deployment.

## Common Troubleshooting

### "Permission Denied" in Firestore
- Check Firebase Security Rules.
- Verify the user's role claim via Firebase Admin SDK or the Users table.

### Build Failing on CI
- Review the step that failed.
- If it's Lighthouse, ensure the bundle isn't exceeding limits. Check `bundle-stats.html`.
- If it's Playwright, download the traces from GitHub Artifacts to debug visually.

### Sentry Missing Source Maps
- Ensure `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are correctly set in GitHub Secrets.
- Verify that `vite.config.ts` has `build.sourcemap: true`.
