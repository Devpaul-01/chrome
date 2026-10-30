param()
$ErrorActionPreference='Stop'
$base=Split-Path -Parent $MyInvocation.MyCommand.Path
$compose=Join-Path $base 'docker-compose.dev.yml'
$project='bmdev'+(($env:USERNAME -replace '[^a-zA-Z0-9]','').ToLower())
if(!(Test-Path $compose)){throw 'Isolated Compose missing'}
if((Read-Host "Stop only Docker project $project (preserve volumes)? Type STOP") -cne 'STOP'){throw 'Shutdown declined'}
& docker.exe compose -p $project --project-directory $base -f $compose stop backend db
if($LASTEXITCODE -ne 0){throw 'Docker stop failed'}
Write-Host "Stopped isolated project services $project. Volumes preserved."
