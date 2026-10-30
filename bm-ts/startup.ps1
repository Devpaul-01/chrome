param([ValidateSet('Audit','Extension','FullStack')][string]$Mode='Audit',[switch]$LaunchChrome)
$ErrorActionPreference='Stop'
$base=$PSScriptRoot
$ext=Join-Path $base 'extension'
$project='bmdev'+(($env:USERNAME -replace '[^a-zA-Z0-9]','').ToLower())
$envFile=Join-Path $env:LOCALAPPDATA ('BirthdayMessaging\QASecrets\'+$project+'.env')
$compose=Join-Path $base 'docker-compose.dev.yml'
function Require([string]$name) {if(-not (Get-Command $name -ErrorAction SilentlyContinue)){throw "Missing prerequisite $name; install with approval and rerun."}}
function CheckApi([int]$port){try {return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$port/health").StatusCode -eq 200}catch{return $false}}
# Backend-only mode must not require Node/npm or extension checkout artifacts.
# Extension prerequisites are checked only after isolated backend readiness.
if($Mode -eq 'Audit'){
 Write-Host ('API_HTTP_8000_READY='+(CheckApi 8000))
 Write-Host 'AUDIT_PASS: no services changed'
 exit 0
}
function EnsureDevBackend {
 Require 'docker.exe'
 if(-not (Test-Path -LiteralPath $compose)){throw 'Development Compose file missing'}
 $initializer=Join-Path $base 'Initialize-BMDevSecrets.ps1'
 if(-not (Test-Path -LiteralPath $initializer)){throw 'Reviewed development secrets initializer missing'}
 if(-not (Test-Path -LiteralPath $envFile)){
  if((Read-Host 'Create isolated development secrets outside repository? Type START') -cne 'START'){throw 'Secrets initialization declined'}
 }
 # Existing initializer preserves valid secrets and refuses conflicting environment settings.
 try { & $initializer -EnvironmentFile $envFile } catch { throw ('Development secrets initializer failed: ' + $_.Exception.Message) }
 if(-not $?){throw 'Development secrets initializer failed'}
 $values=@{}
 foreach($line in (Get-Content -LiteralPath $envFile)){
  if($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$'){$values[$matches[1]]=$matches[2]}
 }
 if($values['BM_DEPLOYMENT_ENV'] -ne 'isolated_development' -or $values['STRIPE_ENABLED'] -ne 'false'){throw 'Unsafe development configuration'}
 if($values['BM_DEV_API_PORT'] -ne '8000'){
  # Existing 18767 defaults must never be silently rewritten or reused.
  throw 'Existing DEV environment uses a non-8000 port; preserve it and review port alignment before startup.'
 }
 foreach($key in @('BM_DEV_DB_PASSWORD','BM_DEV_SECRET_KEY','JWT_SECRET_KEY','SMTP_ENCRYPTION_KEY')){
  if([string]::IsNullOrWhiteSpace($values[$key])){throw "Required development secret missing: $key"}
 }
 # Compose --env-file supplies interpolation values, but child processes and subsequent
 # invocations must also inherit the validated secrets in this PowerShell process.
 foreach($key in @('BM_DEV_DB_PASSWORD','BM_DEV_SECRET_KEY','JWT_SECRET_KEY','SMTP_ENCRYPTION_KEY')){
  [Environment]::SetEnvironmentVariable($key,[string]$values[$key],'Process')
 }
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose config --quiet
 if($LASTEXITCODE -ne 0){throw 'DEV_COMPOSE_INTERPOLATION_FAILED'}
 $running=@(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose ps -q backend 2>$null)
 if($LASTEXITCODE -ne 0){throw 'Cannot inspect isolated Compose project'}
 # Validate Docker's published host binding against the isolated Compose backend.
 $cid=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose ps -q backend | Select-Object -First 1)
 if($LASTEXITCODE -ne 0){throw 'Cannot resolve isolated backend container'}
 if($cid){
  $meta=(& docker.exe inspect --format '{{json .}}' $cid | ConvertFrom-Json)
  if($LASTEXITCODE -ne 0 -or -not $meta){throw 'BACKEND_INSPECT_FAILED'}
  if($meta.Config.Labels.'com.docker.compose.project' -cne $project -or $meta.Config.Labels.'com.docker.compose.service' -cne 'backend'){throw 'BACKEND_COMPOSE_OWNERSHIP_MISMATCH'}
  if($meta.State.Running -ne $true){throw 'BACKEND_NOT_RUNNING'}
  $inspect=$meta.NetworkSettings.Ports
  $bindings=@($inspect.'8000/tcp')
  if($bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne '8000'){throw 'BACKEND_PORT_BINDING_MISMATCH'}
  if(-not (CheckApi 8000)){throw 'ISOLATED_BACKEND_UNHEALTHY'}
  # Existing backend must pass the same isolated DB verification as first-run.
  $dbid=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose ps -q db | Select-Object -First 1)
  if($LASTEXITCODE -ne 0 -or -not $dbid){throw 'EXISTING_DEV_DB_MISSING'}
  $dbmeta=(& docker.exe inspect --format '{{json .}}' $dbid | ConvertFrom-Json)
  if($LASTEXITCODE -ne 0 -or -not $dbmeta){throw 'EXISTING_DEV_DB_INSPECT_FAILED'}
  if($dbmeta.Config.Labels.'com.docker.compose.project' -cne $project -or $dbmeta.Config.Labels.'com.docker.compose.service' -cne 'db' -or $dbmeta.State.Health.Status -cne 'healthy'){throw 'EXISTING_DEV_DB_ISOLATION_OR_HEALTH_FAILED'}
  # Rebuild the isolated DEV backend image from this checkout before inspecting
  # its settings or Alembic revision. Never trust an image left by an older run.
  & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose build backend
  if($LASTEXITCODE -ne 0){throw 'EXISTING_BACKEND_IMAGE_BUILD_FAILED'}
  # Building a fresh image does not update an already-running container.
  # Reject stale backend containers rather than accepting an old API against new migrations.
  # Compose `images -q` can report the OLD running container image after build.
  # With no explicit `image:` key, Compose tags the new build as <project>-backend.
  # Inspect that tag directly; do not infer the freshly built image from ps/images.
  $builtTag="$project-backend"
  $builtImage=(& docker.exe image inspect --format '{{.Id}}' $builtTag 2>$null | Select-Object -First 1)
  if($LASTEXITCODE -ne 0 -or -not $builtImage -or $builtImage -notmatch '^sha256:[0-9a-f]{64}$'){throw 'EXISTING_BACKEND_BUILT_IMAGE_INSPECT_FAILED'}
  if($meta.Image -cne $builtImage){
   if((Read-Host 'Recreate ONLY this isolated DEV backend container using the updated image? Type RECREATE') -cne 'RECREATE'){throw 'EXISTING_BACKEND_IMAGE_STALE_RECREATE_DECLINED'}
   & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose up -d --no-deps --force-recreate backend
   if($LASTEXITCODE -ne 0){throw 'EXISTING_DEV_BACKEND_RECREATE_FAILED'}
   $cid=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose ps -q backend | Select-Object -First 1)
   if($LASTEXITCODE -ne 0 -or -not $cid){throw 'RECREATED_BACKEND_MISSING'}
   $meta=(& docker.exe inspect --format '{{json .}}' $cid | ConvertFrom-Json)
   if($LASTEXITCODE -ne 0 -or -not $meta -or $meta.Image -cne $builtImage -or $meta.Config.Labels.'com.docker.compose.project' -cne $project -or $meta.Config.Labels.'com.docker.compose.service' -cne 'backend'){throw 'RECREATED_BACKEND_IDENTITY_MISMATCH'}
   $bindings=@($meta.NetworkSettings.Ports.'8000/tcp')
   if($bindings.Count -ne 1 -or $bindings[0].HostIp -cne '127.0.0.1' -or $bindings[0].HostPort -cne '8000'){throw 'RECREATED_BACKEND_PORT_MISMATCH'}
   $ready=$false
   for($retry=0;$retry -lt 30;$retry++){if(CheckApi 8000){$ready=$true;break};Start-Sleep -Seconds 2}
   if(-not $ready){throw 'RECREATED_BACKEND_HEALTH_TIMEOUT'}
  }
  $probe='from app.core.config import settings; from sqlalchemy.engine.url import make_url; u=make_url(str(settings.database_url)); assert u.host=="db" and u.port==5432 and u.database=="birthdaymessaging_dev" and u.username=="bmdev" and u.password==__import__("os").environ["BM_DEV_DB_PASSWORD"], "UNSAFE_DATABASE_TARGET"; print("ISOLATED_DATABASE_TARGET_PASS")'
  if((Read-Host 'Verify effective Alembic DEV database target in one-off container? Type INSPECT') -cne 'INSPECT'){throw 'Existing backend database verification declined'}
  & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint python backend -c $probe
  if($LASTEXITCODE -ne 0){throw 'EXISTING_BACKEND_DATABASE_TARGET_UNVERIFIED'}
 $connectionProbe=@'
import asyncio
import asyncpg
from app.core.config import settings
from sqlalchemy.engine.url import make_url
async def verify():
    u = make_url(str(settings.database_url))
    conn = await asyncpg.connect(host=u.host, port=u.port, user=u.username, password=u.password, database=u.database, timeout=5)
    try:
        row = await conn.fetchrow('select current_database(), current_user')
        assert row[0] == 'birthdaymessaging_dev' and row[1] == 'bmdev', 'UNSAFE_CONNECTED_DATABASE'
        print('ISOLATED_DB_CONNECTION_PASS')
    finally:
        await conn.close()
asyncio.run(verify())
'@
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint python backend -c $connectionProbe
 if($LASTEXITCODE -ne 0){throw 'ISOLATED_DB_CONNECTION_NOT_VERIFIED'}
  # Verify existing schema without altering it on repeat runs.
  # Verify installed Alembic supports the exact repeat-run head check before relying on it.
  $alembicHelp=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint alembic backend current --help 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0 -or $alembicHelp -notmatch '--check-heads'){throw 'ALEMBIC_CHECK_HEADS_UNSUPPORTED'}
  & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint alembic backend current
  if($LASTEXITCODE -ne 0){throw 'EXISTING_BACKEND_ALEMBIC_CURRENT_FAILED'}
  # Compare actual current revisions with expected heads; no migration on repeat runs.
  # Alembic `current --check-heads` returns nonzero if the database is not at all heads.
  & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint alembic backend current --check-heads
  if($LASTEXITCODE -ne 0){throw 'EXISTING_BACKEND_ALEMBIC_HEAD_MISMATCH'}
  if(-not (CheckApi 8000)){throw 'EXISTING_BACKEND_LOST_HEALTH'}
  Write-Host 'EXISTING_BACKEND_ISOLATION_AND_MIGRATION_VERIFIED; REGISTRATION_UNTESTED'
  return
 }
 if(CheckApi 8000){throw 'PORT_8000_OCCUPIED_BY_UNKNOWN_API'}
 if(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue){throw 'Port 8000 occupied; refusing to start backend'}
 if((Read-Host 'Create/start isolated DEV database and backend? Type START') -cne 'START'){throw 'Development startup declined'}
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose config --quiet
 if($LASTEXITCODE -ne 0){throw 'Compose validation failed'}
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose up -d db
 if($LASTEXITCODE -ne 0){throw 'Database startup failed'}
 $dbid=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose ps -q db | Select-Object -First 1)
 if($LASTEXITCODE -ne 0){throw 'DEV_DB_COMPOSE_DISCOVERY_FAILED'}
 if(-not $dbid){throw 'DEV_DB_CONTAINER_NOT_LISTED_AFTER_START'}
 $dbmeta=(& docker.exe inspect --format '{{json .}}' $dbid | ConvertFrom-Json)
 if($LASTEXITCODE -ne 0 -or -not $dbmeta){throw 'DEV_DB_INSPECT_FAILED'}
 if($dbmeta.Config.Labels.'com.docker.compose.project' -cne $project -or $dbmeta.Config.Labels.'com.docker.compose.service' -cne 'db'){throw 'DEV_DB_OWNERSHIP_MISMATCH'}
 $dbHealthy=$false
 for($wait=0;$wait -lt 30;$wait++){
  $dbmeta=(& docker.exe inspect --format '{{json .}}' $dbid | ConvertFrom-Json)
  if($LASTEXITCODE -ne 0){throw 'DEV_DB_INSPECT_FAILED'}
  if($dbmeta.State.Health.Status -ceq 'healthy'){$dbHealthy=$true;break}
  if($dbmeta.State.Health.Status -ceq 'unhealthy'){throw 'DEV_DB_UNHEALTHY'}
  Start-Sleep -Seconds 2
 }
 if(-not $dbHealthy){throw 'DEV_DB_HEALTH_TIMEOUT'}
 # Refuse migration until effective Alembic settings.database_url is independently
 # verified inside the isolated backend container. Compose interpolation is insufficient.
 # Build the backend image before the one-off configuration probe or Alembic run.
 # A fresh developer machine cannot assume the image already exists.
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose build backend
 if($LASTEXITCODE -ne 0){throw 'DEV_BACKEND_IMAGE_BUILD_FAILED'}
 # Run a no-dependencies, ephemeral preflight only after explicit consent.
 if((Read-Host 'Inspect effective DEV Alembic database target in an isolated one-off backend? Type INSPECT') -cne 'INSPECT'){throw 'Effective database inspection declined'}
 $probe='from app.core.config import settings; from sqlalchemy.engine.url import make_url; u=make_url(str(settings.database_url)); assert u.host=="db" and u.port==5432 and u.database=="birthdaymessaging_dev" and u.username=="bmdev" and u.password==__import__("os").environ["BM_DEV_DB_PASSWORD"], "UNSAFE_DATABASE_TARGET"; print("ISOLATED_DATABASE_TARGET_PASS")'
 # This import must be verified against the exact PR backend source before approval.
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint python backend -c $probe
 if($LASTEXITCODE -ne 0){throw 'EFFECTIVE_DATABASE_TARGET_NOT_VERIFIED'}
 $connectionProbe=@'
