# Staging Deployment Strategy

This document defines the process for promoting the Mysuru Paakashale ERP to the staging environment (`mysuru-paakashale-erp-staging`) before production releases.

## 1. Firebase Staging Project
- **Project ID**: `mysuru-paakashale-erp-staging`
- **Hosting URL**: `https://mysuru-paakashale-erp-staging.web.app`

## 2. Environment Variables
Ensure `.env.staging` is configured correctly:
```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=mysuru-paakashale-erp-staging.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mysuru-paakashale-erp-staging
VITE_FIREBASE_STORAGE_BUCKET=mysuru-paakashale-erp-staging.appspot.com
VITE_USE_FIREBASE_EMULATORS=false
VITE_SENTRY_DSN=xxx
```

## 3. Deployment Process
Staging deployments are triggered manually via GitHub Actions or CLI.

### CLI Deployment
1. Install dependencies: `npm ci`
2. Build staging bundle: `vite build --mode staging`
3. Deploy to staging alias: 
   ```bash
   firebase use staging
   firebase deploy --only hosting,firestore:rules,storage
   ```

## 4. Rollback Strategy
If a staging deployment fails UAT:
1. Revert to the previous release via the Firebase Hosting Console.
2. If Firestore Rules caused the issue, run: `firebase deploy --only firestore:rules` from the previous git commit.
3. Mark the GitHub Release as failed and document in `docs/bug-triage.md`.

## 5. Release Checklist
- [ ] Build succeeds without warnings.
- [ ] All unit, integration, and E2E tests pass.
- [ ] Firebase Security Rules deployed successfully.
- [ ] Sentry Source Maps uploaded.
- [ ] Remote Config parameters match production expectations.
- [ ] Admin user seeded successfully.
