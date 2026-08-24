$ErrorActionPreference = 'Stop'
Write-Host "Running security tests with correct project id..."
npx firebase emulators:exec --project demo-security-test --only firestore,storage "npm run test:security"
Write-Host "Running Playwright..."
npx playwright test --project=chromium
Write-Host "Running build..."
npm run build
Write-Host "CI SUITE SUCCESS"
