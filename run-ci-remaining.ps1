$ErrorActionPreference = "Continue"

$env:CI = "true"
$env:JAVA_TOOL_OPTIONS = "-Xms128m -Xmx512m -XX:MaxMetaspaceSize=128m"
$env:NODE_OPTIONS = "--max-old-space-size=4096"
$env:VITE_USE_FIREBASE_EMULATORS = "true"
$env:VITE_FIREBASE_API_KEY = "mock-api-key"
$env:VITE_FIREBASE_AUTH_DOMAIN = "mock-auth-domain"
$env:VITE_FIREBASE_PROJECT_ID = "demo-test"
$env:VITE_FIREBASE_STORAGE_BUCKET = "mock-storage-bucket"
$env:VITE_FIREBASE_MESSAGING_SENDER_ID = "mock-messaging-sender-id"
$env:VITE_FIREBASE_APP_ID = "mock-app-id"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199"

function Run-Stage {
    param(
        [string]$Name,
        [scriptblock]$Script
    )
    Write-Host "`n========================================================"
    Write-Host "STAGE: $Name"
    Write-Host "========================================================"
    & $Script
    if ($LASTEXITCODE -ne 0) {
        Write-Host "::error::Stage '$Name' failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Run-Stage "Code Quality (Type Check & Lint)" {
    Write-Host "Running: npm run type-check"
    npm run type-check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    
    Write-Host "Running: npm run lint"
    npm run lint
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Run-Stage "Unit Tests + Coverage" {
    Write-Host "Running: npm run test"
    npm run test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    
    Write-Host "Running: npm run test:coverage"
    npm run test:coverage
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Run-Stage "Security Tests (Firebase Emulator)" {
    $env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
    Write-Host "Running: npm --prefix functions run build"
    npm --prefix functions run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Running: firebase emulators:exec --project demo-test --only firestore,storage,functions `"npm run test:security`""
    npx firebase emulators:exec --project demo-test --only firestore,storage,functions "npm run test:security"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Run-Stage "E2E Tests (Playwright)" {
    Write-Host "Running: npx playwright install --with-deps chromium"
    npx playwright install --with-deps chromium
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    
    Write-Host "Running: npx playwright test --project=chromium"
    npx playwright test --project=chromium
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Run-Stage "Dependency Security Audit" {
    Write-Host "Running: npm audit --omit=dev --audit-level=high"
    npm audit --omit=dev --audit-level=high
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Run-Stage "Lighthouse CI" {
    Write-Host "Running: npm run build"
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    
    Write-Host "Running: npx lhci autorun"
    npx lhci autorun
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`n========================================================"
Write-Host "ALL CI STAGES COMPLETED SUCCESSFULLY"
Write-Host "========================================================"
