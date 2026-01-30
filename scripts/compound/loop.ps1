<#
.SYNOPSIS
    Runs Claude Code in a loop to execute tasks until complete.
.PARAMETER MaxIterations
    Maximum number of iterations before stopping.
.PARAMETER TaskFile
    Path to the tasks JSON file.
#>

[CmdletBinding()]
param(
    [int]$MaxIterations = 25,
    [string]$TaskFile = "scripts\\compound\\prd.json",
    [string]$ProjectPath = "D:\\buurt-check"
)
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Warning "PowerShell 7+ is recommended for this script; running on $($PSVersionTable.PSVersion)."
}


$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectPath "logs\\loop-$(Get-Date -Format 'yyyy-MM-dd-HHmm').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

Set-Location $ProjectPath

Write-Log "Starting execution loop (max $MaxIterations iterations)..."

for ($i = 1; $i -le $MaxIterations; $i++) {
    Write-Log "=== Iteration $i of $MaxIterations ==="

    # Check if task file exists
    $taskPath = Join-Path $ProjectPath $TaskFile
    if (-not (Test-Path $taskPath)) {
        Write-Log "Task file not found: $taskPath"
        break
    }

    # Read current tasks
    $tasks = Get-Content $taskPath -Raw | ConvertFrom-Json

    # Check if all tasks are complete
    $incompleteTasks = $tasks | Where-Object { $_.status -ne "complete" -and $_.status -ne "done" }

    if ($null -eq $incompleteTasks -or $incompleteTasks.Count -eq 0) {
        Write-Log "All tasks complete!"
        break
    }

    Write-Log "Remaining tasks: $($incompleteTasks.Count)"

    # Run Claude Code for next task
    $prompt = @"
Read the tasks in $TaskFile. Pick the next incomplete task and implement it. After implementation:
1. Run any relevant tests
2. If tests pass, mark the task as complete in $TaskFile
3. Commit your changes with a descriptive message
If tests fail, fix the issues and try again. If you cannot complete a task after reasonable effort, mark it as blocked with a note explaining why.
"@

    Write-Log "Running Claude Code..."
    claude -p $prompt --dangerously-skip-permissions 2>&1 | Tee-Object -Append -FilePath $LogFile

    # Brief pause between iterations
    Start-Sleep -Seconds 5
}

Write-Log "Execution loop finished after $i iterations."
