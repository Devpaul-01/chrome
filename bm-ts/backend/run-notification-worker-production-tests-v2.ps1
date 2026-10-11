<#
BirthdayMessaging - Notification Worker PostgreSQL Production Test Runner v2

This runner:
- uses exit codes rather than stderr text to determine command success;
- safely recreates a disposable PostgreSQL test database;
- applies Alembic migrations to that database;
- runs the real PostgreSQL worker concurrency tests;
- runs the full backend regression suite;
- cleans up the isolated database in a finally block;
- leaves concise console output and detailed result files.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Get-Location).Path
$Results = Join-Path $Root "notification-worker-production-results-v2.txt"
$Regression = Join-Path $Root "notification-worker-full-regression-v2.txt"
$RunnerLog = Join-Path $Root "notification-worker-production-runner-v2.txt"
$TestDb = "birthdaymessaging_notification_test"
$CreatedTestDb = $false

"" | Set-Content -Path $RunnerLog -Encoding UTF8

function Log([string]$Text) {
    Add-Content -Path $RunnerLog -Value $Text
}

function Invoke-Native {
    param(
        [Parameter(Mandatory=$true)][string]$Command,
        [Parameter(Mandatory=$true)][string]$Description,
        [string]$OutputFile = ""
    )

    Log ""
    Log ">>> $Description"
    Log "CMD: $Command"

    # cmd.exe merges stderr into stdout before PowerShell sees it. PostgreSQL NOTICE
    # and Alembic INFO messages therefore remain diagnostics, not PowerShell errors.
    $output = & cmd.exe /d /s /c "$Command 2>&1"
    $exitCode = $LASTEXITCODE

    if ($null -ne $output) {
        $output | ForEach-Object {
            Log "$_"
            if (-not [string]::IsNullOrWhiteSpace($OutputFile)) {
                Add-Content -Path $OutputFile -Value "$_"
            }
        }
    }

    if ($exitCode -ne 0) {
        throw "$Description failed with exit code $exitCode."
    }

    return ,$output
}

function Cleanup-TestDatabase {
    Write-Host "[cleanup] Removing isolated PostgreSQL database..." -ForegroundColor DarkGray
    try {
        Invoke-Native `
            "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TestDb' AND pid <> pg_backend_pid();`"" `
            "Terminate isolated database sessions" | Out-Null

        Invoke-Native `
            "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"DROP DATABASE IF EXISTS $TestDb;`"" `
            "Drop isolated database" | Out-Null
    }
    catch {
        Log "CLEANUP WARNING: $($_.Exception.Message)"
        Write-Host "Cleanup warning: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

try {
    Write-Host ""
    Write-Host "BirthdayMessaging - Notification Worker PostgreSQL Production Tests v2" -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "Detailed runner log: $RunnerLog" -ForegroundColor DarkGray

    Write-Host "[1/7] Checking Docker services..."
    Invoke-Native "docker compose ps" "Docker service check" | Out-Null

    Write-Host "[2/7] Recreating isolated PostgreSQL database: $TestDb"
    # The first two commands are deliberately safe when the DB does not exist.
    Invoke-Native `
        "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TestDb' AND pid <> pg_backend_pid();`"" `
        "Terminate existing test database sessions" | Out-Null

    Invoke-Native `
        "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"DROP DATABASE IF EXISTS $TestDb;`"" `
        "Drop old isolated database if present" | Out-Null

    Invoke-Native `
        "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"CREATE DATABASE $TestDb;`"" `
        "Create isolated database" | Out-Null
    $CreatedTestDb = $true

    Write-Host "[3/7] Building isolated DATABASE_URL..."
    $baseOutput = Invoke-Native `
        "docker compose exec -T backend printenv DATABASE_URL" `
        "Read backend DATABASE_URL"

    $BaseUrl = (($baseOutput | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") }) -join "").Trim()
    if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
        throw "DATABASE_URL was not available inside the backend container."
    }

    $Uri = [System.Uri]($BaseUrl -replace '^postgresql\+asyncpg://','postgresql://')
    $UserInfo = $Uri.UserInfo
    $HostPart = $Uri.Host
    $PortPart = $Uri.Port
    $QueryPart = $Uri.Query

    if ($PortPart -gt 0) {
        $Authority = "$UserInfo@$HostPart`:$PortPart"
    } else {
        $Authority = "$UserInfo@$HostPart"
    }

    $IsolatedUrl = "postgresql+asyncpg://$Authority/$TestDb$QueryPart"
    Log "Isolated database name: $TestDb"
    Write-Host "Using isolated database: $TestDb"

    Write-Host "[4/7] Applying Alembic migrations..."
    Invoke-Native `
        "docker compose exec -T -e DATABASE_URL=`"$IsolatedUrl`" backend alembic upgrade head" `
        "Alembic migration to isolated database" | Out-Null

    Write-Host "[5/7] Running real PostgreSQL worker concurrency tests..."
    "" | Set-Content -Path $Results -Encoding UTF8
    Invoke-Native `
        "docker compose exec -T -e CONCURRENCY_DATABASE_URL=`"$IsolatedUrl`" backend pytest app/tests/test_postgres_notification_worker_concurrency.py -v" `
        "Notification worker PostgreSQL concurrency tests" `
        $Results | Out-Null

    Write-Host "[6/7] Running full backend regression suite..."
    "" | Set-Content -Path $Regression -Encoding UTF8
    Invoke-Native `
        "docker compose exec -T backend pytest app/tests -q" `
        "Full backend regression suite" `
        $Regression | Out-Null

    Write-Host "[7/7] Finalizing..."
    Write-Host ""
    Write-Host "SUCCESS" -ForegroundColor Green
    Write-Host "Notification worker PostgreSQL concurrency and full regression suites passed." -ForegroundColor Green
    Write-Host "Concurrency results: $Results"
    Write-Host "Regression results:  $Regression"
    Write-Host "Runner log:          $RunnerLog"
    exit 0
}
catch {
    Log ""
    Log "RESULT: FAIL"
    Log $_.Exception.Message

    Write-Host ""
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Runner log: $RunnerLog" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "--- Last 40 runner log lines ---" -ForegroundColor DarkGray
    Get-Content -Path $RunnerLog -Tail 40
    exit 1
}
finally {
    if ($CreatedTestDb) {
        Cleanup-TestDatabase
    }
}
