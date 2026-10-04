npm run type-check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:unit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:integration
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run audit:bundle
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
