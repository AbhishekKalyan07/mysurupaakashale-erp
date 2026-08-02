$ErrorActionPreference = "Stop"

Write-Host "Running type-check..."
npm run type-check

Write-Host "Running lint..."
npm run lint

Write-Host "Running tests..."
npm run test -- --run

Write-Host "Running coverage..."
npm run test:coverage

Write-Host "Running security tests..."
npm run test:security

Write-Host "Running playwright..."
npx playwright test

Write-Host "Running audit..."
npm audit

Write-Host "Running build..."
npm run build

Write-Host "Running LHCI..."
npx lhci autorun

Write-Host "Validation Complete!"
