# BirthdayMessaging Development Startup Script
Write-Host "Starting BirthdayMessaging development environment..." -ForegroundColor Cyan

# Check Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "Docker is running" -ForegroundColor Green

# Start backend
Write-Host "Starting backend..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "backend")
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start backend" -ForegroundColor Red
    Pop-Location
    exit 1
}
Start-Sleep -Seconds 5
Pop-Location
Write-Host "Backend started" -ForegroundColor Green

# Build extension
Write-Host "Building extension..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "extension")
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "Extension built" -ForegroundColor Green

Write-Host ""
Write-Host "All done! Load extension/dist in Chrome" -ForegroundColor Cyan
