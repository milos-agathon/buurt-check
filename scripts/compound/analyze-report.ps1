<#
.SYNOPSIS
    Analyzes a prioritized report and returns the top priority item.
.PARAMETER ReportPath
    Path to the markdown report file to analyze.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ReportPath
)
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Warning "PowerShell 7+ is recommended for this script; running on $($PSVersionTable.PSVersion)."
}


$ErrorActionPreference = "Stop"

if (-not (Test-Path $ReportPath)) {
    throw "Report not found: $ReportPath"
}

$reportContent = Get-Content $ReportPath -Raw

# Extract priority items (customize this regex based on your report format)
# This assumes format like "1. **Item Name** - Description" or "- [ ] Priority: High - Item"
$priorityPattern = '(?:^|\n)(?:1\.|#1|\*\*Priority 1\*\*|Priority:\s*High)[:\s-]*\*?\*?([^\n\r]+)'

if ($reportContent -match $priorityPattern) {
    $priorityItem = $Matches[1].Trim()
    $priorityItem = $priorityItem -replace '\*+', '' -replace '^\s*[-:]\s*', ''
} else {
    # Fallback: get first list item or heading
    if ($reportContent -match '(?:^|\n)[-*]\s*\[?\s*\]?\s*([^\n\r]+)') {
        $priorityItem = $Matches[1].Trim()
    } else {
        throw "Could not extract priority item from report"
    }
}

# Generate branch name from priority item
$branchName = $priorityItem.ToLower() `
    -replace '[^a-z0-9\s-]', '' `
    -replace '\s+', '-' `
    -replace '-+', '-' `
    -replace '^-|-$', ''

$branchName = "feature/$branchName"

# Truncate if too long
if ($branchName.Length -gt 50) {
    $branchName = $branchName.Substring(0, 50) -replace '-$', ''
}

# Add date suffix for uniqueness
$dateSuffix = Get-Date -Format "MMdd"
$branchName = "$branchName-$dateSuffix"

# Output as JSON
$result = @{
    priority_item = $priorityItem
    branch_name = $branchName
    report_path = $ReportPath
} | ConvertTo-Json -Compress

Write-Output $result
