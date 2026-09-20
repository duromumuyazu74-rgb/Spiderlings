param(
  [switch]$NoPackage,
  [switch]$RunCheck,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
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

$Python = Get-Command python -ErrorAction SilentlyContinue
if (!$Python) { throw "Python is required to build the Spiderlings Webbing atlas." }
& $Python.Source $AtlasBuilderPath
if ($LASTEXITCODE -ne 0) { throw "Spiderlings atlas build failed with exit code $LASTEXITCODE." }

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
  $SourcePath = Join-Path $ModRoot ($RelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (!(Test-Path -LiteralPath $SourcePath -PathType Leaf)) { throw "Missing runtime file: $RelativePath" }
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

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ZipPath = Join-Path $WorkspaceRoot ("Spiderlings_{0}.zip" -f $ModJson.modbuild)
if (Test-Path -LiteralPath $ZipPath) {
  if (!$Force) { throw "$ZipPath already exists. Re-run with -Force only when replacement is intentional." }
  Remove-Item -LiteralPath $ZipPath -Force
}

$Zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($RelativePath in $RuntimeFiles) {
    $SourcePath = Join-Path $ModRoot ($RelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $Zip,
      $SourcePath,
      $RelativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $Zip.Dispose()
}

Write-Host "Wrote $ZipPath with $($RuntimeFiles.Count) allowlisted entries."
