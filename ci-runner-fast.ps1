$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([scriptblock]$Command)
    & $Command
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        [Console]::Error.WriteLine("Command failed with exit code $exitCode")
        exit $exitCode
    }
}

Write-Host "Skipping npm ci to avoid memory/hang issues..."
Write-Host "Running type-check..."
Invoke-Checked { npm run type-check }
Write-Host "Running lint..."
Invoke-Checked { npm run lint }
Write-Host "Running unit tests..."
Invoke-Checked { npm run test }
Write-Host "Running coverage..."
Invoke-Checked { npm run test:coverage }
Write-Host "Running security tests..."
Invoke-Checked { npx firebase emulators:exec --project demo-test --only firestore,storage "npm run test:security" }
Write-Host "Running Playwright..."
Invoke-Checked { npx playwright test --project=chromium }
Write-Host "Running build..."
Invoke-Checked { npm run build }
Write-Host "CI SUITE SUCCESS"