import asyncio
import asyncpg
from app.core.config import settings
from sqlalchemy.engine.url import make_url
async def verify():
    u = make_url(str(settings.database_url))
    conn = await asyncpg.connect(host=u.host, port=u.port, user=u.username, password=u.password, database=u.database, timeout=5)
    try:
        row = await conn.fetchrow('select current_database(), current_user')
        assert row[0] == 'birthdaymessaging_dev' and row[1] == 'bmdev', 'UNSAFE_CONNECTED_DATABASE'
        print('ISOLATED_DB_CONNECTION_PASS')
    finally:
        await conn.close()
asyncio.run(verify())
'@
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint python backend -c $connectionProbe
 if($LASTEXITCODE -ne 0){throw 'ISOLATED_DB_CONNECTION_NOT_VERIFIED'}
  # Check installed Alembic capability before requesting permission to migrate.
  $alembicHelp=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint alembic backend current --help 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0 -or $alembicHelp -notmatch '--check-heads'){throw 'ALEMBIC_CHECK_HEADS_UNSUPPORTED'}
 if((Read-Host 'Run Alembic migrations on isolated DEV database? Type MIGRATE') -cne 'MIGRATE'){throw 'Migration declined; backend not started'}
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint alembic backend upgrade head
 if($LASTEXITCODE -ne 0){throw 'Migration failed; backend not started'}
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose run --rm --no-deps --entrypoint alembic backend current --check-heads
 if($LASTEXITCODE -ne 0){throw 'NEW_BACKEND_ALEMBIC_HEAD_MISMATCH'}
 & docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose up -d backend
 if($LASTEXITCODE -ne 0){throw 'Backend startup failed'}
 $ready=$false
 for($i=0;$i -lt 30;$i++){if(CheckApi 8000){$ready=$true;break};Start-Sleep -Seconds 2}
 if(-not $ready){throw 'Backend health timeout'}
 $newid=(& docker.exe compose -p $project --project-directory $base --env-file $envFile -f $compose ps -q backend | Select-Object -First 1)
 if($LASTEXITCODE -ne 0 -or -not $newid){throw 'NEW_BACKEND_CONTAINER_MISSING'}
 $newmeta=(& docker.exe inspect --format '{{json .}}' $newid | ConvertFrom-Json)
 if($LASTEXITCODE -ne 0 -or -not $newmeta){throw 'NEW_BACKEND_INSPECT_FAILED'}
 if($newmeta.Config.Labels.'com.docker.compose.project' -cne $project -or $newmeta.Config.Labels.'com.docker.compose.service' -cne 'backend' -or $newmeta.State.Running -ne $true){throw 'NEW_BACKEND_OWNERSHIP_MISMATCH'}
 $newbindings=@($newmeta.NetworkSettings.Ports.'8000/tcp')
 if($newbindings.Count -ne 1 -or $newbindings[0].HostIp -cne '127.0.0.1' -or $newbindings[0].HostPort -cne '8000'){throw 'NEW_BACKEND_PORT_BINDING_MISMATCH'}
 if(-not (CheckApi 8000)){throw 'NEW_BACKEND_LOST_HEALTH_AFTER_OWNERSHIP_CHECK'}
 Write-Host 'BACKEND_HTTP_AND_OWNERSHIP_READY: schema migration completed; registration untested'
}
if($Mode -eq 'FullStack'){EnsureDevBackend;exit 0}
# Backend readiness is mandatory before building the developer extension.
EnsureDevBackend
# Verify that the running isolated backend actually exposes a registration endpoint.
# Route discovery is NOT a substitute for Brian's registration/login acceptance test.
try {
 $api=Invoke-RestMethod -Uri 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 8 -ErrorAction Stop
 $registrationRoutes=@($api.paths.PSObject.Properties | Where-Object { $_.Name -match '(?i)(register|sign.?up)' -and $_.Value.PSObject.Properties.Name -contains 'post' } | ForEach-Object { $_.Name })
 if($registrationRoutes.Count -eq 0){throw 'REGISTRATION_POST_ROUTE_NOT_ADVERTISED'}
 Write-Host ('REGISTRATION_POST_ROUTE_ADVERTISED='+($registrationRoutes -join ','))
} catch { throw ('REGISTRATION_READINESS_CHECK_FAILED: '+$_.Exception.Message) }
# Extension-only prerequisites are checked after isolated backend and registration-route readiness.
# Git is not needed by this build path and must not block onboarding.
Require 'node.exe'; Require 'npm.cmd'
if(-not (Test-Path (Join-Path $ext 'package-lock.json'))){throw 'Missing extension package-lock.json'}
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
if(-not (CheckApi 8000)){throw 'BACKEND_LOST_READINESS_AFTER_BUILD'}
Write-Host 'REGISTRATION_RUNTIME_ACCEPTANCE_PENDING_BRIAN' 
Write-Host 'EXTENSION_AND_BACKEND_HTTP_READY: registration still requires acceptance; workers remain gated'
