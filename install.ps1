param(
  [string]$Version,
  [switch]$SourceOnly,
  [string]$BinDir = (Join-Path $env:LOCALAPPDATA 'OpenShrike\bin'),
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'OpenShrike'),
  [switch]$NoModifyPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$App = 'openshrike'
$Repo = if ($env:OPENSHRIKE_REPO) { $env:OPENSHRIKE_REPO } else { 'Network-Perspective/OpenShrike' }
$DefaultBranch = if ($env:OPENSHRIKE_DEFAULT_BRANCH) { $env:OPENSHRIKE_DEFAULT_BRANCH } else { 'main' }
$ReleasesDir = Join-Path $InstallDir 'releases'
$NodeDownloadUrl = 'https://nodejs.org/en/download'

function Write-Info {
  param([string]$Message)
  Write-Host $Message
}

function Write-WarnMessage {
  param([string]$Message)
  Write-Warning $Message
}

function Fail {
  param([string]$Message)
  throw $Message
}

function Test-Command {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function New-TempDir {
  $path = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $path | Out-Null
  return $path
}

function Download-File {
  param(
    [string]$Url,
    [string]$OutFile
  )

  Invoke-WebRequest -Uri $Url -OutFile $OutFile
}

function Ensure-NodeRuntime {
  if (-not (Test-Command 'node')) {
    Fail "OpenShrike requires Node.js 22 or newer. Install it from $NodeDownloadUrl."
  }

  $nodeVersion = (& node -p "process.versions.node").Trim()
  if ($LASTEXITCODE -ne 0) {
    Fail 'Could not determine the installed Node.js version.'
  }

  $major = [int]($nodeVersion.Split('.')[0])
  if ($major -lt 22) {
    Fail "OpenShrike requires Node.js 22 or newer. Found v$nodeVersion."
  }
}

function Ensure-Npm {
  if (-not (Test-Command 'npm')) {
    Fail 'OpenShrike source installs require npm.'
  }
}

function Get-Target {
  $archValue = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }

  switch -Regex ($archValue) {
    '^AMD64$' { return 'windows-x64' }
    '^ARM64$' { return 'windows-arm64' }
    default { Fail "Unsupported Windows architecture: $archValue" }
  }
}

function Get-LatestReleaseVersion {
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
  } catch {
    return $null
  }

  if (-not $release.tag_name) {
    return $null
  }

  return "$($release.tag_name)".TrimStart('v')
}

function Get-SourceArchiveUrl {
  param([string]$Ref)

  if ($Ref.StartsWith('v')) {
    return "https://github.com/$Repo/archive/refs/tags/$Ref.zip"
  }

  return "https://github.com/$Repo/archive/refs/heads/$Ref.zip"
}

function Invoke-NpmCommand {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
      Fail "npm $($Arguments -join ' ') failed in $WorkingDirectory."
    }
  } finally {
    Pop-Location
  }
}

function New-WindowsBundle {
  param(
    [string]$SourceDirectory,
    [string]$Target,
    [string]$VersionKey,
    [string]$OutputDirectory
  )

  $runtimeStage = Join-Path $OutputDirectory 'runtime-stage'
  $bundleRoot = Join-Path $OutputDirectory $App
  $appRoot = Join-Path $bundleRoot 'app'

  New-Item -ItemType Directory -Force -Path $runtimeStage, $bundleRoot, $appRoot | Out-Null

  Invoke-NpmCommand -WorkingDirectory $SourceDirectory -Arguments @('ci')
  Invoke-NpmCommand -WorkingDirectory $SourceDirectory -Arguments @('run', 'build')

  Copy-Item -Path (Join-Path $SourceDirectory 'package.json') -Destination $runtimeStage
  Copy-Item -Path (Join-Path $SourceDirectory 'package-lock.json') -Destination $runtimeStage
  Invoke-NpmCommand -WorkingDirectory $runtimeStage -Arguments @('ci', '--omit=dev')

  $runtimeLock = Join-Path $runtimeStage 'node_modules\.package-lock.json'
  if (Test-Path $runtimeLock) {
    Remove-Item -Force $runtimeLock
  }

  $cachedOpenCodeBinary = Join-Path $runtimeStage 'node_modules\opencode-ai\bin\.opencode'
  if (Test-Path $cachedOpenCodeBinary) {
    Remove-Item -Force $cachedOpenCodeBinary
  }

  Copy-Item -Path (Join-Path $SourceDirectory 'package.json') -Destination $appRoot
  Copy-Item -Path (Join-Path $SourceDirectory 'package-lock.json') -Destination $appRoot
  Copy-Item -Recurse -Force -Path (Join-Path $SourceDirectory 'dist') -Destination $appRoot
  Copy-Item -Recurse -Force -Path (Join-Path $SourceDirectory 'best_practices') -Destination $appRoot
  Copy-Item -Recurse -Force -Path (Join-Path $runtimeStage 'node_modules') -Destination $appRoot

  Set-Content -Path (Join-Path $bundleRoot 'TARGET') -Value "$Target`r`n" -Encoding Ascii
  Set-Content -Path (Join-Path $bundleRoot 'VERSION') -Value "$VersionKey`r`n" -Encoding Ascii

  $cmdLauncher = @'
@echo off
setlocal
node "%~dp0app\dist\cli.js" %*
exit /b %ERRORLEVEL%
'@
  Set-Content -Path (Join-Path $bundleRoot 'shrike.cmd') -Value $cmdLauncher -Encoding Ascii

  $psLauncher = @'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir 'app\dist\cli.js') @args
exit $LASTEXITCODE
'@
  Set-Content -Path (Join-Path $bundleRoot 'shrike.ps1') -Value $psLauncher -Encoding Ascii

  return $bundleRoot
}

