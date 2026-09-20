param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files
)

$ErrorActionPreference = "Stop"
foreach ($file in $Files) {
    $parseTokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path (Get-Location) $file), [ref]$parseTokens, [ref]$parseErrors
    ) | Out-Null
    if ($parseErrors.Count -gt 0) {
        throw (($parseErrors | ForEach-Object { "${file}: $($_.Message)" }) -join "`n")
    }
}
