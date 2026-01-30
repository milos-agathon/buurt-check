<#
.SYNOPSIS
    Shows status of the compound automation system.
#>

param(
    [string]$ProjectPath = "D:\\buurt-check"
)
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Warning "PowerShell 7+ is recommended for this script; running on $($PSVersionTable.PSVersion)."
}


Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "  Compound Automation Status Dashboard" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Check scheduled tasks
Write-Host "`n[Scheduled Tasks]" -ForegroundColor Yellow
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like "Compound-*" }
foreach ($task in $tasks) {
    $info = Get-ScheduledTaskInfo -TaskName $task.TaskName
    $status = switch ($task.State) {
        "Ready" { "OK Ready" }
        "Running" { ">> Running" }
        "Disabled" { "X Disabled" }
        default { $task.State }
    }
    Write-Host "  $($task.TaskName): $status"
    Write-Host "    Last Run: $($info.LastRunTime)" -ForegroundColor Gray
    Write-Host "    Next Run: $($info.NextRunTime)" -ForegroundColor Gray
}

# Check recent logs
Write-Host "`n[Recent Logs]" -ForegroundColor Yellow
$logsPath = Join-Path $ProjectPath "logs"
if (Test-Path $logsPath) {
    Get-ChildItem $logsPath -Filter "*.log" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 3 |
        ForEach-Object {
            $size = "{0:N1} KB" -f ($_.Length / 1KB)
            Write-Host "  $($_.Name) ($size) - Modified: $($_.LastWriteTime)"
        }
}

# Check git status
Write-Host "`n[Git Status]" -ForegroundColor Yellow
Set-Location $ProjectPath
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Write-Host "  Git not installed or not on PATH"
} elseif (-not (Test-Path (Join-Path $ProjectPath '.git'))) {
    Write-Host "  Not a git repository"
} else {
    $branch = git branch --show-current 2>$null
    $status = git status --porcelain 2>$null
    Write-Host "  Current Branch: $branch"
    Write-Host "  Uncommitted Changes: $(if ($status) { $status.Count } else { 0 })"
}

# Check for open PRs
Write-Host "`n[Open Pull Requests]" -ForegroundColor Yellow
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCmd) {
    Write-Host "  GitHub CLI (gh) not installed or not on PATH"
} else {
    $prs = gh pr list --state open --json title,url,createdAt 2>$null | ConvertFrom-Json
    if ($prs) {
        foreach ($pr in $prs) {
            Write-Host "  - $($pr.title)"
            Write-Host "    $($pr.url)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No open PRs"
    }
}

Write-Host "`n=========================================" -ForegroundColor Cyan
