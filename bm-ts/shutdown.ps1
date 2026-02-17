# BirthdayMessaging Development Shutdown Script
Write-Host "Shutting down BirthdayMessaging services..." -ForegroundColor Yellow

Push-Location backend
docker-compose down
Pop-Location

Write-Host "All services stopped" -ForegroundColor Green
