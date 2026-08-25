[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^\d{12}$')]
  [string] $ExpectedAccountId,

  [Parameter(Mandatory)]
  [ValidatePattern('^[A-Z0-9]{13,14}$')]
  [string] $DistributionId,

  [ValidatePattern('^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')]
  [string] $ExpectedAlias = 'app.lunumia.com',

  [Parameter(Mandatory)]
  [ValidatePattern('^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$')]
  [string] $Bucket,

  [Parameter(Mandatory)]
  [ValidatePattern('^[a-z]{2}-[a-z]+-\d$')]
  [string] $Region,

  [ValidatePattern('^[a-zA-Z0-9!_.*''()/-]*$')]
  [string] $Prefix = '',

  [string] $DistPath = (Join-Path $PSScriptRoot '..\dist'),

  [Parameter(Mandatory)]
  [string] $BackupPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-AwsJson {
  param([Parameter(Mandatory)][string[]] $Arguments)

  $output = & aws @Arguments
  $exitCode = Get-Variable LASTEXITCODE -ValueOnly -ErrorAction SilentlyContinue
  if ($null -ne $exitCode -and $exitCode -ne 0) {
    throw "AWS CLI failed: aws $($Arguments -join ' ')"
  }
  return $output | ConvertFrom-Json
}

function Invoke-AwsCommand {
  param([Parameter(Mandatory)][string[]] $Arguments)

  & aws @Arguments
  $exitCode = Get-Variable LASTEXITCODE -ValueOnly -ErrorAction SilentlyContinue
  if ($null -ne $exitCode -and $exitCode -ne 0) {
    throw "AWS CLI failed: aws $($Arguments -join ' ')"
  }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw 'AWS CLI is required and must be installed outside this script.'
}

$resolvedDist = (Resolve-Path -LiteralPath $DistPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedDist 'index.html'))) {
  throw "The verified dist directory does not contain index.html: $resolvedDist"
}
if (-not (Test-Path -LiteralPath (Join-Path $resolvedDist 'assets') -PathType Container)) {
  throw "The verified dist directory does not contain assets/: $resolvedDist"
}

$normalizedPrefix = $Prefix.Trim('/')
if ($normalizedPrefix -match '(^|/)\.\.(/|$)') {
  throw 'Prefix cannot contain parent-directory segments.'
}
$s3Root = if ($normalizedPrefix) {
  "s3://$Bucket/$normalizedPrefix"
} else {
  "s3://$Bucket"
}

$identity = Invoke-AwsJson @('sts', 'get-caller-identity', '--output', 'json')
if ($identity.Account -ne $ExpectedAccountId) {
  throw "AWS account mismatch. Expected $ExpectedAccountId; got $($identity.Account)."
}

$distribution = Invoke-AwsJson @(
  'cloudfront',
  'get-distribution',
  '--id',
  $DistributionId,
  '--output',
  'json'
)
$config = $distribution.Distribution.DistributionConfig
$aliases = @($config.Aliases.Items)
if ($ExpectedAlias -notin $aliases) {
  throw "Distribution $DistributionId is missing application alias $ExpectedAlias."
}

$matchingOrigins = @(
  $config.Origins.Items | Where-Object {
    $_.DomainName.StartsWith("$Bucket.") -and
    $_.DomainName.EndsWith('.amazonaws.com')
  }
)
if ($matchingOrigins.Count -ne 1) {
  throw "Expected exactly one S3 origin for bucket $Bucket; found $($matchingOrigins.Count)."
}
$originPrefix = ([string] $matchingOrigins[0].OriginPath).Trim('/')
if ($originPrefix -ne $normalizedPrefix) {
  throw "CloudFront origin path '$originPrefix' does not match prefix '$normalizedPrefix'."
}

$target = "$s3Root via CloudFront distribution $DistributionId"
if (-not $PSCmdlet.ShouldProcess($target, 'Back up, upload RC frontend, and invalidate /*')) {
  return
}

if (Test-Path -LiteralPath $BackupPath) {
  throw "Backup path already exists; choose a new empty target: $BackupPath"
}
$resolvedBackupParent = Split-Path -Parent $BackupPath
if ($resolvedBackupParent) {
  New-Item -ItemType Directory -Path $resolvedBackupParent -Force | Out-Null
}
New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

Invoke-AwsCommand @(
  's3',
  'sync',
  $s3Root,
  $BackupPath,
  '--region',
  $Region,
  '--no-progress'
)

Invoke-AwsCommand @(
  's3',
  'sync',
  (Join-Path $resolvedDist 'assets'),
  "$s3Root/assets",
  '--region',
  $Region,
  '--cache-control',
  'public, max-age=31536000, immutable',
  '--no-progress'
)

Invoke-AwsCommand @(
  's3',
  'cp',
  $resolvedDist,
  $s3Root,
  '--recursive',
  '--exclude',
  'assets/*',
  '--region',
  $Region,
  '--cache-control',
  'no-cache, max-age=0, must-revalidate',
  '--no-progress'
)

$invalidation = Invoke-AwsJson @(
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  $DistributionId,
  '--paths',
  '/*',
  '--output',
  'json'
)
$invalidationId = $invalidation.Invalidation.Id
Invoke-AwsCommand @(
  'cloudfront',
  'wait',
  'invalidation-completed',
  '--distribution-id',
  $DistributionId,
  '--id',
  $invalidationId
)

[PSCustomObject]@{
  AccountId = $identity.Account
  Principal = $identity.Arn
  DistributionId = $DistributionId
  ExpectedAlias = $ExpectedAlias
  Bucket = $Bucket
  Prefix = $normalizedPrefix
  BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
  InvalidationId = $invalidationId
  InvalidationStatus = 'Completed'
}