function Install-BundleDir {
  param(
    [string]$BundleDir,
    [string]$VersionKey
  )

  if (-not (Test-Path $BundleDir)) {
    Fail "Bundle directory not found: $BundleDir"
  }

  $targetDir = Join-Path $ReleasesDir $VersionKey

  New-Item -ItemType Directory -Force -Path $ReleasesDir, $BinDir | Out-Null
  if (Test-Path $targetDir) {
    Remove-Item -Recurse -Force $targetDir
  }
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -Recurse -Force -Path (Join-Path $BundleDir '*') -Destination $targetDir

  $cmdShim = @"
@echo off
setlocal
call "$targetDir\shrike.cmd" %*
exit /b %ERRORLEVEL%
"@
  Set-Content -Path (Join-Path $BinDir 'shrike.cmd') -Value $cmdShim -Encoding Ascii

  $escapedTarget = $targetDir.Replace("'", "''")
  $psShim = @"
& '$escapedTarget\shrike.ps1' @args
exit `$LASTEXITCODE
"@
  Set-Content -Path (Join-Path $BinDir 'shrike.ps1') -Value $psShim -Encoding Ascii
}

function Install-PrebuiltBundle {
  param(
    [string]$ReleaseVersion,
    [string]$Target
  )

  $tmpDir = New-TempDir
  try {
    $archivePath = Join-Path $tmpDir "$App-$Target.zip"
    $assetUrl = "https://github.com/$Repo/releases/download/v$ReleaseVersion/$App-$Target.zip"
    Write-Info "Downloading release bundle $assetUrl"

    try {
      Download-File -Url $assetUrl -OutFile $archivePath
    } catch {
      return $false
    }

    Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force
    $bundleDir = Join-Path $tmpDir $App
    if (-not (Test-Path $bundleDir)) {
      Fail "Release archive did not contain '$App\'."
    }

    Install-BundleDir -BundleDir $bundleDir -VersionKey "v$ReleaseVersion"
    return $true
  } finally {
    if (Test-Path $tmpDir) {
      Remove-Item -Recurse -Force $tmpDir
    }
  }
}

function Install-FromSource {
  param(
    [string]$Ref,
    [string]$VersionKey,
    [string]$Target
  )

  Ensure-NodeRuntime
  Ensure-Npm

  $tmpDir = New-TempDir
  try {
    $archivePath = Join-Path $tmpDir 'source.zip'
    $archiveUrl = Get-SourceArchiveUrl -Ref $Ref
    Write-Info "Building from source $archiveUrl"

    Download-File -Url $archiveUrl -OutFile $archivePath
    Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force

    $sourceDir = Get-ChildItem -Path $tmpDir -Directory | Where-Object { $_.Name -ne 'runtime-stage' -and $_.Name -ne $App } | Select-Object -First 1
    if (-not $sourceDir) {
      Fail 'Could not locate extracted source directory.'
    }

    $bundleDir = New-WindowsBundle -SourceDirectory $sourceDir.FullName -Target $Target -VersionKey $VersionKey -OutputDirectory (Join-Path $tmpDir 'bundle')
    Install-BundleDir -BundleDir $bundleDir -VersionKey $VersionKey
  } finally {
    if (Test-Path $tmpDir) {
      Remove-Item -Recurse -Force $tmpDir
    }
  }
}

function Add-ToUserPathIfNeeded {
  if ($NoModifyPath) {
    return
  }

  $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @()
  if (-not [string]::IsNullOrWhiteSpace($currentUserPath)) {
    $entries = $currentUserPath.Split(';') | Where-Object { $_ }
  }

  if ($entries -contains $BinDir) {
    return
  }

  $newUserPath = if ([string]::IsNullOrWhiteSpace($currentUserPath)) {
    $BinDir
  } else {
    "$currentUserPath;$BinDir"
  }

  [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
  if (-not (($env:Path -split ';') -contains $BinDir)) {
    $env:Path = "$BinDir;$env:Path"
  }

  Write-Info "Added $BinDir to the user PATH."
}

$target = Get-Target
$releaseVersion = $null
$sourceRef = $DefaultBranch
$versionKey = $DefaultBranch

if ($Version) {
  $releaseVersion = $Version.TrimStart('v')
  $sourceRef = "v$releaseVersion"
  $versionKey = "v$releaseVersion"
} else {
  $latestRelease = Get-LatestReleaseVersion
  if ($latestRelease) {
    $releaseVersion = $latestRelease
    $sourceRef = "v$latestRelease"
    $versionKey = "v$latestRelease"
  } else {
    $SourceOnly = $true
    Write-WarnMessage "No GitHub release found for $Repo; falling back to '$DefaultBranch'."
  }
}

Ensure-NodeRuntime

$usedPrebuilt = $false
if (-not $SourceOnly) {
  $usedPrebuilt = Install-PrebuiltBundle -ReleaseVersion $releaseVersion -Target $target
  if (-not $usedPrebuilt) {
    Write-WarnMessage "No prebuilt bundle available for $target at $versionKey; building from source instead."
  }
}

if (-not $usedPrebuilt) {
  Install-FromSource -Ref $sourceRef -VersionKey $versionKey -Target $target
}

Add-ToUserPathIfNeeded

Write-Info ''
Write-Info "Installed OpenShrike into $InstallDir"
Write-Info "Launcher: $BinDir\shrike.cmd"
Write-Info "Version: $versionKey"
Write-Info 'Next step: shrike init'
