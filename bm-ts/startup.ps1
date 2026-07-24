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

# Ensure .env exists (required by docker-compose for DB credentials)
$backendDir = Join-Path $PSScriptRoot "backend"
$envFile = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "Created .env from .env.example — review and update secrets before deploying." -ForegroundColor Yellow
    } else {
        Write-Host ".env.example not found. Cannot create .env — docker-compose will fail." -ForegroundColor Red
        exit 1
    }
}

# Start backend (DB + API)
Write-Host "Starting backend..." -ForegroundColor Yellow
Push-Location $backendDir
docker-compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start backend containers" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Wait for backend health endpoint
Write-Host "Waiting for backend to be ready..." -ForegroundColor Yellow
$maxAttempts = 20
$attempt = 0
$ready = $false
while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 2
    $attempt++
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get -ErrorAction Stop
        if ($response.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        Write-Host "  Attempt $attempt/$maxAttempts - not ready yet..." -ForegroundColor Gray
    }
}
if (-not $ready) {
    Write-Host "Backend failed to become healthy after $maxAttempts attempts." -ForegroundColor Red
    Write-Host "Check logs with: docker logs backend-backend-1" -ForegroundColor Yellow
    exit 1
}
Write-Host "Backend is healthy" -ForegroundColor Green

# Build extension
Write-Host "Building extension..." -ForegroundColor Yellow
$extensionDir = Join-Path $PSScriptRoot "extension"
Push-Location $extensionDir

# A fresh checkout does not contain node_modules, so install the locked
# development dependencies (including Vite) before attempting the build.
$viteCommand = Join-Path $extensionDir "node_modules\.bin\vite.cmd"
if (-not (Test-Path $viteCommand)) {
    Write-Host "Installing extension dependencies..." -ForegroundColor Yellow
    npm ci --include=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install extension dependencies" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Extension build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "Extension built" -ForegroundColor Green

Write-Host ""
Write-Host "All done! Load extension/dist in Chrome (chrome://extensions)" -ForegroundColor Cyan
Write-Host "  Backend API: http://localhost:8000" -ForegroundColor Gray
Write-Host "  Health:      http://localhost:8000/health" -ForegroundColor Gray
Write-Host "  DB:          localhost:5432" -ForegroundColor Gray
