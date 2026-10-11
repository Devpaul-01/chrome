<#
BirthdayMessaging - Notification Production Acceptance Runner v4

Fix in v4:
- nested PowerShell scripts are launched with the exact Windows PowerShell executable
  from $PSHOME instead of relying on PATH or cmd.exe finding "powershell.exe".
- stdout/stderr from nested runners is redirected to temporary files and appended
  to the main acceptance log.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Backend = (Get-Location).Path
$Log = Join-Path $Backend "notification-production-acceptance-v4.txt"
$WorkerRunner = Join-Path $Backend "run-notification-worker-production-tests-v2.ps1"
$PowerShellExe = Join-Path $PSHOME "powershell.exe"

"" | Set-Content -Path $Log -Encoding UTF8

function Stage([int]$N, [string]$Text) {
    $line = "[$N/9] $Text"
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Add-Content -Path $Log -Value ""
    Add-Content -Path $Log -Value $line
}

function Invoke-Native {
    param(
        [Parameter(Mandatory=$true)][string]$Command,
        [Parameter(Mandatory=$true)][string]$Description
    )

    Add-Content -Path $Log -Value ""
    Add-Content -Path $Log -Value ">>> $Description"
    Add-Content -Path $Log -Value "CMD: $Command"

    $output = & cmd.exe /d /s /c "$Command 2>&1"
    $exitCode = $LASTEXITCODE

    if ($null -ne $output) {
        $output | ForEach-Object { Add-Content -Path $Log -Value "$_" }
    }

    if ($exitCode -ne 0) {
        throw "$Description failed with exit code $exitCode."
    }

    return ,$output
}

function Invoke-Runner {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$Description
    )

    if (-not (Test-Path $Path)) {
        throw "$Description was not found: $Path"
    }

    if (-not (Test-Path $PowerShellExe)) {
        throw "Windows PowerShell executable was not found at: $PowerShellExe"
    }

    Add-Content -Path $Log -Value ""
    Add-Content -Path $Log -Value ">>> $Description"
    Add-Content -Path $Log -Value "SCRIPT: $Path"
    Add-Content -Path $Log -Value "POWERSHELL: $PowerShellExe"

    $stdout = Join-Path $env:TEMP ("bm-runner-stdout-" + [guid]::NewGuid().ToString("N") + ".txt")
    $stderr = Join-Path $env:TEMP ("bm-runner-stderr-" + [guid]::NewGuid().ToString("N") + ".txt")

    try {
        $proc = Start-Process `
            -FilePath $PowerShellExe `
            -ArgumentList @(
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", "`"$Path`""
            ) `
            -WorkingDirectory $Backend `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -Wait `
            -PassThru

        if (Test-Path $stdout) {
            Get-Content $stdout | ForEach-Object { Add-Content -Path $Log -Value "$_" }
        }

        if (Test-Path $stderr) {
            Get-Content $stderr | ForEach-Object { Add-Content -Path $Log -Value "$_" }
        }

        if ($proc.ExitCode -ne 0) {
            throw "$Description failed with exit code $($proc.ExitCode)."
        }
    }
    finally {
        Remove-Item $stdout,$stderr -Force -ErrorAction SilentlyContinue
    }
}

try {
    Write-Host ""
    Write-Host "BirthdayMessaging - Notification Production Acceptance v4" -ForegroundColor Cyan
    Write-Host "===========================================================" -ForegroundColor Cyan
    Write-Host "Full output: $Log" -ForegroundColor DarkGray

    Stage 1 "Validating backend project"
    foreach ($required in @("app", "alembic.ini", "docker-compose.yml")) {
        if (-not (Test-Path (Join-Path $Backend $required))) {
            throw "Missing required backend path: $required"
        }
    }
    Add-Content -Path $Log -Value "Project validation: PASS"
    Add-Content -Path $Log -Value "PowerShell executable: $PowerShellExe"

    Stage 2 "Checking Docker services"
    Invoke-Native "docker compose ps" "Docker service check" | Out-Null

    Stage 3 "Verifying Alembic migration state"
    $migration = Invoke-Native "docker compose exec -T backend alembic current" "Alembic current"
    if (($migration -join "`n") -notmatch "\(head\)") {
        throw "Primary database is not reported at Alembic head."
    }

    Stage 4 "Running focused notification lifecycle + production-hardening tests"
    Invoke-Native `
        "docker compose exec -T backend pytest app/tests/test_notification_lifecycle.py app/tests/test_notification_production_hardening.py -q" `
        "Focused notification tests" | Out-Null

    Stage 5 "Running real PostgreSQL worker concurrency/production suite"
    Invoke-Runner $WorkerRunner "Notification worker PostgreSQL production runner v2"

    Stage 6 "Running HTTP entitlement authorization tests"
    if (Test-Path (Join-Path $Backend "app\tests\test_http_entitlement_authorization.py")) {
        Invoke-Native `
            "docker compose exec -T backend pytest app/tests/test_http_entitlement_authorization.py -q" `
            "HTTP entitlement authorization tests" | Out-Null
    }
    else {
        Add-Content -Path $Log -Value "SKIP: HTTP entitlement authorization test file not present."
    }

    Stage 7 "Running BTCPay payment/webhook tests"
    if (Test-Path (Join-Path $Backend "app\tests\test_btcpay_webhook.py")) {
        Invoke-Native `
            "docker compose exec -T backend pytest app/tests/test_btcpay_webhook.py -q" `
            "BTCPay webhook tests" | Out-Null
    }
    else {
        Add-Content -Path $Log -Value "SKIP: BTCPay webhook test file not present."
    }

    Stage 8 "Running complete backend regression suite"
    Invoke-Native `
        "docker compose exec -T backend pytest app/tests -q" `
        "Complete backend regression suite" | Out-Null

    Stage 9 "Final production acceptance"
    Add-Content -Path $Log -Value ""
    Add-Content -Path $Log -Value "RESULT: PASS"
    Add-Content -Path $Log -Value "Notification production acceptance completed successfully."

    Write-Host ""
    Write-Host "SUCCESS" -ForegroundColor Green
    Write-Host "Notification production acceptance passed." -ForegroundColor Green
    Write-Host "Results: $Log" -ForegroundColor Cyan
    exit 0
}
catch {
    Add-Content -Path $Log -Value ""
    Add-Content -Path $Log -Value "RESULT: FAIL"
    Add-Content -Path $Log -Value $_.Exception.Message

    Write-Host ""
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Results: $Log" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "--- Last 60 log lines ---" -ForegroundColor DarkGray
    Get-Content -Path $Log -Tail 60
    exit 1
}
