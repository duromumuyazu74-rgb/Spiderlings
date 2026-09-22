param(
    [switch]$Once,
    [int]$DebounceMilliseconds = 900
)

$ErrorActionPreference = "Stop"
$ToolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ModRoot = Split-Path -Parent $ToolRoot
$CheckScript = Join-Path $ToolRoot "check-spiderlings-mod.js"
$TestRunner = Join-Path $ToolRoot "run-spiderlings-tests.js"

function Invoke-SpiderlingsCheck {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host ""
    Write-Host "[$stamp] Running Spiderlings mod check..."
    & node $TestRunner all
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[$stamp] Spiderlings tests failed with exit code $LASTEXITCODE."
        return
    }
    & node $CheckScript
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[$stamp] Spiderlings mod check passed."
    } else {
        Write-Host "[$stamp] Spiderlings mod check failed with exit code $LASTEXITCODE."
    }
}

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required to run $CheckScript."
}

Invoke-SpiderlingsCheck
if ($Once) { exit $LASTEXITCODE }

$global:SpiderlingsModCheckPending = $false
$global:SpiderlingsModCheckLastEvent = Get-Date

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $ModRoot
$watcher.IncludeSubdirectories = $true
$watcher.Filter = "*.*"
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'

$action = {
    $path = $Event.SourceEventArgs.FullPath
    if ($path -notmatch '\.(js|json|csv|png|wav|ogg|md|ps1|py|txt)$') { return }
    if ($path -match '\\tools\\watch-spiderlings-mod\.ps1$') { return }
    $global:SpiderlingsModCheckPending = $true
    $global:SpiderlingsModCheckLastEvent = Get-Date
}

$subscriptions = @(
    Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action,
    Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action,
    Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $action,
    Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $action
)

try {
    $watcher.EnableRaisingEvents = $true
    Write-Host ""
    Write-Host "Watching $ModRoot"
    Write-Host "Press Ctrl+C to stop. Changes to runtime files, docs, and maintenance scripts will run the check."
    while ($true) {
        Start-Sleep -Milliseconds 250
        if ($global:SpiderlingsModCheckPending) {
            $elapsed = ((Get-Date) - $global:SpiderlingsModCheckLastEvent).TotalMilliseconds
            if ($elapsed -ge $DebounceMilliseconds) {
                $global:SpiderlingsModCheckPending = $false
                Invoke-SpiderlingsCheck
            }
        }
    }
} finally {
    $watcher.EnableRaisingEvents = $false
    foreach ($subscription in $subscriptions) {
        Unregister-Event -SubscriptionId $subscription.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $subscription.Id -Force -ErrorAction SilentlyContinue
    }
    $watcher.Dispose()
}
