param(
  [switch]$NoPackage,
  [switch]$RunCheck,
  [switch]$Force,
  [switch]$VerifyOnly,
  [string]$PackagePath = ""
)

$ErrorActionPreference = "Stop"
if ($VerifyOnly -and ($NoPackage -or $RunCheck -or $Force)) {
  throw "-VerifyOnly cannot be combined with -NoPackage, -RunCheck, or -Force."
}
if ($PackagePath -and !$VerifyOnly) {
  throw "-PackagePath is available only with -VerifyOnly."
}

$ToolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ModRoot = (Resolve-Path (Join-Path $ToolRoot "..")).Path
$WorkspaceRoot = (Resolve-Path (Join-Path $ModRoot "..")).Path
$ModJsonPath = Join-Path $ModRoot "mod.json"
$AtlasBuilderPath = Join-Path $ToolRoot "build-spiderlings-atlas.py"
$Locales = @(
  "SpiderlingsCN.csv",
  "SpiderlingsDE.csv",
  "SpiderlingsES.csv",
  "SpiderlingsJP.csv",
  "SpiderlingsKR.csv",
  "SpiderlingsPL.csv",
  "SpiderlingsRU.csv"
)

$ModJson = Get-Content -LiteralPath $ModJsonPath -Raw | ConvertFrom-Json
if (!($ModJson.fileorder -is [array]) -or !$ModJson.fileorder.Count) {
  throw "mod.json fileorder must be a non-empty array."
}

$RuntimeFiles = @("mod.json") + @($ModJson.fileorder) + $Locales
$Seen = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($RelativePath in $RuntimeFiles) {
  if ([IO.Path]::IsPathRooted($RelativePath) -or $RelativePath.Contains("\") -or $RelativePath.Split("/").Contains("..")) {
    throw "Unsafe or non-portable release path: $RelativePath"
  }
  if (!$Seen.Add($RelativePath)) { throw "Duplicate release path: $RelativePath" }
}

$DefaultZipPath = Join-Path $WorkspaceRoot ("Spiderlings_{0}.zip" -f $ModJson.modbuild)
$ZipPath = if ($PackagePath) { [IO.Path]::GetFullPath($PackagePath) } else { $DefaultZipPath }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-StreamSha256([IO.Stream]$Stream) {
  $Sha = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($Sha.ComputeHash($Stream)).Replace("-", "").ToLowerInvariant()
  } finally {
    $Sha.Dispose()
  }
}

function Get-FileSha256([string]$Path) {
  $Stream = [IO.File]::OpenRead($Path)
  try {
    return Get-StreamSha256 $Stream
  } finally {
    $Stream.Dispose()
  }
}

function Test-ReleasePackage([string]$Path) {
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Release package is missing: $Path" }
  $Archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    if ($Archive.Entries.Count -ne $RuntimeFiles.Count) {
      throw "Release package contains $($Archive.Entries.Count) entries; expected $($RuntimeFiles.Count)."
    }
    $ArchiveNames = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($Entry in $Archive.Entries) {
      if (!$ArchiveNames.Add($Entry.FullName)) { throw "Duplicate release entry: $($Entry.FullName)" }
      if (!$Seen.Contains($Entry.FullName)) { throw "Unexpected release entry: $($Entry.FullName)" }
    }
    foreach ($RelativePath in $RuntimeFiles) {
      $Entry = $Archive.GetEntry($RelativePath)
      if (!$Entry) { throw "Missing release entry: $RelativePath" }
      $EntryStream = $Entry.Open()
      try {
        $ArchiveHash = Get-StreamSha256 $EntryStream
      } finally {
        $EntryStream.Dispose()
      }
      $SourcePath = Join-Path $ModRoot ($RelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
      if ($ArchiveHash -ne (Get-FileSha256 $SourcePath)) {
        throw "Release entry differs from source: $RelativePath"
      }
    }
  } finally {
    $Archive.Dispose()
  }
  return Get-FileSha256 $Path
}

if (!$VerifyOnly) {
  $Python = Get-Command python -ErrorAction SilentlyContinue
  if (!$Python) { throw "Python is required to build the Spiderlings Webbing atlas." }
  & $Python.Source $AtlasBuilderPath
  if ($LASTEXITCODE -ne 0) { throw "Spiderlings atlas build failed with exit code $LASTEXITCODE." }
}

foreach ($RelativePath in $RuntimeFiles) {
  $SourcePath = Join-Path $ModRoot ($RelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (!(Test-Path -LiteralPath $SourcePath -PathType Leaf)) { throw "Missing runtime file: $RelativePath" }
}

if ($VerifyOnly) {
  $PackageHash = Test-ReleasePackage $ZipPath
  Write-Host "Verified $ZipPath with $($RuntimeFiles.Count) allowlisted entries."
  Write-Host "SHA256 $PackageHash"
  exit 0
}

if ($RunCheck) {
  $Watcher = Join-Path $ToolRoot "watch-spiderlings-mod.ps1"
  & powershell -ExecutionPolicy Bypass -File $Watcher -Once
  if ($LASTEXITCODE -ne 0) { throw "Spiderlings check failed with exit code $LASTEXITCODE." }
}

if ($NoPackage) {
  Write-Host "Validated $($RuntimeFiles.Count) allowlisted release files."
  exit 0
}

if (Test-Path -LiteralPath $ZipPath) {
  if (!$Force) { throw "$ZipPath already exists. Re-run with -Force only when replacement is intentional." }
}

$TemporaryZip = Join-Path $WorkspaceRoot (".Spiderlings-package-{0}.zip" -f [guid]::NewGuid().ToString("N"))
try {
  $Zip = [IO.Compression.ZipFile]::Open($TemporaryZip, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($RelativePath in $RuntimeFiles) {
      $SourcePath = Join-Path $ModRoot ($RelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $Zip,
        $SourcePath,
        $RelativePath,
        [IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally {
    $Zip.Dispose()
  }
  $PackageHash = Test-ReleasePackage $TemporaryZip
  Move-Item -LiteralPath $TemporaryZip -Destination $ZipPath -Force
} finally {
  if (Test-Path -LiteralPath $TemporaryZip) { Remove-Item -LiteralPath $TemporaryZip -Force }
}

Write-Host "Wrote $ZipPath with $($RuntimeFiles.Count) allowlisted entries."
Write-Host "SHA256 $PackageHash"
