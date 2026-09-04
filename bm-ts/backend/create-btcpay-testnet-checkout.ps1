param(
    [ValidateSet("monthly","yearly")]
    [string]$PlanCode = "monthly",
    [string]$BackendPath = "C:\Development\BirthdayMessaging\BIRTHDAYMESSAGING-LEGACY\bm-ts\backend"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-PlainSecret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if (-not (Test-Path $BackendPath)) { throw "Backend path not found." }
Set-Location $BackendPath

$email = Read-Host "BirthdayMessaging login email"
$password = Read-PlainSecret "BirthdayMessaging password"

$loginBody = @{ email=$email; password=$password } | ConvertTo-Json -Compress
$password = $null

try {
    $login = Invoke-RestMethod "http://localhost:8000/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -TimeoutSec 30
} catch {
    throw "BirthdayMessaging login failed: $($_.Exception.Message)"
}

$token = [string]$login.access_token
if (-not $token) { throw "No access_token returned." }

$headers = @{
    Authorization = "Bearer $token"
    "Idempotency-Key" = [guid]::NewGuid().ToString()
    "Content-Type" = "application/json"
}

$body = @{ plan_code=$PlanCode } | ConvertTo-Json -Compress

try {
    $checkout = Invoke-RestMethod "http://localhost:8000/api/payments/btcpay/checkout" -Method Post -Headers $headers -Body $body -TimeoutSec 45
} catch {
    throw "TESTNET checkout creation failed: $($_.Exception.Message)"
}

$token = $null
$headers.Remove("Authorization")

$session = [ordered]@{
    created_at=(Get-Date).ToString("o")
    plan_code=$checkout.plan_code
    amount=$checkout.amount
    currency=$checkout.currency
    checkout_attempt_id=$checkout.checkout_attempt_id
    payment_id=$checkout.payment_id
    provider_payment_id=$checkout.provider_payment_id
    provider_order_id=$checkout.provider_order_id
    checkout_url=$checkout.checkout_url
}

$file = Join-Path $BackendPath ("btcpay-testnet-session-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
$session | ConvertTo-Json -Depth 5 | Set-Content $file -Encoding UTF8

Write-Host ""
Write-Host "TESTNET CHECKOUT CREATED" -ForegroundColor Green
Write-Host "Plan: $($session.plan_code)"
Write-Host "Amount: $($session.amount) $($session.currency)"
Write-Host "Checkout: $($session.checkout_url)"
Write-Host "Session: $file"
Write-Host ""
Write-Host "Pay this invoice using TESTNET BTC only."
Start-Process $session.checkout_url
