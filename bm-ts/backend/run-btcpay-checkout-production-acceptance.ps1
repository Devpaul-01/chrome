<#
BirthdayMessaging - BTCPay Checkout PostgreSQL + HTTP Acceptance Runner

Creates a disposable PostgreSQL database, migrates it to head, runs the checkout
concurrency/HTTP acceptance suite, runs payment regressions, then removes the
disposable database. Detailed output is written to files.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Get-Location).Path
$TestDb = "birthdaymessaging_btcpay_checkout_test"
$Log = Join-Path $Root "btcpay-checkout-production-acceptance.txt"
$Regression = Join-Path $Root "btcpay-checkout-full-regression.txt"
$Created = $false

"" | Set-Content $Log -Encoding UTF8
"" | Set-Content $Regression -Encoding UTF8

function Add-Log([string]$Text) {
    Add-Content -Path $Log -Value $Text
}

function Invoke-Native {
    param(
        [Parameter(Mandatory=$true)][string]$Command,
        [Parameter(Mandatory=$true)][string]$Description,
        [string]$OutputFile = ""
    )

    Add-Log ""
    Add-Log ">>> $Description"
    Add-Log "CMD: $Command"

    $output = & cmd.exe /d /s /c "$Command 2>&1"
    $exit = $LASTEXITCODE

    if ($null -ne $output) {
        $output | ForEach-Object {
            Add-Log "$_"
            if ($OutputFile) {
                Add-Content -Path $OutputFile -Value "$_"
            }
        }
    }

    if ($exit -ne 0) {
        throw "$Description failed with exit code $exit."
    }

    return ,$output
}

function Cleanup {
    if (-not $Created) { return }

    Write-Host "[cleanup] Removing isolated PostgreSQL database..." -ForegroundColor DarkGray
    try {
        Invoke-Native `
            "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TestDb' AND pid <> pg_backend_pid();`"" `
            "Terminate isolated checkout DB sessions" | Out-Null

        Invoke-Native `
            "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"DROP DATABASE IF EXISTS $TestDb;`"" `
            "Drop isolated checkout DB" | Out-Null
    }
    catch {
        Add-Log "CLEANUP WARNING: $($_.Exception.Message)"
    }
}

try {
    Write-Host ""
    Write-Host "BirthdayMessaging - BTCPay Checkout Production Acceptance" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Full output: $Log" -ForegroundColor DarkGray

    Write-Host "[1/8] Checking Docker services..."
    Invoke-Native "docker compose ps" "Docker services" | Out-Null

    Write-Host "[2/8] Verifying primary Alembic state..."
    $current = Invoke-Native "docker compose exec -T backend alembic current" "Alembic current"
    if (($current -join "`n") -notmatch "\(head\)") {
        throw "Primary database is not at Alembic head."
    }

    Write-Host "[3/8] Recreating isolated PostgreSQL database..."
    Invoke-Native `
        "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TestDb' AND pid <> pg_backend_pid();`"" `
        "Terminate stale isolated DB sessions" | Out-Null
    Invoke-Native `
        "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"DROP DATABASE IF EXISTS $TestDb;`"" `
        "Drop stale isolated DB" | Out-Null
    Invoke-Native `
        "docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `"CREATE DATABASE $TestDb;`"" `
        "Create isolated DB" | Out-Null
    $Created = $true

    Write-Host "[4/8] Building isolated DATABASE_URL..."
    $baseOutput = Invoke-Native `
        "docker compose exec -T backend printenv DATABASE_URL" `
        "Read backend DATABASE_URL"
    $BaseUrl = (($baseOutput | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") }) -join "").Trim()
    if (-not $BaseUrl) {
        throw "DATABASE_URL is not available inside the backend container."
    }

    $Uri = [System.Uri]($BaseUrl -replace '^postgresql\+asyncpg://','postgresql://')
    $UserInfo = $Uri.UserInfo
    $HostPart = $Uri.Host
    $PortPart = $Uri.Port
    $QueryPart = $Uri.Query

    if ($PortPart -gt 0) {
        $Authority = "$UserInfo@$HostPart`:$PortPart"
    }
    else {
        $Authority = "$UserInfo@$HostPart"
    }

    $IsolatedUrl = "postgresql+asyncpg://$Authority/$TestDb$QueryPart"
    Add-Log "Isolated database: $TestDb"

    Write-Host "[5/8] Applying Alembic migrations to isolated database..."
    Invoke-Native `
        "docker compose exec -T -e DATABASE_URL=`"$IsolatedUrl`" backend alembic upgrade head" `
        "Migrate isolated checkout DB" | Out-Null

    Write-Host "[6/8] Running real PostgreSQL checkout concurrency + HTTP tests..."
    Invoke-Native `
        "docker compose exec -T -e CONCURRENCY_DATABASE_URL=`"$IsolatedUrl`" backend pytest app/tests/test_postgres_btcpay_checkout_acceptance.py -v" `
        "Checkout PostgreSQL/HTTP acceptance" | Out-Null

    Write-Host "[7/8] Running payment/authorization regression..."
    Invoke-Native `
        "docker compose exec -T backend pytest app/tests/test_payment_plans.py app/tests/test_btcpay_checkout_foundation.py app/tests/test_btcpay_webhook.py app/tests/test_entitlement_access.py app/tests/test_paid_feature_authorization.py app/tests/test_http_entitlement_authorization.py -q" `
        "Payment and authorization regression" | Out-Null

    Write-Host "[8/8] Running complete backend regression..."
    Invoke-Native `
        "docker compose exec -T backend pytest app/tests -q" `
        "Complete backend regression" `
        $Regression | Out-Null

    Add-Log ""
    Add-Log "RESULT: PASS"

    Write-Host ""
    Write-Host "SUCCESS" -ForegroundColor Green
    Write-Host "BTCPay checkout PostgreSQL + HTTP production acceptance passed." -ForegroundColor Green
    Write-Host "Results:    $Log"
    Write-Host "Regression: $Regression"
    exit 0
}
catch {
    Add-Log ""
    Add-Log "RESULT: FAIL"
    Add-Log $_.Exception.Message

    Write-Host ""
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Results: $Log" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "--- Last 60 log lines ---" -ForegroundColor DarkGray
    Get-Content $Log -Tail 60
    exit 1
}
finally {
    Cleanup
}
