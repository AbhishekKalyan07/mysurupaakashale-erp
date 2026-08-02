# Production Deployment Guide

## Prerequisites
- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Authorized Google Cloud Account

## CI/CD Pipeline
Our deployment is fully automated via GitHub Actions (`.github/workflows/ci.yml`).

The pipeline enforces:
1. Type Checking & Linting
2. Unit Testing & Code Coverage
3. Security Testing against Firebase Emulators
4. E2E Testing with Playwright
5. Dependency Auditing (`npm audit`)
6. Lighthouse Performance Auditing
7. Production Build (with Sentry Source Maps)
8. Firebase Hosting & Rules Deployment
9. Automated GitHub Release

## Manual Deployment

If you must deploy manually (e.g. emergency hotfix):

1. **Install dependencies**: `npm ci`
2. **Setup Env**: Ensure `.env.local` is present with production values.
3. **Build**: `npm run build`
4. **Deploy**:
   ```bash
   firebase use production
   firebase deploy --only hosting,firestore:rules,storage
   ```

## Sentry Releases
When building via CI, `@sentry/vite-plugin` automatically uploads source maps and associates them with the release.
Ensure `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set in your GitHub Secrets.
