<#
.SYNOPSIS
    Reviews Claude Code threads from the last 24 hours and compounds learnings.
.DESCRIPTION
    Runs BEFORE auto-compound.ps1 to update CLAUDE.md with learnings from the day's work.
#>

[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\\buurt-check"
)
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Warning "PowerShell 7+ is recommended for this script; running on $($PSVersionTable.PSVersion)."
}


# Configuration
$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectPath "logs\\compound-review-$(Get-Date -Format 'yyyy-MM-dd').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

try {
    Write-Log "Starting daily compound review..."

    # Navigate to project directory
    Set-Location $ProjectPath
    Write-Log "Working directory: $ProjectPath"

    # Ensure we're on main and up to date
    Write-Log "Checking out main branch..."
    git checkout main
    if ($LASTEXITCODE -ne 0) { throw "Failed to checkout main branch" }

    Write-Log "Pulling latest changes..."
    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull from origin" }

    # Run Claude Code to review threads and compound learnings
    Write-Log "Running Claude Code compound review..."

    $prompt = @"
Load the compound-engineering skill. Look through and read each Claude Code thread from the last 24 hours. For any thread where we did NOT use the Compound Engineering skill to compound our learnings at the end, do so now - extract the key learnings from that thread and update the relevant CLAUDE.md files so we can learn from our work and mistakes. Commit your changes and push to main.
"@

    claude -p $prompt --dangerously-skip-permissions 2>&1 | Tee-Object -Append -FilePath $LogFile

    if ($LASTEXITCODE -ne 0) {
        Write-Log "WARNING: Claude Code exited with code $LASTEXITCODE"
    }

    Write-Log "Daily compound review completed successfully."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
