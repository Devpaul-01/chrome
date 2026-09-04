param(
    [string]$BackendPath = "C:\Development\BirthdayMessaging\BIRTHDAYMESSAGING-LEGACY\bm-ts\backend"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackendPath)) { throw "Backend path not found." }
Set-Location $BackendPath

$envFile = Join-Path $BackendPath "btcpay-testnet.local.env"
if (-not (Test-Path $envFile)) { throw "Missing btcpay-testnet.local.env." }

$config = @{}
Get-Content $envFile | ForEach-Object {
    $line = "$_".Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $p = $line.Split("=",2)
        $config[$p[0]] = $p[1]
    }
}

$url = $config["BTCPAY_URL"].TrimEnd("/")
$store = $config["BTCPAY_STORE_ID"]
$key = $config["BTCPAY_API_KEY"]
$public = $config["BTCPAY_TESTNET_PUBLIC_BASE_URL"].TrimEnd("/")
$webhook = "$public/api/payments/btcpay/webhook"

$report = Join-Path $BackendPath "btcpay-testnet-preflight.txt"
"" | Set-Content $report -Encoding UTF8

function Result($status,$name,$detail) {
    $line = "[$status] $name - $detail"
    Write-Host $line
    Add-Content $report $line
}

try {
    $r = Invoke-WebRequest "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { Result "PASS" "local.health" "HTTP 200" }
    else { Result "FAIL" "local.health" "HTTP $($r.StatusCode)" }
} catch { Result "FAIL" "local.health" $_.Exception.Message }

try {
    $r = Invoke-WebRequest "$public/health" -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -eq 200) { Result "PASS" "public.health" "HTTP 200" }
    else { Result "FAIL" "public.health" "HTTP $($r.StatusCode)" }
} catch { Result "FAIL" "public.health" $_.Exception.Message }

$headers = @{ Authorization = "token $key"; Accept = "application/json" }

try {
    $storeResp = Invoke-WebRequest "$url/api/v1/stores/$store" -Headers $headers -UseBasicParsing -TimeoutSec 20
    if ($storeResp.StatusCode -eq 200) { Result "PASS" "btcpay.testnet.store" "Authenticated store request succeeded." }
    else { Result "FAIL" "btcpay.testnet.store" "HTTP $($storeResp.StatusCode)" }
} catch { Result "FAIL" "btcpay.testnet.store" $_.Exception.Message }

try {
    $hooksResp = Invoke-WebRequest "$url/api/v1/stores/$store/webhooks" -Headers $headers -UseBasicParsing -TimeoutSec 20
    if ($hooksResp.StatusCode -eq 200) {
        $hooks = $hooksResp.Content | ConvertFrom-Json
        $matches = @($hooks | Where-Object { $_.url -eq $webhook })
        if ($matches.Count -gt 0) {
            Result "PASS" "btcpay.testnet.webhook" "Registered webhook matches $webhook"
        } else {
            Result "FAIL" "btcpay.testnet.webhook" "No registered webhook matches $webhook"
        }
    }
} catch {
    Result "WARN" "btcpay.testnet.webhook" "Could not list webhooks. Confirm manually in Store Settings > Webhooks. $($_.Exception.Message)"
}

try {
    Invoke-WebRequest "$public/api/payments/btcpay/webhook" -UseBasicParsing -TimeoutSec 15 | Out-Null
    Result "PASS" "public.webhook.route" "Webhook path responded."
} catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -in @(400,401,403,405,422)) {
        Result "PASS" "public.webhook.route" "Application route reached (HTTP $code)."
    } else {
        Result "FAIL" "public.webhook.route" "Webhook route not reachable. $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Report: $report"
