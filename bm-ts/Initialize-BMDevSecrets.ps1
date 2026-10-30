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
if(!$map.Contains('BM_DEV_API_PORT')){$map['BM_DEV_API_PORT']='8000'}
$key=$map['SMTP_ENCRYPTION_KEY']
try{$raw=[Convert]::FromBase64String(($key.Replace('-','+').Replace('_','/') + ('=' * ((4 - ($key.Length % 4)) % 4))));if($raw.Length -ne 32){throw 'Invalid length'}}catch{throw 'Existing SMTP encryption key invalid; refusing overwrite'}
foreach($name in @('JWT_SECRET_KEY','BM_DEV_SECRET_KEY','BM_DEV_DB_PASSWORD')){if($map[$name].Length -lt 32){throw "Existing $name too short; refusing overwrite"}}
# Postal DEV SMTP one-time enrollment: never generate or print a provider token.
# Reuse existing nonempty credentials on subsequent startup runs.
if ([string]::IsNullOrWhiteSpace($map['POSTAL_SMTP_USERNAME']) -or [string]::IsNullOrWhiteSpace($map['POSTAL_SMTP_PASSWORD'])) {
  if ((Read-Host 'Enroll dedicated DEV Postal SMTP credential once? Type ENROLL') -cne 'ENROLL') { throw 'POSTAL_DEV_CREDENTIAL_ENROLLMENT_REQUIRED' }
  $smtpUser=Read-Host 'Postal DEV SMTP username (not the credential display name unless confirmed)'
  if ([string]::IsNullOrWhiteSpace($smtpUser) -or $smtpUser -match '[\r\n=]') { throw 'INVALID_POSTAL_SMTP_USERNAME' }
  $secure=Read-Host 'Postal DEV SMTP authentication token' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $smtpToken=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ([string]::IsNullOrWhiteSpace($smtpToken) -or $smtpToken -match '[\r\n]') { throw 'INVALID_POSTAL_SMTP_TOKEN' }
  $map['POSTAL_SMTP_USERNAME']=$smtpUser
  $map['POSTAL_SMTP_PASSWORD']=$smtpToken
  $smtpToken=$null
}
# Refuse insecure inherited variables or partial enrollment, never overwrite working credentials.
foreach($name in @('POSTAL_SMTP_USERNAME','POSTAL_SMTP_PASSWORD')) {
  if ([string]::IsNullOrWhiteSpace($map[$name])) { throw "MISSING_$name" }
}
$lines=@(foreach($name in $map.Keys){"$name=$($map[$name])"})
$temp="$EnvironmentFile.tmp.$PID"
try{
 [IO.File]::WriteAllLines($temp,$lines,[Text.UTF8Encoding]::new($false))
  # DACL-only change: icacls does not request SeSecurityPrivilege (SACL).
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $temp /inheritance:r /grant:r ('*'+$sid+':(F)') '*S-1-5-18:(F)' 1>$null
  if($LASTEXITCODE -ne 0){throw 'DEV_SECRETS_ACL_RESTRICTION_FAILED'}
  Move-Item -LiteralPath $temp -Destination $EnvironmentFile -Force
  & icacls.exe $EnvironmentFile /inheritance:r /grant:r ('*'+$sid+':(F)') '*S-1-5-18:(F)' 1>$null
  if($LASTEXITCODE -ne 0){throw 'DEV_SECRETS_FINAL_ACL_FAILED'}
 }finally{if(Test-Path $temp){Remove-Item $temp -Force}}
Write-Output 'DEV_SECRETS_VALIDATED'
