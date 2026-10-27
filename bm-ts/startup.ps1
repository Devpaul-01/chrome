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
if($Mode -eq 'FullStack'){throw 'FullStack is disabled: separate authorization required; no Docker operations permitted.'}
# Require the separately reviewed Vite isolation configuration before any npm operation.
$vitePath=Join-Path $ext 'vite.config.ts'
if(-not (Test-Path -LiteralPath $vitePath)){throw 'Vite configuration missing'}
$viteText=Get-Content -LiteralPath $vitePath -Raw
if($viteText -notmatch [regex]::Escape("mode === 'development' ? 'dist-dev' : 'dist'")){throw 'Unsafe Vite output configuration; refusing npm operation'}
if((Read-Host 'Install extension dependencies using npm ci and build development extension? Type YES') -cne 'YES'){throw 'npm installation declined'}
Push-Location $ext
try{& npm.cmd ci --include=dev --no-audit --no-fund;if($LASTEXITCODE -ne 0){throw 'npm ci failed'};& npm.cmd run build:dev;if($LASTEXITCODE -ne 0){throw 'Build failed'}}finally{Pop-Location}
# Verify isolated build artifact and fail closed if production API permission is present.
$dist=Join-Path $ext 'dist-dev'
$manifestPath=Join-Path $dist 'manifest.json'
if(-not (Test-Path -LiteralPath $manifestPath)){throw 'DEV manifest missing; refusing to load production dist'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($manifest.name -notmatch 'DEV'){throw 'Development identity missing'}
if(@($manifest.host_permissions) -match 'api-v2\.birthdaymessaging\.io'){throw 'Production API permission detected in DEV manifest'}
if(-not (@($manifest.host_permissions) -match '127\.0\.0\.1|localhost')){throw 'Development localhost permission missing'}

# Check compiled DEV code for the approved backend and reject production endpoint strings.
$jsFiles=@(Get-ChildItem -LiteralPath $dist -Recurse -File -Filter '*.js')
if($jsFiles.Count -eq 0){throw 'No DEV JavaScript artifacts found'}
$foundLocal=$false
foreach($js in $jsFiles){
 $contents=[IO.File]::ReadAllText($js.FullName)
 if($contents.Contains('api-v2.birthdaymessaging.io')){throw 'Production API reference detected in DEV JavaScript'}
 if($contents.Contains('127.0.0.1:8000')){$foundLocal=$true}
}
if(-not $foundLocal){throw 'Approved local development API missing from DEV JavaScript'}

if($LaunchChrome){
 $chrome=@("${env:ProgramFiles}\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe")|Where-Object {Test-Path $_}|Select-Object -First 1
 if(-not $chrome){throw 'Chrome missing'}
 if(-not (Test-Path -LiteralPath $manifestPath)){throw 'DEV manifest missing'}
 $profile=Join-Path $env:LOCALAPPDATA 'BirthdayMessaging\QA-Chrome';New-Item -ItemType Directory -Force -Path $profile|Out-Null
 Start-Process -FilePath $chrome -ArgumentList @("--user-data-dir=`"$profile`"","--load-extension=`"$dist`"",'chrome://extensions')
 Write-Host 'Chrome launched. Verify the extension loaded in chrome://extensions.'
}
Write-Host 'ONBOARDING_COMPLETE: verified steps above; worker runtime remains gated'
