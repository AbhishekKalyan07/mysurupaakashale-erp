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

Write-Host "Running security tests with correct project id..."
Invoke-Checked { npx firebase emulators:exec --project demo-security-test --only firestore,storage "npm run test:security" }
Write-Host "Running Playwright..."
Invoke-Checked { npx playwright test --project=chromium }
Write-Host "Running build..."
Invoke-Checked { npm run build }
Write-Host "CI SUITE SUCCESS"
