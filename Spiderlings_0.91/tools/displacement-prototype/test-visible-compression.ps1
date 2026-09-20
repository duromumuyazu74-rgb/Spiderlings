$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$prototypeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $prototypeRoot "..\..\..")).Path
$gameRoot = Join-Path $workspaceRoot "KinkiestDungeon-5.5"
$prototypeSource = Get-Content -LiteralPath (Join-Path $prototypeRoot "SpiderlingsDisplacementPrototype.js") -Raw

$amountMatches = [regex]::Matches($prototypeSource, "amount:\s*(\d+)")
if ($amountMatches.Count -lt 1) {
    throw "Could not find the Lv1 displacement amount in the prototype source."
}

$amount = [int]$amountMatches[0].Groups[1].Value
$wideWaistRemoved = $prototypeSource -match "delete\s+model\.Layers\.Waist"

$body = [System.Drawing.Bitmap]::new((Join-Path $gameRoot "M1\Models\BodySmooth\Torso.png"))
$map = [System.Drawing.Bitmap]::new((Join-Path $gameRoot "DisplacementMaps\CorsetSquish.png"))
$waist = [System.Drawing.Bitmap]::new((Join-Path $gameRoot "M3\Models\Yukata\Waist.png"))
$band = [System.Drawing.Bitmap]::new((Join-Path $gameRoot "M3\Models\Yukata\WaistBand.png"))

try {
    $changedSamples = 0
    $visibleSamples = 0

    for ($mapY = 0; $mapY -lt $map.Height; $mapY += 4) {
        $bodyY = $mapY + 1000
        for ($x = 0; $x -lt $map.Width; $x += 4) {
            $mapPixel = $map.GetPixel($x, $mapY)
            if ($mapPixel.A -eq 0) {
                continue
            }

            $alpha = $mapPixel.A / 255.0
            $sourceX = [Math]::Max(0, [Math]::Min(
                $body.Width - 1,
                [int][Math]::Round($x + ($mapPixel.R / 255.0 - 0.5 * $alpha) * $amount)
            ))
            $sourceY = [Math]::Max(0, [Math]::Min(
                $body.Height - 1,
                [int][Math]::Round($bodyY + ($mapPixel.G / 255.0 - 0.5 * $alpha) * $amount)
            ))

            $before = $body.GetPixel($x, $bodyY).A
            $after = $body.GetPixel($sourceX, $sourceY).A
            if ([Math]::Abs($before - $after) -le 64) {
                continue
            }

            $changedSamples += 1
            $coverAlpha = $band.GetPixel($x, $bodyY).A
            if (-not $wideWaistRemoved) {
                $coverAlpha = [Math]::Max($coverAlpha, $waist.GetPixel($x, $bodyY).A)
            }
            if ($coverAlpha -lt 64) {
                $visibleSamples += 1
            }
        }
    }

    $visiblePercent = if ($changedSamples -gt 0) {
        [Math]::Round(100 * $visibleSamples / $changedSamples, 1)
    } else {
        0
    }

    Write-Output "Lv1 amount: $amount"
    Write-Output "Wide Yukata waist removed: $wideWaistRemoved"
    Write-Output "Changed silhouette samples: $changedSamples"
    Write-Output "Visible silhouette samples: $visibleSamples ($visiblePercent%)"

    if ($visiblePercent -lt 40) {
        throw "Visible compression is below 40%; the displacement is still mostly hidden by the source artwork."
    }
} finally {
    $body.Dispose()
    $map.Dispose()
    $waist.Dispose()
    $band.Dispose()
}

Write-Output "Visible compression regression passed."
