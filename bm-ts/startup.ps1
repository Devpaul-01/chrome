param([ValidateSet('Audit','Extension','FullStack')][string]$Mode='Audit',[switch]$LaunchChrome)
$ErrorActionPreference='Stop'
$base=$PSScriptRoot
$ext=Join-Path $base 'extension'
$project='bmdev'+(($env:USERNAME -replace '[^a-zA-Z0-9]','').ToLower())
$envFile=Join-Path $env:LOCALAPPDATA ('BirthdayMessaging\QASecrets\'+$project+'.env')
$compose=Join-Path $base 'docker-compose.dev.yml'
function Require([string]$name) {if(-not (Get-Command $name -ErrorAction SilentlyContinue)){throw "Missing prerequisite $name; install with approval and rerun."}}
function CheckApi([int]$port){try {return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$port/health").StatusCode -eq 200}catch{return $false}}
Require 'git.exe';Require 'node.exe';Require 'npm.cmd'
if(-not (Test-Path (Join-Path $ext 'package-lock.json'))){throw 'Missing extension package-lock.json'}
if($Mode -eq 'Audit'){Write-Host 'AUDIT_PASS: Git, Node and npm found; no services changed';exit 0}
if($Mode -eq 'FullStack'){
 Require 'docker.exe'
 if(-not (Test-Path $compose)){throw 'Development Compose file missing'}
 $bootstrap=Join-Path $base 'Initialize-BMDevSecrets.ps1'
 if(-not (Test-Path $bootstrap)){throw 'Secret bootstrap helper missing'}
 & $bootstrap -EnvironmentFile $envFile
 if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'Secret bootstrap failed'}
 $dockerReady=$false
 try {& docker.exe info --format '{{.ServerVersion}}' 2>$null | Out-Null;$dockerReady=($LASTEXITCODE -eq 0)}catch{}
 if(-not $dockerReady){
  $desktop=Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if(-not (Test-Path $desktop)){throw 'Docker Desktop missing; install with approval'}
  if((Read-Host 'Docker is stopped. Launch Docker Desktop? Type YES') -cne 'YES'){throw 'Docker launch declined'}
  Start-Process -FilePath $desktop
  for($i=0;$i -lt 36;$i++){Start-Sleep -Seconds 5;try{& docker.exe info --format '{{.ServerVersion}}' 2>$null | Out-Null;if($LASTEXITCODE -eq 0){$dockerReady=$true;break}}catch{}}
  if(-not $dockerReady){throw 'Docker engine not ready within 180 seconds'}
 }
 $envMap=@{};foreach($line in [IO.File]::ReadAllLines($envFile)){if($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$'){$envMap[$matches[1]]=$matches[2]}}
 $port=[int]$envMap['BM_DEV_API_PORT']
 if($port -lt 1024 -or $port -gt 65535){throw 'Invalid local API port'}
 if($envMap['STRIPE_ENABLED'] -ne 'false' -or $envMap['BM_DEPLOYMENT_ENV'] -ne 'isolated_development'){throw 'Unsafe Stripe/deployment configuration'}
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose config --quiet
 if($LASTEXITCODE -ne 0){throw 'Compose validation failed'}
 $existing=(& docker.exe ps --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=backend" --format '{{.ID}}' 2>$null)
 if($LASTEXITCODE -ne 0){throw 'Docker project inspection failed'}
 $existing=@($existing | Where-Object {$_ -match '\S'})
 if((CheckApi $port) -and $existing.Count -eq 0){throw 'API port serves an unrelated process; refusing false-positive health'}
 if($existing.Count -gt 1){throw 'Multiple backend containers found in isolated project'}
 if($existing.Count -eq 1){
  $published=@(& docker.exe port $existing[0] '8000/tcp' 2>$null)
  if($LASTEXITCODE -ne 0 -or -not (@($published) -match "127\.0\.0\.1:$port$")){throw 'Backend container does not own the configured API port'}
 }
 if(-not (CheckApi $port)){
  if((Read-Host "Start isolated $project database and backend (workers excluded)? Type START") -cne 'START'){throw 'Container startup declined'}
  & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose up -d --build db backend
  if($LASTEXITCODE -ne 0){throw 'Docker Compose startup failed'}
  $healthy=$false
  for($i=0;$i -lt 30;$i++){if(CheckApi $port){$healthy=$true;break};Start-Sleep -Seconds 4}
  if(-not $healthy){throw 'Backend health failed; isolated containers preserved'}
 }
 $dbId=@(& docker.exe ps --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=db" --format '{{.ID}}' 2>$null | Where-Object {$_ -match '\S'})
 $apiId=@(& docker.exe ps --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=backend" --format '{{.ID}}' 2>$null | Where-Object {$_ -match '\S'})
 if($dbId.Count -ne 1 -or $apiId.Count -ne 1){throw 'Expected isolated backend and database containers not confirmed'}
 $dbHealth=(& docker.exe inspect --format '{{.State.Health.Status}}' $dbId[0] 2>$null)
 if($LASTEXITCODE -ne 0 -or "$dbHealth".Trim() -ne 'healthy'){throw 'Isolated database health not confirmed'}
 $published=@(& docker.exe port $apiId[0] '8000/tcp' 2>$null)
 if($LASTEXITCODE -ne 0 -or -not (@($published) -match "127\.0\.0\.1:$port$")){throw 'Backend API port ownership not confirmed'}
 if(-not (CheckApi $port)){throw 'Isolated backend API health not confirmed'}
 Write-Host "DATABASE: healthy; BACKEND: HTTP 200 at http://127.0.0.1:$port/health; WORKERS: not started (safety gate)"
}
if((Read-Host 'Install extension dependencies using npm ci and build development extension? Type YES') -cne 'YES'){throw 'npm installation declined'}
Push-Location $ext
try{& npm.cmd ci --include=dev --no-audit --no-fund;if($LASTEXITCODE -ne 0){throw 'npm ci failed'};& npm.cmd run build:dev;if($LASTEXITCODE -ne 0){throw 'Build failed'}}finally{Pop-Location}
if($LaunchChrome){
 $chrome=@("${env:ProgramFiles}\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe")|Where-Object {Test-Path $_}|Select-Object -First 1
 if(-not $chrome){throw 'Chrome missing'}
 $dist=Join-Path $ext 'dist';if(-not (Test-Path (Join-Path $dist 'manifest.json'))){throw 'Extension manifest missing'}
 $profile=Join-Path $env:LOCALAPPDATA 'BirthdayMessaging\QA-Chrome';New-Item -ItemType Directory -Force -Path $profile|Out-Null
 Start-Process -FilePath $chrome -ArgumentList @("--user-data-dir=`"$profile`"","--load-extension=`"$dist`"",'chrome://extensions')
 Write-Host 'Chrome launched. Verify the extension loaded in chrome://extensions.'
}
Write-Host 'ONBOARDING_COMPLETE: verified steps above; worker runtime remains gated'
