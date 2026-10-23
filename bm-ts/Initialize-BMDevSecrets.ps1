param([Parameter(Mandatory=$true)][string]$EnvironmentFile)
$ErrorActionPreference='Stop'
function New-Secret([int]$Count,[bool]$Fernet=$false) {
  $bytes=New-Object byte[] $Count
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try {$rng.GetBytes($bytes)} finally {$rng.Dispose()}
  $value=[Convert]::ToBase64String($bytes)
  if($Fernet){return $value.Replace('+','-').Replace('/','_')}
  return $value.Replace('+','-').Replace('/','_').TrimEnd('=')
}
$parent=Split-Path -Parent $EnvironmentFile
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$map=[ordered]@{}
if(Test-Path -LiteralPath $EnvironmentFile){
 foreach($line in [IO.File]::ReadAllLines($EnvironmentFile)){
  if($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$'){$map[$matches[1]]=$matches[2]}
  elseif($line.Trim() -and !$line.Trim().StartsWith('#')){throw 'Unrecognized environment-file line; refusing rewrite'}
 }
}
foreach($name in @('BM_DEV_DB_PASSWORD','BM_DEV_SECRET_KEY','JWT_SECRET_KEY','SMTP_ENCRYPTION_KEY')){
 if($map.Contains($name) -and ![string]::IsNullOrWhiteSpace($map[$name])){continue}
 $map[$name]=if($name -eq 'SMTP_ENCRYPTION_KEY'){New-Secret 32 $true}else{New-Secret 48}
}
if($map.Contains('STRIPE_ENABLED') -and $map['STRIPE_ENABLED'] -ne 'false'){throw 'Existing Stripe setting conflicts with isolated development'}
if($map.Contains('BM_DEPLOYMENT_ENV') -and $map['BM_DEPLOYMENT_ENV'] -ne 'isolated_development'){throw 'Existing deployment mode conflicts with isolated development'}
$map['STRIPE_ENABLED']='false'
$map['BM_DEPLOYMENT_ENV']='isolated_development'
if(!$map.Contains('BM_DEV_DB_PORT')){$map['BM_DEV_DB_PORT']='15432'}
if(!$map.Contains('BM_DEV_API_PORT')){$map['BM_DEV_API_PORT']='18767'}
$key=$map['SMTP_ENCRYPTION_KEY']
try{$raw=[Convert]::FromBase64String($key.Replace('-','+').Replace('_','/'));if($raw.Length -ne 32){throw 'Invalid length'}}catch{throw 'Existing SMTP encryption key invalid; refusing overwrite'}
foreach($name in @('JWT_SECRET_KEY','BM_DEV_SECRET_KEY','BM_DEV_DB_PASSWORD')){if($map[$name].Length -lt 32){throw "Existing $name too short; refusing overwrite"}}
$lines=@(foreach($name in $map.Keys){"$name=$($map[$name])"})
$temp="$EnvironmentFile.tmp.$PID"
try{
 [IO.File]::WriteAllLines($temp,$lines,[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temp -Destination $EnvironmentFile -Force
}finally{if(Test-Path $temp){Remove-Item $temp -Force}}
Write-Output 'DEV_SECRETS_VALIDATED'
