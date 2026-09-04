param(
    [Parameter(Mandatory=$true)][string]$SessionFile,
    [string]$BackendPath = "C:\Development\BirthdayMessaging\BIRTHDAYMESSAGING-LEGACY\bm-ts\backend",
    [int]$TimeoutSeconds = 900
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-PlainSecret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if (-not (Test-Path $SessionFile)) { throw "Session file not found." }
Set-Location $BackendPath
$s = Get-Content $SessionFile -Raw | ConvertFrom-Json

$email = Read-Host "BirthdayMessaging login email"
$password = Read-PlainSecret "BirthdayMessaging password"
$loginBody = @{email=$email;password=$password}|ConvertTo-Json -Compress
$password=$null
$login = Invoke-RestMethod "http://localhost:8000/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -TimeoutSec 30
$token=[string]$login.access_token
$headers=@{Authorization="Bearer $token"}

$statusUrl="http://localhost:8000/api/payments/btcpay/checkouts/$($s.checkout_attempt_id)"
$deadline=(Get-Date).AddSeconds($TimeoutSeconds)
$final=$null

Write-Host ""
Write-Host "Polling BirthdayMessaging checkout status..." -ForegroundColor Cyan
while ((Get-Date) -lt $deadline) {
    try {
        $final=Invoke-RestMethod $statusUrl -Headers $headers -TimeoutSec 15
        Write-Host ("[{0}] checkout={1} payment={2}" -f (Get-Date -Format "HH:mm:ss"),$final.checkout_status,$final.payment_status)
        if ([string]$final.payment_status -match '^(Settled|settled|Complete|complete|Completed|completed|Paid|paid)$') { break }
    } catch {
        Write-Host "Temporary status error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Start-Sleep 5
}
$token=$null

if ($null -eq $final -or -not ([string]$final.payment_status -match '^(Settled|settled|Complete|complete|Completed|completed|Paid|paid)$')) {
    Write-Host ""
    Write-Host "NOT SETTLED YET" -ForegroundColor Yellow
    if ($final) { $final | ConvertTo-Json -Depth 6 }
    exit 2
}

$helper = Join-Path $BackendPath "app\tests\manual_verify_btcpay_testnet_lifecycle.py"
if (-not (Test-Path $helper)) { throw "Verifier helper not installed: $helper" }

$out = docker compose exec -T backend python app/tests/manual_verify_btcpay_testnet_lifecycle.py `
    --payment-id "$($s.payment_id)" `
    --provider-payment-id "$($s.provider_payment_id)" 2>&1

$report=Join-Path $BackendPath ("btcpay-testnet-lifecycle-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
$out | Set-Content $report -Encoding UTF8

$data=($out -join "`n") | ConvertFrom-Json
$problems=@()
if ([int]$data.payment_transaction_count_for_provider_id -ne 1) { $problems += "Expected exactly one payment transaction." }
if ([int]$data.entitlement_count -ne 1) { $problems += "Expected exactly one entitlement." }
if (@($data.payment_webhook_events).Count -lt 1) { $problems += "No matching webhook event found." }

Write-Host ""
if ($problems.Count -eq 0) {
    Write-Host "TESTNET CORE LIFECYCLE ACCEPTANCE PASSED" -ForegroundColor Green
    Write-Host "Settlement, webhook evidence, one payment, and one entitlement are verified." -ForegroundColor Green
} else {
    Write-Host "TESTNET SETTLED, BUT ACCEPTANCE NEEDS ATTENTION" -ForegroundColor Yellow
    $problems | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
}
Write-Host "Report: $report"
