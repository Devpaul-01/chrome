# BirthdayMessaging Development Shutdown Script
Write-Host "Shutting down BirthdayMessaging services..." -ForegroundColor Yellow

Push-Location (Join-Path $PSScriptRoot "backend")
docker-compose down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: docker-compose down reported an error" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "All services stopped" -ForegroundColor Green
