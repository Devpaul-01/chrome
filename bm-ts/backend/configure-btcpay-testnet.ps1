param(
    [string]$BackendPath = "C:\Development\BirthdayMessaging\BIRTHDAYMESSAGING-LEGACY\bm-ts\backend",
    [string]$TestnetUrl = "https://testnet.demo.btcpayserver.org"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-PlainSecret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if (-not (Test-Path $BackendPath)) {
    throw "Backend path not found: $BackendPath"
}

Set-Location $BackendPath

$storeId = Read-Host "BTCPay TESTNET Store ID"
$apiKey = Read-PlainSecret "BTCPay TESTNET API key"
$webhookSecret = Read-PlainSecret "BTCPay TESTNET webhook secret"
$publicBaseUrl = Read-Host "Current public BirthdayMessaging base URL (example: https://abc.trycloudflare.com)"

if ([string]::IsNullOrWhiteSpace($storeId)) { throw "Store ID is required." }
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "API key is required." }
if ([string]::IsNullOrWhiteSpace($webhookSecret)) { throw "Webhook secret is required." }
if ([string]::IsNullOrWhiteSpace($publicBaseUrl)) { throw "Public base URL is required." }

$publicBaseUrl = $publicBaseUrl.Trim().TrimEnd("/")

$envFile = Join-Path $BackendPath "btcpay-testnet.local.env"
$override = Join-Path $BackendPath "docker-compose.testnet.override.yml"

@"
BTCPAY_URL=$($TestnetUrl.Trim().TrimEnd("/"))
BTCPAY_STORE_ID=$storeId
BTCPAY_API_KEY=$apiKey
BTCPAY_WEBHOOK_SECRET=$webhookSecret
BTCPAY_TESTNET_PUBLIC_BASE_URL=$publicBaseUrl
BTCPAY_PRICE_MONTHLY=9.70
BTCPAY_PRICE_3_MONTH=27.50
BTCPAY_PRICE_6_MONTH=52.00
BTCPAY_PRICE_YEARLY=97.00
BTCPAY_CURRENCY=USD
APP_ENVIRONMENT=test
"@ | Set-Content $envFile -Encoding UTF8

@"
services:
  backend:
    env_file:
      - .env
      - btcpay-testnet.local.env
    environment:
      BTCPAY_URL: `${BTCPAY_URL}
      BTCPAY_STORE_ID: `${BTCPAY_STORE_ID}
      BTCPAY_API_KEY: `${BTCPAY_API_KEY}
      BTCPAY_WEBHOOK_SECRET: `${BTCPAY_WEBHOOK_SECRET}
      BTCPAY_PRICE_MONTHLY: `${BTCPAY_PRICE_MONTHLY}
      BTCPAY_PRICE_3_MONTH: `${BTCPAY_PRICE_3_MONTH}
      BTCPAY_PRICE_6_MONTH: `${BTCPAY_PRICE_6_MONTH}
      BTCPAY_PRICE_YEARLY: `${BTCPAY_PRICE_YEARLY}
      BTCPAY_CURRENCY: `${BTCPAY_CURRENCY}
      APP_ENVIRONMENT: test
"@ | Set-Content $override -Encoding UTF8

# Keep testnet credentials out of Git even if the repo .gitignore changes.
$gitDir = Join-Path $BackendPath ".git"
if (Test-Path $gitDir) {
    $exclude = Join-Path $gitDir "info\exclude"
    $parent = Split-Path -Parent $exclude
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $existing = if (Test-Path $exclude) { Get-Content $exclude } else { @() }
    foreach ($entry in @("btcpay-testnet.local.env","docker-compose.testnet.override.yml","btcpay-testnet-*.json","btcpay-testnet-*.txt")) {
        if ($existing -notcontains $entry) {
            Add-Content -Path $exclude -Value $entry
        }
    }
}

Write-Host ""
Write-Host "SUCCESS" -ForegroundColor Green
Write-Host "Created local TESTNET configuration:" -ForegroundColor Green
Write-Host "  $envFile"
Write-Host "  $override"
Write-Host ""
Write-Host "These files contain test credentials and should NOT be committed."
Write-Host "Next run: .\start-btcpay-testnet-backend.ps1"
