$ErrorActionPreference = 'Stop'
Write-Host "Running npm ci..."
npm ci
Write-Host "Running type-check..."
npm run type-check
Write-Host "Running lint..."
npm run lint
Write-Host "Running unit tests..."
npm run test
Write-Host "Running coverage..."
npm run test:coverage
Write-Host "Running security tests..."
npx firebase emulators:exec --project demo-test --only firestore,storage "npm run test:security"
Write-Host "Running Playwright..."
npx playwright test --project=chromium
Write-Host "Running build..."
npm run build
Write-Host "CI SUITE SUCCESS"
