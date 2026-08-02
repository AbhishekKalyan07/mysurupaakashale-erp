# Environment Variables Guide

The ERP requires several environment variables for different integrations.

## Local Development (`.env.local`)

Copy `.env.example` to `.env.local` and populate:

```env
# Firebase Public Config
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx

# App Check
VITE_APPCHECK_SITE_KEY=xxx
VITE_APPCHECK_DEBUG_TOKEN=xxx

# Emulator
VITE_USE_FIREBASE_EMULATORS=true

# Sentry
VITE_SENTRY_DSN=xxx
```

## CI/CD Secrets (GitHub Actions)

Configure these in GitHub Repository -> Settings -> Secrets and variables -> Actions:

| Secret | Purpose |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Used for deployments and backend script admin access |
| `SENTRY_AUTH_TOKEN` | Required by Vite plugin to upload sourcemaps |
| `SENTRY_ORG` | Your Sentry organization slug |
| `SENTRY_PROJECT` | Your Sentry project slug |

Never commit secrets to the repository.
