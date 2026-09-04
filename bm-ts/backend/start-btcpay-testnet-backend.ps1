param(
    [string]$BackendPath = "C:\Development\BirthdayMessaging\BIRTHDAYMESSAGING-LEGACY\bm-ts\backend",
    [int]$HealthTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host $Message -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $BackendPath)) { Fail "Backend path not found: $BackendPath" }
Set-Location $BackendPath

$envFile = Join-Path $BackendPath "btcpay-testnet.local.env"
$override = Join-Path $BackendPath "docker-compose.testnet.override.yml"
if (-not (Test-Path $envFile)) { Fail "Run configure-btcpay-testnet.ps1 first." }
if (-not (Test-Path $override)) { Fail "Missing docker-compose.testnet.override.yml." }

$baseCandidates = @("compose.yaml","compose.yml","docker-compose.yaml","docker-compose.yml")
$base = $baseCandidates | Where-Object { Test-Path (Join-Path $BackendPath $_) } | Select-Object -First 1
if (-not $base) { Fail "Could not detect the base Docker Compose file." }

# Load testnet env into this PowerShell process so Compose variable substitution
# in the override file resolves to the TESTNET values.
Get-Content $envFile | ForEach-Object {
    $line = "$_".Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=",2)
        [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
    }
}

Write-Host ""
Write-Host "BirthdayMessaging - Start BTCPay TESTNET Backend" -ForegroundColor Cyan
Write-Host "================================================"
Write-Host "Base compose: $base"
Write-Host ""

& docker compose -f $base -f $override up -d --force-recreate backend
if ($LASTEXITCODE -ne 0) { Fail "Could not recreate backend with testnet override." }

$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
        if ([int]$resp.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    docker compose -f $base -f $override logs --tail 120 backend
    Fail "Backend did not become healthy in TESTNET mode."
}

$actualUrl = (docker compose -f $base -f $override exec -T backend printenv BTCPAY_URL | Out-String).Trim()
if ($actualUrl -notmatch "testnet") {
    Fail "Backend is healthy, but BTCPAY_URL does not look like Testnet: $actualUrl"
}

Write-Host ""
Write-Host "SUCCESS" -ForegroundColor Green
Write-Host "BirthdayMessaging backend is now running against:" -ForegroundColor Green
Write-Host "  $actualUrl"
Write-Host ""
Write-Host "Do not use this backend for production payments until restore-production-backend.ps1 is run."
