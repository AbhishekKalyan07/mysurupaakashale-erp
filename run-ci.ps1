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
}

function Invoke-Checked {
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "::error::Command failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Run-Stage "Setup & Install" {
    Write-Host "Running: npm ci"
    Invoke-Checked { npm ci }
}

Run-Stage "Code Quality (Type Check & Lint)" {
    Write-Host "Running: npm run type-check"
    Invoke-Checked { npm run type-check }
    
    Write-Host "Running: npm run lint"
    Invoke-Checked { npm run lint }
}

Run-Stage "Unit Tests + Coverage" {
    Write-Host "Running: npm run test"
    Invoke-Checked { npm run test }
    
    Write-Host "Running: npm run test:coverage"
    Invoke-Checked { npm run test:coverage }
}

Run-Stage "Security Tests (Firebase Emulator)" {
    Write-Host "Running: firebase emulators:exec --project demo-security-test --only firestore,storage `"npm run test:security`""
    Invoke-Checked { npx firebase emulators:exec --project demo-security-test --only firestore,storage "npm run test:security" }
}

Run-Stage "E2E Tests (Playwright)" {
    Write-Host "Running: npx playwright install --with-deps chromium"
    Invoke-Checked { npx playwright install --with-deps chromium }
    
    Write-Host "Running: npx playwright test --project=chromium"
    Invoke-Checked { npx playwright test --project=chromium }
}

Run-Stage "Dependency Security Audit" {
    Write-Host "Running: npm audit --omit=dev --audit-level=high"
    Invoke-Checked { npm audit --omit=dev --audit-level=high }
}

Run-Stage "Lighthouse CI" {
    Write-Host "Running: npm run build"
    Invoke-Checked { npm run build }
    
    Write-Host "Running: npx lhci autorun"
    Invoke-Checked { npx lhci autorun }
}

Write-Host "`n========================================================"
Write-Host "ALL CI STAGES COMPLETED SUCCESSFULLY"
Write-Host "========================================================"
