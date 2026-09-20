param([string]$KitRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$KitRoot = (Resolve-Path -LiteralPath $KitRoot).Path
$Base = Join-Path $KitRoot 'Base-Mod.zip'
$Output = Join-Path $KitRoot 'Preview.zip'
$Parts = @{}
foreach ($Name in @('Band', 'Tail', 'Finished', 'Closure')) {
    $Relative = "Models/SpiderlingsSpinnerLegbinder/$Name.png"
    $File = Join-Path $KitRoot $Relative
    $Bytes = [IO.File]::ReadAllBytes($File)
    if ($Bytes.Length -lt 33 -or [BitConverter]::ToString($Bytes[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A') {
        throw "$Relative is not a PNG."
    }
    $Width = [uint32]$Bytes[16] * 16777216 + [uint32]$Bytes[17] * 65536 + [uint32]$Bytes[18] * 256 + [uint32]$Bytes[19]
    $Height = [uint32]$Bytes[20] * 16777216 + [uint32]$Bytes[21] * 65536 + [uint32]$Bytes[22] * 256 + [uint32]$Bytes[23]
    $Expected = if ($Name -eq 'Finished') { @(1024, 1536) } else { @(2172, 724) }
    if ($Width -ne $Expected[0] -or $Height -ne $Expected[1] -or $Bytes[25] -ne 6) {
        throw "$Relative must be $($Expected[0]) x $($Expected[1]) RGBA PNG; received $Width x $Height, PNG colour type $($Bytes[25])."
    }
    $Parts[$Relative] = $File
}
$Source = [IO.Compression.ZipFile]::OpenRead($Base)
try {
    foreach ($Relative in $Parts.Keys) {
        if (!$Source.GetEntry($Relative)) { throw "Base-Mod.zip is missing $Relative. Use the supplied test.10 base." }
    }
    $Stream = [IO.File]::Open($Output, [IO.FileMode]::Create)
    $Zip = New-Object IO.Compression.ZipArchive($Stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($Entry in $Source.Entries) {
            $New = $Zip.CreateEntry($Entry.FullName, [IO.Compression.CompressionLevel]::Optimal)
            $Target = $New.Open()
            $InputStream = if ($Parts.ContainsKey($Entry.FullName)) { [IO.File]::OpenRead($Parts[$Entry.FullName]) } else { $Entry.Open() }
            try { $InputStream.CopyTo($Target) } finally { $InputStream.Dispose(); $Target.Dispose() }
        }
    } finally { $Zip.Dispose(); $Stream.Dispose() }
} finally { $Source.Dispose() }
Write-Host "Created $Output"
Write-Host 'Fully reload the game. Disable other Spiderlings packages and load only Preview.zip.'
