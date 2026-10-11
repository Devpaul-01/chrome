param(
    [string]$TestDb = "birthdaymessaging_concurrency_test"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "BirthdayMessaging PostgreSQL concurrency test runner"
Write-Host "===================================================="
Write-Host ""

if ($TestDb -notmatch "test") {
    throw "Safety stop: the database name must contain 'test'."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$testFile = ".\app\tests\test_postgres_entitlement_concurrency.py"
if (-not (Test-Path $testFile)) {
    throw "Missing $testFile. Extract the package into bm-ts\backend first."
}

Write-Host "[1/7] Checking Docker services..."
docker compose ps | Out-Host

Write-Host ""
Write-Host "[2/7] Recreating isolated PostgreSQL database: $TestDb"

# Terminate any stale sessions before dropping the disposable database.
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TestDb' AND pid <> pg_backend_pid();" | Out-Host

docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
    "DROP DATABASE IF EXISTS $TestDb;" | Out-Host

docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
    "CREATE DATABASE $TestDb;" | Out-Host

Write-Host ""
Write-Host "[3/7] Discovering backend DATABASE_URL..."
$currentUrl = docker compose exec -T backend python -c "from app.core.config import settings; print(settings.database_url)"
$currentUrl = ($currentUrl | Select-Object -Last 1).Trim()

if (-not $currentUrl) {
    throw "Could not discover backend database URL."
}

# Replace only the database-name portion of the URL.
$testUrl = $currentUrl -replace '/[^/?]+(\?.*)?$', "/$TestDb`$1"

# SQLAlchemy async PostgreSQL driver is required for the concurrency pytest file.
if ($testUrl -match '^postgresql://') {
    $testUrl = $testUrl -replace '^postgresql://', 'postgresql+asyncpg://'
}

Write-Host "Using isolated URL ending in: /$TestDb"

Write-Host ""
Write-Host "[4/7] Applying Alembic migrations to isolated database..."
docker compose exec -T `
    -e "DATABASE_URL=$testUrl" `
    backend alembic upgrade head | Out-Host

Write-Host ""
Write-Host "[5/7] Running real PostgreSQL concurrency tests..."
docker compose exec -T `
    -e "CONCURRENCY_DATABASE_URL=$testUrl" `
    backend pytest app/tests/test_postgres_entitlement_concurrency.py -v | `
    Tee-Object -FilePath ".\postgres-concurrency-results.txt"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Concurrency tests FAILED. The isolated DB is being left in place for diagnosis."
    Write-Host "Results: $root\postgres-concurrency-results.txt"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[6/7] Running normal regression suite..."
docker compose exec -T backend pytest app/tests -q | `
    Tee-Object -FilePath ".\full-regression-after-concurrency.txt"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Regression suite FAILED. The isolated DB is being left in place for diagnosis."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[7/7] Removing isolated test database..."
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TestDb' AND pid <> pg_backend_pid();" | Out-Host

docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
    "DROP DATABASE IF EXISTS $TestDb;" | Out-Host

Write-Host ""
Write-Host "SUCCESS"
Write-Host "Concurrency results: $root\postgres-concurrency-results.txt"
Write-Host "Regression results:  $root\full-regression-after-concurrency.txt"
Write-Host ""
Write-Host "Review postgres-concurrency-results.txt and full-regression-after-concurrency.txt."
