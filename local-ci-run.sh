#!/bin/bash
set -ex

export JAVA_TOOL_OPTIONS="-Xms128m -Xmx512m -XX:MaxMetaspaceSize=128m"
export NODE_OPTIONS="--max-old-space-size=4096"

echo "=== STAGE: Dependency installation ==="
npm ci

echo "=== Playwright install ==="
npx playwright install --with-deps chromium

echo "=== PHASE 4: UNSKIP FEATURE ==="
npx vitest run src/shared/services/business/__tests__/unskip.test.ts --pool=forks

echo "=== STAGE: Type Check ==="
npm run type-check

echo "=== STAGE: Lint ==="
npm run lint

echo "=== STAGE: Unit Tests ==="
npm run test

echo "=== STAGE: Coverage ==="
npm run test:coverage

echo "=== STAGE: Security ==="
export FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
export FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'
npx firebase emulators:exec --project demo-security-test --only firestore,storage "npm run test:security"

echo "=== STAGE: Playwright ==="
export VITE_FIREBASE_API_KEY="mock-api-key"
export VITE_FIREBASE_AUTH_DOMAIN="mock-auth-domain"
export VITE_FIREBASE_PROJECT_ID="demo-test"
export VITE_FIREBASE_STORAGE_BUCKET="mock-storage-bucket"
export VITE_FIREBASE_MESSAGING_SENDER_ID="mock-messaging-sender-id"
export VITE_FIREBASE_APP_ID="mock-app-id"
export VITE_USE_FIREBASE_EMULATORS='true'

npx playwright test --project=chromium

echo "=== STAGE: Dependency Audit ==="
npm audit --omit=dev --audit-level=high

echo "=== STAGE: Build ==="
export VITE_FIREBASE_API_KEY="mock-api-key"
export VITE_FIREBASE_AUTH_DOMAIN="mock-auth-domain"
export VITE_FIREBASE_PROJECT_ID="demo-test"
export VITE_FIREBASE_STORAGE_BUCKET="mock-storage-bucket"
export VITE_FIREBASE_MESSAGING_SENDER_ID="mock-messaging-sender-id"
export VITE_FIREBASE_APP_ID="mock-app-id"
export VITE_USE_FIREBASE_EMULATORS="true"
npm run build

echo "=== STAGE: Lighthouse CI ==="
npx lhci autorun

echo "ALL CI STAGES COMPLETED LOCALLY!"
