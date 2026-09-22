param(
    [Parameter(Mandatory = $true)][string]$Worktree,
    [string]$KeepRef,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
$target = Get-Item -LiteralPath (Resolve-Path -LiteralPath $Worktree).Path -Force
if (-not $target.PSIsContainer) { throw 'Target must be a directory.' }
$ancestor = $target
while ($null -ne $ancestor) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing reparse-point ancestor: $($ancestor.FullName)" }
    $ancestor = $ancestor.Parent
}
$registered = git -c core.quotePath=false -C $target.FullName worktree list --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate registered worktrees.' }
$registeredPaths = @($registered | Where-Object { $_.StartsWith('worktree ') } | ForEach-Object { [IO.Path]::GetFullPath($_.Substring(9)) })
if ($registeredPaths.Count -lt 2 -or $target.FullName -eq $registeredPaths[0] -or $target.FullName -notin $registeredPaths) {
    throw 'Refusing an unregistered or primary working directory.'
}
$pending = [Collections.Generic.Stack[IO.DirectoryInfo]]::new()
$pending.Push($target)
while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($entry in $directory.EnumerateFileSystemInfos()) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked entry: $($entry.FullName)" }
        if ($entry -is [IO.DirectoryInfo]) { $pending.Push($entry) }
    }
}
$dirty = git -C $target.FullName status --porcelain --untracked-files=all
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Refusing modified or untracked work.' }
$ignored = git -C $target.FullName ls-files --others --ignored --exclude-standard --directory
if ($LASTEXITCODE -ne 0 -or $ignored) { throw 'Refusing ignored files without a separate preservation decision.' }
if (-not $Execute) { Write-Output 'Preflight passed. Nothing was removed.'; exit 0 }
if (-not $KeepRef) { throw 'KeepRef is required to prove the commits remain reachable.' }
$retained = git -C $registeredPaths[0] rev-parse --symbolic-full-name $KeepRef
if ($LASTEXITCODE -ne 0 -or $retained -notmatch '^refs/(heads|remotes|tags)/') { throw 'KeepRef must name a retained branch or tag.' }
$head = git -C $target.FullName rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot read worktree commit.' }
git -C $registeredPaths[0] merge-base --is-ancestor $head $retained
if ($LASTEXITCODE -ne 0) { throw 'The retained reference does not contain this worktree commit.' }
# All checks above precede the only deletion. Never retry with force or a recursive fallback.
git -C $registeredPaths[0] worktree remove $target.FullName
if ($LASTEXITCODE -ne 0) { throw 'Git refused removal; no force or alternate deletion is attempted.' }
Write-Output "Removed verified worktree; commit $head remains in $retained."
