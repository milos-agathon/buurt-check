# Register Compound Automation Tasks
# Run this script in an elevated PowerShell window (Run as Administrator).

[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\\buurt-check",
    [string]$PowerShellExe = "powershell.exe"
)

$ErrorActionPreference = "Stop"

$scriptsPath = Join-Path $ProjectPath "scripts\\compound"

function Ensure-ScheduledTask {
    param(
        [string]$TaskName,
        [Microsoft.Management.Infrastructure.CimInstance]$Action,
        [Microsoft.Management.Infrastructure.CimInstance]$Trigger,
        [Microsoft.Management.Infrastructure.CimInstance]$Settings,
        [string]$Description
    )

    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Updating existing task: $TaskName"
        Set-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings | Out-Null
        if ($Description) {
            # Update description separately (Set-ScheduledTask does not accept -Description)
            $taskObj = Get-ScheduledTask -TaskName $TaskName
            $taskObj.Description = $Description
            Set-ScheduledTask -InputObject $taskObj | Out-Null
        }
    } else {
        Write-Host "Registering task: $TaskName"
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $Description | Out-Null
    }
}

# Task 1: Prevent Sleep (5:00 PM)
$preventSleepAction = New-ScheduledTaskAction -Execute $PowerShellExe -Argument "-ExecutionPolicy Bypass -File `"$scriptsPath\\prevent-sleep.ps1`" -Hours 9" -WorkingDirectory $ProjectPath
$preventSleepTrigger = New-ScheduledTaskTrigger -Daily -At "5:00PM"
$preventSleepSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -StartWhenAvailable
Ensure-ScheduledTask -TaskName "Compound-PreventSleep" -Action $preventSleepAction -Trigger $preventSleepTrigger -Settings $preventSleepSettings -Description "Prevents sleep during nightly compound automation"

# Task 2: Daily Compound Review (10:30 PM)
$reviewAction = New-ScheduledTaskAction -Execute $PowerShellExe -Argument "-ExecutionPolicy Bypass -File `"$scriptsPath\\daily-compound-review.ps1`" -ProjectPath `"$ProjectPath`"" -WorkingDirectory $ProjectPath
$reviewTrigger = New-ScheduledTaskTrigger -Daily -At "10:30PM"
$reviewSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Ensure-ScheduledTask -TaskName "Compound-DailyReview" -Action $reviewAction -Trigger $reviewTrigger -Settings $reviewSettings -Description "Reviews Claude Code threads and updates CLAUDE.md with learnings"

# Task 3: Auto-Compound (11:00 PM)
$autoCompoundAction = New-ScheduledTaskAction -Execute $PowerShellExe -Argument "-ExecutionPolicy Bypass -File `"$scriptsPath\\auto-compound.ps1`" -ProjectPath `"$ProjectPath`"" -WorkingDirectory $ProjectPath
$autoCompoundTrigger = New-ScheduledTaskTrigger -Daily -At "11:00PM"
$autoCompoundSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)
Ensure-ScheduledTask -TaskName "Compound-AutoCompound" -Action $autoCompoundAction -Trigger $autoCompoundTrigger -Settings $autoCompoundSettings -Description "Implements top priority feature and creates PR"

Write-Host "Done. Registered/updated compound tasks." -ForegroundColor Green